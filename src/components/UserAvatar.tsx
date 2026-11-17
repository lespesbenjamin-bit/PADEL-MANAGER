"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import * as hub from "@/lib/hub";
import { useRole } from "@/lib/role";
import { Button, cx, errMsg, useToast } from "./ui";

const SIZES = { xs: "size-7 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-20 text-2xl" };

export function initialsOf(n: string | null | undefined) {
  const w = (n || "").split(/\s+/).filter(Boolean);
  return w.length ? w.slice(0, 2).map((x) => x[0]!.toUpperCase()).join("") : "•";
}

/** Photo de profil (stockage privé, lien signé) ou initiales à défaut */
export function UserAvatar({ name, path, coach, size = "md", className }: {
  name: string | null | undefined; path?: string | null; coach?: boolean; size?: keyof typeof SIZES; className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) hub.signedUrls([path]).then((u) => alive && setUrl(u[path] || null)).catch(() => {});
    return () => { alive = false; };
  }, [path]);
  return (
    <div className={cx("relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold",
      SIZES[size], coach ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-700", className)} title={name ?? undefined}>
      {url
        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={name ?? ""} className="absolute inset-0 size-full object-cover" />
        : initialsOf(name)}
    </div>
  );
}

/** Choisir / prendre / retirer sa photo de profil */
export function AvatarEditor() {
  const { profile, refresh } = useRole();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try { await hub.uploadAvatar(f, profile.coach_id, profile.id, profile.avatar_path); await refresh(); toast("Photo de profil mise à jour"); }
    catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <UserAvatar name={profile.display_name} path={profile.avatar_path} coach={profile.role === "coach"} size="lg" />
        {busy && <div className="absolute inset-0 grid place-items-center rounded-full bg-white/70"><Loader2 className="size-6 animate-spin text-violet-600" /></div>}
      </div>
      <div className="space-y-2">
        <div className="text-sm font-semibold">{profile.display_name}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => input.current?.click()} disabled={busy}><Camera className="size-4" /> {profile.avatar_path ? "Changer la photo" : "Ajouter une photo"}</Button>
          {profile.avatar_path && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await hub.removeAvatar(profile.avatar_path); await refresh(); toast("Photo retirée"); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
          }}><Trash2 className="size-4" /> Retirer</Button>}
        </div>
        <p className="text-xs text-slate-500">Visible uniquement par les membres de la communauté.</p>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
