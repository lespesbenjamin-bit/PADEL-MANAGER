/* Calendrier des tournois de padel FFT, lu sur la recherche publique de Ten'Up.
   • réservé aux utilisateurs connectés de l'app (coach ou joueur)
   • zone et interrupteur réglés par le coach (fft_settings)
   • résultats mis en cache 6 h (fiche d'un tournoi : 12 h) pour solliciter Ten'Up
     le moins possible
   • coupure d'urgence sans toucher au code : variable Vercel FFT_IMPORT_DISABLED=1 */
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { parseTenupCards, parseTenupFiche, tenupSearchBody, type FftQuery, type FftTournament } from "@/lib/fft";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BASE = (process.env.FFT_TENUP_BASE || "https://tenup.fft.fr").replace(/\/$/, "");
const API = `${BASE}/back/public/v1/tournois`;
const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "fr-FR,fr;q=0.9",
  "Content-Type": "application/json",
  Origin: "https://tenup.fft.fr",
  Referer: "https://tenup.fft.fr/recherche/tournois",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};
const PAGE = 500, MAX = 3000;

async function tenup(url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { ...init, headers: HEADERS, signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`Ten'Up a répondu ${r.status}`);
    return await r.json();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Ten'Up ne répond pas (délai dépassé)");
    throw e;
  } finally { clearTimeout(timer); }
}

async function searchAll(q: FftQuery) {
  const items: FftTournament[] = [];
  let total = 0;
  for (let from = 0; from < MAX; from += PAGE) {
    const page = parseTenupCards(await tenup(API, { method: "POST", body: JSON.stringify(tenupSearchBody(q, from, PAGE)) }));
    total = page.total;
    items.push(...page.items);
    if (page.items.length === 0 || from + PAGE >= total) break;
  }
  const seen = new Set<string>();
  return {
    fetched_at: new Date().toISOString(), total,
    items: items.filter((t) => !seen.has(t.id) && seen.add(t.id)).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name)),
  };
}

const cachedSearch = unstable_cache(searchAll, ["fft-search-v1"], { revalidate: 6 * 3600 });
const cachedFiche = unstable_cache(async (id: string) => parseTenupFiche(id, await tenup(`${API}/${encodeURIComponent(id)}/fiche-tournoi`, { method: "GET" })),
  ["fft-fiche-v1"], { revalidate: 12 * 3600 });

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  if (process.env.FFT_IMPORT_DISABLED === "1") return NextResponse.json({ disabled: true, reason: "server" });

  const sb = createClient(URL_, KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: settings, error } = await sb.rpc("fft_my_settings");
  if (error) return NextResponse.json({ error: error.message.includes("fft_my_settings") ? "Lance la migration 011 dans Supabase" : error.message }, { status: 400 });
  if (!settings) return NextResponse.json({ error: "Compte non rattaché à un coach" }, { status: 403 });
  if (!settings.enabled) return NextResponse.json({ disabled: true, reason: "coach" });

  const body = (await req.json().catch(() => ({}))) as { ficheId?: string; months?: number };

  try {
    if (body.ficheId) {
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(body.ficheId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
      return NextResponse.json({ detail: await cachedFiche(body.ficheId) });
    }
    const months = Math.min(6, Math.max(1, Math.round(body.months ?? 3)));
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + months);
    const q: FftQuery = {
      lat: Math.round(settings.lat * 1000) / 1000, lng: Math.round(settings.lng * 1000) / 1000,
      radius_km: settings.radius_km, from: iso(start), to: iso(end),
    };
    const res = await cachedSearch(q);
    return NextResponse.json({ ...res, zone: { label: settings.center_label, radius_km: settings.radius_km }, months });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur Ten'Up" }, { status: 502 });
  }
}
