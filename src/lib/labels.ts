import type { AttendanceStatus, CycleStatus, GroupStatus, SessionKind, SessionStatus } from "./types";

export const LEVELS = ["P25", "P50", "P100", "P250", "P500"];

export const GROUP_STATUS: Record<GroupStatus, { label: string; cls: string }> = {
  active: { label: "Actif", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  suspended: { label: "Suspendu", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  archived: { label: "Archivé", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export const CYCLE_STATUS: Record<CycleStatus, { label: string; cls: string }> = {
  upcoming: { label: "À venir", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  in_progress: { label: "En cours", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  completed: { label: "Terminé", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  archived: { label: "Archivé", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export const SESSION_STATUS: Record<SessionStatus | "pending", { label: string; cls: string; dot: string }> = {
  planned: { label: "Prévue", cls: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  pending: { label: "À valider", cls: "bg-amber-50 text-amber-800 ring-amber-300", dot: "bg-amber-500" },
  validated: { label: "Validée", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  cancelled: { label: "Annulée", cls: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-400" },
};

export const SESSION_KIND: Record<SessionKind, string> = {
  regular: "Séance du cycle",
  exceptional: "Exceptionnelle",
  makeup: "Rattrapage",
};

export const ATTENDANCE: Record<AttendanceStatus, { label: string; short: string; cls: string }> = {
  present: { label: "Présent", short: "P", cls: "bg-emerald-600 text-white" },
  absent: { label: "Absent", short: "A", cls: "bg-rose-600 text-white" },
  excused: { label: "Excusé", short: "E", cls: "bg-amber-500 text-white" },
  unknown: { label: "Non renseigné", short: "?", cls: "bg-slate-200 text-slate-600" },
};

export const REVISION_ACTION: Record<string, string> = {
  validate: "Validation",
  correct: "Correction",
  reopen: "Validation annulée",
  cancel: "Annulation",
  restore: "Rétablie",
  reschedule: "Report / modification",
  recurrence: "Changement de récurrence",
  pause: "Décalage (pause)",
};

export function sessionDisplayStatus(s: { status: SessionStatus; pending_validation: boolean }) {
  return s.status === "planned" && s.pending_validation ? "pending" : s.status;
}

export const GROUP_COLORS = ["#7C3AED", "#DB2777", "#0EA5E9", "#16A34A", "#F59E0B", "#EF4444", "#0F766E", "#4F46E5"];
