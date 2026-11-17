-- =====================================================================
-- PADEL COACH HUB – Migration 003 : tournois, communauté, exercices,
-- schémas tactiques, séances types, notifications, RGPD
-- AJOUTS UNIQUEMENT : aucune donnée existante n'est modifiée ou supprimée.
-- Ré-exécutable sans risque. Prérequis : migration 002.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 0. Fonctions d'appartenance (qui suis-je ?)
-- ---------------------------------------------------------------------
create or replace function app_private.my_coach_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coach_id from public.profiles where id = auth.uid()
$$;

create or replace function app_private.my_player_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.players where user_id = auth.uid()
$$;

create or replace function app_private.my_group_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.group_id), '{}') from public.group_memberships m
  join public.groups g on g.id = m.group_id
  where m.player_id = (select id from public.players where user_id = auth.uid())
    and m.left_on is null and g.status <> 'archived'
$$;

-- Les membres d'une même communauté voient les noms des uns et des autres
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or coach_id = auth.uid() or coach_id = (select app_private.my_coach_id()));

alter table public.profiles add column if not exists consent_at timestamptz;      -- acceptation charte & confidentialité
alter table public.profiles add column if not exists consent_version text;

-- ---------------------------------------------------------------------
-- 1. Notifications
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,   -- communauté (coach)
  user_id    uuid not null references auth.users(id) on delete cascade,   -- destinataire
  kind       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notif_own on public.notifications;
create policy notif_own on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notif_read on public.notifications;
create policy notif_read on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke all on public.notifications from anon;
grant select, update, delete on public.notifications to authenticated;

create or replace function app_private.notify(p_owner uuid, p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(owner_id, user_id, kind, title, body, link)
  select p_owner, p_user, p_kind, p_title, left(p_body, 200), p_link
  where p_user is not null and p_user is distinct from auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 2. Tournois (calendrier collaboratif)
-- ---------------------------------------------------------------------
create table if not exists public.tournaments (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,  -- coach
  player_id        uuid not null references public.players(id) on delete cascade,
  name             text not null,
  start_date       date not null,
  end_date         date,
  club             text,
  city             text,
  category         text not null default 'P100',
  partner_name     text,
  status           text not null default 'considered' check (status in ('considered','registered','confirmed','done','cancelled')),
  goal             text,
  coaching_request boolean not null default false,
  coaching_status  text not null default 'none' check (coaching_status in ('none','requested','accepted','declined','done')),
  coach_note       text,
  result_rank      text,
  matches_played   int check (matches_played >= 0),
  wins             int check (wins >= 0),
  losses           int check (losses >= 0),
  player_comment   text,
  photos           text[] not null default '{}',
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists tournaments_owner_date_idx on public.tournaments(owner_id, start_date);
create index if not exists tournaments_player_idx on public.tournaments(player_id);
alter table public.tournaments enable row level security;
drop policy if exists t_coach on public.tournaments;
create policy t_coach on public.tournaments for all to authenticated
  using (owner_id = auth.uid() and (select app_private.is_coach()))
  with check (owner_id = auth.uid() and (select app_private.is_coach()));
drop policy if exists t_player on public.tournaments;
create policy t_player on public.tournaments for all to authenticated
  using (player_id = (select app_private.my_player_id()))
  with check (player_id = (select app_private.my_player_id()) and owner_id = (select app_private.my_coach_id()));
revoke all on public.tournaments from anon;
grant select, insert, update, delete on public.tournaments to authenticated;

-- Un joueur ne peut pas modifier la décision ni la note du coach
create or replace function app_private._tournament_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_coach boolean := app_private.is_coach(); v_user uuid; v_name text;
begin
  new.updated_at := now();
  if not v_coach then
    if tg_op = 'INSERT' then
      new.coach_note := null;
      new.coaching_status := case when new.coaching_request then 'requested' else 'none' end;
    else
      new.coach_note := old.coach_note;
      if new.coaching_request and not old.coaching_request then new.coaching_status := 'requested';
      elsif not new.coaching_request then new.coaching_status := 'none';
      else new.coaching_status := old.coaching_status; end if;
    end if;
  end if;

  select user_id, first_name into v_user, v_name from public.players where id = new.player_id;
  -- notifications
  if not v_coach and new.coaching_status = 'requested' and (tg_op = 'INSERT' or old.coaching_status <> 'requested') then
    perform app_private.notify(new.owner_id, new.owner_id, 'coaching_request', 'Demande d''accompagnement',
      v_name || ' · ' || new.name || ' (' || to_char(new.start_date, 'DD/MM') || ')', '/tournois');
  end if;
  if not v_coach and new.result_rank is not null and (tg_op = 'INSERT' or old.result_rank is distinct from new.result_rank) then
    perform app_private.notify(new.owner_id, new.owner_id, 'tournament_result', 'Nouveau résultat',
      v_name || ' · ' || new.name || ' : ' || new.result_rank, '/tournois');
  end if;
  if v_coach and tg_op = 'UPDATE' and new.coaching_status is distinct from old.coaching_status
     and new.coaching_status in ('accepted','declined') then
    perform app_private.notify(new.owner_id, v_user, 'coaching_answer',
      case when new.coaching_status = 'accepted' then 'Accompagnement accepté' else 'Accompagnement non disponible' end,
      new.name || coalesce(' · ' || new.coach_note, ''), '/tournois');
  end if;
  return new;
end $$;
drop trigger if exists trg_tournament_guard on public.tournaments;
create trigger trg_tournament_guard before insert or update on public.tournaments
for each row execute function app_private._tournament_guard();

create or replace view public.v_tournaments with (security_invoker = true) as
select t.*, p.first_name as player_first_name, p.last_name as player_last_name, p.level as player_level
from public.tournaments t join public.players p on p.id = t.player_id;
grant select on public.v_tournaments to authenticated;
revoke all on public.v_tournaments from anon;

-- ---------------------------------------------------------------------
-- 3. Communauté : publications, commentaires, réactions, signalements
-- ---------------------------------------------------------------------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,          -- communauté (coach)
  author_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'message' check (kind in ('message','result','podium','training','announcement')),
  body        text,
  photos      text[] not null default '{}',     -- chemins dans le stockage privé « community »
  meta        jsonb not null default '{}',      -- ex. résumé du tournoi lié
  tournament_id uuid references public.tournaments(id) on delete set null,
  pinned      boolean not null default false,
  highlighted boolean not null default false,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (coalesce(length(trim(body)), 0) > 0 or cardinality(photos) > 0)
);
create index if not exists posts_feed_idx on public.posts(owner_id, created_at desc);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments(post_id, created_at);

create table if not exists public.post_reactions (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji      text not null check (emoji in ('👍','🔥','👏','💪','🎾','❤️')),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create table if not exists public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete cascade,
  comment_id  uuid references public.post_comments(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason      text,
  status      text not null default 'open' check (status in ('open','closed')),
  created_at  timestamptz not null default now()
);

alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.content_reports enable row level security;

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated
  using (owner_id = (select app_private.my_coach_id())
         and (not hidden or author_id = auth.uid() or (select app_private.is_coach())));
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and owner_id = (select app_private.my_coach_id())
              and (kind <> 'announcement' or (select app_private.is_coach())));
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (author_id = auth.uid() or (owner_id = auth.uid() and (select app_private.is_coach())))
  with check (owner_id = (select app_private.my_coach_id()));
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = auth.uid() or (owner_id = auth.uid() and (select app_private.is_coach())));

drop policy if exists comments_read on public.post_comments;
create policy comments_read on public.post_comments for select to authenticated
  using (owner_id = (select app_private.my_coach_id())
         and (not hidden or author_id = auth.uid() or (select app_private.is_coach())));
drop policy if exists comments_insert on public.post_comments;
create policy comments_insert on public.post_comments for insert to authenticated
  with check (author_id = auth.uid() and owner_id = (select app_private.my_coach_id())
              and exists (select 1 from public.posts p where p.id = post_id and not p.hidden));
drop policy if exists comments_update on public.post_comments;
create policy comments_update on public.post_comments for update to authenticated
  using (owner_id = auth.uid() and (select app_private.is_coach()))
  with check (owner_id = auth.uid());
drop policy if exists comments_delete on public.post_comments;
create policy comments_delete on public.post_comments for delete to authenticated
  using (author_id = auth.uid() or (owner_id = auth.uid() and (select app_private.is_coach())));

drop policy if exists reactions_read on public.post_reactions;
create policy reactions_read on public.post_reactions for select to authenticated
  using (owner_id = (select app_private.my_coach_id()));
drop policy if exists reactions_insert on public.post_reactions;
create policy reactions_insert on public.post_reactions for insert to authenticated
  with check (user_id = auth.uid() and owner_id = (select app_private.my_coach_id()));
drop policy if exists reactions_delete on public.post_reactions;
create policy reactions_delete on public.post_reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists reports_insert on public.content_reports;
create policy reports_insert on public.content_reports for insert to authenticated
  with check (reporter_id = auth.uid() and owner_id = (select app_private.my_coach_id()));
drop policy if exists reports_read on public.content_reports;
create policy reports_read on public.content_reports for select to authenticated
  using (reporter_id = auth.uid() or (owner_id = auth.uid() and (select app_private.is_coach())));
drop policy if exists reports_update on public.content_reports;
create policy reports_update on public.content_reports for update to authenticated
  using (owner_id = auth.uid() and (select app_private.is_coach())) with check (owner_id = auth.uid());

revoke all on public.posts, public.post_comments, public.post_reactions, public.content_reports from anon;
grant select, insert, update, delete on public.posts, public.post_comments to authenticated;
grant select, insert, delete on public.post_reactions to authenticated;
grant select, insert, update on public.content_reports to authenticated;

-- Seul le coach peut épingler, mettre en avant ou masquer
create or replace function app_private._post_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not app_private.is_coach() then
    if tg_op = 'INSERT' then
      new.pinned := false; new.highlighted := false; new.hidden := false;
    else
      new.pinned := old.pinned; new.highlighted := old.highlighted; new.hidden := old.hidden;
      new.author_id := old.author_id; new.owner_id := old.owner_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_post_guard on public.posts;
create trigger trg_post_guard before insert or update on public.posts
for each row execute function app_private._post_guard();

-- Notifications de la communauté
create or replace function app_private._community_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_post public.posts%rowtype; v_name text;
begin
  select coalesce(display_name, 'Le coach') into v_name from public.profiles where id = auth.uid();
  if tg_table_name = 'post_comments' then
    select * into v_post from public.posts where id = new.post_id;
    perform app_private.notify(new.owner_id, v_post.author_id, 'comment', v_name || ' a commenté ta publication', new.body, '/communaute');
  elsif tg_table_name = 'post_reactions' then
    select * into v_post from public.posts where id = new.post_id;
    if not exists (select 1 from public.notifications where user_id = v_post.author_id and kind = 'reaction'
                   and link = '/communaute' and read_at is null and created_at > now() - interval '1 hour') then
      perform app_private.notify(new.owner_id, v_post.author_id, 'reaction', v_name || ' a réagi ' || new.emoji || ' à ta publication', null, '/communaute');
    end if;
  elsif tg_table_name = 'posts' then
    if new.kind = 'announcement' then
      insert into public.notifications(owner_id, user_id, kind, title, body, link)
      select new.owner_id, pr.id, 'announcement', 'Nouvelle annonce du coach', left(new.body, 200), '/communaute'
      from public.profiles pr where pr.coach_id = new.owner_id and pr.role = 'player';
    end if;
  elsif tg_table_name = 'content_reports' then
    perform app_private.notify(new.owner_id, new.owner_id, 'report', 'Contenu signalé', new.reason, '/communaute?moderation=1');
  end if;
  return new;
end $$;
drop trigger if exists trg_comment_notify on public.post_comments;
create trigger trg_comment_notify after insert on public.post_comments for each row execute function app_private._community_notify();
drop trigger if exists trg_reaction_notify on public.post_reactions;
create trigger trg_reaction_notify after insert on public.post_reactions for each row execute function app_private._community_notify();
drop trigger if exists trg_post_notify on public.posts;
create trigger trg_post_notify after insert on public.posts for each row execute function app_private._community_notify();
drop trigger if exists trg_report_notify on public.content_reports;
create trigger trg_report_notify after insert on public.content_reports for each row execute function app_private._community_notify();

-- Fil d'actualité (respecte les règles de visibilité ci-dessus)
create or replace function public.get_feed(p_limit int default 20, p_before timestamptz default null, p_author uuid default null)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by (x->>'pinned')::boolean desc, x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'author_id', p.author_id, 'author_name', coalesce(pr.display_name, case when pr.role = 'coach' then 'Coach' else 'Joueur' end),
      'author_role', pr.role, 'kind', p.kind, 'body', p.body, 'photos', p.photos, 'meta', p.meta,
      'pinned', p.pinned, 'highlighted', p.highlighted, 'hidden', p.hidden, 'created_at', p.created_at,
      'reactions', (select coalesce(jsonb_object_agg(z.emoji, z.n), '{}'::jsonb)
                    from (select r.emoji, count(*) n from public.post_reactions r where r.post_id = p.id group by r.emoji) z),
      'my_reactions', (select coalesce(jsonb_agg(r.emoji), '[]'::jsonb) from public.post_reactions r where r.post_id = p.id and r.user_id = auth.uid()),
      'comments', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'author_id', c.author_id,
                      'author_name', coalesce(cp.display_name, case when cp.role = 'coach' then 'Coach' else 'Joueur' end),
                      'body', c.body, 'hidden', c.hidden, 'created_at', c.created_at) order by c.created_at), '[]'::jsonb)
                   from public.post_comments c left join public.profiles cp on cp.id = c.author_id where c.post_id = p.id)
    ) as x
    from public.posts p left join public.profiles pr on pr.id = p.author_id
    where (p_before is null or (p.created_at < p_before and not p.pinned))
      and (p_author is null or p.author_id = p_author)
    order by case when p_before is null then p.pinned else false end desc, p.created_at desc
    limit least(coalesce(p_limit, 20), 50)
  ) s
$$;

-- ---------------------------------------------------------------------
-- 4. Stockage privé des photos (bucket « community »)
--    Chemin : <id du coach>/<id de l'auteur>/<fichier>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

drop policy if exists "pch community read" on storage.objects;
create policy "pch community read" on storage.objects for select to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = (select app_private.my_coach_id())::text);
drop policy if exists "pch community upload" on storage.objects;
create policy "pch community upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'community'
              and (storage.foldername(name))[1] = (select app_private.my_coach_id())::text
              and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists "pch community delete" on storage.objects;
create policy "pch community delete" on storage.objects for delete to authenticated
  using (bucket_id = 'community'
         and ((storage.foldername(name))[2] = auth.uid()::text
              or ((storage.foldername(name))[1] = auth.uid()::text and (select app_private.is_coach()))));

-- ---------------------------------------------------------------------
-- 5. Bibliothèque pédagogique : schémas, exercices, séances types
-- ---------------------------------------------------------------------
create table if not exists public.diagrams (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null default 'Schéma sans titre',
  data       jsonb not null default '{"frames":[{"elements":[]}]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title            text not null,
  objective        text,
  category         text not null default 'technique' check (category in ('technique','tactique','physique')),
  subcategory      text,
  level            text,
  players_count    int check (players_count between 1 and 12),
  duration_min     int check (duration_min between 1 and 240),
  equipment        text,
  organisation     text,
  instructions     text,
  success_criteria text,
  variants         text,
  common_errors    text,
  corrections      text,
  diagram_id       uuid references public.diagrams(id) on delete set null,
  media_url        text,
  visibility       text not null default 'private' check (visibility in ('private','groups')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists exercises_owner_idx on public.exercises(owner_id, category);

create table if not exists public.exercise_shares (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  group_id    uuid not null references public.groups(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (exercise_id, group_id)
);

create table if not exists public.diagram_shares (
  diagram_id uuid not null references public.diagrams(id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (diagram_id, group_id)
);

create table if not exists public.session_plans (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  plan_date    date,
  group_id     uuid references public.groups(id) on delete set null,
  session_id   uuid references public.sessions(id) on delete set null,
  duration_min int,
  theme        text,
  objectives   text,
  equipment    text,
  observations text,
  next_focus   text,
  is_template  boolean not null default false,
  status       text not null default 'draft' check (status in ('draft','ready','done')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists session_plans_owner_idx on public.session_plans(owner_id, plan_date desc);

create table if not exists public.session_plan_items (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id      uuid not null references public.session_plans(id) on delete cascade,
  exercise_id  uuid references public.exercises(id) on delete set null,
  position     int not null,
  duration_min int,
  title        text,
  notes        text
);
create index if not exists session_plan_items_plan_idx on public.session_plan_items(plan_id, position);

do $$
declare t text;
begin
  foreach t in array array['diagrams','exercises','exercise_shares','diagram_shares','session_plans','session_plan_items']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all to authenticated
                    using (owner_id = auth.uid() and (select app_private.is_coach()))
                    with check (owner_id = auth.uid() and (select app_private.is_coach()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop trigger if exists trg_diagrams_touch on public.diagrams;
create trigger trg_diagrams_touch before update on public.diagrams for each row execute function app_private._touch_updated_at();
drop trigger if exists trg_exercises_touch on public.exercises;
create trigger trg_exercises_touch before update on public.exercises for each row execute function app_private._touch_updated_at();
drop trigger if exists trg_plans_touch on public.session_plans;
create trigger trg_plans_touch before update on public.session_plans for each row execute function app_private._touch_updated_at();

-- Enregistre le contenu d'une séance type (ordre des exercices) en une seule opération
create or replace function public.save_plan_items(p_plan_id uuid, p_items jsonb)
returns void language plpgsql as $$
declare r record; i int := 0;
begin
  if not exists (select 1 from public.session_plans where id = p_plan_id and owner_id = auth.uid()) then
    raise exception 'Séance introuvable' using errcode = 'P0002';
  end if;
  delete from public.session_plan_items where plan_id = p_plan_id;
  for r in select * from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
             as x(exercise_id uuid, duration_min int, title text, notes text)
  loop
    i := i + 1;
    insert into public.session_plan_items(plan_id, exercise_id, position, duration_min, title, notes)
    values (p_plan_id, r.exercise_id, i, r.duration_min, r.title, r.notes);
  end loop;
end $$;

-- Duplique une séance type (ou l'enregistre comme modèle)
create or replace function public.duplicate_plan(p_plan_id uuid, p_as_template boolean default false)
returns uuid language plpgsql as $$
declare v_new uuid; p public.session_plans%rowtype;
begin
  select * into p from public.session_plans where id = p_plan_id and owner_id = auth.uid();
  if not found then raise exception 'Séance introuvable' using errcode = 'P0002'; end if;
  insert into public.session_plans(name, plan_date, group_id, duration_min, theme, objectives, equipment, is_template, status)
  values (case when p_as_template then p.name else p.name || ' (copie)' end,
          case when p_as_template then null else p.plan_date end,
          case when p_as_template then null else p.group_id end,
          p.duration_min, p.theme, p.objectives, p.equipment, p_as_template, 'draft')
  returning id into v_new;
  insert into public.session_plan_items(plan_id, exercise_id, position, duration_min, title, notes)
  select v_new, exercise_id, position, duration_min, title, notes from public.session_plan_items where plan_id = p_plan_id;
  return v_new;
end $$;

-- Duplique un schéma tactique
create or replace function public.duplicate_diagram(p_diagram_id uuid)
returns uuid language plpgsql as $$
declare v_new uuid;
begin
  insert into public.diagrams(title, data)
  select title || ' (copie)', data from public.diagrams where id = p_diagram_id and owner_id = auth.uid()
  returning id into v_new;
  if v_new is null then raise exception 'Schéma introuvable' using errcode = 'P0002'; end if;
  return v_new;
end $$;

-- Exercices et schémas partagés avec les groupes du joueur connecté
create or replace function public.get_shared_library()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exercises', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'objective', e.objective, 'category', e.category, 'subcategory', e.subcategory,
        'level', e.level, 'players_count', e.players_count, 'duration_min', e.duration_min, 'equipment', e.equipment,
        'organisation', e.organisation, 'instructions', e.instructions, 'success_criteria', e.success_criteria,
        'variants', e.variants, 'common_errors', e.common_errors, 'corrections', e.corrections, 'media_url', e.media_url,
        'diagram', (select d.data from public.diagrams d where d.id = e.diagram_id)) order by e.title)
      from public.exercises e
      where e.visibility = 'groups'
        and exists (select 1 from public.exercise_shares s where s.exercise_id = e.id and s.group_id = any(app_private.my_group_ids()))), '[]'::jsonb),
    'diagrams', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'data', d.data) order by d.title)
      from public.diagrams d
      where exists (select 1 from public.diagram_shares s where s.diagram_id = d.id and s.group_id = any(app_private.my_group_ids()))), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- 6. Groupes : suppression définitive (uniquement sans historique)
-- ---------------------------------------------------------------------
create or replace function public.delete_group(p_group_id uuid)
returns void language plpgsql as $$
begin
  if not exists (select 1 from public.groups where id = p_group_id and owner_id = auth.uid()) then
    raise exception 'Groupe introuvable' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.sessions where group_id = p_group_id and status = 'validated') then
    raise exception 'Ce groupe a des séances validées : archive-le pour conserver l''historique';
  end if;
  delete from public.groups where id = p_group_id;
end $$;

-- ---------------------------------------------------------------------
-- 7. Espace joueur : ajoute le thème de séance prévu par le coach
-- ---------------------------------------------------------------------
create or replace function public.get_my_upcoming_themes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(sp.session_id, jsonb_build_object('theme', sp.theme, 'objectives', sp.objectives)), '{}'::jsonb)
  from public.session_plans sp
  join public.sessions s on s.id = sp.session_id
  where sp.status in ('ready','done') and sp.theme is not null
    and s.group_id = any(app_private.my_group_ids())
    and s.session_date >= app_private._today() - 60
$$;

-- ---------------------------------------------------------------------
-- 8. RGPD : consentement, export, suppression
-- ---------------------------------------------------------------------
create or replace function public.accept_terms(p_version text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set consent_at = now(), consent_version = p_version where id = auth.uid()
$$;

create or replace function public.set_display_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' then raise exception 'Nom obligatoire'; end if;
  update public.profiles set display_name = trim(p_name) where id = auth.uid();
end $$;

-- Export de toutes les données personnelles du joueur connecté
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_pid uuid;
begin
  select id into v_pid from public.players where user_id = v_uid;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select to_jsonb(pr) from public.profiles pr where pr.id = v_uid),
    'player', (select to_jsonb(p) - 'notes' - 'invite_code' from public.players p where p.id = v_pid),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('group', g.name, 'joined_on', m.joined_on, 'left_on', m.left_on)), '[]'::jsonb)
               from public.group_memberships m join public.groups g on g.id = m.group_id where m.player_id = v_pid),
    'attendances', (select coalesce(jsonb_agg(jsonb_build_object('date', s.session_date, 'group', g.name, 'status', a.status, 'credit', a.consume_credit)), '[]'::jsonb)
               from public.session_attendances a join public.sessions s on s.id = a.session_id join public.groups g on g.id = s.group_id where a.player_id = v_pid),
    'credits', (select coalesce(jsonb_agg(jsonb_build_object('date', t.created_at, 'kind', t.kind, 'delta', t.delta, 'note', t.note)), '[]'::jsonb)
               from public.credit_transactions t where t.player_id = v_pid),
    'tournaments', (select coalesce(jsonb_agg(to_jsonb(t) - 'coach_note'), '[]'::jsonb) from public.tournaments t where t.player_id = v_pid),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('date', p.created_at, 'kind', p.kind, 'body', p.body, 'photos', p.photos)), '[]'::jsonb)
               from public.posts p where p.author_id = v_uid),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object('date', c.created_at, 'body', c.body)), '[]'::jsonb)
               from public.post_comments c where c.author_id = v_uid)
  );
end $$;

-- Suppression des contenus du joueur et détachement de son compte.
-- (Les séances et crédits restent chez le coach : obligations comptables / intérêt légitime.)
create or replace function public.delete_my_account_data()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_role text; v_pid uuid; v_coach uuid;
begin
  select role, coach_id into v_role, v_coach from public.profiles where id = v_uid;
  if v_role is distinct from 'player' then raise exception 'Réservé aux comptes joueurs'; end if;
  select id into v_pid from public.players where user_id = v_uid;
  delete from public.post_reactions where user_id = v_uid;
  delete from public.post_comments where author_id = v_uid;
  delete from public.posts where author_id = v_uid;
  delete from public.notifications where user_id = v_uid;
  delete from public.tournaments where player_id = v_pid;
  update public.players set user_id = null, linked_at = null where id = v_pid;
  delete from public.profiles where id = v_uid;
  perform app_private.notify(v_coach, v_coach, 'account_deleted', 'Un joueur a supprimé ses données',
    'Supprime aussi son compte de connexion dans Supabase > Authentication > Users.', '/joueurs');
end $$;

-- ---------------------------------------------------------------------
-- 9. Droits d'exécution
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'app_private' and p.proname in ('my_coach_id','my_player_id','my_group_ids','notify'))
              or (n.nspname = 'public' and p.proname in ('get_feed','save_plan_items','duplicate_plan','duplicate_diagram',
                  'get_shared_library','delete_group','get_my_upcoming_themes','accept_terms','set_display_name',
                  'export_my_data','delete_my_account_data'))
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
