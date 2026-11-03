import { supabase } from "./supabase";
import { todayISO } from "./dates";
import type {
  Attendance, AttendanceStatus, CreditTx, CycleStats, Group, GroupOverview, Membership,
  PackageRow, Player, PlayerStats, Revision, SessionKind, VSession,
} from "./types";

/** Erreur lisible en français */
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const newOpKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ---------------------------- Lecture ---------------------------- */

export async function getGroups(includeArchived = false): Promise<GroupOverview[]> {
  let q = supabase().from("v_group_overview").select("*").order("weekday").order("start_time");
  if (!includeArchived) q = q.neq("status", "archived");
  return check(await q) ?? [];
}

export async function getGroup(id: string): Promise<GroupOverview> {
  return check(await supabase().from("v_group_overview").select("*").eq("id", id).single());
}

export async function getCycles(opts: { groupId?: string } = {}): Promise<CycleStats[]> {
  let q = supabase().from("v_cycle_stats").select("*").order("cycle_number", { ascending: false });
  if (opts.groupId) q = q.eq("group_id", opts.groupId);
  return check(await q) ?? [];
}

export async function getSessions(opts: {
  from?: string; to?: string; groupId?: string; cycleId?: string; pendingOnly?: boolean;
} = {}): Promise<VSession[]> {
  let q = supabase().from("v_sessions").select("*").order("session_date").order("start_time");
  if (opts.from) q = q.gte("session_date", opts.from);
  if (opts.to) q = q.lte("session_date", opts.to);
  if (opts.groupId) q = q.eq("group_id", opts.groupId);
  if (opts.cycleId) q = q.eq("cycle_id", opts.cycleId);
  if (opts.pendingOnly) q = q.eq("pending_validation", true);
  return check(await q) ?? [];
}

export async function getSession(id: string): Promise<VSession> {
  return check(await supabase().from("v_sessions").select("*").eq("id", id).single());
}

export async function getAttendances(sessionId: string): Promise<Attendance[]> {
  return check(await supabase().from("session_attendances").select("*, players(*)").eq("session_id", sessionId)) ?? [];
}

export async function getRevisions(sessionId: string): Promise<Revision[]> {
  return check(await supabase().from("session_revisions").select("*").eq("session_id", sessionId)
    .order("created_at", { ascending: false })) ?? [];
}

export async function getMembers(groupId: string): Promise<Membership[]> {
  return check(await supabase().from("group_memberships").select("*, players(*)")
    .eq("group_id", groupId).is("left_on", null).order("joined_on")) ?? [];
}

export async function getActiveMemberships(): Promise<Membership[]> {
  return check(await supabase().from("group_memberships")
    .select("*, groups(id,name,level,status,weekday,start_time,color)").is("left_on", null)) ?? [];
}

export async function getPlayers(): Promise<PlayerStats[]> {
  return check(await supabase().from("v_player_stats").select("*").order("first_name").order("last_name")) ?? [];
}

export async function getPlayer(id: string): Promise<PlayerStats> {
  return check(await supabase().from("v_player_stats").select("*").eq("id", id).single());
}

export async function getPlayerMemberships(playerId: string): Promise<Membership[]> {
  return check(await supabase().from("group_memberships")
    .select("*, groups(id,name,level,status,weekday,start_time,color)")
    .eq("player_id", playerId).order("joined_on", { ascending: false })) ?? [];
}

export async function getPackages(playerId: string): Promise<PackageRow[]> {
  return check(await supabase().from("v_packages").select("*").eq("player_id", playerId)
    .order("purchased_on", { ascending: false })) ?? [];
}

export async function getTransactions(playerId: string): Promise<CreditTx[]> {
  return check(await supabase().from("credit_transactions")
    .select("*, sessions(session_date, groups(name))").eq("player_id", playerId)
    .order("created_at", { ascending: false })) ?? [];
}

export interface Participation {
  id: string; status: AttendanceStatus; consume_credit: boolean; is_guest: boolean;
  sessions: { id: string; session_date: string; status: string; start_time: string; groups: { name: string } | null } | null;
}
export async function getParticipations(playerId: string): Promise<Participation[]> {
  const rows = (check(await supabase().from("session_attendances")
    .select("id, status, consume_credit, is_guest, sessions(id, session_date, status, start_time, groups(name))")
    .eq("player_id", playerId)) ?? []) as unknown as Participation[];
  return rows.sort((a, b) => (b.sessions?.session_date ?? "").localeCompare(a.sessions?.session_date ?? ""));
}

/* ---------------------------- Groupes ---------------------------- */

export type GroupInput = Pick<Group, "name" | "level" | "weekday" | "start_time" | "end_time" | "capacity" | "color"> & {
  notes?: string | null;
};

export async function createGroup(g: GroupInput, cycle?: { planned: number; start: string; name?: string }) {
  const row: Group = check(await supabase().from("groups").insert(g).select().single());
  if (cycle) await createCycle(row.id, cycle.planned, cycle.start, cycle.name);
  return row;
}

export async function updateGroup(id: string, patch: Partial<Group>) {
  return check(await supabase().from("groups").update(patch).eq("id", id).select().single());
}

export const archiveGroup = (id: string) => rpc("archive_group", { p_group_id: id });

export async function addMember(groupId: string, playerId: string) {
  return check(await supabase().from("group_memberships")
    .insert({ group_id: groupId, player_id: playerId, joined_on: todayISO() }).select().single());
}

export async function removeMember(membershipId: string) {
  return check(await supabase().from("group_memberships").update({ left_on: todayISO() }).eq("id", membershipId));
}

export const movePlayer = (playerId: string, fromGroup: string, toGroup: string) =>
  rpc("move_player", { p_player_id: playerId, p_from_group: fromGroup, p_to_group: toGroup, p_date: todayISO() });

/* ---------------------------- Cycles ---------------------------- */

export const createCycle = (groupId: string, planned: number, start: string, name?: string) =>
  rpc<string>("create_cycle", { p_group_id: groupId, p_planned: planned, p_start_date: start, p_name: name ?? null });

export const renewCycle = (op: string, groupId: string, o: {
  planned?: number; start?: string | null; keepMembers: boolean;
  weekday?: number | null; startTime?: string | null; endTime?: string | null; name?: string | null;
}) => rpc("renew_cycle", {
  p_op: op, p_group_id: groupId, p_planned: o.planned ?? null, p_start_date: o.start || null,
  p_keep_members: o.keepMembers, p_weekday: o.weekday ?? null, p_start_time: o.startTime ?? null,
  p_end_time: o.endTime ?? null, p_name: o.name || null,
});

export async function updateCycle(id: string, patch: { name?: string; planned_sessions?: number; status?: string; notes?: string }) {
  return check(await supabase().from("group_cycles").update(patch).eq("id", id));
}

/* ---------------------------- Séances ---------------------------- */

export const addSession = (o: {
  groupId: string; date: string; start?: string; end?: string; kind: SessionKind; countsInCycle: boolean; notes?: string;
}) => rpc<string>("add_session", {
  p_group_id: o.groupId, p_date: o.date, p_start_time: o.start || null, p_end_time: o.end || null,
  p_kind: o.kind, p_counts_in_cycle: o.countsInCycle, p_cycle_id: null, p_notes: o.notes || null,
});

export const rescheduleSession = (op: string, id: string, date: string, start: string, end: string, reason?: string) =>
  rpc("reschedule_session", { p_op: op, p_session_id: id, p_new_date: date, p_start_time: start, p_end_time: end, p_reason: reason || null });

export const cancelSession = (op: string, id: string, reason: string, replacement: boolean) =>
  rpc<{ replacement_date: string | null }>("cancel_session", { p_op: op, p_session_id: id, p_reason: reason || null, p_add_replacement: replacement });

export const restoreSession = (op: string, id: string) => rpc("restore_session", { p_op: op, p_session_id: id });

export const updateFutureRecurrence = (op: string, groupId: string, from: string, weekday: number, start: string, end: string) =>
  rpc<{ updated: number }>("update_future_recurrence", {
    p_op: op, p_group_id: groupId, p_from_date: from, p_weekday: weekday, p_start_time: start, p_end_time: end,
  });

export const pauseGroup = (op: string, groupId: string, from: string, to: string, reason: string) =>
  rpc<{ moved: number }>("pause_group", { p_op: op, p_group_id: groupId, p_from: from, p_to: to, p_reason: reason || null });

export interface AttendanceInput {
  player_id: string; status: AttendanceStatus; consume_credit: boolean; is_guest: boolean; note?: string | null;
}

export const validateSession = (op: string, id: string, att: AttendanceInput[], countsInCycle: boolean | null, notes?: string | null) =>
  rpc<{ credits_consumed: number }>("validate_session", {
    p_op: op, p_session_id: id, p_attendances: att, p_counts_in_cycle: countsInCycle, p_notes: notes ?? null,
  });

export const correctSession = (op: string, id: string, att: AttendanceInput[], reason: string, countsInCycle: boolean | null, notes?: string | null) =>
  rpc<{ credits_consumed: number; credits_refunded: number }>("correct_session", {
    p_op: op, p_session_id: id, p_attendances: att, p_reason: reason || null, p_counts_in_cycle: countsInCycle, p_notes: notes ?? null,
  });

export const reopenSession = (op: string, id: string, reason: string) =>
  rpc("reopen_session", { p_op: op, p_session_id: id, p_reason: reason || null });

export async function updateSessionNotes(id: string, notes: string) {
  return check(await supabase().from("sessions").update({ notes }).eq("id", id));
}

/** Prépare la feuille de présence : présences existantes + membres actuels */
export async function getAttendanceSheet(session: VSession) {
  const [att, members] = await Promise.all([getAttendances(session.id), getMembers(session.group_id)]);
  const rows: (AttendanceInput & { player: Player })[] = att.map((a) => ({
    player_id: a.player_id, status: a.status, consume_credit: a.consume_credit, is_guest: a.is_guest,
    note: a.note, player: a.players!,
  }));
  if (session.status !== "validated") {
    for (const m of members) {
      if (!rows.find((r) => r.player_id === m.player_id) && m.players) {
        rows.push({ player_id: m.player_id, status: "unknown", consume_credit: false, is_guest: false, note: null, player: m.players });
      }
    }
  }
  return rows.sort((a, b) => Number(a.is_guest) - Number(b.is_guest) || a.player.first_name.localeCompare(b.player.first_name));
}

/* ---------------------------- Joueurs ---------------------------- */

export type PlayerInput = Pick<Player, "first_name" | "last_name" | "phone" | "email" | "level" | "notes">;

export async function createPlayer(p: PlayerInput): Promise<Player> {
  return check(await supabase().from("players").insert(p).select().single());
}

export async function updatePlayer(id: string, p: Partial<Player>) {
  return check(await supabase().from("players").update(p).eq("id", id));
}

export async function createPackage(p: { player_id: string; label: string; total_credits: number; price?: number | null; purchased_on: string; expires_on?: string | null }) {
  return check(await supabase().from("packages").insert(p).select().single());
}

export const deletePackage = (id: string) => rpc("delete_package", { p_package_id: id });
export const adjustCredits = (playerId: string, delta: number, note: string) =>
  rpc("adjust_credits", { p_player_id: playerId, p_delta: delta, p_note: note });

/* ---------------------------- Réglages ---------------------------- */

export const seedDemo = () => rpc("seed_demo_data", {});
export const deleteAllData = () => rpc("delete_all_my_data", {});
