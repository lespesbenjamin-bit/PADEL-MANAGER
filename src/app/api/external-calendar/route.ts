/* Lit les calendriers externes du coach connecté (côté serveur : pas de souci CORS,
   et le lien d'abonnement n'est jamais envoyé à un joueur). */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseIcs, type ExternalEvent } from "@/lib/ical";

export const dynamic = "force-dynamic";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const MAX_BYTES = 3_000_000;

function allowedUrl(u: string) {
  try {
    const x = new URL(u);
    if (x.protocol === "https:") return true;
    return x.protocol === "http:" && (x.hostname === "localhost" || x.hostname === "127.0.0.1");
  } catch { return false; }
}

async function fetchIcs(url: string): Promise<string> {
  if (!allowedUrl(url)) throw new Error("Lien invalide (https obligatoire)");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "text/calendar, text/plain, */*" }, next: { revalidate: 300 } });
    if (!r.ok) throw new Error(`Le calendrier répond ${r.status}`);
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error("Calendrier trop volumineux");
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Ce lien ne renvoie pas un calendrier iCal");
    return text;
  } finally { clearTimeout(t); }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  const sb = createClient(URL_, KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });

  // seul un coach peut lire / tester un calendrier externe
  const { data: prof } = await sb.rpc("my_profile");
  if (!prof || prof.role !== "coach") return NextResponse.json({ error: "Réservé au coach" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string; testUrl?: string };

  // test d'un lien avant enregistrement
  if (body.testUrl) {
    try {
      const events = parseIcs(await fetchIcs(body.testUrl), { id: "test", name: "Test", color: "#0D9488" });
      const dates = events.map((e) => e.date).sort();
      return NextResponse.json({
        count: events.length, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null,
        individual: events.filter((e) => e.category === "individual").length, collective: events.filter((e) => e.category === "collective").length,
      });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 400 }); }
  }

  const { data: cals, error } = await sb.from("external_calendars").select("id, name, url, color, filter").eq("enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const events: ExternalEvent[] = [];
  const errors: { name: string; error: string }[] = [];
  await Promise.all((cals ?? []).map(async (c) => {
    try {
      let list = parseIcs(await fetchIcs(c.url), { id: c.id, name: c.name, color: c.color });
      if (c.filter === "individual") list = list.filter((e) => e.category === "individual");
      if (c.filter === "hide_collective") list = list.filter((e) => e.category !== "collective");
      events.push(...list);
    } catch (e) { errors.push({ name: c.name, error: e instanceof Error ? e.message : "Erreur" }); }
  }));
  const from = body.from ?? "0000-00-00", to = body.to ?? "9999-99-99";
  return NextResponse.json({
    events: events.filter((e) => e.date >= from && e.date <= to).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    errors,
  });
}
