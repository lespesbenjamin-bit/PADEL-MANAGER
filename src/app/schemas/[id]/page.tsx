"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUpRight, Circle, Copy, Download, Eraser, FileDown, Link2, MousePointer2, Pause, Play, Plus, Redo2, Save, Share2,
  Spline, Square, Trash2, Triangle, Type, Undo2, User, Footprints,
} from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import type { DiagramElement, DiagramFrame, ElementKind } from "@/lib/hub";
import { useAsync } from "@/lib/hooks";
import { CourtSvg, ExportFrames, exportPdf, exportPng, L, PALETTE, TEAM_COLORS, W } from "@/components/court/Court";
import { ConfirmModal } from "@/components/forms";
import { ShareModal } from "@/components/ShareModal";
import { Button, Card, Checkbox, cx, ErrorBox, errMsg, Field, Input, Modal, Select, Spinner, useToast } from "@/components/ui";

type Tool = "select" | ElementKind | "eraser";
const TOOLS: { id: Tool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "select", label: "Sélection / déplacer", icon: MousePointer2 },
  { id: "player", label: "Joueur", icon: User },
  { id: "ball", label: "Balle", icon: Circle },
  { id: "shot", label: "Trajectoire de balle", icon: Spline },
  { id: "move", label: "Déplacement", icon: Footprints },
  { id: "arrow", label: "Flèche", icon: ArrowUpRight },
  { id: "zone", label: "Zone cible", icon: Square },
  { id: "cone", label: "Plot", icon: Triangle },
  { id: "text", label: "Texte", icon: Type },
  { id: "eraser", label: "Gomme", icon: Eraser },
];
const LINE_TOOLS: ElementKind[] = ["arrow", "move", "shot", "zone"];
const DEFAULT_COLOR: Partial<Record<ElementKind, string>> = { shot: "#FACC15", move: "#FFFFFF", arrow: "#FFFFFF", zone: "#22C55E", cone: "#F97316", text: "#FFFFFF" };
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number) => Math.max(-0.06, Math.min(1.06, v));

export default function DiagramEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "nouveau";
  const { data, error, loading, reload } = useAsync(async () => {
    const [diagram, groups, exercises, shares] = await Promise.all([
      isNew ? Promise.resolve(null) : hub.getDiagram(id), api.getGroups(), hub.getExercises(), isNew ? Promise.resolve([]) : hub.getDiagramShares(id),
    ]);
    return { diagram, groups, exercises, shares };
  }, [id]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  return <Editor key={data.diagram?.id ?? "new"} initial={data.diagram} groups={data.groups} exercises={data.exercises} shares={data.shares} onReload={reload} />;
}

function Editor({ initial, groups, exercises, shares, onReload }: {
  initial: hub.Diagram | null; groups: { id: string; name: string }[]; exercises: hub.Exercise[]; shares: string[]; onReload: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? "Nouveau schéma");
  const [frames, setFrames] = useState<DiagramFrame[]>(initial?.data?.frames?.length ? initial.data.frames : [{ elements: [] }]);
  const [fi, setFi] = useState(0);
  const [past, setPast] = useState<DiagramFrame[][]>([]);
  const [future, setFuture] = useState<DiagramFrame[][]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string | null>(null);
  const [team, setTeam] = useState<"A" | "B">("A");
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [modal, setModal] = useState<null | "share" | "link" | "delete">(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const exportRefs = useRef<(SVGSVGElement | null)[]>([]);
  const drag = useRef<null | { mode: "move" | "draw" | "handle"; id: string; handle?: "start" | "end" | "ctrl"; start: { x: number; y: number }; orig: DiagramElement; snapshot: DiagramFrame[] }>(null);

  const frame = frames[Math.min(fi, frames.length - 1)];
  const sel = frame.elements.find((e) => e.id === selected) ?? null;
  const players = frame.elements.filter((e) => e.type === "player");

  /* ---------- historique ---------- */
  const commit = useCallback((next: DiagramFrame[], snapshot?: DiagramFrame[]) => {
    setPast((p) => [...p.slice(-60), snapshot ?? frames]);
    setFuture([]);
    setFrames(next);
    setDirty(true);
  }, [frames]);
  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [frames, ...f]); setFrames(past[past.length - 1]); setPast((p) => p.slice(0, -1)); setSelected(null); setDirty(true);
  }, [past, frames]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, frames]); setFrames(future[0]); setFuture((f) => f.slice(1)); setSelected(null); setDirty(true);
  }, [future, frames]);

  const setElements = (fn: (els: DiagramElement[]) => DiagramElement[], live = false) => {
    const next = frames.map((f, i) => (i === fi ? { ...f, elements: fn(f.elements) } : f));
    if (live) { setFrames(next); setDirty(true); } else commit(next);
  };
  const updateSel = (patch: Partial<DiagramElement>) => sel && setElements((els) => els.map((e) => (e.id === sel.id ? { ...e, ...patch } : e)));
  const removeEl = (eid: string) => { setElements((els) => els.filter((e) => e.id !== eid)); setSelected(null); };

  /* ---------- clavier ---------- */
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") { ev.preventDefault(); redo(); }
      else if ((ev.key === "Delete" || ev.key === "Backspace") && selected) { ev.preventDefault(); removeEl(selected); }
      else if (ev.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  /* ---------- lecture des étapes ---------- */
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setFi((i) => (i + 1) % frames.length), 1300);
    return () => clearInterval(t);
  }, [playing, frames.length]);

  /* ---------- quitter sans enregistrer ---------- */
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  /* ---------- pointeur ---------- */
  function pt(ev: React.PointerEvent) {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    const r = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: clamp(r.x / W), y: clamp(r.y / L) };
  }

  function onDown(ev: React.PointerEvent<SVGSVGElement>) {
    if (playing) setPlaying(false);
    const p = pt(ev);
    const handle = (ev.target as Element).closest("[data-handle]")?.getAttribute("data-handle") as "start" | "end" | "ctrl" | null;
    const hitId = (ev.target as Element).closest("[data-id]")?.getAttribute("data-id") ?? null;
    (ev.currentTarget as SVGSVGElement).setPointerCapture(ev.pointerId);

    if (handle && sel) { drag.current = { mode: "handle", id: sel.id, handle, start: p, orig: sel, snapshot: frames }; return; }
    if (tool === "eraser") { if (hitId) removeEl(hitId); return; }
    if (tool === "select") {
      setSelected(hitId);
      const el = frame.elements.find((e) => e.id === hitId);
      if (el) drag.current = { mode: "move", id: el.id, start: p, orig: el, snapshot: frames };
      return;
    }
    const c = color ?? DEFAULT_COLOR[tool as ElementKind] ?? "#FFFFFF";
    if (tool === "player") {
      if (players.length >= 4) { toast("4 joueurs maximum sur le terrain", "err"); return; }
      const used = players.map((x) => Number(x.label));
      const n = [1, 2, 3, 4].find((k) => !used.includes(k)) ?? players.length + 1;
      const t = n <= 2 ? "A" : "B";
      void t;
      const el: DiagramElement = { id: uid(), type: "player", x: p.x, y: p.y, label: String(n), team, color: TEAM_COLORS[team] };
      setElements((els) => [...els, el]); setSelected(el.id); return;
    }
    if (tool === "ball" || tool === "cone" || tool === "text") {
      const el: DiagramElement = { id: uid(), type: tool, x: p.x, y: p.y, color: tool === "ball" ? "#D9F99D" : c, label: tool === "text" ? "Texte" : undefined };
      setElements((els) => [...els, el]); setSelected(el.id);
      if (tool === "text") setTool("select");
      return;
    }
    if (LINE_TOOLS.includes(tool as ElementKind)) {
      const el: DiagramElement = { id: uid(), type: tool as ElementKind, x: p.x, y: p.y, x2: p.x, y2: p.y, color: c };
      drag.current = { mode: "draw", id: el.id, start: p, orig: el, snapshot: frames };
      setElements((els) => [...els, el], true);
    }
  }

  function onMove(ev: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current; if (!d) return;
    const p = pt(ev);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    setElements((els) => els.map((e) => {
      if (e.id !== d.id) return e;
      const o = d.orig;
      if (d.mode === "draw") {
        const x2 = p.x, y2 = p.y;
        if (o.type === "shot") {
          // point de courbure : milieu décalé perpendiculairement (effet lob)
          const mx = (o.x + x2) / 2, my = (o.y + y2) / 2;
          const len = Math.hypot((x2 - o.x) * W, (y2 - o.y) * L) || 1;
          const nx = -((y2 - o.y) * L) / len, ny = ((x2 - o.x) * W) / len;
          return { ...e, x2, y2, cx: mx + (nx * 12) / W, cy: my + (ny * 12) / L };
        }
        return { ...e, x2, y2 };
      }
      if (d.mode === "handle") {
        if (d.handle === "start") return { ...e, x: p.x, y: p.y };
        if (d.handle === "end") return { ...e, x2: p.x, y2: p.y };
        return { ...e, cx: p.x, cy: p.y };
      }
      return { ...e, x: clamp(o.x + dx), y: clamp(o.y + dy),
        ...(o.x2 != null ? { x2: clamp(o.x2 + dx), y2: clamp((o.y2 ?? 0) + dy) } : {}),
        ...(o.cx != null ? { cx: clamp(o.cx + dx), cy: clamp((o.cy ?? 0) + dy) } : {}) };
    }), true);
  }

  function onUp() {
    const d = drag.current; drag.current = null;
    if (!d) return;
    const el = frame.elements.find((e) => e.id === d.id);
    if (d.mode === "draw" && el && Math.hypot(((el.x2 ?? el.x) - el.x) * W, ((el.y2 ?? el.y) - el.y) * L) < 3) {
      setFrames(d.snapshot); return;   // simple clic : rien n'est tracé
    }
    const moved = JSON.stringify(d.snapshot) !== JSON.stringify(frames);
    if (moved) { setPast((p) => [...p.slice(-60), d.snapshot]); setFuture([]); }
    if (d.mode === "draw") setSelected(d.id);
  }

  /* ---------- étapes ---------- */
  const addFrame = () => { const next = [...frames.slice(0, fi + 1), { elements: frame.elements.map((e) => ({ ...e })), note: "" }, ...frames.slice(fi + 1)]; commit(next); setFi(fi + 1); };
  const delFrame = () => { if (frames.length < 2) return; commit(frames.filter((_, i) => i !== fi)); setFi(Math.max(0, fi - 1)); };
  const setNote = (note: string) => { setFrames(frames.map((f, i) => (i === fi ? { ...f, note } : f))); setDirty(true); };

  /* ---------- enregistrement ---------- */
  async function save() {
    setSaving(true);
    try {
      const d = await hub.saveDiagram(initial?.id ?? null, title.trim() || "Schéma sans titre", { frames });
      setDirty(false); toast("Schéma enregistré");
      if (!initial) router.replace(`/schemas/${d.id}`);
    } catch (e) { toast(errMsg(e), "err"); } finally { setSaving(false); }
  }
  async function ensureSaved(): Promise<string | null> {
    if (initial && !dirty) return initial.id;
    try { const d = await hub.saveDiagram(initial?.id ?? null, title.trim() || "Schéma sans titre", { frames }); setDirty(false); return d.id; }
    catch (e) { toast(errMsg(e), "err"); return null; }
  }

  const handles = useMemo(() => {
    if (!sel || !["arrow", "move", "shot", "zone"].includes(sel.type) || tool !== "select") return null;
    const pts: { k: "start" | "end" | "ctrl"; x: number; y: number }[] = [
      { k: "start", x: sel.x, y: sel.y }, { k: "end", x: sel.x2 ?? sel.x, y: sel.y2 ?? sel.y },
    ];
    if (sel.type === "shot") pts.push({ k: "ctrl", x: sel.cx ?? (sel.x + (sel.x2 ?? sel.x)) / 2, y: sel.cy ?? (sel.y + (sel.y2 ?? sel.y)) / 2 });
    return pts;
  }, [sel, tool]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/schemas" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Retour"><ArrowLeft className="size-5" /></Link>
        <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="!h-9 max-w-xs flex-1 font-semibold" aria-label="Titre du schéma" />
        <Button size="sm" onClick={save} loading={saving}><Save className="size-4" /> {dirty ? "Enregistrer" : "Enregistré"}</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          {/* outils */}
          <Card className="mb-3 flex items-center gap-1 overflow-x-auto p-1.5">
            {TOOLS.map((t) => (
              <button key={t.id} onClick={() => { setTool(t.id); if (t.id !== "select") setSelected(null); }} title={t.label} aria-label={t.label}
                className={cx("grid size-10 shrink-0 place-items-center rounded-xl transition", tool === t.id ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
                <t.icon className="size-5" />
              </button>
            ))}
            <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" />
            <button onClick={undo} disabled={!past.length} title="Annuler (Ctrl+Z)" aria-label="Annuler" className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Undo2 className="size-5" /></button>
            <button onClick={redo} disabled={!future.length} title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir" className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Redo2 className="size-5" /></button>
          </Card>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {tool === "player" ? (["A", "B"] as const).map((t) => (
              <button key={t} onClick={() => setTeam(t)} className={cx("rounded-full px-3 py-1 text-xs font-medium text-white ring-2", team === t ? "ring-slate-900" : "ring-transparent")} style={{ background: TEAM_COLORS[t] }}>Équipe {t}</button>
            )) : PALETTE.map((c) => (
              <button key={c} onClick={() => { setColor(c); if (sel && sel.type !== "player" && sel.type !== "ball") updateSel({ color: c }); }} aria-label={`Couleur ${c}`}
                className={cx("size-7 rounded-full ring-2 ring-offset-1", (color ?? "") === c ? "ring-slate-900" : "ring-slate-200")} style={{ background: c }} />
            ))}
            <span className="ml-auto text-xs text-slate-500">{TOOLS.find((t) => t.id === tool)?.label}{tool === "player" ? ` · ${players.length}/4` : ""}</span>
          </div>

          {/* terrain */}
          <div className="mx-auto max-w-[420px]">
            <CourtSvg ref={svgRef} elements={frame.elements} selectedId={selected} style={{ touchAction: "none" }}
              className={cx("rounded-2xl shadow-sm", tool === "select" ? "cursor-default" : tool === "eraser" ? "cursor-not-allowed" : "cursor-crosshair")}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              {handles?.map((h) => (
                <circle key={h.k} data-handle={h.k} cx={h.x * W} cy={h.y * L} r={2.6} fill={h.k === "ctrl" ? "#FACC15" : "#fff"} stroke="#0F172A" strokeWidth={0.6} className="cursor-grab" />
              ))}
            </CourtSvg>
          </div>

          {/* étapes */}
          <Card className="mt-3 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Étapes</span>
              {frames.map((_, i) => (
                <button key={i} onClick={() => { setFi(i); setSelected(null); setPlaying(false); }}
                  className={cx("size-8 rounded-lg text-sm font-semibold ring-1", i === fi ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-slate-600 ring-slate-200")}>{i + 1}</button>
              ))}
              <Button size="sm" variant="secondary" onClick={addFrame} title="Ajouter une étape (copie de l'étape actuelle)"><Plus className="size-4" /> Étape</Button>
              {frames.length > 1 && <>
                <Button size="sm" variant="ghost" onClick={() => setPlaying(!playing)}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{playing ? "Pause" : "Lire"}</Button>
                <Button size="sm" variant="ghost" className="text-rose-600" onClick={delFrame}><Trash2 className="size-4" /></Button>
              </>}
            </div>
            <Input className="mt-2" placeholder={`Consigne de l'étape ${fi + 1} (facultatif)`} value={frame.note ?? ""} onChange={(e) => setNote(e.target.value)} />
          </Card>
        </div>

        {/* panneau latéral */}
        <div className="space-y-3">
          <Card className="p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Élément sélectionné</div>
            {!sel ? <p className="text-sm text-slate-500">Choisis l&apos;outil <b>Sélection</b> puis touche un élément pour le déplacer ou le modifier.</p> : (
              <div className="space-y-2">
                <div className="text-sm font-medium">{TOOLS.find((t) => t.id === sel.type)?.label}</div>
                {(sel.type === "text" || sel.type === "player") && (
                  <Field label={sel.type === "player" ? "Numéro / initiales" : "Texte"}>
                    <Input value={sel.label ?? ""} maxLength={sel.type === "player" ? 2 : 40} onChange={(e) => updateSel({ label: e.target.value })} />
                  </Field>
                )}
                {sel.type === "player" && (
                  <div className="flex gap-1.5">{(["A", "B"] as const).map((t) => (
                    <button key={t} onClick={() => updateSel({ team: t, color: TEAM_COLORS[t] })} className={cx("rounded-full px-3 py-1 text-xs font-medium text-white ring-2", sel.team === t ? "ring-slate-900" : "ring-transparent")} style={{ background: TEAM_COLORS[t] }}>Équipe {t}</button>
                  ))}</div>
                )}
                {sel.type !== "player" && sel.type !== "ball" && (
                  <div className="flex flex-wrap gap-1.5">{PALETTE.map((c) => (
                    <button key={c} onClick={() => updateSel({ color: c })} aria-label={`Couleur ${c}`} className={cx("size-6 rounded-full ring-2 ring-offset-1", sel.color === c ? "ring-slate-900" : "ring-slate-200")} style={{ background: c }} />
                  ))}</div>
                )}
                {sel.type === "shot" && <p className="text-xs text-slate-500">Fais glisser le point jaune pour courber la trajectoire.</p>}
                <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => removeEl(sel.id)}><Trash2 className="size-4" /> Supprimer</Button>
              </div>
            )}
          </Card>

          <Card className="space-y-1 p-2">
            <SideAction icon={Download} onClick={async () => { const el = exportRefs.current[fi]; if (el) await exportPng(el, title, fi, frames.length); }}>Exporter l&apos;étape en PNG</SideAction>
            <SideAction icon={FileDown} onClick={async () => { await exportPdf(exportRefs.current.slice(0, frames.length).filter(Boolean) as SVGSVGElement[], { frames }, title); }}>Exporter en PDF ({frames.length} page{frames.length > 1 ? "s" : ""})</SideAction>
            <SideAction icon={Link2} onClick={async () => { if (await ensureSaved()) setModal("link"); }}>Associer à un exercice</SideAction>
            <SideAction icon={Share2} onClick={async () => { if (await ensureSaved()) setModal("share"); }}>Partager avec des groupes{shares.length ? ` (${shares.length})` : ""}</SideAction>
            {initial && <SideAction icon={Copy} onClick={async () => {
              try { const nid = await hub.duplicateDiagram(initial.id); toast("Schéma dupliqué"); router.push(`/schemas/${nid}`); } catch (e) { toast(errMsg(e), "err"); }
            }}>Dupliquer</SideAction>}
            {initial && <SideAction icon={Trash2} danger onClick={() => setModal("delete")}>Supprimer</SideAction>}
          </Card>
          <p className="px-1 text-xs text-slate-400">Raccourcis : Ctrl+Z annuler · Ctrl+Maj+Z rétablir · Suppr effacer · Échap désélectionner.</p>
        </div>
      </div>

      <ExportFrames data={{ frames }} refs={exportRefs} />
      <ShareModal open={modal === "share"} onClose={() => setModal(null)} groups={groups} initial={shares}
        onSave={async (ids) => { const did = initial?.id ?? (await ensureSaved()); if (did) { await hub.setDiagramShares(did, ids); toast("Partage mis à jour"); onReload(); } }} />
      <LinkModal open={modal === "link"} onClose={() => setModal(null)} exercises={exercises}
        onSave={async (exId) => { const did = initial?.id ?? (await ensureSaved()); if (did) { await hub.saveExercise(exId, { diagram_id: did }); toast("Schéma associé à l'exercice"); } }} />
      <ConfirmModal open={modal === "delete"} onClose={() => setModal(null)} title="Supprimer le schéma" danger confirmLabel="Supprimer"
        onConfirm={async () => { try { await hub.deleteDiagram(initial!.id); setDirty(false); toast("Schéma supprimé"); router.push("/schemas"); } catch (e) { toast(errMsg(e), "err"); } }}>
        Le schéma sera supprimé et retiré des exercices qui l&apos;utilisent.
      </ConfirmModal>
    </>
  );
}

function SideAction({ icon: Icon, children, onClick, danger }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}
      className={cx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50", danger ? "text-rose-600" : "text-slate-700")}>
      <Icon className="size-4" />{children}
    </button>
  );
}

function LinkModal({ open, onClose, exercises, onSave }: { open: boolean; onClose: () => void; exercises: hub.Exercise[]; onSave: (id: string) => Promise<void> }) {
  const toast = useToast();
  const [ex, setEx] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setEx(exercises[0]?.id ?? ""); }, [open, exercises]);
  return (
    <Modal open={open} onClose={onClose} title="Associer à un exercice"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button disabled={!ex} loading={busy} onClick={async () => {
        setBusy(true); try { await onSave(ex); onClose(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
      }}>Associer</Button></>}>
      {exercises.length === 0 ? <p className="text-sm text-slate-500">Crée d&apos;abord un exercice dans la bibliothèque.</p> : (
        <Field label="Exercice" hint="Le schéma remplacera celui déjà associé, le cas échéant.">
          <Select value={ex} onChange={(e) => setEx(e.target.value)}>{exercises.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select>
        </Field>
      )}
    </Modal>
  );
}
