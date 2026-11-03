"use client";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Flag, Users } from "lucide-react";
import type { GroupOverview } from "@/lib/types";
import { fmtDate, fmtRange, weekdayName } from "@/lib/dates";
import { CYCLE_STATUS, GROUP_STATUS } from "@/lib/labels";
import { Badge, Card, cx, LevelBadge, Progress } from "./ui";

export const NEAR_END_THRESHOLD = 2;

export function isNearEnd(g: Pick<GroupOverview, "remaining" | "cycle_status">) {
  return g.cycle_status === "in_progress" && g.remaining !== null && g.remaining <= NEAR_END_THRESHOLD;
}

export function GroupCard({ g }: { g: GroupOverview }) {
  const near = isNearEnd(g);
  const full = g.member_count >= g.capacity;
  return (
    <Link href={`/groupes/${g.id}`} className="block">
      <Card className="relative h-full overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: g.color }} />
        <div className="flex items-start justify-between gap-2 pl-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-slate-900">{g.name}</h3>
            </div>
            <div className="mt-0.5 text-sm text-slate-500">{weekdayName(g.weekday)} · {fmtRange(g.start_time, g.end_time)}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <LevelBadge level={g.level} />
            {g.status !== "active" && <Badge className={GROUP_STATUS[g.status].cls}>{GROUP_STATUS[g.status].label}</Badge>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-sm">
          <span className={cx("inline-flex items-center gap-1.5", full ? "text-slate-900" : "text-slate-600")}>
            <Users className="size-4 text-slate-400" /> <b className="tabular-nums">{g.member_count}</b>/{g.capacity} joueurs
          </span>
          {g.pending_count > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="size-4" /> {g.pending_count} à valider</span>
          )}
        </div>

        {g.cycle_id ? (
          <div className="mt-3 pl-1">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                {g.cycle_name ?? `Cycle ${g.cycle_number}`}{" "}
                {g.cycle_status && <span className={cx("ml-1 rounded-full px-1.5 py-0.5 ring-1 ring-inset", CYCLE_STATUS[g.cycle_status].cls)}>{CYCLE_STATUS[g.cycle_status].label}</span>}
              </span>
              <span className="tabular-nums text-slate-500">{g.progress ?? 0}%</span>
            </div>
            <Progress value={g.progress ?? 0} color={g.color} />
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 px-2 py-1.5"><span className="block text-slate-500">Réalisées</span><b className="text-sm tabular-nums">{g.realized}</b><span className="text-slate-400"> / {g.planned_sessions}</span></div>
              <div className={cx("rounded-lg px-2 py-1.5", near ? "bg-amber-50" : "bg-slate-50")}><span className="block text-slate-500">Restantes</span><b className={cx("text-sm tabular-nums", near && "text-amber-700")}>{g.remaining}</b></div>
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" /> Prochaine : <b className="font-medium text-slate-700">{fmtDate(g.next_session_date)}</b></span>
              <span className={cx("inline-flex items-center gap-1", near && "text-amber-700")}><Flag className="size-3.5" /> Fin : <b className="font-medium">{fmtDate(g.projected_end_date, "d MMM")}</b></span>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-slate-50 p-2 pl-3 text-xs text-slate-500">Aucun cycle planifié</div>
        )}
      </Card>
    </Link>
  );
}
