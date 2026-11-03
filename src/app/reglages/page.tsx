"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, LogOut, Trash2 } from "lucide-react";
import * as api from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { ConfirmModal } from "@/components/forms";
import { Button, Card, errMsg, Input, PageHeader, Section, useToast } from "@/components/ui";

export default function SettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  useEffect(() => { supabase().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);

  return (
    <>
      <PageHeader title="Réglages" />
      <Section title="Compte">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><div className="text-sm text-slate-500">Connecté en tant que</div><div className="font-medium">{email ?? "…"}</div></div>
          <Button variant="secondary" onClick={() => supabase().auth.signOut()}><LogOut className="size-4" /> Se déconnecter</Button>
        </Card>
      </Section>

      <Section title="Données de démonstration">
        <Card className="p-4">
          <p className="mb-3 text-sm text-slate-600">Charge 4 groupes, 14 joueurs, des cycles en cours avec séances validées, une annulation, une séance exceptionnelle et des forfaits. Disponible uniquement si la base est vide.</p>
          <Button loading={busy} onClick={async () => {
            setBusy(true);
            try { await api.seedDemo(); toast("Données de démo chargées"); router.push("/"); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
          }}><Database className="size-4" /> Charger la démo</Button>
        </Card>
      </Section>

      <Section title="Zone sensible">
        <Card className="p-4 ring-rose-200">
          <p className="mb-3 text-sm text-slate-600">Supprime définitivement tous tes groupes, joueurs, cycles, séances, présences et forfaits (par exemple pour repartir de zéro après la démo).</p>
          <Button variant="danger" onClick={() => { setTyped(""); setConfirm(true); }}><Trash2 className="size-4" /> Tout supprimer</Button>
        </Card>
      </Section>

      <p className="text-center text-xs text-slate-400">Padel Group Manager – by Ben · v1.0 · Fuseau horaire Europe/Paris</p>

      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Supprimer toutes les données" danger confirmLabel="Supprimer définitivement"
        onConfirm={async () => {
          if (typed !== "SUPPRIMER") { toast("Tape SUPPRIMER pour confirmer", "err"); return; }
          try { await api.deleteAllData(); toast("Toutes les données ont été supprimées"); setConfirm(false); router.push("/"); } catch (e) { toast(errMsg(e), "err"); }
        }}>
        <p className="mb-3">Cette action est irréversible. Tape <b>SUPPRIMER</b> pour confirmer.</p>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
      </ConfirmModal>
    </>
  );
}
