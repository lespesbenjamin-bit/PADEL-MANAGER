-- =====================================================================
-- PADEL COACH HUB – Migration 008 : PADEL LEGENDS (gamification)
-- XP, niveaux & mascottes, badges, séries, tournois, saisons, classements.
-- AJOUTS UNIQUEMENT : aucune donnée existante n'est modifiée ou supprimée
-- (crédits, séances, présences et tournois restent tels quels).
-- Ré-exécutable sans risque.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

-- ---------------------------------------------------------------------
-- 1. Compléments sur les tables existantes (colonnes ajoutées)
-- ---------------------------------------------------------------------
alter table public.groups add column if not exists session_type text not null default 'collective';
do $$ begin
  alter table public.groups add constraint groups_session_type_chk check (session_type in ('collective','individual'));
exception when duplicate_object then null; end $$;

-- Résultat de tournoi validé par le coach (base des XP ; le joueur ne peut pas y toucher)
alter table public.tournaments add column if not exists xp_result       text;
alter table public.tournaments add column if not exists xp_category     text;
alter table public.tournaments add column if not exists xp_validated_at timestamptz;
alter table public.tournaments add column if not exists xp_validated_by uuid;

-- ---------------------------------------------------------------------
-- 2. Référentiels : niveaux / mascottes et catalogue de badges
-- ---------------------------------------------------------------------
create table if not exists public.mascot_levels (
  level        int primary key,
  status       text not null,
  mascot       text not null,
  slug         text not null unique,
  xp_required  int  not null unique,
  rarity       text not null check (rarity in ('commun','peu_commun','rare','epique','legendaire','mythique')),
  emoji        text not null,
  description  text not null,
  image_url    text            -- illustration définitive (vide = image provisoire)
);
alter table public.mascot_levels enable row level security;
drop policy if exists read_all on public.mascot_levels;
create policy read_all on public.mascot_levels for select to authenticated using (true);
revoke all on public.mascot_levels from anon;
grant select on public.mascot_levels to authenticated;

insert into public.mascot_levels(level, status, mascot, slug, xp_required, rarity, emoji, description) values
 (1,'Novice','Raton laveur','raton-laveur',0,'commun','🦝','Curieux et malin, il découvre le terrain et ramasse toutes les balles.'),
 (2,'Recrue','Loutre','loutre',40,'commun','🦦','Joueuse et agile, elle prend goût à l''entraînement régulier.'),
 (3,'Apprenti','Renard','renard',90,'commun','🦊','Rusé, il commence à lire le jeu adverse.'),
 (4,'Aspirant','Ouistiti','ouistiti',150,'commun','🐒','Vif et réactif, il ne lâche aucune balle au filet.'),
 (5,'Combattant','Blaireau','blaireau',220,'peu_commun','🦡','Tenace, il défend chaque point depuis le fond.'),
 (6,'Challenger','Lynx','lynx',300,'peu_commun','🐆','Regard perçant : il anticipe les trajectoires.'),
 (7,'Duelliste','Faucon','faucon',390,'peu_commun','🦅','Rapide et précis, il fond sur les balles hautes.'),
 (8,'Gladiateur','Sanglier','sanglier',490,'peu_commun','🐗','Puissant, il impose son physique dans l''échange.'),
 (9,'Sentinelle','Loup','loup',600,'rare','🐺','Joueur d''équipe, il couvre son partenaire en permanence.'),
 (10,'Chevalier','Cerf','cerf',730,'rare','🦌','Élégant et constant, il porte haut les valeurs du club.'),
 (11,'Vétéran','Taureau','taureau',880,'rare','🐂','Expérimenté, il ne se laisse jamais déborder.'),
 (12,'Commandant','Panda','panda',1050,'rare','🐼','Calme et stratège, il dirige le jeu de la paire.'),
 (13,'Champion','Requin','requin',1240,'epique','🦈','Il sent l''ouverture et attaque sans hésiter.'),
 (14,'Maître d''armes','Tigre','tigre',1450,'epique','🐯','Technique parfaite, coups variés et redoutables.'),
 (15,'Grand Maître','Dragon','dragon',1680,'epique','🐉','Sa bandeja crache le feu : le terrain lui appartient.'),
 (16,'Titan','Gorille','gorille',1930,'epique','🦍','Force tranquille, smash par 3 imparable.'),
 (17,'Mythique','Phénix','phenix',2190,'legendaire','🔥','Il renaît dans chaque match et retourne les situations perdues.'),
 (18,'Légendaire','Lion','lion',2450,'legendaire','🦁','Roi du court, respecté par tous les joueurs.'),
 (19,'Immortel','Griffon','griffon',2720,'legendaire','🪽','Mi-aigle mi-lion : il domine le ciel et le sol.'),
 (20,'Divinité du Padel','Oracle','oracle',3000,'mythique','🔮','Il voit le point avant qu''il ne soit joué. Le sommet de Padel Legends.')
on conflict (level) do update set status = excluded.status, mascot = excluded.mascot, slug = excluded.slug,
  xp_required = excluded.xp_required, rarity = excluded.rarity, emoji = excluded.emoji, description = excluded.description;

create table if not exists public.badges (
  code            text primary key,
  name            text not null,
  description     text not null,
  category        text not null check (category in ('fidelite','regularite','competition')),
  icon            text not null,
  condition_type  text not null check (condition_type in ('sessions','active_months','streak','tournaments','finals','wins')),
  threshold       int  not null,
  sort            int  not null default 0
);
alter table public.badges enable row level security;
drop policy if exists read_all on public.badges;
create policy read_all on public.badges for select to authenticated using (true);
revoke all on public.badges from anon;
grant select on public.badges to authenticated;

insert into public.badges(code, name, description, category, icon, condition_type, threshold, sort) values
 ('premier_pas','Premier Pas','Première séance effectuée','fidelite','👟','sessions',1,10),
 ('regulier','Régulier','10 séances effectuées','fidelite','📅','sessions',10,11),
 ('infatigable','Infatigable','30 séances effectuées','fidelite','💪','sessions',30,12),
 ('marathonien','Marathonien','100 séances effectuées','fidelite','🏃','sessions',100,13),
 ('membre_historique','Membre Historique','12 mois de coaching actif (au moins une séance dans 12 mois différents)','fidelite','🏛️','active_months',12,14),
 ('metronome','Métronome','4 semaines consécutives d''entraînement','regularite','⏱️','streak',4,20),
 ('endurant','Endurant','8 semaines consécutives','regularite','🔋','streak',8,21),
 ('inarretable','Inarrêtable','12 semaines consécutives','regularite','🚀','streak',12,22),
 ('machine','Machine','24 semaines consécutives','regularite','⚙️','streak',24,23),
 ('premiere_competition','Première Compétition','Premier tournoi validé','competition','🎟️','tournaments',1,30),
 ('competiteur','Compétiteur','5 tournois validés','competition','🎾','tournaments',5,31),
 ('veteran_tournois','Vétéran des Tournois','20 tournois validés','competition','🎖️','tournaments',20,32),
 ('finaliste','Finaliste','Première finale','competition','🥈','finals',1,33),
 ('champion','Champion','Première victoire en tournoi','competition','🏆','wins',1,34),
 ('collectionneur','Collectionneur','5 victoires en tournoi','competition','👑','wins',5,35)
on conflict (code) do update set name = excluded.name, description = excluded.description, category = excluded.category,
  icon = excluded.icon, condition_type = excluded.condition_type, threshold = excluded.threshold, sort = excluded.sort;

-- ---------------------------------------------------------------------
-- 3. Réglages du coach, règles XP, semaines neutres
-- ---------------------------------------------------------------------
create table if not exists public.gamification_settings (
  owner_id                   uuid primary key references auth.users(id) on delete cascade,
  enabled                    boolean not null default true,
  auto_neutral_weeks         boolean not null default true,   -- semaine sans séance pour le joueur (vacances, annulation, pause) = neutre
  excused_preserves_streak   boolean not null default false,  -- absence excusée = semaine neutre
  category_tiers             jsonb not null default '{"P25":"t1","P50":"t1","P100":"t1","P250":"t2","P500":"t2","P1000":"t3","P1500":"t3","P2000":"t3"}',
  disabled_badges            text[] not null default '{}',
  manual_max_xp              int not null default 200 check (manual_max_xp between 1 and 1000),
  updated_at                 timestamptz not null default now()
);

create table if not exists public.xp_rules (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  code       text not null,
  label      text not null,
  category   text not null check (category in ('session','streak','milestone','tournament')),
  xp         int  not null check (xp between 0 and 1000),
  threshold  int,
  enabled    boolean not null default true,
  sort       int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_id, code)
);

create table if not exists public.neutral_weeks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 1),
  reason      text,
  created_at  timestamptz not null default now(),
  unique (owner_id, week_start)
);

-- ---------------------------------------------------------------------
-- 4. Grand livre des XP (immuable), profils, badges, saisons, journal
-- ---------------------------------------------------------------------
create table if not exists public.xp_transactions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  player_id    uuid not null references public.players(id) on delete cascade,
  source       text not null check (source in ('session','streak','milestone','tournament','bonus','correction')),
  source_key   text not null,       -- ex. session:<id>, streak:2026-09-07:4, milestone:25, tournament:<id>, manual:<id>
  basis        text,                -- base de calcul (type de séance, palier/résultat) pour détecter un changement
  xp           int  not null,
  label        text not null,
  reason       text,                -- motif (correction, bonus)
  is_adjustment boolean not null default false,
  occurred_on  date not null,
  created_by   uuid,
  op_id        uuid,
  created_at   timestamptz not null default now()
);
create index if not exists xp_tx_player_idx on public.xp_transactions(player_id, source_key);
create index if not exists xp_tx_owner_date_idx on public.xp_transactions(owner_id, occurred_on);
create unique index if not exists xp_tx_op_uniq on public.xp_transactions(op_id) where op_id is not null;

create table if not exists public.player_gamification_profiles (
  player_id          uuid primary key references public.players(id) on delete cascade,
  owner_id           uuid not null references auth.users(id) on delete cascade,
  total_xp           int not null default 0,
  level              int not null default 1,
  prestige           int not null default 0,
  current_streak     int not null default 0,
  best_streak        int not null default 0,
  sessions_count     int not null default 0,
  active_months      int not null default 0,
  tournaments_count  int not null default 0,
  finals_count       int not null default 0,
  wins_count         int not null default 0,
  last_xp_at         timestamptz,
  hide_from_ranking  boolean not null default false,
  synced_on          date,
  updated_at         timestamptz not null default now()
);

create table if not exists public.player_badges (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  badge_code  text not null references public.badges(code),
  earned_at   timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (player_id, badge_code)
);

create table if not exists public.seasons (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  starts_on    date not null,
  ends_on      date not null,
  status       text not null default 'active' check (status in ('active','archived')),
  archived_at  timestamptz,
  unique (owner_id, starts_on)
);

create table if not exists public.season_scores (
  season_id   uuid not null references public.seasons(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  xp          int not null,
  rank        int not null,
  level       int not null,
  primary key (season_id, player_id)
);

create table if not exists public.gamification_audit (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  player_id   uuid references public.players(id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}',
  reason      text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists gami_audit_owner_idx on public.gamification_audit(owner_id, created_at desc);

-- Le grand livre ne se modifie jamais : on écrit des lignes correctives
create or replace function app_private._xp_immutable() returns trigger language plpgsql as $$
begin raise exception 'Historique XP non modifiable : utiliser une écriture corrective'; end $$;
drop trigger if exists trg_xp_immutable on public.xp_transactions;
create trigger trg_xp_immutable before update on public.xp_transactions for each row execute function app_private._xp_immutable();

-- RLS : lecture coach (ses données) et joueur (les siennes) ; écriture uniquement via les fonctions serveur
do $$ declare t text; begin
  foreach t in array array['gamification_settings','xp_rules','neutral_weeks','xp_transactions','player_gamification_profiles',
                           'player_badges','seasons','season_scores','gamification_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists coach_read on public.%I', t);
    execute format('create policy coach_read on public.%I for select to authenticated using (owner_id = auth.uid() and (select app_private.is_coach()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
drop policy if exists player_read on public.xp_transactions;
create policy player_read on public.xp_transactions for select to authenticated using (player_id = (select app_private.my_player_id()));
drop policy if exists player_read on public.player_gamification_profiles;
create policy player_read on public.player_gamification_profiles for select to authenticated using (player_id = (select app_private.my_player_id()));
drop policy if exists player_read on public.player_badges;
create policy player_read on public.player_badges for select to authenticated using (player_id = (select app_private.my_player_id()));

-- Le joueur ne peut pas toucher à la validation XP d'un tournoi
create or replace function app_private._tournament_xp_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not app_private.is_coach() then
    if tg_op = 'INSERT' then
      new.xp_result := null; new.xp_category := null; new.xp_validated_at := null; new.xp_validated_by := null;
    else
      new.xp_result := old.xp_result; new.xp_category := old.xp_category;
      new.xp_validated_at := old.xp_validated_at; new.xp_validated_by := old.xp_validated_by;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_tournament_xp_guard on public.tournaments;
create trigger trg_tournament_xp_guard before insert or update on public.tournaments
for each row execute function app_private._tournament_xp_guard();

-- ---------------------------------------------------------------------
-- 5. Mise en place (réglages + règles par défaut) et saisons
-- ---------------------------------------------------------------------
create or replace function app_private.gami_ensure(p_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.gamification_settings(owner_id) values (p_owner) on conflict do nothing;
  insert into public.xp_rules(owner_id, code, label, category, xp, threshold, sort) values
    (p_owner,'session_collective','Séance collective réalisée','session',20,null,1),
    (p_owner,'session_individual','Séance individuelle réalisée','session',25,null,2),
    (p_owner,'streak_4','4 semaines consécutives','streak',40,4,10),
    (p_owner,'streak_8','8 semaines consécutives','streak',60,8,11),
    (p_owner,'streak_12','12 semaines consécutives','streak',80,12,12),
    (p_owner,'milestone_25','25 séances cumulées','milestone',100,25,20),
    (p_owner,'milestone_50','50 séances cumulées','milestone',150,50,21),
    (p_owner,'milestone_100','100 séances cumulées','milestone',250,100,22),
    (p_owner,'t1_participation','P25–P100 · Participation','tournament',10,null,30),
    (p_owner,'t1_quarter','P25–P100 · Quart de finale','tournament',20,null,31),
    (p_owner,'t1_semi','P25–P100 · Demi-finale','tournament',35,null,32),
    (p_owner,'t1_final','P25–P100 · Finaliste','tournament',50,null,33),
    (p_owner,'t1_winner','P25–P100 · Vainqueur','tournament',75,null,34),
    (p_owner,'t2_participation','P250–P500 · Participation','tournament',15,null,40),
    (p_owner,'t2_quarter','P250–P500 · Quart de finale','tournament',30,null,41),
    (p_owner,'t2_semi','P250–P500 · Demi-finale','tournament',50,null,42),
    (p_owner,'t2_final','P250–P500 · Finaliste','tournament',75,null,43),
    (p_owner,'t2_winner','P250–P500 · Vainqueur','tournament',110,null,44),
    (p_owner,'t3_participation','P1000 et + · Participation','tournament',20,null,50),
    (p_owner,'t3_quarter','P1000 et + · Quart de finale','tournament',40,null,51),
    (p_owner,'t3_semi','P1000 et + · Demi-finale','tournament',70,null,52),
    (p_owner,'t3_final','P1000 et + · Finaliste','tournament',100,null,53),
    (p_owner,'t3_winner','P1000 et + · Vainqueur','tournament',150,null,54)
  on conflict do nothing;
end $$;

-- Saison = trimestre civil
create or replace function app_private.gami_season_name(p_start date) returns text language sql immutable as $$
  select (case extract(month from p_start)::int when 1 then 'Saison Hiver ' when 4 then 'Saison Printemps '
          when 7 then 'Saison Été ' else 'Saison Automne ' end) || extract(year from p_start)::int
$$;

-- Crée la saison en cours et archive les saisons terminées (classement figé)
create or replace function app_private.gami_ensure_season(p_owner uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_start date := date_trunc('quarter', app_private._today())::date; v_id uuid; s record;
begin
  for s in select * from public.seasons where owner_id = p_owner and status = 'active' and ends_on < v_start for update loop
    insert into public.season_scores(season_id, player_id, owner_id, xp, rank, level)
    select s.id, x.player_id, p_owner, x.xp, rank() over (order by x.xp desc), coalesce(pr.level, 1)
    from (select player_id, sum(xp)::int xp from public.xp_transactions
          where owner_id = p_owner and occurred_on between s.starts_on and s.ends_on group by player_id having sum(xp) > 0) x
    left join public.player_gamification_profiles pr on pr.player_id = x.player_id
    on conflict do nothing;
    update public.seasons set status = 'archived', archived_at = now() where id = s.id;
    insert into public.gamification_audit(owner_id, action, details, created_by)
    values (p_owner, 'season_archived', jsonb_build_object('season', s.name), null);
  end loop;
  insert into public.seasons(owner_id, name, starts_on, ends_on)
  values (p_owner, app_private.gami_season_name(v_start), v_start, (v_start + interval '3 months')::date - 1)
  on conflict (owner_id, starts_on) do nothing;
  select id into v_id from public.seasons where owner_id = p_owner and starts_on = v_start;
  return v_id;
end $$;

create or replace function app_private.gami_tier(p_owner uuid, p_category text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text; n int;
begin
  select category_tiers ->> upper(trim(p_category)) into v from public.gamification_settings where owner_id = p_owner;
  if v in ('t1','t2','t3') then return v; end if;
  n := nullif(regexp_replace(coalesce(p_category,''), '\D', '', 'g'), '')::int;
  return case when n is null or n <= 100 then 't1' when n <= 500 then 't2' else 't3' end;
end $$;

create or replace function app_private.gami_bucket(p_result text) returns text language sql immutable as $$
  select case
    when p_result ilike 'vainqueur%' then 'winner'
    when p_result ilike 'finaliste%' then 'final'
    when p_result ilike '1/2%' or p_result ilike 'demi%' then 'semi'
    when p_result ilike '1/4%' or p_result ilike 'quart%' then 'quarter'
    else 'participation' end
$$;

-- ---------------------------------------------------------------------
-- 6. MOTEUR : recalcule ce que le joueur doit avoir et écrit les écarts
--    (idempotent : relancé 2 fois, il n'écrit rien la 2e fois)
-- ---------------------------------------------------------------------
create or replace function app_private.gami_sync_player(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pl record; st public.gamification_settings; r record; e record;
  v_today date := app_private._today();
  v_cur_week date := date_trunc('week', app_private._today())::date;
  k text[] := '{}'; b text[] := '{}'; a int[] := '{}'; l text[] := '{}'; d date[] := '{}'; src text[] := '{}';
  v_sessions int; v_months int; v_first date; w date;
  v_count int := 0; v_best int := 0; v_series date; v_active bool; v_neutral bool;
  v_tourn int := 0; v_finals int := 0; v_wins int := 0;
  v_total int; v_level int; v_prest int; v_old record; v_existed bool; v_lvl record; v_amount int; v_tier text; v_bucket text;
begin
  select p.id, p.owner_id, p.user_id, p.first_name into pl from public.players p where p.id = p_player;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtext('gami:' || p_player::text));
  perform app_private.gami_ensure(pl.owner_id);
  select * into st from public.gamification_settings where owner_id = pl.owner_id;
  select * into v_old from public.player_gamification_profiles where player_id = p_player;
  v_existed := found;

  -- 6.1 Séances effectuées : validées par le coach ET joueur présent
  for r in
    select s.id, s.session_date, g.name gname, g.session_type
    from public.session_attendances sa
    join public.sessions s on s.id = sa.session_id
    join public.groups g on g.id = s.group_id
    where sa.player_id = p_player and sa.status = 'present' and s.status = 'validated' and s.validated_at is not null
    order by s.session_date
  loop
    select xp, enabled into e from public.xp_rules where owner_id = pl.owner_id
      and code = case when r.session_type = 'individual' then 'session_individual' else 'session_collective' end;
    k := k || ('session:' || r.id); b := b || r.session_type::text;
    a := a || case when e.enabled then e.xp else null end;
    l := l || ((case when r.session_type = 'individual' then 'Séance individuelle · ' else 'Séance collective · ' end) || r.gname);
    d := d || r.session_date; src := src || 'session'::text;
  end loop;

  select count(*), count(distinct date_trunc('month', s.session_date)), min(s.session_date)
    into v_sessions, v_months, v_first
  from public.session_attendances sa join public.sessions s on s.id = sa.session_id
  where sa.player_id = p_player and sa.status = 'present' and s.status = 'validated';

  -- 6.2 Paliers de séances cumulées
  for e in select * from public.xp_rules where owner_id = pl.owner_id and category = 'milestone' and threshold is not null order by threshold loop
    if v_sessions >= e.threshold then
      k := k || ('milestone:' || e.threshold); b := b || 'milestone'::text; a := a || case when e.enabled then e.xp else null end;
      l := l || (e.threshold || ' séances cumulées'); src := src || 'milestone'::text;
      d := d || coalesce((select s.session_date from public.session_attendances sa join public.sessions s on s.id = sa.session_id
              where sa.player_id = p_player and sa.status = 'present' and s.status = 'validated'
              order by s.session_date, s.start_time offset e.threshold - 1 limit 1), v_today);
    end if;
  end loop;

  -- 6.3 Séries de semaines consécutives (lundi → dimanche)
  if v_first is not null then
    w := date_trunc('week', v_first)::date;
    while w <= v_cur_week loop
      v_active := exists (select 1 from public.session_attendances sa join public.sessions s on s.id = sa.session_id
        where sa.player_id = p_player and sa.status = 'present' and s.status = 'validated' and s.session_date between w and w + 6);
      if v_active then
        if v_count = 0 then v_series := w; end if;
        v_count := v_count + 1;
        v_best := greatest(v_best, v_count);
        for e in select * from public.xp_rules where owner_id = pl.owner_id and category = 'streak' and threshold = v_count loop
          k := k || ('streak:' || v_series || ':' || e.threshold); b := b || 'streak'::text;
          a := a || case when e.enabled then e.xp else null end;
          l := l || (e.threshold || ' semaines consécutives'); d := d || (w + 6); src := src || 'streak'::text;
        end loop;
      else
        v_neutral := w = v_cur_week   -- semaine en cours : pas encore terminée
          or exists (select 1 from public.neutral_weeks nw where nw.owner_id = pl.owner_id and nw.week_start = w)
          or (st.excused_preserves_streak and exists (select 1 from public.session_attendances sa join public.sessions s on s.id = sa.session_id
                where sa.player_id = p_player and sa.status = 'excused' and s.status = 'validated' and s.session_date between w and w + 6))
          or (st.auto_neutral_weeks
              and exists (select 1 from public.group_memberships gm where gm.player_id = p_player
                          and gm.joined_on <= w + 6 and (gm.left_on is null or gm.left_on >= w))
              and not exists (select 1 from public.sessions s where s.status = 'validated' and s.session_date between w and w + 6
                    and (exists (select 1 from public.session_attendances sa where sa.session_id = s.id and sa.player_id = p_player)
                         or exists (select 1 from public.group_memberships gm where gm.group_id = s.group_id and gm.player_id = p_player
                                    and gm.joined_on <= s.session_date and (gm.left_on is null or gm.left_on >= s.session_date)))));
        if not v_neutral then v_count := 0; v_series := null; end if;
      end if;
      w := w + 7;
    end loop;
  end if;

  -- 6.4 Tournois dont le résultat est validé par le coach (un seul résultat récompensé par tournoi)
  for r in select * from public.tournaments t where t.player_id = p_player and t.status <> 'cancelled'
           and t.xp_validated_at is not null and t.xp_result is not null order by t.start_date loop
    v_tier := app_private.gami_tier(pl.owner_id, coalesce(r.xp_category, r.category));
    v_bucket := app_private.gami_bucket(r.xp_result);
    v_tourn := v_tourn + 1;
    if v_bucket in ('final','winner') then v_finals := v_finals + 1; end if;
    if v_bucket = 'winner' then v_wins := v_wins + 1; end if;
    select xp, enabled into e from public.xp_rules where owner_id = pl.owner_id and code = v_tier || '_' || v_bucket;
    k := k || ('tournament:' || r.id); b := b || (v_tier || ':' || v_bucket);
    a := a || case when e.enabled then e.xp else null end;
    l := l || ('Tournoi ' || r.name || ' (' || coalesce(r.xp_category, r.category) || ') · ' || r.xp_result);
    d := d || coalesce(r.end_date, r.start_date); src := src || 'tournament'::text;
  end loop;

  -- 6.5 Comparaison avec le grand livre et écritures (nouvelles, ajustées ou annulées)
  for r in
    with exp as (select * from unnest(k, b, a, l, d, src) as x(key, basis, amount, label, day, source)),
    cur as (
      select source_key, sum(xp)::int net, (array_agg(basis order by created_at desc, id))[1] last_basis,
             (array_agg(occurred_on order by created_at, id))[1] first_day, (array_agg(label order by created_at, id))[1] first_label,
             (array_agg(source order by created_at, id))[1] first_source
      from public.xp_transactions where player_id = p_player and source in ('session','streak','milestone','tournament')
      group by source_key)
    select coalesce(exp.key, cur.source_key) key, exp.basis, exp.amount, exp.label, exp.day, coalesce(exp.source, cur.first_source) source,
           coalesce(cur.net, 0) net, cur.last_basis, cur.first_day, cur.first_label, exp.key is not null expected
    from exp full join cur on cur.source_key = exp.key
  loop
    if r.expected then
      if r.net = 0 then
        if coalesce(r.amount, 0) <> 0 then
          insert into public.xp_transactions(owner_id, player_id, source, source_key, basis, xp, label, occurred_on)
          values (pl.owner_id, p_player, r.source, r.key, r.basis, r.amount, r.label, r.day);
        end if;
      elsif r.last_basis is distinct from r.basis and r.amount is not null and r.amount <> r.net then
        insert into public.xp_transactions(owner_id, player_id, source, source_key, basis, xp, label, reason, is_adjustment, occurred_on)
        values (pl.owner_id, p_player, r.source, r.key, r.basis, r.amount - r.net, 'Ajustement · ' || r.label,
                'Résultat ou type de séance modifié', true, r.day);
      end if;
    elsif r.net <> 0 then
      insert into public.xp_transactions(owner_id, player_id, source, source_key, basis, xp, label, reason, is_adjustment, occurred_on)
      values (pl.owner_id, p_player, r.source, r.key, 'reversed', -r.net, 'Annulation · ' || r.first_label,
              'Donnée corrigée (présence, validation, annulation ou résultat)', true, coalesce(r.first_day, v_today));
    end if;
  end loop;

  -- 6.6 Totaux, niveau, prestige
  select coalesce(sum(xp), 0)::int into v_total from public.xp_transactions where player_id = p_player;
  v_total := greatest(v_total, 0);
  select max(level) into v_level from public.mascot_levels where xp_required <= v_total;
  v_prest := case when v_total >= 3000 then least(5, greatest(0, (v_total - 3000) / 500)) else 0 end;

  insert into public.player_gamification_profiles as pg(player_id, owner_id, total_xp, level, prestige, current_streak, best_streak,
      sessions_count, active_months, tournaments_count, finals_count, wins_count, last_xp_at, synced_on, updated_at)
  values (p_player, pl.owner_id, v_total, coalesce(v_level, 1), v_prest, v_count, v_best, v_sessions, v_months, v_tourn, v_finals, v_wins,
          (select max(created_at) from public.xp_transactions where player_id = p_player), v_today, now())
  on conflict (player_id) do update set total_xp = excluded.total_xp, level = excluded.level, prestige = excluded.prestige,
      current_streak = excluded.current_streak, best_streak = excluded.best_streak, sessions_count = excluded.sessions_count,
      active_months = excluded.active_months, tournaments_count = excluded.tournaments_count, finals_count = excluded.finals_count,
      wins_count = excluded.wins_count, last_xp_at = excluded.last_xp_at, synced_on = excluded.synced_on, updated_at = now();

  -- notifications de montée de niveau / prestige (pas lors de la toute première mise en place)
  if v_existed and coalesce(v_level, 1) > v_old.level then
    select * into v_lvl from public.mascot_levels where level = v_level;
    perform app_private.notify(pl.owner_id, pl.user_id, 'legends_level', 'Niveau ' || v_level || ' atteint ! ' || v_lvl.emoji,
      'Tu deviens ' || v_lvl.status || ' et débloques la mascotte ' || v_lvl.mascot || '.', '/legends');
  elsif v_existed and v_prest > v_old.prestige then
    perform app_private.notify(pl.owner_id, pl.user_id, 'legends_level', 'Oracle ' || repeat('★', v_prest),
      'Nouvelle étoile Prestige débloquée !', '/legends');
  end if;

  -- 6.7 Badges (attribués depuis les données vérifiées, retirés si une correction les invalide)
  for e in
    select bd.*, case bd.condition_type when 'sessions' then v_sessions when 'active_months' then v_months when 'streak' then v_best
      when 'tournaments' then v_tourn when 'finals' then v_finals else v_wins end >= bd.threshold as ok
    from public.badges bd where not (bd.code = any(st.disabled_badges))
  loop
    if e.ok then
      insert into public.player_badges as pb(owner_id, player_id, badge_code) values (pl.owner_id, p_player, e.code)
      on conflict (player_id, badge_code) do update set revoked_at = null, earned_at = now()
      where pb.revoked_at is not null;
      if found and v_existed then
        perform app_private.notify(pl.owner_id, pl.user_id, 'legends_badge', 'Badge débloqué : ' || e.name || ' ' || e.icon, e.description, '/legends?tab=badges');
      end if;
    else
      update public.player_badges set revoked_at = now() where player_id = p_player and badge_code = e.code and revoked_at is null;
    end if;
  end loop;
end $$;

-- Version « sûre » utilisée par les déclencheurs : une erreur ici ne bloque jamais la validation d'une séance
create or replace function app_private.gami_sync_safe(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_player is null then return; end if;
  perform app_private.gami_sync_player(p_player);
exception when others then
  raise warning 'Padel Legends : recalcul impossible pour %: %', p_player, sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 7. Déclencheurs : la gamification suit automatiquement les validations
-- ---------------------------------------------------------------------
create or replace function app_private._gami_att_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform app_private.gami_sync_safe(old.player_id);
  elsif tg_op = 'INSERT' then perform app_private.gami_sync_safe(new.player_id);
  elsif new.player_id <> old.player_id or new.status <> old.status then
    perform app_private.gami_sync_safe(new.player_id);
    if new.player_id <> old.player_id then perform app_private.gami_sync_safe(old.player_id); end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_gami_att on public.session_attendances;
create trigger trg_gami_att after insert or update of status, player_id or delete on public.session_attendances
for each row execute function app_private._gami_att_trg();

create or replace function app_private._gami_session_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if (new.status, new.validated_at, new.session_date) is distinct from (old.status, old.validated_at, old.session_date) then
    for v in select player_id from public.session_attendances where session_id = new.id loop
      perform app_private.gami_sync_safe(v);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists trg_gami_session on public.sessions;
create trigger trg_gami_session after update on public.sessions
for each row execute function app_private._gami_session_trg();

create or replace function app_private._gami_group_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.session_type is distinct from old.session_type then
    for v in select distinct sa.player_id from public.session_attendances sa join public.sessions s on s.id = sa.session_id where s.group_id = new.id loop
      perform app_private.gami_sync_safe(v);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists trg_gami_group on public.groups;
create trigger trg_gami_group after update of session_type on public.groups
for each row execute function app_private._gami_group_trg();

create or replace function app_private._gami_tournament_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.xp_validated_at is not null then perform app_private.gami_sync_safe(old.player_id); end if;
  elsif tg_op = 'INSERT' then
    if new.xp_validated_at is not null then perform app_private.gami_sync_safe(new.player_id); end if;
  elsif (new.status, new.xp_result, new.xp_category, new.xp_validated_at, new.player_id)
        is distinct from (old.status, old.xp_result, old.xp_category, old.xp_validated_at, old.player_id) then
    perform app_private.gami_sync_safe(new.player_id);
    if new.player_id <> old.player_id then perform app_private.gami_sync_safe(old.player_id); end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_gami_tournament on public.tournaments;
create trigger trg_gami_tournament after insert or update or delete on public.tournaments
for each row execute function app_private._gami_tournament_trg();

-- ---------------------------------------------------------------------
-- 8. Lecture : espace Padel Legends d'un joueur (le joueur lui-même, ou son coach)
-- ---------------------------------------------------------------------
create or replace function public.gami_player_space(p_player uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid; pl record; v_season uuid; s record; v jsonb; v_coach bool := app_private.is_coach(); st public.gamification_settings;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if p_player is null or not v_coach then v_pid := app_private.my_player_id(); else v_pid := p_player; end if;
  if v_pid is null then raise exception 'Aucun profil joueur lié à ce compte'; end if;
  select id, owner_id, first_name, last_name into pl from public.players where id = v_pid;
  if not found or (v_coach and pl.owner_id <> auth.uid()) then raise exception 'Joueur introuvable'; end if;

  perform app_private.gami_ensure(pl.owner_id);
  v_season := app_private.gami_ensure_season(pl.owner_id);
  if not exists (select 1 from public.player_gamification_profiles where player_id = v_pid and synced_on = app_private._today()) then
    perform app_private.gami_sync_player(v_pid);
  end if;
  select * into s from public.seasons where id = v_season;
  select * into st from public.gamification_settings where owner_id = pl.owner_id;

  return jsonb_build_object(
    'player', jsonb_build_object('id', pl.id, 'name', trim(pl.first_name || ' ' || pl.last_name)),
    'profile', (select to_jsonb(pg) from public.player_gamification_profiles pg where pg.player_id = v_pid),
    'levels', (select jsonb_agg(to_jsonb(m) order by m.level) from public.mascot_levels m),
    'badges', (select jsonb_agg(jsonb_build_object('code', bd.code, 'name', bd.name, 'description', bd.description, 'category', bd.category,
                 'icon', bd.icon, 'threshold', bd.threshold, 'condition_type', bd.condition_type,
                 'earned_at', (select pb.earned_at from public.player_badges pb where pb.player_id = v_pid and pb.badge_code = bd.code and pb.revoked_at is null))
               order by bd.sort) from public.badges bd where not (bd.code = any(st.disabled_badges))),
    'history', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
                 select id, source, xp, label, reason, is_adjustment, occurred_on, created_at from public.xp_transactions
                 where player_id = v_pid order by created_at desc, id desc limit 150) x), '[]'),
    'season', jsonb_build_object('id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on,
                 'xp', (select coalesce(sum(xp), 0) from public.xp_transactions where player_id = v_pid and occurred_on between s.starts_on and s.ends_on)),
    'rules', (select jsonb_agg(jsonb_build_object('code', code, 'label', label, 'category', category, 'xp', xp, 'threshold', threshold) order by sort)
              from public.xp_rules where owner_id = pl.owner_id and enabled and xp > 0),
    'neutral_rules', jsonb_build_object('auto', st.auto_neutral_weeks, 'excused', st.excused_preserves_streak)
  );
end $$;
revoke all on function public.gami_player_space(uuid) from public, anon;
grant execute on function public.gami_player_space(uuid) to authenticated;

-- Classement permanent ('all') ou saisonnier ('season', saison en cours ou archivée)
create or replace function public.gami_ranking(p_scope text default 'all', p_season uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_coach bool := app_private.is_coach(); v_owner uuid; v_me uuid := app_private.my_player_id(); s record;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  v_owner := case when v_coach then auth.uid() else app_private.my_coach_id() end;
  if v_owner is null then return '[]'; end if;
  perform app_private.gami_ensure_season(v_owner);
  select * into s from public.seasons where owner_id = v_owner and (id = p_season or (p_season is null and status = 'active'))
  order by starts_on desc limit 1;
  if p_scope = 'season' then
    if s.status = 'archived' then
      return coalesce((select jsonb_agg(jsonb_build_object('player_id', sc.player_id,
          'first_name', p.first_name, 'last_name', p.last_name, 'xp', sc.xp, 'rank', sc.rank, 'level', sc.level,
          'is_me', sc.player_id = v_me, 'hidden', coalesce(pg.hide_from_ranking, false)) order by sc.rank)
        from public.season_scores sc join public.players p on p.id = sc.player_id
        left join public.player_gamification_profiles pg on pg.player_id = sc.player_id
        where sc.season_id = s.id and (v_coach or sc.player_id = v_me or not coalesce(pg.hide_from_ranking, false))), '[]');
    end if;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.rank, x.last_name) from (
    select p.id player_id, p.first_name, p.last_name, coalesce(pg.level, 1) level, coalesce(pg.prestige, 0) prestige,
           coalesce(pg.current_streak, 0) streak, p.id = v_me is_me, coalesce(pg.hide_from_ranking, false) hidden,
           case when p_scope = 'season' then coalesce(sx.xp, 0) else coalesce(pg.total_xp, 0) end xp,
           rank() over (order by case when p_scope = 'season' then coalesce(sx.xp, 0) else coalesce(pg.total_xp, 0) end desc) rank
    from public.players p
    left join public.player_gamification_profiles pg on pg.player_id = p.id
    left join lateral (select sum(t.xp)::int xp from public.xp_transactions t where t.player_id = p.id
                       and p_scope = 'season' and t.occurred_on between s.starts_on and s.ends_on) sx on true
    where p.owner_id = v_owner and p.archived_at is null
      and (v_coach or p.id = v_me or (not coalesce(pg.hide_from_ranking, false) and p.user_id is not null))
      and (v_coach or coalesce(pg.total_xp, 0) > 0 or p.id = v_me)) x), '[]');
end $$;
revoke all on function public.gami_ranking(text, uuid) from public, anon;
grant execute on function public.gami_ranking(text, uuid) to authenticated;

create or replace function public.gami_seasons()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := case when app_private.is_coach() then auth.uid() else app_private.my_coach_id() end;
begin
  if v_owner is null then return '[]'; end if;
  perform app_private.gami_ensure_season(v_owner);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'starts_on', starts_on, 'ends_on', ends_on, 'status', status) order by starts_on desc)
    from public.seasons where owner_id = v_owner), '[]');
end $$;
revoke all on function public.gami_seasons() from public, anon;
grant execute on function public.gami_seasons() to authenticated;

-- Le joueur choisit d'apparaître ou non dans les classements
create or replace function public.gami_set_hidden(p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid := app_private.my_player_id();
begin
  if v_pid is null then raise exception 'Réservé aux joueurs'; end if;
  perform app_private.gami_sync_player(v_pid);
  update public.player_gamification_profiles set hide_from_ranking = p_hidden where player_id = v_pid;
end $$;
revoke all on function public.gami_set_hidden(boolean) from public, anon;
grant execute on function public.gami_set_hidden(boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Tableau de bord coach
-- ---------------------------------------------------------------------
create or replace function app_private.gami_require_coach() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  return auth.uid();
end $$;

create or replace function public.gami_coach_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := app_private.gami_require_coach(); v_season uuid; s record; v uuid;
begin
  perform app_private.gami_ensure(v_owner);
  v_season := app_private.gami_ensure_season(v_owner);
  -- remet à jour (une fois par jour) les profils périmés : séries en cours, nouveaux joueurs
  for v in select p.id from public.players p left join public.player_gamification_profiles pg on pg.player_id = p.id
           where p.owner_id = v_owner and p.archived_at is null and (pg.synced_on is null or pg.synced_on < app_private._today()) loop
    perform app_private.gami_sync_player(v);
  end loop;
  select * into s from public.seasons where id = v_season;
  return jsonb_build_object(
    'season', jsonb_build_object('id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on),
    'players', coalesce((select jsonb_agg(to_jsonb(x) order by x.total_xp desc, x.last_name) from (
        select p.id, p.first_name, p.last_name, p.user_id is not null linked, pg.total_xp, pg.level, pg.prestige, pg.current_streak, pg.best_streak,
               pg.sessions_count, pg.tournaments_count, pg.wins_count, pg.hide_from_ranking, pg.last_xp_at,
               (select coalesce(sum(xp), 0) from public.xp_transactions t where t.player_id = p.id and t.occurred_on between s.starts_on and s.ends_on) season_xp,
               (select count(*) from public.player_badges pb where pb.player_id = p.id and pb.revoked_at is null) badges
        from public.players p join public.player_gamification_profiles pg on pg.player_id = p.id
        where p.owner_id = v_owner and p.archived_at is null) x), '[]'),
    'pending_tournaments', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'player_id', t.player_id, 'player', trim(p.first_name || ' ' || p.last_name),
          'name', t.name, 'category', t.category, 'start_date', t.start_date, 'end_date', t.end_date, 'status', t.status, 'result_rank', t.result_rank,
          'xp_result', t.xp_result, 'xp_category', t.xp_category, 'xp_validated_at', t.xp_validated_at) order by t.start_date desc)
        from public.tournaments t join public.players p on p.id = t.player_id
        where t.owner_id = v_owner and t.status <> 'cancelled' and t.start_date <= app_private._today()
          and (t.status = 'done' or t.result_rank is not null)
          and (t.xp_validated_at is null or t.xp_result is distinct from coalesce(t.result_rank, t.xp_result) or t.xp_category is distinct from t.category)), '[]'),
    'validated_tournaments', coalesce((select jsonb_agg(to_jsonb(y) order by y.xp_validated_at desc) from (
        select t.id, trim(p.first_name || ' ' || p.last_name) player, t.name, t.category, t.xp_category, t.xp_result, t.result_rank, t.start_date, t.xp_validated_at
        from public.tournaments t join public.players p on p.id = t.player_id
        where t.owner_id = v_owner and t.xp_validated_at is not null order by t.xp_validated_at desc limit 30) y), '[]'),
    'recent_badges', coalesce((select jsonb_agg(to_jsonb(z) order by z.earned_at desc) from (
        select pb.earned_at, bd.name, bd.icon, bd.code, p.id player_id, trim(p.first_name || ' ' || p.last_name) player
        from public.player_badges pb join public.badges bd on bd.code = pb.badge_code join public.players p on p.id = pb.player_id
        where pb.owner_id = v_owner and pb.revoked_at is null order by pb.earned_at desc limit 20) z), '[]'),
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (
        select ga.id, ga.action, ga.details, ga.reason, ga.created_at, trim(p.first_name || ' ' || p.last_name) player
        from public.gamification_audit ga left join public.players p on p.id = ga.player_id
        where ga.owner_id = v_owner order by ga.created_at desc limit 60) a), '[]'),
    'corrections', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from (
        select t.id, t.created_at, t.xp, t.label, t.reason, t.source, trim(p.first_name || ' ' || p.last_name) player
        from public.xp_transactions t join public.players p on p.id = t.player_id
        where t.owner_id = v_owner and (t.is_adjustment or t.source in ('bonus','correction')) order by t.created_at desc limit 60) c), '[]'),
    'stats', jsonb_build_object(
        'active_30d', (select count(distinct sa.player_id) from public.session_attendances sa join public.sessions se on se.id = sa.session_id
                       where se.owner_id = v_owner and sa.status = 'present' and se.status = 'validated' and se.session_date >= app_private._today() - 30),
        'players', (select count(*) from public.players where owner_id = v_owner and archived_at is null),
        'streak_4plus', (select count(*) from public.player_gamification_profiles pg join public.players p on p.id = pg.player_id
                         where pg.owner_id = v_owner and p.archived_at is null and pg.current_streak >= 4),
        'avg_streak', (select round(avg(pg.current_streak)::numeric, 1) from public.player_gamification_profiles pg join public.players p on p.id = pg.player_id
                         where pg.owner_id = v_owner and p.archived_at is null),
        'xp_season', (select coalesce(sum(xp), 0) from public.xp_transactions where owner_id = v_owner and occurred_on between s.starts_on and s.ends_on),
        'xp_30d', (select coalesce(sum(xp), 0) from public.xp_transactions where owner_id = v_owner and occurred_on >= app_private._today() - 30),
        'badges_30d', (select count(*) from public.player_badges where owner_id = v_owner and revoked_at is null and earned_at >= now() - interval '30 days'),
        'linked', (select count(*) from public.players where owner_id = v_owner and archived_at is null and user_id is not null)),
    'settings', (select to_jsonb(gs) from public.gamification_settings gs where gs.owner_id = v_owner),
    'rules', (select jsonb_agg(to_jsonb(r) order by r.sort, r.threshold) from public.xp_rules r where r.owner_id = v_owner),
    'neutral_weeks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'week_start', week_start, 'reason', reason) order by week_start desc)
        from public.neutral_weeks where owner_id = v_owner), '[]'),
    'badge_catalog', (select jsonb_agg(to_jsonb(bd) order by bd.sort) from public.badges bd)
  );
end $$;
revoke all on function public.gami_coach_overview() from public, anon;
grant execute on function public.gami_coach_overview() to authenticated;

-- Valider (ou corriger) le résultat d'un tournoi : un seul résultat récompensé, XP ajustés automatiquement
create or replace function public.gami_validate_tournament(p_op uuid, p_tournament uuid, p_result text, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := app_private.gami_require_coach(); v_r jsonb; t record; v_before int; v_after int;
begin
  v_r := app_private._op_begin(p_op, 'gami_tournament'); if v_r is not null then return v_r; end if;
  select * into t from public.tournaments where id = p_tournament and owner_id = v_owner for update;
  if not found then raise exception 'Tournoi introuvable'; end if;
  if t.status = 'cancelled' then raise exception 'Un tournoi annulé ne rapporte pas d''XP'; end if;
  if coalesce(trim(p_result), '') = '' then raise exception 'Choisis le résultat à valider'; end if;
  select coalesce(sum(xp), 0) into v_before from public.xp_transactions where player_id = t.player_id and source_key = 'tournament:' || t.id;
  -- le résultat validé devient le résultat officiel du tournoi
  update public.tournaments set result_rank = trim(p_result), category = coalesce(nullif(trim(p_category), ''), t.category),
    xp_result = trim(p_result), xp_category = coalesce(nullif(trim(p_category), ''), t.category),
    xp_validated_at = now(), xp_validated_by = auth.uid(),
    status = case when status in ('considered','registered','confirmed') then 'done' else status end
  where id = t.id;
  perform app_private.gami_sync_player(t.player_id);
  select coalesce(sum(xp), 0) into v_after from public.xp_transactions where player_id = t.player_id and source_key = 'tournament:' || t.id;
  insert into public.gamification_audit(owner_id, player_id, action, details)
  values (v_owner, t.player_id, case when t.xp_validated_at is null then 'tournament_validated' else 'tournament_corrected' end,
          jsonb_build_object('tournament', t.name, 'category', coalesce(nullif(trim(p_category), ''), t.category), 'result', trim(p_result),
                             'previous_result', t.xp_result, 'xp_before', v_before, 'xp_after', v_after));
  return app_private._op_end(p_op, jsonb_build_object('status', 'ok', 'xp', v_after, 'delta', v_after - v_before));
end $$;
revoke all on function public.gami_validate_tournament(uuid, uuid, text, text) from public, anon;
grant execute on function public.gami_validate_tournament(uuid, uuid, text, text) to authenticated;

-- Bonus exceptionnel ou correction manuelle : motivé, plafonné, journalisé, idempotent
create or replace function public.gami_manual_xp(p_op uuid, p_player uuid, p_xp int, p_kind text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := app_private.gami_require_coach(); v_r jsonb; st public.gamification_settings; v_total int; v_today_n int;
begin
  if p_op is null then raise exception 'Clé d''opération manquante'; end if;
  v_r := app_private._op_begin(p_op, 'gami_manual'); if v_r is not null then return v_r; end if;
  if not exists (select 1 from public.players where id = p_player and owner_id = v_owner) then raise exception 'Joueur introuvable'; end if;
  perform app_private.gami_ensure(v_owner);
  select * into st from public.gamification_settings where owner_id = v_owner;
  if p_kind not in ('bonus','correction') then raise exception 'Type invalide'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Indique un motif (5 caractères minimum)'; end if;
  if p_xp = 0 or abs(p_xp) > st.manual_max_xp then raise exception 'Montant entre 1 et % XP', st.manual_max_xp; end if;
  if p_kind = 'bonus' and p_xp < 0 then raise exception 'Un bonus est forcément positif (utilise une correction pour retirer des XP)'; end if;
  select count(*) into v_today_n from public.xp_transactions where player_id = p_player and source in ('bonus','correction')
    and created_at >= now() - interval '24 hours';
  if v_today_n >= 3 then raise exception 'Limite atteinte : 3 ajustements manuels par joueur et par 24 h'; end if;
  perform pg_advisory_xact_lock(hashtext('gami:' || p_player::text));
  select coalesce(sum(xp), 0) into v_total from public.xp_transactions where player_id = p_player;
  if v_total + p_xp < 0 then raise exception 'Le total XP ne peut pas devenir négatif (total actuel : %)', v_total; end if;
  insert into public.xp_transactions(owner_id, player_id, source, source_key, basis, xp, label, reason, is_adjustment, occurred_on, created_by, op_id)
  values (v_owner, p_player, p_kind, 'manual:' || p_op, p_kind, p_xp,
          case when p_kind = 'bonus' then 'Bonus du coach' else 'Correction du coach' end, trim(p_reason), p_kind = 'correction',
          app_private._today(), auth.uid(), p_op);
  insert into public.gamification_audit(owner_id, player_id, action, details, reason)
  values (v_owner, p_player, 'manual_' || p_kind, jsonb_build_object('xp', p_xp), trim(p_reason));
  perform app_private.gami_sync_player(p_player);
  return app_private._op_end(p_op, jsonb_build_object('status', 'ok', 'total', v_total + p_xp));
end $$;
revoke all on function public.gami_manual_xp(uuid, uuid, int, text, text) from public, anon;
grant execute on function public.gami_manual_xp(uuid, uuid, int, text, text) to authenticated;

-- Réglages généraux
create or replace function public.gami_update_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := app_private.gami_require_coach(); v uuid;
begin
  perform app_private.gami_ensure(v_owner);
  update public.gamification_settings set
    auto_neutral_weeks = coalesce((p ->> 'auto_neutral_weeks')::boolean, auto_neutral_weeks),
    excused_preserves_streak = coalesce((p ->> 'excused_preserves_streak')::boolean, excused_preserves_streak),
    category_tiers = coalesce(p -> 'category_tiers', category_tiers),
    disabled_badges = coalesce(array(select jsonb_array_elements_text(p -> 'disabled_badges')), disabled_badges),
    manual_max_xp = coalesce((p ->> 'manual_max_xp')::int, manual_max_xp),
    updated_at = now()
  where owner_id = v_owner;
  insert into public.gamification_audit(owner_id, action, details) values (v_owner, 'settings_updated', p);
  for v in select id from public.players where owner_id = v_owner loop perform app_private.gami_sync_player(v); end loop;
end $$;
revoke all on function public.gami_update_settings(jsonb) from public, anon;
grant execute on function public.gami_update_settings(jsonb) to authenticated;

-- Modifier une règle XP (vaut pour les prochains gains) ou ajouter un palier de séances
create or replace function public.gami_save_rule(p_code text, p_xp int, p_enabled boolean, p_threshold int default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := app_private.gami_require_coach(); old record; v uuid; v_code text := p_code;
begin
  perform app_private.gami_ensure(v_owner);
  if p_xp < 0 or p_xp > 1000 then raise exception 'XP entre 0 et 1000'; end if;
  if v_code is null then
    if p_threshold is null or p_threshold < 2 or p_threshold > 2000 then raise exception 'Palier de séances invalide'; end if;
    v_code := 'milestone_' || p_threshold;
    insert into public.xp_rules(owner_id, code, label, category, xp, threshold, enabled, sort)
    values (v_owner, v_code, p_threshold || ' séances cumulées', 'milestone', p_xp, p_threshold, p_enabled, 20)
    on conflict (owner_id, code) do update set xp = excluded.xp, enabled = excluded.enabled, updated_at = now();
  else
    select * into old from public.xp_rules where owner_id = v_owner and code = v_code;
    if not found then raise exception 'Règle inconnue'; end if;
    update public.xp_rules set xp = p_xp, enabled = p_enabled, updated_at = now() where owner_id = v_owner and code = v_code;
  end if;
  insert into public.gamification_audit(owner_id, action, details)
  values (v_owner, 'rule_updated', jsonb_build_object('code', v_code, 'xp', p_xp, 'enabled', p_enabled, 'previous_xp', old.xp, 'previous_enabled', old.enabled));
  for v in select id from public.players where owner_id = v_owner loop perform app_private.gami_sync_player(v); end loop;
end $$;
revoke all on function public.gami_save_rule(text, int, boolean, int) from public, anon;
grant execute on function public.gami_save_rule(text, int, boolean, int) to authenticated;

-- Semaines neutres (vacances, fermeture du club…) : préservent les séries sans donner d'XP
create or replace function public.gami_set_neutral_week(p_week date, p_on boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := app_private.gami_require_coach(); v_w date := date_trunc('week', p_week)::date; v uuid;
begin
  if p_on then
    insert into public.neutral_weeks(owner_id, week_start, reason) values (v_owner, v_w, nullif(trim(p_reason), ''))
    on conflict (owner_id, week_start) do update set reason = excluded.reason;
  else
    delete from public.neutral_weeks where owner_id = v_owner and week_start = v_w;
  end if;
  insert into public.gamification_audit(owner_id, action, details, reason)
  values (v_owner, case when p_on then 'neutral_week_added' else 'neutral_week_removed' end, jsonb_build_object('week', v_w), p_reason);
  for v in select id from public.players where owner_id = v_owner loop perform app_private.gami_sync_player(v); end loop;
end $$;
revoke all on function public.gami_set_neutral_week(date, boolean, text) from public, anon;
grant execute on function public.gami_set_neutral_week(date, boolean, text) to authenticated;

-- Recalcul complet (vérification des soldes)
create or replace function public.gami_recalculate_all()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid := app_private.gami_require_coach(); v uuid; n int := 0; v_before int; v_after int;
begin
  select coalesce(sum(xp), 0) into v_before from public.xp_transactions where owner_id = v_owner;
  for v in select id from public.players where owner_id = v_owner loop perform app_private.gami_sync_player(v); n := n + 1; end loop;
  select coalesce(sum(xp), 0) into v_after from public.xp_transactions where owner_id = v_owner;
  insert into public.gamification_audit(owner_id, action, details)
  values (v_owner, 'recalculated', jsonb_build_object('players', n, 'xp_before', v_before, 'xp_after', v_after));
  return jsonb_build_object('players', n, 'delta', v_after - v_before);
end $$;
revoke all on function public.gami_recalculate_all() from public, anon;
grant execute on function public.gami_recalculate_all() to authenticated;


-- ---------------------------------------------------------------------
-- 10. Mise en place initiale : réglages, saison et calcul des XP à partir de l'historique existant
--     (les séances déjà validées comptent ; aucune notification envoyée à cette occasion)
-- ---------------------------------------------------------------------
do $$ declare o uuid; v uuid; begin
  for o in select distinct owner_id from public.players loop
    perform app_private.gami_ensure(o);
    perform app_private.gami_ensure_season(o);
  end loop;
  for v in select p.id from public.players p where not exists (select 1 from public.player_gamification_profiles pg where pg.player_id = p.id) loop
    perform app_private.gami_sync_safe(v);
  end loop;
end $$;

notify pgrst, 'reload schema';
