"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, CalendarClock, Check, CheckCheck, History, Pencil, RotateCcw, Undo2, UserPlus } from "lucide-react";
import * as api from "@/lib/api";
import { fmtDate, fmtDateLong, fmtDateTime, fmtRange } from "@/lib/dates";
import { useAsync, useOpKey } from "@/lib/hooks";
import { ATTENDANCE, REVISION_ACTION, SESSION_KIND, SESSION_STATUS, sessionDisplayStatus } from "@/lib/labels";
import type { AttendanceStatus, Player, PlayerStats, VSession } from "@/lib/types";
import {
  Badge, Button, Card, Checkbox, cx, ErrorBox, errMsg, Field, Input, LevelBadge, Modal, Section, Select, Spinner, Textarea, useToast,
} from "@/components/ui";

type Row = api.AttendanceInput & { player: Player };

/** Règle par défaut : présent ou absent non excusé → 1 crédit ; excusé → pas de crédit. Le coach peut toujours modifier. */
const defaultCredit = (s: AttendanceStatus) => s === "present" || s === "absent";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const op = useOpKey();
  const { data, error, loading, reload } = useAsync(async () => {
    const session = await api.getSession(id);
    const [sheet, revisions, players] = await Promise.all([api.getAttendanceSheet(session), api.getRevisions(id), api.getPlayers()]);
    return { session, sheet, revisions, players };
  }, [id]);

  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState(false);
  const [counts, setCounts] = useState(true);
  const [notes, setNotes] = useState("");
  const [modal, setModal] = useState<null | "recap" | "reschedule" | "cancel" | "guest" | "reopen">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setRows(data.sheet);
    setCounts(data.session.counts_in_cycle);
    setNotes(data.session.notes ?? "");
    setEditing(data.session.status === "planned");
  }, [data]);

  const balances = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p.credits_balance])), [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const s = data.session;
  const st = SESSION_STATUS[sessionDisplayStatus(s)];
  const isValidated = s.status === "validated";
  const isCancelled = s.status === "cancelled";
  const canEdit = editing && !isCancelled;
  const isFuture = !s.pending_validation && s.status === "planned";

  const setRow = (pid: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.player_id === pid ? { ...x, ...patch } : x)));
  const setStatus = (pid: string, status: AttendanceStatus) => setRow(pid, { status, consume_credit: defaultCredit(status) });
  const allPresent = () => setRows((r) => r.map((x) => ({ ...x, status: "present", consume_credit: true })));

  const summary = {
    present: rows.filter((r) => r.status === "present").length,
    absent: rows.filter((r) => r.status === "absent").length,
    excused: rows.filter((r) => r.status === "excused").length,
    unknown: rows.filter((r) => r.status === "unknown").length,
    credits: rows.filter((r) => r.consume_credit).length,
  };
  const originalCredits = new Map(data.sheet.map((r) => [r.player_id, r.consume_credit]));
  const projected = (r: Row) => {
    const b = balances.get(r.player_id) ?? 0;
    const was = isValidated && originalCredits.get(r.player_id) ? 1 : 0;
    return b + was - (r.consume_credit ? 1 : 0);
  };

  async function submit() {
    setBusy(true);
    try {
      const att = rows.map(({ player: _p, ...r }) => r);
      if (isValidated) {
        const r = await api.correctSession(op.get(), s.id, att, reason, s.kind !== "regular" ? counts : null, notes);
        toast(`Correction enregistrée · ${r.credits_consumed} débité(s), ${r.credits_refunded} recrédité(s)`);
      } else {
        const r = await api.validateSession(op.get(), s.id, att, s.kind !== "regular" ? counts : null, notes);
        toast(`Séance validée · ${r.credits_consumed} crédit(s) débité(s)`);
      }
      op.renew(); setModal(null); setReason(""); reload();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }

  return (
    <>
      <Link href={`/groupes/${s.group_id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> {s.group_name}</Link>

      <Card className="relative mb-5 overflow-hidden p-5">
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: s.color }} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold capitalize">{fmtDateLong(s.session_date)}</h1>
              <Badge className={st.cls}>{st.label}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span>{fmtRange(s.start_time, s.end_time)}</span>
              <span className="inline-flex items-center gap-1.5">{s.group_name} <LevelBadge level={s.group_level} /></span>
              <span>{s.cycle_index ? `Séance ${s.cycle_index}/${s.planned_sessions} · ${s.cycle_name ?? `Cycle ${s.cycle_number}`}` : SESSION_KIND[s.kind]}</span>
            </div>
            {s.rescheduled && s.original_date && <p className="mt-1 text-xs text-slate-500">Reportée — date initiale : {fmtDate(s.original_date, "EEEE d MMMM")}</p>}
            {isCancelled && s.cancel_reason && <p className="mt-1 text-sm text-rose-600">Motif : {s.cancel_reason}</p>}
            {s.kind !== "regular" && <p className="mt-1 text-xs text-slate-500">{s.counts_in_cycle ? "Comptée dans le cycle" : "Non comptée dans le cycle"}</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {s.status === "planned" && <>
            <Button size="sm" variant="secondary" onClick={() => setModal("reschedule")}><CalendarClock className="size-4" /> Reporter / modifier</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal("cancel")}><Ban className="size-4" /> Annuler la séance</Button>
          </>}
          {isValidated && !editing && <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Corriger</Button>
            <Button size="sm" variant="ghost" onClick={() => setModal("reopen")}><Undo2 className="size-4" /> Annuler la validation</Button>
          </>}
          {isCancelled && <Button size="sm" variant="secondary" loading={busy} onClick={async () => {
            setBusy(true);
            try { await api.restoreSession(op.get(), s.id); op.renew(); toast("Séance rétablie"); reload(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
          }}><RotateCcw className="size-4" /> Rétablir la séance</Button>}
        </div>
      </Card>

      {!isCancelled && (
        <Section title="Feuille de présence" actions={canEdit && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setModal("guest")}><UserPlus className="size-4" /> Invité</Button>
            <Button size="sm" variant="secondary" onClick={allPresent}><CheckCheck className="size-4" /> Tous présents</Button>
          </div>
        )}>
          {isFuture && <p className="mb-2 rounded-xl bg-violet-50 p-2.5 text-xs text-violet-800">Séance à venir : tu peux préparer la feuille, la validation se fait normalement après la séance.</p>}
          <Card className="divide-y divide-slate-100">
            {rows.length === 0 && <div className="p-4 text-sm text-slate-500">Aucun joueur inscrit dans ce groupe. Tu peux quand même valider la séance (elle comptera dans le cycle), ou <Link href={`/groupes/${s.group_id}`} className="font-medium text-violet-700 underline">ajouter des joueurs au groupe</Link> / un invité.</div>}
            {rows.map((r) => {
              const proj = projected(r);
              return (
                <div key={r.player_id} className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/joueurs/${r.player_id}`} className="block truncate text-sm font-medium hover:text-violet-700">
                        {r.player.first_name} {r.player.last_name}
                        {r.is_guest && <span className="ml-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">invité</span>}
                      </Link>
                      <div className="text-xs text-slate-500">Solde : <b className={cx(proj < 0 ? "text-rose-600" : proj <= 1 && "text-amber-600")}>{balances.get(r.player_id) ?? 0}</b>
                        {canEdit && proj !== (balances.get(r.player_id) ?? 0) && <> → <b className={cx(proj < 0 ? "text-rose-600" : "text-slate-700")}>{proj}</b></>}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex gap-1">
                        {(["present", "absent", "excused"] as AttendanceStatus[]).map((k) => (
                          <button key={k} onClick={() => setStatus(r.player_id, r.status === k ? "unknown" : k)} title={ATTENDANCE[k].label}
                            className={cx("h-9 min-w-9 rounded-lg px-2 text-xs font-semibold ring-1 transition",
                              r.status === k ? ATTENDANCE[k].cls + " ring-transparent" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50")}>
                            <span className="sm:hidden">{ATTENDANCE[k].short}</span><span className="hidden sm:inline">{ATTENDANCE[k].label}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={cx("rounded-lg px-2 py-1 text-xs font-semibold", ATTENDANCE[r.status].cls)}>{ATTENDANCE[r.status].label}</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 pl-0.5">
                    {canEdit ? (
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" className="size-4 accent-violet-600" checked={r.consume_credit} onChange={(e) => setRow(r.player_id, { consume_credit: e.target.checked })} />
                        Décompter 1 crédit
                      </label>
                    ) : (
                      <span className="text-xs text-slate-500">{r.consume_credit ? "1 crédit décompté" : "Aucun crédit décompté"}</span>
                    )}
                    {canEdit && r.is_guest && <button className="text-xs text-rose-600 hover:underline" onClick={() => setRows((x) => x.filter((y) => y.player_id !== r.player_id))}>Retirer</button>}
                  </div>
                </div>
              );
            })}
          </Card>

          {canEdit && (
            <div className="mt-4 space-y-3">
              {s.kind !== "regular" && <Card className="p-2"><Checkbox label="Compter cette séance dans le cycle" checked={counts} onChange={setCounts} hint="Les séances exceptionnelles ne sont intégrées au cycle que sur ta décision." /></Card>}
              <Field label="Notes de séance"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thème travaillé, observations…" /></Field>
              <div className="sticky bottom-20 z-20 flex gap-2 md:bottom-4">
                {isValidated && <Button variant="secondary" size="lg" onClick={() => { setEditing(false); setRows(data.sheet); }}>Annuler</Button>}
                <Button size="lg" className="flex-1" onClick={() => setModal("recap")}>
                  <Check className="size-5" /> {isValidated ? "Enregistrer la correction" : "Valider la séance"}
                </Button>
              </div>
            </div>
          )}
          {!canEdit && s.notes && <Card className="mt-3 p-3 text-sm text-slate-600"><b className="text-slate-800">Notes :</b> {s.notes}</Card>}
        </Section>
      )}

      {data.revisions.length > 0 && (
        <Section title="Historique des modifications">
          <Card className="divide-y divide-slate-100">
            {data.revisions.map((r) => (
              <div key={r.id} className="flex items-start gap-3 p-3 text-sm">
                <History className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{REVISION_ACTION[r.action] ?? r.action}</div>
                  <div className="text-xs text-slate-500">{fmtDateTime(r.created_at)}{r.reason ? ` · ${r.reason}` : ""}</div>
                  {r.snapshot?.session?.session_date && ["reschedule", "pause", "recurrence"].includes(r.action) && (
                    <div className="text-xs text-slate-500">Avant : {fmtDate(r.snapshot.session.session_date as string, "EEE d MMM")} {fmtRange(String(r.snapshot.session.start_time), String(r.snapshot.session.end_time))}</div>
                  )}
                  {r.snapshot?.attendances?.length > 0 && ["validate", "correct", "reopen"].includes(r.action) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.snapshot.attendances.map((a) => {
                        const p = data.players.find((x) => x.id === a.player_id);
                        return <span key={a.player_id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{p?.first_name ?? "?"} : {ATTENDANCE[a.status].label}{a.consume_credit ? " · 1 cr." : ""}</span>;
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {/* ----- Récapitulatif avant validation ----- */}
      <Modal open={modal === "recap"} onClose={() => setModal(null)} title={isValidated ? "Confirmer la correction" : "Récapitulatif avant validation"}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Retour</Button>
          <Button variant="success" loading={busy} onClick={submit} disabled={isValidated && !reason.trim()}>{isValidated ? "Enregistrer" : "Valider"}</Button></>}>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-4 gap-2 text-center">
            {(["present", "absent", "excused", "unknown"] as AttendanceStatus[]).map((k) => (
              <div key={k} className="rounded-xl bg-slate-50 p-2"><div className="text-xl font-semibold">{summary[k]}</div><div className="text-[11px] text-slate-500">{ATTENDANCE[k].label}</div></div>
            ))}
          </div>
          <div className="rounded-xl bg-violet-50 p-3 text-violet-900">
            <b>{summary.credits}</b> crédit(s) seront décomptés au total.
            {s.kind === "regular" || counts ? <> La séance comptera comme <b>réalisée</b> dans le cycle{s.cycle_index ? ` (séance ${s.cycle_index}/${s.planned_sessions})` : ""}.</> : <> La séance <b>ne compte pas</b> dans le cycle.</>}
          </div>
          {summary.unknown > 0 && <p className="rounded-xl bg-amber-50 p-3 text-amber-800">{summary.unknown} joueur(s) sans statut renseigné.</p>}
          {rows.filter((r) => projected(r) < 0).length > 0 && (
            <p className="rounded-xl bg-rose-50 p-3 text-rose-700">Solde négatif après validation : {rows.filter((r) => projected(r) < 0).map((r) => r.player.first_name).join(", ")}.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.player_id} className="flex justify-between py-1.5">
                <span>{r.player.first_name} {r.player.last_name}</span>
                <span className="text-slate-500">{ATTENDANCE[r.status].label}{r.consume_credit ? " · −1 crédit" : ""}</span>
              </li>
            ))}
          </ul>
          {isValidated && <Field label="Motif de la correction (obligatoire)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. absence excusée signalée après coup" /></Field>}
        </div>
      </Modal>

      <RescheduleModal open={modal === "reschedule"} onClose={() => setModal(null)} s={s} onSaved={reload} />
      <CancelModal open={modal === "cancel"} onClose={() => setModal(null)} s={s} onSaved={reload} />
      <GuestModal open={modal === "guest"} onClose={() => setModal(null)} players={data.players.filter((p) => !rows.find((r) => r.player_id === p.id))}
        onPick={(p) => { setRows((r) => [...r, { player_id: p.id, status: "present", consume_credit: true, is_guest: true, note: null, player: p }]); setModal(null); }} />
      <Modal open={modal === "reopen"} onClose={() => setModal(null)} title="Annuler la validation"
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Retour</Button><Button variant="danger" loading={busy} onClick={async () => {
          setBusy(true);
          try { const r = await api.reopenSession(op.get(), s.id, reason) as { credits_refunded: number }; op.renew(); toast(`Validation annulée · ${r.credits_refunded} crédit(s) recrédité(s)`); setModal(null); setReason(""); reload(); }
          catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
        }}>Confirmer</Button></>}>
        <p className="mb-3 text-sm text-slate-600">La séance redevient « prévue », ne compte plus dans le cycle et tous les crédits décomptés sont recrédités. L&apos;historique est conservé.</p>
        <Field label="Motif"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Modal>
    </>
  );
}

function RescheduleModal({ open, onClose, s, onSaved }: { open: boolean; onClose: () => void; s: VSession; onSaved: () => void }) {
  const toast = useToast();
  const op = useOpKey();
  const [f, setF] = useState({ date: "", start: "", end: "", reason: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ date: s.session_date, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5), reason: "" }); }, [open, s]);
  async function save() {
    if (f.end <= f.start) return toast("L'heure de fin doit être après le début", "err");
    setBusy(true);
    try { await api.rescheduleSession(op.get(), s.id, f.date, f.start, f.end, f.reason); op.renew(); toast("Séance modifiée"); onSaved(); onClose(); }
    catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Reporter / modifier cette séance"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <Field label="Nouvelle date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Début"><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Fin"><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <Field label="Motif (facultatif)"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ex. tournoi le week-end" /></Field>
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Seule cette séance est modifiée. Elle reste rattachée à son cycle d&apos;origine. Pour changer toutes les séances futures, utilise « Changer l&apos;horaire » sur la fiche du groupe.</p>
      </div>
    </Modal>
  );
}

function CancelModal({ open, onClose, s, onSaved }: { open: boolean; onClose: () => void; s: VSession; onSaved: () => void }) {
  const toast = useToast();
  const op = useOpKey();
  const [reason, setReason] = useState("");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setReason(""); setReplace(s.counts_in_cycle && !!s.cycle_id); } }, [open, s]);
  async function save() {
    setBusy(true);
    try {
      const r = await api.cancelSession(op.get(), s.id, reason, replace);
      op.renew();
      toast(r.replacement_date ? `Séance annulée · remplacée le ${fmtDate(r.replacement_date, "EEE d MMM")}` : "Séance annulée");
      onSaved(); onClose();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Annuler la séance"
      footer={<><Button variant="ghost" onClick={onClose}>Retour</Button><Button variant="danger" onClick={save} loading={busy}>Annuler la séance</Button></>}>
      <div className="space-y-3">
        <Field label="Motif"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. terrain indisponible, météo…" /></Field>
        {s.cycle_id && s.counts_in_cycle && (
          <Checkbox label="Replanifier une séance en fin de cycle" checked={replace} onChange={setReplace}
            hint="Ajoute automatiquement une séance au prochain créneau après la dernière séance du cycle. Sinon, la fin prévisionnelle est simplement recalculée." />
        )}
        <p className="text-xs text-slate-500">Une séance annulée ne compte jamais comme réalisée et ne décompte aucun crédit.</p>
      </div>
    </Modal>
  );
}

function GuestModal({ open, onClose, players, onPick }: { open: boolean; onClose: () => void; players: PlayerStats[]; onPick: (p: PlayerStats) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const list = players.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title="Participation exceptionnelle / rattrapage"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button disabled={!sel} onClick={() => { const p = players.find((x) => x.id === sel); if (p) onPick(p); }}>Ajouter</Button></>}>
      <Input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      <Select value={sel} onChange={(e) => setSel(e.target.value)} size={8} className="!h-56">
        {list.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} · {p.credits_balance} cr. {p.group_names.length ? `(${p.group_names.join(", ")})` : ""}</option>)}
      </Select>
      <p className="mt-2 text-xs text-slate-500">Le joueur n&apos;est pas ajouté au groupe : il participe uniquement à cette séance (ses crédits sont utilisables dans tous les groupes).</p>
    </Modal>
  );
}
