-- =====================================================================
-- ANNULATION de la migration 010 (retour aux mascottes)
-- À n'utiliser qu'en cas de besoin. Les XP, niveaux, Coins, crédits et
-- commandes ne sont pas concernés (ils n'ont jamais été modifiés).
-- =====================================================================
set client_min_messages = warning;

do $$ begin
  if to_regclass('app_private.backup_mascot_levels_010') is null then
    raise exception 'Sauvegarde introuvable : rien à annuler';
  end if;
end $$;

update public.mascot_levels m set status = b.status, mascot = b.mascot, slug = b.slug, xp_required = b.xp_required,
  rarity = b.rarity, emoji = b.emoji, description = b.description, image_url = b.image_url
from app_private.backup_mascot_levels_010 b where b.level = m.level;

drop function if exists public.gami_set_favorite(int);
drop function if exists public.gami_mark_seen(int);
drop function if exists public.gami_share_card(int, boolean);
drop function if exists public.gami_author_cards(uuid[]);
drop function if exists public.gami_author_cards(jsonb);
drop view if exists public.legend_cards;
alter table public.player_gamification_profiles drop column if exists favorite_level;
alter table public.player_gamification_profiles drop column if exists last_seen_level;
alter table public.player_gamification_profiles drop column if exists last_shared_level;
alter table public.mascot_levels drop column if exists punchline;
alter table public.mascot_levels drop column if exists perks;

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


notify pgrst, 'reload schema';
