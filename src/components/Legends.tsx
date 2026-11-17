"use client";
/* PADEL LEGENDS – composants d'affichage (joueur et coach) */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Flame, Lock, Medal, Sparkles, Trophy } from "lucide-react";
import * as L from "@/lib/legends";
import { fmtDate, timeAgo } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { Badge, Card, cx, Empty, ErrorBox, Modal, Segmented, Select, Spinner, StatTile } from "./ui";

/* ------------------------------ Mascotte (illustration ou image provisoire) ------------------------------ */
export function MascotArt({ level, locked, size = "md", prestige = 0, className }: {
  level: L.MascotLevel; locked?: boolean; size?: "sm" | "md" | "lg" | "xl"; prestige?: number; className?: string;
}) {
  const r = L.RARITY[level.rarity];
  const box = { sm: "size-12 rounded-xl", md: "size-20 rounded-2xl", lg: "size-28 rounded-3xl", xl: "size-36 rounded-3xl" }[size];
  const emoji = { sm: "text-2xl", md: "text-4xl", lg: "text-6xl", xl: "text-7xl" }[size];
  const ring = prestige >= 1 ? "ring-amber-400" : r.frame;
  return (
    <div className={cx("relative shrink-0", className)}>
      <div className={cx("relative grid place-items-center overflow-hidden bg-gradient-to-br ring-2 ring-offset-2 ring-offset-white", box, r.bg, ring,
        r.glow && !locked && `shadow-lg ${r.glow}`, prestige >= 3 && "ring-4", locked && "grayscale opacity-50")}>
        {level.image_url && !locked
          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={level.image_url} alt={level.mascot} className="size-full object-cover" />
          : <span className={cx(emoji, "drop-shadow-sm select-none")} aria-hidden>{level.emoji}</span>}
        {!level.image_url && !locked && size !== "sm" && (
          <span className="absolute bottom-1 right-1 text-[0.65em] leading-none" aria-hidden title="Raquette de padel">🎾</span>
        )}
        {locked && <Lock className="absolute size-5 text-slate-600" />}
      </div>
      {prestige > 0 && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-400 px-1.5 text-[10px] font-bold leading-4 text-amber-950 shadow">
          {"★".repeat(prestige)}
        </div>
      )}
    </div>
  );
}

export function LevelChip({ level, prestige = 0 }: { level: number; prestige?: number }) {
  return <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Niv. {level}{prestige > 0 ? ` ${"★".repeat(prestige)}` : ""}</Badge>;
}

export function XpBar({ space, compact }: { space: Pick<L.PlayerSpace, "levels" | "profile">; compact?: boolean }) {
  const xp = space.profile?.total_xp ?? 0;
  const info = L.levelInfo(space.levels, xp);
  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-violet-100">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${Math.max(2, Math.min(100, info.pct))}%` }} />
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span className="tabular-nums">{xp} XP</span>
          <span>{info.toNext > 0 ? <>encore <b className="text-slate-700">{info.toNext} XP</b> → {info.nextLabel}</> : info.nextLabel}</span>
        </div>
      )}
    </div>
  );
}

/* Carte résumé (Mon espace, fiche joueur coach) */
export function LegendsSummaryCard({ playerId, href }: { playerId?: string; href: string }) {
  const { data } = useAsync(() => L.getPlayerSpace(playerId).catch(() => null), [playerId]);
  if (!data?.profile) return null;
  const lvl = data.levels.find((l) => l.level === data.profile.level) ?? data.levels[0];
  return (
    <Link href={href} className="block">
      <Card className="flex items-center gap-4 p-4 transition hover:ring-violet-300">
        <MascotArt level={lvl} size="md" prestige={data.profile.prestige} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-600"><Sparkles className="size-3.5" /> Padel Legends</div>
          <div className="truncate font-semibold text-slate-900">Niveau {lvl.level} · {lvl.status}</div>
          <div className="mb-1.5 text-xs text-slate-500">{lvl.mascot} · 🔥 {data.profile.current_streak} sem. · {data.profile.sessions_count} séances</div>
          <XpBar space={data} />
        </div>
      </Card>
    </Link>
  );
}

/* ------------------------------ Vue complète d'un joueur ------------------------------ */
export type LegendsTab = "home" | "mascots" | "badges" | "history" | "ranking";

export function PlayerLegendsView({ space, tab, onTab, coachMode, onToggleHidden }: {
  space: L.PlayerSpace; tab: LegendsTab; onTab: (t: LegendsTab) => void; coachMode?: boolean; onToggleHidden?: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented value={tab} onChange={onTab} options={[
          { value: "home", label: "Accueil" }, { value: "mascots", label: "Mascottes" }, { value: "badges", label: "Badges" },
          { value: "history", label: "Historique" }, { value: "ranking", label: "Classement" },
        ]} />
      </div>
      {tab === "home" && <LegendsHome space={space} onTab={onTab} />}
      {tab === "mascots" && <MascotGallery space={space} />}
      {tab === "badges" && <BadgeGrid badges={space.badges} />}
      {tab === "history" && <XpHistory items={space.history} />}
      {tab === "ranking" && <Ranking coachMode={coachMode} hidden={space.profile?.hide_from_ranking} onToggleHidden={onToggleHidden} />}
    </div>
  );
}

function LegendsHome({ space, onTab }: { space: L.PlayerSpace; onTab: (t: LegendsTab) => void }) {
  const p = space.profile;
  const info = L.levelInfo(space.levels, p.total_xp);
  const lvl = info.current;
  const r = L.RARITY[lvl.rarity];
  const recentBadges = space.badges.filter((b) => b.earned_at).sort((a, b) => b.earned_at!.localeCompare(a.earned_at!)).slice(0, 4);
  return (
    <div className="space-y-4">
      <Card className={cx("overflow-hidden bg-gradient-to-br p-5", p.prestige > 0 ? "from-amber-50 via-white to-violet-50 ring-amber-300" : "from-violet-50 via-white to-fuchsia-50")}>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <MascotArt level={lvl} size="xl" prestige={p.prestige} />
          <div className="w-full min-w-0 flex-1 text-center sm:text-left">
            <div className={cx("text-xs font-semibold uppercase tracking-wide", r.text)}>{r.label} · Niveau {lvl.level}</div>
            <h2 className="text-2xl font-bold text-slate-900">{lvl.status}{p.prestige > 0 && <span className="ml-2 text-amber-500">{"★".repeat(p.prestige)}</span>}</h2>
            <p className="text-sm text-slate-600">Mascotte : <b>{lvl.mascot}</b></p>
            <div className="my-3 text-3xl font-bold tabular-nums text-violet-700">{p.total_xp} <span className="text-base font-semibold text-violet-400">XP</span></div>
            <XpBar space={space} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Série en cours" value={<span className="flex items-center gap-1"><Flame className="size-5 text-orange-500" />{p.current_streak}</span>} hint={`semaine${p.current_streak > 1 ? "s" : ""} · record ${p.best_streak}`} />
        <StatTile label="Séances" value={p.sessions_count} hint="effectuées" />
        <StatTile label="Tournois" value={p.tournaments_count} hint={`${p.wins_count} victoire${p.wins_count > 1 ? "s" : ""}`} />
        <StatTile label={space.season.name} value={space.season.xp} hint="XP cette saison" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Derniers XP gagnés</h3>
            <button className="text-sm text-violet-600" onClick={() => onTab("history")}>Tout voir</button>
          </div>
          {space.history.length === 0 ? <p className="text-sm text-slate-500">Ta première séance validée par le coach te rapportera tes premiers XP.</p>
            : <XpHistory items={space.history.slice(0, 5)} bare />}
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Badges récents</h3>
            <button className="text-sm text-violet-600" onClick={() => onTab("badges")}>Collection</button>
          </div>
          {recentBadges.length === 0 ? <p className="text-sm text-slate-500">Aucun badge pour l&apos;instant : « Premier Pas » t&apos;attend dès ta première séance.</p> : (
            <div className="grid grid-cols-2 gap-2">
              {recentBadges.map((b) => (
                <div key={b.code} className="flex items-center gap-2 rounded-xl bg-violet-50/60 p-2">
                  <span className="text-2xl">{b.icon}</span>
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{b.name}</div><div className="text-xs text-slate-500">{fmtDate(b.earned_at!.slice(0, 10), "d MMM yyyy")}</div></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <HowToEarn space={space} />
    </div>
  );
}

function HowToEarn({ space }: { space: L.PlayerSpace }) {
  const by = (c: L.XpRule["category"]) => space.rules.filter((r) => r.category === c);
  const tiers = (["t1", "t2", "t3"] as const).map((t) => ({ t, rows: by("tournament").filter((r) => r.code.startsWith(t + "_")) }));
  return (
    <Card className="p-4">
      <h3 className="mb-1 font-semibold text-slate-900">Comment gagner des XP ?</h3>
      <p className="mb-3 text-xs text-slate-500">
        Les XP récompensent d&apos;abord ta régularité. Ils ne sont ni une monnaie ni échangeables. Une séance compte quand tu es noté présent et que le coach l&apos;a validée.
        {space.neutral_rules.auto && " Une semaine sans séance prévue pour toi (vacances, annulation) ne casse pas ta série."}
        {space.neutral_rules.excused && " Une absence excusée préserve aussi ta série."}
      </p>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <RuleList title="Entraînement" icon={<CalendarCheck className="size-4" />} rows={[...by("session"), ...by("streak"), ...by("milestone")]} />
        {tiers.map(({ t, rows }) => rows.length > 0 && (
          <RuleList key={t} title={`Tournoi ${L.TIER_LABEL[t]}`} icon={<Trophy className="size-4" />} rows={rows.map((r) => ({ ...r, label: r.label.split("·")[1]?.trim() ?? r.label }))} />
        ))}
      </div>
    </Card>
  );
}
function RuleList({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: L.XpRule[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{title}</div>
      {rows.map((r) => <div key={r.code} className="flex justify-between gap-2 py-0.5"><span className="text-slate-700">{r.label}</span><b className="tabular-nums text-violet-700">+{r.xp}</b></div>)}
    </div>
  );
}

/* ------------------------------ Galerie des 20 mascottes ------------------------------ */
export function MascotGallery({ space }: { space: Pick<L.PlayerSpace, "levels" | "profile"> }) {
  const [open, setOpen] = useState<L.MascotLevel | null>(null);
  const xp = space.profile?.total_xp ?? 0;
  const unlocked = space.levels.filter((l) => xp >= l.xp_required).length;
  return (
    <>
      <p className="text-sm text-slate-600"><b>{unlocked}/20</b> mascottes débloquées. Touche une mascotte pour voir sa fiche.</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {space.levels.map((l) => {
          const locked = xp < l.xp_required;
          return (
            <button key={l.level} type="button" onClick={() => setOpen(l)}
              className={cx("flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center ring-1 ring-slate-200/80 transition hover:-translate-y-0.5",
                l.level === space.profile?.level && "ring-2 ring-violet-500")}>
              <MascotArt level={l} locked={locked} size="md" />
              <div className="min-w-0">
                <div className={cx("truncate text-sm font-semibold", locked ? "text-slate-400" : "text-slate-900")}>{l.mascot}</div>
                <div className="text-[11px] text-slate-500">{locked ? `${l.xp_required} XP` : `Niv. ${l.level} · ${l.status}`}</div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">Illustrations provisoires : les mascottes 3D définitives arriveront bientôt.</p>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.mascot} · Niveau ${open.level}` : ""}>
        {open && (
          <div className="flex flex-col items-center gap-3 text-center">
            <MascotArt level={open} locked={xp < open.xp_required} size="xl" />
            <Badge className={cx("bg-white ring-slate-200", L.RARITY[open.rarity].text)}>{L.RARITY[open.rarity].label}</Badge>
            <div className="text-lg font-semibold">{open.status}</div>
            <p className="text-sm text-slate-600">{open.description}</p>
            <p className="text-sm">{xp >= open.xp_required
              ? <span className="text-emerald-700">✓ Débloquée ({open.xp_required} XP)</span>
              : <span className="text-slate-600">Se débloque à <b>{open.xp_required} XP</b> · encore {open.xp_required - xp} XP</span>}</p>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------ Badges ------------------------------ */
export function BadgeGrid({ badges }: { badges: L.BadgeItem[] }) {
  const cats: L.BadgeItem["category"][] = ["fidelite", "regularite", "competition"];
  const n = badges.filter((b) => b.earned_at).length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600"><b>{n}/{badges.length}</b> badges débloqués.</p>
      {cats.map((c) => (
        <section key={c}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{L.BADGE_CATEGORY[c]}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {badges.filter((b) => b.category === c).map((b) => (
              <Card key={b.code} className={cx("flex items-center gap-3 p-3", !b.earned_at && "bg-slate-50")}>
                <span className={cx("grid size-11 shrink-0 place-items-center rounded-xl text-2xl", b.earned_at ? "bg-violet-100" : "bg-slate-200 grayscale opacity-60")}>
                  {b.earned_at ? b.icon : <Lock className="size-4 text-slate-500" />}
                </span>
                <div className="min-w-0">
                  <div className={cx("text-sm font-semibold", !b.earned_at && "text-slate-500")}>{b.name}</div>
                  <div className="text-xs text-slate-500">{b.description}</div>
                  {b.earned_at && <div className="text-[11px] text-emerald-700">Obtenu le {fmtDate(b.earned_at.slice(0, 10), "d MMM yyyy")}</div>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------ Historique XP ------------------------------ */
const SOURCE_TONE: Record<L.XpSource, string> = {
  session: "bg-violet-50 text-violet-700 ring-violet-200", streak: "bg-orange-50 text-orange-700 ring-orange-200",
  milestone: "bg-sky-50 text-sky-700 ring-sky-200", tournament: "bg-amber-50 text-amber-700 ring-amber-200",
  bonus: "bg-emerald-50 text-emerald-700 ring-emerald-200", correction: "bg-slate-100 text-slate-600 ring-slate-200",
};
export function XpHistory({ items, bare }: { items: L.XpTx[]; bare?: boolean }) {
  if (items.length === 0) return <Empty>Aucun XP pour l&apos;instant.</Empty>;
  const list = (
    <ul className="divide-y divide-slate-100">
      {items.map((t) => (
        <li key={t.id} className="flex items-start gap-3 py-2.5">
          <div className="w-14 shrink-0 pt-0.5 text-xs text-slate-500">{fmtDate(t.occurred_on, "d MMM")}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-800">{t.label}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge className={SOURCE_TONE[t.source]}>{L.SOURCE_LABEL[t.source]}</Badge>
              {t.is_adjustment && <Badge className="bg-slate-100 text-slate-600 ring-slate-200">Correction</Badge>}
              {t.reason && <span className="text-xs text-slate-500">{t.reason}</span>}
            </div>
          </div>
          <div className={cx("shrink-0 font-semibold tabular-nums", t.xp >= 0 ? "text-emerald-600" : "text-rose-600")}>{t.xp > 0 ? "+" : ""}{t.xp}</div>
        </li>
      ))}
    </ul>
  );
  return bare ? list : <Card className="px-4 py-1">{list}</Card>;
}

/* ------------------------------ Classements ------------------------------ */
export function Ranking({ coachMode, hidden, onToggleHidden }: { coachMode?: boolean; hidden?: boolean; onToggleHidden?: (v: boolean) => void }) {
  const [scope, setScope] = useState<"all" | "season">("season");
  const [seasonId, setSeasonId] = useState<string>("");
  const seasons = useAsync(() => L.getSeasons(), []);
  const rows = useAsync(() => L.getRanking(scope, seasonId || null), [scope, seasonId]);
  const levels = useMemo(() => rows.data, [rows.data]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={scope} onChange={setScope} options={[{ value: "season", label: "Saison" }, { value: "all", label: "Permanent" }]} />
        {scope === "season" && (seasons.data?.length ?? 0) > 1 && (
          <Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className="w-auto">
            {seasons.data!.map((s, i) => <option key={s.id} value={i === 0 && s.status === "active" ? "" : s.id}>{s.name}{s.status === "archived" ? " (archivée)" : ""}</option>)}
          </Select>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {scope === "season" ? "XP gagnés pendant la saison (3 mois). À la fin de la saison, le classement est archivé ; tes XP, niveau, mascottes et badges sont conservés." : "XP cumulés depuis le début."}
      </p>
      {rows.loading ? <Spinner /> : rows.error ? <ErrorBox error={rows.error} onRetry={rows.reload} /> : !levels?.length ? <Empty>Pas encore de classement.</Empty> : (
        <Card className="divide-y divide-slate-100">
          {levels.map((r) => (
            <div key={r.player_id} className={cx("flex items-center gap-3 px-4 py-2.5", r.is_me && "bg-violet-50/70")}>
              <div className={cx("w-7 text-center font-bold tabular-nums", r.rank === 1 ? "text-amber-500" : r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-orange-400" : "text-slate-500")}>
                {r.rank <= 3 ? <Medal className="mx-auto size-5" /> : r.rank}
              </div>
              <div className="min-w-0 flex-1">
                {coachMode ? <Link href={`/gamification/joueur/${r.player_id}`} className="font-medium text-slate-900 hover:text-violet-700">{r.first_name} {r.last_name}</Link>
                  : <span className="font-medium text-slate-900">{r.first_name} {r.last_name}{r.is_me && " (toi)"}</span>}
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><LevelChip level={r.level} prestige={r.prestige} />{r.hidden && <span>· masqué aux joueurs</span>}</div>
              </div>
              <div className="font-semibold tabular-nums text-violet-700">{r.xp} XP</div>
            </div>
          ))}
        </Card>
      )}
      {!coachMode && onToggleHidden && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-violet-600" checked={!!hidden} onChange={(e) => onToggleHidden(e.target.checked)} />
          Masquer ma présence dans les classements visibles par les autres joueurs
        </label>
      )}
    </div>
  );
}

export { timeAgo };
