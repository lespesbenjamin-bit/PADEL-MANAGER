"use client";
/* PADEL LEGENDS — « La collection des 20 » : composants d'affichage (joueur, coach et mode démo) */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Flame, Gift, Heart, Lock, Medal, Sparkles, Trophy } from "lucide-react";
import * as L from "@/lib/legends";
import { fmtDate, timeAgo } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { Badge, Button, Card, cx, Empty, ErrorBox, Modal, Segmented, Select, Spinner, StatTile } from "./ui";
import { LegendCard } from "./LegendCard";

export { LegendCard };

export function LevelChip({ level, prestige = 0 }: { level: number; prestige?: number }) {
  return <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Niv. {level}{prestige > 0 ? ` ${"★".repeat(prestige)}` : ""}</Badge>;
}

export function XpBar({ space, compact }: { space: Pick<L.PlayerSpace, "levels" | "profile">; compact?: boolean }) {
  const xp = space.profile?.total_xp ?? 0;
  const info = L.levelInfo(space.levels, xp);
  return (
    <div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-violet-100">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-ball transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, info.pct))}%` }} />
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
          <span className="tabular-nums">{xp.toLocaleString("fr-FR")} XP</span>
          <span className="text-right">{info.toNext > 0 ? <>encore <b className="text-slate-700">{info.toNext} XP</b> → {info.nextLabel}</> : info.nextLabel}</span>
        </div>
      )}
    </div>
  );
}

/* Résumé (Mon espace, fiche joueur côté coach) */
export function LegendsSummaryCard({ playerId, href }: { playerId?: string; href: string }) {
  const { data } = useAsync(() => L.getPlayerSpace(playerId).catch(() => null), [playerId]);
  if (!data?.profile) return null;
  const card = data.levels.find((l) => l.level === data.profile.level) ?? data.levels[0];
  return (
    <Link href={href} className="block">
      <Card className="flex items-center gap-4 p-4 transition hover:ring-violet-300">
        <LegendCard card={card} size="sm" prestige={data.profile.prestige} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-600"><Sparkles className="size-3.5" /> Padel Legends</div>
          <div className="font-semibold leading-tight text-slate-900">{card.status}</div>
          <div className="mb-1.5 text-xs text-slate-500">Niveau {card.level} · {L.RARITY[card.rarity].label} · 🔥 {data.profile.current_streak} sem.</div>
          <XpBar space={data} />
        </div>
      </Card>
    </Link>
  );
}

/* ------------------------------ Vue complète d'un joueur (réelle ou démo) ------------------------------ */
export type LegendsTab = "home" | "collection" | "badges" | "history" | "ranking";

export function PlayerLegendsView({ space, tab, onTab, coachMode, onToggleHidden, onFavorite, demoRanking }: {
  space: L.PlayerSpace; tab: LegendsTab; onTab: (t: LegendsTab) => void; coachMode?: boolean;
  onToggleHidden?: (v: boolean) => void;
  /** choix de la carte favorite (absent = lecture seule) */
  onFavorite?: (level: number | null) => void | Promise<void>;
  /** mode démo : classement fictif, aucun appel serveur */
  demoRanking?: L.RankRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented value={tab} onChange={onTab} options={[
          { value: "home", label: "Ma carte" }, { value: "collection", label: "Collection" }, { value: "badges", label: "Badges" },
          { value: "history", label: "Historique" }, { value: "ranking", label: "Classement" },
        ]} />
      </div>
      {tab === "home" && <LegendsHome space={space} onTab={onTab} />}
      {tab === "collection" && <CardCollection space={space} onFavorite={onFavorite} />}
      {tab === "badges" && <BadgeGrid badges={space.badges} />}
      {tab === "history" && <XpHistory items={space.history} />}
      {tab === "ranking" && <Ranking coachMode={coachMode} hidden={space.profile?.hide_from_ranking} onToggleHidden={onToggleHidden} cards={space.levels} demoRows={demoRanking} />}
    </div>
  );
}

function LegendsHome({ space, onTab }: { space: L.PlayerSpace; onTab: (t: LegendsTab) => void }) {
  const p = space.profile;
  const info = L.levelInfo(space.levels, p.total_xp);
  const card = info.current;
  const fav = L.displayedCardLevel(p.level, p.favorite_level);
  const favCard = space.levels.find((l) => l.level === fav);
  const perks = L.perksUpTo(space.levels, 20);
  const recentBadges = space.badges.filter((b) => b.earned_at).sort((a, b) => b.earned_at!.localeCompare(a.earned_at!)).slice(0, 4);
  const dark = card.rarity === "or" || card.rarity === "legendaire";
  return (
    <div className="space-y-4">
      <Card className={cx("overflow-hidden p-5", dark ? "bg-gradient-to-br from-[#0b1b2e] via-[#0b3f76] to-[#06101c] text-white ring-violet-900" : "bg-gradient-to-br from-violet-50 via-white to-fuchsia-50")}>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <LegendCard card={card} size="lg" prestige={p.prestige} current />
          <div className="w-full min-w-0 flex-1 text-center sm:text-left">
            <div className={cx("text-xs font-semibold uppercase tracking-widest", dark ? "text-amber-300" : L.RARITY[card.rarity].text)}>
              Carte {L.RARITY[card.rarity].label} · Niveau {card.level}/20
            </div>
            <h2 className={cx("mt-1 text-2xl font-extrabold leading-tight", dark ? "text-white" : "text-slate-900")}>
              {card.status}{p.prestige > 0 && <span className="ml-2 text-amber-400">{"★".repeat(p.prestige)}</span>}
            </h2>
            <p className={cx("mt-1 italic", dark ? "text-violet-200" : "text-slate-600")}>« {card.punchline ?? card.description} »</p>
            <div className={cx("my-3 text-3xl font-bold tabular-nums", dark ? "text-amber-300" : "text-violet-700")}>
              {p.total_xp.toLocaleString("fr-FR")} <span className={cx("text-base font-semibold", dark ? "text-amber-200/70" : "text-violet-400")}>XP</span>
            </div>
            <div className={dark ? "[&_.text-slate-500]:text-violet-200 [&_.text-slate-700]:text-white" : ""}><XpBar space={space} /></div>
            {info.next && (
              <button onClick={() => onTab("collection")} className={cx("mt-3 flex items-center gap-2 text-sm", dark ? "text-violet-200" : "text-slate-600")}>
                <Lock className="size-3.5" /> Prochaine carte : <b>{info.next.status}</b>
              </button>
            )}
            {favCard && fav !== p.level && (
              <p className={cx("mt-2 text-xs", dark ? "text-violet-300" : "text-slate-500")}><Heart className="mr-1 inline size-3" />Carte affichée sur ton profil : {favCard.status}</p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Série en cours" value={<span className="flex items-center gap-1"><Flame className="size-5 text-orange-500" />{p.current_streak}</span>} hint={`semaine${p.current_streak > 1 ? "s" : ""} · record ${p.best_streak}`} />
        <StatTile label="Collection" value={`${p.level}/20`} hint={`dernière : n° ${String(p.level).padStart(2, "0")}`} />
        <StatTile label="Séances" value={p.sessions_count} hint={`${p.tournaments_count} tournoi${p.tournaments_count > 1 ? "s" : ""}`} />
        <StatTile label={space.season.name} value={space.season.xp} hint="XP cette saison" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Derniers XP</h3>
            <button className="text-sm text-violet-600" onClick={() => onTab("history")}>Tout voir</button>
          </div>
          {space.history.length === 0 ? <p className="text-sm text-slate-500">Ta première séance validée par le coach te rapportera tes premiers XP.</p>
            : <XpHistory items={space.history.slice(0, 4)} bare />}
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Badges récents</h3>
            <button className="text-sm text-violet-600" onClick={() => onTab("badges")}>Tous</button>
          </div>
          {recentBadges.length === 0 ? <p className="text-sm text-slate-500">« Premier Pas » t&apos;attend dès ta première séance.</p> : (
            <div className="space-y-2">
              {recentBadges.map((b) => (
                <div key={b.code} className="flex items-center gap-2">
                  <span className="text-xl">{b.icon}</span>
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{b.name}</div><div className="text-xs text-slate-500">{fmtDate(b.earned_at!.slice(0, 10), "d MMM yyyy")}</div></div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-1.5 font-semibold text-slate-900"><Gift className="size-4 text-violet-600" /> Récompenses numériques</h3>
          <ul className="space-y-1.5 text-sm">
            {perks.map((k) => (
              <li key={k.code} className={cx("flex items-center gap-2", p.level >= k.level ? "text-slate-800" : "text-slate-400")}>
                {p.level >= k.level ? <span className="text-emerald-600">✓</span> : <Lock className="size-3.5" />}
                <span className="flex-1">{k.label}</span><span className="text-xs">niv. {k.level}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">Récompenses 100 % numériques. Les objets se gagnent avec les Padel Coins dans le Shop.</p>
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
        Les cartes récompensent d&apos;abord ta régularité, pas ton niveau de jeu : un joueur très assidu peut décrocher les cartes les plus prestigieuses sans jamais gagner de tournoi.
        Une séance compte quand tu es noté présent et que le coach l&apos;a validée. Les XP ne sont ni une monnaie ni échangeables.
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

/* ------------------------------ Collection des 20 cartes ------------------------------ */
export function CardCollection({ space, onFavorite }: { space: Pick<L.PlayerSpace, "levels" | "profile">; onFavorite?: (level: number | null) => void | Promise<void> }) {
  const [rarity, setRarity] = useState<L.Rarity | "all">("all");
  const [open, setOpen] = useState<L.MascotLevel | null>(null);
  const [busy, setBusy] = useState(false);
  const level = space.profile?.level ?? 1;
  const xp = space.profile?.total_xp ?? 0;
  const fav = L.displayedCardLevel(level, space.profile?.favorite_level);
  const list = space.levels.filter((c) => rarity === "all" || c.rarity === rarity);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 text-sm text-slate-600"><b className="text-slate-900">{level}/20</b> cartes débloquées</span>
        {(["all", ...L.RARITY_ORDER] as const).map((r) => (
          <button key={r} onClick={() => setRarity(r)} className={cx("rounded-full px-3 py-1 text-sm font-medium ring-1 transition",
            rarity === r ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>
            {r === "all" ? "Toutes" : L.RARITY[r].label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {list.map((c) => (
          <LegendCard key={c.level} card={c} size="md" className="!w-full max-w-44" locked={c.level > level} current={c.level === level}
            favorite={c.level === fav && fav !== level} prestige={space.profile?.prestige} onClick={() => setOpen(c)} />
        ))}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Carte n° ${String(open.level).padStart(2, "0")}` : ""}>
        {open && (
          <div className="flex flex-col items-center gap-3 text-center">
            <LegendCard card={open} size="lg" locked={open.level > level} prestige={space.profile?.prestige} favorite={open.level === fav && fav !== level} />
            <Badge className={L.RARITY[open.rarity].chip}>{L.RARITY[open.rarity].label} · {L.RARITY[open.rarity].levels}</Badge>
            <div className="text-lg font-bold">{open.status}</div>
            {open.level <= level ? <p className="text-sm italic text-slate-600">« {open.punchline ?? open.description} »</p>
              : <p className="text-sm text-slate-600">Se débloque à <b>{open.xp_required.toLocaleString("fr-FR")} XP</b> · encore {(open.xp_required - xp).toLocaleString("fr-FR")} XP</p>}
            {(open.perks ?? []).length > 0 && <p className="text-xs text-violet-700">🎁 {open.perks.map((k) => k.label).join(" · ")}</p>}
            {onFavorite && open.level <= level && (
              level < 4 ? <p className="text-xs text-slate-500">Le choix de la carte favorite se débloque au niveau 4.</p>
              : open.level === fav ? (
                fav !== level ? <Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); try { await onFavorite(null); } finally { setBusy(false); setOpen(null); } }}>Revenir à ma carte actuelle</Button>
                  : <p className="text-xs text-slate-500">C&apos;est la carte affichée sur ton profil.</p>
              ) : (
                <Button loading={busy} onClick={async () => { setBusy(true); try { await onFavorite(open.level === level ? null : open.level); } finally { setBusy(false); setOpen(null); } }}>
                  <Heart className="size-4" /> Afficher sur mon profil
                </Button>
              )
            )}
            {open.level <= level && onFavorite && level >= 4 && <p className="text-[11px] text-slate-400">La carte favorite est purement visuelle : ton niveau réel ne change pas.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------ Déblocage d'une nouvelle carte ------------------------------ */
export function UnlockOverlay({ card, prestige, onShare, onClose, demo }: {
  card: L.MascotLevel; prestige?: number; onShare?: () => void | Promise<void>; onClose: () => void; demo?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-label="Nouvelle carte débloquée">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="text-xs font-semibold uppercase tracking-[.3em] text-amber-300">Nouvelle carte débloquée</div>
        <LegendCard card={card} size="lg" prestige={prestige} unlocking />
        <div className="text-white">
          <div className="text-xl font-extrabold">{card.status}</div>
          <div className="text-sm text-violet-200">Niveau {card.level} atteint · {L.RARITY[card.rarity].label}</div>
          {(card.perks ?? []).length > 0 && <div className="mt-1 text-sm text-amber-200">🎁 {card.perks.map((k) => k.label).join(" · ")}</div>}
        </div>
        {onShare ? (
          <div className="w-full space-y-2">
            <Button className="w-full" loading={busy} onClick={async () => { setBusy(true); try { await onShare(); } finally { setBusy(false); } }}>
              Partager sur le fil d&apos;actualité
            </Button>
            <button className="w-full text-sm text-violet-200 hover:text-white" onClick={onClose}>Plus tard</button>
            <p className="text-[11px] text-violet-300">Rien n&apos;est publié sans ton accord.</p>
          </div>
        ) : (
          <div className="w-full space-y-2">
            <Button className="w-full" onClick={onClose}>Continuer</Button>
            {demo && <p className="text-[11px] text-violet-300">Mode démo : rien n&apos;est publié ni enregistré.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

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
export function Ranking({ coachMode, hidden, onToggleHidden, cards, demoRows }: {
  coachMode?: boolean; hidden?: boolean; onToggleHidden?: (v: boolean) => void; cards?: L.MascotLevel[]; demoRows?: L.RankRow[];
}) {
  const [scope, setScope] = useState<"all" | "season">("season");
  const [seasonId, setSeasonId] = useState<string>("");
  const seasons = useAsync(() => (demoRows ? Promise.resolve([] as L.Season[]) : L.getSeasons()), [!!demoRows]);
  const rows = useAsync(() => (demoRows ? Promise.resolve(demoRows) : L.getRanking(scope, seasonId || null)), [scope, seasonId, demoRows]);
  const cardsQ = useAsync(() => (cards ? Promise.resolve(cards) : L.getLevels()), [cards]);
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
        {scope === "season" ? "XP gagnés pendant la saison (3 mois). À la fin de la saison, le classement est archivé ; tes XP, ton niveau, tes cartes et tes badges sont conservés." : "XP cumulés depuis le début."}
      </p>
      {rows.loading ? <Spinner /> : rows.error ? <ErrorBox error={rows.error} onRetry={rows.reload} /> : !levels?.length ? <Empty>Pas encore de classement.</Empty> : (
        <Card className="divide-y divide-slate-100">
          {levels.map((r) => (
            <div key={r.player_id} className={cx("flex items-center gap-3 px-4 py-2.5", r.is_me && "bg-violet-50/70")}>
              {cardsQ.data?.find((c) => c.level === r.level) && <LegendCard card={cardsQ.data.find((c) => c.level === r.level)!} size="xs" prestige={r.prestige} />}
              <div className={cx("w-7 text-center font-bold tabular-nums", r.rank === 1 ? "text-amber-500" : r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-orange-400" : "text-slate-500")}>
                {r.rank <= 3 ? <Medal className="mx-auto size-5" /> : r.rank}
              </div>
              <div className="min-w-0 flex-1">
                {coachMode && !demoRows ? <Link href={`/gamification/joueur/${r.player_id}`} className="font-medium text-slate-900 hover:text-violet-700">{r.first_name} {r.last_name}</Link>
                  : <span className="font-medium text-slate-900">{r.first_name} {r.last_name}{r.is_me && " (toi)"}</span>}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><LevelChip level={r.level} prestige={r.prestige} />
                  <span className="truncate">{cardsQ.data?.find((c) => c.level === r.level)?.status}</span>{r.hidden && <span>· masqué aux joueurs</span>}</div>
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
