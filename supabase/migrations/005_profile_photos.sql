-- =====================================================================
-- PADEL COACH HUB – Migration 005 : photos de profil
-- AJOUTS UNIQUEMENT. Ré-exécutable sans risque. Prérequis : migration 003.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

-- Chemin de la photo dans le stockage privé « community » (<coach>/<utilisateur>/avatar-….jpg)
alter table public.profiles add column if not exists avatar_path text;

-- Nom affiché : nom choisi, sinon prénom + nom de la fiche joueur, sinon « Coach » / « Joueur »
create or replace function app_private.display_name_of(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim(pr.display_name), ''),
    (select nullif(trim(p.first_name || ' ' || p.last_name), '') from public.players p where p.user_id = pr.id),
    case when pr.role = 'coach' then 'Coach' else 'Joueur' end)
  from public.profiles pr where pr.id = p_user
$$;

-- Enregistre (ou retire) sa propre photo de profil
create or replace function public.set_avatar(p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_coach uuid;
begin
  select coach_id into v_coach from public.profiles where id = v_uid;
  if v_coach is null then raise exception 'Profil introuvable'; end if;
  if p_path is not null and p_path not like v_coach::text || '/' || v_uid::text || '/%' then
    raise exception 'Emplacement de photo invalide';
  end if;
  update public.profiles set avatar_path = p_path where id = v_uid;
end $$;

-- Mon profil : ajoute la photo
create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when pr.id is null then null else jsonb_build_object(
    'id', pr.id, 'role', pr.role, 'coach_id', pr.coach_id,
    'display_name', app_private.display_name_of(pr.id), 'avatar_path', pr.avatar_path,
    'player_id', (select p.id from public.players p where p.user_id = pr.id)) end
  from (select auth.uid() as uid) x
  left join public.profiles pr on pr.id = x.uid
$$;

-- Fil d'actualité : nom complet + photo de l'auteur (publications et commentaires)
create or replace function public.get_feed(p_limit int default 20, p_before timestamptz default null, p_author uuid default null)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by (x->>'pinned')::boolean desc, x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'author_id', p.author_id, 'author_name', app_private.display_name_of(p.author_id),
      'author_avatar', pr.avatar_path, 'author_role', pr.role, 'kind', p.kind, 'body', p.body, 'photos', p.photos, 'meta', p.meta,
      'pinned', p.pinned, 'highlighted', p.highlighted, 'hidden', p.hidden, 'created_at', p.created_at,
      'reactions', (select coalesce(jsonb_object_agg(z.emoji, z.n), '{}'::jsonb)
                    from (select r.emoji, count(*) n from public.post_reactions r where r.post_id = p.id group by r.emoji) z),
      'my_reactions', (select coalesce(jsonb_agg(r.emoji), '[]'::jsonb) from public.post_reactions r where r.post_id = p.id and r.user_id = auth.uid()),
      'comments', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'author_id', c.author_id,
                      'author_name', app_private.display_name_of(c.author_id), 'author_avatar', cp.avatar_path,
                      'author_role', cp.role, 'body', c.body, 'hidden', c.hidden, 'created_at', c.created_at) order by c.created_at), '[]'::jsonb)
                   from public.post_comments c left join public.profiles cp on cp.id = c.author_id where c.post_id = p.id)
    ) as x
    from public.posts p left join public.profiles pr on pr.id = p.author_id
    where (p_before is null or (p.created_at < p_before and not p.pinned))
      and (p_author is null or p.author_id = p_author)
    order by case when p_before is null then p.pinned else false end desc, p.created_at desc
    limit least(coalesce(p_limit, 20), 50)
  ) s
$$;

revoke execute on function public.set_avatar(text), app_private.display_name_of(uuid) from public, anon;
grant execute on function public.set_avatar(text), app_private.display_name_of(uuid) to authenticated;

notify pgrst, 'reload schema';
