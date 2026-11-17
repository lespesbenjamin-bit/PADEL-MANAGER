"use client";
import { LegendsSummaryCard } from "./Legends";
import { WalletSummary } from "./Shop";
import Link from "next/link";
import { CalendarClock, MapPin, Megaphone, Repeat, Trophy, Wallet } from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import { fmtDate, fmtRange, todayISO, weekdayName } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { ATTENDANCE } from "@/lib/labels";
import { Badge, Card, cx, Empty, ErrorBox, LevelBadge, Section, Spinner, StatTile } from "./ui";

export function PlayerHome() {
  const { data: all, error, loading, reload } = useAsync(async () => {
    const [space, tournaments, feed, themes] = await Promise.all([
      api.getMyPlayerSpace(), hub.getTournaments(false).catch(() => [] as hub.Tournament[]),
      hub.getFeed({ limit: 3 }).catch(() => [] as hub.FeedPost[]), hub.getMyUpcomingThemes().catch(() => ({} as Record<string, { theme: string }>)),
    ]);
    return { space, tournaments, feed, themes };
  }, []);
  const data = all?.space ?? null;
  const today = todayISO();

  if (loading && !all) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Empty>Ton compte n&apos;est relié à aucune fiche joueur. Demande un nouveau code à ton coach.</Empty>;

  const { player, credits, groups, upcoming, history, packages } = data;
  const themes = all?.themes ?? {};
  const toDebrief = (all?.tournaments ?? []).filter((t) => hub.needsDebrief(t, today));
  const nextTournaments = (all?.tournaments ?? []).filter((t) => t.status !== "cancelled" && (t.end_date ?? t.start_date) >= today).slice(0, 3);
  const next = upcoming.find((s) => s.status === "planned");
  const low = credits.balance <= 1;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Salut {player.first_name} 👋</h1>
        <p className="text-sm capitalize text-slate-500">{fmtDate(today, "EEEE d MMMM")}</p>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2"><LegendsSummaryCard href="/legends" /><WalletSummary /></div>

      {toDebrief.length > 0 && (
        <Link href="/tournois" className="mb-4 block">
          <Card className="flex items-center gap-3 border-l-4 border-amber-400 p-4 hover:shadow-md">
            <Trophy className="size-6 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Débriefe ton tournoi</div>
              <div className="truncate text-sm text-slate-500">{toDebrief.map((t) => t.name).join(", ")} : résultat et ressenti pour ton coach</div>
            </div>
            <span className="text-sm font-medium text-violet-700">Débriefer →</span>
          </Card>
        </Link>
      )}

      {next && (
        <Card className="relative mb-5 overflow-hidden p-5">
          <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: next.color }} />
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">Prochain entraînement</div>
          <div className="mt-1 text-xl font-semibold capitalize">{next.session_date === today ? "Aujourd'hui" : fmtDate(next.session_date, "EEEE d MMMM")}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-4 text-slate-400" />{fmtRange(next.start_time, next.end_time)}</span>
            <span>{next.group_name}</span>
            {next.location && <span className="inline-flex items-center gap-1"><MapPin className="size-4 text-slate-400" />{next.location}</span>}
          </div>
          {themes[next.id] && <div className="mt-2 inline-block rounded-lg bg-violet-50 px-2 py-1 text-sm text-violet-800">Thème : <b>{themes[next.id].theme}</b></div>}
        </Card>
      )}

      <div className="mb-6 grid grid-cols-3 gap-2.5">
        <StatTile label="Crédits restants" value={credits.balance} tone={credits.balance < 0 ? "alert" : low ? "warn" : "accent"} hint={low ? "Pense à renouveler" : undefined} />
        <StatTile label="Séances jouées" value={credits.played} />
        <StatTile label="Groupes" value={groups.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section title="Mes prochains entraînements">
            <Card className="divide-y divide-slate-100">
              {upcoming.length === 0 ? <div className="p-4 text-sm text-slate-500">Aucun entraînement programmé.</div> :
                upcoming.slice(0, 10).map((s) => (
                  <div key={s.id} className={cx("flex items-center gap-3 p-3", s.status === "cancelled" && "opacity-60")}>
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-[11px] font-medium uppercase text-slate-500">{fmtDate(s.session_date, "EEE")}</div>
                      <div className="text-lg font-semibold leading-none">{fmtDate(s.session_date, "d")}</div>
                      <div className="text-[11px] text-slate-500">{fmtDate(s.session_date, "MMM")}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className={cx("truncate text-sm font-medium", s.status === "cancelled" && "line-through")}>{s.group_name}</span>
                        {s.is_guest && <span className="rounded bg-sky-50 px-1.5 text-[11px] text-sky-700">rattrapage</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                        <span>{fmtRange(s.start_time, s.end_time)}</span>
                        {s.location && <span>· {s.location}</span>}
                        {s.rescheduled && s.original_date && <span className="inline-flex items-center gap-0.5"><Repeat className="size-3" /> reportée du {fmtDate(s.original_date, "d/MM")}</span>}
                      </div>
                      {themes[s.id] && <div className="mt-0.5 text-xs font-medium text-violet-700">{themes[s.id].theme}</div>}
                    </div>
                    {s.status === "cancelled" && <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Annulée</Badge>}
                  </div>
                ))}
            </Card>
          </Section>

          <Section title="Mes dernières séances">
            <Card className="divide-y divide-slate-100">
              {history.length === 0 ? <div className="p-4 text-sm text-slate-500">Pas encore de séance validée.</div> :
                history.slice(0, 8).map((h, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 text-sm">
                    <span className="w-20 shrink-0 text-xs text-slate-500">{fmtDate(h.session_date, "d MMM yy")}</span>
                    <span className="min-w-0 flex-1 truncate">{h.group_name}</span>
                    <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-semibold", ATTENDANCE[h.status].cls)}>{ATTENDANCE[h.status].label}</span>
                    <span className="w-8 text-right text-xs text-slate-500">{h.consume_credit ? "−1" : "0"}</span>
                  </div>
                ))}
            </Card>
          </Section>
        </div>

        <div className="lg:col-span-2">
          <Section title="Mes groupes">
            <div className="space-y-2">
              {groups.length === 0 ? <Empty>Tu n&apos;es inscrit dans aucun groupe pour l&apos;instant.</Empty> : groups.map((g) => (
                <Card key={g.id} className="relative overflow-hidden p-3 pl-4">
                  <div className="absolute inset-y-0 left-0 w-1" style={{ background: g.color }} />
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{g.name}</div>
                      <div className="text-xs text-slate-500">{weekdayName(g.weekday)} · {fmtRange(g.start_time, g.end_time)}{g.location ? ` · ${g.location}` : ""}</div>
                    </div>
                    <LevelBadge level={g.level} />
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{g.members} joueur{g.members > 1 ? "s" : ""}</div>
                </Card>
              ))}
            </div>
          </Section>

          <Section title="Mes forfaits">
            <Card className="divide-y divide-slate-100">
              {packages.length === 0 ? <div className="p-3 text-sm text-slate-500">Aucun forfait enregistré.</div> : packages.map((k, i) => (
                <div key={i} className="flex items-center gap-2 p-3 text-sm">
                  <Wallet className="size-4 text-slate-400" />
                  <span className="flex-1">{k.label}<span className="block text-xs text-slate-500">acheté le {fmtDate(k.purchased_on, "d MMM yyyy")}</span></span>
                  <span className="font-semibold tabular-nums">{k.remaining}/{k.total}</span>
                </div>
              ))}
            </Card>
          </Section>

          <Section title="Mes prochains tournois" actions={<Link href="/tournois" className="text-xs font-medium text-violet-700">Gérer →</Link>}>
            <Card className="divide-y divide-slate-100">
              {nextTournaments.length === 0 ? (
                <Link href="/tournois" className="flex items-center gap-2 p-3 text-sm text-slate-500 hover:bg-slate-50"><Trophy className="size-4 text-violet-600" />Ajoute tes prochains tournois</Link>
              ) : nextTournaments.map((t) => (
                <Link key={t.id} href="/tournois" className="block p-3 text-sm hover:bg-slate-50">
                  <div className="font-medium">{t.name} <span className="text-xs text-slate-500">· {t.category}</span></div>
                  <div className="text-xs text-slate-500">{fmtDate(t.start_date, "EEE d MMM")} · {hub.T_STATUS[t.status].label}{t.coaching_status !== "none" ? ` · ${hub.C_STATUS[t.coaching_status]}` : ""}</div>
                </Link>
              ))}
            </Card>
          </Section>

          <Section title="Communauté" actions={<Link href="/" className="text-xs font-medium text-violet-700">Voir le fil →</Link>}>
            <Card className="divide-y divide-slate-100">
              {(all?.feed ?? []).length === 0 ? (
                <Link href="/" className="flex items-center gap-2 p-3 text-sm text-slate-500 hover:bg-slate-50"><Megaphone className="size-4 text-violet-600" />Partage ta première publication</Link>
              ) : all!.feed.map((p) => (
                <Link key={p.id} href="/" className="block p-3 hover:bg-slate-50">
                  <div className="text-xs text-slate-500">{hub.POST_KINDS[p.kind].emoji} <b className="text-slate-700">{p.author_name}</b></div>
                  <div className="line-clamp-2 text-sm text-slate-700">{p.body || `${p.photos.length} photo(s)`}</div>
                </Link>
              ))}
            </Card>
          </Section>
        </div>
      </div>
    </>
  );
}
