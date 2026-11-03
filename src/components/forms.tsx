"use client";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { addDaysISO, fmtDate, todayISO, WEEKDAYS } from "@/lib/dates";
import { useOpKey } from "@/lib/hooks";
import { GROUP_COLORS, LEVELS } from "@/lib/labels";
import type { Group, GroupOverview, Player, SessionKind } from "@/lib/types";
import { Button, Checkbox, cx, errMsg, Field, Input, Modal, Select, Textarea, useToast } from "./ui";

/* ------------------------------ Groupe ------------------------------ */
export function GroupFormModal({ open, onClose, group, onSaved }: {
  open: boolean; onClose: () => void; group?: Group | GroupOverview | null; onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const editing = Boolean(group);
  const [f, setF] = useState({
    name: "", level: "P100", customLevel: "", weekday: 1, start_time: "19:00", end_time: "20:30", capacity: 4,
    color: GROUP_COLORS[0], notes: "", status: "active" as Group["status"],
    withCycle: true, planned: 10, customPlanned: 12, start: todayISO(), cycleName: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (group) {
      const std = LEVELS.includes(group.level);
      setF((x) => ({
        ...x, name: group.name, level: std ? group.level : "custom", customLevel: std ? "" : group.level,
        weekday: group.weekday, start_time: group.start_time.slice(0, 5), end_time: group.end_time.slice(0, 5),
        capacity: group.capacity, color: group.color, notes: group.notes ?? "", status: group.status, withCycle: false,
      }));
    } else {
      setF((x) => ({ ...x, name: "", notes: "", status: "active", withCycle: true, start: todayISO() }));
    }
  }, [open, group]);

  // Durée par défaut 1h30 : l'heure de fin suit l'heure de début
  function setStart(v: string) {
    const [h, m] = v.split(":").map(Number);
    const t = h * 60 + m + 90;
    const end = `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    setF({ ...f, start_time: v, end_time: end });
  }

  async function save() {
    if (!f.name.trim()) return toast("Le nom du groupe est obligatoire", "err");
    if (f.end_time <= f.start_time) return toast("L'heure de fin doit être après l'heure de début", "err");
    setBusy(true);
    try {
      const level = f.level === "custom" ? (f.customLevel.trim() || "Libre") : f.level;
      const base = { name: f.name.trim(), level, capacity: Number(f.capacity), color: f.color, notes: f.notes || null };
      if (editing && group) {
        await api.updateGroup(group.id, { ...base, status: f.status === "archived" ? group.status : f.status });
        toast("Groupe mis à jour");
        onSaved(group.id);
      } else {
        const planned = f.planned === 0 ? Number(f.customPlanned) : f.planned;
        const g = await api.createGroup(
          { ...base, weekday: Number(f.weekday), start_time: f.start_time, end_time: f.end_time },
          f.withCycle ? { planned, start: f.start, name: f.cycleName || undefined } : undefined,
        );
        toast(f.withCycle ? `Groupe créé avec ${planned} séances planifiées` : "Groupe créé");
        onSaved(g.id);
      }
      onClose();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier le groupe" : "Nouveau groupe"}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <Field label="Nom du groupe"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex. Perf P100 – Lundi" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Niveau">
            <Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
              <option value="custom">Personnalisé…</option>
            </Select>
          </Field>
          {f.level === "custom"
            ? <Field label="Niveau personnalisé"><Input value={f.customLevel} onChange={(e) => setF({ ...f, customLevel: e.target.value })} placeholder="Ex. Jeunes" /></Field>
            : <Field label="Capacité"><Input type="number" min={1} max={12} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></Field>}
        </div>
        {f.level === "custom" && <Field label="Capacité"><Input type="number" min={1} max={12} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></Field>}

        {!editing ? (
          <>
            <Field label="Jour récurrent">
              <Select value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début"><Input type="time" value={f.start_time} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="Fin" hint="1h30 par défaut"><Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Pour changer le jour ou l&apos;horaire, utilise « Changer l&apos;horaire » sur la fiche du groupe : les séances futures sont alors mises à jour sans toucher à l&apos;historique.</p>
            <Field label="Statut">
              <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Group["status"] })}>
                <option value="active">Actif</option>
                <option value="suspended">Suspendu</option>
                {f.status === "archived" && <option value="archived">Archivé</option>}
              </Select>
            </Field>
          </>
        )}

        <Field label="Couleur">
          <div className="flex flex-wrap gap-2">
            {GROUP_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c}
                className={cx("size-8 rounded-full ring-offset-2 transition", f.color === c && "ring-2 ring-slate-900")} style={{ background: c }} />
            ))}
          </div>
        </Field>

        {!editing && (
          <div className="rounded-2xl bg-violet-50/60 p-3 ring-1 ring-violet-100">
            <Checkbox label="Planifier le premier cycle" checked={f.withCycle} onChange={(v) => setF({ ...f, withCycle: v })} />
            {f.withCycle && (
              <div className="mt-2 space-y-3 px-2">
                <CycleSizePicker value={f.planned} custom={f.customPlanned} onChange={(planned, customPlanned) => setF({ ...f, planned, customPlanned })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="À partir du" hint="1re séance au prochain jour récurrent"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
                  <Field label="Nom (facultatif)"><Input value={f.cycleName} onChange={(e) => setF({ ...f, cycleName: e.target.value })} placeholder="Cycle 1" /></Field>
                </div>
              </div>
            )}
          </div>
        )}
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function CycleSizePicker({ value, custom, onChange }: { value: number; custom: number; onChange: (v: number, custom: number) => void }) {
  return (
    <Field label="Nombre de séances">
      <div className="flex flex-wrap items-center gap-2">
        {[5, 10].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n, custom)}
            className={cx("h-10 rounded-xl px-4 text-sm font-medium ring-1", value === n ? "bg-violet-600 text-white ring-violet-600" : "bg-white ring-slate-200")}>{n} séances</button>
        ))}
        <button type="button" onClick={() => onChange(0, custom)}
          className={cx("h-10 rounded-xl px-4 text-sm font-medium ring-1", value === 0 ? "bg-violet-600 text-white ring-violet-600" : "bg-white ring-slate-200")}>Autre</button>
        {value === 0 && <Input type="number" min={1} max={100} className="!w-24" value={custom} onChange={(e) => onChange(0, Number(e.target.value))} />}
      </div>
    </Field>
  );
}

/* ------------------------------ Ajouter une séance ------------------------------ */
export function AddSessionModal({ open, onClose, groups, defaultGroupId, defaultDate, onSaved }: {
  open: boolean; onClose: () => void; groups: Pick<GroupOverview, "id" | "name" | "start_time" | "end_time" | "status">[];
  defaultGroupId?: string; defaultDate?: string; onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ groupId: "", date: todayISO(), start: "", end: "", kind: "exceptional" as SessionKind, counts: false, notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const gid = defaultGroupId ?? groups.find((g) => g.status !== "archived")?.id ?? "";
    const g = groups.find((x) => x.id === gid);
    setF({ groupId: gid, date: defaultDate ?? todayISO(), start: g?.start_time.slice(0, 5) ?? "", end: g?.end_time.slice(0, 5) ?? "", kind: "exceptional", counts: false, notes: "" });
  }, [open, defaultGroupId, defaultDate, groups]);

  async function save() {
    if (!f.groupId) return toast("Choisis un groupe", "err");
    setBusy(true);
    try {
      const id = await api.addSession({ groupId: f.groupId, date: f.date, start: f.start, end: f.end, kind: f.kind, countsInCycle: f.counts, notes: f.notes });
      toast("Séance ajoutée");
      onSaved(id); onClose();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Ajouter une séance"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Ajouter</Button></>}>
      <div className="space-y-4">
        <Field label="Groupe">
          <Select value={f.groupId} onChange={(e) => {
            const g = groups.find((x) => x.id === e.target.value);
            setF({ ...f, groupId: e.target.value, start: g?.start_time.slice(0, 5) ?? f.start, end: g?.end_time.slice(0, 5) ?? f.end });
          }}>
            {groups.filter((g) => g.status !== "archived").map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as SessionKind, counts: e.target.value === "regular" })}>
            <option value="exceptional">Séance exceptionnelle</option>
            <option value="makeup">Séance de rattrapage</option>
            <option value="regular">Séance supplémentaire du cycle</option>
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Début"><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Fin"><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <Checkbox label="Compter cette séance dans le cycle" checked={f.counts} onChange={(v) => setF({ ...f, counts: v })}
          hint="Décision du coach : si coché, elle s'ajoute aux séances réalisées du cycle en cours." />
        <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Ex. Séance bonus avant tournoi" /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ Renouveler un cycle ------------------------------ */
export function RenewCycleModal({ open, onClose, group, lastPlanned, suggestedStart, onSaved }: {
  open: boolean; onClose: () => void; group: GroupOverview; lastPlanned: number | null; suggestedStart: string | null; onSaved: () => void;
}) {
  const toast = useToast();
  const op = useOpKey();
  const [f, setF] = useState({ planned: 10, custom: 12, start: "", keepMembers: true, keepSlot: true, weekday: 1, startTime: "", endTime: "", name: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const p = lastPlanned ?? 10;
    setF({ planned: [5, 10].includes(p) ? p : 0, custom: p, start: suggestedStart ?? todayISO(), keepMembers: true, keepSlot: true,
      weekday: group.weekday, startTime: group.start_time.slice(0, 5), endTime: group.end_time.slice(0, 5), name: "" });
  }, [open, lastPlanned, suggestedStart, group]);

  async function save() {
    setBusy(true);
    try {
      await api.renewCycle(op.get(), group.id, {
        planned: f.planned === 0 ? f.custom : f.planned, start: f.start, keepMembers: f.keepMembers,
        weekday: f.keepSlot ? null : f.weekday, startTime: f.keepSlot ? null : f.startTime, endTime: f.keepSlot ? null : f.endTime, name: f.name,
      });
      op.renew();
      toast("Nouveau cycle créé");
      onSaved(); onClose();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Renouveler le cycle"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Créer le cycle</Button></>}>
      <div className="space-y-4">
        <CycleSizePicker value={f.planned} custom={f.custom} onChange={(planned, custom) => setF({ ...f, planned, custom })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Démarrage à partir du" hint={suggestedStart ? `Suggestion : après le ${fmtDate(addDaysISO(suggestedStart, -1), "d MMM")}` : undefined}>
            <Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </Field>
          <Field label="Nom (facultatif)"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Cycle hiver" /></Field>
        </div>
        <Checkbox label="Conserver les joueurs" checked={f.keepMembers} onChange={(v) => setF({ ...f, keepMembers: v })}
          hint={f.keepMembers ? "Les membres actuels restent inscrits." : "Les membres actuels sont retirés à la date de démarrage (historique conservé)."} />
        <Checkbox label="Conserver le créneau" checked={f.keepSlot} onChange={(v) => setF({ ...f, keepSlot: v })} />
        {!f.keepSlot && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Jour"><Select value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</Select></Field>
            <Field label="Début"><Input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></Field>
            <Field label="Fin"><Input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------ Joueur ------------------------------ */
export function PlayerFormModal({ open, onClose, player, onSaved }: {
  open: boolean; onClose: () => void; player?: Player | null; onSaved: (p: Player) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ first_name: "", last_name: "", phone: "", email: "", level: "", notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ first_name: player?.first_name ?? "", last_name: player?.last_name ?? "", phone: player?.phone ?? "",
      email: player?.email ?? "", level: player?.level ?? "", notes: player?.notes ?? "" });
  }, [open, player]);
  async function save() {
    if (!f.first_name.trim()) return toast("Le prénom est obligatoire", "err");
    setBusy(true);
    try {
      const data = { first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone || null, email: f.email || null, level: f.level || null, notes: f.notes || null };
      if (player) { await api.updatePlayer(player.id, data); onSaved({ ...player, ...data }); toast("Joueur mis à jour"); }
      else { const p = await api.createPlayer(data); onSaved(p); toast("Joueur ajouté"); }
      onClose();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={player ? "Modifier le joueur" : "Nouveau joueur"}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Enregistrer</Button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom"><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} autoFocus /></Field>
          <Field label="Nom"><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Niveau">
            <Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
              <option value="">—</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ Confirmation ------------------------------ */
export function ConfirmModal({ open, onClose, title, children, confirmLabel = "Confirmer", danger, onConfirm }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Button></>}>
      <div className="text-sm text-slate-600">{children}</div>
    </Modal>
  );
}
