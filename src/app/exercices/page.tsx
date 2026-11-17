"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, Lock, Plus, Search, Share2, Users } from "lucide-react";
import * as hub from "@/lib/hub";
import { useAsync } from "@/lib/hooks";
import { LEVELS } from "@/lib/labels";
import { useIsCoach } from "@/lib/role";
import { CourtView } from "@/components/court/Court";
import { CAT_CLS, ExerciseSheet } from "@/components/ExerciseSheet";
import { Badge, Button, Card, cx, Empty, ErrorBox, Input, Modal, PageHeader, Section, Select, Spinner } from "@/components/ui";

export default function ExercisesPage() {
  return useIsCoach() ? <CoachLibrary /> : <PlayerLibrary />;
}

function CoachLibrary() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [exercises, diagrams] = await Promise.all([hub.getExercises(), hub.getDiagrams()]);
    return { exercises, diagrams };
  }, []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [level, setLevel] = useState("");
  const [players, setPlayers] = useState("");
  const [maxDur, setMaxDur] = useState("");
  const [vis, setVis] = useState("");

  const list = useMemo(() => (data?.exercises ?? []).filter((e) => {
    const text = `${e.title} ${e.objective ?? ""} ${e.subcategory ?? ""} ${e.instructions ?? ""}`.toLowerCase();
    return (!q || text.includes(q.toLowerCase())) && (!cat || e.category === cat) && (!sub || e.subcategory === sub) &&
      (!level || e.level === level) && (!players || e.players_count === Number(players)) &&
      (!maxDur || (e.duration_min ?? 0) <= Number(maxDur)) && (!vis || e.visibility === vis);
  }), [data, q, cat, sub, level, players, maxDur, vis]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const diagram = (id: string | null) => data.diagrams.find((d) => d.id === id)?.data;

  return (
    <>
      <PageHeader title="Bibliothèque d'exercices" subtitle={`${data.exercises.length} exercice(s)`}
        actions={<Link href="/exercices/nouveau"><Button><Plus className="size-4" /> Nouvel exercice</Button></Link>} />
      <Card className="mb-4 p-3">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-3 size-4 text-slate-400" />
          <Input className="pl-9" placeholder="Rechercher (titre, objectif, consignes…)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Select value={cat} onChange={(e) => { setCat(e.target.value); setSub(""); }} className="!h-9 text-sm">
            <option value="">Catégorie</option>{Object.entries(hub.CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={sub} onChange={(e) => setSub(e.target.value)} className="!h-9 text-sm">
            <option value="">Thème</option>
            {(cat ? hub.SUBCATEGORIES[cat as hub.ExerciseCategory] : Object.values(hub.SUBCATEGORIES).flat()).map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} className="!h-9 text-sm">
            <option value="">Niveau</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}<option>Tous niveaux</option>
          </Select>
          <Select value={players} onChange={(e) => setPlayers(e.target.value)} className="!h-9 text-sm">
            <option value="">Joueurs</option>{[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} joueur{n > 1 ? "s" : ""}</option>)}
          </Select>
          <Select value={maxDur} onChange={(e) => setMaxDur(e.target.value)} className="!h-9 text-sm">
            <option value="">Durée</option>{[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>≤ {n} min</option>)}
          </Select>
          <Select value={vis} onChange={(e) => setVis(e.target.value)} className="!h-9 text-sm">
            <option value="">Visibilité</option><option value="private">Privés</option><option value="groups">Partagés</option>
          </Select>
        </div>
      </Card>
      {list.length === 0 ? (
        <Empty action={<Link href="/exercices/nouveau"><Button>Créer un exercice</Button></Link>}>{data.exercises.length ? "Aucun exercice ne correspond aux filtres." : "La bibliothèque est vide."}</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((e) => (
            <Link key={e.id} href={`/exercices/${e.id}`}>
              <Card className="flex h-full gap-3 p-3 transition hover:-translate-y-0.5 hover:shadow-md">
                {e.diagram_id && diagram(e.diagram_id) && <div className="w-16 shrink-0"><CourtView data={diagram(e.diagram_id)} compact /></div>}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-tight">{e.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge className={CAT_CLS[e.category]}>{hub.CATEGORY_LABEL[e.category]}</Badge>
                    {e.subcategory && <Badge className="bg-slate-50 text-slate-600 ring-slate-200">{e.subcategory}</Badge>}
                    {e.level && <Badge className="bg-slate-900 text-white ring-slate-900">{e.level}</Badge>}
                  </div>
                  {e.objective && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{e.objective}</p>}
                  <div className="mt-1.5 flex gap-3 text-xs text-slate-500">
                    {e.duration_min && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{e.duration_min} min</span>}
                    {e.players_count && <span className="inline-flex items-center gap-1"><Users className="size-3" />{e.players_count}</span>}
                    <span className="inline-flex items-center gap-1">{e.visibility === "groups" ? <><Share2 className="size-3" />Partagé</> : <><Lock className="size-3" />Privé</>}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------ Joueur : exercices partagés ------------------------------ */
type SharedEx = hub.SharedLibrary["exercises"][number];

function PlayerLibrary() {
  const { data, error, loading, reload } = useAsync(() => hub.getSharedLibrary(), []);
  const [open, setOpen] = useState<SharedEx | null>(null);
  const [diag, setDiag] = useState<hub.SharedLibrary["diagrams"][number] | null>(null);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <>
      <PageHeader title="Exercices partagés" subtitle="Les situations travaillées partagées par ton coach" />
      {data.exercises.length === 0 && data.diagrams.length === 0 ? <Empty>Ton coach n&apos;a encore rien partagé avec ton groupe.</Empty> : (
        <>
          {data.exercises.length > 0 && (
            <Section title="Exercices">
              <div className="grid gap-3 sm:grid-cols-2">
                {data.exercises.map((e) => (
                  <button key={e.id} onClick={() => setOpen(e)} className="text-left">
                    <Card className="flex h-full gap-3 p-3 hover:shadow-md">
                      {e.diagram && <div className="w-16 shrink-0"><CourtView data={e.diagram} compact /></div>}
                      <div>
                        <div className="font-semibold">{e.title}</div>
                        <div className="mt-1 flex flex-wrap gap-1"><Badge className={CAT_CLS[e.category]}>{hub.CATEGORY_LABEL[e.category]}</Badge>{e.subcategory && <Badge className="bg-slate-50 text-slate-600 ring-slate-200">{e.subcategory}</Badge>}</div>
                        {e.objective && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{e.objective}</p>}
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </Section>
          )}
          {data.diagrams.length > 0 && (
            <Section title="Schémas">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {data.diagrams.map((d) => (
                  <button key={d.id} onClick={() => setDiag(d)} className="text-left">
                    <Card className="p-3 hover:shadow-md"><CourtView data={d.data} compact /><div className="mt-2 truncate text-sm font-semibold">{d.title}</div></Card>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""} wide>
        {open && <ExerciseSheet e={open} diagram={open.diagram} />}
      </Modal>
      <Modal open={!!diag} onClose={() => setDiag(null)} title={diag?.title ?? ""}>
        {diag && <CourtView data={diag.data} />}
      </Modal>
    </>
  );
}

