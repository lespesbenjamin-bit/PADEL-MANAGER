"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BookMarked, ClipboardList, Clock, Plus, Target } from "lucide-react";
import * as api from "@/lib/api";
import * as hub from "@/lib/hub";
import { fmtDate } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorBox, errMsg, PageHeader, Segmented, Spinner, useToast } from "@/components/ui";

export default function PlansPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [plans, groups] = await Promise.all([hub.getPlans(), api.getGroups(true)]);
    return { plans, groups };
  }, []);
  const [tab, setTab] = useState<"plans" | "templates" | "history">("plans");
  const group = (id: string | null) => data?.groups.find((g) => g.id === id);

  const list = useMemo(() => {
    const p = data?.plans ?? [];
    if (tab === "templates") return p.filter((x) => x.is_template);
    if (tab === "history") return p.filter((x) => !x.is_template && x.status === "done");
    return p.filter((x) => !x.is_template);
  }, [data, tab]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <>
      <PageHeader title="Séances types" subtitle="Construis tes entraînements à partir de la bibliothèque"
        actions={<Link href="/programmes/nouveau"><Button><Plus className="size-4" /> Nouvelle séance</Button></Link>} />
      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "plans", label: "Séances" }, { value: "templates", label: `Modèles (${data.plans.filter((p) => p.is_template).length})` },
          { value: "history", label: "Historique pédagogique" },
        ]} />
      </div>

      {list.length === 0 ? (
        <Empty action={<Link href="/programmes/nouveau"><Button>Préparer une séance</Button></Link>}>
          {tab === "templates" ? "Aucun modèle. Ouvre une séance et choisis « Enregistrer comme modèle »." : tab === "history" ? "Aucune séance effectuée pour l'instant." : "Aucune séance préparée."}
        </Empty>
      ) : tab === "history" ? (
        <div className="relative space-y-3 border-l-2 border-violet-100 pl-5">
          {list.map((p) => (
            <Link key={p.id} href={`/programmes/${p.id}`} className="relative block">
              <span className="absolute -left-[27px] top-4 size-3 rounded-full border-2 border-white bg-violet-500" />
              <Card className="p-4 hover:shadow-md">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-semibold">{p.theme ?? p.name}</div>
                  <div className="text-xs text-slate-500">{fmtDate(p.plan_date, "d MMM yyyy")}{group(p.group_id) ? ` · ${group(p.group_id)!.name}` : ""}</div>
                </div>
                {p.observations && <p className="mt-1 text-sm text-slate-600"><b className="text-slate-700">Observations :</b> {p.observations}</p>}
                {p.next_focus && <p className="mt-1 inline-flex items-start gap-1 text-sm text-violet-700"><Target className="mt-0.5 size-4 shrink-0" />{p.next_focus}</p>}
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Card key={p.id} className="flex flex-col p-4">
              <Link href={`/programmes/${p.id}`} className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{p.name}</div>
                  {p.is_template ? <Badge className="bg-amber-50 text-amber-800 ring-amber-200"><BookMarked className="size-3" />Modèle</Badge> : <Badge className={hub.PLAN_STATUS[p.status].cls}>{hub.PLAN_STATUS[p.status].label}</Badge>}
                </div>
                {p.theme && <div className="mt-1 text-sm text-violet-700">{p.theme}</div>}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {p.plan_date && <span>{fmtDate(p.plan_date, "EEE d MMM")}</span>}
                  {group(p.group_id) && <span>{group(p.group_id)!.name}</span>}
                  {p.duration_min && <span className="inline-flex items-center gap-0.5"><Clock className="size-3" />{p.duration_min} min</span>}
                </div>
              </Link>
              {p.is_template && (
                <Button size="sm" variant="secondary" className="mt-3" onClick={async () => {
                  try { const id = await hub.duplicatePlan(p.id, false); await hub.savePlan(id, { name: p.name, is_template: false }); toast("Séance créée depuis le modèle"); router.push(`/programmes/${id}`); }
                  catch (e) { toast(errMsg(e), "err"); }
                }}><ClipboardList className="size-4" /> Utiliser ce modèle</Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
