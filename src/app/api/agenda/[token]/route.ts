/* Abonnement agenda (iPhone, Google Agenda, Outlook…) : collectifs + indivs.
   Accès par lien secret ; aucune donnée de joueur n'y figure hormis le nom de l'élève en indiv. */
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseIcs, type ExternalEvent } from "@/lib/ical";
import { fetchIcs } from "@/lib/ical-fetch";

export const dynamic = "force-dynamic";

interface FeedSession { id: string; date: string; start: string; end: string; group: string; level: string | null; location: string | null; kind: string; theme: string | null; updated_at: string }
interface Feed { sessions: FeedSession[]; calendars: { id: string; name: string; url: string; filter: string }[] }

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const dt = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.slice(0, 8).replace(/:/g, "").padEnd(6, "0")}`;
/** Coupe les lignes trop longues (norme iCal : 75 octets max) */
function fold(line: string) {
  const out: string[] = []; let cur = ""; let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

function event(uid: string, date: string, start: string, end: string, endDate: string, title: string, desc: string | null, location: string | null, stamp: string) {
  return [
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Paris:${dt(date, start)}`, `DTEND;TZID=Europe/Paris:${dt(endDate, end)}`,
    `SUMMARY:${esc(title)}`, ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []), ...(location ? [`LOCATION:${esc(location)}`] : []),
    "END:VEVENT",
  ];
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const token = (await ctx.params).token.replace(/\.ics$/i, "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("calendar_feed", { p_token: token });
  if (error) return new Response("Erreur", { status: 500 });
  if (!data) return new Response("Lien invalide ou remplacé", { status: 404 });
  const feed = data as Feed;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Padel Coach Hub//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Padel Coach Hub", "X-WR-TIMEZONE:Europe/Paris", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
  ];
  for (const s of feed.sessions) {
    const kind = s.kind === "makeup" ? " (rattrapage)" : s.kind === "exceptional" ? " (exceptionnelle)" : "";
    lines.push(...event(`${s.id}@padelcoachhub`, s.date, s.start, s.end, s.date,
      `🎾 ${s.group}${s.level ? ` · ${s.level}` : ""}${kind}`, s.theme ? `Thème : ${s.theme}` : "Collectif", s.location, stamp));
  }
  const ext: ExternalEvent[] = [];
  await Promise.all(feed.calendars.map(async (c) => {
    try {
      let list = parseIcs(await fetchIcs(c.url), { id: c.id, name: c.name, color: "" });
      if (c.filter === "individual") list = list.filter((e) => e.category === "individual");
      if (c.filter === "hide_collective") list = list.filter((e) => e.category !== "collective");
      ext.push(...list);
    } catch { /* calendrier externe indisponible : on sert quand même les collectifs */ }
  }));
  for (const e of ext) {
    const label = e.category === "individual" ? "Indiv" : e.category === "collective" ? "Collectif" : "Cours";
    lines.push(...event(`ext-${e.uid}`, e.date, e.start, e.end, e.endDate || e.date,
      `👤 ${label} · ${e.person ?? e.title}`, `${e.title}\n(${e.calendarName})`, e.location, stamp));
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="padel-coach-hub.ics"', "Cache-Control": "private, max-age=300" },
  });
}
