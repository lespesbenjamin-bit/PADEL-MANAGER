"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { KeyRound, Loader2, LogOut, Menu, Settings, X } from "lucide-react";
import * as api from "@/lib/api";
import { isConfigured, supabase } from "@/lib/supabase";
import { RoleContext } from "@/lib/role";
import type { MyProfile } from "@/lib/types";
import { COACH_MOBILE, isActive, navFor, NavItem, PLAYER_ALLOWED, PLAYER_MOBILE } from "./nav";
import { Button, Card, cx, errMsg, Field, Input, ToastProvider } from "./ui";
import { NotificationBell } from "./NotificationBell";
import { ConsentGate } from "./AccountTools";
import { UserAvatar } from "./UserAvatar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {!isConfigured ? <NotConfigured /> : <AuthGate>{children}</AuthGate>}
    </ToastProvider>
  );
}

function FullLoader() {
  return <div className="flex min-h-dvh items-center justify-center text-slate-400"><Loader2 className="size-6 animate-spin" /></div>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<MyProfile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase().auth.onAuthStateChange((e, s) => { setSession(s); if (e === "PASSWORD_RECOVERY") setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    try { setProfile(await api.getMyProfile()); setProfileError(null); }
    catch (e) { setProfileError(errMsg(e)); setProfile(null); }
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (uid) { setProfile(undefined); loadProfile(); } else setProfile(undefined);
  }, [uid, loadProfile]);

  // La page d'invitation est accessible sans être connecté
  if (path.startsWith("/rejoindre")) return <>{children}</>;
  if (session === undefined) return <FullLoader />;
  if (!session) return <Login />;
  if (recovery) return <NewPassword onDone={() => setRecovery(false)} />;
  if (profile === undefined) return <FullLoader />;
  if (profileError) return <SetupError message={profileError} />;
  if (!profile) return <PendingAccess email={session.user.email ?? ""} onLinked={loadProfile} />;

  return (
    <RoleContext.Provider value={{ profile, email: session.user.email ?? null, refresh: loadProfile }}>
      <Frame profile={profile}>{children}</Frame>
    </RoleContext.Provider>
  );
}

/* ------------------------------ Cadre de l'application ------------------------------ */
function Frame({ profile, children }: { profile: MyProfile; children: ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const sections = navFor(profile.role);
  const all = sections.flatMap((s) => s.items);
  const mobileHrefs = profile.role === "coach" ? COACH_MOBILE : PLAYER_MOBILE;
  const mobile = mobileHrefs.map((h) => all.find((i) => i.href === h)!).filter(Boolean);
  const forbidden = profile.role === "player" && !PLAYER_ALLOWED.some((h) => h === "/" ? path === "/" : path.startsWith(h));

  useEffect(() => { setMore(false); }, [path]);

  return (
    <div className="min-h-dvh md:pl-64">
      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex">
        <div className="flex items-center justify-between"><Brand role={profile.role} /><NotificationBell align="left" /></div>
        <nav className="mt-6 flex flex-1 flex-col gap-4 overflow-y-auto">
          {sections.map((sec, i) => (
            <div key={i}>
              {sec.title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{sec.title}</div>}
              <div className="flex flex-col gap-0.5">{sec.items.map((n) => <SideLink key={n.href} n={n} active={isActive(path, n.href)} />)}</div>
            </div>
          ))}
        </nav>
        <AccountBox profile={profile} />
      </aside>

      {/* En-tête (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur md:hidden">
        <Brand role={profile.role} compact />
        <div className="flex items-center gap-1"><NotificationBell />
        {profile.role === "coach"
          ? <Link href="/reglages" aria-label="Réglages" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Settings className="size-5" /></Link>
          : <Link href="/mon-profil" aria-label="Mon profil"><UserAvatar name={profile.display_name} path={profile.avatar_path} size="sm" /></Link>}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
        {forbidden ? <Forbidden /> : children}
      </main>
      <ConsentGate role={profile.role} />

      {/* Navigation basse (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {mobile.map((n) => {
          const a = isActive(path, n.href);
          return (
            <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", a ? "text-violet-700" : "text-slate-500")}>
              <n.icon className={cx("size-5", a && "stroke-[2.4]")} />{n.short}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
          !mobile.some((n) => isActive(path, n.href)) ? "text-violet-700" : "text-slate-500")}>
          <Menu className="size-5" />Plus
        </button>
      </nav>

      {/* Menu « Plus » (mobile) */}
      {more && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">Tous les modules</span>
              <button onClick={() => setMore(false)} className="rounded-lg p-1 text-slate-400" aria-label="Fermer"><X className="size-5" /></button>
            </div>
            {sections.map((sec, i) => (
              <div key={i} className="mb-3">
                {sec.title && <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{sec.title}</div>}
                <div className="grid grid-cols-3 gap-2">
                  {sec.items.map((n) => (
                    <Link key={n.href} href={n.href} className={cx("relative flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center text-xs font-medium ring-1",
                      isActive(path, n.href) ? "bg-violet-50 text-violet-700 ring-violet-200" : "text-slate-700 ring-slate-200")}>
                      <n.icon className="size-5" />{n.label}
                      {n.step && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-slate-300" />}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-2 border-t border-slate-100 pt-3"><AccountBox profile={profile} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function SideLink({ n, active }: { n: NavItem; active: boolean }) {
  return (
    <Link href={n.href} className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
      active ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50")}>
      <n.icon className="size-[18px]" />
      <span className="flex-1">{n.label}</span>
      {n.step && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Bientôt</span>}
    </Link>
  );
}

function AccountBox({ profile }: { profile: MyProfile }) {
  const path = usePathname();
  return (
    <div className="flex flex-col gap-0.5">
      {profile.role === "coach" && (
        <Link href="/reglages" className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
          path.startsWith("/reglages") ? "bg-violet-50 text-violet-700" : "text-slate-500 hover:bg-slate-50")}>
          <Settings className="size-[18px]" /> Réglages
        </Link>
      )}
      <button onClick={() => supabase().auth.signOut()} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-50">
        <LogOut className="size-[18px]" /> Se déconnecter
      </button>
    </div>
  );
}

function initials(name: string | null) {
  if (!name) return "•";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

export function Brand({ role, compact }: { role?: MyProfile["role"]; compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-violet-600 text-sm font-bold text-white shadow-sm shadow-violet-600/30">PC</div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-slate-900">Padel Coach Hub</div>
        {!compact && <div className="text-xs text-slate-500">{role === "player" ? "Espace joueur" : "by Ben · Coach padel"}</div>}
      </div>
    </Link>
  );
}

function Forbidden() {
  return (
    <Card className="mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="mb-2 text-lg font-semibold">Page réservée au coach</h1>
      <p className="mb-4 text-sm text-slate-500">Cette partie de l&apos;application n&apos;est pas accessible depuis un espace joueur.</p>
      <Link href="/"><Button>Retour à mon espace</Button></Link>
    </Card>
  );
}

/* ------------------------------ Compte sans rôle : saisie du code d'invitation ------------------------------ */
function PendingAccess({ email, onLinked }: { email: string; onLinked: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const claim = useCallback(async (c: string) => {
    setBusy(true); setErr(null);
    try {
      await api.claimPlayerInvite(c);
      try { localStorage.removeItem(api.INVITE_STORAGE_KEY); } catch {}
      await onLinked();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }, [onLinked]);

  // Code mémorisé lors de l'inscription : on le valide automatiquement
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(api.INVITE_STORAGE_KEY); } catch {}
    if (saved) { setCode(saved); claim(saved); }
  }, [claim]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-violet-50 to-slate-50 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-violet-100 text-violet-700"><KeyRound className="size-6" /></div>
          <h1 className="text-lg font-semibold">Relie ton compte</h1>
          <p className="mt-1 text-sm text-slate-500">Connecté avec <b>{email}</b>. Saisis le code d&apos;invitation envoyé par ton coach pour accéder à ton espace joueur.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); claim(code); }} className="space-y-3">
          <Field label="Code d'invitation"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex. K7M2PQ9X" className="text-center font-mono tracking-widest" autoFocus /></Field>
          {err && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{err}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.trim().length < 6}>Accéder à mon espace</Button>
        </form>
        <button onClick={() => supabase().auth.signOut()} className="mt-4 w-full text-center text-sm text-slate-500 hover:underline">Se déconnecter</button>
      </Card>
    </div>
  );
}

function SetupError({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-md p-6 text-sm text-slate-600">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Mise à jour de la base nécessaire</h1>
        <p className="mb-2">L&apos;application n&apos;a pas pu lire ton profil. La migration Supabase <code className="rounded bg-slate-100 px-1">002_coach_hub_roles.sql</code> n&apos;a probablement pas encore été exécutée.</p>
        <p className="rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-500">{message}</p>
        <Button variant="secondary" className="mt-4" onClick={() => supabase().auth.signOut()}>Se déconnecter</Button>
      </Card>
    </div>
  );
}

/* ------------------------------ Connexion ------------------------------ */
function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMsg(error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." :
      error.message === "Email not confirmed" ? "Confirme d'abord ton email via le lien reçu." : error.message);
  }

  async function reset() {
    if (!email) { setMsg("Saisis ton email puis clique à nouveau sur « Mot de passe oublié »."); return; }
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) setMsg(error.message); else setResetSent(true);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-violet-50 to-slate-50 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-violet-600 font-bold text-white">PC</div>
          <h1 className="text-lg font-semibold">Padel Coach Hub</h1>
          <p className="text-sm text-slate-500">Entraînements, tournois et communauté</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Mot de passe"><Input type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {msg && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{msg}</p>}
          {resetSent && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">Email de réinitialisation envoyé.</p>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>Se connecter</Button>
        </form>
        <div className="mt-4 flex flex-col items-center gap-2 text-sm">
          <button onClick={reset} className="text-slate-500 hover:underline">Mot de passe oublié</button>
          <button onClick={() => router.push("/rejoindre")} className="font-medium text-violet-700 hover:underline">J&apos;ai reçu une invitation de mon coach</button>
        </div>
      </Card>
    </div>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-violet-50 to-slate-50 px-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-4 text-lg font-semibold">Nouveau mot de passe</h1>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr(null);
          const { error } = await supabase().auth.updateUser({ password: pwd });
          setBusy(false);
          if (error) setErr(error.message); else onDone();
        }}>
          <Field label="Mot de passe (6 caractères min.)"><Input type="password" minLength={6} required autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></Field>
          {err && <p className="rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{err}</p>}
          <Button type="submit" className="w-full" loading={busy}>Enregistrer</Button>
        </form>
      </Card>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-md p-6 text-sm text-slate-600">
        <h1 className="mb-2 text-lg font-semibold text-slate-900">Configuration Supabase manquante</h1>
        <p>Ajoute les variables <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
          <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> dans Vercel, puis redéploie.</p>
      </Card>
    </div>
  );
}
