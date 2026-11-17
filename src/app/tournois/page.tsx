"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Handshake, MapPin, Medal, Plus, Trophy, Users } from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import { addMonthsISO, fmtDate, monthGrid, monthRange, todayISO, WEEKDAYS_SHORT } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { useRole } from "@/lib/role";
import type { PlayerStats } from "@/lib/types";
import { ConfirmModal } from "@/components/forms";
import { PhotoGrid, PhotoPicker } from "@/components/Photos";
import {
  Badge, Button, Card, Checkbox, cx, Empty, ErrorBox, errMsg, Field, Input, Modal, PageHeader, Section, Segmented, Select, Spinner, Textarea, useToast,
} from "@/components/ui";

type T = hub.Tournament;

export default function TournamentsPage() {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const { data, error, loading, reload } = useAsync(async () => {
    const [list, players] = await Promise.all([hub.getTournaments(isCoach), isCoach ? api.getPlayers() : Promise.resolve([] as PlayerStats[])]);
    return { list, players };
  }, [isCoach]);

  const [view, setView] = useState<"list" | "calendar" | "multi" | "requests">("list");
  const [period, setPeriod] = useState<"upcoming" | "past" | "all">("upcoming");
  const [fPlayer, setFPlayer] = useState("");
  const [fCat, setFCat] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [month, setMonth] = useState(todayISO());
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const [detail, setDetail] = useState<T | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const [share, setShare] = useState<T | null>(null);
  const today = todayISO();

  const filtered = useMemo(() => (data?.list ?? []).filter((t) =>
    (!fPlayer || t.player_id === fPlayer) && (!fCat || t.category === fCat) && (!fStatus || t.status === fStatus) &&
    (view === "calendar" || period === "all" || (period === "upcoming" ? (t.end_date ?? t.start_date) >= today : (t.end_date ?? t.start_date) < today))
  ), [data, fPlayer, fCat, fStatus, period, view, today]);

  const requests = (data?.list ?? []).filter((t) => t.coaching_status === "requested");
  const multi = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const t of (data?.list ?? []).filter((x) => x.status !== "cancelled" && (x.end_date ?? x.start_date) >= today)) {
      const k = `${t.name.trim().toLowerCase()}|${t.start_date}`;
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.values()].filter((g) => new Set(g.map((x) => x.player_id)).size > 1).sort((a, b) => a[0].start_date.localeCompare(b[0].start_date));
  }, [data, today]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  const list = view === "requests" ? requests : filtered;
  const sorted = [...list].sort((a, b) => period === "past" ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date));

  return (
    <>
      <PageHeader title={isCoach ? "Tournois" : "Mes tournois"}
        subtitle={isCoach ? "Le calendrier des compétitions de tes joueurs" : "Ton calendrier de compétitions et tes résultats"}
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" /> Ajouter un tournoi</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[
          { value: "list", label: "Liste" }, { value: "calendar", label: "Calendrier" },
          ...(isCoach ? [{ value: "multi" as const, label: `Plusieurs joueurs (${multi.length})` }, { value: "requests" as const, label: `Demandes (${requests.length})` }] : []),
        ]} />
        {view === "list" && (
          <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="!h-8 !w-auto text-sm">
            <option value="upcoming">À venir</option><option value="past">Passés</option><option value="all">Tous</option>
          </Select>
        )}
        {(view === "list" || view === "calendar") && (
          <>
            {isCoach && (
              <Select value={fPlayer} onChange={(e) => setFPlayer(e.target.value)} className="!h-8 !w-auto text-sm">
                <option value="">Tous les joueurs</option>
                {data.players.map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
              </Select>
            )}
            <Select value={fCat} onChange={(e) => setFCat(e.target.value)} className="!h-8 !w-auto text-sm">
              <option value="">Toutes catégories</option>
              {[...new Set([...hub.TOURNAMENT_CATEGORIES, ...data.list.map((t) => t.category)])].map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="!h-8 !w-auto text-sm">
              <option value="">Tous statuts</option>
              {Object.entries(hub.T_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </>
        )}
      </div>

      {view === "calendar" ? (
        <TournamentCalendar month={month} setMonth={setMonth} list={filtered} isCoach={isCoach} onOpen={setDetail} />
      ) : view === "multi" ? (
        multi.length === 0 ? <Empty>Aucun tournoi à venir avec plusieurs de tes joueurs inscrits.</Empty> : (
          <div className="space-y-3">
            {multi.map((g) => (
              <Card key={g[0].id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{g[0].name} <Badge className="ml-1 bg-slate-900 text-white ring-slate-900">{g[0].category}</Badge></div>
                    <div className="text-sm text-slate-500">{fmtDate(g[0].start_date, "EEEE d MMMM")}{g[0].club ? ` · ${g[0].club}` : ""}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-violet-700"><Users className="size-4" />{new Set(g.map((x) => x.player_id)).size} joueurs</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {g.map((t) => (
                    <button key={t.id} onClick={() => setDetail(t)} className="rounded-xl bg-slate-50 px-3 py-1.5 text-left text-sm ring-1 ring-slate-200 hover:bg-violet-50">
                      <b>{t.player_first_name} {t.player_last_name}</b>{t.partner_name ? <span className="text-slate-500"> avec {t.partner_name}</span> : null}
                      <span className={cx("ml-2 inline-block size-2 rounded-full", hub.T_STATUS[t.status].dot)} />
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : sorted.length === 0 ? (
        <Empty action={<Button onClick={() => setEditing("new")}>Ajouter un tournoi</Button>}>
          {view === "requests" ? "Aucune demande d'accompagnement en attente." : "Aucun tournoi pour ces critères."}
        </Empty>
      ) : (
        <Card className="divide-y divide-slate-100">
          {sorted.map((t) => <TournamentRow key={t.id} t={t} isCoach={isCoach} onClick={() => setDetail(t)} />)}
        </Card>
      )}

      <TournamentForm open={!!editing} onClose={() => setEditing(null)} t={editing === "new" ? null : editing} players={data.players}
        onSaved={() => { setEditing(null); setDetail(null); reload(); }} />
      <TournamentDetail t={detail} isCoach={isCoach} onClose={() => setDetail(null)}
        onEdit={(t) => { setDetail(null); setEditing(t); }} onResult={(t) => { setDetail(null); setResult(t); }} onChanged={() => { setDetail(null); reload(); }} />
      <ResultModal t={result} onClose={() => setResult(null)}
        onSaved={(t) => { setResult(null); reload(); if (!isCoach && t.result_rank) setShare(t); }} />
      <ShareResultModal t={share} onClose={() => setShare(null)} />
    </>
  );
}

function TournamentRow({ t, isCoach, onClick }: { t: T; isCoach: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50", t.status === "cancelled" && "opacity-60")}>
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
        </div>
        {(t.coaching_status !== "none" || t.result_rank) && (
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {t.coaching_status !== "none" && <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              t.coaching_status === "requested" ? "bg-amber-50 text-amber-800" : t.coaching_status === "accepted" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-600")}>
              <Handshake className="size-3" />{hub.C_STATUS[t.coaching_status]}</span>}
            {t.result_rank && <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"><Medal className="size-3" />{t.result_rank}
              {t.wins != null && t.losses != null ? ` · ${t.wins}V-${t.losses}D` : ""}</span>}
          </div>
        )}
      </div>
      <Badge className={hub.T_STATUS[t.status].cls}>{hub.T_STATUS[t.status].label}</Badge>
    </button>
  );
}

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
                  </button>
                ))}
                {on(d).length > 3 && <div className="px-1 text-[10px] text-slate-500">+{on(d).length - 3}</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ------------------------------ Formulaire ------------------------------ */
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
            : <Field label="Statut"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as hub.TournamentStatus })}>
                {Object.entries(hub.T_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>}
        </div>
        {f.category === "custom" && <Field label="Statut"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as hub.TournamentStatus })}>
          {Object.entries(hub.T_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>}
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
      </div>
    </Modal>
  );
}

/* ------------------------------ Détail ------------------------------ */
function TournamentDetail({ t, isCoach, onClose, onEdit, onResult, onChanged }: {
  t: T | null; isCoach: boolean; onClose: () => void; onEdit: (t: T) => void; onResult: (t: T) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  if (!t) return null;
  const past = (t.end_date ?? t.start_date) <= todayISO();

  async function decide(s: hub.CoachingStatus) {
    setBusy(s);
    try { await hub.saveTournament(t!.id, { coaching_status: s, coach_note: note || t!.coach_note }); toast(s === "accepted" ? "Accompagnement accepté" : "Réponse envoyée"); onChanged(); }
    catch (e) { toast(errMsg(e), "err"); } finally { setBusy(null); }
  }

  return (
    <Modal open onClose={onClose} title={t.name}
      footer={<>
        <Button variant="ghost" className="mr-auto text-rose-600" onClick={() => setConfirm(true)}>Supprimer</Button>
        <Button variant="secondary" onClick={() => onEdit(t)}>Modifier</Button>
        {(past || t.status === "done") && <Button onClick={() => onResult(t)}><Trophy className="size-4" /> {t.result_rank ? "Modifier le résultat" : "Saisir le résultat"}</Button>}
      </>}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <Badge className="bg-slate-900 text-white ring-slate-900">{t.category}</Badge>
          <Badge className={hub.T_STATUS[t.status].cls}>{hub.T_STATUS[t.status].label}</Badge>
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
          {isCoach && <><dt className="text-slate-500">Joueur</dt><dd className="font-medium">{t.player_first_name} {t.player_last_name}</dd></>}
          <dt className="text-slate-500">Date</dt><dd className="capitalize">{fmtDate(t.start_date, "EEEE d MMMM yyyy")}{t.end_date && t.end_date !== t.start_date ? ` → ${fmtDate(t.end_date, "d MMM")}` : ""}</dd>
          {(t.club || t.city) && <><dt className="text-slate-500">Lieu</dt><dd>{[t.club, t.city].filter(Boolean).join(", ")}</dd></>}
          {t.partner_name && <><dt className="text-slate-500">Partenaire</dt><dd>{t.partner_name}</dd></>}
          {t.goal && <><dt className="text-slate-500">Objectif</dt><dd>{t.goal}</dd></>}
        </dl>
        {t.coaching_status !== "none" && (
          <div className="rounded-xl bg-violet-50 p-3">
            <div className="flex items-center gap-1.5 font-medium text-violet-800"><Handshake className="size-4" />{hub.C_STATUS[t.coaching_status]}</div>
            {t.coach_note && <p className="mt-1 text-violet-900">« {t.coach_note} »</p>}
            {isCoach && t.coaching_status === "requested" && (
              <div className="mt-2 space-y-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Message au joueur (facultatif)" />
                <div className="flex gap-2">
                  <Button size="sm" variant="success" loading={busy === "accepted"} onClick={() => decide("accepted")}>Accepter</Button>
                  <Button size="sm" variant="secondary" loading={busy === "declined"} onClick={() => decide("declined")}>Pas disponible</Button>
                </div>
              </div>
            )}
          </div>
        )}
        {t.result_rank && (
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
            <div className="flex items-center gap-1.5 font-semibold"><Medal className="size-4" />{t.result_rank}</div>
            {t.matches_played != null && <div className="mt-0.5 text-xs">{t.matches_played} match(s) · {t.wins ?? 0} victoire(s) · {t.losses ?? 0} défaite(s)</div>}
            {t.player_comment && <p className="mt-1">{t.player_comment}</p>}
          </div>
        )}
        <PhotoGrid paths={t.photos} />
      </div>
      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Supprimer ce tournoi" danger confirmLabel="Supprimer"
        onConfirm={async () => { try { await hub.deleteTournament(t.id); await hub.removePhotos(t.photos); toast("Tournoi supprimé"); setConfirm(false); onChanged(); } catch (e) { toast(errMsg(e), "err"); } }}>
        Le tournoi et son résultat seront supprimés.
      </ConfirmModal>
    </Modal>
  );
}

/* ------------------------------ Résultat ------------------------------ */
function ResultModal({ t, onClose, onSaved }: { t: T | null; onClose: () => void; onSaved: (t: T) => void }) {
  const { profile } = useRole();
  const toast = useToast();
  const [f, setF] = useState({ rank: "", custom: "", played: "", wins: "", losses: "", comment: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if ((t?.id ?? null) !== last) {
    setLast(t?.id ?? null);
    if (t) {
      const std = !t.result_rank || hub.RESULT_RANKS.includes(t.result_rank);
      setF({ rank: std ? (t.result_rank ?? "") : "custom", custom: std ? "" : (t.result_rank ?? ""), played: t.matches_played?.toString() ?? "",
        wins: t.wins?.toString() ?? "", losses: t.losses?.toString() ?? "", comment: t.player_comment ?? "" });
      setFiles([]);
    }
  }
  if (!t) return null;

  async function save() {
    const rank = f.rank === "custom" ? f.custom.trim() : f.rank;
    if (!rank) return toast("Indique le résultat final", "err");
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) uploaded.push(await hub.uploadPhoto(file, profile.coach_id, profile.id));
      const n = (v: string) => (v === "" ? null : Math.max(0, Number(v)));
      const saved = await hub.saveTournament(t!.id, {
        status: "done", result_rank: rank, matches_played: n(f.played), wins: n(f.wins), losses: n(f.losses),
        player_comment: f.comment || null, photos: [...t!.photos, ...uploaded],
      });
      toast("Résultat enregistré");
      onSaved(saved);
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Résultat · ${t.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <Field label="Résultat final">
          <Select value={f.rank} onChange={(e) => setF({ ...f, rank: e.target.value })}>
            <option value="">—</option>{hub.RESULT_RANKS.map((r) => <option key={r}>{r}</option>)}<option value="custom">Autre…</option>
          </Select>
        </Field>
        {f.rank === "custom" && <Field label="Résultat (libre)"><Input value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} /></Field>}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Matchs"><Input type="number" min={0} value={f.played} onChange={(e) => setF({ ...f, played: e.target.value })} /></Field>
          <Field label="Victoires"><Input type="number" min={0} value={f.wins} onChange={(e) => setF({ ...f, wins: e.target.value })} /></Field>
          <Field label="Défaites"><Input type="number" min={0} value={f.losses} onChange={(e) => setF({ ...f, losses: e.target.value })} /></Field>
        </div>
        <Field label="Commentaire"><Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} placeholder="Ressenti, points à travailler…" /></Field>
        <Field label="Photos (facultatif)"><PhotoPicker files={files} onChange={setFiles} /></Field>
        {t.photos.length > 0 && <PhotoGrid paths={t.photos} />}
      </div>
    </Modal>
  );
}

/* ------------------------------ Proposition de publication ------------------------------ */
function ShareResultModal({ t, onClose }: { t: T | null; onClose: () => void }) {
  const { profile } = useRole();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  if ((t?.id ?? null) !== last) {
    setLast(t?.id ?? null);
    if (t) setText(`${t.result_rank} au ${t.name} (${t.category})${t.partner_name ? ` avec ${t.partner_name}` : ""} ! 🎾${t.player_comment ? `\n${t.player_comment}` : ""}`);
  }
  if (!t) return null;
  const podium = ["Vainqueur", "Finaliste"].includes(t.result_rank ?? "");
  return (
    <Modal open onClose={onClose} title="Partager ce résultat ?"
      footer={<><Button variant="ghost" onClick={onClose}>Non merci</Button><Button loading={busy} onClick={async () => {
        setBusy(true);
        try {
          await hub.createPost({ owner_id: profile.coach_id, kind: podium ? "podium" : "result", body: text, photos: t.photos, tournament_id: t.id,
            meta: { tournament: t.name, date: t.start_date, category: t.category, result: t.result_rank ?? undefined,
              record: t.wins != null && t.losses != null ? `${t.wins}V-${t.losses}D` : undefined } });
          toast("Publié dans la communauté"); onClose();
        } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
      }}>Publier</Button></>}>
      <p className="mb-3 text-sm text-slate-600">Tu peux publier ton résultat dans la communauté privée. Rien n&apos;est publié sans ta confirmation.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-28" />
      {t.photos.length > 0 && <p className="mt-2 text-xs text-slate-500">{t.photos.length} photo(s) jointe(s).</p>}
    </Modal>
  );
}
