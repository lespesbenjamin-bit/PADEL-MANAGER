"use client";
import { useEffect, useState } from "react";
import { Button, Checkbox, errMsg, Modal, useToast } from "./ui";

export function ShareModal({ open, onClose, groups, initial, onSave }: {
  open: boolean; onClose: () => void; groups: { id: string; name: string }[]; initial: string[]; onSave: (ids: string[]) => Promise<void>;
}) {
  const toast = useToast();
  const [ids, setIds] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setIds(initial); }, [open, initial]);
  return (
    <Modal open={open} onClose={onClose} title="Partager avec des groupes"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={busy} onClick={async () => {
        setBusy(true); try { await onSave(ids); onClose(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
      }}>Enregistrer</Button></>}>
      <p className="mb-2 text-sm text-slate-600">Les joueurs de ces groupes le verront dans leur espace (lecture seule).</p>
      {groups.length === 0 ? <p className="text-sm text-slate-500">Aucun groupe actif.</p> : groups.map((g) => (
        <Checkbox key={g.id} label={g.name} checked={ids.includes(g.id)} onChange={(v) => setIds(v ? [...ids, g.id] : ids.filter((x) => x !== g.id))} />
      ))}
    </Modal>
  );
}

