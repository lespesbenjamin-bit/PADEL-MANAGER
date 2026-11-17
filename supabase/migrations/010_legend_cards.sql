-- =====================================================================
-- PADEL COACH HUB – Migration 010 : PADEL LEGENDS « La collection des 20 »
-- Les mascottes deviennent 20 cartes sportives (Bronze → Légendaire).
-- • Les seuils d'XP sont IDENTIQUES : aucun niveau, aucun XP, aucun Coin,
--   aucun crédit, aucune commande n'est modifié.
-- • Sauvegarde automatique de l'ancien référentiel (app_private.backup_mascot_levels_010)
--   et script d'annulation fourni : 010_rollback_legend_cards.sql
-- • Ajoute : carte favorite, animation de déblocage, partage sur le fil, récompenses numériques.
-- Ré-exécutable sans risque.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

-- 1. Sauvegardes (créées une seule fois, jamais écrasées)
create table if not exists app_private.backup_mascot_levels_010 as table public.mascot_levels;
create table if not exists app_private.backup_gami_profiles_010 as
  select player_id, total_xp, level, prestige, now() as saved_at from public.player_gamification_profiles;

-- 2. Raretés des cartes (les anciennes valeurs restent acceptées pour permettre l'annulation)
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.mascot_levels'::regclass and contype = 'c' loop
    execute format('alter table public.mascot_levels drop constraint %I', c);
  end loop;
end $$;
alter table public.mascot_levels add constraint mascot_levels_rarity_chk
  check (rarity in ('bronze','argent','or','platine','legendaire','commun','peu_commun','rare','epique','mythique'));
alter table public.mascot_levels add column if not exists punchline text;
alter table public.mascot_levels add column if not exists perks jsonb not null default '[]';

-- 3. Le référentiel unique des 20 cartes (mêmes seuils qu'avant)
insert into public.mascot_levels(level, status, mascot, slug, xp_required, rarity, emoji, description, punchline, perks) values
 (1,'Le Touriste','Le Touriste','le-touriste',0,'bronze','🃏','Il est venu voir. Il est resté pour l’apéro.','Il est venu voir. Il est resté pour l’apéro.','[]'::jsonb),
 (2,'Le Joueur du dimanche','Le Joueur du dimanche','le-joueur-du-dimanche',40,'bronze','🃏','Disponible tous les jours, sauf le dimanche.','Disponible tous les jours, sauf le dimanche.','[]'::jsonb),
 (3,'Le Roi de l’excuse','Le Roi de l’excuse','le-roi-de-lexcuse',90,'bronze','🃏','Aujourd’hui, c’est la faute des balles.','Aujourd’hui, c’est la faute des balles.','[]'::jsonb),
 (4,'Le Spécialiste du « J’ai ! »','Le Spécialiste du « J’ai ! »','le-specialiste-du-jai',150,'bronze','🃏','Il annonce tout. Même les balles de son partenaire.','Il annonce tout. Même les balles de son partenaire.','[{"code": "favorite", "label": "Choix de la carte favorite"}]'::jsonb),
 (5,'Le Bandeja Lover','Le Bandeja Lover','le-bandeja-lover',220,'argent','🃏','Une bandeja, même quand il fallait smasher.','Une bandeja, même quand il fallait smasher.','[]'::jsonb),
 (6,'Le Chasseur de grillage','Le Chasseur de grillage','le-chasseur-de-grillage',300,'argent','🃏','Il vise les angles. Surtout ceux du terrain voisin.','Il vise les angles. Surtout ceux du terrain voisin.','[]'::jsonb),
 (7,'Le Stratège du banc','Le Stratège du banc','le-stratege-du-banc',390,'argent','🃏','Il a toujours la solution. Après le match.','Il a toujours la solution. Après le match.','[]'::jsonb),
 (8,'Le Roi du troisième set','Le Roi du troisième set','le-roi-du-troisieme-set',490,'argent','🃏','Le problème, c’est d’arriver jusque-là.','Le problème, c’est d’arriver jusque-là.','[{"code": "frame_silver", "label": "Cadre de profil argenté"}]'::jsonb),
 (9,'Le Patron du filet','Le Patron du filet','le-patron-du-filet',600,'or','🃏','Il possède les lieux. Administrativement, non.','Il possède les lieux. Administrativement, non.','[]'::jsonb),
 (10,'Le Ministre des vitres','Le Ministre des vitres','le-ministre-des-vitres',730,'or','🃏','Responsable officiel des rebonds imprévisibles.','Responsable officiel des rebonds imprévisibles.','[]'::jsonb),
 (11,'Le Directeur des bandejas','Le Directeur des bandejas','le-directeur-des-bandejas',880,'or','🃏','Il a créé un département entier pour ce coup.','Il a créé un département entier pour ce coup.','[]'::jsonb),
 (12,'Le Président du tie-break','Le Président du tie-break','le-president-du-tie-break',1050,'or','🃏','Élu à l’unanimité. Par lui-même.','Élu à l’unanimité. Par lui-même.','[{"code": "title_gold", "label": "Titre communautaire Gold"}]'::jsonb),
 (13,'Le Parrain du 20×10','Le Parrain du 20×10','le-parrain-du-2010',1240,'platine','🃏','Rien ne se passe sur ce terrain sans qu’il le sache.','Rien ne se passe sur ce terrain sans qu’il le sache.','[]'::jsonb),
 (14,'Le PDG du Padel','Le PDG du Padel','le-pdg-du-padel',1450,'platine','🃏','Il ne joue plus. Il supervise les échanges.','Il ne joue plus. Il supervise les échanges.','[]'::jsonb),
 (15,'Le Prophète du Golden Point','Le Prophète du Golden Point','le-prophete-du-golden-point',1680,'platine','🃏','Il avait annoncé la victoire. À 0–5.','Il avait annoncé la victoire. À 0–5.','[]'::jsonb),
 (16,'Le Monarque du filet','Le Monarque du filet','le-monarque-du-filet',1930,'platine','🃏','Son royaume mesure exactement dix mètres de large.','Son royaume mesure exactement dix mètres de large.','[{"code": "frame_holo", "label": "Cadre holographique"}]'::jsonb),
 (17,'La Légende autoproclamée','La Légende autoproclamée','la-legende-autoproclamee',2190,'legendaire','🃏','Personne n’a confirmé. Personne n’ose contredire.','Personne n’a confirmé. Personne n’ose contredire.','[]'::jsonb),
 (18,'Le Dieu du double rebond','Le Dieu du double rebond','le-dieu-du-double-rebond',2450,'legendaire','🃏','Même la physique demande son autorisation.','Même la physique demande son autorisation.','[]'::jsonb),
 (19,'L’Empereur du 20×10','L’Empereur du 20×10','lempereur-du-2010',2720,'legendaire','🃏','Il a conquis quatre vitres et un grillage.','Il a conquis quatre vitres et un grillage.','[]'::jsonb),
 (20,'L’Immortel du Padel','L’Immortel du Padel','limmortel-du-padel',3000,'legendaire','🃏','Il était là avant la construction du club.','Il était là avant la construction du club.','[{"code": "ultimate", "label": "Carte ultime"}, {"code": "title_permanent", "label": "Titre permanent « L’Immortel du Padel »"}, {"code": "distinction", "label": "Distinction communautaire"}]'::jsonb)
on conflict (level) do update set status = excluded.status, mascot = excluded.mascot, slug = excluded.slug, xp_required = excluded.xp_required,
  rarity = excluded.rarity, emoji = excluded.emoji, description = excluded.description, punchline = excluded.punchline, perks = excluded.perks;

-- Vue lisible du référentiel (même source, aucune copie)
create or replace view public.legend_cards with (security_invoker = true) as
  select level, status as name, slug, xp_required, rarity, punchline, perks, image_url from public.mascot_levels;
grant select on public.legend_cards to authenticated;

-- 4. Carte favorite, déblocage vu, partage proposé
alter table public.player_gamification_profiles add column if not exists favorite_level int check (favorite_level between 1 and 20);
alter table public.player_gamification_profiles add column if not exists last_seen_level int;
alter table public.player_gamification_profiles add column if not exists last_shared_level int;
-- les niveaux déjà atteints avant la refonte ne déclenchent pas de proposition de publication
update public.player_gamification_profiles set last_shared_level = level where last_shared_level is null;

-- 5. Moteur XP : inchangé (barème, corrections, idempotence) ; seuls les textes de notification évoluent
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
    perform app_private.notify(pl.owner_id, pl.user_id, 'legends_level', 'Nouvelle carte débloquée : ' || v_lvl.status,
      'Niveau ' || v_level || ' atteint · « ' || v_lvl.description || ' »', '/legends');
  elsif v_existed and v_prest > v_old.prestige then
    perform app_private.notify(pl.owner_id, pl.user_id, 'legends_level', 'L''Immortel du Padel ' || repeat('★', v_prest),
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


-- 6. Carte favorite (uniquement une carte débloquée, à partir du niveau 4) ; ne change jamais le niveau réel
create or replace function public.gami_set_favorite(p_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid := app_private.my_player_id(); pr public.player_gamification_profiles;
begin
  if v_pid is null then raise exception 'Réservé aux joueurs'; end if;
  select * into pr from public.player_gamification_profiles where player_id = v_pid for update;
  if not found then raise exception 'Profil Padel Legends introuvable'; end if;
  if p_level is not null then
    if pr.level < 4 then raise exception 'Le choix de la carte favorite se débloque au niveau 4'; end if;
    if p_level < 1 or p_level > pr.level then raise exception 'Cette carte n''est pas encore débloquée'; end if;
  end if;
  update public.player_gamification_profiles set favorite_level = p_level where player_id = v_pid;
  return jsonb_build_object('favorite_level', p_level, 'level', pr.level);
end $$;
revoke all on function public.gami_set_favorite(int) from public, anon;
grant execute on function public.gami_set_favorite(int) to authenticated;

-- 7. Animation de déblocage vue
create or replace function public.gami_mark_seen(p_level int)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid := app_private.my_player_id();
begin
  if v_pid is null then return; end if;
  update public.player_gamification_profiles set last_seen_level = least(p_level, level)
  where player_id = v_pid and coalesce(last_seen_level, 0) < least(p_level, level);
end $$;
revoke all on function public.gami_mark_seen(int) from public, anon;
grant execute on function public.gami_mark_seen(int) to authenticated;

-- 8. Partage d'une nouvelle carte sur le fil : uniquement après confirmation du joueur, une seule fois par niveau
create or replace function public.gami_share_card(p_level int, p_publish boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pid uuid := app_private.my_player_id(); pr public.player_gamification_profiles; pl record; c public.mascot_levels; v_post uuid;
begin
  if v_pid is null then raise exception 'Réservé aux joueurs'; end if;
  select * into pr from public.player_gamification_profiles where player_id = v_pid for update;
  select id, owner_id, first_name into pl from public.players where id = v_pid;
  if p_level is null or p_level > pr.level then raise exception 'Cette carte n''est pas débloquée'; end if;
  if coalesce(pr.last_shared_level, 0) >= p_level then return jsonb_build_object('status', 'already'); end if;
  if p_publish then
    select * into c from public.mascot_levels where level = p_level;
    insert into public.posts(owner_id, author_id, kind, body, meta)
    values (pl.owner_id, auth.uid(), 'podium', pl.first_name || ' vient de débloquer ' || c.status || ' ! Niveau ' || p_level || ' atteint. 🃏',
            jsonb_build_object('legend_level', p_level))
    returning id into v_post;
  end if;
  update public.player_gamification_profiles set last_shared_level = p_level where player_id = v_pid;
  return jsonb_build_object('status', case when p_publish then 'published' else 'skipped' end, 'post_id', v_post);
end $$;
revoke all on function public.gami_share_card(int, boolean) from public, anon;
grant execute on function public.gami_share_card(int, boolean) to authenticated;

-- 9. Cartes affichées à côté des noms (fil, profil) : carte favorite ou carte actuelle, titres et cadres
drop function if exists public.gami_author_cards(uuid[]);
create or replace function public.gami_author_cards(p_users jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_owner uuid := case when app_private.is_coach() then auth.uid() else app_private.my_coach_id() end;
begin
  if auth.uid() is null or v_owner is null then return '[]'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'level', pg.level, 'prestige', pg.prestige,
           'favorite_level', case when pg.level >= 4 and pg.favorite_level <= pg.level then pg.favorite_level end,
           'card_level', case when pg.level >= 4 and pg.favorite_level <= pg.level then pg.favorite_level else pg.level end))
    from public.players p join public.player_gamification_profiles pg on pg.player_id = p.id
    where p.owner_id = v_owner and p.user_id::text in (select jsonb_array_elements_text(p_users))), '[]');
end $$;
revoke all on function public.gami_author_cards(jsonb) from public, anon;
grant execute on function public.gami_author_cards(jsonb) to authenticated;

notify pgrst, 'reload schema';
