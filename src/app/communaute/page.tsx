"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EyeOff, Flag, MessageCircle, MoreHorizontal, Pin, Send, ShieldCheck, Star, Trash2, Trophy } from "lucide-react";
import * as hub from "@/lib/hub";
import { timeAgo } from "@/lib/dates";
import { useRole } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import { ConfirmModal } from "@/components/forms";
import { PhotoGrid, PhotoPicker } from "@/components/Photos";
import { Badge, Button, Card, cx, Empty, ErrorBox, errMsg, Input, Modal, PageHeader, Segmented, Select, Spinner, Textarea, useToast } from "@/components/ui";

export default function CommunityPage() {
  return <Suspense fallback={<Spinner />}><Community /></Suspense>;
}

function Community() {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const params = useSearchParams();
  const [tab, setTab] = useState<"all" | "mine" | "moderation">(params.get("moderation") ? "moderation" : "all");
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
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Communauté" subtitle="Espace privé, réservé aux joueurs et au coach" />
      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "all", label: "Fil" }, { value: "mine", label: "Mes publications" },
          ...(isCoach ? [{ value: "moderation" as const, label: "Modération" }] : []),
        ]} />
      </div>
      {tab === "moderation" ? <Moderation /> : (
        <>
          <Composer onPosted={load} />
          {error ? <ErrorBox error={error} onRetry={load} /> : !posts ? <Spinner /> : posts.length === 0 ? (
            <Empty>Pas encore de publication. Lance la discussion !</Empty>
          ) : (
            <div className="space-y-4">
              {posts.map((p) => <PostCard key={p.id} p={p} onChange={load} />)}
              {more && <div className="text-center"><Button variant="secondary" loading={loadingMore} onClick={loadMore}>Voir plus</Button></div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------ Rédaction ------------------------------ */
function Composer({ onPosted }: { onPosted: () => void }) {
  const { profile } = useRole();
  const isCoach = profile.role === "coach";
  const toast = useToast();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<hub.PostKind>("message");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

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
    <Card className="mb-5 p-3">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} onFocus={() => setOpen(true)}
        placeholder={isCoach ? "Partage une annonce, une info, un résultat…" : "Partage un résultat, une photo, un moment d'entraînement…"}
        className={cx("!ring-0 transition-all", open ? "min-h-24" : "!min-h-11")} />
      {open && (
        <div className="mt-2 space-y-3 px-1">
          <PhotoPicker files={files} onChange={setFiles} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as hub.PostKind)} className="!h-9 !w-auto text-sm">
              {(Object.keys(hub.POST_KINDS) as hub.PostKind[]).filter((k) => k !== "announcement" || isCoach)
                .map((k) => <option key={k} value={k}>{hub.POST_KINDS[k].emoji} {hub.POST_KINDS[k].label}</option>)}
            </Select>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setFiles([]); }}>Annuler</Button>
              <Button size="sm" loading={busy} disabled={!body.trim() && !files.length} onClick={publish}><Send className="size-4" /> Publier</Button>
            </div>
          </div>
        </div>
      )}
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
  const [showComments, setShowComments] = useState(p.comments.length > 0 && p.comments.length <= 2);
  const [reactions, setReactions] = useState(p.reactions);
  const [myReactions, setMyReactions] = useState(p.my_reactions);
  const [sending, setSending] = useState(false);

  async function react(e: string) {
    const on = !myReactions.includes(e);
    setMyReactions(on ? [...myReactions, e] : myReactions.filter((x) => x !== e));
    setReactions({ ...reactions, [e]: Math.max(0, (reactions[e] ?? 0) + (on ? 1 : -1)) });
    try { await hub.toggleReaction(profile.coach_id, p.id, e, on); } catch (err) { toast(errMsg(err), "err"); onChange(); }
  }
  async function act(fn: () => Promise<unknown>, msg: string) {
    setMenu(false);
    try { await fn(); toast(msg); onChange(); } catch (e) { toast(errMsg(e), "err"); }
  }
  async function send() {
    if (!comment.trim()) return;
    setSending(true);
    try { await hub.addComment(profile.coach_id, p.id, comment.trim()); setComment(""); setShowComments(true); onChange(); }
    catch (e) { toast(errMsg(e), "err"); } finally { setSending(false); }
  }

  return (
    <Card className={cx("overflow-hidden", p.highlighted && "ring-2 ring-amber-300", p.hidden && "opacity-70")}>
      {(p.pinned || p.highlighted || p.hidden) && (
        <div className={cx("flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium",
          p.hidden ? "bg-slate-100 text-slate-600" : p.highlighted ? "bg-amber-50 text-amber-800" : "bg-violet-50 text-violet-700")}>
          {p.hidden ? <><EyeOff className="size-3.5" /> Masquée par le coach</> : p.highlighted ? <><Star className="size-3.5" /> Mis en avant par le coach</> : <><Pin className="size-3.5" /> Épinglée</>}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cx("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold",
            p.author_role === "coach" ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-700")}>
            {p.author_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold">{p.author_name}</span>
              {p.author_role === "coach" && <Badge className="bg-violet-50 text-violet-700 ring-violet-200"><ShieldCheck className="size-3" /> Coach</Badge>}
            </div>
            <div className="text-xs text-slate-500">{hub.POST_KINDS[p.kind].emoji} {hub.POST_KINDS[p.kind].label} · {timeAgo(p.created_at)}</div>
          </div>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Options"><MoreHorizontal className="size-5" /></button>
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

        {p.body && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{p.body}</p>}
        {p.meta?.tournament && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-50 to-white p-3 ring-1 ring-violet-100">
            <Trophy className="size-6 text-amber-500" />
            <div className="text-sm">
              <div className="font-semibold">{p.meta.tournament}{p.meta.category ? ` · ${p.meta.category}` : ""}</div>
              <div className="text-slate-600">{p.meta.result}{p.meta.record ? ` · ${p.meta.record}` : ""}</div>
            </div>
          </div>
        )}
        {p.photos.length > 0 && <PhotoGrid paths={p.photos} className="mt-3" />}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {hub.REACTIONS.map((e) => (
            <button key={e} onClick={() => react(e)}
              className={cx("inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm ring-1 transition",
                myReactions.includes(e) ? "bg-violet-50 ring-violet-300" : "bg-white ring-slate-200 hover:bg-slate-50",
                !(reactions[e] ?? 0) && !myReactions.includes(e) && "opacity-60")}>
              {e}{(reactions[e] ?? 0) > 0 && <span className="text-xs font-medium text-slate-600">{reactions[e]}</span>}
            </button>
          ))}
          <button onClick={() => setShowComments(!showComments)} className="ml-auto inline-flex items-center gap-1 text-sm text-slate-500 hover:text-violet-700">
            <MessageCircle className="size-4" />{p.comments.length || ""}
          </button>
        </div>
      </div>

      {(showComments || p.comments.length === 0) && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="space-y-2">
            {p.comments.map((c) => (
              <div key={c.id} className={cx("group flex gap-2 text-sm", c.hidden && "opacity-50")}>
                <div className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                  <span className="font-semibold">{c.author_name}</span> <span className="text-xs text-slate-400">{timeAgo(c.created_at)}{c.hidden ? " · masqué" : ""}</span>
                  <p className="whitespace-pre-wrap text-slate-700">{c.body}</p>
                </div>
                <div className="flex flex-col gap-0.5 opacity-60 group-hover:opacity-100">
                  {isCoach && <button title={c.hidden ? "Afficher" : "Masquer"} onClick={() => act(() => hub.hideComment(c.id, !c.hidden), "Commentaire mis à jour")} className="rounded p-1 text-slate-400 hover:bg-slate-200"><EyeOff className="size-3.5" /></button>}
                  {(isCoach || c.author_id === profile.id) && <button title="Supprimer" onClick={() => act(() => hub.deleteComment(c.id), "Commentaire supprimé")} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="size-3.5" /></button>}
                  {!isCoach && c.author_id !== profile.id && <button title="Signaler" onClick={() => setReport({ comment_id: c.id })} className="rounded p-1 text-slate-400 hover:bg-slate-200"><Flag className="size-3.5" /></button>}
                </div>
              </div>
            ))}
          </div>
          {!p.hidden && (
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-2 flex gap-2">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Écrire un commentaire…" className="!h-9" />
              <Button size="sm" className="!h-9" loading={sending} disabled={!comment.trim()} aria-label="Envoyer"><Send className="size-4" /></Button>
            </form>
          )}
        </div>
      )}

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

