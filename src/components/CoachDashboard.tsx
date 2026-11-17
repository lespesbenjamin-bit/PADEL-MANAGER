"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle, BookOpen, CalendarPlus, ChevronRight, Megaphone, Plus, Trophy, UserPlus, UsersRound, Wallet,
} from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import { fmtDate, monthRange, todayISO, weekRange, WEEKDAYS } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { LEVELS } from "@/lib/labels";
import { GroupCard, isNearEnd } from "@/components/GroupCard";
import { AddSessionModal, GroupFormModal, PlayerFormModal } from "@/components/forms";
import { WeekStrip } from "@/components/WeekStrip";
import { SessionRow } from "@/components/SessionRow";
import { Button, Card, cx, Empty, ErrorBox, PageHeader, Section, Select, Spinner, StatTile } from "@/components/ui";
import { useRouter } from "next/navigation";

export function CoachDashboard() {
  const router = useRouter();
  const today = todayISO();
  const wk = weekRange(today);
  const mo = monthRange(today);
  const from = wk.start < mo.start ? wk.start : mo.start;
  const to = wk.end > mo.end ? wk.end : mo.end;

  const { data, error, loading, reload } = useAsync(async () => {
    const [groups, memberships, sessions, pending, players, tournaments, feed] = await Promise.all([
      api.getGroups(), api.getActiveMemberships(), api.getSessions({ from, to }), api.getSessions({ pendingOnly: true }), api.getPlayers(),
      hub.getTournaments(true).catch(() => [] as hub.Tournament[]), hub.getFeed({ limit: 3 }).catch(() => [] as hub.FeedPost[]),
    ]);
    return { groups, memberships, sessions, pending, players, tournaments, feed };
  }, [from, to]);

  const [fDay, setFDay] = useState("");
  const [fLevel, setFLevel] = useState("");
  const [fStatus, setFStatus] = useState("active");
  const [fEnd, setFEnd] = useState("");
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState<null | "player" | "session">(null);

  const k = useMemo(() => {
    if (!data) return null;
    const active = data.groups.filter((g) => g.status === "active");
    const activeIds = new Set(active.map((g) => g.id));
    const players = new Set(data.memberships.filter((m) => activeIds.has(m.group_id)).map((m) => m.player_id));
    const thisWeek = data.sessions.filter((s) => s.session_date >= wk.start && s.session_date <= wk.end && s.status !== "cancelled" && s.group_status !== "archived");
    const doneMonth = data.sessions.filter((s) => s.session_date >= mo.start && s.session_date <= mo.end && s.status === "validated");
    const remaining = active.filter((g) => g.cycle_status === "in_progress" || g.cycle_status === "upcoming").reduce((a, g) => a + (g.remaining ?? 0), 0);
    const nearEnd = active.filter(isNearEnd);
    const upcoming = data.sessions.filter((s) => s.session_date >= today && s.status === "planned" && !s.pending_validation).slice(0, 5);
    const memberIds = new Set(data.memberships.map((m) => m.player_id));
    const lowCredits = data.players.filter((p) => memberIds.has(p.id) && p.credits_balance <= 1).sort((a, b) => a.credits_balance - b.credits_balance);
    const activeMemberIds = players;
    const creditsLeft = data.players.filter((p) => activeMemberIds.has(p.id)).reduce((a, p) => a + Math.max(0, p.credits_balance), 0);
    const weekAll = data.sessions.filter((s) => s.session_date >= wk.start && s.session_date <= wk.end && s.group_status !== "archived");
    return { active, players: players.size, thisWeek, doneMonth, remaining, nearEnd, upcoming, lowCredits, creditsLeft, weekAll };
  }, [data, wk.start, wk.end, mo.start, mo.end, today]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.groups.filter((g) =>
      (!fDay || g.weekday === Number(fDay)) &&
      (!fLevel || g.level === fLevel) &&
      (!fStatus || g.status === fStatus) &&
      (!fEnd || (fEnd === "near" ? isNearEnd(g) : fEnd === "none" ? !g.cycle_id || g.cycle_status === "completed" : !isNearEnd(g))));
  }, [data, fDay, fLevel, fStatus, fEnd]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !k) return null;

  const isEmpty = data.groups.length === 0;

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={<span className="capitalize">{fmtDate(today, "EEEE d MMMM yyyy")}</span>} />

      <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Shortcut icon={UsersRound} label="Créer un groupe" onClick={() => setCreating(true)} />
        <Shortcut icon={UserPlus} label="Ajouter un joueur" onClick={() => setModal("player")} />
        <Shortcut icon={CalendarPlus} label="Programmer une séance" onClick={() => setModal("session")} disabled={isEmpty} />
        <Shortcut icon={BookOpen} label="Créer un exercice" href="/exercices/nouveau" />
        <Shortcut icon={Trophy} label="Compétitions" href="/tournois" />
        <Shortcut icon={Megaphone} label="Publier une actualité" href="/communaute" />
      </div>

      {isEmpty ? (
        <Empty action={<div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => setCreating(true)}>Créer mon premier groupe</Button>
          <Link href="/reglages"><Button variant="secondary">Charger les données de démo</Button></Link>
        </div>}>
          Aucun groupe pour l&apos;instant.
        </Empty>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile label="Joueurs actifs" value={k.players} tone="accent" hint="inscrits dans un groupe" onClick={() => router.push("/joueurs")} />
            <StatTile label="Groupes actifs" value={k.active.length} onClick={() => router.push("/groupes")} />
            <StatTile label="Séances cette semaine" value={k.thisWeek.length} onClick={() => router.push("/planning")} />
            <StatTile label="Crédits restants" value={k.creditsLeft} hint="dans les forfaits" onClick={() => router.push("/joueurs")} />
            <StatTile label="Réalisées ce mois" value={k.doneMonth.length} />
            <StatTile label="Restantes (cycles actifs)" value={k.remaining} onClick={() => router.push("/cycles")} />
            <StatTile label="Proches de la fin" value={k.nearEnd.length} tone={k.nearEnd.length ? "warn" : "default"} hint="≤ 2 séances" onClick={() => setFEnd("near")} />
            <StatTile label="Non validées" value={data.pending.length} tone={data.pending.length ? "alert" : "default"} hint="séances passées" />
          </div>

          <Section title="Cette semaine" actions={<Link href="/planning" className="text-xs font-medium text-violet-700">Planning complet →</Link>}>
            <WeekStrip start={wk.start} today={today} sessions={k.weekAll} />
          </Section>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {data.pending.length > 0 && (
                <Section title={`Actions à effectuer · ${data.pending.length} séance(s) à valider`}>
                  <Card className="divide-y divide-slate-100 ring-amber-200">
                    {data.pending.slice(0, 6).map((s) => <SessionRow key={s.id} s={s} showGroup />)}
                    {data.pending.length > 6 && <div className="p-3 text-center text-xs text-slate-500">+ {data.pending.length - 6} autres</div>}
                  </Card>
                </Section>
              )}

              <Section title={`Mes groupes (${filtered.length})`}>
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Select value={fDay} onChange={(e) => setFDay(e.target.value)} aria-label="Jour">
                    <option value="">Tous les jours</option>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                  </Select>
                  <Select value={fLevel} onChange={(e) => setFLevel(e.target.value)} aria-label="Niveau">
                    <option value="">Tous niveaux</option>{[...new Set([...LEVELS, ...data.groups.map((g) => g.level)])].map((l) => <option key={l}>{l}</option>)}
                  </Select>
                  <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Statut">
                    <option value="">Tous statuts</option><option value="active">Actifs</option><option value="suspended">Suspendus</option>
                  </Select>
                  <Select value={fEnd} onChange={(e) => setFEnd(e.target.value)} aria-label="Fin de cycle">
                    <option value="">Fin de cycle : tout</option><option value="near">Proches de la fin</option><option value="far">En cours</option><option value="none">Sans cycle actif</option>
                  </Select>
                </div>
                {filtered.length === 0 ? <Empty>Aucun groupe ne correspond aux filtres.</Empty> : (
                  <div className="grid gap-3 sm:grid-cols-2">{filtered.map((g) => <GroupCard key={g.id} g={g} />)}</div>
                )}
              </Section>
            </div>

            <div>
              <Section title="Prochaines séances" actions={<Link href="/planning" className="text-xs font-medium text-violet-700">Planning →</Link>}>
                <Card className="divide-y divide-slate-100">
                  {k.upcoming.length === 0 ? <div className="p-4 text-sm text-slate-500">Aucune séance prévue.</div> :
                    k.upcoming.map((s) => <SessionRow key={s.id} s={s} showGroup />)}
                </Card>
              </Section>

              <Section title="Prochains tournois" actions={<Link href="/tournois" className="text-xs font-medium text-violet-700">Tous →</Link>}>
                <Card className="divide-y divide-slate-100">
                  {data.tournaments.filter((t) => t.coaching_status === "requested").length > 0 && (
                    <Link href="/tournois" className="flex items-center gap-2 bg-amber-50 p-3 text-sm font-medium text-amber-800">
                      <AlertTriangle className="size-4" />{data.tournaments.filter((t) => t.coaching_status === "requested").length} demande(s) d&apos;accompagnement à traiter
                    </Link>
                  )}
                  {(() => { const up = data.tournaments.filter((t) => t.status !== "cancelled" && (t.end_date ?? t.start_date) >= today).slice(0, 5);
                    return up.length === 0 ? <div className="p-3 text-sm text-slate-500">Aucun tournoi à venir renseigné.</div> : up.map((t) => (
                      <Link key={t.id} href="/tournois" className="flex items-center gap-3 p-3 hover:bg-slate-50">
                        <Trophy className="size-4 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{t.player_first_name} · {t.name}</div>
                          <div className="text-xs text-slate-500">{fmtDate(t.start_date, "EEE d MMM")} · {t.category}{t.partner_name ? ` · avec ${t.partner_name}` : ""}</div>
                        </div>
                      </Link>
                    )); })()}
                </Card>
              </Section>
              <Section title="Communauté" actions={<Link href="/communaute" className="text-xs font-medium text-violet-700">Fil →</Link>}>
                <Card className="divide-y divide-slate-100">
                  {data.feed.length === 0 ? <div className="p-3 text-sm text-slate-500">Pas encore de publication.</div> : data.feed.map((p) => (
                    <Link key={p.id} href="/communaute" className="block p-3 hover:bg-slate-50">
                      <div className="text-xs text-slate-500">{hub.POST_KINDS[p.kind].emoji} <b className="text-slate-700">{p.author_name}</b></div>
                      <div className="line-clamp-2 text-sm text-slate-700">{p.body || (p.photos.length ? `${p.photos.length} photo(s)` : "")}</div>
                    </Link>
                  ))}
                </Card>
              </Section>

              {k.nearEnd.length > 0 && (
                <Section title="Cycles à renouveler">
                  <Card className="divide-y divide-slate-100">
                    {k.nearEnd.map((g) => (
                      <Link key={g.id} href={`/groupes/${g.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                        <AlertTriangle className="size-4 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{g.name}</div>
                          <div className="text-xs text-slate-500">{g.remaining} séance{(g.remaining ?? 0) > 1 ? "s" : ""} restante{(g.remaining ?? 0) > 1 ? "s" : ""} · fin {fmtDate(g.projected_end_date, "d MMM")}</div>
                        </div>
                        <ChevronRight className="size-4 text-slate-400" />
                      </Link>
                    ))}
                  </Card>
                </Section>
              )}

              {k.lowCredits.length > 0 && (
                <Section title="Forfaits à renouveler">
                  <Card className="divide-y divide-slate-100">
                    {k.lowCredits.slice(0, 8).map((p) => (
                      <Link key={p.id} href={`/joueurs/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                        <Wallet className="size-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1 truncate text-sm">{p.first_name} {p.last_name}</div>
                        <span className={p.credits_balance < 0 ? "text-sm font-semibold text-rose-600" : "text-sm font-semibold text-amber-600"}>
                          {p.credits_balance} crédit{Math.abs(p.credits_balance) > 1 ? "s" : ""}
                        </span>
                      </Link>
                    ))}
                  </Card>
                </Section>
              )}
            </div>
          </div>
        </>
      )}

      <GroupFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => router.push(`/groupes/${id}`)} />
      <PlayerFormModal open={modal === "player"} onClose={() => setModal(null)} onSaved={(p) => router.push(`/joueurs/${p.id}`)} />
      <AddSessionModal open={modal === "session"} onClose={() => setModal(null)} groups={data.groups} onSaved={(id) => router.push(`/seances/${id}`)} />
    </>
  );
}

function Shortcut({ icon: Icon, label, onClick, href, soon, disabled }: {
  icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void; href?: string; soon?: boolean; disabled?: boolean;
}) {
  const inner = (
    <>
      <span className={cx("grid size-9 place-items-center rounded-xl", soon ? "bg-slate-100 text-slate-500" : "bg-violet-100 text-violet-700")}><Icon className="size-[18px]" /></span>
      <span className="text-xs font-medium leading-tight text-slate-700">{label}</span>
      {soon && <span className="absolute right-2 top-2 rounded-full bg-slate-100 px-1.5 text-[9px] font-medium text-slate-500">Bientôt</span>}
    </>
  );
  const cls = "relative flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center ring-1 ring-slate-200/80 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50";
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}

