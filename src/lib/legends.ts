/* PADEL LEGENDS – types, accès aux données (fonctions serveur Supabase) et présentation */
import { check, rpc } from "./api";
import { supabase } from "./supabase";

export type Rarity = "bronze" | "argent" | "or" | "platine" | "legendaire";
export type XpSource = "session" | "streak" | "milestone" | "tournament" | "bonus" | "correction";

/** Une carte de la collection « Padel Legends — La collection des 20 » (référentiel unique en base : table mascot_levels) */
export interface MascotLevel {
  level: number; status: string; mascot: string; slug: string; xp_required: number; rarity: Rarity; emoji: string; description: string;
  punchline: string | null; perks: { code: string; label: string }[]; image_url: string | null;
}
export type LegendCard = MascotLevel;
export interface GamiProfile {
  player_id: string; total_xp: number; level: number; prestige: number; current_streak: number; best_streak: number;
  sessions_count: number; active_months: number; tournaments_count: number; finals_count: number; wins_count: number;
  last_xp_at: string | null; hide_from_ranking: boolean;
  favorite_level?: number | null; last_seen_level?: number | null; last_shared_level?: number | null;
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
export const setFavorite = (level: number | null) => rpc<{ favorite_level: number | null }>("gami_set_favorite", { p_level: level });
export const markSeen = (level: number) => rpc("gami_mark_seen", { p_level: level });
export const shareCard = (level: number, publish: boolean) => rpc<{ status: string }>("gami_share_card", { p_level: level, p_publish: publish });
export interface AuthorCard { user_id: string; level: number; prestige: number; favorite_level: number | null; card_level: number }
export const getAuthorCards = (users: string[]) => rpc<AuthorCard[]>("gami_author_cards", { p_users: users });
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
/** Étoiles Prestige (même règle que le serveur) */
export const prestigeOf = (xp: number) => PRESTIGE_XP.filter((t) => xp >= t).length;

export function levelInfo(levels: MascotLevel[], xp: number) {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const current = [...sorted].reverse().find((l) => xp >= l.xp_required) ?? sorted[0];
  const next = sorted.find((l) => l.level === current.level + 1) ?? null;
  if (next) {
    const span = next.xp_required - current.xp_required;
    return { current, next, pct: ((xp - current.xp_required) / span) * 100, toNext: next.xp_required - xp, nextLabel: `${next.status} (niv. ${next.level})` };
  }
  // niveau 20 : progression vers l'étoile Prestige suivante
  const nextStar = PRESTIGE_XP.find((t) => xp < t);
  if (!nextStar) return { current, next: null, pct: 100, toNext: 0, nextLabel: "Prestige maximal atteint" };
  const prev = [3000, ...PRESTIGE_XP][PRESTIGE_XP.indexOf(nextStar)];
  const stars = PRESTIGE_XP.indexOf(nextStar) + 1;
  return { current, next: null, pct: ((xp - prev) / (nextStar - prev)) * 100, toNext: nextStar - xp, nextLabel: `Prestige ${"★".repeat(stars)}` };
}

export const RARITY: Record<Rarity, { label: string; levels: string; text: string; chip: string }> = {
  bronze:     { label: "Bronze",     levels: "Niveaux 1 à 4",   text: "text-amber-800",   chip: "bg-amber-100 text-amber-900 ring-amber-300" },
  argent:     { label: "Argent",     levels: "Niveaux 5 à 8",   text: "text-slate-600",   chip: "bg-slate-100 text-slate-700 ring-slate-300" },
  or:         { label: "Or",         levels: "Niveaux 9 à 12",  text: "text-amber-600",   chip: "bg-amber-50 text-amber-700 ring-amber-300" },
  platine:    { label: "Platine",    levels: "Niveaux 13 à 16", text: "text-violet-700",  chip: "bg-violet-50 text-violet-700 ring-violet-300" },
  legendaire: { label: "Légendaire", levels: "Niveaux 17 à 20", text: "text-fuchsia-700", chip: "bg-slate-900 text-amber-300 ring-amber-400" },
};
export const RARITY_ORDER: Rarity[] = ["bronze", "argent", "or", "platine", "legendaire"];

/** Récompenses numériques débloquées jusqu'à un niveau (lues dans le référentiel) */
export function perksUpTo(levels: MascotLevel[], level: number) {
  return levels.filter((l) => l.level <= level).flatMap((l) => (l.perks ?? []).map((p) => ({ ...p, level: l.level })));
}
/** Carte affichée sur le profil : la favorite si elle est débloquée (dès le niveau 4), sinon la carte actuelle */
export function displayedCardLevel(level: number, favorite?: number | null) {
  return level >= 4 && favorite && favorite <= level ? favorite : level;
}
/** Cadre et titre de profil selon le niveau réel */
export function profileFrame(level: number): "none" | "silver" | "holo" | "ultimate" {
  return level >= 20 ? "ultimate" : level >= 16 ? "holo" : level >= 8 ? "silver" : "none";
}
export function profileTitle(level: number): string | null {
  return level >= 20 ? "L’Immortel du Padel" : level >= 12 ? "Gold" : null;
}


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

/* ------------------------------ Mode démo (lecture seule, rien n'est enregistré) ------------------------------ */
export async function getBadgeCatalog(): Promise<Omit<BadgeItem, "earned_at">[]> {
  return check(await supabase().from("badges").select("code, name, description, category, icon, threshold, condition_type").order("sort")) ?? [];
}
export async function getActiveRules(): Promise<XpRule[]> {
  return check(await supabase().from("xp_rules").select("code, label, category, xp, threshold, enabled").eq("enabled", true).gt("xp", 0).order("sort")) ?? [];
}
export interface DemoProfile { key: string; label: string; name: string; xp: number }
export const DEMO_PROFILES: DemoProfile[] = [
  { key: "new", label: "Nouveau joueur", name: "Inès", xp: 0 },
  { key: "occasional", label: "Joueur occasionnel", name: "Hugo", xp: 150 },
  { key: "regular", label: "Joueur régulier", name: "Léa", xp: 600 },
  { key: "loyal", label: "Joueur fidèle", name: "Karim", xp: 1450 },
  { key: "very_loyal", label: "Joueur très fidèle", name: "Sophie", xp: 2450 },
  { key: "legend", label: "Joueur légendaire", name: "Marc", xp: 3000 },
  { key: "prestige", label: "Joueur Prestige", name: "Julie", xp: 5500 },
];

/** Construit un espace joueur fictif avec EXACTEMENT les mêmes règles de niveau que la plateforme */
export function simulateSpace(levels: MascotLevel[], catalog: Omit<BadgeItem, "earned_at">[], rules: XpRule[], name: string, xp: number, favorite: number | null): PlayerSpace {
  const info = levelInfo(levels, xp);
  const level = info.current.level;
  const prestige = prestigeOf(xp);
  const sessions = Math.floor((xp * 0.72) / 20);
  const best = Math.min(sessions, Math.floor(sessions / 2.2) + (sessions > 0 ? 1 : 0));
  const streak = Math.min(best, Math.max(0, Math.round(best * 0.6)));
  const tournaments = Math.floor(xp / 450);
  const wins = Math.floor(tournaments / 4), finals = Math.floor(tournaments / 3);
  const months = Math.min(36, Math.ceil(sessions / 3.5));
  const stat: Record<string, number> = { sessions, active_months: months, streak: best, tournaments, finals, wins };
  const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const badges: BadgeItem[] = catalog.map((b, i) => ({ ...b, earned_at: (stat[b.condition_type] ?? 0) >= b.threshold ? day(5 + i * 9) : null }));
  // historique fictif cohérent avec le total
  const history: XpTx[] = [];
  let left = xp, d = 1, i = 0;
  const push = (source: XpSource, amount: number, label: string) => {
    if (left <= 0) return;
    const v = Math.min(amount, left); left -= v;
    history.push({ id: `demo-${i++}`, source, xp: v, label, reason: null, is_adjustment: false, occurred_on: day(d).slice(0, 10), created_at: day(d) });
    d += source === "session" ? 3 : 1;
  };
  while (left > 0 && history.length < 40) {
    push("session", 20, "Séance collective · Perf P100 (démo)");
    if (history.length % 5 === 0) push("tournament", 35, "Tournoi Open de démo (P100) · 1/2 finale");
    if (history.length % 7 === 0) push("streak", 40, "4 semaines consécutives");
  }
  if (left > 0) history.push({ id: "demo-rest", source: "milestone", xp: left, label: "Cumul des saisons précédentes (démo)", reason: null, is_adjustment: false, occurred_on: day(400).slice(0, 10), created_at: day(400) });
  return {
    player: { id: "demo", name },
    profile: {
      player_id: "demo", total_xp: xp, level, prestige, current_streak: streak, best_streak: best, sessions_count: sessions, active_months: months,
      tournaments_count: tournaments, finals_count: finals, wins_count: wins, last_xp_at: null, hide_from_ranking: false,
      favorite_level: favorite, last_seen_level: level, last_shared_level: level,
    },
    levels, badges, history,
    season: { id: "demo", name: "Saison démo", starts_on: "", ends_on: "", xp: Math.min(xp, 420) },
    rules, neutral_rules: { auto: true, excused: false },
  };
}
export function demoRanking(current: string, xpOf: (p: DemoProfile) => number, levels: MascotLevel[]): RankRow[] {
  const rows = DEMO_PROFILES.map((p) => ({ p, xp: xpOf(p) })).sort((a, b) => b.xp - a.xp);
  return rows.map(({ p, xp }, i) => ({
    player_id: p.key, first_name: p.name, last_name: `· ${p.label}`, xp, rank: i + 1, level: levelInfo(levels, xp).current.level,
    prestige: prestigeOf(xp), is_me: p.key === current, hidden: false,
  }));
}
