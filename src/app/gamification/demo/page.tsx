"use client";
/* PADEL LEGENDS — Mode démo (coach) : simulation 100 % dans le navigateur.
   Mêmes composants et mêmes règles que la plateforme ; aucune écriture en base (XP, Coins, crédits, commandes, fil). */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FlaskConical, RotateCcw } from "lucide-react";
import { PlayerLegendsView, UnlockOverlay, type LegendsTab } from "@/components/Legends";
import { LegendCard, ProfileFrame } from "@/components/LegendCard";
import { Badge, Button, Card, cx, ErrorBox, Input, PageHeader, Spinner, useToast } from "@/components/ui";
import { useAsync } from "@/lib/hooks";
import { useIsCoach } from "@/lib/role";
import * as L from "@/lib/legends";

export default function LegendsDemo() {
  const coach = useIsCoach();
  const toast = useToast();
  const ref = useAsync(async () => {
    const [levels, catalog, rules] = await Promise.all([L.getLevels(), L.getBadgeCatalog(), L.getActiveRules()]);
    return { levels, catalog, rules };
  }, []);
  const [profileKey, setProfileKey] = useState("regular");
  const [xpBy, setXpBy] = useState<Record<string, number>>(() => Object.fromEntries(L.DEMO_PROFILES.map((p) => [p.key, p.xp])));
  const [favBy, setFavBy] = useState<Record<string, number | null>>({});
  const [tab, setTab] = useState<LegendsTab>("home");
  const [anim, setAnim] = useState(true);
  const [unlock, setUnlock] = useState<L.MascotLevel | null>(null);
  const profile = L.DEMO_PROFILES.find((p) => p.key === profileKey)!;
  const xp = xpBy[profileKey];
  const levels = ref.data?.levels ?? [];
  const level = levels.length ? L.levelInfo(levels, xp).current.level : 1;
  // niveau « validé » (au relâchement du curseur) : l'animation ne se joue qu'une fois le nouveau total choisi
  const committed = useRef<Record<string, number>>({});
  const commit = (value?: number) => {
    if (!levels.length) return;
    const v = value ?? xp;
    const lv = L.levelInfo(levels, v).current.level;
    const before = committed.current[profileKey] ?? L.levelInfo(levels, L.DEMO_PROFILES.find((p) => p.key === profileKey)!.xp).current.level;
    if (anim && lv > before) setUnlock(levels.find((l) => l.level === lv) ?? null);
    committed.current[profileKey] = lv;
  };
  const setXp = (v: number, now = false) => { setXpBy((x) => ({ ...x, [profileKey]: v })); if (now) commit(v); };

  const space = useMemo(() => ref.data ? L.simulateSpace(ref.data.levels, ref.data.catalog, ref.data.rules, profile.name, xp,
    favBy[profileKey] && favBy[profileKey]! <= level ? favBy[profileKey]! : null) : null, [ref.data, profile, xp, favBy, profileKey, level]);
  const ranking = useMemo(() => levels.length ? L.demoRanking(profileKey, (p) => xpBy[p.key], levels) : [], [levels, profileKey, xpBy]);

  if (!coach) return <ErrorBox error="Le mode démo est réservé au coach." />;
  if (ref.loading && !ref.data) return <Spinner />;
  if (ref.error || !space) return <ErrorBox error={ref.error ?? "Données indisponibles"} onRetry={ref.reload} />;
  const frame = L.profileFrame(level);
  const title = L.profileTitle(level);
  const shown = levels.find((l) => l.level === L.displayedCardLevel(level, space.profile.favorite_level))!;

  return (
    <div>
      <Link href="/gamification" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft className="size-4" /> Gamification</Link>
      <PageHeader title="Padel Legends · Mode démo" subtitle="Teste les 20 cartes, les raretés, les déblocages et le Prestige" />

      <Card className="mb-4 space-y-4 border-2 border-dashed border-violet-300 bg-violet-50/40 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-violet-900">
          <FlaskConical className="size-4" />
          <b>Simulation isolée :</b> tout se passe dans ton navigateur. Aucun XP, Coin, crédit, commande, stock ou publication réels ne sont modifiés.
        </div>
        <div className="flex flex-wrap gap-2">
          {L.DEMO_PROFILES.map((p) => (
            <button key={p.key} onClick={() => setProfileKey(p.key)} className={cx("rounded-xl px-3 py-1.5 text-left text-sm ring-1 transition",
              p.key === profileKey ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")}>
              <div className="font-semibold">{p.label}</div><div className={cx("text-xs", p.key === profileKey ? "text-violet-100" : "text-slate-500")}>{p.name} · {xpBy[p.key].toLocaleString("fr-FR")} XP</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-64 flex-1 items-center gap-3">
            <span className="text-sm font-medium text-slate-700">XP simulés</span>
            <input type="range" min={0} max={5500} step={10} value={xp} aria-label="XP simulés" className="flex-1 accent-violet-600"
              onChange={(e) => setXp(Number(e.target.value))} onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
              onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))} />
            <div className="w-24 shrink-0"><Input type="number" min={0} max={5500} value={xp} className="h-9" aria-label="Total XP"
              onChange={(e) => setXp(Math.max(0, Math.min(5500, Number(e.target.value) || 0)))} onBlur={() => commit()} /></div>
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" className="accent-violet-600" checked={anim} onChange={(e) => setAnim(e.target.checked)} /> Animation de déblocage</label>
          <Button variant="secondary" size="sm" onClick={() => {
            setXpBy(Object.fromEntries(L.DEMO_PROFILES.map((p) => [p.key, p.xp]))); setFavBy({}); setProfileKey("regular"); setTab("home"); committed.current = {}; toast("Scénario de démo réinitialisé");
          }}><RotateCcw className="size-4" /> Réinitialiser</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[0, 40, 150, 600, 1450, 2450, 3000, 3500, 4500, 5500].map((v) => (
            <button key={v} data-xp={v} onClick={() => setXp(v, true)} className="rounded-full bg-white px-2.5 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200 hover:bg-violet-50">{v.toLocaleString("fr-FR")} XP</button>
          ))}
        </div>
        {/* profil tel qu'il apparaît dans la communauté (récompenses numériques) */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <ProfileFrame frame={frame}><span className="grid size-10 place-items-center rounded-full bg-violet-100 font-semibold text-violet-700">{profile.name[0]}</span></ProfileFrame>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{profile.name} {title && <Badge className={level >= 20 ? "bg-slate-900 text-amber-300 ring-amber-400" : "bg-amber-50 text-amber-700 ring-amber-300"}>{title}</Badge>}</div>
            <div className="text-xs text-slate-500">Aperçu dans le fil d&apos;actualité · carte affichée : {shown.status}{space.profile.favorite_level ? " (favorite)" : ""}</div>
          </div>
          <LegendCard card={shown} size="xs" prestige={space.profile.prestige} />
        </div>
      </Card>

      <PlayerLegendsView space={space} tab={tab} onTab={setTab} demoRanking={ranking}
        onFavorite={(lv) => { setFavBy({ ...favBy, [profileKey]: lv }); toast(lv ? "Carte favorite (démo)" : "Carte actuelle affichée (démo)"); }} />
      {unlock && <UnlockOverlay card={unlock} prestige={space.profile.prestige} demo onClose={() => setUnlock(null)} />}
    </div>
  );
}
