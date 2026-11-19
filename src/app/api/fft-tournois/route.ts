/* Calendrier des tournois de padel FFT, lu sur la recherche publique de Ten'Up.
   • réservé aux utilisateurs connectés de l'app (coach ou joueur)
   • zone et interrupteur réglés par le coach (fft_settings)
   • résultats mis en cache 6 h (fiche d'un tournoi : 12 h) pour solliciter Ten'Up
     le moins possible
   • coupure d'urgence sans toucher au code : variable Vercel FFT_IMPORT_DISABLED=1 */
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { haversineKm, parseTenupCards, parseTenupFiche, searchPoints, tenupSearchBody, type FftQuery, type FftTournament } from "@/lib/fft";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    if (!r.ok) {
      const txt = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
      console.error("[fft] Ten'Up", r.status, url, txt);
      throw new Error(`Ten'Up a répondu ${r.status}${txt ? ` (${txt})` : ""}`);
    }
    return await r.json();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("Ten'Up ne répond pas (délai dépassé)");
    throw e;
  } finally { clearTimeout(timer); }
}

async function searchOne(q: FftQuery) {
  const items: FftTournament[] = [];
  let total = 0;
  for (let from = 0; from < MAX; from += PAGE) {
    const page = parseTenupCards(await tenup(API, { method: "POST", body: JSON.stringify(tenupSearchBody(q, from, PAGE)) }));
    total = page.total;
    items.push(...page.items);
    if (page.items.length === 0 || from + PAGE >= total) break;
  }
  return items;
}

async function searchAll(q: FftQuery) {
  const byId = new Map<string, FftTournament>();
  for (const pt of searchPoints(q.lat, q.lng, q.radius_km)) {
    const list = await searchOne({ ...q, lat: pt.lat, lng: pt.lng, radius_km: pt.r });
    for (const t of list) {
      const prev = byId.get(t.id);
      // la distance n'est fiable que depuis le centre de la zone
      const item = pt.main ? t : { ...t, distance_km: null };
      if (!prev || (prev.distance_km == null && item.distance_km != null)) byId.set(t.id, item);
    }
  }
  const items = [...byId.values()];
  await addDistances(items, [q.lat, q.lng]);
  return { fetched_at: new Date().toISOString(), total: items.length, items };
}

/* Distance depuis le centre de la zone pour TOUS les tournois : coordonnées de la ville
   via le service public geo.api.gouv.fr (mis en cache 30 jours). */
const cachedCity = unstable_cache(async (city: string, dept: string) => {
  const u = new URL(`${(process.env.GEO_API_BASE || "https://geo.api.gouv.fr").replace(/\/$/, "")}/communes`);
  u.searchParams.set("nom", city); u.searchParams.set("fields", "centre,codeDepartement"); u.searchParams.set("limit", "5");
  if (dept) u.searchParams.set("codeDepartement", dept);
  const r = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const list = (await r.json()) as { nom: string; centre?: { coordinates?: [number, number] } }[];
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const hit = list.find((c) => norm(c.nom) === norm(city)) ?? list[0];
  const co = hit?.centre?.coordinates;
  return co ? ([co[1], co[0]] as [number, number]) : null;
}, ["fft-city-v1"], { revalidate: 30 * 24 * 3600 });

async function addDistances(items: FftTournament[], center: [number, number]) {
  const keys = [...new Set(items.filter((t) => t.city).map((t) => `${t.city}|${t.dept ?? ""}`))];
  const pos = new Map<string, [number, number] | null>();
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(keys.slice(i, i + 8).map(async (k) => {
      const [city, dept] = k.split("|");
      pos.set(k, await cachedCity(city, dept).catch(() => null));
    }));
  }
  for (const t of items) {
    const p = pos.get(`${t.city}|${t.dept ?? ""}`);
    if (p) t.distance_km = Math.round(haversineKm(center, p) * 10) / 10;
  }
}

const todayParis = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

const cachedSearch = unstable_cache(searchAll, ["fft-search-v3"], { revalidate: 6 * 3600 });
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
    // jamais de tournoi déjà commencé, toujours dans l'ordre chronologique
    const today = todayParis();
    const items = res.items
      .filter((t) => t.start >= today && (t.distance_km == null || t.distance_km <= settings.radius_km + 5))
      .sort((a, b) => a.start.localeCompare(b.start) || (a.distance_km ?? 999) - (b.distance_km ?? 999) || a.name.localeCompare(b.name));
    return NextResponse.json({ ...res, items, total: items.length, zone: { label: settings.center_label, radius_km: settings.radius_km }, months });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur Ten'Up" }, { status: 502 });
  }
}
