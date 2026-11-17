"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BookMarked, ChevronDown, Copy, GripVertical, ListPlus, Plus, Printer, Save, Search, Trash2, Wand2 } from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import { fmtDate, todayISO } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import type { GroupOverview } from "@/lib/types";
import { CourtView } from "@/components/court/Court";
import { ExerciseSheet } from "@/components/ExerciseSheet";
import { ConfirmModal } from "@/components/forms";
import { Badge, Button, Card, cx, ErrorBox, errMsg, Field, Input, Modal, Progress, Section, Select, Spinner, Textarea, useToast } from "@/components/ui";

type Item = hub.PlanItem & { key: string };
const k = () => Math.random().toString(36).slice(2);

/** Trame collective 90 min (4 joueurs) */
const TRAME_90: { title: string; duration_min: number }[] = [
  { title: "Échauffement", duration_min: 10 }, { title: "Panier ou gammes", duration_min: 15 },
  { title: "Coopération 2c2", duration_min: 15 }, { title: "Mini-matchs 10 points", duration_min: 15 },
  { title: "Évolutions", duration_min: 20 }, { title: "Opposition libre", duration_min: 15 },
];

export default function PlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "nouveau";
  const { data, error, loading, reload } = useAsync(async () => {
    const [plan, exercises, diagrams, groups] = await Promise.all([
      isNew ? Promise.resolve(null) : hub.getPlan(id), hub.getExercises(), hub.getDiagrams(), api.getGroups(),
    ]);
    return { plan, exercises, diagrams, groups };
  }, [id]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  return <Builder key={data.plan?.plan.id ?? "new"} initial={data.plan} exercises={data.exercises} diagrams={data.diagrams} groups={data.groups} />;
}

function Builder({ initial, exercises, diagrams, groups }: {
  initial: { plan: hub.Plan; items: hub.PlanItem[] } | null; exercises: hub.Exercise[]; diagrams: hub.Diagram[]; groups: GroupOverview[];
}) {
  const router = useRouter();
  const toast = useToast();
  const p0 = initial?.plan;
  const [f, setF] = useState({
    name: p0?.name ?? "Nouvelle séance", plan_date: p0?.plan_date ?? todayISO(), group_id: p0?.group_id ?? "", duration_min: p0?.duration_min ?? 90,
    theme: p0?.theme ?? "", objectives: p0?.objectives ?? "", equipment: p0?.equipment ?? "", observations: p0?.observations ?? "",
    next_focus: p0?.next_focus ?? "", status: p0?.status ?? ("draft" as hub.Plan["status"]), is_template: p0?.is_template ?? false,
  });
  const [items, setItems] = useState<Item[]>((initial?.items ?? []).map((i) => ({ ...i, key: k() })));
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setDirty(true); };
  const setI = (next: Item[]) => { setItems(next); setDirty(true); };

  const ex = (id: string | null) => exercises.find((e) => e.id === id);
  const total = items.reduce((a, i) => a + (i.duration_min ?? 0), 0);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items]; const [it] = next.splice(from, 1); next.splice(to, 0, it); setI(next);
  }

  async function save(): Promise<string | null> {
    if (!f.name.trim()) { toast("Donne un nom à la séance", "err"); return null; }
    setBusy(true);
    try {
      // rattachement automatique à la séance du planning (même groupe, même date)
      let session_id: string | null = p0?.session_id ?? null;
      if (f.group_id && f.plan_date && !f.is_template) {
        const s = await api.getSessions({ groupId: f.group_id, from: f.plan_date, to: f.plan_date });
        session_id = s.find((x) => x.status !== "cancelled")?.id ?? null;
      }
      const plan = await hub.savePlan(p0?.id ?? null, {
        name: f.name.trim(), plan_date: f.is_template ? null : f.plan_date || null, group_id: f.is_template ? null : f.group_id || null, session_id,
        duration_min: f.duration_min || null, theme: f.theme || null, objectives: f.objectives || null, equipment: f.equipment || null,
        observations: f.observations || null, next_focus: f.next_focus || null, status: f.status, is_template: f.is_template,
      });
      await hub.savePlanItems(plan.id, items);
      setDirty(false);
      toast(session_id ? "Séance enregistrée et reliée au planning" : "Séance enregistrée");
      if (!p0) router.replace(`/programmes/${plan.id}`);
      return plan.id;
    } catch (e) { toast(errMsg(e), "err"); return null; } finally { setBusy(false); }
  }

  return (
    <div className="print:text-black">
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/programmes" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Retour"><ArrowLeft className="size-5" /></Link>
        <Input value={f.name} onChange={(e) => set({ name: e.target.value })} className="!h-9 max-w-sm flex-1 font-semibold" aria-label="Nom de la séance" />
        {f.is_template && <Badge className="bg-amber-50 text-amber-800 ring-amber-200"><BookMarked className="size-3" />Modèle</Badge>}
        <Button onClick={save} loading={busy}><Save className="size-4" /> {dirty ? "Enregistrer" : "Enregistré"}</Button>
      </div>
      <h1 className="mb-2 hidden text-2xl font-bold print:block">{f.name}{f.plan_date && !f.is_template ? ` · ${fmtDate(f.plan_date, "d MMMM yyyy")}` : ""}</h1>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          {/* durée */}
          <Card className="mb-3 p-3 print:shadow-none">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Durée totale : <b className={cx("tabular-nums", f.duration_min && total > f.duration_min ? "text-rose-600" : "text-violet-700")}>{total} min</b></span>
              <span className="text-slate-500">prévu : {f.duration_min || "—"} min</span>
            </div>
            <Progress value={f.duration_min ? (total / f.duration_min) * 100 : 0} color={f.duration_min && total > f.duration_min ? "#E11D48" : undefined} className="mt-2" />
          </Card>

          {/* exercices */}
          <div className="space-y-2">
            {items.length === 0 && (
              <Card className="p-6 text-center text-sm text-slate-500">
                Ajoute des exercices de ta bibliothèque, ou démarre avec une trame.
                <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden">
                  <Button size="sm" onClick={() => setPicker(true)}><ListPlus className="size-4" /> Ajouter un exercice</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setI(TRAME_90.map((t) => ({ ...t, exercise_id: null, notes: null, key: k() }))); set({ duration_min: 90 }); }}><Wand2 className="size-4" /> Trame collective 90 min</Button>
                </div>
              </Card>
            )}
            {items.map((it, idx) => {
              const e = ex(it.exercise_id);
              const d = e?.diagram_id ? diagrams.find((x) => x.id === e.diagram_id) : null;
              const isOpen = open === it.key;
              return (
                <Card key={it.key} draggable onDragStart={() => setDragKey(it.key)} onDragEnd={() => setDragKey(null)}
                  onDragOver={(ev) => { ev.preventDefault(); if (dragKey && dragKey !== it.key) move(items.findIndex((x) => x.key === dragKey), idx); }}
                  className={cx("p-3 transition print:break-inside-avoid", dragKey === it.key && "opacity-50 ring-2 ring-violet-400")}>
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-5 shrink-0 cursor-grab text-slate-300 print:hidden" />
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      {e ? <div className="truncate text-sm font-semibold">{e.title}</div> :
                        <Input value={it.title ?? ""} onChange={(ev) => setI(items.map((x) => x.key === it.key ? { ...x, title: ev.target.value } : x))} className="!h-8 font-semibold" placeholder="Bloc libre" />}
                      {e?.subcategory && <div className="text-xs text-slate-500">{hub.CATEGORY_LABEL[e.category]} · {e.subcategory}</div>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Input type="number" min={1} max={120} value={it.duration_min ?? ""} aria-label="Durée en minutes"
                        onChange={(ev) => setI(items.map((x) => x.key === it.key ? { ...x, duration_min: ev.target.value ? Number(ev.target.value) : null } : x))}
                        className="!h-8 !w-16 text-center" /><span className="text-xs text-slate-500">min</span>
                    </div>
                    <div className="flex print:hidden">
                      <button onClick={() => move(idx, idx - 1)} disabled={idx === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Monter"><ArrowUp className="size-4" /></button>
                      <button onClick={() => move(idx, idx + 1)} disabled={idx === items.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30" aria-label="Descendre"><ArrowDown className="size-4" /></button>
                      {e && <button onClick={() => setOpen(isOpen ? null : it.key)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Détails"><ChevronDown className={cx("size-4 transition", isOpen && "rotate-180")} /></button>}
                      <button onClick={() => setI(items.filter((x) => x.key !== it.key))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Retirer"><Trash2 className="size-4" /></button>
                    </div>
                  </div>
                  <Input value={it.notes ?? ""} onChange={(ev) => setI(items.map((x) => x.key === it.key ? { ...x, notes: ev.target.value } : x))}
                    placeholder="Note pour cette séance (consigne particulière, joueurs…)" className="mt-2 !h-8 text-xs" />
                  {(isOpen) && e && (
                    <div className="mt-3 border-t border-slate-100 pt-3"><ExerciseSheet e={e} diagram={d?.data} /></div>
                  )}
                  {/* impression : consignes + schéma toujours visibles */}
                  {e && <div className="hidden print:block"><p className="mt-1 text-xs">{e.instructions}</p>{e.variants && <p className="text-xs"><b>Variantes :</b> {e.variants}</p>}{d && <div className="mt-1 w-32"><CourtView data={d.data} compact /></div>}</div>}
                </Card>
              );
            })}
            {items.length > 0 && (
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button size="sm" variant="secondary" onClick={() => setPicker(true)}><ListPlus className="size-4" /> Ajouter un exercice</Button>
                <Button size="sm" variant="ghost" onClick={() => setI([...items, { exercise_id: null, title: "", duration_min: 10, notes: null, key: k() }])}><Plus className="size-4" /> Bloc libre</Button>
              </div>
            )}
          </div>

          <Section title="Bilan de séance" className="mt-6">
            <Card className="space-y-3 p-4">
              <Field label="Observations du coach"><Textarea value={f.observations} onChange={(e) => set({ observations: e.target.value })} placeholder="Ce qui a fonctionné, points remarqués…" /></Field>
              <Field label="Prochains axes de travail"><Textarea value={f.next_focus} onChange={(e) => set({ next_focus: e.target.value })} className="!min-h-16" /></Field>
            </Card>
          </Section>
        </div>

        {/* informations */}
        <div className="space-y-3 print:hidden">
          <Card className="space-y-3 p-4">
            {!f.is_template && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date"><Input type="date" value={f.plan_date ?? ""} onChange={(e) => set({ plan_date: e.target.value })} /></Field>
                  <Field label="Statut">
                    <Select value={f.status} onChange={(e) => set({ status: e.target.value as hub.Plan["status"] })}>
                      {Object.entries(hub.PLAN_STATUS).map(([k2, v]) => <option key={k2} value={k2}>{v.label}</option>)}
                    </Select>
                  </Field>
                </div>
                <Field label="Groupe" hint="Si une séance du planning existe ce jour-là, elle est reliée automatiquement : les joueurs voient le thème.">
                  <Select value={f.group_id} onChange={(e) => set({ group_id: e.target.value })}>
                    <option value="">— Aucun —</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </Select>
                </Field>
              </>
            )}
            <Field label="Durée prévue (min)"><Input type="number" min={10} max={300} value={f.duration_min ?? ""} onChange={(e) => set({ duration_min: e.target.value ? Number(e.target.value) : 0 })} /></Field>
            <Field label="Thème principal"><Input value={f.theme} onChange={(e) => set({ theme: e.target.value })} placeholder="Ex. Bandeja et replacement" /></Field>
            <Field label="Objectifs"><Textarea value={f.objectives} onChange={(e) => set({ objectives: e.target.value })} className="!min-h-16" /></Field>
            <Field label="Matériel"><Input value={f.equipment} onChange={(e) => set({ equipment: e.target.value })} /></Field>
          </Card>
          <Card className="space-y-1 p-2">
            <Action icon={Printer} onClick={() => window.print()}>Imprimer la fiche</Action>
            {p0 && <Action icon={Copy} onClick={async () => { if (dirty && !(await save())) return; const nid = await hub.duplicatePlan(p0.id, false); toast("Séance dupliquée"); router.push(`/programmes/${nid}`); }}>Dupliquer</Action>}
            {p0 && !f.is_template && <Action icon={BookMarked} onClick={async () => { if (dirty && !(await save())) return; await hub.duplicatePlan(p0.id, true); toast("Modèle enregistré"); }}>Enregistrer comme modèle</Action>}
            {p0 && <Action icon={Trash2} danger onClick={() => setDel(true)}>Supprimer</Action>}
          </Card>
        </div>
      </div>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} exercises={exercises}
        onPick={(e) => { setI([...items, { exercise_id: e.id, duration_min: e.duration_min, title: null, notes: null, key: k() }]); toast(`« ${e.title} » ajouté`); }} />
      <ConfirmModal open={del} onClose={() => setDel(false)} title="Supprimer la séance" danger confirmLabel="Supprimer"
        onConfirm={async () => { try { await hub.deletePlan(p0!.id); setDirty(false); toast("Séance supprimée"); router.push("/programmes"); } catch (e) { toast(errMsg(e), "err"); } }}>
        La séance préparée sera supprimée (les exercices restent dans la bibliothèque).
      </ConfirmModal>
    </div>
  );
}

function Action({ icon: Icon, children, onClick, danger }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; onClick: () => void | Promise<void>; danger?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} onClick={async () => { setBusy(true); try { await onClick(); } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); } }}
      className={cx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50", danger ? "text-rose-600" : "text-slate-700")}>
      <Icon className="size-4" />{children}
    </button>
  );
}

function ExercisePicker({ open, onClose, exercises, onPick }: { open: boolean; onClose: () => void; exercises: hub.Exercise[]; onPick: (e: hub.Exercise) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const list = useMemo(() => exercises.filter((e) => (!cat || e.category === cat) &&
    `${e.title} ${e.subcategory ?? ""} ${e.objective ?? ""}`.toLowerCase().includes(q.toLowerCase())), [exercises, q, cat]);
  return (
    <Modal open={open} onClose={onClose} title="Ajouter un exercice" wide footer={<Button variant="secondary" onClick={onClose}>Terminé</Button>}>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input className="pl-9" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="!w-36"><option value="">Toutes</option>{Object.entries(hub.CATEGORY_LABEL).map(([k2, v]) => <option key={k2} value={k2}>{v}</option>)}</Select>
      </div>
      {exercises.length === 0 ? <p className="text-sm text-slate-500">Ta bibliothèque est vide. <Link href="/exercices/nouveau" className="text-violet-700 underline">Crée un exercice</Link>.</p> : (
        <div className="divide-y divide-slate-100">
          {list.map((e) => (
            <button key={e.id} onClick={() => onPick(e)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-slate-50">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{e.title}</div>
                <div className="text-xs text-slate-500">{hub.CATEGORY_LABEL[e.category]}{e.subcategory ? ` · ${e.subcategory}` : ""}{e.duration_min ? ` · ${e.duration_min} min` : ""}</div>
              </div>
              <Plus className="size-4 text-violet-600" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
