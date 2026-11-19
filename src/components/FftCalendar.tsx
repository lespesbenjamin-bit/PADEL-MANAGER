"use client";
/* Calendrier des tournois FFT (Ten'Up) : recherche, « J'y participe », qui de mon groupe y va. */
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, Info, List, MapPin, RefreshCw, Search, Settings2, Users } from "lucide-react";
import * as hub from "@/lib/hub";
import { DEPARTEMENTS, FFT_NATURES, guessCategory, hourFromLabel, LEVEL_ORDER, type FftDetail, type FftNature, type FftTournament } from "@/lib/fft";
import { addMonthsISO, fmtDate, monthGrid, timeAgo, todayISO } from "@/lib/dates";
import { useRole } from "@/lib/role";
import type { PlayerStats } from "@/lib/types";
import { Badge, Button, Card, Checkbox, cx, Empty, ErrorBox, errMsg, Field, Input, Modal, Select, Spinner, useToast } from "@/components/ui";

const CENTERS: { label: string; lat: number; lng: number }[] = [
  { label: "Toulouse", lat: 43.604652, lng: 1.444209 },
  { label: "Colomiers", lat: 43.611, lng: 1.335 },
  { label: "Montauban", lat: 44.0176, lng: 1.355 },
  { label: "Albi", lat: 43.9289, lng: 2.1464 },
  { label: "Carcassonne", lat: 43.2130, lng: 2.3491 },
  { label: "Montpellier", lat: 43.6108, lng: 3.8767 },
  { label: "Perpignan", lat: 42.6887, lng: 2.8948 },
  { label: "Pau", lat: 43.2951, lng: -0.3708 },
  { label: "Bordeaux", lat: 44.8378, lng: -0.5792 },
];

export function FftCalendarView({ mine, players, onAdded }: { mine: hub.Tournament[]; players: PlayerStats[]; onAdded: () => void }) {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const [months, setMonths] = useState(3);
  const [cal, setCal] = useState<hub.FftCalendar | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [who, setWho] = useState<Record<string, string[]>>({});
  const [q, setQ] = useState("");
  const [levels, setLevels] = useState<string[]>([]);
  const [nature, setNature] = useState<FftNature | "">("");
  const [dept, setDept] = useState("");
  const [maxKm, setMaxKm] = useState<number | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [pick, setPick] = useState<FftTournament | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    hub.getFftCalendar(months).then(async (c) => {
      if (!alive) return;
      setCal(c);
      if (c.items?.length) {
        const w = await hub.getFftParticipants(c.items.map((t) => t.id)).catch(() => ({}));
        if (alive) setWho(w);
      }
    }).catch((e) => alive && setErr(errMsg(e))).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [months, tick]);

  const myIds = useMemo(() => new Set(mine.filter((t) => t.fft_id && t.status !== "cancelled").map((t) => t.fft_id!)), [mine]);
  const zoneKm = cal?.zone?.radius_km ?? 150;
  const km = maxKm == null || maxKm >= zoneKm ? null : maxKm;
  const depts = useMemo(() => [...new Set((cal?.items ?? []).map((t) => t.dept).filter((d): d is string => !!d))].sort(), [cal]);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const today = todayISO();
    return (cal?.items ?? []).filter((t) =>
      t.start >= today &&
      (!s || `${t.name} ${t.club} ${t.city}`.toLowerCase().includes(s)) &&
      (!levels.length || t.levels.some((l) => levels.includes(l))) &&
      (!nature || t.natures.includes(nature)) &&
      (!dept || t.dept === dept) &&
      (km == null || (t.distance_km != null && t.distance_km <= km)) &&
      (!onlyMine || (who[t.id]?.length ?? 0) > 0 || myIds.has(t.id)))
      .sort((a, b) => a.start.localeCompare(b.start) || (a.distance_km ?? 999) - (b.distance_km ?? 999));
  }, [cal, q, levels, nature, dept, km, onlyMine, who, myIds]);

  const byMonth = useMemo(() => {
    const m = new Map<string, FftTournament[]>();
    for (const t of items) { const k = t.start.slice(0, 7); m.set(k, [...(m.get(k) ?? []), t]); }
    return [...m.entries()];
  }, [items]);

  if (loading && !cal) return <Spinner />;
  if (err) return <ErrorBox error={`Calendrier FFT indisponible : ${err}`} onRetry={() => setTick((x) => x + 1)} />;
  if (cal?.disabled) {
    return (
      <div className="space-y-4">
        <Empty>{cal.reason === "server"
          ? "L'import du calendrier FFT est coupé pour le moment."
          : isCoach ? "L'import du calendrier FFT est désactivé dans tes réglages." : "Ton coach n'a pas activé le calendrier FFT."}</Empty>
        {isCoach && cal.reason === "coach" && <FftSettingsCard onSaved={() => setTick((x) => x + 1)} />}
      </div>
    );
  }

  const activeFilters = (nature ? 1 : 0) + levels.length + (dept ? 1 : 0) + (km != null ? 1 : 0) + (onlyMine ? 1 : 0);
  const toggleLevel = (l: string) => setLevels((v) => v.includes(l) ? v.filter((x) => x !== l) : [...v, l]);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Info className="size-3.5" />Source : Ten&apos;Up (FFT) · {cal?.zone?.label} + {cal?.zone?.radius_km} km</span>
        {cal?.fetched_at && <span>Mis à jour {timeAgo(cal.fetched_at)}</span>}
        <span className="ml-auto flex items-center gap-2">
          {isCoach && <Button size="sm" variant="ghost" onClick={() => setShowSettings((v) => !v)}><Settings2 className="size-4" />Réglages</Button>}
          <Button size="sm" variant="ghost" onClick={() => setTick((x) => x + 1)} loading={loading}><RefreshCw className="size-4" />Actualiser</Button>
        </span>
      </Card>
      {isCoach && showSettings && <FftSettingsCard onSaved={() => { setShowSettings(false); setTick((x) => x + 1); }} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Club, ville, nom du tournoi…" className="!pl-9" aria-label="Rechercher un tournoi" />
        </div>
        <div className="inline-flex rounded-xl bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="Affichage">
          {([["calendar", "Calendrier", CalendarDays], ["list", "Liste", List]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
              className={cx("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition", view === k ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50")}>
              <I className="size-4" />{l}</button>
          ))}
        </div>
        <Select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="!w-auto" aria-label="Période">
          <option value={1}>1 mois</option><option value={3}>3 mois</option><option value={6}>6 mois</option>
        </Select>
        <Button variant={activeFilters ? "primary" : "secondary"} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          <Settings2 className="size-4" />Filtres{activeFilters ? ` (${activeFilters})` : ""}</Button>
      </div>
      {showFilters && <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-full text-xs font-medium text-slate-500 sm:mr-1 sm:w-20">Tableau</span>
          {([["", "Tous"], ["DM", "Hommes"], ["DD", "Femmes"], ["DX", "Mixte"]] as const).map(([k, l]) => (
            <button key={k || "all"} onClick={() => setNature(k)} aria-pressed={nature === k}
              className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1 transition", nature === k ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-full text-xs font-medium text-slate-500 sm:mr-1 sm:w-20">Catégorie</span>
          {LEVEL_ORDER.slice(0, 6).map((l) => (
            <button key={l} onClick={() => toggleLevel(l)} aria-pressed={levels.includes(l)}
              className={cx("rounded-full px-3 py-1 text-xs font-semibold ring-1 transition", levels.includes(l) ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>{l}</button>
          ))}
        </div>
        {depts.length > 1 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="w-full text-xs font-medium text-slate-500 sm:w-20">Département</span>
            <Select value={dept} onChange={(e) => setDept(e.target.value)} className="!h-9 !w-auto text-sm" aria-label="Département">
              <option value="">Tous départements</option>
              {depts.map((d) => <option key={d} value={d}>{d} · {DEPARTEMENTS[d] ?? "Département " + d}</option>)}
            </Select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label htmlFor="fft-km" className="w-full text-xs font-medium text-slate-500 sm:w-20">Distance</label>
          <input id="fft-km" type="range" min={10} max={zoneKm} step={5} value={km ?? zoneKm} onChange={(e) => setMaxKm(Number(e.target.value))}
            className="min-w-[160px] flex-1 accent-violet-600" aria-label="Distance maximale en km" />
          <span className="w-36 text-sm font-semibold tabular-nums text-slate-900">{km == null ? `Toute la zone (${zoneKm} km)` : `Jusqu'à ${km} km`}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setOnlyMine((v) => !v)} aria-pressed={onlyMine}
            className={cx("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition", onlyMine ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-violet-700 ring-violet-200 hover:bg-violet-50")}>
            <Users className="size-3.5" />{isCoach ? "Où jouent mes joueurs" : "Mon groupe y va"}</button>
          {(nature || levels.length > 0 || dept || km != null || onlyMine || q) && (
            <button onClick={() => { setNature(""); setLevels([]); setDept(""); setMaxKm(null); setOnlyMine(false); setQ(""); }}
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline">Effacer les filtres</button>
          )}
          <span className="ml-auto text-xs text-slate-500">{items.length} tournoi{items.length > 1 ? "s" : ""} à venir</span>
        </div>
      </Card>}

      {view === "calendar" ? (
        <FftMonthView items={items} who={who} myIds={myIds} isCoach={isCoach} months={months} onOpen={setPick} onNeedMore={() => setMonths(6)} />
      ) : byMonth.length === 0 ? <Empty>Aucun tournoi ne correspond à ces critères.</Empty> : byMonth.map(([m, list]) => (
        <section key={m}>
          <h2 className="mb-2 text-lg capitalize text-slate-900">{fmtDate(m + "-01", "MMMM yyyy")} <span className="text-sm font-normal normal-case text-slate-400">· {list.length}</span></h2>
          <Card className="divide-y divide-slate-100">
            {list.map((t) => <FftRow key={t.id} t={t} who={who[t.id] ?? []} mine={myIds.has(t.id)} isCoach={isCoach} onOpen={() => setPick(t)} />)}
          </Card>
        </section>
      ))}
      <p className="text-xs text-slate-500">Les inscriptions se font sur Ten&apos;Up. Ici, tu ajoutes le tournoi à ton suivi pour ton coach (débrief, résultat, XP Padel Legends).</p>

      <FftDetailModal t={pick} players={players} mine={mine} onClose={() => setPick(null)}
        onAdded={() => { setPick(null); onAdded(); setTick((x) => x + 1); }} />
    </div>
  );
}

/* ---------- Vue calendrier : mois + tableaux du jour choisi ---------- */
const GENDER: Record<FftNature, { label: string; cls: string }> = {
  DM: { label: "Hommes", cls: "text-sky-600" }, DD: { label: "Dames", cls: "text-rose-500" }, DX: { label: "Mixte", cls: "text-amber-500" },
};
interface Board { t: FftTournament; level: string | null; nature: FftNature | null }
function boardsOf(t: FftTournament): Board[] {
  const lv = t.levels.length ? t.levels : [null];
  const nt = t.natures.length ? t.natures : [null];
  return lv.flatMap((level) => nt.map((nature) => ({ t, level, nature })));
}

function FftMonthView({ items, who, myIds, isCoach, months, onOpen, onNeedMore }: {
  items: FftTournament[]; who: Record<string, string[]>; myIds: Set<string>; isCoach: boolean; months: number;
  onOpen: (t: FftTournament) => void; onNeedMore: () => void;
}) {
  const today = todayISO();
  const byDay = useMemo(() => {
    const m = new Map<string, FftTournament[]>();
    for (const t of items) m.set(t.start, [...(m.get(t.start) ?? []), t]);
    return m;
  }, [items]);
  const firstDay = useMemo(() => [...byDay.keys()].sort()[0] ?? today, [byDay, today]);
  const [month, setMonth] = useState(firstDay.slice(0, 7) + "-01");
  const [day, setDay] = useState<string | null>(null);
  const sel = day && byDay.has(day) ? day : null;
  const selected = sel ?? (byDay.has(today) ? today : [...byDay.keys()].sort().find((d) => d.startsWith(month.slice(0, 7))) ?? null);
  const firstMonth = today.slice(0, 7) + "-01";
  const lastMonth = addMonthsISO(firstMonth, months - 1);
  const grid = monthGrid(month);
  const boards = (selected ? byDay.get(selected) ?? [] : [])
    .flatMap(boardsOf)
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level ?? "") - LEVEL_ORDER.indexOf(b.level ?? "") || (a.t.distance_km ?? 999) - (b.t.distance_km ?? 999));
  const count = (d: string) => (byDay.get(d) ?? []).reduce((n, t) => n + boardsOf(t).length, 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-2xl text-slate-900">{fmtDate(month, "MMMM")} <span className="text-slate-400">{fmtDate(month, "yyyy")}</span></div>
          <div className="flex gap-2">
            <button aria-label="Mois précédent" disabled={month <= firstMonth} onClick={() => { setMonth(addMonthsISO(month, -1)); setDay(null); }}
              className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-30"><ChevronLeft className="size-5" /></button>
            <button aria-label="Mois suivant" onClick={() => { if (month >= lastMonth) onNeedMore(); setMonth(addMonthsISO(month, 1)); setDay(null); }}
              disabled={month >= addMonthsISO(firstMonth, 5)}
              className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-30"><ChevronRight className="size-5" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i} className="pb-1 text-xs font-semibold text-slate-400">{d}</div>)}
          {grid.map((d) => {
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            if (!inMonth) return <div key={d} />;
            const n = count(d), past = d < today, isSel = d === selected;
            return (
              <button key={d} data-day={d} disabled={past || n === 0} onClick={() => setDay(d)} aria-pressed={isSel}
                aria-label={`${fmtDate(d, "EEEE d MMMM")}${n ? ` : ${n} tableau${n > 1 ? "x" : ""}` : ""}`}
                className={cx("relative mx-auto flex h-12 w-11 flex-col items-center justify-center rounded-xl text-lg font-semibold tabular-nums",
                  isSel ? "bg-ball text-slate-900 shadow-sm" : d === today ? "ring-2 ring-slate-300" : "",
                  past ? "text-slate-300" : n ? cx("text-slate-900", !isSel && "hover:bg-slate-100") : "text-slate-400")}>
                {Number(d.slice(8))}
                {n > 0 && !past && <span className={cx("absolute bottom-1.5 h-1 rounded-full", isSel ? "bg-slate-900" : "bg-violet-600", n >= 6 ? "w-7" : n >= 3 ? "w-5" : "w-2.5")} />}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="h-px flex-1 bg-slate-200" />
        {selected ? <span><b className="capitalize text-slate-700">{fmtDate(selected, "EEEE d MMMM")}</b> · {boards.length} tableau{boards.length > 1 ? "x" : ""}</span> : <span>Aucun tournoi ce mois-ci</span>}
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {boards.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {boards.map((b, i) => {
            const hour = hourFromLabel(b.t.name);
            const names = who[b.t.id] ?? [];
            return (
              <button key={b.t.id + i} onClick={() => onOpen(b.t)} data-fft={b.t.id} className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50">
                <div className="w-20 shrink-0 border-r border-slate-200 pr-2 text-center font-display uppercase italic leading-none">
                  <div className="text-2xl text-violet-600">{b.level ?? "—"}</div>
                  {b.nature && <div className={cx("mt-0.5 text-sm", GENDER[b.nature].cls)}>{GENDER[b.nature].label}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-lg uppercase leading-tight text-slate-900">{b.t.club || b.t.name}</div>
                  <div className="truncate text-sm text-slate-500">{b.t.city ? b.t.city.charAt(0) + b.t.city.slice(1).toLowerCase() : ""}{b.t.distance_km != null ? ` · ${Math.round(b.t.distance_km)} km` : ""}</div>
                  {(names.length > 0 || (myIds.has(b.t.id) && !isCoach)) && (
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                      {myIds.has(b.t.id) && !isCoach && <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700"><Check className="size-3" />Dans mon suivi</span>}
                      {names.length > 0 && <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700"><Users className="size-3" />{names.join(", ")}</span>}
                    </div>
                  )}
                </div>
                {hour && <span className="font-display text-lg text-violet-700">{hour}</span>}
                <ChevronRight className="size-5 shrink-0 text-slate-400" />
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function FftRow({ t, who, mine, isCoach, onOpen }: { t: FftTournament; who: string[]; mine: boolean; isCoach: boolean; onOpen: () => void }) {
  const multi = t.end && t.end !== t.start;
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50" data-fft={t.id}>
      <div className="w-12 shrink-0 text-center">
        <div className="text-[11px] font-medium uppercase text-slate-500">{fmtDate(t.start, "EEE")}</div>
        <div className="text-lg font-semibold leading-none">{fmtDate(t.start, "d")}</div>
        <div className="text-[11px] text-slate-500">{multi ? `→ ${fmtDate(t.end, "d")}` : fmtDate(t.start, "MMM")}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{t.name}</span>
          {t.levels.map((l) => <Badge key={l} className="bg-slate-900 text-white ring-slate-900">{l}</Badge>)}
          {t.natures.map((n) => <Badge key={n} className="bg-slate-50 text-slate-600 ring-slate-200">{FFT_NATURES[n]}</Badge>)}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" />{[t.club, t.city].filter(Boolean).join(", ")}</span>
          {t.distance_km != null && <span>{Math.round(t.distance_km)} km</span>}
        </div>
        {(who.length > 0 || mine) && (
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {mine && !isCoach && <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700"><Check className="size-3" />Dans mon suivi</span>}
            {who.length > 0 && <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700"><Users className="size-3" />{who.join(", ")}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

function FftDetailModal({ t, players, mine, onClose, onAdded }: {
  t: FftTournament | null; players: PlayerStats[]; mine: hub.Tournament[]; onClose: () => void; onAdded: () => void;
}) {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const toast = useToast();
  const [detail, setDetail] = useState<FftDetail | null>(null);
  const [dErr, setDErr] = useState<string | null>(null);
  const [f, setF] = useState({ player_id: "", category: "P100", partner_name: "", status: "registered" as hub.TournamentStatus, goal: "", coaching_request: false });
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  if ((t?.id ?? null) !== last) {
    setLast(t?.id ?? null);
    setDetail(null); setDErr(null);
    if (t) setF({ player_id: players[0]?.id ?? "", category: guessCategory(t), partner_name: "", status: "registered", goal: "", coaching_request: false });
  }
  useEffect(() => {
    if (!t) return;
    let alive = true;
    hub.getFftDetail(t.id).then((d) => {
      if (!alive) return;
      setDetail(d);
      if (d.levels.length && !t.levels.length) setF((x) => ({ ...x, category: d.levels[0] }));
    }).catch((e) => alive && setDErr(errMsg(e)));
    return () => { alive = false; };
  }, [t]);

  if (!t) return null;
  const pid = isCoach ? f.player_id : profile.player_id;
  const already = mine.find((m) => m.fft_id === t.id && m.player_id === pid && m.status !== "cancelled");
  const cats = [...new Set([...(detail?.levels ?? []), ...t.levels, ...hub.TOURNAMENT_CATEGORIES])];

  async function add() {
    if (!t) return;
    if (isCoach && !f.player_id) return toast("Choisis le joueur", "err");
    setBusy(true);
    try {
      await hub.saveTournament(null, {
        owner_id: (isCoach ? profile.id : profile.coach_id) ?? undefined, player_id: pid ?? undefined,
        name: t.name, start_date: t.start, end_date: t.end && t.end !== t.start ? t.end : null,
        club: t.club || null, city: t.city || null, category: f.category, partner_name: f.partner_name.trim() || null,
        status: f.status, goal: f.goal.trim() || null, coaching_request: f.coaching_request, fft_id: t.id, fft_url: t.url,
      });
      toast(isCoach ? "Tournoi ajouté au suivi du joueur" : "Ajouté à ton suivi 🎾");
      onAdded();
    } catch (e) {
      const m = errMsg(e);
      toast(m.includes("tournaments_player_fft_uidx") || m.includes("duplicate") ? "Ce tournoi est déjà dans le suivi" : m, "err");
    } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={t.name}
      footer={<>
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="mr-auto inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline">
          S&apos;inscrire sur Ten&apos;Up <ExternalLink className="size-3.5" /></a>
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
        {!already && <Button onClick={add} loading={busy}><CalendarCheck className="size-4" />{isCoach ? "Ajouter au suivi" : "J'y participe"}</Button>}
      </>}>
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          <div className="font-medium text-slate-900">{fmtDate(t.start, "EEEE d MMMM yyyy")}{t.end && t.end !== t.start ? ` → ${fmtDate(t.end, "EEEE d MMMM")}` : ""}</div>
          <div className="mt-0.5 flex items-center gap-1"><MapPin className="size-3.5" />{t.club}{detail?.address ? ` · ${detail.address}` : t.city ? ` · ${t.city}` : ""}</div>
        </div>

        {!detail && !dErr && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner />Lecture de la fiche Ten&apos;Up…</div>}
        {dErr && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Détail des épreuves indisponible ({dErr}). Tu peux quand même l&apos;ajouter.</p>}
        {detail && detail.events.length > 0 && (
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-3 py-2">Épreuve</th><th className="px-3 py-2">Cat.</th><th className="px-3 py-2">Prix</th><th className="px-3 py-2">Inscriptions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {detail.events.map((e, i) => (
                  <tr key={i}><td className="px-3 py-2">{e.label || FFT_NATURES[e.nature as FftNature] || e.nature}</td><td className="px-3 py-2 font-semibold">{e.category ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{e.price != null ? `${e.price} €` : "—"}</td>
                    <td className="px-3 py-2">{e.open ? <span className="text-emerald-700">Ouvertes</span> : <span className="text-slate-400">—</span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {already ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Check className="size-4" />{isCoach ? "Déjà dans le suivi de ce joueur." : "Déjà dans ton suivi. Pense à t'inscrire sur Ten'Up !"}</p>
        ) : (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-900">{isCoach ? "Ajouter au suivi d'un joueur" : "Ajouter à mon suivi"}</div>
            {isCoach && (
              <Field label="Joueur">
                <Select value={f.player_id} onChange={(e) => setF({ ...f, player_id: e.target.value })}>
                  {players.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Catégorie"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Statut"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as hub.TournamentStatus })}>
                <option value="considered">Envisagé</option><option value="registered">Inscrit</option><option value="confirmed">Confirmé</option></Select></Field>
            </div>
            <Field label="Partenaire"><Input value={f.partner_name} onChange={(e) => setF({ ...f, partner_name: e.target.value })} /></Field>
            <Field label="Objectif sportif"><Input value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="Ex. sortir des poules" /></Field>
            {!isCoach && <Checkbox label="Demander un accompagnement coaching" checked={f.coaching_request} onChange={(v) => setF({ ...f, coaching_request: v })} />}
          </div>
        )}
      </div>
    </Modal>
  );
}

function FftSettingsCard({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<hub.FftSettings | null>(null);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { hub.getFftSettings().then(setS).catch((e) => toast(errMsg(e), "err")); }, []);
  if (!s) return <Spinner />;
  const center = CENTERS.find((c) => c.label === s.center_label)?.label ?? "";
  async function save() {
    if (!s) return;
    setBusy(true);
    try { await hub.saveFftSettings(s); toast("Réglages du calendrier FFT enregistrés"); onSaved(); }
    catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Card className="space-y-3 p-4">
      <div className="font-semibold text-slate-900">Import du calendrier FFT</div>
      <Checkbox label="Afficher le calendrier des tournois FFT à mes joueurs et à moi" checked={s.enabled} onChange={(v) => setS({ ...s, enabled: v })}
        hint="Décoche pour couper l'import immédiatement, sans rien supprimer." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Centre de la zone">
          <Select value={center} onChange={(e) => { const c = CENTERS.find((x) => x.label === e.target.value); if (c) setS({ ...s, center_label: c.label, lat: c.lat, lng: c.lng }); }}>
            {!center && <option value="">{s.center_label}</option>}
            {CENTERS.map((c) => <option key={c.label}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Rayon">
          <Select value={s.radius_km} onChange={(e) => setS({ ...s, radius_km: Number(e.target.value) })}>
            {[50, 100, 150, 200, 300].map((r) => <option key={r} value={r}>{r} km</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end"><Button onClick={save} loading={busy}>Enregistrer</Button></div>
    </Card>
  );
}

