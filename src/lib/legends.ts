/* PADEL LEGENDS – types, accès aux données (fonctions serveur Supabase) et présentation */
import { check, rpc } from "./api";
import { supabase } from "./supabase";

export type Rarity = "commun" | "peu_commun" | "rare" | "epique" | "legendaire" | "mythique";
export type XpSource = "session" | "streak" | "milestone" | "tournament" | "bonus" | "correction";

export interface MascotLevel {
  level: number; status: string; mascot: string; slug: string; xp_required: number; rarity: Rarity; emoji: string; description: string; image_url: string | null;
}
export interface GamiProfile {
  player_id: string; total_xp: number; level: number; prestige: number; current_streak: number; best_streak: number;
  sessions_count: number; active_months: number; tournaments_count: number; finals_count: number; wins_count: number;
  last_xp_at: string | null; hide_from_ranking: boolean;
}
export interface BadgeItem {
  code: string; name: string; description: string; category: "fidelite" | "regularite" | "competition"; icon: string;
  threshold: number; condition_type: string; earned_at: string | null;
}
export interface XpTx { id: string; source: XpSource; xp: number; label: string; reason: string | null; is_adjustment: boolean; occurred_on: string; created_at: string }
export interface XpRule { code: string; label: string; category: "session" | "streak" | "milestone" | "tournament"; xp: number; threshold: number | null; enabled?: boolean }
export interface Season { id: string; name: string; starts_on: string; ends_on: string; status?: "active" | "archived"; xp?: number }

export interface PlayerSpace {
  player: { id: string; name: string };
  profile: GamiProfile;
  levels: MascotLevel[];
  badges: BadgeItem[];
  history: XpTx[];
  season: Season & { xp: number };
  rules: XpRule[];
  neutral_rules: { auto: boolean; excused: boolean };
}
export interface RankRow {
  player_id: string; first_name: string; last_name: string; xp: number; rank: number; level: number; prestige?: number; streak?: number; is_me: boolean; hidden: boolean;
}
export interface CoachPlayer {
  id: string; first_name: string; last_name: string; linked: boolean; total_xp: number; level: number; prestige: number; current_streak: number; best_streak: number;
  sessions_count: number; tournaments_count: number; wins_count: number; hide_from_ranking: boolean; last_xp_at: string | null; season_xp: number; badges: number;
}
export interface PendingTournament {
  id: string; player_id: string; player: string; name: string; category: string; start_date: string; end_date: string | null; status: string;
  result_rank: string | null; xp_result: string | null; xp_category: string | null; xp_validated_at: string | null;
}
export interface GamiSettings {
  enabled: boolean; auto_neutral_weeks: boolean; excused_preserves_streak: boolean; category_tiers: Record<string, "t1" | "t2" | "t3">;
  disabled_badges: string[]; manual_max_xp: number;
}
export interface CoachOverview {
  season: Season;
  players: CoachPlayer[];
  pending_tournaments: PendingTournament[];
  validated_tournaments: { id: string; player: string; name: string; category: string; xp_category: string; xp_result: string; start_date: string; xp_validated_at: string }[];
  recent_badges: { earned_at: string; name: string; icon: string; code: string; player_id: string; player: string }[];
  audit: { id: string; action: string; details: Record<string, unknown>; reason: string | null; created_at: string; player: string | null }[];
  corrections: { id: string; created_at: string; xp: number; label: string; reason: string | null; source: XpSource; player: string }[];
  stats: { active_30d: number; players: number; streak_4plus: number; avg_streak: number | null; xp_season: number; xp_30d: number; badges_30d: number; linked: number };
  settings: GamiSettings;
  rules: (XpRule & { enabled: boolean })[];
  neutral_weeks: { id: string; week_start: string; reason: string | null }[];
  badge_catalog: Omit<BadgeItem, "earned_at">[];
}

/* ------------------------------ Appels serveur ------------------------------ */
export const getPlayerSpace = (playerId?: string) => rpc<PlayerSpace>("gami_player_space", playerId ? { p_player: playerId } : {});
export const getRanking = (scope: "all" | "season", seasonId?: string | null) =>
  rpc<RankRow[]>("gami_ranking", { p_scope: scope, ...(seasonId ? { p_season: seasonId } : {}) });
export const getSeasons = () => rpc<Season[]>("gami_seasons", {});
export const setHidden = (hidden: boolean) => rpc("gami_set_hidden", { p_hidden: hidden });
export const getCoachOverview = () => rpc<CoachOverview>("gami_coach_overview", {});
export const validateTournament = (op: string, id: string, result: string, category: string) =>
  rpc<{ xp: number; delta: number }>("gami_validate_tournament", { p_op: op, p_tournament: id, p_result: result, p_category: category });
export const manualXp = (op: string, playerId: string, xp: number, kind: "bonus" | "correction", reason: string) =>
  rpc("gami_manual_xp", { p_op: op, p_player: playerId, p_xp: xp, p_kind: kind, p_reason: reason });
export const updateSettings = (p: Partial<GamiSettings>) => rpc("gami_update_settings", { p });
export const saveRule = (code: string | null, xp: number, enabled: boolean, threshold?: number) =>
  rpc("gami_save_rule", { p_code: code, p_xp: xp, p_enabled: enabled, ...(threshold ? { p_threshold: threshold } : {}) });
export const setNeutralWeek = (week: string, on: boolean, reason?: string) =>
  rpc("gami_set_neutral_week", { p_week: week, p_on: on, p_reason: reason ?? null });
export const recalculateAll = () => rpc<{ players: number; delta: number }>("gami_recalculate_all", {});

export async function getLevels(): Promise<MascotLevel[]> {
  return check(await supabase().from("mascot_levels").select("*").order("level")) ?? [];
}

/* ------------------------------ Calculs d'affichage ------------------------------ */
export const PRESTIGE_XP = [3500, 4000, 4500, 5000, 5500];

export function levelInfo(levels: MascotLevel[], xp: number) {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const current = [...sorted].reverse().find((l) => xp >= l.xp_required) ?? sorted[0];
  const next = sorted.find((l) => l.level === current.level + 1) ?? null;
  if (next) {
    const span = next.xp_required - current.xp_required;
    return { current, next, pct: ((xp - current.xp_required) / span) * 100, toNext: next.xp_required - xp, nextLabel: `Niveau ${next.level} · ${next.mascot}` };
  }
  // niveau 20 : progression vers l'étoile Prestige suivante
  const nextStar = PRESTIGE_XP.find((t) => xp < t);
  if (!nextStar) return { current, next: null, pct: 100, toNext: 0, nextLabel: "Prestige maximal atteint" };
  const prev = [3000, ...PRESTIGE_XP][PRESTIGE_XP.indexOf(nextStar)];
  const stars = PRESTIGE_XP.indexOf(nextStar) + 1;
  return { current, next: null, pct: ((xp - prev) / (nextStar - prev)) * 100, toNext: nextStar - xp, nextLabel: `Oracle ${"★".repeat(stars)}` };
}

export const RARITY: Record<Rarity, { label: string; frame: string; bg: string; text: string; glow: string }> = {
  commun:     { label: "Commun",      frame: "ring-slate-300",   bg: "from-slate-100 via-white to-slate-200",          text: "text-slate-600",  glow: "" },
  peu_commun: { label: "Peu commun",  frame: "ring-emerald-400", bg: "from-emerald-100 via-white to-teal-100",         text: "text-emerald-700", glow: "" },
  rare:       { label: "Rare",        frame: "ring-sky-400",     bg: "from-sky-100 via-white to-indigo-100",           text: "text-sky-700",    glow: "shadow-sky-300/40" },
  epique:     { label: "Épique",      frame: "ring-violet-500",  bg: "from-violet-200 via-fuchsia-50 to-violet-100",   text: "text-violet-700", glow: "shadow-violet-400/50" },
  legendaire: { label: "Légendaire",  frame: "ring-amber-400",   bg: "from-amber-200 via-orange-50 to-yellow-100",     text: "text-amber-700",  glow: "shadow-amber-400/60" },
  mythique:   { label: "Mythique",    frame: "ring-fuchsia-500", bg: "from-fuchsia-300 via-violet-200 to-amber-200",   text: "text-fuchsia-700", glow: "shadow-fuchsia-500/60" },
};

export const SOURCE_LABEL: Record<XpSource, string> = {
  session: "Séance", streak: "Régularité", milestone: "Palier", tournament: "Tournoi", bonus: "Bonus", correction: "Correction",
};
export const BADGE_CATEGORY: Record<BadgeItem["category"], string> = { fidelite: "Fidélité", regularite: "Régularité", competition: "Compétition" };
export const TIER_LABEL: Record<"t1" | "t2" | "t3", string> = { t1: "P25–P100", t2: "P250–P500", t3: "P1000 et +" };

export const AUDIT_LABEL: Record<string, string> = {
  tournament_validated: "Résultat de tournoi validé", tournament_corrected: "Résultat de tournoi corrigé",
  manual_bonus: "Bonus exceptionnel", manual_correction: "Correction manuelle", settings_updated: "Réglages modifiés",
  rule_updated: "Règle XP modifiée", neutral_week_added: "Semaine neutre ajoutée", neutral_week_removed: "Semaine neutre retirée",
  recalculated: "Recalcul complet", season_archived: "Saison archivée",
};
