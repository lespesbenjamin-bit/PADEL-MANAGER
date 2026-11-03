"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CalendarDays, LayoutDashboard, Loader2, RefreshCcw, Settings, Users, UsersRound } from "lucide-react";
import { isConfigured, supabase } from "@/lib/supabase";
import { Button, Card, cx, Field, Input, ToastProvider } from "./ui";

const NAV = [
  { href: "/", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
  { href: "/groupes", label: "Mes groupes", short: "Groupes", icon: UsersRound },
  { href: "/planning", label: "Planning", short: "Planning", icon: CalendarDays },
  { href: "/cycles", label: "Cycles", short: "Cycles", icon: RefreshCcw },
  { href: "/joueurs", label: "Joueurs", short: "Joueurs", icon: Users },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path.startsWith(href) || (href === "/planning" && path.startsWith("/seances"));
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {!isConfigured ? <NotConfigured /> : <AuthGate>{children}</AuthGate>}
    </ToastProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) {
    return <div className="flex min-h-dvh items-center justify-center text-slate-400"><Loader2 className="size-6 animate-spin" /></div>;
  }
  if (!session) return <Login />;
  return <Frame>{children}</Frame>;
}

function Frame({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh md:pl-64">
      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive(path, n.href) ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50")}>
              <n.icon className="size-5" /> {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/reglages" className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
          path.startsWith("/reglages") ? "bg-violet-50 text-violet-700" : "text-slate-500 hover:bg-slate-50")}>
          <Settings className="size-5" /> Réglages
        </Link>
      </aside>

      {/* En-tête (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur md:hidden">
        <Brand compact />
        <Link href="/reglages" aria-label="Réglages" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Settings className="size-5" /></Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">{children}</main>

      {/* Navigation basse (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map((n) => {
          const a = isActive(path, n.href);
          return (
            <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", a ? "text-violet-700" : "text-slate-500")}>
              <n.icon className={cx("size-5", a && "stroke-[2.4]")} />
              {n.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-violet-600 text-sm font-bold text-white shadow-sm shadow-violet-600/30">PG</div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-slate-900">Padel Group Manager</div>
        {!compact && <div className="text-xs text-slate-500">by Ben · Ace Padel Club</div>}
      </div>
    </Link>
  );
}

function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; m: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fn = mode === "in"
      ? supabase().auth.signInWithPassword({ email, password })
      : supabase().auth.signUp({ email, password });
    const { data, error } = await fn;
    setBusy(false);
    if (error) {
      setMsg({ t: "err", m: error.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : error.message });
    } else if (mode === "up" && !data.session) {
      setMsg({ t: "ok", m: "Compte créé. Confirme ton email via le lien reçu, puis connecte-toi." });
      setMode("in");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-violet-50 to-slate-50 px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-violet-600 font-bold text-white">PG</div>
          <h1 className="text-lg font-semibold">Padel Group Manager</h1>
          <p className="text-sm text-slate-500">Pilotage des groupes collectifs</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Email"><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Mot de passe"><Input type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {msg && <p className={cx("rounded-lg p-2 text-sm", msg.t === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{msg.m}</p>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>{mode === "in" ? "Se connecter" : "Créer mon compte"}</Button>
        </form>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-center text-sm text-violet-700 hover:underline">
          {mode === "in" ? "Première utilisation ? Créer le compte coach" : "J'ai déjà un compte"}
        </button>
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
          <code className="rounded bg-slate-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (fichier <code>.env.local</code> en local, ou
          Vercel → Settings → Environment Variables), puis redéploie.</p>
      </Card>
    </div>
  );
}
