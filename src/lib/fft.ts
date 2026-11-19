/* Calendrier des tournois FFT (Ten'Up) : types partagés + lecture des réponses Ten'Up.
   Ce fichier ne fait aucun appel réseau ; il est utilisé par la route serveur
   /api/fft-tournois et par l'interface. */

export type FftNature = "DM" | "DD" | "DX";
export const FFT_NATURES: Record<FftNature, string> = { DM: "Messieurs", DD: "Dames", DX: "Mixte" };

export interface FftTournament {
  id: string;            // identifiant d'homologation Ten'Up (ex. MOJA_271510)
  name: string;
  club: string;
  city: string;
  start: string;         // AAAA-MM-JJ
  end: string;
  natures: FftNature[];
  levels: string[];      // P25, P100… déduits du libellé (complétés par la fiche)
  distance_km: number | null;
  online: boolean;       // inscription en ligne possible
  url: string;           // page Ten'Up
}

export interface FftEvent {
  label: string; nature: string; category: string | null; start: string | null; end: string | null;
  price: number | null; open: boolean; maxRank: string | null;
}
export interface FftDetail {
  id: string; address: string; lat: number | null; lng: number | null; balls: string | null; image: string | null;
  events: FftEvent[]; levels: string[];
}

export interface FftQuery { lat: number; lng: number; radius_km: number; from: string; to: string }

const LEVEL_RE = /\bP\s?(25|50|100|250|500|1000|1500|2000)\b/gi;
export const LEVEL_ORDER = ["P25", "P50", "P100", "P250", "P500", "P1000", "P1500", "P2000"];
export function sortLevels(l: Iterable<string>) {
  return [...new Set(l)].sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
}
export function levelsFromLabel(label: string) {
  return sortLevels([...(label || "").matchAll(LEVEL_RE)].map((m) => "P" + m[1]));
}

export function tenupUrl(id: string) {
  return `https://tenup.fft.fr/tournoi/${encodeURIComponent(id)}`;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const day = (v: unknown) => str(v).slice(0, 10);

/** Corps de la recherche Ten'Up (recherche publique, sans compte) */
export function tenupSearchBody(q: FftQuery, from: number, size: number) {
  return {
    pratique: "PADEL", from, size, lat: q.lat, lng: q.lng, distance: q.radius_km,
    dateDebut: `${q.from}T00:00:00.000Z`, dateFin: `${q.to}T00:00:00.000Z`,
    type: [], codeClub: null, ligues: [], comites: [], utiliserMesDonnees: false, naturesEpreuves: [],
    typesEpreuves: [], naturesTerrains: [], categoriesJeu: [], categoriesAge: [], familles: [],
    tournoiInterne: false, classements: [], inscriptionEnLigne: null, paiementEnLigne: null, filtres: true, sort: "DISTANCE",
  };
}

/** Transforme une page de résultats Ten'Up en liste de tournois */
export function parseTenupCards(data: unknown): { total: number; items: FftTournament[] } {
  const d = (data ?? {}) as { nbResultats?: number; cards?: Record<string, unknown>[] };
  const items: FftTournament[] = [];
  for (const c of d.cards ?? []) {
    const id = str(c.idHomologation);
    if (!id) continue;
    const name = str(c.libelleTournoi) || "Tournoi";
    const dist = typeof c.distance === "number" ? Math.round(c.distance / 100) / 10 : null;
    const natures = ((c.naturesEpreuves as unknown[]) ?? []).filter((n): n is FftNature => n === "DM" || n === "DD" || n === "DX");
    items.push({
      id, name, club: str((c.club as { libelle?: string } | null)?.libelle), city: str(c.ville),
      start: day(c.dateDebut), end: day(c.dateFin) || day(c.dateDebut),
      natures: [...new Set(natures)], levels: levelsFromLabel(name), distance_km: dist,
      online: c.inscriptionEnLigne === true, url: tenupUrl(id),
    });
  }
  return { total: typeof d.nbResultats === "number" ? d.nbResultats : items.length, items };
}

/** Transforme la fiche détaillée d'un tournoi Ten'Up */
export function parseTenupFiche(id: string, data: unknown): FftDetail {
  const d = (data ?? {}) as { tournoi?: Record<string, unknown>; epreuves?: Record<string, unknown>[] };
  const t = d.tournoi ?? {};
  const events: FftEvent[] = (d.epreuves ?? []).map((e) => ({
    label: str(e.libelle), nature: str(e.nature), category: str(e.categorie) || null,
    start: day(e.dateDebut) || null, end: day(e.dateFin) || null,
    price: typeof e.tarifAdulte === "number" ? e.tarifAdulte : null,
    open: e.estInscriptionOuverte === true, maxRank: str(e.classementMax) || null,
  }));
  return {
    id,
    address: [t.adresse1, t.adresse2, t.codePostal, t.ville].map(str).filter(Boolean).join(" "),
    lat: typeof t.latitude === "number" ? t.latitude : null, lng: typeof t.longitude === "number" ? t.longitude : null,
    balls: str(t.balles) || null, image: str(t.image) || null,
    events, levels: sortLevels(events.map((e) => e.category ?? "").filter((c) => LEVEL_ORDER.includes(c))),
  };
}

/** Catégorie à proposer quand un joueur ajoute ce tournoi à son suivi */
export function guessCategory(t: Pick<FftTournament, "levels">, detail?: FftDetail | null) {
  return (detail?.levels[0] ?? t.levels[0]) || "P100";
}

/** Points de recherche : Ten'Up limite le rayon d'une recherche, on couvre donc les grandes
    zones avec un cercle central de 100 km + une couronne de points autour. */
export const TENUP_MAX_RADIUS = 100;
export function searchPoints(lat: number, lng: number, radius: number) {
  const pts = [{ lat, lng, r: Math.min(radius, TENUP_MAX_RADIUS), main: true }];
  if (radius <= TENUP_MAX_RADIUS) return pts;
  const ring = radius - TENUP_MAX_RADIUS * 0.8;          // centres de la couronne
  const n = Math.min(10, Math.max(6, Math.ceil((2 * Math.PI * ring) / (TENUP_MAX_RADIUS * 1.4))));
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const dLat = (ring * Math.cos(a)) / 111;
    const dLng = (ring * Math.sin(a)) / (111 * Math.cos((lat * Math.PI) / 180));
    pts.push({ lat: Math.round((lat + dLat) * 1000) / 1000, lng: Math.round((lng + dLng) * 1000) / 1000, r: TENUP_MAX_RADIUS, main: false });
  }
  return pts;
}
