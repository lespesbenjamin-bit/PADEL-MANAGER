"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { PlayerFormModal } from "@/components/forms";
import { Button, Card, cx, Empty, ErrorBox, Input, PageHeader, Segmented, Spinner } from "@/components/ui";

export default function PlayersPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsync(() => api.getPlayers(), []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "nogroup">("all");
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => (data ?? []).filter((p) => !p.archived_at)
    .filter((p) => `${p.first_name} ${p.last_name} ${p.level ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .filter((p) => filter === "all" || (filter === "low" ? p.credits_balance <= 1 : p.group_names.length === 0)), [data, q, filter]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const low = (data ?? []).filter((p) => p.credits_balance <= 1 && !p.archived_at).length;

  return (
    <>
      <PageHeader title="Joueurs" subtitle={`${data?.length ?? 0} joueur(s) dans l'annuaire`}
        actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Nouveau joueur</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-3 size-4 text-slate-400" />
          <Input className="pl-9" placeholder="Rechercher un joueur…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented value={filter} onChange={setFilter} options={[
          { value: "all", label: "Tous" }, { value: "low", label: `À renouveler (${low})` }, { value: "nogroup", label: "Sans groupe" },
        ]} />
      </div>
      {list.length === 0 ? <Empty action={<Button onClick={() => setCreating(true)}>Ajouter un joueur</Button>}>Aucun joueur.</Empty> : (
        <Card className="divide-y divide-slate-100">
          {list.map((p) => (
            <Link key={p.id} href={`/joueurs/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">{p.first_name[0]}{p.last_name?.[0]}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.first_name} {p.last_name} {p.level && <span className="ml-1 text-xs font-normal text-slate-500">{p.level}</span>}</div>
                <div className="truncate text-xs text-slate-500">{p.group_names.length ? p.group_names.join(" · ") : "Aucun groupe"} · {p.sessions_played} séance(s) jouée(s)</div>
              </div>
              <div className="text-right">
                <div className={cx("text-sm font-semibold tabular-nums", p.credits_balance < 0 ? "text-rose-600" : p.credits_balance <= 1 ? "text-amber-600" : "text-slate-800")}>{p.credits_balance}</div>
                <div className="text-[11px] text-slate-500">crédits</div>
              </div>
              <ChevronRight className="size-4 text-slate-300" />
            </Link>
          ))}
        </Card>
      )}
      <PlayerFormModal open={creating} onClose={() => setCreating(false)} onSaved={(p) => router.push(`/joueurs/${p.id}`)} />
    </>
  );
}
