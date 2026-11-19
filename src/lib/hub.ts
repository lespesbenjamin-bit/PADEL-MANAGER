/* Accès aux données des modules Padel Coach Hub : tournois, communauté, notifications,
   bibliothèque (exercices, schémas), séances types, RGPD. */
import { supabase } from "./supabase";
import { check, rpc } from "./api";
import type { FftDetail, FftTournament } from "./fft";

/* ============================== Tournois ============================== */
export type TournamentStatus = "considered" | "registered" | "confirmed" | "done" | "cancelled";
export type CoachingStatus = "none" | "requested" | "accepted" | "declined" | "done";

export interface Tournament {
  id: string; owner_id: string; player_id: string; name: string; start_date: string; end_date: string | null;
  club: string | null; city: string | null; category: string; partner_name: string | null; status: TournamentStatus;
  goal: string | null; coaching_request: boolean; coaching_status: CoachingStatus; coach_note: string | null;
  result_rank: string | null; matches_played: number | null; wins: number | null; losses: number | null;
  player_comment: string | null; photos: string[]; created_at: string;
  debrief_back_score: number | null; debrief_net_score: number | null; debrief_satisfaction: number | null;
  debrief_difficulties: string | null; debrief_positives: string | null; debrief_at: string | null;
  coach_feedback: string | null; coach_reviewed_at: string | null;
  fft_id?: string | null; fft_url?: string | null;
  player_first_name?: string; player_last_name?: string; player_level?: string | null;
}

export const SCORE_LABELS = ["", "À travailler", "Moyen", "Correct", "Bien", "Excellent"];
export const SATISFACTION_EMOJI = ["", "😞", "😕", "😐", "🙂", "😁"];
/** Tournoi passé (ou terminé) et non annulé, sans débriefing du joueur */
export function needsDebrief(t: Pick<Tournament, "status" | "start_date" | "end_date" | "debrief_at">, today: string) {
  return t.status !== "cancelled" && !t.debrief_at && (t.status === "done" || (t.end_date ?? t.start_date) < today);
}

export const TOURNAMENT_CATEGORIES = ["P25", "P50", "P100", "P250", "P500", "P1000", "P1500", "P2000"];
export const RESULT_RANKS = ["Vainqueur", "Finaliste", "1/2 finale", "1/4 de finale", "1/8 de finale", "1/16 de finale", "Phase de poules", "Abandon"];

export const T_STATUS: Record<TournamentStatus, { label: string; cls: string; dot: string }> = {
  considered: { label: "Envisagé", cls: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  registered: { label: "Inscrit", cls: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  confirmed: { label: "Confirmé", cls: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  done: { label: "Terminé", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  cancelled: { label: "Annulé", cls: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-400" },
};
export const C_STATUS: Record<CoachingStatus, string> = {
  none: "", requested: "Accompagnement demandé", accepted: "Accompagnement accepté", declined: "Accompagnement non disponible", done: "Accompagné",
};

export async function getTournaments(asCoach: boolean): Promise<Tournament[]> {
  const q = supabase().from(asCoach ? "v_tournaments" : "tournaments").select("*").order("start_date");
  return check(await q) ?? [];
}

export type TournamentInput = Partial<Omit<Tournament, "id" | "created_at" | "player_first_name" | "player_last_name" | "player_level">>;

export async function saveTournament(id: string | null, t: TournamentInput): Promise<Tournament> {
  if (id) return check(await supabase().from("tournaments").update(t).eq("id", id).select().single());
  return check(await supabase().from("tournaments").insert(t).select().single());
}

export async function deleteTournament(id: string) {
  return check(await supabase().from("tournaments").delete().eq("id", id));
}

/* ============================== Photos (stockage privé) ============================== */
const BUCKET = "community";

/** Réduit l'image (max 1600 px, JPEG) avant envoi : plus rapide depuis un téléphone. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Conversion impossible"))), "image/jpeg", 0.85));
  } catch {
    return file;   // format non lisible par le navigateur : envoi tel quel
  }
}

export async function uploadPhoto(file: File, coachId: string, userId: string): Promise<string> {
  const blob = await shrink(file);
  const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${coachId}/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase().storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const missing = paths.filter((p) => !(urlCache.get(p)?.exp ?? 0) || urlCache.get(p)!.exp < now);
  if (missing.length) {
    const { data, error } = await supabase().storage.from(BUCKET).createSignedUrls(missing, 3600);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) if (d.path && d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60_000 });
  }
  return Object.fromEntries(paths.map((p) => [p, urlCache.get(p)?.url ?? ""]));
}

/** Photo de profil : recadrée au carré (400 px), envoyée dans le stockage privé puis enregistrée */
export async function uploadAvatar(file: File, coachId: string, userId: string, previous?: string | null): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = 400; c.height = 400;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 400, 400);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Image illisible"))), "image/jpeg", 0.88));
  const path = `${coachId}/${userId}/avatar-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase().storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  await rpc("set_avatar", { p_path: path });
  if (previous) await removePhotos([previous]).catch(() => {});
  return path;
}
export async function removeAvatar(previous: string | null | undefined) {
  await rpc("set_avatar", { p_path: null });
  if (previous) await removePhotos([previous]).catch(() => {});
}

export async function removePhotos(paths: string[]) {
  if (!paths.length) return;
  await supabase().storage.from(BUCKET).remove(paths);
}

/* ============================== Communauté ============================== */
export type PostKind = "message" | "result" | "podium" | "training" | "announcement";
export const POST_KINDS: Record<PostKind, { label: string; emoji: string }> = {
  message: { label: "Message", emoji: "💬" },
  result: { label: "Résultat", emoji: "🏆" },
  podium: { label: "Podium", emoji: "🥇" },
  training: { label: "Entraînement", emoji: "🎾" },
  announcement: { label: "Annonce du coach", emoji: "📣" },
};
export const REACTIONS = ["👍", "🔥", "👏", "💪", "🎾", "❤️"] as const;

export interface FeedComment { id: string; author_id: string; author_name: string; author_avatar?: string | null; author_role?: "coach" | "player" | null; body: string; hidden: boolean; created_at: string }
export interface FeedPost {
  id: string; author_id: string; author_name: string; author_avatar?: string | null; author_role: "coach" | "player" | null; kind: PostKind; body: string | null;
  photos: string[]; meta: { tournament?: string; date?: string; category?: string; result?: string; record?: string };
  pinned: boolean; highlighted: boolean; hidden: boolean; created_at: string;
  reactions: Record<string, number>; my_reactions: string[]; comments: FeedComment[];
}

export const getFeed = (opts: { before?: string | null; author?: string | null; limit?: number } = {}) =>
  rpc<FeedPost[]>("get_feed", { p_limit: opts.limit ?? 20, p_before: opts.before ?? null, p_author: opts.author ?? null });

export async function createPost(p: { owner_id: string; kind: PostKind; body: string; photos: string[]; meta?: object; tournament_id?: string | null }) {
  return check(await supabase().from("posts").insert({ ...p, meta: p.meta ?? {} }).select("id").single());
}
export async function updatePost(id: string, patch: Partial<{ body: string; pinned: boolean; highlighted: boolean; hidden: boolean }>) {
  return check(await supabase().from("posts").update(patch).eq("id", id));
}
export async function deletePost(id: string) { return check(await supabase().from("posts").delete().eq("id", id)); }
export async function addComment(owner_id: string, post_id: string, body: string) {
  return check(await supabase().from("post_comments").insert({ owner_id, post_id, body }));
}
export async function hideComment(id: string, hidden: boolean) { return check(await supabase().from("post_comments").update({ hidden }).eq("id", id)); }
export async function deleteComment(id: string) { return check(await supabase().from("post_comments").delete().eq("id", id)); }
export async function toggleReaction(owner_id: string, post_id: string, emoji: string, on: boolean) {
  if (on) return check(await supabase().from("post_reactions").insert({ owner_id, post_id, emoji }));
  return check(await supabase().from("post_reactions").delete().eq("post_id", post_id).eq("emoji", emoji).eq("user_id", (await supabase().auth.getUser()).data.user!.id));
}
export async function reportContent(owner_id: string, target: { post_id?: string; comment_id?: string }, reason: string) {
  return check(await supabase().from("content_reports").insert({ owner_id, ...target, reason }));
}
export interface Report { id: string; post_id: string | null; comment_id: string | null; reason: string | null; status: string; created_at: string }
export async function getOpenReports(): Promise<Report[]> {
  return check(await supabase().from("content_reports").select("*").eq("status", "open").order("created_at", { ascending: false })) ?? [];
}
export async function closeReport(id: string) { return check(await supabase().from("content_reports").update({ status: "closed" }).eq("id", id)); }

/* ============================== Notifications ============================== */
export interface Notification { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export async function getNotifications(): Promise<Notification[]> {
  return check(await supabase().from("notifications").select("*").order("created_at", { ascending: false }).limit(40)) ?? [];
}
export async function markAllRead() {
  return check(await supabase().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null));
}

/* ============================== Schémas tactiques ============================== */
export type ElementKind = "player" | "ball" | "cone" | "text" | "arrow" | "move" | "shot" | "zone";
export interface DiagramElement {
  id: string; type: ElementKind; color: string;
  x: number; y: number;            // position (0–1 sur la largeur / la longueur du terrain)
  x2?: number; y2?: number;        // fin de flèche / coin opposé de zone
  cx?: number; cy?: number;        // point de courbure (trajectoire)
  label?: string;                  // texte ou numéro du joueur
  team?: "A" | "B";
}
export interface DiagramFrame { elements: DiagramElement[]; note?: string }
export interface DiagramData { frames: DiagramFrame[] }
export interface Diagram { id: string; title: string; data: DiagramData; created_at: string; updated_at: string }

export async function getDiagrams(): Promise<Diagram[]> {
  return check(await supabase().from("diagrams").select("*").order("updated_at", { ascending: false })) ?? [];
}
export async function getDiagram(id: string): Promise<Diagram> {
  return check(await supabase().from("diagrams").select("*").eq("id", id).single());
}
export async function saveDiagram(id: string | null, title: string, data: DiagramData): Promise<Diagram> {
  if (id) return check(await supabase().from("diagrams").update({ title, data }).eq("id", id).select().single());
  return check(await supabase().from("diagrams").insert({ title, data }).select().single());
}
export async function deleteDiagram(id: string) { return check(await supabase().from("diagrams").delete().eq("id", id)); }
export const duplicateDiagram = (id: string) => rpc<string>("duplicate_diagram", { p_diagram_id: id });
export async function getDiagramShares(id: string): Promise<string[]> {
  const rows: { group_id: string }[] = check(await supabase().from("diagram_shares").select("group_id").eq("diagram_id", id)) ?? [];
  return rows.map((r) => r.group_id);
}
export async function setDiagramShares(id: string, groupIds: string[]) {
  check(await supabase().from("diagram_shares").delete().eq("diagram_id", id));
  if (groupIds.length) check(await supabase().from("diagram_shares").insert(groupIds.map((g) => ({ diagram_id: id, group_id: g }))));
}

/* ============================== Exercices ============================== */
export type ExerciseCategory = "technique" | "tactique" | "physique";
export const SUBCATEGORIES: Record<ExerciseCategory, string[]> = {
  technique: ["Coup droit", "Revers", "Volée", "Bandeja", "Vibora", "Smash", "Lob", "Sortie de vitre", "Double vitre", "Service et retour"],
  tactique: ["Défense", "Attaque", "Transition", "Construction du point", "Placement", "Replacement", "Communication", "Gestion des trajectoires"],
  physique: ["Déplacements", "Coordination", "Appuis", "Réactivité", "Explosivité"],
};
export const CATEGORY_LABEL: Record<ExerciseCategory, string> = { technique: "Technique", tactique: "Tactique", physique: "Physique" };

export interface Exercise {
  id: string; title: string; objective: string | null; category: ExerciseCategory; subcategory: string | null; level: string | null;
  players_count: number | null; duration_min: number | null; equipment: string | null; organisation: string | null;
  instructions: string | null; success_criteria: string | null; variants: string | null; common_errors: string | null;
  corrections: string | null; diagram_id: string | null; media_url: string | null; visibility: "private" | "groups";
  created_at: string; updated_at: string;
}
export type ExerciseInput = Omit<Exercise, "id" | "created_at" | "updated_at">;

export async function getExercises(): Promise<Exercise[]> {
  return check(await supabase().from("exercises").select("*").order("title")) ?? [];
}
export async function getExercise(id: string): Promise<Exercise> {
  return check(await supabase().from("exercises").select("*").eq("id", id).single());
}
export async function saveExercise(id: string | null, e: Partial<ExerciseInput>): Promise<Exercise> {
  if (id) return check(await supabase().from("exercises").update(e).eq("id", id).select().single());
  return check(await supabase().from("exercises").insert(e).select().single());
}
export async function deleteExercise(id: string) { return check(await supabase().from("exercises").delete().eq("id", id)); }
export async function getExerciseShares(id: string): Promise<string[]> {
  const rows: { group_id: string }[] = check(await supabase().from("exercise_shares").select("group_id").eq("exercise_id", id)) ?? [];
  return rows.map((r) => r.group_id);
}
export async function setExerciseShares(id: string, groupIds: string[]) {
  check(await supabase().from("exercise_shares").delete().eq("exercise_id", id));
  if (groupIds.length) check(await supabase().from("exercise_shares").insert(groupIds.map((g) => ({ exercise_id: id, group_id: g }))));
}

export interface SharedLibrary {
  exercises: (Omit<Exercise, "diagram_id" | "visibility" | "created_at" | "updated_at"> & { diagram: DiagramData | null })[];
  diagrams: { id: string; title: string; data: DiagramData }[];
}
export const getSharedLibrary = () => rpc<SharedLibrary>("get_shared_library", {});

/* ============================== Séances types ============================== */
export interface Plan {
  id: string; name: string; plan_date: string | null; group_id: string | null; session_id: string | null; duration_min: number | null;
  theme: string | null; objectives: string | null; equipment: string | null; observations: string | null; next_focus: string | null;
  is_template: boolean; status: "draft" | "ready" | "done"; created_at: string; updated_at: string;
}
export interface PlanItem { id?: string; exercise_id: string | null; duration_min: number | null; title: string | null; notes: string | null; position?: number }
export const PLAN_STATUS: Record<Plan["status"], { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  ready: { label: "Prête", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  done: { label: "Effectuée", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

export async function getPlans(): Promise<Plan[]> {
  return check(await supabase().from("session_plans").select("*").order("plan_date", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false })) ?? [];
}
export async function getPlan(id: string): Promise<{ plan: Plan; items: PlanItem[] }> {
  const [plan, items] = await Promise.all([
    supabase().from("session_plans").select("*").eq("id", id).single(),
    supabase().from("session_plan_items").select("*").eq("plan_id", id).order("position"),
  ]);
  return { plan: check(plan), items: check(items) ?? [] };
}
export async function savePlan(id: string | null, p: Partial<Plan>): Promise<Plan> {
  if (id) return check(await supabase().from("session_plans").update(p).eq("id", id).select().single());
  return check(await supabase().from("session_plans").insert(p).select().single());
}
export const savePlanItems = (planId: string, items: PlanItem[]) =>
  rpc("save_plan_items", { p_plan_id: planId, p_items: items.map(({ exercise_id, duration_min, title, notes }) => ({ exercise_id, duration_min, title, notes })) });
export async function deletePlan(id: string) { return check(await supabase().from("session_plans").delete().eq("id", id)); }
export const duplicatePlan = (id: string, asTemplate: boolean) => rpc<string>("duplicate_plan", { p_plan_id: id, p_as_template: asTemplate });
export const getMyUpcomingThemes = () => rpc<Record<string, { theme: string; objectives: string | null }>>("get_my_upcoming_themes", {});

/* ============================== RGPD & compte ============================== */
export const TERMS_VERSION = "2026-11";
export const acceptTerms = () => rpc("accept_terms", { p_version: TERMS_VERSION });
export const setDisplayName = (name: string) => rpc("set_display_name", { p_name: name });
export const exportMyData = () => rpc<object>("export_my_data", {});
export const deleteMyAccountData = () => rpc("delete_my_account_data", {});
export async function getMyConsent(): Promise<string | null> {
  const uid = (await supabase().auth.getUser()).data.user?.id;
  const r: { consent_at: string | null } | null = check(await supabase().from("profiles").select("consent_at").eq("id", uid!).maybeSingle());
  return r?.consent_at ?? null;
}

/* ============================== Calendriers externes (BookMyCoach…) ============================== */
import type { ExternalEvent } from "./ical";
import type { VSession } from "./types";

export interface ExternalCalendar { id: string; name: string; url: string; color: string; filter: "all" | "individual" | "hide_collective"; enabled: boolean }

export async function getExternalCalendars(): Promise<ExternalCalendar[]> {
  return check(await supabase().from("external_calendars").select("id, name, url, color, filter, enabled").order("created_at")) ?? [];
}
export async function saveExternalCalendar(id: string | null, c: Partial<ExternalCalendar>) {
  if (id) return check(await supabase().from("external_calendars").update(c).eq("id", id));
  return check(await supabase().from("external_calendars").insert(c));
}
export async function deleteExternalCalendar(id: string) { return check(await supabase().from("external_calendars").delete().eq("id", id)); }

async function callExternal(body: object) {
  const token = (await supabase().auth.getSession()).data.session?.access_token;
  const r = await fetch("/api/external-calendar", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`);
  return j;
}
export const testExternalCalendar = (url: string) =>
  callExternal({ testUrl: url }) as Promise<{ count: number; first: string | null; last: string | null; individual: number; collective: number }>;
export async function getExternalEvents(from: string, to: string): Promise<{ events: ExternalEvent[]; errors: { name: string; error: string }[] }> {
  try { return await callExternal({ from, to }); } catch (e) { return { events: [], errors: [{ name: "Calendriers externes", error: e instanceof Error ? e.message : String(e) }] }; }
}

/** Présente une séance externe comme une séance du planning (lecture seule) */
export function externalToSession(e: ExternalEvent): VSession {
  return {
    id: `ext:${e.uid}`, group_id: `ext:${e.calendarId}`, cycle_id: null, session_date: e.date, start_time: e.start, end_time: e.end,
    status: "planned", kind: "exceptional", counts_in_cycle: false, original_date: null, rescheduled: false, cancel_reason: null,
    notes: e.description, validated_at: null, version: 1, group_name: e.person ?? e.title,
    group_level: e.category === "individual" ? "Indiv" : e.category === "collective" ? "Collectif" : "Cours",
    capacity: 1, color: e.color, group_status: "active", cycle_number: null, cycle_name: null, planned_sessions: null, cycle_index: null,
    member_count: 1, present_count: 0, attendance_count: 0, pending_validation: false, location: e.location, external: e,
  };
}

/* ============================== Abonnement agenda (iPhone…) ============================== */
export interface CalendarFeed { token: string; include_external: boolean }
export async function getCalendarFeed(): Promise<CalendarFeed | null> {
  return check(await supabase().from("calendar_feeds").select("token, include_external").maybeSingle());
}
export const regenerateCalendarFeed = () => rpc<string>("regenerate_calendar_feed", {});
export async function setFeedIncludeExternal(token: string, v: boolean) {
  return check(await supabase().from("calendar_feeds").update({ include_external: v }).eq("token", token));
}
export const feedUrl = (token: string) => `${window.location.origin}/api/agenda/${token}.ics`;

/* ============================== Calendrier FFT (Ten'Up) ============================== */
export interface FftSettings { enabled: boolean; center_label: string; lat: number; lng: number; radius_km: number }
export interface FftCalendar {
  disabled?: boolean; reason?: "server" | "coach";
  fetched_at?: string; total?: number; items?: FftTournament[]; zone?: { label: string; radius_km: number }; months?: number;
}

async function callFft(body: object) {
  const token = (await supabase().auth.getSession()).data.session?.access_token;
  const r = await fetch("/api/fft-tournois", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`);
  return j;
}
export const getFftCalendar = (months = 3) => callFft({ months }) as Promise<FftCalendar>;
export const getFftDetail = async (id: string) => ((await callFft({ ficheId: id })) as { detail: FftDetail }).detail;
export async function getFftParticipants(ids: string[]): Promise<Record<string, string[]>> {
  if (!ids.length) return {};
  return (await rpc<Record<string, string[]>>("fft_participants", { p_ids: ids.slice(0, 500) })) ?? {};
}
export async function getFftSettings(): Promise<FftSettings | null> {
  return (await rpc<FftSettings | null>("fft_my_settings", {})) ?? null;
}
export async function saveFftSettings(s: FftSettings) {
  return rpc<FftSettings>("fft_save_settings", { p: s });
}
