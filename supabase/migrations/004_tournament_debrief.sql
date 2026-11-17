-- =====================================================================
-- PADEL COACH HUB – Migration 004 : débriefing des tournois
-- Notes 1 à 5 (jeu depuis le fond, jeu devant, satisfaction globale),
-- difficultés, points positifs, retour du coach.
-- AJOUTS UNIQUEMENT. Ré-exécutable sans risque. Prérequis : migration 003.
-- À exécuter dans Supabase > SQL Editor > New query > Run
-- =====================================================================

set client_min_messages = warning;

alter table public.tournaments add column if not exists debrief_back_score   smallint check (debrief_back_score between 1 and 5);   -- jeu depuis le fond
alter table public.tournaments add column if not exists debrief_net_score    smallint check (debrief_net_score between 1 and 5);    -- jeu devant (filet)
alter table public.tournaments add column if not exists debrief_satisfaction smallint check (debrief_satisfaction between 1 and 5); -- satisfaction globale
alter table public.tournaments add column if not exists debrief_difficulties text;   -- difficultés rencontrées
alter table public.tournaments add column if not exists debrief_positives    text;   -- ce qui a été bien ressenti
alter table public.tournaments add column if not exists debrief_at           timestamptz;
alter table public.tournaments add column if not exists coach_feedback       text;   -- retour du coach sur le débriefing
alter table public.tournaments add column if not exists coach_reviewed_at    timestamptz;

-- Règles de modification + notifications (remplace la version de la migration 003)
create or replace function app_private._tournament_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_coach boolean := app_private.is_coach(); v_user uuid; v_name text;
begin
  new.updated_at := now();
  if not v_coach then
    -- le joueur ne touche ni à la décision, ni à la note, ni au retour du coach
    if tg_op = 'INSERT' then
      new.coach_note := null; new.coach_feedback := null; new.coach_reviewed_at := null;
      new.coaching_status := case when new.coaching_request then 'requested' else 'none' end;
    else
      new.coach_note := old.coach_note; new.coach_feedback := old.coach_feedback; new.coach_reviewed_at := old.coach_reviewed_at;
      if new.coaching_request and not old.coaching_request then new.coaching_status := 'requested';
      elsif not new.coaching_request then new.coaching_status := 'none';
      else new.coaching_status := old.coaching_status; end if;
    end if;
    -- date du débriefing : posée dès qu'une note ou un commentaire est saisi
    if coalesce(new.debrief_back_score, new.debrief_net_score, new.debrief_satisfaction) is not null
       or coalesce(new.debrief_difficulties, new.debrief_positives) is not null then
      if tg_op = 'INSERT' or old.debrief_at is null then new.debrief_at := now(); end if;
      -- un débriefing modifié redevient « à lire » pour le coach
      if tg_op = 'UPDATE' and (new.debrief_back_score, new.debrief_net_score, new.debrief_satisfaction, new.debrief_difficulties, new.debrief_positives)
         is distinct from (old.debrief_back_score, old.debrief_net_score, old.debrief_satisfaction, old.debrief_difficulties, old.debrief_positives) then
        new.coach_reviewed_at := null;
      end if;
    end if;
  else
    if new.coach_feedback is distinct from (case when tg_op = 'UPDATE' then old.coach_feedback end) and new.coach_feedback is not null then
      new.coach_reviewed_at := coalesce(new.coach_reviewed_at, now());
    end if;
  end if;

  select user_id, first_name into v_user, v_name from public.players where id = new.player_id;

  if not v_coach and new.coaching_status = 'requested' and (tg_op = 'INSERT' or old.coaching_status <> 'requested') then
    perform app_private.notify(new.owner_id, new.owner_id, 'coaching_request', 'Demande d''accompagnement',
      v_name || ' · ' || new.name || ' (' || to_char(new.start_date, 'DD/MM') || ')', '/tournois?tab=follow');
  end if;
  if not v_coach and new.debrief_at is not null and (tg_op = 'INSERT' or old.debrief_at is null) then
    perform app_private.notify(new.owner_id, new.owner_id, 'tournament_debrief', 'Débriefing reçu',
      v_name || ' · ' || new.name || coalesce(' : ' || new.result_rank, '') ||
      coalesce(' · satisfaction ' || new.debrief_satisfaction || '/5', ''), '/tournois?tab=follow');
  elsif not v_coach and new.result_rank is not null and (tg_op = 'INSERT' or old.result_rank is distinct from new.result_rank) then
    perform app_private.notify(new.owner_id, new.owner_id, 'tournament_result', 'Nouveau résultat',
      v_name || ' · ' || new.name || ' : ' || new.result_rank, '/tournois');
  end if;
  if v_coach and tg_op = 'UPDATE' and new.coaching_status is distinct from old.coaching_status
     and new.coaching_status in ('accepted','declined') then
    perform app_private.notify(new.owner_id, v_user, 'coaching_answer',
      case when new.coaching_status = 'accepted' then 'Accompagnement accepté' else 'Accompagnement non disponible' end,
      new.name || coalesce(' · ' || new.coach_note, ''), '/tournois');
  end if;
  if v_coach and tg_op = 'UPDATE' and new.coach_feedback is not null and new.coach_feedback is distinct from old.coach_feedback then
    perform app_private.notify(new.owner_id, v_user, 'coach_feedback', 'Ton coach a répondu à ton débriefing',
      new.name || ' · ' || new.coach_feedback, '/tournois');
  end if;
  return new;
end $$;

-- La vue reprend toutes les colonnes (dont les nouvelles)
drop view if exists public.v_tournaments;
create view public.v_tournaments with (security_invoker = true) as
select t.*, p.first_name as player_first_name, p.last_name as player_last_name, p.level as player_level
from public.tournaments t join public.players p on p.id = t.player_id;
grant select on public.v_tournaments to authenticated;
revoke all on public.v_tournaments from anon;

notify pgrst, 'reload schema';
