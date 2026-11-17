"use client";
/* Fil d'actualité communautaire (style réseau social) : utilisé par la page Communauté (coach)
   et comme page d'accueil de l'espace joueur. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, CalendarClock, EyeOff, Flag, MessageCircle, MoreHorizontal, Pin, Send, ShieldCheck, Star, ThumbsUp, Trash2, Trophy, Wallet, X,
} from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import { fmtDate, fmtRange, timeAgo, todayISO } from "@/lib/dates";
import { useRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import { ConfirmModal } from "./forms";
import { PhotoGrid } from "./Photos";
import { UserAvatar as Avatar } from "./UserAvatar";
import { AuthorBadge, AuthorFrame, SharedCard } from "./AuthorCard";
import { Badge, Button, Card, cx, Empty, ErrorBox, errMsg, Input, Modal, PageHeader, Segmented, Select, Spinner, Textarea, useToast } from "./ui";

const REACTION_LABEL: Record<string, string> = { "👍": "J'aime", "❤️": "J'adore", "🔥": "Top", "👏": "Bravo", "💪": "Force", "🎾": "Padel" };
export function CommunityFeed({ home }: { home?: boolean }) {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const [tab, setTab] = useState<"all" | "mine" | "moderation">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("moderation") ? "moderation" : "all");
  const [posts, setPosts] = useState<hub.FeedPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await hub.getFeed({ author: tab === "mine" ? profile.id : null });
      setPosts(list); setMore(list.length >= 20);
    } catch (e) { setError(errMsg(e)); }
  }, [tab, profile.id]);
  useEffect(() => { if (tab !== "moderation") { setPosts(null); load(); } }, [load, tab]);
  // rafraîchit le fil quand on revient sur l'onglet
  useEffect(() => {
    const h = () => { if (document.visibilityState === "visible" && tab !== "moderation") load(); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [load, tab]);

  async function loadMore() {
    if (!posts?.length) return;
    setLoadingMore(true);
    try {
      const last = [...posts].filter((p) => !p.pinned).pop();
      const next = await hub.getFeed({ before: last?.created_at ?? posts[posts.length - 1].created_at, author: tab === "mine" ? profile.id : null });
      setPosts([...posts, ...next.filter((n) => !posts.some((p) => p.id === n.id))]); setMore(next.length >= 20);
    } finally { setLoadingMore(false); }
  }

  return (
    <div className="mx-auto max-w-xl">
      {home ? <PlayerStrip /> : <PageHeader title="Communauté" subtitle="Espace privé, réservé aux joueurs et au coach" />}
      <div className="mb-3 flex items-center justify-between">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "all", label: "Fil d'actualité" }, { value: "mine", label: "Mes publications" },
          ...(isCoach ? [{ value: "moderation" as const, label: "Modération" }] : []),
        ]} />
      </div>
      {tab === "moderation" ? <Moderation /> : (
        <>
          <Composer onPosted={load} />
          {error ? <ErrorBox error={error} onRetry={load} /> : !posts ? <Spinner /> : posts.length === 0 ? (
            <Empty>Pas encore de publication. Lance la discussion !</Empty>
          ) : (
            <div className="space-y-3">
              {posts.map((p) => <PostCard key={p.id} p={p} onChange={load} />)}
              {more && <div className="pb-4 text-center"><Button variant="secondary" loading={loadingMore} onClick={loadMore}>Voir plus de publications</Button></div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ Bandeau joueur (accueil) ------------------------------ */
function PlayerStrip() {
  const [info, setInfo] = useState<{ next?: { date: string; start: string; end: string; group: string }; balance: number; debrief: number } | null>(null);
  useEffect(() => {
    const today = todayISO();
    Promise.all([api.getMyPlayerSpace(), hub.getTournaments(false).catch(() => [] as hub.Tournament[])]).then(([s, t]) => {
      if (!s) return;
      const n = s.upcoming.find((u) => u.status === "planned");
      setInfo({ next: n ? { date: n.session_date, start: n.start_time, end: n.end_time, group: n.group_name } : undefined,
        balance: s.credits.balance, debrief: t.filter((x) => hub.needsDebrief(x, today)).length });
    }).catch(() => {});
  }, []);
  if (!info) return <div className="mb-4 h-16" />;
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      <Link href="/mon-espace" className="shrink-0">
        <Card className="flex items-center gap-2.5 px-3 py-2.5">
          <CalendarClock className="size-5 text-violet-600" />
          <div className="text-xs leading-tight">
            <div className="text-slate-500">Prochain entraînement</div>
            <div className="font-semibold capitalize">{info.next ? `${fmtDate(info.next.date, "EEE d MMM")} · ${fmtRange(info.next.start, info.next.end)}` : "Aucun prévu"}</div>
          </div>
        </Card>
      </Link>
      <Link href="/mon-espace" className="shrink-0">
        <Card className="flex items-center gap-2.5 px-3 py-2.5">
          <Wallet className={cx("size-5", info.balance <= 1 ? "text-amber-500" : "text-violet-600")} />
          <div className="text-xs leading-tight"><div className="text-slate-500">Crédits</div><div className="font-semibold">{info.balance}</div></div>
        </Card>
      </Link>
      {info.debrief > 0 && (
        <Link href="/tournois" className="shrink-0">
          <Card className="flex items-center gap-2.5 border-l-4 border-amber-400 px-3 py-2.5">
            <Trophy className="size-5 text-amber-500" />
            <div className="text-xs leading-tight"><div className="text-slate-500">Tournoi</div><div className="font-semibold">À débriefer ({info.debrief})</div></div>
          </Card>
        </Link>
      )}
    </div>
  );
}

/* ------------------------------ Zone de publication ------------------------------ */
function Composer({ onPosted }: { onPosted: () => void }) {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const toast = useToast();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<hub.PostKind>("message");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const first = (profile.display_name ?? "").split(" ")[0];

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setFiles((f) => [...f, ...Array.from(list)].slice(0, 6));
    setOpen(true);
  }

  async function publish() {
    if (!body.trim() && !files.length) return;
    setBusy(true);
    try {
      const photos: string[] = [];
      for (const f of files) photos.push(await hub.uploadPhoto(f, profile.coach_id, profile.id));
      await hub.createPost({ owner_id: profile.coach_id, kind, body: body.trim(), photos });
      setBody(""); setFiles([]); setKind("message"); setOpen(false);
      toast("Publié"); onPosted();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }

  return (
    <Card className="mb-4 p-3">
      {!profile.avatar_path && (
        <Link href={isCoach ? "/reglages" : "/mon-profil"} className="mb-3 flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800 hover:bg-violet-100">
          <Camera className="size-4" /> Ajoute ta photo de profil pour que les autres te reconnaissent
        </Link>
      )}
      <div className="flex items-start gap-2.5">
        <Avatar name={profile.display_name} path={profile.avatar_path} coach={isCoach} />
        {open ? (
          <Textarea ref={text} autoFocus value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={isCoach ? "Partage une annonce, une info…" : `Quoi de neuf${first ? `, ${first}` : ""} ?`}
            className="!min-h-20 !rounded-2xl !bg-slate-50 !ring-0 text-[15px]" />
        ) : (
          <button onClick={() => setOpen(true)} className="h-10 flex-1 rounded-full bg-slate-100 px-4 text-left text-[15px] text-slate-500 hover:bg-slate-200/70">
            {isCoach ? "Partage une annonce, une info…" : `Quoi de neuf${first ? `, ${first}` : ""} ?`}
          </button>
        )}
      </div>

      {previews.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {previews.map((u, i) => (
            <div key={u} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="size-full object-cover" />
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Retirer la photo"
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-slate-900/70 text-white"><X className="size-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex min-w-0 items-center gap-1 border-t border-slate-100 pt-2">
        <button onClick={() => input.current?.click()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" aria-label="Ajouter une photo">
          <Camera className="size-5 text-emerald-600" /> Photo
        </button>
        {open && (
          <Select value={kind} onChange={(e) => setKind(e.target.value as hub.PostKind)} className="!h-9 min-w-0 !w-auto max-w-[8.5rem] truncate border-0 !bg-transparent !px-1 text-sm !ring-0" aria-label="Type de publication">
            {(Object.keys(hub.POST_KINDS) as hub.PostKind[]).filter((k) => k !== "announcement" || isCoach)
              .map((k) => <option key={k} value={k}>{hub.POST_KINDS[k].emoji} {hub.POST_KINDS[k].label}</option>)}
          </Select>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {open && <button onClick={() => { setOpen(false); setFiles([]); setBody(""); }} aria-label="Annuler" title="Annuler"
            className="grid size-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>}
          <Button size="sm" loading={busy} disabled={!body.trim() && !files.length} onClick={publish}>Publier</Button>
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>
    </Card>
  );
}

/* ------------------------------ Publication ------------------------------ */
function PostCard({ p, onChange }: { p: hub.FeedPost; onChange: () => void }) {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const mine = p.author_id === profile.id;
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<{ post_id?: string; comment_id?: string } | null>(null);
  const [comment, setComment] = useState("");
  const [allComments, setAllComments] = useState(false);
  const [reactions, setReactions] = useState(p.reactions);
  const [myReactions, setMyReactions] = useState(p.my_reactions);
  const [picker, setPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const commentInput = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(() => { setReactions(p.reactions); setMyReactions(p.my_reactions); }, [p.reactions, p.my_reactions]);

  const total = Object.values(reactions).reduce((a, b) => a + b, 0);
  const top = Object.entries(reactions).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
  const mineR = myReactions[0];

  /** Une seule réaction par personne, comme sur un réseau social */
  async function react(e: string) {
    setPicker(false);
    const removing = mineR === e;
    const prev = { reactions, myReactions };
    const nextR = { ...reactions };
    for (const m of myReactions) nextR[m] = Math.max(0, (nextR[m] ?? 0) - 1);
    if (!removing) nextR[e] = (nextR[e] ?? 0) + 1;
    setReactions(nextR); setMyReactions(removing ? [] : [e]);
    try {
      for (const m of prev.myReactions) await hub.toggleReaction(profile.coach_id, p.id, m, false);
      if (!removing) await hub.toggleReaction(profile.coach_id, p.id, e, true);
    } catch (err) { setReactions(prev.reactions); setMyReactions(prev.myReactions); toast(errMsg(err), "err"); }
  }
  async function act(fn: () => Promise<unknown>, msg: string) {
    setMenu(false);
    try { await fn(); toast(msg); onChange(); } catch (e) { toast(errMsg(e), "err"); }
  }
  async function send() {
    if (!comment.trim()) return;
    setSending(true);
    try { await hub.addComment(profile.coach_id, p.id, comment.trim()); setComment(""); setAllComments(true); onChange(); }
    catch (e) { toast(errMsg(e), "err"); } finally { setSending(false); }
  }

  const visibleComments = allComments ? p.comments : p.comments.slice(-2);

  return (
    <Card className={cx("overflow-visible", p.highlighted && "ring-2 ring-amber-300", p.hidden && "opacity-70")}>
      {(p.pinned || p.highlighted || p.hidden) && (
        <div className={cx("flex items-center gap-1.5 rounded-t-2xl px-4 py-1.5 text-xs font-medium",
          p.hidden ? "bg-slate-100 text-slate-600" : p.highlighted ? "bg-amber-50 text-amber-800" : "bg-violet-50 text-violet-700")}>
          {p.hidden ? <><EyeOff className="size-3.5" /> Masquée par le coach</> : p.highlighted ? <><Star className="size-3.5" /> Mis en avant par le coach</> : <><Pin className="size-3.5" /> Épinglée</>}
        </div>
      )}

      {/* en-tête */}
      <div className="flex items-start gap-2.5 px-4 pt-3">
        <AuthorFrame userId={p.author_id} enabled={p.author_role !== "coach"}><Avatar name={p.author_name} path={p.author_avatar} coach={p.author_role === "coach"} /></AuthorFrame>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15px] font-semibold">{p.author_name}</span>
            <AuthorBadge userId={p.author_id} enabled={p.author_role !== "coach"} />
            {p.author_role === "coach" && <Badge className="bg-violet-50 text-violet-700 ring-violet-200"><ShieldCheck className="size-3" /> Coach</Badge>}
          </div>
          <div className="text-xs text-slate-500">{timeAgo(p.created_at)}{p.kind !== "message" && <> · {hub.POST_KINDS[p.kind].emoji} {hub.POST_KINDS[p.kind].label}</>}</div>
        </div>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Options"><MoreHorizontal className="size-5" /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200">
                {isCoach && <MenuItem icon={Pin} onClick={() => act(() => hub.updatePost(p.id, { pinned: !p.pinned }), p.pinned ? "Désépinglée" : "Épinglée")}>{p.pinned ? "Désépingler" : "Épingler"}</MenuItem>}
                {isCoach && <MenuItem icon={Star} onClick={() => act(() => hub.updatePost(p.id, { highlighted: !p.highlighted }), "Mise à jour")}>{p.highlighted ? "Retirer la mise en avant" : "Mettre en avant"}</MenuItem>}
                {isCoach && <MenuItem icon={EyeOff} onClick={() => act(() => hub.updatePost(p.id, { hidden: !p.hidden }), p.hidden ? "Publication visible" : "Publication masquée")}>{p.hidden ? "Rendre visible" : "Masquer"}</MenuItem>}
                {(mine || isCoach) && <MenuItem icon={Trash2} danger onClick={() => { setMenu(false); setConfirm(true); }}>Supprimer</MenuItem>}
                {!mine && !isCoach && <MenuItem icon={Flag} onClick={() => { setMenu(false); setReport({ post_id: p.id }); }}>Signaler</MenuItem>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* contenu */}
      {p.body && <p className="whitespace-pre-wrap px-4 pt-2.5 text-[15px] leading-relaxed text-slate-800">{p.body}</p>}
      {typeof (p.meta as { legend_level?: number })?.legend_level === "number" && <SharedCard level={(p.meta as { legend_level: number }).legend_level} />}
      {p.meta?.tournament && (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-50 to-white p-3 ring-1 ring-violet-100">
          <Trophy className="size-6 text-amber-500" />
          <div className="text-sm">
            <div className="font-semibold">{p.meta.tournament}{p.meta.category ? ` · ${p.meta.category}` : ""}</div>
            <div className="text-slate-600">{p.meta.result}{p.meta.record ? ` · ${p.meta.record}` : ""}</div>
          </div>
        </div>
      )}
      {p.photos.length > 0 && <PhotoGrid paths={p.photos} className="mt-3 !rounded-none" />}

      {/* compteurs */}
      {(total > 0 || p.comments.length > 0) && (
        <div className="flex items-center justify-between px-4 pt-2.5 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1">
            {total > 0 && <><span className="flex -space-x-1">{top.map((e) => <span key={e} className="grid size-5 place-items-center rounded-full bg-white text-xs ring-2 ring-white">{e}</span>)}</span>{total}</>}
          </span>
          {p.comments.length > 0 && <button onClick={() => setAllComments(!allComments)} className="hover:underline">{p.comments.length} commentaire{p.comments.length > 1 ? "s" : ""}</button>}
        </div>
      )}

      {/* actions */}
      <div className="relative mx-3 mt-2 grid grid-cols-2 border-y border-slate-100 py-1">
        {picker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPicker(false)} />
            <div className="absolute -top-12 left-0 z-20 flex gap-1 rounded-full bg-white px-2 py-1.5 shadow-lg ring-1 ring-slate-200"
              onMouseEnter={() => hoverTimer.current && clearTimeout(hoverTimer.current)} onMouseLeave={() => setPicker(false)}>
              {hub.REACTIONS.map((e) => (
                <button key={e} onClick={() => react(e)} title={REACTION_LABEL[e]} className="grid size-9 place-items-center rounded-full text-xl transition hover:scale-125">{e}</button>
              ))}
            </div>
          </>
        )}
        <button
          onClick={() => { if (longPressed.current) { longPressed.current = false; return; } react(mineR ?? "👍"); }}
          onMouseEnter={() => { hoverTimer.current = setTimeout(() => setPicker(true), 600); }}
          onMouseLeave={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }}
          onTouchStart={() => { longPressed.current = false; pressTimer.current = setTimeout(() => { longPressed.current = true; setPicker(true); }, 450); }}
          onTouchEnd={() => { if (pressTimer.current) clearTimeout(pressTimer.current); }}
          onContextMenu={(e) => e.preventDefault()}
          className={cx("inline-flex select-none items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition hover:bg-slate-50",
            mineR ? "text-violet-700" : "text-slate-600")}>
          {mineR && mineR !== "👍" ? <span className="text-lg leading-none">{mineR}</span> : <ThumbsUp className={cx("size-5", mineR && "fill-violet-600 text-violet-700")} />}
          {mineR ? REACTION_LABEL[mineR] : "J'aime"}
        </button>
        <button onClick={() => { setAllComments(true); setTimeout(() => commentInput.current?.focus(), 50); }}
          className="inline-flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <MessageCircle className="size-5" /> Commenter
        </button>
      </div>

      {/* commentaires */}
      <div className="space-y-2 px-4 py-3">
        {!allComments && p.comments.length > 2 && (
          <button onClick={() => setAllComments(true)} className="text-sm font-medium text-slate-500 hover:underline">Voir les {p.comments.length - 2} commentaires précédents</button>
        )}
        {visibleComments.map((c) => (
          <div key={c.id} className={cx("group flex gap-2", c.hidden && "opacity-50")}>
            <Avatar name={c.author_name} path={c.author_avatar} coach={c.author_role === "coach"} size="sm" />
            <div className="min-w-0">
              <div className="inline-block max-w-full rounded-2xl bg-slate-100 px-3 py-2">
                <div className="text-[13px] font-semibold">{c.author_name}</div>
                <p className="whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
              </div>
              <div className="mt-0.5 flex gap-3 px-2 text-xs text-slate-500">
                <span>{timeAgo(c.created_at)}{c.hidden ? " · masqué" : ""}</span>
                {isCoach && <button onClick={() => act(() => hub.hideComment(c.id, !c.hidden), "Commentaire mis à jour")} className="font-medium hover:underline">{c.hidden ? "Afficher" : "Masquer"}</button>}
                {(isCoach || c.author_id === profile.id) && <button onClick={() => act(() => hub.deleteComment(c.id), "Commentaire supprimé")} className="font-medium hover:underline">Supprimer</button>}
                {!isCoach && c.author_id !== profile.id && <button onClick={() => setReport({ comment_id: c.id })} className="font-medium hover:underline">Signaler</button>}
              </div>
            </div>
          </div>
        ))}
        {!p.hidden && (
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
            <Avatar name={profile.display_name} path={profile.avatar_path} coach={isCoach} size="sm" />
            <div className="relative flex-1">
              <Input ref={commentInput} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Écrire un commentaire…"
                className="!h-9 !rounded-full !bg-slate-100 pr-10 !ring-0" />
              <button type="submit" disabled={!comment.trim() || sending} aria-label="Envoyer"
                className="absolute right-1 top-1 grid size-7 place-items-center rounded-full text-violet-600 disabled:text-slate-300"><Send className="size-4" /></button>
            </div>
          </form>
        )}
      </div>

      <ConfirmModal open={confirm} onClose={() => setConfirm(false)} title="Supprimer la publication" danger confirmLabel="Supprimer"
        onConfirm={async () => {
          try { await hub.deletePost(p.id); if (mine) await hub.removePhotos(p.photos); toast("Publication supprimée"); setConfirm(false); onChange(); }
          catch (e) { toast(errMsg(e), "err"); }
        }}>
        La publication, ses commentaires et ses réactions seront supprimés.
      </ConfirmModal>
      <ReportModal target={report} onClose={() => setReport(null)} />
    </Card>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50", danger && "text-rose-600")}>
      <Icon className="size-4" />{children}
    </button>
  );
}

function ReportModal({ target, onClose }: { target: { post_id?: string; comment_id?: string } | null; onClose: () => void }) {
  const { profile } = useRole();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={!!target} onClose={onClose} title="Signaler au coach"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button loading={busy} onClick={async () => {
        setBusy(true);
        try { await hub.reportContent(profile.coach_id, target!, reason || "Contenu inapproprié"); toast("Signalement envoyé au coach"); setReason(""); onClose(); }
        catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
      }}>Envoyer</Button></>}>
      <p className="mb-2 text-sm text-slate-600">Le coach sera prévenu et pourra masquer ce contenu.</p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (facultatif)" />
    </Modal>
  );
}

/* ------------------------------ Modération (coach) ------------------------------ */
function Moderation() {
  const toast = useToast();
  const [rows, setRows] = useState<(hub.Report & { content: string; post_hidden?: boolean })[] | null>(null);
  const load = useCallback(async () => {
    const reports = await hub.getOpenReports();
    const postIds = reports.map((r) => r.post_id).filter(Boolean) as string[];
    const commentIds = reports.map((r) => r.comment_id).filter(Boolean) as string[];
    const [posts, comments] = await Promise.all([
      postIds.length ? supabase().from("posts").select("id, body, hidden").in("id", postIds) : Promise.resolve({ data: [] as { id: string; body: string; hidden: boolean }[] }),
      commentIds.length ? supabase().from("post_comments").select("id, body, hidden").in("id", commentIds) : Promise.resolve({ data: [] as { id: string; body: string; hidden: boolean }[] }),
    ]);
    setRows(reports.map((r) => {
      const src = r.post_id ? posts.data?.find((x) => x.id === r.post_id) : comments.data?.find((x) => x.id === r.comment_id);
      return { ...r, content: src?.body ?? "(contenu supprimé)", post_hidden: src?.hidden };
    }));
  }, []);
  useEffect(() => { load().catch((e) => toast(errMsg(e), "err")); }, [load, toast]);

  if (!rows) return <Spinner />;
  if (!rows.length) return <Empty>Aucun signalement en attente.</Empty>;
  return (
    <Card className="divide-y divide-slate-100">
      {rows.map((r) => (
        <div key={r.id} className="p-4 text-sm">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Flag className="size-3.5 text-rose-500" />{r.post_id ? "Publication" : "Commentaire"} signalé · {timeAgo(r.created_at)}</div>
          <p className="mt-1 rounded-lg bg-slate-50 p-2 text-slate-700">{r.content}</p>
          {r.reason && <p className="mt-1 text-xs text-slate-500">Motif : {r.reason}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {!r.post_hidden && <Button size="sm" variant="danger" onClick={async () => {
              try { if (r.post_id) await hub.updatePost(r.post_id, { hidden: true }); else if (r.comment_id) await hub.hideComment(r.comment_id, true);
                await hub.closeReport(r.id); toast("Contenu masqué"); load(); } catch (e) { toast(errMsg(e), "err"); }
            }}>Masquer le contenu</Button>}
            <Button size="sm" variant="secondary" onClick={async () => { try { await hub.closeReport(r.id); toast("Signalement classé"); load(); } catch (e) { toast(errMsg(e), "err"); } }}>Classer sans suite</Button>
          </div>
        </div>
      ))}
    </Card>
  );
}

