"use client";
import { useEffect, useState } from "react";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import * as hub from "@/lib/hub";
import { supabase } from "@/lib/supabase";
import { Button, Card, errMsg, Input, Modal, Segmented, useToast } from "./ui";

/* ------------------------------ Thème clair / sombre ------------------------------ */
type Theme = "light" | "dark" | "system";
export function applyTheme(t: Theme) {
  try { localStorage.setItem("pch-theme", t); } catch {}
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
export function ThemePicker() {
  const [t, setT] = useState<Theme>("light");
  useEffect(() => { try { setT((localStorage.getItem("pch-theme") as Theme) || "light"); } catch {} }, []);
  return (
    <Segmented value={t} onChange={(v) => { setT(v); applyTheme(v); }} options={[
      { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }, { value: "system", label: "Automatique" },
    ]} />
  );
}

/* ------------------------------ Consentement (1re connexion) ------------------------------ */
export function ConsentGate({ role }: { role: "coach" | "player" }) {
  const [need, setNeed] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => { hub.getMyConsent().then((c) => setNeed(!c)).catch(() => {}); }, []);
  if (!need) return null;
  return (
    <Modal open onClose={() => {}} title="Bienvenue sur Padel Coach Hub"
      footer={<>
        <Button variant="ghost" onClick={() => supabase().auth.signOut()}>Se déconnecter</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          try { await hub.acceptTerms(); setNeed(false); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
        }}><ShieldCheck className="size-4" /> J&apos;accepte</Button>
      </>}>
      <div className="space-y-3 text-sm text-slate-700">
        <p className="font-medium">Confidentialité</p>
        <ul className="list-disc space-y-1 pl-5">
          {role === "player" ? <>
            <li>Ton coach gère ta fiche : coordonnées, groupes, présences et crédits de séances.</li>
            <li>Tes tournois ne sont visibles que par toi et ton coach.</li>
            <li>Tes publications et photos sont visibles uniquement par les membres de la communauté privée (jamais publiques).</li>
            <li>Tu peux à tout moment exporter tes données ou supprimer tes contenus depuis « Mon profil ».</li>
          </> : <>
            <li>Tu es responsable des données de tes joueurs (coordonnées, présences, crédits, tournois, photos).</li>
            <li>Chaque joueur n&apos;accède qu&apos;à ses propres données et à la communauté privée.</li>
            <li>Les joueurs peuvent exporter leurs données et supprimer leurs contenus depuis leur profil.</li>
          </>}
        </ul>
        <p className="font-medium">Charte de la communauté</p>
        <p>Bienveillance et respect : pas de propos blessants, pas de photo d&apos;une personne sans son accord. Le coach peut masquer tout contenu signalé.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------ RGPD joueur ------------------------------ */
export function MyDataCard() {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-3 p-4 text-sm">
      <p className="text-slate-600">Tu peux télécharger une copie de toutes tes données, ou supprimer tes contenus (publications, commentaires, réactions, tournois) et détacher ton compte.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={async () => {
          try {
            const d = await hub.exportMyData();
            const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
            const a = document.createElement("a"); a.href = url; a.download = "mes-donnees-padel-coach-hub.json"; a.click(); URL.revokeObjectURL(url);
          } catch (e) { toast(errMsg(e), "err"); }
        }}><Download className="size-4" /> Exporter mes données</Button>
        <Button variant="ghost" className="text-rose-600" onClick={() => { setTyped(""); setConfirm(true); }}><Trash2 className="size-4" /> Supprimer mes données</Button>
      </div>
      <p className="text-xs text-slate-500">Ton historique de séances et de crédits reste conservé par ton coach (suivi des prestations).</p>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Supprimer mes données"
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Annuler</Button>
          <Button variant="danger" loading={busy} disabled={typed !== "SUPPRIMER"} onClick={async () => {
            setBusy(true);
            try { await hub.deleteMyAccountData(); await supabase().auth.signOut(); } catch (e) { toast(errMsg(e), "err"); setBusy(false); }
          }}>Supprimer définitivement</Button></>}>
        <p className="mb-3 text-sm text-slate-600">Tes publications, commentaires, réactions, tournois et notifications seront supprimés, et ton compte ne sera plus relié à ta fiche joueur. Tape <b>SUPPRIMER</b> pour confirmer.</p>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Modal>
    </Card>
  );
}
