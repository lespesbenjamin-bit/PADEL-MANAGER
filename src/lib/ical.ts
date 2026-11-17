/* Lecture d'un calendrier iCal (.ics) : BookMyCoach, Google Agenda, Apple… */

export interface ExternalEvent {
  uid: string;
  date: string;        // YYYY-MM-DD (heure de Paris)
  start: string;       // HH:MM:SS
  end: string;         // HH:MM:SS
  endDate: string;     // YYYY-MM-DD
  title: string;
  description: string | null;
  location: string | null;
  person: string | null;    // ex. « Lucas Martin » extrait de « Cours padel avec Lucas Martin (…) »
  type: string | null;      // ex. « Cours Individuel Spécifique »
  category: "individual" | "collective" | "other";
  calendarId: string;
  calendarName: string;
  color: string;
}

const TZ = "Europe/Paris";

function unescape(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

/** Convertit une date iCal en date + heure locales de Paris */
function toParis(value: string, params: string): { date: string; time: string } {
  const allDay = /VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(value);
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!m) return { date: "", time: "00:00:00" };
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  if (allDay) return { date: `${y}-${mo}-${d}`, time: "00:00:00" };
  if (z) {
    // heure UTC → heure de Paris
    const dt = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(dt).reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}:${parts.second}` };
  }
  // heure « flottante » ou avec TZID : on la prend comme heure locale
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}:${s}` };
}

export function parseIcs(text: string, cal: { id: string; name: string; color: string }): ExternalEvent[] {
  // déplie les lignes coupées (RFC 5545 : une ligne qui commence par un espace continue la précédente)
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: ExternalEvent[] = [];
  let ev: Record<string, { value: string; params: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { ev = {}; continue; }
    if (line === "END:VEVENT") {
      if (ev && ev.DTSTART && (ev.STATUS?.value ?? "").toUpperCase() !== "CANCELLED") {
        const s = toParis(ev.DTSTART.value, ev.DTSTART.params);
        const e = ev.DTEND ? toParis(ev.DTEND.value, ev.DTEND.params) : { date: s.date, time: s.time };
        const title = unescape(ev.SUMMARY?.value ?? "Cours");
        const m = title.match(/avec\s+(.+?)\s*\(([^)]+)\)\s*$/i) ?? title.match(/avec\s+(.+)$/i);
        const type = m?.[2]?.trim() ?? null;
        const t = `${type ?? ""} ${title}`.toLowerCase();
        if (s.date) out.push({
          uid: ev.UID?.value ?? `${s.date}-${s.time}-${title}`,
          date: s.date, start: s.time, end: e.time === "00:00:00" && e.date > s.date ? "23:59:00" : e.time, endDate: e.date,
          title, description: ev.DESCRIPTION ? unescape(ev.DESCRIPTION.value) : null, location: ev.LOCATION ? unescape(ev.LOCATION.value) : null,
          person: m?.[1]?.trim() ?? null, type,
          category: /individ|priv|solo|1\s*[:-]\s*1/.test(t) ? "individual" : /collect|groupe|stage/.test(t) ? "collective" : "other",
          calendarId: cal.id, calendarName: cal.name, color: cal.color,
        });
      }
      ev = null; continue;
    }
    if (!ev) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const [name, ...params] = head.split(";");
    ev[name.toUpperCase()] = { value: line.slice(idx + 1), params: params.join(";") };
  }
  return out;
}
