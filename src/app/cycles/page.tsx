"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Flag } from "lucide-react";
import * as api from "@/lib/api";
import { fmtDate, fmtRange, weekdayName } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { CYCLE_STATUS } from "@/lib/labels";
import type { CycleStatus } from "@/lib/types";
import { Badge, Card, cx, Empty, ErrorBox, LevelBadge, PageHeader, Progress, Segmented, Spinner, StatTile } from "@/components/ui";

export default function CyclesPage() {
  const { data, error, loading, reload } = useAsync(() => api.getCycles(), []);
  const [tab, setTab] = useState<CycleStatus | "all">("in_progress");

  const list = useMemo(() => (data ?? [])
    .filter((c) => c.group_status !== "archived" || tab === "archived" || tab === "all")
    .filter((c) => tab === "all" || c.effective_status === tab)
    .sort((a, b) => (a.projected_end_date ?? "").localeCompare(b.projected_end_date ?? "")), [data, tab]);

  const active = (data ?? []).filter((c) => c.effective_status === "in_progress" && c.group_status !== "archived");
  const n = (s: CycleStatus) => (data ?? []).filter((c) => c.effective_status === s && (s === "archived" || c.group_status !== "archived")).length;

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title="Cycles" subtitle="Avancement de tous les cycles d'entraînement" />
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Cycles en cours" value={active.length} tone="accent" />
        <StatTile label="Séances réalisées" value={active.reduce((a, c) => a + c.realized, 0)} hint="cycles en cours" />
        <StatTile label="Séances restantes" value={active.reduce((a, c) => a + c.remaining, 0)} hint="cycles en cours" />
        <StatTile label="À valider" value={active.reduce((a, c) => a + c.pending, 0)} tone={active.some((c) => c.pending) ? "alert" : "default"} />
      </div>
      <div className="mb-4 overflow-x-auto">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "in_progress", label: `En cours (${n("in_progress")})` },
          { value: "upcoming", label: `À venir (${n("upcoming")})` },
          { value: "completed", label: `Terminés (${n("completed")})` },
          { value: "archived", label: `Archivés (${n("archived")})` },
          { value: "all", label: "Tous" },
        ]} />
      </div>
      {list.length === 0 ? <Empty>Aucun cycle dans cette catégorie.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <Link key={c.id} href={`/groupes/${c.group_id}`}>
              <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{c.group_name}</div>
                    <div className="text-xs text-slate-500">{c.name ?? `Cycle ${c.cycle_number}`} · {weekdayName(c.weekday)} {fmtRange(c.start_time, c.end_time)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1"><LevelBadge level={c.level} /><Badge className={CYCLE_STATUS[c.effective_status].cls}>{CYCLE_STATUS[c.effective_status].label}</Badge></div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular-nums">{c.realized}<span className="text-sm text-slate-400">/{c.planned_sessions}</span></span>
                  <span className={cx("text-sm font-medium", c.remaining <= 2 && c.effective_status === "in_progress" ? "text-amber-700" : "text-slate-500")}>{c.remaining} restante{c.remaining > 1 ? "s" : ""}</span>
                </div>
                <Progress value={c.progress} color={c.color} className="mt-1.5" />
                <div className="mt-3 flex flex-wrap justify-between gap-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" /> {fmtDate(c.first_date, "d MMM")} → prochaine {fmtDate(c.next_date, "d MMM")}</span>
                  <span className="inline-flex items-center gap-1"><Flag className="size-3.5" /> fin {fmtDate(c.projected_end_date, "d MMM yyyy")}</span>
                </div>
                {(c.cancelled > 0 || c.pending > 0) && (
                  <div className="mt-2 flex gap-2 text-xs">
                    {c.cancelled > 0 && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">{c.cancelled} annulée{c.cancelled > 1 ? "s" : ""}</span>}
                    {c.pending > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{c.pending} à valider</span>}
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
