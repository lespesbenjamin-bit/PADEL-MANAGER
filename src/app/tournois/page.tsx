"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import {
  CalendarDays, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, Handshake, LayoutDashboard, List, MapPin, Medal, MessageSquareText,
  Plus, Search, ThumbsUp, TriangleAlert, Sparkles, Trophy, Users,
} from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import { addDaysISO, addMonthsISO, fmtDate, monthGrid, monthRange, timeAgo, todayISO, WEEKDAYS_SHORT } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { useRole } from "@/lib/role";
import type { PlayerStats } from "@/lib/types";
import { ConfirmModal } from "@/components/forms";
import { FftCalendarView } from "@/components/FftCalendar";
import { PhotoGrid, PhotoPicker } from "@/components/Photos";
import {
  Badge, Button, Card, Checkbox, cx, Empty, ErrorBox, errMsg, Field, Input, Modal, PageHeader, Section, Select, Spinner, StatTile, Textarea, useToast,
} from "@/components/ui";

type T = hub.Tournament;
type Tab = "dashboard" | "calendar" | "list" | "players" | "follow" | "fft";

export default function TournamentsPage() {
  return <Suspense fallback={<Spinner />}><Tournaments /></Suspense>;
}

function Tournaments() {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const params = useSearchParams();
  const { data, error, loading, reload } = useAsync(async () => {
    const [list, players] = await Promise.all([hub.getTournaments(isCoach), isCoach ? api.getPlayers() : Promise.resolve([] as PlayerStats[])]);
    return { list, players };
  }, [isCoach]);

  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || (isCoach ? "dashboard" : "list"));
  const [period, setPeriod] = useState<"upcoming" | "past" | "all">("upcoming");
  const [fPlayer, setFPlayer] = useState("");
  const [fCat, setFCat] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [month, setMonth] = useState(todayISO());
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [debrief, setDebrief] = useState<T | null>(null);
  const [share, setShare] = useState<T | null>(null);
  const today = todayISO();

  const list = useMemo(() => data?.list ?? [], [data]);
  const detail = list.find((t) => t.id === detailId) ?? null;
  const toDebrief = list.filter((t) => hub.needsDebrief(t, today));
  const toRead = list.filter((t) => t.debrief_at && !t.coach_reviewed_at);
  const requests = list.filter((t) => t.coaching_status === "requested");
  const followCount = toRead.length + requests.length;

  const filtered = useMemo(() => list.filter((t) =>
    (!fPlayer || t.player_id === fPlayer) && (!fCat || t.category === fCat) && (!fStatus || t.status === fStatus) &&
    (tab === "calendar" || period === "all" || (period === "upcoming" ? (t.end_date ?? t.start_date) >= today : (t.end_date ?? t.start_date) < today))
  ), [list, fPlayer, fCat, fStatus, period, tab, today]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const sorted = [...filtered].sort((a, b) => period === "past" ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date));
  const open = (t: T) => setDetailId(t.id);
  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = isCoach ? [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "calendar", label: "Calendrier", icon: CalendarDays },
    { id: "list", label: "Liste", icon: List },
    { id: "fft", label: "Tournois FFT", icon: Search },
    { id: "players", label: "Joueurs", icon: Users },
    { id: "follow", label: "Suivi à effectuer", icon: ClipboardList, count: followCount },
  ] : [
    { id: "list", label: "Mes tournois", icon: List },
    { id: "fft", label: "Trouver un tournoi", icon: Search },
    { id: "calendar", label: "Calendrier", icon: CalendarDays },
  ];

  return (
    <>
      <PageHeader title={isCoach ? "Tournois" : "Mes tournois"}
        subtitle={isCoach ? "Le calendrier de tes joueurs et leurs ressentis après chaque tournoi" : "Ton calendrier, tes résultats et tes débriefings"}
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Ajouter un tournoi</Button>} />

      {/* onglets */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 pb-3">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cx("inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition",
              tab === t.id ? "bg-violet-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}>
            <t.icon className="size-4" />{t.label}
            {t.count !== undefined && <span className={cx("rounded-full px-1.5 text-xs", tab === t.id ? "bg-white/20" : t.count ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500")}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* joueur : tournois à débriefer */}
      {!isCoach && toDebrief.length > 0 && (
        <Card className="mb-5 border-l-4 border-amber-400 p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-800"><MessageSquareText className="size-5" />À débriefer ({toDebrief.length})</div>
          <p className="mt-0.5 text-sm text-slate-600">Raconte ton tournoi à ton coach : résultat, ressenti au fond et devant, difficultés, points positifs.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {toDebrief.map((t) => <Button key={t.id} size="sm" onClick={() => setDebrief(t)}><MessageSquareText className="size-4" />{t.name} · {fmtDate(t.start_date, "d MMM")}</Button>)}
          </div>
        </Card>
      )}

      {tab === "dashboard" && isCoach && (
        <CoachDashboard list={list} players={data.players} today={today} toDebrief={toDebrief} onOpen={open}
          onTab={(t, player) => { setTab(t); if (player !== undefined) setFPlayer(player); }} />
      )}

      {(tab === "list" || tab === "calendar") && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {tab === "list" && (
            <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="!h-8 !w-auto text-sm" aria-label="Période">
              <option value="upcoming">À venir</option><option value="past">Passés</option><option value="all">Tous</option>
            </Select>
          )}
          {isCoach && (
            <Select value={fPlayer} onChange={(e) => setFPlayer(e.target.value)} className="!h-8 !w-auto text-sm" aria-label="Joueur">
              <option value="">Tous les joueurs</option>
              {data.players.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </Select>
          )}
          <Select value={fCat} onChange={(e) => setFCat(e.target.value)} className="!h-8 !w-auto text-sm" aria-label="Catégorie">
            <option value="">Toutes catégories</option>
            {[...new Set([...hub.TOURNAMENT_CATEGORIES, ...list.map((t) => t.category)])].map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="!h-8 !w-auto text-sm" aria-label="Statut">
            <option value="">Tous statuts</option>
            {Object.entries(hub.T_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
      )}

      {tab === "calendar" && <TournamentCalendar month={month} setMonth={setMonth} list={filtered} isCoach={isCoach} onOpen={open} />}

      {tab === "list" && (sorted.length === 0 ? (
        <Empty action={<Button onClick={() => setEditing("new")}>Ajouter un tournoi</Button>}>Aucun tournoi pour ces critères.</Empty>
      ) : (
        <Card className="divide-y divide-slate-100">
          {sorted.map((t) => <TournamentRow key={t.id} t={t} isCoach={isCoach} today={today} onClick={() => open(t)} onDebrief={() => setDebrief(t)} />)}
        </Card>
      ))}

      {tab === "fft" && <FftCalendarView mine={list} players={data.players} onAdded={reload} />}

      {tab === "players" && isCoach && <PlayersView list={list} players={data.players} today={today} onPick={(pid) => { setFPlayer(pid); setPeriod("all"); setTab("list"); }} />}

      {tab === "follow" && isCoach && (
        <div className="space-y-6">
          <Section title={`Débriefings à lire (${toRead.length})`}>
            {toRead.length === 0 ? <Empty>Aucun nouveau débriefing.</Empty> : (
              <div className="grid gap-3 md:grid-cols-2">{toRead.map((t) => <DebriefCard key={t.id} t={t} isCoach onClick={() => open(t)} />)}</div>
            )}
          </Section>
          <Section title={`Demandes d'accompagnement (${requests.length})`}>
            {requests.length === 0 ? <Empty>Aucune demande en attente.</Empty> : (
              <Card className="divide-y divide-slate-100">{requests.map((t) => <TournamentRow key={t.id} t={t} isCoach today={today} onClick={() => open(t)} />)}</Card>
            )}
          </Section>
          <Section title={`Débriefings à récupérer (${toDebrief.length})`}>
            {toDebrief.length === 0 ? <Empty>Tous les tournois passés ont été débriefés.</Empty> : (
              <Card className="divide-y divide-slate-100">
                {toDebrief.map((t) => <TournamentRow key={t.id} t={t} isCoach today={today} onClick={() => open(t)} />)}
              </Card>
            )}
            <p className="mt-2 text-xs text-slate-500">Le joueur voit un rappel « À débriefer » dans son espace dès que la date du tournoi est passée.</p>
          </Section>
        </div>
      )}

      <TournamentForm open={!!editing} onClose={() => setEditing(null)} t={editing === "new" ? null : editing} players={data.players}
        onSaved={() => { setEditing(null); reload(); }} />
      <TournamentDetail t={detail} isCoach={isCoach} today={today} onClose={() => setDetailId(null)}
        onEdit={(t) => { setDetailId(null); setEditing(t); }} onDebrief={(t) => { setDetailId(null); setDebrief(t); }} onChanged={reload} />
      <DebriefModal t={debrief} isCoach={isCoach} onClose={() => setDebrief(null)}
        onSaved={(t) => { setDebrief(null); reload(); if (!isCoach && t.result_rank) setShare(t); }} />
      <ShareResultModal t={share} onClose={() => setShare(null)} />
    </>
  );
}

/* ============================== Tableau de bord coach ============================== */
function CoachDashboard({ list, players, today, toDebrief, onOpen, onTab }: {
  list: T[]; players: PlayerStats[]; today: string; toDebrief: T[]; onOpen: (t: T) => void; onTab: (t: Tab, player?: string) => void;
}) {
  const in30 = addDaysISO(today, 30);
  const upcoming = list.filter((t) => t.status !== "cancelled" && (t.end_date ?? t.start_date) >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const next30 = upcoming.filter((t) => t.start_date <= in30);
  const followed = new Set(list.filter((t) => (t.end_date ?? t.start_date) >= addDaysISO(today, -90)).map((t) => t.player_id));
  const month = today.slice(0, 7);
  const doneMonth = list.filter((t) => t.status !== "cancelled" && (t.end_date ?? t.start_date).slice(0, 7) === month && (t.end_date ?? t.start_date) < today);
  const debriefs = list.filter((t) => t.debrief_at).sort((a, b) => (b.debrief_at ?? "").localeCompare(a.debrief_at ?? "")).slice(0, 4);
  const multi = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const t of upcoming) { const k = `${t.name.trim().toLowerCase()}|${t.start_date}`; m.set(k, [...(m.get(k) ?? []), t]); }
    return [...m.values()].filter((g) => new Set(g.map((x) => x.player_id)).size > 1);
  }, [upcoming]);

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Tournois (30 j)" value={next30.length} tone="accent" onClick={() => onTab("calendar")} />
        <StatTile label="Joueurs suivis" value={followed.size} hint={`sur ${players.length} joueurs`} onClick={() => onTab("players")} />
        <StatTile label="Débriefings à récupérer" value={toDebrief.length} tone={toDebrief.length ? "warn" : "default"} onClick={() => onTab("follow")} />
        <StatTile label="Terminés ce mois" value={doneMonth.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Section title="Prochains tournois" actions={<button onClick={() => onTab("list")} className="text-xs font-medium text-violet-700">Voir tout →</button>}>
            {upcoming.length === 0 ? <Empty>Aucun tournoi à venir. Tes joueurs peuvent les ajouter depuis leur espace.</Empty> : (
              <Card className="divide-y divide-slate-100">{upcoming.slice(0, 8).map((t) => <TournamentRow key={t.id} t={t} isCoach today={today} onClick={() => onOpen(t)} />)}</Card>
            )}
          </Section>
          {multi.length > 0 && (
            <Section title="Plusieurs joueurs sur le même tournoi">
              <div className="space-y-2">
                {multi.map((g) => (
                  <Card key={g[0].id} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <b>{g[0].name} · {g[0].category}</b><span className="text-slate-500">{fmtDate(g[0].start_date, "EEE d MMM")}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.map((t) => <button key={t.id} onClick={() => onOpen(t)} className="rounded-lg bg-slate-50 px-2 py-1 text-xs ring-1 ring-slate-200 hover:bg-violet-50">{t.player_first_name} {t.player_last_name}</button>)}
                    </div>
                  </Card>
                ))}
              </div>
            </Section>
          )}
        </div>
        <div className="lg:col-span-2">
          <Section title="Derniers ressentis" actions={<button onClick={() => onTab("follow")} className="text-xs font-medium text-violet-700">Suivi →</button>}>
            {debriefs.length === 0 ? <Empty>Les débriefings de tes joueurs apparaîtront ici.</Empty> : (
              <div className="space-y-3">{debriefs.map((t) => <DebriefCard key={t.id} t={t} isCoach onClick={() => onOpen(t)} />)}</div>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

/* ============================== Vue joueurs (coach) ============================== */
function PlayersView({ list, players, today, onPick }: { list: T[]; players: PlayerStats[]; today: string; onPick: (playerId: string) => void }) {
  const rows = players.map((p) => {
    const mine = list.filter((t) => t.player_id === p.id && t.status !== "cancelled");
    const next = mine.filter((t) => (t.end_date ?? t.start_date) >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    const past = mine.filter((t) => (t.end_date ?? t.start_date) < today || t.status === "done").sort((a, b) => b.start_date.localeCompare(a.start_date));
    const deb = mine.filter((t) => t.debrief_at);
    const avg = (k: "debrief_back_score" | "debrief_net_score" | "debrief_satisfaction") => {
      const v = deb.map((t) => t[k]).filter((x): x is number => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return { p, upcoming: mine.length - past.length, played: past.length, next, last: past[0], back: avg("debrief_back_score"), net: avg("debrief_net_score"), sat: avg("debrief_satisfaction"), pending: past.filter((t) => !t.debrief_at).length };
  }).sort((a, b) => (b.upcoming + b.played) - (a.upcoming + a.played) || a.p.first_name.localeCompare(b.p.first_name));

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-3 py-2.5">Joueur</th><th className="px-3 py-2.5">Prochain tournoi</th><th className="px-3 py-2.5 text-center">À venir</th><th className="px-3 py-2.5 text-center">Joués</th>
            <th className="px-3 py-2.5">Fond</th><th className="px-3 py-2.5">Devant</th><th className="px-3 py-2.5">Satisfaction</th><th className="px-3 py-2.5">Dernier résultat</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.p.id} onClick={() => onPick(r.p.id)} className="cursor-pointer hover:bg-slate-50">
              <td className="px-3 py-2.5 font-medium">{r.p.first_name} {r.p.last_name}{r.pending > 0 && <span className="ml-1.5 rounded bg-amber-50 px-1.5 text-[11px] text-amber-800">{r.pending} à débriefer</span>}</td>
              <td className="px-3 py-2.5 text-slate-600">{r.next ? <>{r.next.name} <span className="text-xs text-slate-400">· {fmtDate(r.next.start_date, "d MMM")}</span></> : "—"}</td>
              <td className="px-3 py-2.5 text-center tabular-nums">{r.upcoming}</td>
              <td className="px-3 py-2.5 text-center tabular-nums">{r.played}</td>
              <td className="px-3 py-2.5"><MiniScore v={r.back} /></td>
              <td className="px-3 py-2.5"><MiniScore v={r.net} /></td>
              <td className="px-3 py-2.5">{r.sat != null ? <span>{hub.SATISFACTION_EMOJI[Math.round(r.sat)]} <span className="tabular-nums text-slate-600">{r.sat.toFixed(1)}</span></span> : <span className="text-slate-300">—</span>}</td>
              <td className="px-3 py-2.5 text-slate-600">{r.last?.result_rank ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Moyennes des débriefings (notes de 1 à 5). Clique sur un joueur pour voir ses tournois.</p>
    </Card>
  );
}

function MiniScore({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={cx("h-2.5 w-1.5 rounded-sm", i <= Math.round(v) ? scoreColor(v) : "bg-slate-200")} />)}</span>
      <span className="text-xs tabular-nums text-slate-600">{v.toFixed(1)}</span>
    </span>
  );
}
const scoreColor = (v: number) => (v >= 4 ? "bg-emerald-500" : v >= 3 ? "bg-violet-500" : v >= 2 ? "bg-amber-500" : "bg-rose-500");

/* ============================== Ligne et carte ============================== */
function TournamentRow({ t, isCoach, today, onClick, onDebrief }: { t: T; isCoach: boolean; today: string; onClick: () => void; onDebrief?: () => void }) {
  const pending = hub.needsDebrief(t, today);
  return (
    <div className={cx("flex w-full items-center gap-3 p-3 hover:bg-slate-50", t.status === "cancelled" && "opacity-60")}>
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="w-12 shrink-0 text-center">
          <div className="text-[11px] font-medium uppercase text-slate-500">{fmtDate(t.start_date, "EEE")}</div>
          <div className="text-lg font-semibold leading-none">{fmtDate(t.start_date, "d")}</div>
          <div className="text-[11px] text-slate-500">{fmtDate(t.start_date, "MMM")}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cx("truncate text-sm font-semibold", t.status === "cancelled" && "line-through")}>{t.name}</span>
            <Badge className="bg-slate-900 text-white ring-slate-900">{t.category}</Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
            {isCoach && <span className="font-medium text-slate-700">{t.player_first_name} {t.player_last_name}</span>}
            {(t.club || t.city) && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" />{[t.club, t.city].filter(Boolean).join(", ")}</span>}
            {t.partner_name && <span>avec {t.partner_name}</span>}
            {t.fft_id && <span className="font-medium text-violet-700">Ten&apos;Up</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {t.coaching_status !== "none" && <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              t.coaching_status === "requested" ? "bg-amber-50 text-amber-800" : t.coaching_status === "accepted" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600")}>
              <Handshake className="size-3" />{hub.C_STATUS[t.coaching_status]}</span>}
            {t.result_rank && <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"><Medal className="size-3" />{t.result_rank}</span>}
            {t.debrief_at && <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">
              <MessageSquareText className="size-3" />Débriefé{t.debrief_satisfaction ? ` ${hub.SATISFACTION_EMOJI[t.debrief_satisfaction]}` : ""}
              {isCoach && !t.coach_reviewed_at && <b className="ml-0.5">· nouveau</b>}</span>}
            {pending && <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-800"><TriangleAlert className="size-3" />Débriefing à faire</span>}
          </div>
        </div>
      </button>
      {!isCoach && pending && onDebrief
        ? <Button size="sm" onClick={onDebrief}>Débriefer</Button>
        : <Badge className={hub.T_STATUS[t.status].cls}>{hub.T_STATUS[t.status].label}</Badge>}
    </div>
  );
}

function DebriefCard({ t, isCoach, onClick }: { t: T; isCoach: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="block w-full text-left">
      <Card className={cx("p-4 transition hover:shadow-md", isCoach && !t.coach_reviewed_at && "ring-2 ring-violet-300")}>
        <div className="flex items-start justify-between gap-2">
          <div>
            {isCoach && <div className="text-sm font-semibold">{t.player_first_name} {t.player_last_name}</div>}
            <div className="text-xs text-slate-500">{t.name} · {t.category} · {fmtDate(t.start_date, "d MMM")}</div>
          </div>
          <div className="text-right">
            {t.debrief_satisfaction && <div className="text-2xl leading-none">{hub.SATISFACTION_EMOJI[t.debrief_satisfaction]}</div>}
            {t.result_rank && <div className="mt-1 text-xs font-medium text-emerald-700">{t.result_rank}</div>}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <ScoreView label="Jeu depuis le fond" v={t.debrief_back_score} />
          <ScoreView label="Jeu devant" v={t.debrief_net_score} />
        </div>
        {t.debrief_difficulties && <p className="mt-2 line-clamp-2 text-xs text-slate-600"><b className="text-rose-600">Difficultés :</b> {t.debrief_difficulties}</p>}
        {t.debrief_positives && <p className="mt-1 line-clamp-2 text-xs text-slate-600"><b className="text-emerald-700">Bien ressenti :</b> {t.debrief_positives}</p>}
        {t.debrief_at && <div className="mt-2 text-[11px] text-slate-400">Débriefé {timeAgo(t.debrief_at)}{isCoach && !t.coach_reviewed_at ? " · à lire" : ""}</div>}
      </Card>
    </button>
  );
}

function ScoreView({ label, v }: { label: string; v: number | null }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs"><span className="text-slate-500">{label}</span><b className="tabular-nums">{v ?? "—"}<span className="font-normal text-slate-400">/5</span></b></div>
      <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={cx("h-1.5 flex-1 rounded-full", v && i <= v ? scoreColor(v) : "bg-slate-200")} />)}</div>
      {v && <div className="mt-0.5 text-[11px] text-slate-500">{hub.SCORE_LABELS[v]}</div>}
    </div>
  );
}

/* ============================== Calendrier ============================== */
function TournamentCalendar({ month, setMonth, list, isCoach, onOpen }: {
  month: string; setMonth: (m: string) => void; list: T[]; isCoach: boolean; onOpen: (t: T) => void;
}) {
  const days = monthGrid(month);
  const ym = month.slice(0, 7);
  const today = todayISO();
  const on = (d: string) => list.filter((t) => t.start_date <= d && (t.end_date ?? t.start_date) >= d);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setMonth(addMonthsISO(month, -1))} aria-label="Mois précédent"><ChevronLeft className="size-4" /></Button>
        <span className="min-w-36 text-center text-sm font-semibold capitalize">{fmtDate(monthRange(month).start, "MMMM yyyy")}</span>
        <Button size="sm" variant="secondary" onClick={() => setMonth(addMonthsISO(month, 1))} aria-label="Mois suivant"><ChevronRight className="size-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setMonth(todayISO())}>Aujourd&apos;hui</Button>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80">
          {WEEKDAYS_SHORT.map((d) => <div key={d} className="py-2 text-center text-xs font-medium uppercase text-slate-500">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => (
            <div key={d} className={cx("min-h-20 border-b border-r border-slate-100 p-1 sm:min-h-28", d.slice(0, 7) !== ym && "bg-slate-50/60 text-slate-400")}>
              <div className={cx("mb-1 grid size-6 place-items-center rounded-full text-xs font-medium", d === today && "bg-violet-600 text-white")}>{Number(d.slice(8))}</div>
              <div className="space-y-0.5">
                {on(d).slice(0, 3).map((t) => (
                  <button key={t.id} onClick={() => onOpen(t)} className="flex w-full items-center gap-1 truncate rounded bg-white px-1 py-0.5 text-left text-[10px] ring-1 ring-slate-100 hover:ring-violet-300 sm:text-[11px]">
                    <span className={cx("size-1.5 shrink-0 rounded-full", hub.T_STATUS[t.status].dot)} />
                    <span className="truncate font-medium">{isCoach ? `${t.player_first_name} · ` : ""}{t.name}</span>
                    {t.debrief_satisfaction && <span className="ml-auto shrink-0">{hub.SATISFACTION_EMOJI[t.debrief_satisfaction]}</span>}
                  </button>
                ))}
                {on(d).length > 3 && <div className="px-1 text-[10px] text-slate-500">+{on(d).length - 3}</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        {Object.values(hub.T_STATUS).map((s) => <span key={s.label} className="inline-flex items-center gap-1.5"><span className={cx("size-2 rounded-full", s.dot)} />{s.label}</span>)}
      </div>
    </>
  );
}

/* ============================== Formulaire tournoi ============================== */
function TournamentForm({ open, onClose, t, players, onSaved }: {
  open: boolean; onClose: () => void; t: T | null; players: PlayerStats[]; onSaved: () => void;
}) {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const toast = useToast();
  const empty = { player_id: "", name: "", start_date: todayISO(), end_date: "", club: "", city: "", category: "P100", customCat: "",
    partner_name: "", status: "registered" as hub.TournamentStatus, goal: "", coaching_request: false, coaching_status: "none" as hub.CoachingStatus, coach_note: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const key = open ? (t?.id ?? "new") : null;
  if (key !== last) {
    setLast(key);
    if (open) setF(t ? {
      player_id: t.player_id, name: t.name, start_date: t.start_date, end_date: t.end_date ?? "", club: t.club ?? "", city: t.city ?? "",
      category: hub.TOURNAMENT_CATEGORIES.includes(t.category) ? t.category : "custom", customCat: hub.TOURNAMENT_CATEGORIES.includes(t.category) ? "" : t.category,
      partner_name: t.partner_name ?? "", status: t.status, goal: t.goal ?? "", coaching_request: t.coaching_request,
      coaching_status: t.coaching_status, coach_note: t.coach_note ?? "",
    } : { ...empty, player_id: players[0]?.id ?? "" });
  }

  async function save() {
    if (!f.name.trim()) return toast("Le nom du tournoi est obligatoire", "err");
    if (isCoach && !t && !f.player_id) return toast("Choisis le joueur", "err");
    if (f.end_date && f.end_date < f.start_date) return toast("La date de fin est avant la date de début", "err");
    setBusy(true);
    try {
      const base: hub.TournamentInput = {
        name: f.name.trim(), start_date: f.start_date, end_date: f.end_date || null, club: f.club || null, city: f.city || null,
        category: f.category === "custom" ? (f.customCat.trim() || "Autre") : f.category, partner_name: f.partner_name || null,
        status: f.status, goal: f.goal || null, coaching_request: f.coaching_request,
      };
      if (isCoach) Object.assign(base, { coaching_status: f.coaching_request ? (f.coaching_status === "none" ? "requested" : f.coaching_status) : "none", coach_note: f.coach_note || null });
      if (!t) Object.assign(base, isCoach ? { owner_id: profile.id, player_id: f.player_id } : { owner_id: profile.coach_id, player_id: profile.player_id });
      await hub.saveTournament(t?.id ?? null, base);
      toast(t ? "Tournoi mis à jour" : "Tournoi ajouté");
      onSaved();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }

  const statusSelect = (
    <Field label="Statut"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as hub.TournamentStatus })}>
      {Object.entries(hub.T_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
  );

  return (
    <Modal open={open} onClose={onClose} title={t ? "Modifier le tournoi" : "Ajouter un tournoi"}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Enregistrer</Button></>}>
      <div className="space-y-3">
        {isCoach && !t && (
          <Field label="Joueur">
            <Select value={f.player_id} onChange={(e) => setF({ ...f, player_id: e.target.value })}>
              {players.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Nom du tournoi"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex. Open de Colomiers" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Fin (si plusieurs jours)"><Input type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Club organisateur"><Input value={f.club} onChange={(e) => setF({ ...f, club: e.target.value })} /></Field>
          <Field label="Ville"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Catégorie">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {hub.TOURNAMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}<option value="custom">Autre…</option>
            </Select>
          </Field>
          {f.category === "custom"
            ? <Field label="Catégorie (libre)"><Input value={f.customCat} onChange={(e) => setF({ ...f, customCat: e.target.value })} placeholder="Ex. P2000 mixte" /></Field>
            : statusSelect}
        </div>
        {f.category === "custom" && statusSelect}
        <Field label="Partenaire"><Input value={f.partner_name} onChange={(e) => setF({ ...f, partner_name: e.target.value })} /></Field>
        <Field label="Objectif sportif"><Input value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="Ex. sortir des poules" /></Field>
        <Checkbox label="Demander un accompagnement coaching" checked={f.coaching_request} onChange={(v) => setF({ ...f, coaching_request: v })}
          hint={isCoach ? undefined : "Ton coach reçoit une notification et te répond."} />
        {isCoach && f.coaching_request && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-violet-50/60 p-3">
            <Field label="Décision">
              <Select value={f.coaching_status} onChange={(e) => setF({ ...f, coaching_status: e.target.value as hub.CoachingStatus })}>
                <option value="requested">À traiter</option><option value="accepted">Accepté</option><option value="declined">Pas disponible</option><option value="done">Accompagné</option>
              </Select>
            </Field>
            <Field label="Note au joueur"><Input value={f.coach_note} onChange={(e) => setF({ ...f, coach_note: e.target.value })} /></Field>
          </div>
        )}
        {!isCoach && <p className="text-xs text-slate-500">Après le tournoi, tu pourras saisir ton résultat et ton débriefing.</p>}
      </div>
    </Modal>
  );
}

/* ============================== Détail ============================== */
function TournamentDetail({ t, isCoach, today, onClose, onEdit, onDebrief, onChanged }: {
  t: T | null; isCoach: boolean; today: string; onClose: () => void; onEdit: (t: T) => void; onDebrief: (t: T) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [last, setLast] = useState<string | null>(null);
  if ((t?.id ?? null) !== last) { setLast(t?.id ?? null); setFeedback(t?.coach_feedback ?? ""); setNote(""); }
  if (!t) return null;
  const past = (t.end_date ?? t.start_date) < today || t.status === "done";

  async function patch(p: hub.TournamentInput, msg: string, k: string) {
    setBusy(k);
    try { await hub.saveTournament(t!.id, p); toast(msg); onChanged(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(null); }
  }

  return (
    <Modal open onClose={onClose} title={t.name} wide
      footer={<>
        <Button variant="ghost" className="mr-auto text-rose-600" onClick={() => setConfirm(true)}>Supprimer</Button>
        <Button variant="secondary" onClick={() => onEdit(t)}>Modifier</Button>
        {past && t.status !== "cancelled" && <Button onClick={() => onDebrief(t)}><MessageSquareText className="size-4" /> {t.debrief_at ? "Modifier le débriefing" : isCoach ? "Saisir le résultat" : "Débriefer ce tournoi"}</Button>}
      </>}>
      <div className="grid gap-5 text-sm md:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge className="bg-slate-900 text-white ring-slate-900">{t.category}</Badge>
            <Badge className={hub.T_STATUS[t.status].cls}>{hub.T_STATUS[t.status].label}</Badge>
          </div>
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
            {isCoach && <><dt className="text-slate-500">Joueur</dt><dd className="font-medium">{t.player_first_name} {t.player_last_name}</dd></>}
            <dt className="text-slate-500">Date</dt><dd className="capitalize">{fmtDate(t.start_date, "EEEE d MMMM yyyy")}{t.end_date && t.end_date !== t.start_date ? ` → ${fmtDate(t.end_date, "d MMM")}` : ""}</dd>
            {(t.club || t.city) && <><dt className="text-slate-500">Lieu</dt><dd>{[t.club, t.city].filter(Boolean).join(", ")}</dd></>}
            {t.partner_name && <><dt className="text-slate-500">Partenaire</dt><dd>{t.partner_name}</dd></>}
            {t.goal && <><dt className="text-slate-500">Objectif</dt><dd>{t.goal}</dd></>}
            {t.fft_url && <><dt className="text-slate-500">Ten&apos;Up</dt><dd><a href={t.fft_url} target="_blank" rel="noopener noreferrer" className="font-medium text-violet-700 hover:underline">Fiche officielle du tournoi ↗</a></dd></>}
          </dl>
          {t.coaching_status !== "none" && (
            <div className="rounded-xl bg-violet-50 p-3">
              <div className="flex items-center gap-1.5 font-medium text-violet-800"><Handshake className="size-4" />{hub.C_STATUS[t.coaching_status]}</div>
              {t.coach_note && <p className="mt-1 text-violet-900">« {t.coach_note} »</p>}
              {isCoach && t.coaching_status === "requested" && (
                <div className="mt-2 space-y-2">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Message au joueur (facultatif)" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="success" loading={busy === "acc"} onClick={() => patch({ coaching_status: "accepted", coach_note: note || t.coach_note }, "Accompagnement accepté", "acc")}>Accepter</Button>
                    <Button size="sm" variant="secondary" loading={busy === "dec"} onClick={() => patch({ coaching_status: "declined", coach_note: note || t.coach_note }, "Réponse envoyée", "dec")}>Pas disponible</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {t.result_rank && (
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
              <div className="flex items-center gap-1.5 font-semibold"><Trophy className="size-4" />{t.result_rank}</div>
              {t.matches_played != null && <div className="mt-0.5 text-xs">{t.matches_played} match(s) · {t.wins ?? 0} victoire(s) · {t.losses ?? 0} défaite(s)</div>}
            </div>
          )}
          <PhotoGrid paths={t.photos} />
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Débriefing du joueur</div>
          {!t.debrief_at ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-slate-500">
              {past ? (isCoach ? "Pas encore de débriefing : le joueur voit un rappel dans son espace." : "Tu n'as pas encore débriefé ce tournoi.") : "Le débriefing s'ouvre une fois le tournoi passé."}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <span className="text-3xl">{t.debrief_satisfaction ? hub.SATISFACTION_EMOJI[t.debrief_satisfaction] : "—"}</span>
                <div><div className="text-xs text-slate-500">Satisfaction globale</div><div className="font-semibold">{t.debrief_satisfaction ? `${t.debrief_satisfaction}/5 · ${hub.SCORE_LABELS[t.debrief_satisfaction]}` : "—"}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ScoreView label="Jeu depuis le fond" v={t.debrief_back_score} />
                <ScoreView label="Jeu devant" v={t.debrief_net_score} />
              </div>
              {t.debrief_difficulties && <div><div className="flex items-center gap-1 text-xs font-semibold text-rose-600"><TriangleAlert className="size-3.5" />Difficultés rencontrées</div><p className="mt-0.5 whitespace-pre-wrap">{t.debrief_difficulties}</p></div>}
              {t.debrief_positives && <div><div className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><ThumbsUp className="size-3.5" />Ce qui a été bien ressenti</div><p className="mt-0.5 whitespace-pre-wrap">{t.debrief_positives}</p></div>}
              {t.player_comment && <div><div className="text-xs font-semibold text-slate-500">Autre commentaire</div><p className="mt-0.5 whitespace-pre-wrap">{t.player_comment}</p></div>}
              <div className="text-[11px] text-slate-400">Débriefé {timeAgo(t.debrief_at)}</div>
            </>
          )}

          {isCoach && t.status !== "cancelled" && t.start_date <= today && (
            <Link href="/gamification?tab=tournaments" className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 hover:bg-amber-100">
              <Sparkles className="size-4 text-amber-600" /> Padel Legends : valider ou corriger le résultat pour attribuer les XP →
            </Link>
          )}
          {isCoach && t.debrief_at && (
            <div className="rounded-xl bg-violet-50/70 p-3">
              <Field label="Mon retour au joueur" hint="Le joueur reçoit une notification et le voit sur son tournoi.">
                <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Points à travailler à l'entraînement, encouragements…" className="!min-h-20" />
              </Field>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" loading={busy === "fb"} disabled={!feedback.trim() || feedback === t.coach_feedback}
                  onClick={() => patch({ coach_feedback: feedback.trim(), coach_reviewed_at: new Date().toISOString() }, "Retour envoyé au joueur", "fb")}>Envoyer mon retour</Button>
                {!t.coach_reviewed_at && <Button size="sm" variant="secondary" loading={busy === "read"} onClick={() => patch({ coach_reviewed_at: new Date().toISOString() }, "Marqué comme lu", "read")}><CheckCheck className="size-4" /> Marquer comme lu</Button>}
              </div>
            </div>
          )}
          {!isCoach && t.coach_feedback && (
            <div className="rounded-xl bg-violet-50 p-3">
              <div className="text-xs font-semibold text-violet-700">Retour de ton coach</div>
              <p className="mt-0.5 whitespace-pre-wrap text-violet-950">{t.coach_feedback}</p>
            </div>
          )}
        </div>
      </div>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Supprimer ce tournoi" danger confirmLabel="Supprimer"
        onConfirm={async () => { try { await hub.deleteTournament(t.id); await hub.removePhotos(t.photos); toast("Tournoi supprimé"); setConfirm(false); onClose(); onChanged(); } catch (e) { toast(errMsg(e), "err"); } }}>
        Le tournoi, son résultat et son débriefing seront supprimés.
      </ConfirmModal>
    </Modal>
  );
}

/* ============================== Débriefing (résultat + ressenti) ============================== */
function ScoreSlider({ label, hint, value, onChange, emoji }: { label: string; hint?: string; value: number; onChange: (v: number) => void; emoji?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div><div className="text-sm font-medium text-slate-800">{label}</div>{hint && <div className="text-xs text-slate-500">{hint}</div>}</div>
        <div className="text-right">
          <span className="text-lg font-semibold tabular-nums text-violet-700">{value ? `${emoji ? hub.SATISFACTION_EMOJI[value] + " " : ""}${value}/5` : "—"}</span>
          {value > 0 && <div className="text-[11px] text-slate-500">{hub.SCORE_LABELS[value]}</div>}
        </div>
      </div>
      <input type="range" min={1} max={5} step={1} value={value || 3} aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-violet-600" />
      <div className="flex justify-between px-0.5 text-[11px] text-slate-400">{[1, 2, 3, 4, 5].map((i) => <span key={i}>{i}</span>)}</div>
    </div>
  );
}

function DebriefModal({ t, isCoach, onClose, onSaved }: { t: T | null; isCoach: boolean; onClose: () => void; onSaved: (t: T) => void }) {
  const { profile } = useRole();
  const toast = useToast();
  const empty = { rank: "", custom: "", played: "", wins: "", losses: "", back: 0, net: 0, sat: 0, diff: "", pos: "", comment: "" };
  const [f, setF] = useState(empty);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if ((t?.id ?? null) !== last) {
    setLast(t?.id ?? null);
    if (t) {
      const std = !t.result_rank || hub.RESULT_RANKS.includes(t.result_rank);
      setF({ rank: std ? (t.result_rank ?? "") : "custom", custom: std ? "" : (t.result_rank ?? ""), played: t.matches_played?.toString() ?? "",
        wins: t.wins?.toString() ?? "", losses: t.losses?.toString() ?? "", back: t.debrief_back_score ?? 3, net: t.debrief_net_score ?? 3,
        sat: t.debrief_satisfaction ?? 3, diff: t.debrief_difficulties ?? "", pos: t.debrief_positives ?? "", comment: t.player_comment ?? "" });
      setFiles([]);
    }
  }
  if (!t) return null;

  async function save() {
    const rank = f.rank === "custom" ? f.custom.trim() : f.rank;
    if (!rank) return toast("Indique ton résultat (la place)", "err");
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) uploaded.push(await hub.uploadPhoto(file, profile.coach_id, profile.id));
      const n = (v: string) => (v === "" ? null : Math.max(0, Number(v)));
      const payload: hub.TournamentInput = {
        status: "done", result_rank: rank, matches_played: n(f.played), wins: n(f.wins), losses: n(f.losses),
        player_comment: f.comment.trim() || null, photos: [...t!.photos, ...uploaded],
      };
      if (!isCoach) Object.assign(payload, {
        debrief_back_score: f.back, debrief_net_score: f.net, debrief_satisfaction: f.sat,
        debrief_difficulties: f.diff.trim() || null, debrief_positives: f.pos.trim() || null,
      });
      const saved = await hub.saveTournament(t!.id, payload);
      toast(isCoach ? "Résultat enregistré" : "Débriefing envoyé à ton coach");
      onSaved(saved);
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`${isCoach ? "Résultat" : "Débriefing"} · ${t.name}`} wide
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>{isCoach ? "Enregistrer" : "Envoyer mon débriefing"}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <Field label="Résultat (place)">
            <Select value={f.rank} onChange={(e) => setF({ ...f, rank: e.target.value })}>
              <option value="">—</option>{hub.RESULT_RANKS.map((r) => <option key={r}>{r}</option>)}<option value="custom">Autre…</option>
            </Select>
          </Field>
          <Field label="Matchs"><Input type="number" min={0} value={f.played} onChange={(e) => setF({ ...f, played: e.target.value })} /></Field>
          <Field label="Victoires"><Input type="number" min={0} value={f.wins} onChange={(e) => setF({ ...f, wins: e.target.value })} /></Field>
          <Field label="Défaites"><Input type="number" min={0} value={f.losses} onChange={(e) => setF({ ...f, losses: e.target.value })} /></Field>
        </div>
        {f.rank === "custom" && <Field label="Résultat (libre)"><Input value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} placeholder="Ex. 5e sur 16" /></Field>}

        {!isCoach && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreSlider label="Jeu depuis le fond" hint="Défense, sorties de vitre, lobs" value={f.back} onChange={(v) => setF({ ...f, back: v })} />
              <ScoreSlider label="Jeu devant" hint="Volées, bandeja, vibora, smash" value={f.net} onChange={(v) => setF({ ...f, net: v })} />
            </div>
            <Field label="Difficultés rencontrées"><Textarea value={f.diff} onChange={(e) => setF({ ...f, diff: e.target.value })} placeholder="Ce qui a coincé : coups, tactique, mental, physique…" /></Field>
            <Field label="Ce qui a été bien ressenti"><Textarea value={f.pos} onChange={(e) => setF({ ...f, pos: e.target.value })} placeholder="Ce qui a bien fonctionné, tes points forts du jour…" /></Field>
            <ScoreSlider label="Satisfaction globale" value={f.sat} onChange={(v) => setF({ ...f, sat: v })} emoji />
          </>
        )}
        <Field label={isCoach ? "Commentaire" : "Autre commentaire (facultatif)"}><Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} className="!min-h-16" /></Field>
        <Field label="Photos (facultatif)"><PhotoPicker files={files} onChange={setFiles} /></Field>
        {t.photos.length > 0 && <PhotoGrid paths={t.photos} />}
        {!isCoach && <p className="text-xs text-slate-500">Ton débriefing est visible uniquement par toi et ton coach.</p>}
      </div>
    </Modal>
  );
}

/* ============================== Proposition de publication ============================== */
function ShareResultModal({ t, onClose }: { t: T | null; onClose: () => void }) {
  const { profile } = useRole();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if ((t?.id ?? null) !== last) {
    setLast(t?.id ?? null);
    if (t) setText(`${t.result_rank} au ${t.name} (${t.category})${t.partner_name ? ` avec ${t.partner_name}` : ""} ! 🎾`);
  }
  if (!t) return null;
  const podium = ["Vainqueur", "Finaliste"].includes(t.result_rank ?? "");
  return (
    <Modal open onClose={onClose} title="Partager ton résultat ?"
      footer={<><Button variant="ghost" onClick={onClose}>Non merci</Button><Button loading={busy} onClick={async () => {
        setBusy(true);
        try {
          await hub.createPost({ owner_id: profile.coach_id, kind: podium ? "podium" : "result", body: text, photos: t.photos, tournament_id: t.id,
            meta: { tournament: t.name, date: t.start_date, category: t.category, result: t.result_rank ?? undefined,
              record: t.wins != null && t.losses != null ? `${t.wins}V-${t.losses}D` : undefined } });
          toast("Publié dans la communauté"); onClose();
        } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
      }}>Publier</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Ton débriefing reste privé entre toi et ton coach. Tu peux, si tu veux, partager ton résultat dans la communauté :</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-24" />
      {t.photos.length > 0 && <p className="mt-2 text-xs text-slate-500">{t.photos.length} photo(s) jointe(s).</p>}
    </Modal>
  );
}
