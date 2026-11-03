import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

export const TZ = "Europe/Paris";

export const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const WEEKDAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function weekdayName(n: number) {
  return WEEKDAYS[(n - 1 + 7) % 7];
}

/** Date du jour à Paris, au format YYYY-MM-DD */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Heure courante à Paris HH:MM */
export function nowTimeParis(): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export function parseISO(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day, 12);
}

export function toISO(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function isoWeekday(d: string | Date): number {
  const dt = typeof d === "string" ? parseISO(d) : d;
  return ((dt.getDay() + 6) % 7) + 1;
}

export function fmtDate(d: string | null | undefined, pattern = "EEE d MMM"): string {
  if (!d) return "—";
  return format(parseISO(d), pattern, { locale: fr });
}

export function fmtDateLong(d: string | null | undefined): string {
  return fmtDate(d, "EEEE d MMMM yyyy");
}

export function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${Number(h)}h${m}`;
}

export function fmtRange(a: string, b: string) {
  return `${fmtTime(a)} – ${fmtTime(b)}`;
}

export function fmtDateTime(ts: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(ts));
}

export function weekRange(anchor: string) {
  const d = parseISO(anchor);
  const start = startOfWeek(d, { weekStartsOn: 1 });
  const end = endOfWeek(d, { weekStartsOn: 1 });
  return { start: toISO(start), end: toISO(end) };
}

export function monthRange(anchor: string) {
  const d = parseISO(anchor);
  return { start: toISO(startOfMonth(d)), end: toISO(endOfMonth(d)) };
}

/** Grille du mois : du lundi précédant le 1er au dimanche suivant la fin */
export function monthGrid(anchor: string) {
  const d = parseISO(anchor);
  const start = startOfWeek(startOfMonth(d), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(d), { weekStartsOn: 1 });
  const days: string[] = [];
  for (let x = start; x <= end; x = addDays(x, 1)) days.push(toISO(x));
  return days;
}

export function addDaysISO(d: string, n: number) {
  return toISO(addDays(parseISO(d), n));
}

export function addMonthsISO(d: string, n: number) {
  const dt = parseISO(d);
  return toISO(new Date(dt.getFullYear(), dt.getMonth() + n, 1, 12));
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
