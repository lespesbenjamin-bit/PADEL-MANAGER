"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import * as api from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button, Card, cx, errMsg, Field, Input, Segmented } from "@/components/ui";

export default function JoinPage() {
  return <Suspense fallback={null}><Join /></Suspense>;
}

function saveCode(c: string) { try { localStorage.setItem(api.INVITE_STORAGE_KEY, c); } catch {} }
function clearCode() { try { localStorage.removeItem(api.INVITE_STORAGE_KEY); } catch {} }

function Join() {
  const params = useSearchParams();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [mode, setMode] = useState<"up" | "in">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [checkMail, setCheckMail] = useState(false);
  const [loggedAs, setLoggedAs] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setLoggedAs(data.session?.user.email ?? null));
  }, []);

  async function claimAndGo() {
    await api.claimPlayerInvite(code);
    clearCode();
    window.location.href = "/";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6) { setErr("Saisis le code d'invitation reçu de ton coach."); return; }
    setBusy(true); setErr(null);
    saveCode(code);
    try {
      if (mode === "up") {
        const { data, error } = await supabase().auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) { setCheckMail(true); return; }
      } else {
        const { error } = await supabase().auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : error.message);
      }
      await claimAndGo();
    } catch (e) {
      const m = errMsg(e);
      setErr(m.includes("already registered") ? "Un compte existe déjà avec cet email : choisis « J'ai déjà un compte »." : m);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-violet-50 to-slate-50 px-4 py-8">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-violet-600 font-bold text-white">PC</div>
          <h1 className="text-lg font-semibold">Rejoins Padel Coach Hub</h1>
          <p className="mt-1 text-sm text-slate-500">Ton espace joueur : entraînements, crédits, tournois et communauté.</p>
        </div>

        {loggedAs === undefined ? <div className="flex justify-center py-6 text-slate-400"><Loader2 className="size-5 animate-spin" /></div> :
        checkMail ? (
          <div className="space-y-3 text-center text-sm text-slate-600">
            <MailCheck className="mx-auto size-10 text-violet-600" />
            <p><b>Vérifie ta boîte mail</b> ({email}) et clique sur le lien de confirmation.</p>
            <p>Ensuite, connecte-toi sur l&apos;application : si on te le demande, ton code est</p>
            <p className="rounded-xl bg-violet-50 py-2 font-mono text-lg font-semibold tracking-widest text-violet-800">{code}</p>
          </div>
        ) : loggedAs ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Tu es connecté avec <b>{loggedAs}</b>.</p>
            <Field label="Code d'invitation"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="text-center font-mono tracking-widest" /></Field>
            {err && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{err}</p>}
            <Button className="w-full" size="lg" loading={busy} onClick={async () => {
              setBusy(true); setErr(null);
              try { await claimAndGo(); } catch (e) {
                const m = errMsg(e);
                if (m.includes("déjà relié") || m.includes("compte coach")) window.location.href = "/"; else setErr(m);
              } finally { setBusy(false); }
            }}><CheckCircle2 className="size-5" /> Relier mon compte</Button>
            <button onClick={async () => { await supabase().auth.signOut(); setLoggedAs(null); }} className="w-full text-center text-sm text-slate-500 hover:underline">Utiliser un autre compte</button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              <Segmented value={mode} onChange={setMode} options={[{ value: "up", label: "Créer mon compte" }, { value: "in", label: "J'ai déjà un compte" }]} />
            </div>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Code d'invitation"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex. K7M2PQ9X"
                className={cx("text-center font-mono tracking-widest", code && "bg-violet-50")} /></Field>
              <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label="Mot de passe" hint={mode === "up" ? "6 caractères minimum" : undefined}>
                <Input type="password" required minLength={6} autoComplete={mode === "up" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {err && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{err}</p>}
              <Button type="submit" size="lg" className="w-full" loading={busy}>{mode === "up" ? "Créer mon compte" : "Se connecter"}</Button>
            </form>
            <p className="mt-4 text-center text-xs text-slate-400">Espace privé, réservé aux joueurs invités par leur coach.</p>
          </>
        )}
      </Card>
    </div>
  );
}
