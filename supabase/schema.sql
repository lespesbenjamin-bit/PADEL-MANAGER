-- =====================================================================
-- PADEL GROUP MANAGER – by Ben
-- Schéma complet Supabase (PostgreSQL 15+)
-- À exécuter en une seule fois dans Supabase > SQL Editor > New query
-- Ré-exécutable : supprime puis recrée les objets de l'application.
-- =====================================================================

set client_min_messages = warning;
create extension if not exists pgcrypto;

-- Fonctions internes dans un schéma non exposé par l'API
drop schema if exists app_private cascade;
create schema app_private;
grant usage on schema app_private to authenticated;

-- ---------------------------------------------------------------------
-- 0. Nettoyage (ré-exécution)
-- ---------------------------------------------------------------------
drop view if exists public.v_group_overview cascade;
drop view if exists public.v_cycle_stats cascade;
drop view if exists public.v_sessions cascade;
drop view if exists public.v_player_stats cascade;
drop view if exists public.v_packages cascade;

drop table if exists public.operation_requests cascade;
drop table if exists public.session_revisions cascade;
drop table if exists public.credit_transactions cascade;
drop table if exists public.packages cascade;
drop table if exists public.session_attendances cascade;
drop table if exists public.sessions cascade;
drop table if exists public.group_cycles cascade;
drop table if exists public.group_memberships cascade;
drop table if exists public.groups cascade;
drop table if exists public.players cascade;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table public.players (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null default '',
  phone       text,
  email       text,
  level       text,
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  level       text not null default 'P100',       -- P25, P50, P100, P250, P500 ou libre
  weekday     smallint not null check (weekday between 1 and 7), -- ISO : 1 = lundi … 7 = dimanche
  start_time  time not null,
  end_time    time not null,
  capacity    smallint not null default 4 check (capacity > 0),
  status      text not null default 'active' check (status in ('active','suspended','archived')),
  color       text not null default '#7C3AED',
  notes       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.group_memberships (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  joined_on  date not null default ((now() at time zone 'Europe/Paris')::date),
  left_on    date,
  created_at timestamptz not null default now()
);
create unique index group_memberships_active_uniq
  on public.group_memberships(group_id, player_id) where left_on is null;

create table public.group_cycles (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id         uuid not null references public.groups(id) on delete cascade,
  cycle_number     int not null,
  name             text,
  planned_sessions int not null check (planned_sessions > 0),
  start_date       date not null,
  status           text not null default 'active' check (status in ('active','completed','archived')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (group_id, cycle_number)
);

create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id        uuid not null references public.groups(id) on delete cascade,
  cycle_id        uuid references public.group_cycles(id) on delete set null,
  session_date    date not null,
  start_time      time not null,
  end_time        time not null,
  status          text not null default 'planned' check (status in ('planned','validated','cancelled')),
  kind            text not null default 'regular' check (kind in ('regular','exceptional','makeup')),
  counts_in_cycle boolean not null default true,
  original_date   date,                 -- date initiale si reportée
  rescheduled     boolean not null default false,
  cancel_reason   text,
  notes           text,
  validated_at    timestamptz,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_time > start_time)
);
create index sessions_group_date_idx on public.sessions(group_id, session_date);
create index sessions_cycle_idx on public.sessions(cycle_id);
create index sessions_date_idx on public.sessions(owner_id, session_date);

create table public.session_attendances (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id     uuid not null references public.sessions(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  status         text not null default 'unknown' check (status in ('present','absent','excused','unknown')),
  consume_credit boolean not null default false,
  is_guest       boolean not null default false,   -- participation exceptionnelle / rattrapage
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, player_id)
);

create table public.packages (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  label         text not null default 'Forfait',
  total_credits int not null check (total_credits > 0),
  price         numeric(10,2),
  purchased_on  date not null default ((now() at time zone 'Europe/Paris')::date),
  expires_on    date,
  notes         text,
  created_at    timestamptz not null default now()
);

create table public.credit_transactions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  package_id    uuid references public.packages(id) on delete set null,
  session_id    uuid references public.sessions(id) on delete set null,
  kind          text not null check (kind in ('purchase','consume','refund','adjust')),
  delta         int not null,
  note          text,
  operation_id  uuid,
  created_at    timestamptz not null default now()
);
create index credit_tx_player_idx on public.credit_transactions(player_id);
create index credit_tx_session_idx on public.credit_transactions(session_id, player_id);
create index credit_tx_package_idx on public.credit_transactions(package_id);

create table public.session_revisions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  revision   int not null,
  action     text not null,
  snapshot   jsonb not null,
  reason     text,
  created_at timestamptz not null default now()
);
create index session_revisions_session_idx on public.session_revisions(session_id, created_at);

create table public.operation_requests (
  id         uuid primary key,              -- clé d'idempotence générée par l'application
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null,
  result     jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Sécurité : RLS (chaque coach ne voit que ses données)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['players','groups','group_memberships','group_cycles','sessions',
                           'session_attendances','packages','credit_transactions',
                           'session_revisions','operation_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated
                    using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- L'historique des mouvements de crédits et des révisions n'est jamais modifié à la main
revoke update, delete on public.credit_transactions from authenticated;
revoke update, delete on public.session_revisions from authenticated;

-- ---------------------------------------------------------------------
-- 3. Utilitaires
-- ---------------------------------------------------------------------
create or replace function app_private._today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;

create or replace function app_private._now_local_time() returns time
language sql stable as $$ select (now() at time zone 'Europe/Paris')::time $$;

-- Premier jour (ISO 1-7) à partir de d inclus
create or replace function app_private._next_weekday(d date, wd int) returns date
language sql immutable as $$ select d + ((wd - extract(isodow from d)::int + 7) % 7) $$;

create or replace function app_private._touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create trigger trg_players_touch before update on public.players for each row execute function app_private._touch_updated_at();
create trigger trg_groups_touch before update on public.groups for each row execute function app_private._touch_updated_at();
create trigger trg_cycles_touch before update on public.group_cycles for each row execute function app_private._touch_updated_at();
create trigger trg_sessions_touch before update on public.sessions for each row execute function app_private._touch_updated_at();
create trigger trg_att_touch before update on public.session_attendances for each row execute function app_private._touch_updated_at();

-- Un achat de forfait crée automatiquement le mouvement de crédit correspondant
create or replace function app_private._package_purchase_tx() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.credit_transactions(owner_id, player_id, package_id, kind, delta, note)
    values (new.owner_id, new.player_id, new.id, 'purchase', new.total_credits, new.label);
  elsif tg_op = 'UPDATE' and new.total_credits <> old.total_credits then
    insert into public.credit_transactions(owner_id, player_id, package_id, kind, delta, note)
    values (new.owner_id, new.player_id, new.id, 'adjust', new.total_credits - old.total_credits,
            'Modification du forfait');
  end if;
  return new;
end $$;
create trigger trg_package_tx after insert or update on public.packages
for each row execute function app_private._package_purchase_tx();

-- Idempotence : retourne le résultat déjà enregistré si l'opération a déjà été traitée
create or replace function app_private._op_begin(p_op uuid, p_kind text) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  if p_op is null then return null; end if;
  insert into public.operation_requests(id, kind) values (p_op, p_kind) on conflict (id) do nothing;
  if found then return null; end if;
  select result into v from public.operation_requests where id = p_op;
  return coalesce(v, jsonb_build_object('status','duplicate')) || jsonb_build_object('replayed', true);
end $$;

create or replace function app_private._op_end(p_op uuid, p_result jsonb) returns jsonb
language plpgsql as $$
begin
  if p_op is not null then
    update public.operation_requests set result = p_result where id = p_op;
  end if;
  return p_result;
end $$;

-- Instantané d'une séance (séance + présences) dans l'historique
create or replace function app_private._log_revision(p_session uuid, p_action text, p_reason text)
returns void language plpgsql as $$
begin
  insert into public.session_revisions(owner_id, session_id, revision, action, snapshot, reason)
  select s.owner_id, s.id, s.version, p_action,
         jsonb_build_object(
           'session', to_jsonb(s),
           'attendances', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at)
                                    from public.session_attendances a where a.session_id = s.id), '[]'::jsonb)),
         p_reason
  from public.sessions s where s.id = p_session;
end $$;

-- Applique l'état de crédit souhaité (consommé / non consommé) pour un joueur sur une séance.
-- Retourne la variation appliquée (-1 consommation, +1 recrédit, 0 rien).
create or replace function app_private._apply_credit(p_session uuid, p_player uuid, p_wanted boolean, p_op uuid)
returns int language plpgsql as $$
declare
  v_net int;
  v_pkg uuid;
  v_owner uuid;
begin
  select owner_id into v_owner from public.sessions where id = p_session;
  select coalesce(-sum(delta), 0) into v_net
  from public.credit_transactions
  where session_id = p_session and player_id = p_player and kind in ('consume','refund');

  if p_wanted and v_net <= 0 then
    -- forfait le plus ancien qui a encore du crédit (FIFO)
    select p.id into v_pkg
    from public.packages p
    where p.player_id = p_player
      and (p.expires_on is null or p.expires_on >= (select session_date from public.sessions where id = p_session))
      and (select coalesce(sum(t.delta),0) from public.credit_transactions t where t.package_id = p.id) > 0
    order by p.purchased_on, p.created_at
    limit 1;
    insert into public.credit_transactions(owner_id, player_id, package_id, session_id, kind, delta, note, operation_id)
    values (v_owner, p_player, v_pkg, p_session, 'consume', -1,
            case when v_pkg is null then 'Consommation sans forfait disponible' end, p_op);
    return -1;
  elsif not p_wanted and v_net > 0 then
    select package_id into v_pkg from public.credit_transactions
    where session_id = p_session and player_id = p_player and kind = 'consume'
    order by created_at desc limit 1;
    insert into public.credit_transactions(owner_id, player_id, package_id, session_id, kind, delta, note, operation_id)
    values (v_owner, p_player, v_pkg, p_session, 'refund', 1, 'Correction de séance', p_op);
    return 1;
  end if;
  return 0;
end $$;

-- Écrit la feuille de présence (remplace intégralement) + crédits
create or replace function app_private._write_attendances(p_session uuid, p_attendances jsonb, p_op uuid)
returns jsonb language plpgsql as $$
declare
  r record;
  v_owner uuid;
  v_consumed int := 0;
  v_refunded int := 0;
  v_d int;
  v_ids uuid[] := '{}';
begin
  select owner_id into v_owner from public.sessions where id = p_session;

  for r in
    select * from jsonb_to_recordset(coalesce(p_attendances, '[]'::jsonb))
      as x(player_id uuid, status text, consume_credit boolean, is_guest boolean, note text)
  loop
    if not exists (select 1 from public.players where id = r.player_id and owner_id = v_owner) then
      raise exception 'Joueur inconnu : %', r.player_id using errcode = 'P0002';
    end if;
    v_ids := v_ids || r.player_id;
    insert into public.session_attendances(owner_id, session_id, player_id, status, consume_credit, is_guest, note)
    values (v_owner, p_session, r.player_id, coalesce(r.status,'unknown'), coalesce(r.consume_credit,false),
            coalesce(r.is_guest,false), r.note)
    on conflict (session_id, player_id) do update
      set status = excluded.status, consume_credit = excluded.consume_credit,
          is_guest = excluded.is_guest, note = excluded.note;

    v_d := app_private._apply_credit(p_session, r.player_id, coalesce(r.consume_credit,false), p_op);
    if v_d < 0 then v_consumed := v_consumed + 1; elsif v_d > 0 then v_refunded := v_refunded + 1; end if;
  end loop;

  -- joueurs retirés de la feuille : on recrédite puis on supprime la ligne
  for r in select player_id from public.session_attendances
           where session_id = p_session and not (player_id = any(v_ids))
  loop
    v_d := app_private._apply_credit(p_session, r.player_id, false, p_op);
    if v_d > 0 then v_refunded := v_refunded + 1; end if;
    delete from public.session_attendances where session_id = p_session and player_id = r.player_id;
  end loop;

  return jsonb_build_object('credits_consumed', v_consumed, 'credits_refunded', v_refunded);
end $$;

-- Date de la prochaine occurrence hebdomadaire après la dernière séance du cycle
create or replace function app_private._next_slot_after_cycle(p_cycle uuid, p_after date default null) returns date
language plpgsql stable as $$
declare v_last date; v_wd int; v_start date;
begin
  select g.weekday, c.start_date into v_wd, v_start
  from public.group_cycles c join public.groups g on g.id = c.group_id where c.id = p_cycle;
  select max(session_date) into v_last from public.sessions
  where cycle_id = p_cycle and status <> 'cancelled' and counts_in_cycle;
  v_last := greatest(v_last, p_after);
  if v_last is null then return app_private._next_weekday(greatest(v_start, app_private._today()), v_wd); end if;
  return app_private._next_weekday(greatest(v_last + 1, app_private._today()), v_wd);
end $$;

-- ---------------------------------------------------------------------
-- 4. Opérations métier (RPC appelées par l'application)
-- ---------------------------------------------------------------------

-- 4.1 Créer un cycle et générer ses séances
create or replace function public.create_cycle(
  p_group_id uuid, p_planned int, p_start_date date default null, p_name text default null)
returns uuid language plpgsql as $$
declare
  g public.groups%rowtype;
  v_num int;
  v_first date;
  v_cycle uuid;
  i int;
begin
  select * into g from public.groups where id = p_group_id for update;
  if not found then raise exception 'Groupe introuvable' using errcode = 'P0002'; end if;
  if p_planned is null or p_planned < 1 or p_planned > 100 then
    raise exception 'Nombre de séances invalide';
  end if;

  select coalesce(max(cycle_number),0) + 1 into v_num from public.group_cycles where group_id = p_group_id;
  v_first := app_private._next_weekday(coalesce(p_start_date, app_private._today()), g.weekday);

  insert into public.group_cycles(owner_id, group_id, cycle_number, name, planned_sessions, start_date)
  values (g.owner_id, g.id, v_num, coalesce(nullif(p_name,''), 'Cycle ' || v_num), p_planned, v_first)
  returning id into v_cycle;

  for i in 0 .. p_planned - 1 loop
    insert into public.sessions(owner_id, group_id, cycle_id, session_date, start_time, end_time)
    values (g.owner_id, g.id, v_cycle, v_first + i * 7, g.start_time, g.end_time);
  end loop;

  return v_cycle;
end $$;

-- 4.2 Renouveler un cycle (conserve les cycles précédents)
create or replace function public.renew_cycle(
  p_op uuid, p_group_id uuid,
  p_planned int default null, p_start_date date default null,
  p_keep_members boolean default true,
  p_weekday int default null, p_start_time time default null, p_end_time time default null,
  p_name text default null)
returns jsonb language plpgsql as $$
declare
  v_prev public.group_cycles%rowtype;
  v_planned int;
  v_start date;
  v_new uuid;
  v_r jsonb;
begin
  v_r := app_private._op_begin(p_op, 'renew_cycle'); if v_r is not null then return v_r; end if;
  perform 1 from public.groups where id = p_group_id for update;

  select * into v_prev from public.group_cycles where group_id = p_group_id
  order by cycle_number desc limit 1;

  if p_weekday is not null or p_start_time is not null or p_end_time is not null then
    update public.groups set
      weekday = coalesce(p_weekday, weekday),
      start_time = coalesce(p_start_time, start_time),
      end_time = coalesce(p_end_time, end_time)
    where id = p_group_id;
  end if;

  v_planned := coalesce(p_planned, v_prev.planned_sessions, 10);
  if p_start_date is not null then
    v_start := p_start_date;
  elsif v_prev.id is not null then
    v_start := (select coalesce(max(session_date), v_prev.start_date) + 1 from public.sessions
                where cycle_id = v_prev.id and status <> 'cancelled');
    v_start := greatest(v_start, app_private._today());
  else
    v_start := app_private._today();
  end if;

  if not p_keep_members then
    update public.group_memberships set left_on = v_start - 1
    where group_id = p_group_id and left_on is null;
  end if;

  v_new := public.create_cycle(p_group_id, v_planned, v_start, p_name);
  v_r := jsonb_build_object('status','ok','cycle_id', v_new);
  return app_private._op_end(p_op, v_r);
end $$;

-- 4.3 Ajouter une séance (exceptionnelle, rattrapage ou régulière)
create or replace function public.add_session(
  p_group_id uuid, p_date date, p_start_time time default null, p_end_time time default null,
  p_kind text default 'exceptional', p_counts_in_cycle boolean default false,
  p_cycle_id uuid default null, p_notes text default null)
returns uuid language plpgsql as $$
declare g public.groups%rowtype; v_cycle uuid; v_id uuid;
begin
  select * into g from public.groups where id = p_group_id;
  if not found then raise exception 'Groupe introuvable' using errcode = 'P0002'; end if;
  v_cycle := p_cycle_id;
  if v_cycle is null then
    -- cycle en cours à cette date : le plus récent démarré avant la date, sinon le prochain
    select id into v_cycle from public.group_cycles
    where group_id = p_group_id and status <> 'archived'
    order by (start_date <= p_date) desc, case when start_date <= p_date then cycle_number end desc nulls last, cycle_number
    limit 1;
  end if;
  insert into public.sessions(owner_id, group_id, cycle_id, session_date, start_time, end_time, kind, counts_in_cycle, notes)
  values (g.owner_id, g.id, v_cycle, p_date, coalesce(p_start_time, g.start_time), coalesce(p_end_time, g.end_time),
          coalesce(p_kind,'exceptional'), coalesce(p_counts_in_cycle,false), p_notes)
  returning id into v_id;
  return v_id;
end $$;

-- 4.4 Reporter / modifier uniquement cette séance (le rattachement au cycle est conservé)
create or replace function public.reschedule_session(
  p_op uuid, p_session_id uuid, p_new_date date,
  p_start_time time default null, p_end_time time default null, p_reason text default null)
returns jsonb language plpgsql as $$
declare s public.sessions%rowtype; v_r jsonb;
begin
  v_r := app_private._op_begin(p_op, 'reschedule'); if v_r is not null then return v_r; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Séance introuvable' using errcode = 'P0002'; end if;
  if s.status <> 'planned' then raise exception 'Seule une séance prévue peut être reportée'; end if;
  perform app_private._log_revision(s.id, 'reschedule', p_reason);
  update public.sessions set
    original_date = coalesce(original_date, session_date),
    rescheduled = (p_new_date <> coalesce(original_date, session_date)) or rescheduled,
    session_date = p_new_date,
    start_time = coalesce(p_start_time, start_time),
    end_time = coalesce(p_end_time, end_time),
    version = version + 1
  where id = s.id;
  return app_private._op_end(p_op, jsonb_build_object('status','ok','session_id', s.id));
end $$;

-- 4.5 Annuler une séance (option : replanifier une séance en fin de cycle)
create or replace function public.cancel_session(
  p_op uuid, p_session_id uuid, p_reason text default null, p_add_replacement boolean default true)
returns jsonb language plpgsql as $$
declare s public.sessions%rowtype; v_r jsonb; v_new uuid; v_date date;
begin
  v_r := app_private._op_begin(p_op, 'cancel'); if v_r is not null then return v_r; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Séance introuvable' using errcode = 'P0002'; end if;
  if s.status <> 'planned' then raise exception 'Seule une séance prévue peut être annulée'; end if;
  perform app_private._log_revision(s.id, 'cancel', p_reason);
  update public.sessions set status = 'cancelled', cancel_reason = p_reason, version = version + 1
  where id = s.id;

  if p_add_replacement and s.cycle_id is not null and s.counts_in_cycle then
    v_date := app_private._next_slot_after_cycle(s.cycle_id, s.session_date);
    insert into public.sessions(owner_id, group_id, cycle_id, session_date, start_time, end_time, kind, counts_in_cycle, notes)
    select s.owner_id, s.group_id, s.cycle_id, v_date, g.start_time, g.end_time, 'regular', true,
           'Remplace la séance annulée du ' || to_char(s.session_date, 'DD/MM/YYYY')
    from public.groups g where g.id = s.group_id
    returning id into v_new;
  end if;
  return app_private._op_end(p_op, jsonb_build_object('status','ok','session_id', s.id, 'replacement_id', v_new, 'replacement_date', v_date));
end $$;

-- 4.6 Rétablir une séance annulée
create or replace function public.restore_session(p_op uuid, p_session_id uuid)
returns jsonb language plpgsql as $$
declare s public.sessions%rowtype; v_r jsonb;
begin
  v_r := app_private._op_begin(p_op, 'restore'); if v_r is not null then return v_r; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if s.status <> 'cancelled' then raise exception 'La séance n''est pas annulée'; end if;
  perform app_private._log_revision(s.id, 'restore', null);
  update public.sessions set status = 'planned', cancel_reason = null, version = version + 1 where id = s.id;
  return app_private._op_end(p_op, jsonb_build_object('status','ok'));
end $$;

-- 4.7 Modifier toute la récurrence future (les séances passées/validées ne sont jamais touchées)
create or replace function public.update_future_recurrence(
  p_op uuid, p_group_id uuid, p_from_date date, p_weekday int, p_start_time time, p_end_time time)
returns jsonb language plpgsql as $$
declare v_r jsonb; s record; v_new date; v_from date; v_n int := 0;
begin
  v_r := app_private._op_begin(p_op, 'update_recurrence'); if v_r is not null then return v_r; end if;
  if p_end_time <= p_start_time then raise exception 'L''heure de fin doit être après l''heure de début'; end if;
  perform 1 from public.groups where id = p_group_id for update;
  update public.groups set weekday = p_weekday, start_time = p_start_time, end_time = p_end_time
  where id = p_group_id;

  v_from := greatest(coalesce(p_from_date, app_private._today()), app_private._today());
  for s in select * from public.sessions
           where group_id = p_group_id and status = 'planned' and kind = 'regular'
             and not rescheduled and session_date >= v_from
           order by session_date
           for update
  loop
    v_new := s.session_date - (extract(isodow from s.session_date)::int - 1) + (p_weekday - 1);
    if v_new < v_from then v_new := v_new + 7; end if;
    perform app_private._log_revision(s.id, 'recurrence', 'Modification de la récurrence');
    update public.sessions set session_date = v_new, start_time = p_start_time, end_time = p_end_time,
           version = version + 1
    where id = s.id;
    v_n := v_n + 1;
  end loop;
  return app_private._op_end(p_op, jsonb_build_object('status','ok','updated', v_n));
end $$;

-- 4.8 Pause (vacances) : les séances prévues de la période sont décalées après la pause
create or replace function public.pause_group(
  p_op uuid, p_group_id uuid, p_from date, p_to date, p_reason text default 'Vacances')
returns jsonb language plpgsql as $$
declare v_r jsonb; g public.groups%rowtype; s record; v_cursor date; v_new date; v_n int := 0;
begin
  v_r := app_private._op_begin(p_op, 'pause'); if v_r is not null then return v_r; end if;
  if p_to < p_from then raise exception 'Période invalide'; end if;
  select * into g from public.groups where id = p_group_id for update;
  v_cursor := app_private._next_weekday(p_to + 1, g.weekday);

  for s in select * from public.sessions
           where group_id = p_group_id and status = 'planned' and kind = 'regular'
             and session_date >= p_from
           order by session_date, start_time
           for update
  loop
    v_new := greatest(case when s.session_date > p_to then s.session_date else v_cursor end, v_cursor);
    if v_new <> s.session_date then
      perform app_private._log_revision(s.id, 'pause', p_reason);
      update public.sessions set
        original_date = coalesce(original_date, session_date),
        rescheduled = true,
        session_date = v_new,
        version = version + 1
      where id = s.id;
      v_n := v_n + 1;
    end if;
    v_cursor := v_new + 7;
  end loop;
  return app_private._op_end(p_op, jsonb_build_object('status','ok','moved', v_n));
end $$;

-- 4.9 Valider une séance : présences + crédits + comptage dans le cycle (transactionnel, idempotent)
create or replace function public.validate_session(
  p_op uuid, p_session_id uuid, p_attendances jsonb,
  p_counts_in_cycle boolean default null, p_notes text default null)
returns jsonb language plpgsql as $$
declare s public.sessions%rowtype; v_r jsonb; v_c jsonb;
begin
  v_r := app_private._op_begin(p_op, 'validate'); if v_r is not null then return v_r; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Séance introuvable' using errcode = 'P0002'; end if;
  if s.status = 'validated' then raise exception 'Séance déjà validée : utilisez la correction'; end if;
  if s.status = 'cancelled' then raise exception 'Une séance annulée ne peut pas être validée'; end if;

  v_c := app_private._write_attendances(s.id, p_attendances, p_op);
  update public.sessions set
    status = 'validated', validated_at = now(),
    counts_in_cycle = coalesce(p_counts_in_cycle, counts_in_cycle),
    notes = coalesce(p_notes, notes),
    version = version + 1
  where id = s.id;
  perform app_private._log_revision(s.id, 'validate', null);
  return app_private._op_end(p_op, jsonb_build_object('status','ok','session_id', s.id) || v_c);
end $$;

-- 4.10 Corriger une séance validée (historique conservé, crédits rééquilibrés)
create or replace function public.correct_session(
  p_op uuid, p_session_id uuid, p_attendances jsonb, p_reason text default null,
  p_counts_in_cycle boolean default null, p_notes text default null)
returns jsonb language plpgsql as $$
declare s public.sessions%rowtype; v_r jsonb; v_c jsonb;
begin
  v_r := app_private._op_begin(p_op, 'correct'); if v_r is not null then return v_r; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Séance introuvable' using errcode = 'P0002'; end if;
  if s.status <> 'validated' then raise exception 'Seule une séance validée peut être corrigée'; end if;

  v_c := app_private._write_attendances(s.id, p_attendances, p_op);
  update public.sessions set
    counts_in_cycle = coalesce(p_counts_in_cycle, counts_in_cycle),
    notes = coalesce(p_notes, notes),
    version = version + 1
  where id = s.id;
  perform app_private._log_revision(s.id, 'correct', p_reason);
  return app_private._op_end(p_op, jsonb_build_object('status','ok','session_id', s.id) || v_c);
end $$;

-- 4.11 Annuler la validation (retour à « prévue », tous les crédits sont recrédités)
create or replace function public.reopen_session(p_op uuid, p_session_id uuid, p_reason text default null)
returns jsonb language plpgsql as $$
declare s public.sessions%rowtype; v_r jsonb; a record; v_n int := 0;
begin
  v_r := app_private._op_begin(p_op, 'reopen'); if v_r is not null then return v_r; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if s.status <> 'validated' then raise exception 'La séance n''est pas validée'; end if;
  for a in select player_id from public.session_attendances where session_id = s.id loop
    v_n := v_n + app_private._apply_credit(s.id, a.player_id, false, p_op);
  end loop;
  update public.session_attendances set consume_credit = false where session_id = s.id;
  update public.sessions set status = 'planned', validated_at = null, version = version + 1 where id = s.id;
  perform app_private._log_revision(s.id, 'reopen', p_reason);
  return app_private._op_end(p_op, jsonb_build_object('status','ok','credits_refunded', v_n));
end $$;

-- 4.12 Déplacer un joueur d'un groupe à un autre
create or replace function public.move_player(
  p_player_id uuid, p_from_group uuid, p_to_group uuid, p_date date default null)
returns void language plpgsql as $$
declare v_date date := coalesce(p_date, app_private._today());
begin
  update public.group_memberships set left_on = v_date - 1
  where group_id = p_from_group and player_id = p_player_id and left_on is null;
  insert into public.group_memberships(owner_id, group_id, player_id, joined_on)
  select owner_id, p_to_group, p_player_id, v_date from public.groups where id = p_to_group
  on conflict do nothing;
end $$;

-- 4.13 Archiver un groupe (historique conservé, séances futures annulées)
create or replace function public.archive_group(p_group_id uuid)
returns void language plpgsql as $$
declare s record;
begin
  update public.groups set status = 'archived', archived_at = now() where id = p_group_id;
  for s in select id from public.sessions
           where group_id = p_group_id and status = 'planned' and session_date >= app_private._today()
  loop
    perform app_private._log_revision(s.id, 'cancel', 'Groupe archivé');
    update public.sessions set status = 'cancelled', cancel_reason = 'Groupe archivé', version = version + 1
    where id = s.id;
  end loop;
  update public.group_cycles set status = 'archived' where group_id = p_group_id and status = 'active';
end $$;

-- 4.14 Ajustement manuel de crédits
create or replace function public.adjust_credits(p_player_id uuid, p_delta int, p_note text)
returns void language plpgsql as $$
begin
  if p_delta = 0 then return; end if;
  insert into public.credit_transactions(owner_id, player_id, kind, delta, note)
  select owner_id, id, 'adjust', p_delta, p_note from public.players where id = p_player_id;
end $$;

-- 4.15 Supprimer un forfait non entamé
create or replace function public.delete_package(p_package_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.packages where id = p_package_id and owner_id = auth.uid()) then
    raise exception 'Forfait introuvable' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.credit_transactions where package_id = p_package_id and kind in ('consume','refund')) then
    raise exception 'Ce forfait a déjà été utilisé : il ne peut pas être supprimé';
  end if;
  delete from public.credit_transactions where package_id = p_package_id;
  delete from public.packages where id = p_package_id;
end $$;

-- ---------------------------------------------------------------------
-- 5. Vues (tous les compteurs sont dérivés des données réelles)
-- ---------------------------------------------------------------------
create view public.v_sessions with (security_invoker = true) as
select
  s.*,
  g.name  as group_name,
  g.level as group_level,
  g.capacity,
  g.color,
  g.status as group_status,
  c.cycle_number,
  c.name  as cycle_name,
  c.planned_sessions,
  case when s.status <> 'cancelled' and s.counts_in_cycle and s.cycle_id is not null
       then row_number() over (partition by s.cycle_id, (s.status <> 'cancelled' and s.counts_in_cycle)
                               order by s.session_date, s.start_time, s.created_at)
  end as cycle_index,
  (select count(*) from public.group_memberships m
     where m.group_id = s.group_id and m.left_on is null) as member_count,
  (select count(*) from public.session_attendances a
     where a.session_id = s.id and a.status = 'present') as present_count,
  (select count(*) from public.session_attendances a
     where a.session_id = s.id) as attendance_count,
  (s.status = 'planned' and (s.session_date < app_private._today()
     or (s.session_date = app_private._today() and s.end_time <= app_private._now_local_time()))) as pending_validation
from public.sessions s
join public.groups g on g.id = s.group_id
left join public.group_cycles c on c.id = s.cycle_id;

create view public.v_cycle_stats with (security_invoker = true) as
with st as (
  select
    c.id,
    count(s.id) filter (where s.status = 'validated' and s.counts_in_cycle)                      as realized,
    count(s.id) filter (where s.status = 'cancelled')                                            as cancelled,
    count(s.id) filter (where s.status <> 'cancelled' and s.counts_in_cycle)                     as scheduled,
    count(s.id) filter (where s.status = 'planned' and s.counts_in_cycle)                        as planned_left,
    count(s.id) filter (where s.status = 'planned' and (s.session_date < app_private._today()
        or (s.session_date = app_private._today() and s.end_time <= app_private._now_local_time())))       as pending,
    min(s.session_date) filter (where s.status = 'planned' and s.session_date >= app_private._today()) as next_date,
    min(s.session_date) filter (where s.status <> 'cancelled' and s.counts_in_cycle)             as first_date,
    max(s.session_date) filter (where s.status <> 'cancelled' and s.counts_in_cycle)             as last_date
  from public.group_cycles c
  left join public.sessions s on s.cycle_id = c.id
  group by c.id
)
select
  c.*,
  g.name as group_name, g.level, g.weekday, g.start_time, g.end_time, g.capacity, g.color,
  g.status as group_status,
  st.realized, st.cancelled, st.scheduled, st.planned_left, st.pending, st.next_date,
  coalesce(st.first_date, c.start_date) as first_date,
  greatest(c.planned_sessions - st.realized, 0) as remaining,
  least(100, round(100.0 * st.realized / c.planned_sessions))::int as progress,
  case
    when st.scheduled >= c.planned_sessions then
      (select s2.session_date from public.sessions s2
        where s2.cycle_id = c.id and s2.status <> 'cancelled' and s2.counts_in_cycle
        order by s2.session_date, s2.start_time offset c.planned_sessions - 1 limit 1)
    else coalesce(st.last_date, c.start_date - 7) + ((c.planned_sessions - st.scheduled) * 7)::int
  end as projected_end_date,
  case
    when c.status = 'archived' then 'archived'
    when c.status = 'completed' or st.realized >= c.planned_sessions then 'completed'
    when coalesce(st.first_date, c.start_date) > app_private._today() then 'upcoming'
    else 'in_progress'
  end as effective_status
from public.group_cycles c
join public.groups g on g.id = c.group_id
join st on st.id = c.id;

create view public.v_group_overview with (security_invoker = true) as
select
  g.*,
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
       or (s.session_date = app_private._today() and s.end_time <= app_private._now_local_time()))) as pending_count
from public.groups g
left join lateral (
  select * from public.v_cycle_stats c
  where c.group_id = g.id and c.effective_status in ('in_progress','upcoming','completed')
  order by case c.effective_status when 'in_progress' then 0 when 'upcoming' then 1 else 2 end,
           case when c.effective_status = 'completed' then -c.cycle_number else c.cycle_number end
  limit 1
) cs on true;

create view public.v_packages with (security_invoker = true) as
select
  p.*,
  coalesce((select sum(t.delta) from public.credit_transactions t where t.package_id = p.id), 0)::int as remaining,
  coalesce((select -sum(t.delta) from public.credit_transactions t
             where t.package_id = p.id and t.kind in ('consume','refund')), 0)::int as consumed
from public.packages p;

create view public.v_player_stats with (security_invoker = true) as
select
  pl.*,
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
  (select count(*) from public.packages p where p.player_id = pl.id)::int as packages_count
from public.players pl;

grant select on public.v_sessions, public.v_cycle_stats, public.v_group_overview,
                public.v_packages, public.v_player_stats to authenticated;
revoke all on public.v_sessions, public.v_cycle_stats, public.v_group_overview,
              public.v_packages, public.v_player_stats from anon;

-- ---------------------------------------------------------------------
-- 6. Données de démonstration (appelées depuis l'application, réglages)
-- ---------------------------------------------------------------------
create or replace function public.seed_demo_data()
returns jsonb language plpgsql as $$
declare
  v_uid uuid := auth.uid();
  p uuid[] := '{}';
  v_id uuid;
  g1 uuid; g2 uuid; g3 uuid; g4 uuid;
  c uuid;
  s record;
  names text[][] := array[
    ['Lucas','Martin','P100'],['Emma','Bernard','P100'],['Hugo','Dubois','P100'],['Léa','Thomas','P100'],
    ['Nathan','Robert','P250'],['Chloé','Richard','P250'],['Louis','Petit','P250'],['Manon','Durand','P250'],
    ['Jules','Leroy','P50'],['Camille','Moreau','P50'],['Arthur','Simon','P50'],['Inès','Laurent','P25'],
    ['Tom','Lefebvre','P25'],['Sarah','Michel','P25']];
  i int;
  v_today date := app_private._today();
  v_att jsonb;
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  if exists (select 1 from public.groups where owner_id = v_uid) then
    raise exception 'Des données existent déjà : la démo n''est chargée que sur une base vide';
  end if;

  for i in 1 .. array_length(names, 1) loop
    insert into public.players(first_name, last_name, level, phone)
    values (names[i][1], names[i][2], names[i][3], '06 ' || lpad((10 + i)::text, 2, '0') || ' 00 00 00')
    returning id into v_id;
    p := p || v_id;
  end loop;

  insert into public.groups(name, level, weekday, start_time, end_time, capacity, color)
  values ('Perf P100 – Lundi', 'P100', 1, '19:00', '20:30', 4, '#7C3AED') returning id into g1;
  insert into public.groups(name, level, weekday, start_time, end_time, capacity, color)
  values ('Objectif P250', 'P250', 3, '20:00', '21:30', 4, '#DB2777') returning id into g2;
  insert into public.groups(name, level, weekday, start_time, end_time, capacity, color)
  values ('Progression P50', 'P50', 4, '18:30', '20:00', 4, '#0EA5E9') returning id into g3;
  insert into public.groups(name, level, weekday, start_time, end_time, capacity, color)
  values ('Initiation P25 – Samedi', 'P25', 6, '10:00', '11:30', 4, '#16A34A') returning id into g4;

  insert into public.group_memberships(group_id, player_id, joined_on)
  select g1, unnest(p[1:4]), v_today - 70 union all
  select g2, unnest(p[5:8]), v_today - 70 union all
  select g2, p[1], v_today - 70 union all          -- Lucas joue aussi en P250
  select g3, unnest(p[9:11]), v_today - 70 union all
  select g4, unnest(p[12:14]), v_today - 70;

  -- Forfaits
  for i in 1 .. array_length(p, 1) loop
    insert into public.packages(player_id, label, total_credits, price, purchased_on)
    values (p[i], case when i = 1 then 'Forfait 20 séances' else 'Forfait 10 séances' end,
            case when i = 1 then 20 else 10 end, case when i = 1 then 480 else 250 end, v_today - 70);
  end loop;
  insert into public.packages(player_id, label, total_credits, price, purchased_on)
  values (p[5], 'Forfait 5 séances', 5, 135, v_today - 10);

  -- Cycles : démarrés il y a ~8 semaines, 6 semaines, 9 semaines, à venir
  perform public.create_cycle(g1, 10, v_today - 56, 'Cycle automne');
  perform public.create_cycle(g2, 10, v_today - 42, null);
  perform public.create_cycle(g3, 10, v_today - 63, null);
  perform public.create_cycle(g4, 5,  v_today - 14, 'Cycle découverte');

  -- Valide les séances passées (sauf la plus récente de chaque groupe, laissée « à valider »)
  for s in
    select x.*, row_number() over (partition by x.group_id order by x.session_date desc) as rn_desc
    from public.sessions x where x.owner_id = v_uid and x.session_date < v_today
  loop
    if s.rn_desc = 1 then continue; end if;
    select jsonb_agg(jsonb_build_object(
             'player_id', m.player_id,
             'status', case when (abs(hashtext(m.player_id::text || s.id::text)) % 9) = 0 then 'absent'
                            when (abs(hashtext(m.player_id::text || s.id::text)) % 11) = 0 then 'excused'
                            else 'present' end,
             'consume_credit', (abs(hashtext(m.player_id::text || s.id::text)) % 11) <> 0,
             'is_guest', false))
      into v_att
    from public.group_memberships m where m.group_id = s.group_id and m.left_on is null;
    perform public.validate_session(gen_random_uuid(), s.id, v_att, null, null);
  end loop;

  -- Une séance annulée avec remplacement en fin de cycle (groupe P50, semaine prochaine)
  select id into v_id from public.sessions
  where group_id = g3 and status = 'planned' and session_date >= v_today order by session_date limit 1;
  if v_id is not null then
    perform public.cancel_session(gen_random_uuid(), v_id, 'Terrain indisponible', true);
  end if;

  -- Une séance exceptionnelle non comptée dans le cycle
  perform public.add_session(g2, app_private._next_weekday(v_today + 1, 5), '19:00', '20:30',
                             'exceptional', false, null, 'Séance bonus avant tournoi');

  return jsonb_build_object('status','ok','players', array_length(p,1), 'groups', 4);
end $$;

-- Supprime toutes les données du coach connecté (réglages > réinitialiser)
create or replace function public.delete_all_my_data()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Connexion requise'; end if;
  delete from public.operation_requests where owner_id = v_uid;
  delete from public.session_revisions where owner_id = v_uid;
  delete from public.credit_transactions where owner_id = v_uid;
  delete from public.packages where owner_id = v_uid;
  delete from public.session_attendances where owner_id = v_uid;
  delete from public.sessions where owner_id = v_uid;
  delete from public.group_cycles where owner_id = v_uid;
  delete from public.group_memberships where owner_id = v_uid;
  delete from public.groups where owner_id = v_uid;
  delete from public.players where owner_id = v_uid;
end $$;

-- ---------------------------------------------------------------------
-- 7. Droits d'exécution
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public','app_private')
             and p.proname in ('create_cycle','renew_cycle','add_session','reschedule_session','cancel_session',
                               'restore_session','update_future_recurrence','pause_group','validate_session',
                               'correct_session','reopen_session','move_player','archive_group','adjust_credits',
                               'delete_package','seed_demo_data','delete_all_my_data',
                               '_today','_now_local_time','_next_weekday','_op_begin','_op_end','_log_revision',
                               '_apply_credit','_write_attendances','_next_slot_after_cycle')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- Recharge le cache de l'API Supabase
notify pgrst, 'reload schema';
