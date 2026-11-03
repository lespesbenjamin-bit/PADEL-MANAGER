"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowLeft, ArrowRightLeft, CheckCheck, CalendarDays, CalendarPlus, Clock, Pause, Pencil, Phone, Plus, RefreshCcw, Search, UserMinus, UserPlus,
} from "lucide-react";
import * as api from "@/lib/api";
import { addDaysISO, fmtDate, fmtDateLong, fmtRange, todayISO, weekdayName, WEEKDAYS } from "@/lib/dates";
import { useAsync, useOpKey } from "@/lib/hooks";
import { CYCLE_STATUS, GROUP_STATUS } from "@/lib/labels";
import type { GroupOverview, Membership, PlayerStats, VSession } from "@/lib/types";
import { AddSessionModal, ConfirmModal, GroupFormModal, PlayerFormModal, RenewCycleModal } from "@/components/forms";
import { SessionRow } from "@/components/SessionRow";
import {
  Badge, Button, Card, cx, Empty, ErrorBox, errMsg, Field, Input, LevelBadge, Modal, Progress, Section, Select, Spinner, useToast,
} from "@/components/ui";

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [group, cycles, members, sessions, players, groups] = await Promise.all([
      api.getGroup(id), api.getCycles({ groupId: id }), api.getMembers(id), api.getSessions({ groupId: id }), api.getPlayers(), api.getGroups(),
    ]);
    return { group, cycles, members, sessions, players, groups };
  }, [id]);

  const [cycleId, setCycleId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "edit" | "slot" | "session" | "renew" | "pause" | "archive" | "addMember" | "newPlayer" | "bulk">(null);
  const [moving, setMoving] = useState<Membership | null>(null);
  const [removing, setRemoving] = useState<Membership | null>(null);

  useEffect(() => {
    if (data && (!cycleId || !data.cycles.find((c) => c.id === cycleId))) setCycleId(data.group.cycle_id ?? data.cycles[0]?.id ?? null);
  }, [data, cycleId]);

  const cycle = data?.cycles.find((c) => c.id === cycleId) ?? null;
  const latestCycle = data?.cycles[0] ?? null;
  const today = todayISO();

  const history = useMemo(() => {
    if (!data) return { upcoming: [], past: [] };
    const list = data.sessions.filter((s) => (cycle ? s.cycle_id === cycle.id : true) || (!s.cycle_id));
    return {
      upcoming: list.filter((s) => s.session_date >= today && !s.pending_validation),
      past: list.filter((s) => s.session_date < today || s.pending_validation).reverse(),
    };
  }, [data, cycle, today]);

  const pendingList = useMemo(() => (data?.sessions ?? []).filter((s) => s.pending_validation), [data]);
  const balance = (pid: string) => data?.players.find((p) => p.id === pid)?.credits_balance ?? 0;

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const g = data.group;
  const archived = g.status === "archived";
  const suggestedStart = latestCycle?.projected_end_date ? addDaysISO(latestCycle.projected_end_date, 1) : null;

  return (
    <>
      <Link href="/groupes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Mes groupes</Link>

      {/* ----- Informations ----- */}
      <Card className="relative mb-4 overflow-hidden p-5">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: g.color }} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{g.name}</h1>
              <LevelBadge level={g.level} />
              <Badge className={GROUP_STATUS[g.status].cls}>{GROUP_STATUS[g.status].label}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-slate-400" /> {weekdayName(g.weekday)} · {fmtRange(g.start_time, g.end_time)}</span>
              <span>{g.member_count}/{g.capacity} joueurs</span>
            </div>
            {g.notes && <p className="mt-2 max-w-xl text-sm text-slate-500">{g.notes}</p>}
          </div>
        </div>
        {!archived && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setModal("edit")}><Pencil className="size-4" /> Modifier</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal("slot")}><Clock className="size-4" /> Changer l&apos;horaire</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal("session")}><CalendarPlus className="size-4" /> Ajouter une séance</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal("pause")}><Pause className="size-4" /> Pause vacances</Button>
            <Link href={`/planning?group=${g.id}`}><Button size="sm" variant="secondary"><CalendarDays className="size-4" /> Planning</Button></Link>
            <Button size="sm" onClick={() => setModal("renew")}><RefreshCcw className="size-4" /> {latestCycle ? "Renouveler le cycle" : "Créer un cycle"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setModal("archive")}><Archive className="size-4" /> Archiver</Button>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {/* ----- Cycle actuel ----- */}
          <Section title="Cycle" actions={data.cycles.length > 1 && (
            <Select value={cycleId ?? ""} onChange={(e) => setCycleId(e.target.value)} className="!h-8 !w-auto text-xs">
              {data.cycles.map((c) => <option key={c.id} value={c.id}>{c.name ?? `Cycle ${c.cycle_number}`} · {CYCLE_STATUS[c.effective_status].label}</option>)}
            </Select>
          )}>
            {!cycle ? (
              <Empty action={!archived && <Button onClick={() => setModal("renew")}>Planifier un cycle</Button>}>Aucun cycle pour ce groupe.</Empty>
            ) : (
              <Card className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{cycle.name ?? `Cycle ${cycle.cycle_number}`}</div>
                  <Badge className={CYCLE_STATUS[cycle.effective_status].cls}>{CYCLE_STATUS[cycle.effective_status].label}</Badge>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div className="text-4xl font-semibold tabular-nums">{cycle.realized}<span className="text-lg text-slate-400">/{cycle.planned_sessions}</span></div>
                  <div className="text-right text-sm text-slate-500"><b className="text-2xl text-slate-900">{cycle.progress}%</b><br />réalisé</div>
                </div>
                <Progress value={cycle.progress} color={g.color} className="mt-2 h-3" />
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <Info label="Restantes" value={cycle.remaining} strong />
                  <Info label="Annulées" value={cycle.cancelled} />
                  <Info label="À valider" value={cycle.pending} warn={cycle.pending > 0} />
                  <Info label="Début" value={fmtDate(cycle.first_date, "d MMM yyyy")} />
                  <Info label="Fin prévisionnelle" value={fmtDate(cycle.projected_end_date, "d MMM yyyy")} />
                  <Info label="Prochaine séance" value={fmtDate(cycle.next_date, "EEE d MMM")} />
                </div>
                {cycle.scheduled < cycle.planned_sessions && (
                  <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800">
                    {cycle.planned_sessions - cycle.scheduled} séance(s) du cycle ne sont pas encore planifiées (annulées sans remplacement). La fin prévisionnelle les prend en compte au rythme hebdomadaire.
                  </p>
                )}
              </Card>
            )}
          </Section>

          {/* ----- Historique ----- */}
          <Section title="Séances à venir">
            <Card className="divide-y divide-slate-100">
              {history.upcoming.length === 0 ? <div className="p-4 text-sm text-slate-500">Aucune séance à venir.</div> :
                history.upcoming.map((s) => <SessionRow key={s.id} s={s} />)}
            </Card>
          </Section>
          <Section title="Historique" actions={!archived && pendingList.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setModal("bulk")}><CheckCheck className="size-4" /> Tout valider ({pendingList.length})</Button>
          )}>
            <Card className="divide-y divide-slate-100">
              {history.past.length === 0 ? <div className="p-4 text-sm text-slate-500">Aucune séance passée.</div> :
                history.past.map((s) => <SessionRow key={s.id} s={s} />)}
            </Card>
          </Section>
        </div>

        {/* ----- Composition ----- */}
        <div className="lg:col-span-2">
          <Section title={`Composition (${data.members.length}/${g.capacity})`} actions={!archived && (
            <Button size="sm" variant="secondary" onClick={() => setModal("addMember")}><UserPlus className="size-4" /> Ajouter</Button>
          )}>
            <Card className="divide-y divide-slate-100">
              {data.members.length === 0 ? <div className="p-4 text-sm text-slate-500">Aucun joueur inscrit.</div> :
                data.members.map((m) => {
                  const b = balance(m.player_id);
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                        {m.players?.first_name?.[0]}{m.players?.last_name?.[0]}
                      </div>
                      <Link href={`/joueurs/${m.player_id}`} className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium hover:text-violet-700">{m.players?.first_name} {m.players?.last_name}</div>
                        <div className="text-xs text-slate-500">depuis le {fmtDate(m.joined_on, "d MMM yyyy")}</div>
                      </Link>
                      <span className={cx("rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums", b < 0 ? "bg-rose-50 text-rose-700" : b <= 1 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")} title="Crédits disponibles">{b} cr.</span>
                      {m.players?.phone && <a href={`tel:${m.players.phone.replace(/\s/g, "")}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Appeler"><Phone className="size-4" /></a>}
                      {!archived && <>
                        <button onClick={() => setMoving(m)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Déplacer" title="Déplacer vers un autre groupe"><ArrowRightLeft className="size-4" /></button>
                        <button onClick={() => setRemoving(m)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Retirer" title="Retirer du groupe"><UserMinus className="size-4" /></button>
                      </>}
                    </div>
                  );
                })}
            </Card>
            {data.members.length > g.capacity && <p className="mt-2 text-xs text-amber-700">Attention : le groupe dépasse sa capacité ({g.capacity}).</p>}
          </Section>
          {data.cycles.length > 0 && (
            <Section title="Tous les cycles">
              <Card className="divide-y divide-slate-100">
                {data.cycles.map((c) => (
                  <button key={c.id} onClick={() => setCycleId(c.id)} className={cx("flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50", c.id === cycleId && "bg-violet-50/50")}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{c.name ?? `Cycle ${c.cycle_number}`}</div>
                      <div className="text-xs text-slate-500">{fmtDate(c.first_date, "d MMM")} → {fmtDate(c.projected_end_date, "d MMM yyyy")} · {c.realized}/{c.planned_sessions}</div>
                    </div>
                    <Badge className={CYCLE_STATUS[c.effective_status].cls}>{CYCLE_STATUS[c.effective_status].label}</Badge>
                  </button>
                ))}
              </Card>
            </Section>
          )}
        </div>
      </div>

      {/* ----- Modales ----- */}
      <GroupFormModal open={modal === "edit"} onClose={() => setModal(null)} group={g} onSaved={reload} />
      <SlotModal open={modal === "slot"} onClose={() => setModal(null)} group={g} onSaved={reload} />
      <AddSessionModal open={modal === "session"} onClose={() => setModal(null)} groups={data.groups} defaultGroupId={g.id} onSaved={reload} />
      <RenewCycleModal open={modal === "renew"} onClose={() => setModal(null)} group={g} lastPlanned={latestCycle?.planned_sessions ?? null}
        suggestedStart={suggestedStart && suggestedStart > today ? suggestedStart : today} onSaved={() => { setCycleId(null); reload(); }} />
      <PauseModal open={modal === "pause"} onClose={() => setModal(null)} group={g} onSaved={reload} />
      <AddMemberModal open={modal === "addMember"} onClose={() => setModal(null)} group={g} players={data.players}
        memberIds={data.members.map((m) => m.player_id)} onSaved={reload} onNew={() => setModal("newPlayer")} />
      <PlayerFormModal open={modal === "newPlayer"} onClose={() => setModal(null)} onSaved={async (p) => {
        try { await api.addMember(g.id, p.id); toast(`${p.first_name} ajouté au groupe`); } catch (e) { toast(errMsg(e), "err"); }
        reload();
      }} />
      <ConfirmModal open={modal === "archive"} onClose={() => setModal(null)} title="Archiver le groupe" danger confirmLabel="Archiver"
        onConfirm={async () => {
          try { await api.archiveGroup(g.id); toast("Groupe archivé"); router.push("/groupes"); } catch (e) { toast(errMsg(e), "err"); }
        }}>
        Le groupe et tout son historique (cycles, séances, présences) sont conservés. Les séances futures non validées seront annulées.
      </ConfirmModal>
      <ConfirmModal open={!!removing} onClose={() => setRemoving(null)} title="Retirer du groupe" confirmLabel="Retirer" danger
        onConfirm={async () => {
          try { await api.removeMember(removing!.id); toast("Joueur retiré"); setRemoving(null); reload(); } catch (e) { toast(errMsg(e), "err"); }
        }}>
        {removing?.players?.first_name} {removing?.players?.last_name} sera retiré du groupe à compter d&apos;aujourd&apos;hui. Ses participations passées et ses crédits sont conservés.
      </ConfirmModal>
      <BulkValidateModal open={modal === "bulk"} onClose={() => setModal(null)} sessions={pendingList} members={data.members} onDone={reload} />
      <MoveModal m={moving} onClose={() => setMoving(null)} groups={data.groups.filter((x) => x.id !== g.id && x.status !== "archived")} fromId={g.id} onSaved={reload} />
    </>
  );
}

function Info({ label, value, strong, warn }: { label: string; value: React.ReactNode; strong?: boolean; warn?: boolean }) {
  return (
    <div className={cx("rounded-xl px-3 py-2", warn ? "bg-amber-50" : "bg-slate-50")}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cx("font-medium tabular-nums", strong && "text-lg font-semibold text-violet-700", warn && "text-amber-700")}>{value}</div>
    </div>
  );
}

function SlotModal({ open, onClose, group, onSaved }: { open: boolean; onClose: () => void; group: GroupOverview; onSaved: () => void }) {
  const toast = useToast();
  const op = useOpKey();
  const [f, setF] = useState({ weekday: 1, start: "", end: "", from: todayISO() });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ weekday: group.weekday, start: group.start_time.slice(0, 5), end: group.end_time.slice(0, 5), from: todayISO() }); }, [open, group]);
  async function save() {
    setBusy(true);
    try {
      const r = await api.updateFutureRecurrence(op.get(), group.id, f.from, f.weekday, f.start, f.end);
      op.renew();
      toast(`Horaire modifié · ${r.updated} séance(s) future(s) mise(s) à jour`);
      onSaved(); onClose();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Changer l'horaire (récurrence future)"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Appliquer</Button></>}>
      <div className="space-y-4">
        <Field label="Nouveau jour"><Select value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Début"><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Fin"><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <Field label="À partir du"><Input type="date" min={todayISO()} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Seules les séances prévues à partir de cette date sont déplacées (dans la même semaine). Les séances passées, validées ou déjà reportées individuellement ne sont jamais modifiées.</p>
      </div>
    </Modal>
  );
}

function PauseModal({ open, onClose, group, onSaved }: { open: boolean; onClose: () => void; group: GroupOverview; onSaved: () => void }) {
  const toast = useToast();
  const op = useOpKey();
  const [f, setF] = useState({ from: todayISO(), to: addDaysISO(todayISO(), 13), reason: "Vacances scolaires" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await api.pauseGroup(op.get(), group.id, f.from, f.to, f.reason);
      op.renew();
      toast(r.moved ? `${r.moved} séance(s) décalée(s) après la pause` : "Aucune séance à décaler sur cette période");
      onSaved(); onClose();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Pause (vacances)"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Décaler les séances</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Du"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Au (inclus)"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        </div>
        <Field label="Motif"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Les séances prévues pendant la pause sont reportées aux {weekdayName(group.weekday).toLowerCase()}s suivants, et le reste du cycle est décalé d&apos;autant. Le nombre de séances du cycle ne change pas.</p>
      </div>
    </Modal>
  );
}

function AddMemberModal({ open, onClose, group, players, memberIds, onSaved, onNew }: {
  open: boolean; onClose: () => void; group: GroupOverview; players: PlayerStats[]; memberIds: string[]; onSaved: () => void; onNew: () => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const list = players.filter((p) => !memberIds.includes(p.id) && !p.archived_at &&
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(q.toLowerCase()));
  async function add(p: PlayerStats) {
    setBusy(p.id);
    try { await api.addMember(group.id, p.id); toast(`${p.first_name} ajouté`); onSaved(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(null); }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Ajouter un joueur · ${group.name}`}
      footer={<Button variant="secondary" onClick={onNew}><Plus className="size-4" /> Nouveau joueur</Button>}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-3 size-4 text-slate-400" />
        <Input className="pl-9" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {memberIds.length >= group.capacity && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Le groupe est complet ({group.capacity}). Tu peux tout de même ajouter un joueur.</p>}
      <div className="divide-y divide-slate-100">
        {list.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Aucun joueur disponible.</p> : list.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.first_name} {p.last_name}</div>
              <div className="text-xs text-slate-500">{p.level ?? "—"} · {p.group_names.length ? p.group_names.join(", ") : "aucun groupe"}</div>
            </div>
            <Button size="sm" variant="secondary" loading={busy === p.id} onClick={() => add(p)}>Ajouter</Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function MoveModal({ m, onClose, groups, fromId, onSaved }: { m: Membership | null; onClose: () => void; groups: GroupOverview[]; fromId: string; onSaved: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (m) setTo(groups[0]?.id ?? ""); }, [m, groups]);
  async function save() {
    if (!m || !to) return;
    setBusy(true);
    try { await api.movePlayer(m.player_id, fromId, to); toast("Joueur déplacé"); onSaved(); onClose(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!m} onClose={onClose} title={`Déplacer ${m?.players?.first_name ?? ""}`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy} disabled={!to}>Déplacer</Button></>}>
      {groups.length === 0 ? <p className="text-sm text-slate-500">Aucun autre groupe actif.</p> : (
        <Field label="Vers le groupe" hint={`À compter du ${fmtDateLong(todayISO())}. L'historique reste dans le groupe d'origine.`}>
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {weekdayName(g.weekday)} {fmtRange(g.start_time, g.end_time)} ({g.member_count}/{g.capacity})</option>)}
          </Select>
        </Field>
      )}
    </Modal>
  );
}

function BulkValidateModal({ open, onClose, sessions, members, onDone }: {
  open: boolean; onClose: () => void; sessions: VSession[]; members: Membership[]; onDone: () => void;
}) {
  const toast = useToast();
  const [allPresent, setAllPresent] = useState(true);
  const [credit, setCredit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [keys, setKeys] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setDone(0);
    setKeys(Object.fromEntries(sessions.map((s) => [s.id, api.newOpKey()])));
  }, [open, sessions]);

  async function run() {
    setBusy(true);
    let ok = 0;
    try {
      const list = [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date));
      for (const s of list) {
        const att: api.AttendanceInput[] = members.map((m) => ({
          player_id: m.player_id, status: allPresent ? "present" : "unknown",
          consume_credit: allPresent && credit, is_guest: false,
        }));
        await api.validateSession(keys[s.id], s.id, att, null, null);
        ok++; setDone(ok);
      }
      toast(`${ok} séance(s) validée(s)`);
      onDone(); onClose();
    } catch (e) {
      toast(`${ok} validée(s), puis erreur : ${errMsg(e)}`, "err");
      onDone();
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`Valider ${sessions.length} séance(s) passée(s)`}
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Annuler</Button><Button variant="success" loading={busy} onClick={run}>
        {busy ? `${done}/${sessions.length}…` : "Tout valider"}</Button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">Pratique pour rattraper un retard. Chaque séance est validée et comptée comme réalisée dans son cycle. Tu pourras corriger une séance précise ensuite (bouton « Corriger »).</p>
        <ul className="max-h-40 overflow-y-auto rounded-xl bg-slate-50 p-2 text-xs text-slate-600">
          {sessions.map((s) => <li key={s.id} className="py-0.5">{fmtDate(s.session_date, "EEE d MMM")} · {fmtRange(s.start_time, s.end_time)}{s.cycle_index ? ` · séance ${s.cycle_index}/${s.planned_sessions}` : ""}</li>)}
        </ul>
        {members.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-amber-800">Aucun joueur inscrit : les séances seront validées sans feuille de présence.</p>
        ) : (
          <>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-violet-600" checked={allPresent} onChange={(e) => setAllPresent(e.target.checked)} /> Marquer les {members.length} joueurs présents</label>
            {allPresent && <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-violet-600" checked={credit} onChange={(e) => setCredit(e.target.checked)} /> Décompter 1 crédit par joueur et par séance ({members.length * sessions.length} au total)</label>}
          </>
        )}
      </div>
    </Modal>
  );
}
