"use client";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import { Button, Card, ErrorBox, errMsg, Field, Input, PageHeader, Section, Spinner, useToast } from "@/components/ui";
import { MyDataCard, ThemePicker } from "@/components/AccountTools";
import { AvatarEditor } from "@/components/UserAvatar";

export default function MyProfilePage() {
  const { email, refresh } = useRole();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => api.getMyPlayerSpace(), []);
  const [f, setF] = useState({ first_name: "", last_name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setF({ first_name: data.player.first_name, last_name: data.player.last_name, phone: data.player.phone ?? "", email: data.player.email ?? "" });
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="Mon profil" subtitle={`Compte : ${email ?? ""}`} />
      <Section title="Photo de profil">
        <Card className="p-4"><AvatarEditor /></Card>
      </Section>
      <Section title="Mes coordonnées">
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom"><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
            <Field label="Nom"><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
          </div>
          <Field label="Téléphone"><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Email de contact"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Button loading={busy} onClick={async () => {
            setBusy(true);
            try { await api.updateMyProfile(f); await refresh(); toast("Profil mis à jour"); reload(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
          }}>Enregistrer</Button>
        </Card>
        <p className="mt-2 text-xs text-slate-500">Ton niveau, tes groupes et tes crédits sont gérés par ton coach.</p>
      </Section>
      <Section title="Affichage">
        <Card className="p-4"><ThemePicker /></Card>
      </Section>
      <Section title="Mes données (RGPD)"><MyDataCard /></Section>
      <Section title="Compte">
        <Card className="p-4">
          <Button variant="secondary" onClick={() => supabase().auth.signOut()}><LogOut className="size-4" /> Se déconnecter</Button>
        </Card>
      </Section>
    </>
  );
}
