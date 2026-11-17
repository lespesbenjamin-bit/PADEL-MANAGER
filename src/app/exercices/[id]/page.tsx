"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Copy, PenTool, Save, Share2, Trash2 } from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import { useAsync } from "@/lib/hooks";
import { LEVELS } from "@/lib/labels";
import { CourtView } from "@/components/court/Court";
import { ConfirmModal } from "@/components/forms";
import { ShareModal } from "@/components/ShareModal";
import { Button, Card, ErrorBox, errMsg, Field, Input, Section, Segmented, Select, Spinner, Textarea, useToast } from "@/components/ui";

const EMPTY: Partial<hub.ExerciseInput> = {
  title: "", objective: "", category: "technique", subcategory: "", level: "", players_count: 4, duration_min: 15, equipment: "",
  organisation: "", instructions: "", success_criteria: "", variants: "", common_errors: "", corrections: "", diagram_id: null, media_url: "", visibility: "private",
};

export default function ExerciseEditPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "nouveau";
  const { data, error, loading, reload } = useAsync(async () => {
    const [exercise, diagrams, groups, shares] = await Promise.all([
      isNew ? Promise.resolve(null) : hub.getExercise(id), hub.getDiagrams(), api.getGroups(), isNew ? Promise.resolve([]) : hub.getExerciseShares(id),
    ]);
    return { exercise, diagrams, groups, shares };
  }, [id]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  return <Form key={data.exercise?.id ?? "new"} {...data} onReload={reload} />;
}

function Form({ exercise, diagrams, groups, shares, onReload }: {
  exercise: hub.Exercise | null; diagrams: hub.Diagram[]; groups: { id: string; name: string }[]; shares: string[]; onReload: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<Partial<hub.ExerciseInput>>(exercise ? { ...exercise } : EMPTY);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState(false);
  const [del, setDel] = useState(false);
  const set = (patch: Partial<hub.ExerciseInput>) => setF({ ...f, ...patch });
  const txt = (k: keyof hub.ExerciseInput) => ({ value: (f[k] as string) ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ [k]: e.target.value }) });
  const diagram = diagrams.find((d) => d.id === f.diagram_id);

  async function save(next?: "share") {
    if (!f.title?.trim()) { toast("Le titre est obligatoire", "err"); return null; }
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(f).filter(([k]) => !["id", "created_at", "updated_at"].includes(k))
        .map(([k, v]) => [k, v === "" ? null : v])) as Partial<hub.ExerciseInput>;
      clean.title = f.title.trim();
      const saved = await hub.saveExercise(exercise?.id ?? null, clean);
      toast("Exercice enregistré");
      if (!exercise) router.replace(`/exercices/${saved.id}${next === "share" ? "?share=1" : ""}`);
      return saved.id;
    } catch (e) { toast(errMsg(e), "err"); return null; } finally { setBusy(false); }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/exercices" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Retour"><ArrowLeft className="size-5" /></Link>
        <h1 className="flex-1 text-xl font-semibold">{exercise ? "Modifier l'exercice" : "Nouvel exercice"}</h1>
        <Button onClick={() => save()} loading={busy}><Save className="size-4" /> Enregistrer</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <Field label="Titre"><Input {...txt("title")} placeholder="Ex. Bandeja croisée + replacement" /></Field>
            <Field label="Objectif"><Textarea {...txt("objective")} className="!min-h-16" /></Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Catégorie">
                <Select value={f.category} onChange={(e) => set({ category: e.target.value as hub.ExerciseCategory, subcategory: "" })}>
                  {Object.entries(hub.CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Thème">
                <Select value={f.subcategory ?? ""} onChange={(e) => set({ subcategory: e.target.value })}>
                  <option value="">—</option>{hub.SUBCATEGORIES[f.category as hub.ExerciseCategory].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Niveau">
                <Select value={f.level ?? ""} onChange={(e) => set({ level: e.target.value })}>
                  <option value="">—</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}<option>Tous niveaux</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Joueurs"><Input type="number" min={1} max={12} value={f.players_count ?? ""} onChange={(e) => set({ players_count: e.target.value ? Number(e.target.value) : null })} /></Field>
                <Field label="Min."><Input type="number" min={1} max={240} value={f.duration_min ?? ""} onChange={(e) => set({ duration_min: e.target.value ? Number(e.target.value) : null })} /></Field>
              </div>
            </div>
            <Field label="Matériel nécessaire"><Input {...txt("equipment")} placeholder="Ex. panier de balles, 4 plots" /></Field>
          </Card>

          <Card className="space-y-3 p-4">
            <Field label="Organisation"><Textarea {...txt("organisation")} /></Field>
            <Field label="Consignes"><Textarea {...txt("instructions")} /></Field>
            <Field label="Critères de réussite"><Textarea {...txt("success_criteria")} className="!min-h-16" /></Field>
            <Field label="Variantes"><Textarea {...txt("variants")} className="!min-h-16" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Erreurs fréquentes"><Textarea {...txt("common_errors")} className="!min-h-16" /></Field>
              <Field label="Corrections"><Textarea {...txt("corrections")} className="!min-h-16" /></Field>
            </div>
            <Field label="Vidéo ou image (lien, facultatif)" hint="Lien YouTube, Instagram, Google Drive…"><Input type="url" {...txt("media_url")} placeholder="https://" /></Field>
          </Card>
        </div>

        <div className="space-y-4">
          <Section title="Schéma tactique">
            <Card className="p-3">
              {diagram ? <CourtView data={diagram.data} /> : <p className="mb-2 text-sm text-slate-500">Aucun schéma associé.</p>}
              <Select value={f.diagram_id ?? ""} onChange={(e) => set({ diagram_id: e.target.value || null })} className="mt-2">
                <option value="">— Aucun —</option>{diagrams.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </Select>
              <div className="mt-2 flex flex-wrap gap-2">
                {diagram && <Link href={`/schemas/${diagram.id}`}><Button size="sm" variant="secondary"><PenTool className="size-4" /> Modifier le schéma</Button></Link>}
                <Link href="/schemas/nouveau"><Button size="sm" variant="ghost"><PenTool className="size-4" /> Nouveau schéma</Button></Link>
              </div>
            </Card>
          </Section>

          <Section title="Visibilité">
            <Card className="space-y-2 p-3">
              <Segmented value={f.visibility ?? "private"} onChange={(v) => set({ visibility: v })} options={[{ value: "private", label: "Privé" }, { value: "groups", label: "Partagé" }]} />
              {f.visibility === "groups" && (
                <>
                  <p className="text-xs text-slate-500">{exercise ? `Partagé avec ${shares.length} groupe(s).` : "Enregistre l'exercice puis choisis les groupes."}</p>
                  {exercise && <Button size="sm" variant="secondary" onClick={() => setShare(true)}><Share2 className="size-4" /> Choisir les groupes</Button>}
                </>
              )}
            </Card>
          </Section>

          {exercise && (
            <Card className="space-y-1 p-2">
              <button onClick={async () => {
                try { const c = await hub.saveExercise(null, { ...Object.fromEntries(Object.entries(exercise).filter(([k]) => !["id", "created_at", "updated_at"].includes(k))), title: `${exercise.title} (copie)`, visibility: "private" } as Partial<hub.ExerciseInput>);
                  toast("Exercice dupliqué"); router.push(`/exercices/${c.id}`); } catch (e) { toast(errMsg(e), "err"); }
              }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Copy className="size-4" /> Dupliquer</button>
              <button onClick={() => setDel(true)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"><Trash2 className="size-4" /> Supprimer</button>
            </Card>
          )}
        </div>
      </div>

      <ShareModal open={share} onClose={() => setShare(false)} groups={groups} initial={shares}
        onSave={async (ids) => { const eid = await save(); if (eid) { await hub.setExerciseShares(eid, ids); toast("Partage mis à jour"); onReload(); } }} />
      <ConfirmModal open={del} onClose={() => setDel(false)} title="Supprimer l'exercice" danger confirmLabel="Supprimer"
        onConfirm={async () => { try { await hub.deleteExercise(exercise!.id); toast("Exercice supprimé"); router.push("/exercices"); } catch (e) { toast(errMsg(e), "err"); } }}>
        L&apos;exercice sera retiré de la bibliothèque et des séances qui l&apos;utilisent.
      </ConfirmModal>
    </>
  );
}
