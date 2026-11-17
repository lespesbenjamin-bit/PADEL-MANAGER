-- =====================================================================
-- PADEL COACH HUB – Migration 002 : rôles coach / joueur, invitations, lieu
-- AJOUTS UNIQUEMENT : aucune table supprimée, aucune donnée modifiée.
-- Ré-exécutable sans risque.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1. Profils (rôle de chaque compte)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('coach','player')),
  coach_id     uuid not null references auth.users(id) on delete cascade, -- le coach de rattachement (lui-même pour un coach)
  display_name text,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or coach_id = auth.uid());
revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;   -- écriture uniquement via les fonctions ci-dessous

-- Les comptes déjà existants (le tien) deviennent « coach » : tes données restent rattachées à ton compte.
-- (uniquement les comptes qui possèdent déjà des groupes ou des joueurs ; si la base est vide,
--  le tout premier compte créé devient coach)
insert into public.profiles(id, role, coach_id)
select u.id, 'coach', u.id from auth.users u
where exists (select 1 from public.groups g where g.owner_id = u.id)
   or exists (select 1 from public.players p where p.owner_id = u.id)
   or (not exists (select 1 from public.profiles where role = 'coach')
       and u.id = (select id from auth.users order by created_at nulls last, id limit 1))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Colonnes ajoutées
-- ---------------------------------------------------------------------
alter table public.players add column if not exists user_id     uuid references auth.users(id) on delete set null;
alter table public.players add column if not exists invite_code text;
alter table public.players add column if not exists invited_at  timestamptz;
alter table public.players add column if not exists linked_at   timestamptz;
create unique index if not exists players_user_id_uniq on public.players(user_id) where user_id is not null;
create unique index if not exists players_invite_code_uniq on public.players(invite_code) where invite_code is not null;

alter table public.groups add column if not exists location text;   -- lieu / terrain

-- ---------------------------------------------------------------------
-- 3. Fonctions de rôle
-- ---------------------------------------------------------------------
create or replace function app_private.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
$$;

-- Les tables « coach » ne sont accessibles qu'à un compte coach, sur ses propres données.
-- (Un joueur connecté ne peut ni lire ni écrire directement ces tables : il passe par get_my_player_space.)
do $$
declare t text;
begin
  foreach t in array array['players','groups','group_memberships','group_cycles','sessions',
                           'session_attendances','packages','credit_transactions',
                           'session_revisions','operation_requests']
  loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all to authenticated
                    using (owner_id = auth.uid() and (select app_private.is_coach()))
                    with check (owner_id = auth.uid() and (select app_private.is_coach()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Invitations des joueurs
-- ---------------------------------------------------------------------
-- Le coach génère un code d'invitation pour un joueur (8 caractères, sans caractères ambigus)
create or replace function public.create_player_invite(p_player_id uuid)
returns text language plpgsql as $$
declare v_code text; v_try int := 0; v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  if not exists (select 1 from public.players where id = p_player_id and owner_id = auth.uid()) then
    raise exception 'Joueur introuvable' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.players where id = p_player_id and user_id is not null) then
    raise exception 'Ce joueur a déjà un compte relié';
  end if;
  loop
    v_code := (select string_agg(substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1), '')
               from generate_series(1, 8));
    exit when not exists (select 1 from public.players where invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'Impossible de générer un code'; end if;
  end loop;
  update public.players set invite_code = v_code, invited_at = now() where id = p_player_id;
  return v_code;
end $$;

-- Le joueur, une fois inscrit et connecté, utilise son code pour relier son compte à sa fiche
create or replace function public.claim_player_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p public.players%rowtype; v_role text;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role = 'coach' then raise exception 'Ce compte est un compte coach'; end if;
  if v_role = 'player' then raise exception 'Ce compte est déjà relié à une fiche joueur'; end if;

  select * into p from public.players
  where invite_code = upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'))
    and user_id is null
  for update;
  if not found then raise exception 'Code invalide ou déjà utilisé'; end if;

  update public.players set user_id = v_uid, linked_at = now(), invite_code = null where id = p.id;
  insert into public.profiles(id, role, coach_id, display_name)
  values (v_uid, 'player', p.owner_id, trim(p.first_name || ' ' || p.last_name));
  return jsonb_build_object('status','ok','player_id', p.id, 'first_name', p.first_name);
end $$;

-- Le coach retire l'accès d'un joueur (la fiche, l'historique et les crédits sont conservés)
create or replace function public.revoke_player_access(p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_old uuid;
begin
  if not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  select user_id into v_old from public.players where id = p_player_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Joueur introuvable' using errcode = 'P0002'; end if;
  update public.players set user_id = null, linked_at = null, invite_code = null where id = p_player_id;
  if v_old is not null then
    delete from public.profiles where id = v_old and role = 'player' and coach_id = auth.uid();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 5. Espace joueur (lecture limitée à SES données)
-- ---------------------------------------------------------------------
create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when pr.id is null then null else jsonb_build_object(
    'id', pr.id, 'role', pr.role, 'coach_id', pr.coach_id, 'display_name', pr.display_name,
    'player_id', (select p.id from public.players p where p.user_id = pr.id)) end
  from (select auth.uid() as uid) x
  left join public.profiles pr on pr.id = x.uid
$$;

create or replace function public.get_my_player_space()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  p public.players%rowtype;
  v_today date := app_private._today();
  v_groups uuid[];
begin
  select * into p from public.players where user_id = v_uid;
  if not found then return null; end if;

  select coalesce(array_agg(m.group_id), '{}') into v_groups
  from public.group_memberships m join public.groups g on g.id = m.group_id
  where m.player_id = p.id and m.left_on is null and g.status <> 'archived';

  return jsonb_build_object(
    'player', jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
                                 'phone', p.phone, 'email', p.email, 'level', p.level),
    'credits', jsonb_build_object(
       'balance',   coalesce((select sum(delta) from public.credit_transactions where player_id = p.id), 0),
       'consumed',  coalesce((select -sum(delta) from public.credit_transactions where player_id = p.id and kind in ('consume','refund')), 0),
       'played',    (select count(*) from public.session_attendances a join public.sessions s on s.id = a.session_id
                     where a.player_id = p.id and a.status = 'present' and s.status = 'validated')),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
         'id', g.id, 'name', g.name, 'level', g.level, 'weekday', g.weekday,
         'start_time', g.start_time, 'end_time', g.end_time, 'location', g.location, 'color', g.color,
         'status', g.status,
         'members', (select count(*) from public.group_memberships m2 where m2.group_id = g.id and m2.left_on is null))
         order by g.weekday, g.start_time)
       from public.groups g where g.id = any(v_groups)), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(x order by x->>'session_date', x->>'start_time') from (
         select jsonb_build_object('id', s.id, 'session_date', s.session_date, 'start_time', s.start_time,
                'end_time', s.end_time, 'status', s.status, 'kind', s.kind, 'rescheduled', s.rescheduled,
                'original_date', s.original_date, 'group_name', g.name, 'group_level', g.level,
                'location', g.location, 'color', g.color,
                'is_guest', exists (select 1 from public.session_attendances a where a.session_id = s.id and a.player_id = p.id and a.is_guest)) as x
         from public.sessions s join public.groups g on g.id = s.group_id
         where s.session_date >= v_today and s.status in ('planned','cancelled')
           and (s.group_id = any(v_groups)
                or exists (select 1 from public.session_attendances a where a.session_id = s.id and a.player_id = p.id))
         order by s.session_date, s.start_time limit 30) t), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(x order by x->>'session_date' desc) from (
         select jsonb_build_object('session_date', s.session_date, 'start_time', s.start_time, 'group_name', g.name,
                'color', g.color, 'status', a.status, 'consume_credit', a.consume_credit, 'is_guest', a.is_guest) as x
         from public.session_attendances a join public.sessions s on s.id = a.session_id join public.groups g on g.id = s.group_id
         where a.player_id = p.id and s.status = 'validated'
         order by s.session_date desc limit 40) t), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('label', k.label, 'total', k.total_credits,
         'purchased_on', k.purchased_on, 'expires_on', k.expires_on,
         'remaining', coalesce((select sum(t.delta) from public.credit_transactions t where t.package_id = k.id), 0))
         order by k.purchased_on desc)
       from public.packages k where k.player_id = p.id), '[]'::jsonb)
  );
end $$;

-- Le joueur peut modifier ses coordonnées (jamais ses crédits, ses séances ni les notes du coach)
create or replace function public.update_my_profile(p_first_name text, p_last_name text, p_phone text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_first_name), '') = '' then raise exception 'Le prénom est obligatoire'; end if;
  update public.players set first_name = trim(p_first_name), last_name = coalesce(trim(p_last_name), ''),
         phone = nullif(trim(p_phone), ''), email = nullif(trim(p_email), '')
  where user_id = auth.uid();
  if not found then raise exception 'Aucune fiche joueur reliée à ce compte'; end if;
  update public.profiles set display_name = trim(p_first_name || ' ' || coalesce(p_last_name, '')) where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- 6. Vues : exposer les nouvelles colonnes (recréées à l'identique + colonnes ajoutées)
-- ---------------------------------------------------------------------
-- v_player_stats et v_group_overview utilisent « * » : on les recrée pour inclure user_id / location.
create or replace view public.v_player_stats with (security_invoker = true) as
select
  pl.id, pl.owner_id, pl.first_name, pl.last_name, pl.phone, pl.email, pl.level, pl.notes,
  pl.archived_at, pl.created_at, pl.updated_at,
  coalesce((select sum(t.delta) from public.credit_transactions t where t.player_id = pl.id), 0)::int as credits_balance,
  coalesce((select -sum(t.delta) from public.credit_transactions t
             where t.player_id = pl.id and t.kind in ('consume','refund')), 0)::int as credits_consumed,
  coalesce((select sum(t.delta) from public.credit_transactions t
             where t.player_id = pl.id and t.kind in ('purchase','adjust')), 0)::int as credits_purchased,
  (select count(*) from public.session_attendances a join public.sessions s on s.id = a.session_id
     where a.player_id = pl.id and a.status = 'present' and s.status = 'validated')::int as sessions_played,
  coalesce((select array_agg(g.name order by g.name) from public.group_memberships m
             join public.groups g on g.id = m.group_id
             where m.player_id = pl.id and m.left_on is null and g.status <> 'archived'), '{}') as group_names,
  (select count(*) from public.packages p where p.player_id = pl.id)::int as packages_count,
  pl.user_id, pl.invite_code, pl.invited_at, pl.linked_at
from public.players pl;

create or replace view public.v_group_overview with (security_invoker = true) as
select
  g.id, g.owner_id, g.name, g.level, g.weekday, g.start_time, g.end_time, g.capacity, g.status, g.color,
  g.notes, g.archived_at, g.created_at, g.updated_at,
  (select count(*) from public.group_memberships m where m.group_id = g.id and m.left_on is null) as member_count,
  cs.id               as cycle_id,
  cs.cycle_number,
  cs.name             as cycle_name,
  cs.planned_sessions,
  cs.realized,
  cs.remaining,
  cs.progress,
  cs.projected_end_date,
  cs.effective_status as cycle_status,
  (select min(s.session_date) from public.sessions s
     where s.group_id = g.id and s.status = 'planned' and s.session_date >= app_private._today()) as next_session_date,
  (select count(*) from public.sessions s
     where s.group_id = g.id and s.status = 'planned' and (s.session_date < app_private._today()
       or (s.session_date = app_private._today() and s.end_time <= app_private._now_local_time()))) as pending_count,
  g.location
from public.groups g
left join lateral (
  select * from public.v_cycle_stats c
  where c.group_id = g.id and c.effective_status in ('in_progress','upcoming','completed')
  order by case c.effective_status when 'in_progress' then 0 when 'upcoming' then 1 else 2 end,
           case when c.effective_status = 'completed' then -c.cycle_number else c.cycle_number end
  limit 1
) cs on true;

create or replace view public.v_sessions_hub with (security_invoker = true) as
select v.*, g.location from public.v_sessions v join public.groups g on g.id = v.group_id;

grant select on public.v_player_stats, public.v_group_overview, public.v_sessions_hub to authenticated;
revoke all on public.v_player_stats, public.v_group_overview, public.v_sessions_hub from anon;

-- ---------------------------------------------------------------------
-- 7. Droits d'exécution
-- ---------------------------------------------------------------------
revoke execute on function app_private.is_coach() from public, anon;
grant execute on function app_private.is_coach() to authenticated;
revoke execute on function public.create_player_invite(uuid), public.claim_player_invite(text),
  public.revoke_player_access(uuid), public.my_profile(), public.get_my_player_space(),
  public.update_my_profile(text, text, text, text) from public, anon;
grant execute on function public.create_player_invite(uuid), public.claim_player_invite(text),
  public.revoke_player_access(uuid), public.my_profile(), public.get_my_player_space(),
  public.update_my_profile(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
