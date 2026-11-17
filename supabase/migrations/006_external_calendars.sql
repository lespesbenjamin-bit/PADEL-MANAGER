-- =====================================================================
-- PADEL COACH HUB – Migration 006 : calendriers externes (ex. BookMyCoach)
-- Le lien d'abonnement iCal est stocké ici (jamais dans le code), visible
-- uniquement par le coach. AJOUTS UNIQUEMENT. Ré-exécutable sans risque.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

create table if not exists public.external_calendars (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default 'BookMyCoach',
  url         text not null check (url ~* '^https?://'),
  color       text not null default '#0D9488',
  filter      text not null default 'all' check (filter in ('all','individual','hide_collective')),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.external_calendars enable row level security;
drop policy if exists owner_all on public.external_calendars;
create policy owner_all on public.external_calendars for all to authenticated
  using (owner_id = auth.uid() and (select app_private.is_coach()))
  with check (owner_id = auth.uid() and (select app_private.is_coach()));
revoke all on public.external_calendars from anon;
grant select, insert, update, delete on public.external_calendars to authenticated;

drop trigger if exists trg_extcal_touch on public.external_calendars;
create trigger trg_extcal_touch before update on public.external_calendars
for each row execute function app_private._touch_updated_at();

notify pgrst, 'reload schema';
