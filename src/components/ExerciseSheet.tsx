"use client";
import { Clock, Users } from "lucide-react";
import * as hub from "@/lib/hub";
import { CourtView } from "./court/Court";
import { Badge, cx } from "./ui";

export const CAT_CLS: Record<hub.ExerciseCategory, string> = {
  technique: "bg-violet-50 text-violet-700 ring-violet-200",
  tactique: "bg-sky-50 text-sky-700 ring-sky-200",
  physique: "bg-amber-50 text-amber-800 ring-amber-200",
};

/** Fiche d'exercice en lecture (utilisée par le joueur et dans les séances) */
export function ExerciseSheet({ e, diagram }: { e: Partial<hub.Exercise>; diagram?: hub.DiagramData | null }) {
  const rows: [string, string | null | undefined][] = [
    ["Objectif", e.objective], ["Organisation", e.organisation], ["Consignes", e.instructions], ["Critères de réussite", e.success_criteria],
    ["Variantes", e.variants], ["Erreurs fréquentes", e.common_errors], ["Corrections", e.corrections], ["Matériel", e.equipment],
  ];
  return (
    <div className={cx("grid gap-4", diagram && "sm:grid-cols-[1fr_200px]")}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {e.category && <Badge className={CAT_CLS[e.category]}>{hub.CATEGORY_LABEL[e.category]}</Badge>}
          {e.subcategory && <Badge className="bg-slate-50 text-slate-600 ring-slate-200">{e.subcategory}</Badge>}
          {e.level && <Badge className="bg-slate-900 text-white ring-slate-900">{e.level}</Badge>}
          {e.duration_min && <Badge className="bg-white text-slate-600 ring-slate-200"><Clock className="size-3" />{e.duration_min} min</Badge>}
          {e.players_count && <Badge className="bg-white text-slate-600 ring-slate-200"><Users className="size-3" />{e.players_count} joueurs</Badge>}
        </div>
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k}</div><p className="whitespace-pre-wrap text-slate-800">{v}</p></div>
        ))}
        {e.media_url && <a href={e.media_url} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-violet-700 underline">Voir la vidéo / l&apos;image</a>}
      </div>
      {diagram && <CourtView data={diagram} />}
    </div>
  );
}
