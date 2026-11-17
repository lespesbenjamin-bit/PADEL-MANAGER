-- =====================================================================
-- PADEL COACH HUB – ESPACE DE DÉMONSTRATION (coach + joueur)
-- Crée un univers fictif complet, séparé de tes vraies données :
--   • compte coach   : demo.coach@padelcoachhub.app
--   • compte joueur  : demo.joueur@padelcoachhub.app  (= Lucas Martin)
-- Les deux comptes doivent d'abord être créés dans
--   Supabase > Authentication > Users > Add user > Create new user
--   (mot de passe au choix, cocher « Auto Confirm User »).
-- Ce script peut être relancé autant de fois que voulu : il REMET LA DÉMO
-- À ZÉRO à chaque fois. Il ne touche jamais aux données d'un autre compte.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

do $$
declare
  c_email constant text := 'demo.coach@padelcoachhub.app';
  j_email constant text := 'demo.joueur@padelcoachhub.app';
  v_coach uuid; v_user uuid; t record; v_pass int; v_left int;
  v_today date := app_private._today();
  lucas uuid; nathan uuid; chloe uuid; emma uuid; manon uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; tn uuid; te uuid; tc uuid;
  p_ann uuid; p_res uuid; p_tr uuid; v_grip uuid; v_gourde uuid; v_tee uuid; v_order uuid; v_rows int;
begin
  -- -------------------------------------------------------------------
  -- 0. Comptes de démo et garde-fous
  -- -------------------------------------------------------------------
  select id into v_coach from auth.users where lower(email) = c_email;
  select id into v_user  from auth.users where lower(email) = j_email;
  if v_coach is null or v_user is null then
    raise exception 'Crée d''abord les 2 comptes dans Authentication > Users : % et %', c_email, j_email;
  end if;
  if exists (select 1 from public.profiles where coach_id = v_coach and id not in (v_coach, v_user)) then
    raise exception 'Sécurité : le compte % a des joueurs réels rattachés, la démo ne l''écrasera pas', c_email;
  end if;

  -- -------------------------------------------------------------------
  -- 1. Remise à zéro des données de démo (uniquement ces deux comptes)
  -- -------------------------------------------------------------------
  delete from public.posts where owner_id = v_coach;
  delete from public.tournaments where owner_id = v_coach;
  delete from public.players where owner_id = v_coach;
  for v_pass in 1 .. 6 loop
    v_left := 0;
    for t in select c.table_name from information_schema.columns c join information_schema.tables tb
               on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
             where c.table_schema = 'public' and c.column_name = 'owner_id' and c.table_name <> 'profiles' loop
      begin
        execute format('delete from public.%I where owner_id = any($1)', t.table_name) using array[v_coach, v_user];
      exception when foreign_key_violation then v_left := v_left + 1;
      end;
    end loop;
    exit when v_left = 0;
  end loop;
  delete from public.notifications where user_id in (v_coach, v_user);

  insert into public.profiles(id, role, coach_id, display_name, consent_at, consent_version)
  values (v_coach, 'coach', v_coach, 'Coach Ben (démo)', now(), '2026-11')
  on conflict (id) do update set role = 'coach', coach_id = v_coach, display_name = 'Coach Ben (démo)', consent_at = now(), consent_version = '2026-11';
  insert into public.profiles(id, role, coach_id, display_name, consent_at, consent_version)
  values (v_user, 'player', v_coach, null, now(), '2026-11')
  on conflict (id) do update set role = 'player', coach_id = v_coach, display_name = null, consent_at = now(), consent_version = '2026-11';

  -- on agit désormais « en tant que » coach de démo
  perform set_config('request.jwt.claim.sub', v_coach::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach, 'role', 'authenticated')::text, true);

  -- -------------------------------------------------------------------
  -- 2. Collectif : 14 joueurs, 4 groupes, cycles, forfaits, séances validées
  -- -------------------------------------------------------------------
  perform public.seed_demo_data();
  update public.groups set location = 'Ace Padel Club · Colomiers' where owner_id = v_coach;
  select id into lucas  from public.players where owner_id = v_coach and first_name = 'Lucas';
  select id into nathan from public.players where owner_id = v_coach and first_name = 'Nathan';
  select id into chloe  from public.players where owner_id = v_coach and first_name = 'Chloé';
  select id into emma   from public.players where owner_id = v_coach and first_name = 'Emma';
  select id into manon  from public.players where owner_id = v_coach and first_name = 'Manon';

  -- le compte joueur de démo devient Lucas Martin
  update public.players set user_id = v_user, linked_at = now(), email = j_email where id = lucas;

  -- -------------------------------------------------------------------
  -- 3. Tournois : calendrier, débriefings, accompagnement, validations XP
  -- -------------------------------------------------------------------
  insert into public.tournaments(owner_id, player_id, name, start_date, end_date, club, city, category, partner_name, status, result_rank,
         matches_played, wins, losses, player_comment, created_by)
  values (v_coach, lucas, 'Open Ace Padel', v_today - 40, v_today - 39, 'Ace Padel Club', 'Colomiers', 'P100', 'Hugo Dubois', 'done', 'Vainqueur', 5, 5, 0, 'Super week-end !', v_user)
  returning id into t1;
  insert into public.tournaments(owner_id, player_id, name, start_date, end_date, club, city, category, partner_name, status, result_rank,
         matches_played, wins, losses, created_by)
  values (v_coach, lucas, 'Tournoi de Colomiers', v_today - 19, v_today - 18, 'Padel Colomiers', 'Colomiers', 'P250', 'Nathan Robert', 'done', '1/2 finale', 4, 3, 1, v_user)
  returning id into t2;
  insert into public.tournaments(owner_id, player_id, name, start_date, end_date, club, city, category, partner_name, status, result_rank,
         matches_played, wins, losses, created_by)
  values (v_coach, lucas, 'P250 Toulouse Indoor', v_today - 5, v_today - 4, 'Toulouse Padel Indoor', 'Toulouse', 'P250', 'Nathan Robert', 'done', '1/4 de finale', 3, 2, 1, v_user)
  returning id into t3;
  insert into public.tournaments(owner_id, player_id, name, start_date, end_date, club, city, category, partner_name, status, goal,
         coaching_request, coaching_status, created_by)
  values (v_coach, lucas, 'P250 Balma', v_today + 12, v_today + 13, 'Balma Padel', 'Balma', 'P250', 'Nathan Robert', 'registered',
          'Passer les poules et gagner un match en tableau', true, 'requested', v_user)
  returning id into t4;
  insert into public.tournaments(owner_id, player_id, name, start_date, club, city, category, status, result_rank, created_by)
  values (v_coach, nathan, 'Tournoi de Colomiers', v_today - 19, 'Padel Colomiers', 'Colomiers', 'P250', 'done', '1/2 finale', v_coach) returning id into tn;
  insert into public.tournaments(owner_id, player_id, name, start_date, club, city, category, status, result_rank, created_by)
  values (v_coach, emma, 'Challenge Blagnac', v_today - 26, 'Blagnac Padel', 'Blagnac', 'P100', 'done', 'Finaliste', v_coach) returning id into te;
  insert into public.tournaments(owner_id, player_id, name, start_date, club, city, category, status, result_rank, created_by)
  values (v_coach, chloe, 'P250 Toulouse Indoor', v_today - 5, 'Toulouse Padel Indoor', 'Toulouse', 'P250', 'done', 'Phase de poules', v_coach) returning id into tc;
  insert into public.tournaments(owner_id, player_id, name, start_date, club, city, category, status, created_by)
  values (v_coach, manon, 'Open de Muret', v_today + 20, 'Muret Padel', 'Muret', 'P100', 'registered', v_coach),
         (v_coach, emma, 'P250 Balma', v_today + 12, 'Balma Padel', 'Balma', 'P250', 'confirmed', v_coach);

  -- débriefings saisis par le joueur
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  update public.tournaments set debrief_back_score = 4, debrief_net_score = 5, debrief_satisfaction = 5,
    debrief_difficulties = 'Un peu tendu au début de la finale, beaucoup de fautes directes en retour.',
    debrief_positives = 'Très bonne volée et bonnes bandejas, on a bien communiqué avec Hugo.' where id = t1;
  update public.tournaments set debrief_back_score = 3, debrief_net_score = 4, debrief_satisfaction = 4,
    debrief_difficulties = 'Les lobs adverses m''ont mis en difficulté en demi.',
    debrief_positives = 'Premier dernier carré en P250 !' where id = t2;
  update public.tournaments set debrief_back_score = 2, debrief_net_score = 3, debrief_satisfaction = 3,
    debrief_difficulties = 'Sortie de vitre compliquée, je recule trop.',
    debrief_positives = 'Bon mental malgré la défaite, j''ai tenu le rythme.' where id = t3;

  -- retours et validations du coach (attribuent les XP)
  perform set_config('request.jwt.claim.sub', v_coach::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach, 'role', 'authenticated')::text, true);
  update public.tournaments set coach_feedback = 'Bravo Lucas ! Le travail au filet paie. On continue sur le retour de service.', coach_reviewed_at = now() where id = t1;
  update public.tournaments set coach_feedback = 'Très belle perf. On va travailler la défense sur lob mercredi.', coach_reviewed_at = now() where id = t2;
  perform public.gami_validate_tournament(gen_random_uuid(), t1, 'Vainqueur', 'P100');
  perform public.gami_validate_tournament(gen_random_uuid(), t2, '1/2 finale', 'P250');
  perform public.gami_validate_tournament(gen_random_uuid(), tn, '1/2 finale', 'P250');
  perform public.gami_validate_tournament(gen_random_uuid(), te, 'Finaliste', 'P100');
  -- t3 (Lucas) et tc (Chloé) restent « à valider » pour la démonstration côté coach

  -- -------------------------------------------------------------------
  -- 4. Pédagogie : exercices partagés aux groupes
  -- -------------------------------------------------------------------
  insert into public.exercises(owner_id, title, objective, category, subcategory, level, players_count, duration_min, organisation, instructions, success_criteria, visibility)
  values
   (v_coach, 'Bandeja de contrôle', 'Garder le filet sur un lob adverse', 'technique', 'Bandeja', 'P100', 4, 15,
    'Coach au fond qui lobe, 2 joueurs au filet', 'Reculer en pas chassés, frapper sur le côté, revenir au filet', '7 bandejas sur 10 au-delà du carré de service', 'groups'),
   (v_coach, 'Sortie de vitre en défense', 'Neutraliser une balle qui sort de la vitre de fond', 'technique', 'Vitre', 'P250', 4, 20,
    'Balles lancées vers la vitre de fond', 'Se placer tôt, laisser rebondir, accompagner vers le haut', '6 balles sur 10 jouées au centre', 'groups'),
   (v_coach, 'Match à thème : prise du filet', 'Gagner le point en montant au filet', 'tactique', 'Transition', 'P100', 4, 25,
    'Match en 2 jeux gagnants', 'Un point gagné au filet compte double', 'Au moins 50 % des points gagnés au filet', 'groups');
  -- partagés à tous les groupes (visibles par les joueurs)
  insert into public.exercise_shares(exercise_id, group_id, owner_id)
  select e.id, g.id, v_coach from public.exercises e cross join public.groups g where e.owner_id = v_coach and g.owner_id = v_coach;

  -- -------------------------------------------------------------------
  -- 5. Communauté : annonce, publication de résultat, commentaires, réactions
  -- -------------------------------------------------------------------
  insert into public.posts(owner_id, author_id, kind, body, pinned, created_at)
  values (v_coach, v_coach, 'announcement', 'Bienvenue sur Padel Coach Hub 🎾 Retrouvez ici vos séances, vos crédits, vos tournois, Padel Legends et la boutique. Pensez à débriefer vos tournois !', true, now() - interval '9 days')
  returning id into p_ann;
  insert into public.posts(owner_id, author_id, kind, body, created_at)
  values (v_coach, v_coach, 'training', 'Thème de la semaine : la défense sur lob et la reprise du filet. Venez avec de l''énergie 💪', now() - interval '2 days')
  returning id into p_tr;
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  insert into public.posts(owner_id, author_id, kind, body, tournament_id, meta, created_at)
  values (v_coach, v_user, 'result', 'Demi-finale au Tournoi de Colomiers en P250 avec Nathan ! Merci coach pour la préparation 🔥', t2,
          jsonb_build_object('name', 'Tournoi de Colomiers', 'category', 'P250', 'result', '1/2 finale'), now() - interval '17 days')
  returning id into p_res;
  insert into public.post_reactions(post_id, user_id, emoji, owner_id) values (p_ann, v_user, '👍', v_coach), (p_tr, v_user, '💪', v_coach);
  perform set_config('request.jwt.claim.sub', v_coach::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach, 'role', 'authenticated')::text, true);
  insert into public.post_comments(owner_id, post_id, author_id, body, created_at)
  values (v_coach, p_res, v_coach, 'Énorme Lucas ! Prochaine étape : la finale 😉', now() - interval '17 days' + interval '2 hours');
  insert into public.post_reactions(post_id, user_id, emoji, owner_id) values (p_res, v_coach, '🔥', v_coach);

  -- -------------------------------------------------------------------
  -- 6. Shop & Padel Coins : réglages, produits, Coins, commandes
  -- -------------------------------------------------------------------
  perform public.shop_save_settings(jsonb_build_object('enabled', true, 'start_date', v_today - 90, 'court_cost_per_hour', 20,
          'urssaf_pct', 25.8, 'rate_pct', 5, 'safety_margin_pct', 20));
  perform public.shop_add_starter_products();
  update public.shop_products set unit_cost = 1.20, extra_cost = 0.30, price_coins = 36, stock = 30, active = true where owner_id = v_coach and name = 'Surgrip personnalisé' returning id into v_grip;
  update public.shop_products set unit_cost = 6, extra_cost = 2, price_coins = 192, stock = 10, active = true where owner_id = v_coach and name = 'Serviette';
  update public.shop_products set unit_cost = 7, extra_cost = 2, price_coins = 216, stock = 8, active = true where owner_id = v_coach and name = 'Gourde' returning id into v_gourde;
  update public.shop_products set unit_cost = 9, extra_cost = 3, price_coins = 288, stock = null, min_level = 5, active = true where owner_id = v_coach and name = 'T-shirt ambassadeur' returning id into v_tee;
  insert into public.shop_product_variants(owner_id, product_id, label, stock, sort) values (v_coach, v_tee, 'S', 2, 1), (v_coach, v_tee, 'M', 3, 2), (v_coach, v_tee, 'L', 1, 3);
  update public.shop_products set unit_cost = 0, price_coins = 150, active = true where owner_id = v_coach and name = 'Analyse vidéo d''un match';
  update public.shop_products set unit_cost = 10, price_coins = 240, stock = 6, active = true where owner_id = v_coach and name = 'Place pour un événement';
  perform public.shop_adjust_coins(gen_random_uuid(), lucas, 200, 'Bonus de bienvenue (démonstration)');

  -- commandes de Lucas : un surgrip déjà remis, une gourde en attente de validation
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  v_order := (public.shop_place_order(gen_random_uuid(), v_grip) ->> 'order_id')::uuid;
  begin
    perform public.shop_place_order(gen_random_uuid(), v_gourde);
  exception when others then null;   -- si le solde ne suffit pas, la démo continue sans cette commande
  end;
  perform set_config('request.jwt.claim.sub', v_coach::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_coach, 'role', 'authenticated')::text, true);
  perform public.shop_update_order(gen_random_uuid(), v_order, 'validated');
  perform public.shop_update_order(gen_random_uuid(), v_order, 'delivered');

  -- -------------------------------------------------------------------
  -- 7. Padel Legends : recalcul complet (séances, séries, tournois, badges)
  -- -------------------------------------------------------------------
  perform public.gami_recalculate_all();

  raise notice 'Démo prête : coach % / joueur % (Lucas Martin)', c_email, j_email;
end $$;
