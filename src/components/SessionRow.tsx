"use client";
import Link from "next/link";
import { ChevronRight, Repeat } from "lucide-react";
import type { VSession } from "@/lib/types";
import { fmtDate, fmtRange } from "@/lib/dates";
import { SESSION_KIND, SESSION_STATUS, sessionDisplayStatus } from "@/lib/labels";
import { Badge, cx } from "./ui";

export function SessionRow({ s, showGroup }: { s: VSession; showGroup?: boolean }) {
  const st = SESSION_STATUS[sessionDisplayStatus(s)];
  return (
    <Link href={`/seances/${s.id}`} className={cx("flex items-center gap-3 p-3 transition hover:bg-slate-50", s.status === "cancelled" && "opacity-70")}>
      <div className="w-12 shrink-0 text-center">
        <div className="text-[11px] font-medium uppercase text-slate-500">{fmtDate(s.session_date, "EEE")}</div>
        <div className="text-lg font-semibold leading-none tabular-nums">{fmtDate(s.session_date, "d")}</div>
        <div className="text-[11px] text-slate-500">{fmtDate(s.session_date, "MMM")}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
          <span className={cx("truncate text-sm font-medium", s.status === "cancelled" && "line-through")}>
            {showGroup ? s.group_name : s.cycle_index ? `Séance ${s.cycle_index}/${s.planned_sessions}` : SESSION_KIND[s.kind]}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span>{fmtRange(s.start_time, s.end_time)}</span>
          {showGroup && s.cycle_index && <span>· Séance {s.cycle_index}/{s.planned_sessions}</span>}
          {s.kind !== "regular" && <span>· {SESSION_KIND[s.kind]}{s.counts_in_cycle ? " (comptée)" : ""}</span>}
          {s.rescheduled && s.original_date && <span className="inline-flex items-center gap-0.5"><Repeat className="size-3" /> reportée du {fmtDate(s.original_date, "d/MM")}</span>}
          {s.status === "validated" && <span>· {s.present_count} présent{s.present_count > 1 ? "s" : ""}</span>}
        </div>
      </div>
      <Badge className={st.cls}>{st.label}</Badge>
      <ChevronRight className="size-4 shrink-0 text-slate-300" />
    </Link>
  );
}
