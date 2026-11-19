-- =====================================================================
-- PADEL COACH HUB – 011 : CALENDRIER DES TOURNOIS FFT (Ten'Up)
-- Additive uniquement : n'efface et ne modifie aucune donnée existante.
--   • relie un tournoi suivi à sa fiche Ten'Up (fft_id, fft_url)
--   • réglages d'import du coach (activer / désactiver, zone de recherche)
--   • « qui de mon groupe y va ? » (prénoms seulement, même coach)
-- Le calendrier lui-même n'est pas stocké : il est lu sur Ten'Up par le
-- serveur de l'app (mis en cache quelques heures).
-- Réexécutable sans risque.
-- =====================================================================

-- 1. Lien tournoi suivi <-> fiche Ten'Up -------------------------------
alter table public.tournaments add column if not exists fft_id  text;
alter table public.tournaments add column if not exists fft_url text;
create unique index if not exists tournaments_player_fft_uidx
  on public.tournaments(player_id, fft_id) where fft_id is not null;
create index if not exists tournaments_owner_fft_idx
  on public.tournaments(owner_id, fft_id) where fft_id is not null;

-- La vue coach reprend toutes les colonnes (dont les nouvelles)
drop view if exists public.v_tournaments;
create view public.v_tournaments with (security_invoker = true) as
select t.*, p.first_name as player_first_name, p.last_name as player_last_name, p.level as player_level
from public.tournaments t join public.players p on p.id = t.player_id;
grant select on public.v_tournaments to authenticated;
revoke all on public.v_tournaments from anon;

-- 2. Réglages d'import (un par coach) ------------------------------------
create table if not exists public.fft_settings (
  owner_id     uuid primary key references auth.users(id) on delete cascade,
  enabled      boolean not null default true,
  center_label text    not null default 'Toulouse',
  lat          double precision not null default 43.604652,
  lng          double precision not null default 1.444209,
  radius_km    int     not null default 150 check (radius_km between 10 and 400),
  updated_at   timestamptz not null default now()
);
alter table public.fft_settings enable row level security;
drop policy if exists fft_settings_coach on public.fft_settings;
create policy fft_settings_coach on public.fft_settings for all to authenticated
  using (owner_id = auth.uid() and (select app_private.is_coach()))
  with check (owner_id = auth.uid() and (select app_private.is_coach()));
revoke all on public.fft_settings from anon;
grant select, insert, update on public.fft_settings to authenticated;

-- Réglages effectifs pour l'utilisateur connecté (coach ou joueur) :
-- valeurs par défaut si le coach n'a encore rien enregistré.
create or replace function public.fft_my_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (
    select case when app_private.is_coach() then auth.uid() else app_private.my_coach_id() end as coach
  )
  select case when c.coach is null then null else jsonb_build_object(
    'enabled',      coalesce(s.enabled, true),
    'center_label', coalesce(s.center_label, 'Toulouse'),
    'lat',          coalesce(s.lat, 43.604652),
    'lng',          coalesce(s.lng, 1.444209),
    'radius_km',    coalesce(s.radius_km, 150)
  ) end
  from c left join public.fft_settings s on s.owner_id = c.coach
$$;
revoke all on function public.fft_my_settings() from public, anon;
grant execute on function public.fft_my_settings() to authenticated;

-- Enregistrement des réglages (coach uniquement)
create or replace function public.fft_save_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not app_private.is_coach() then raise exception 'Réservé au coach'; end if;
  insert into public.fft_settings as s (owner_id, enabled, center_label, lat, lng, radius_km, updated_at)
  values (auth.uid(), coalesce((p->>'enabled')::boolean, true), coalesce(nullif(p->>'center_label', ''), 'Toulouse'),
          coalesce((p->>'lat')::double precision, 43.604652), coalesce((p->>'lng')::double precision, 1.444209),
          coalesce((p->>'radius_km')::int, 150), now())
  on conflict (owner_id) do update set enabled = excluded.enabled, center_label = excluded.center_label,
    lat = excluded.lat, lng = excluded.lng, radius_km = excluded.radius_km, updated_at = now();
  return public.fft_my_settings();
end $$;
revoke all on function public.fft_save_settings(jsonb) from public, anon;
grant execute on function public.fft_save_settings(jsonb) to authenticated;

-- 3. Qui de mon groupe participe à ces tournois Ten'Up ? -----------------
-- p_ids : tableau JSON d'identifiants Ten'Up. Renvoie { fft_id: ["Lucas", "Emma"] }.
-- Seulement les joueurs du même coach, prénom + initiale, tournois non annulés.
create or replace function public.fft_participants(p_ids jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (
    select case when app_private.is_coach() then auth.uid() else app_private.my_coach_id() end as coach
  ), ids as (
    select jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) as id limit 500
  )
  select coalesce(jsonb_object_agg(x.fft_id, x.names), '{}'::jsonb) from (
    select t.fft_id, jsonb_agg(distinct (p.first_name || coalesce(' ' || left(p.last_name, 1) || '.', ''))) as names
    from public.tournaments t
    join public.players p on p.id = t.player_id
    join c on t.owner_id = c.coach
    where t.fft_id in (select id from ids) and t.status <> 'cancelled'
    group by t.fft_id
  ) x
$$;
revoke all on function public.fft_participants(jsonb) from public, anon;
grant execute on function public.fft_participants(jsonb) to authenticated;

notify pgrst, 'reload schema';
