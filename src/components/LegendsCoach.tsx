"use client";
/* PADEL LEGENDS – outils du coach */
import { useState } from "react";
import { Gift, Wrench } from "lucide-react";
import { Button, Card, Field, Input, Modal, Segmented, Textarea, errMsg, useToast } from "./ui";
import { useOpKey } from "@/lib/hooks";
import * as L from "@/lib/legends";

export function ManualXpModal({ open, onClose, playerId, name, onDone }: { open: boolean; onClose: () => void; playerId: string; name: string; onDone: () => void }) {
  const toast = useToast();
  const op = useOpKey();
  const [kind, setKind] = useState<"bonus" | "correction">("bonus");
  const [xp, setXp] = useState("20");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(xp);
  return (
    <Modal open={open} onClose={onClose} title={`XP manuels · ${name}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button loading={busy} disabled={!n || reason.trim().length < 5} onClick={async () => {
          setBusy(true);
          try {
            await L.manualXp(op.get(), playerId, n, kind, reason.trim());
            op.renew(); toast(kind === "bonus" ? `Bonus de ${n} XP accordé` : `Correction de ${n} XP enregistrée`);
            setReason(""); onDone(); onClose();
          } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
        }}>Enregistrer</Button>
      </>}>
      <div className="space-y-3">
        <Segmented value={kind} onChange={(v) => { setKind(v); op.renew(); }} options={[
          { value: "bonus", label: <span className="flex items-center gap-1"><Gift className="size-4" /> Bonus exceptionnel</span> },
          { value: "correction", label: <span className="flex items-center gap-1"><Wrench className="size-4" /> Correction</span> },
        ]} />
        <Field label="XP" hint={kind === "bonus" ? "Montant positif, plafonné (réglable)" : "Négatif pour retirer, positif pour ajouter"}>
          <Input type="number" value={xp} onChange={(e) => { setXp(e.target.value); op.renew(); }} />
        </Field>
        <Field label="Motif (obligatoire, visible par le joueur)">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : aide à l'organisation du tournoi interne" />
        </Field>
        <Card className="bg-amber-50 p-3 text-xs text-amber-800 ring-amber-200">
          Chaque ajustement est journalisé et ne peut pas être effacé. Limite : 3 ajustements manuels par joueur et par 24 h. Pour une erreur de présence, corrige plutôt la séance : les XP se recalculent tout seuls.
        </Card>
      </div>
    </Modal>
  );
}
