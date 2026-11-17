"use client";
import Link from "next/link";
import type { VSession } from "@/lib/types";
import { addDaysISO, fmtDate, fmtTime, WEEKDAYS_SHORT } from "@/lib/dates";
import { SESSION_STATUS, sessionDisplayStatus } from "@/lib/labels";
import { Card, cx } from "./ui";

/** Calendrier compact de la semaine pour le tableau de bord */
export function WeekStrip({ start, today, sessions }: { start: string; today: string; sessions: VSession[] }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const byDay = (d: string) => sessions.filter((s) => s.session_date === d).sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <Card className="overflow-hidden">
      {/* Ordinateur : 7 colonnes */}
      <div className="hidden grid-cols-7 divide-x divide-slate-100 md:grid">
        {days.map((d, i) => (
          <div key={d} className={cx("min-h-36 p-2", d === today && "bg-violet-50/50")}>
            <div className={cx("mb-2 flex items-baseline justify-between text-xs", d === today ? "text-violet-700" : "text-slate-500")}>
              <span className="font-medium uppercase">{WEEKDAYS_SHORT[i]}</span>
              <span className={cx("grid size-6 place-items-center rounded-full text-sm font-semibold", d === today && "bg-violet-600 text-white")}>{fmtDate(d, "d")}</span>
            </div>
            <div className="space-y-1">
              {byDay(d).map((s) => <Chip key={s.id} s={s} />)}
            </div>
          </div>
        ))}
      </div>
      {/* Téléphone : liste des jours */}
      <div className="divide-y divide-slate-100 md:hidden">
        {days.map((d, i) => {
          const list = byDay(d);
          return (
            <div key={d} className={cx("flex gap-3 px-3 py-2", d === today && "bg-violet-50/50")}>
              <div className={cx("w-10 shrink-0 pt-0.5 text-center", d === today ? "text-violet-700" : "text-slate-500")}>
                <div className="text-[10px] font-medium uppercase">{WEEKDAYS_SHORT[i]}</div>
                <div className="text-base font-semibold leading-tight">{fmtDate(d, "d")}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
                {list.length === 0 ? <span className="pt-1.5 text-xs text-slate-300">—</span> : list.map((s) => <Chip key={s.id} s={s} />)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Chip({ s }: { s: VSession }) {
  const ds = sessionDisplayStatus(s);
  return (
    <Link href={`/seances/${s.id}`}
      className={cx("block rounded-lg border-l-[3px] px-2 py-1 text-[11px] leading-tight transition hover:shadow-sm",
        ds === "cancelled" ? "bg-slate-50 text-slate-400 line-through" : ds === "validated" ? "bg-emerald-50 text-emerald-900" : ds === "pending" ? "bg-amber-50 text-amber-900" : "bg-violet-50 text-violet-950")}
      style={{ borderLeftColor: s.color }}>
      <div className="flex items-center gap-1">
        <span className="tabular-nums opacity-70">{fmtTime(s.start_time)}</span>
        <span className={cx("ml-auto size-1.5 shrink-0 rounded-full", SESSION_STATUS[ds].dot)} />
      </div>
      <div className="truncate font-semibold">{s.group_name}</div>
    </Link>
  );
}
