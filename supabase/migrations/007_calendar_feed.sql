-- =====================================================================
-- PADEL COACH HUB – Migration 007 : abonnement agenda (iPhone, Google…)
-- Un lien secret par coach : l'app Calendrier du téléphone lit le planning
-- (collectifs + indivs des calendriers externes). AJOUTS UNIQUEMENT.
-- Ré-exécutable sans risque.
-- =====================================================================

set client_min_messages = warning;

create table if not exists public.calendar_feeds (
  owner_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token             text not null unique,
  include_external  boolean not null default true,
  created_at        timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
drop policy if exists owner_all on public.calendar_feeds;
create policy owner_all on public.calendar_feeds for all to authenticated
  using (owner_id = auth.uid() and (select app_private.is_coach()))
  with check (owner_id = auth.uid() and (select app_private.is_coach()));
revoke all on public.calendar_feeds from anon;
grant select, update on public.calendar_feeds to authenticated;

-- Crée (ou remplace, ce qui coupe l'ancien lien) le lien secret du coach
create or replace function public.regenerate_calendar_feed()
returns text language plpgsql security definer set search_path = public as $$
declare v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null or not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  insert into public.calendar_feeds(owner_id, token) values (auth.uid(), v_token)
  on conflict (owner_id) do update set token = excluded.token, created_at = now();
  return v_token;
end $$;
revoke all on function public.regenerate_calendar_feed() from public, anon;
grant execute on function public.regenerate_calendar_feed() to authenticated;

-- Lecture du planning par le lien secret (appelée par le serveur de l'appli)
create or replace function public.calendar_feed(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.calendar_feeds;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into f from public.calendar_feeds where token = p_token;
  if not found then return null; end if;
  return jsonb_build_object(
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'date', s.session_date, 'start', s.start_time, 'end', s.end_time,
        'group', g.name, 'level', g.level, 'location', g.location, 'kind', s.kind,
        'theme', s.notes, 'updated_at', s.updated_at) order by s.session_date, s.start_time)
      from public.sessions s join public.groups g on g.id = s.group_id
      where s.owner_id = f.owner_id and s.status <> 'cancelled' and g.status <> 'archived'
        and s.session_date between current_date - 60 and current_date + 400), '[]'::jsonb),
    'calendars', case when f.include_external then coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'url', c.url, 'filter', c.filter))
      from public.external_calendars c where c.owner_id = f.owner_id and c.enabled), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

notify pgrst, 'reload schema';
