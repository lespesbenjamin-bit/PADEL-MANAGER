"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import * as api from "@/lib/api";
import {
  addDaysISO, addMonthsISO, fmtDate, fmtTime, monthGrid, monthRange, timeToMinutes, todayISO, weekRange, WEEKDAYS_SHORT,
} from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { SESSION_STATUS, sessionDisplayStatus } from "@/lib/labels";
import type { VSession } from "@/lib/types";
import { AddSessionModal } from "@/components/forms";
import { SessionRow } from "@/components/SessionRow";
import { Button, Card, cx, ErrorBox, PageHeader, Segmented, Select, Spinner } from "@/components/ui";

type View = "week" | "month" | "list";
const HOUR_PX = 52;

export default function PlanningPage() {
  return <Suspense fallback={<Spinner />}><Planning /></Suspense>;
}

function Planning() {
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<View>((params.get("v") as View) || "week");
  const [anchor, setAnchor] = useState(params.get("d") || todayISO());
  const [groupId, setGroupId] = useState(params.get("group") || "");
  const [showCancelled, setShowCancelled] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const today = todayISO();

  const range = view === "month"
    ? (() => { const g = monthGrid(anchor); return { start: g[0], end: g[g.length - 1] }; })()
    : weekRange(anchor);

  const { data, error, loading, reload } = useAsync(async () => {
    const [sessions, groups] = await Promise.all([api.getSessions({ from: range.start, to: range.end }), api.getGroups()]);
    return { sessions, groups };
  }, [range.start, range.end]);

  const sessions = useMemo(() => (data?.sessions ?? []).filter((s) =>
    (!groupId || s.group_id === groupId) && (showCancelled || s.status !== "cancelled")), [data, groupId, showCancelled]);

  const byDay = useMemo(() => {
    const m = new Map<string, VSession[]>();
    for (const s of sessions) m.set(s.session_date, [...(m.get(s.session_date) ?? []), s]);
    return m;
  }, [sessions]);

  function move(dir: number) {
    setAnchor(view === "month" ? addMonthsISO(anchor, dir) : addDaysISO(anchor, 7 * dir));
    setSelectedDay(null);
  }

  const title = view === "month"
    ? fmtDate(monthRange(anchor).start, "MMMM yyyy")
    : `${fmtDate(range.start, "d MMM")} – ${fmtDate(range.end, "d MMM yyyy")}`;

  return (
    <>
      <PageHeader title="Planning" subtitle={<span className="capitalize">{title}</span>}
        actions={<Button onClick={() => setAdding(selectedDay ?? today)}><Plus className="size-4" /> Séance exceptionnelle</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={(v) => { setView(v); setSelectedDay(null); }} options={[
          { value: "week", label: "Semaine" }, { value: "month", label: "Mois" }, { value: "list", label: "Liste" },
        ]} />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => move(-1)} aria-label="Précédent"><ChevronLeft className="size-4" /></Button>
          <Button size="sm" variant="secondary" onClick={() => { setAnchor(today); setSelectedDay(null); }}>Aujourd&apos;hui</Button>
          <Button size="sm" variant="secondary" onClick={() => move(1)} aria-label="Suivant"><ChevronRight className="size-4" /></Button>
        </div>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="!h-8 !w-auto text-sm">
          <option value="">Tous les groupes</option>
          {(data?.groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" className="accent-violet-600" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Annulées
        </label>
      </div>

      <Legend />

      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          {view === "week" && <WeekGrid start={range.start} byDay={byDay} today={today} onAdd={setAdding} />}
          {view === "list" && <WeekList start={range.start} byDay={byDay} today={today} />}
          {view === "month" && (
            <>
              <MonthGrid anchor={anchor} byDay={byDay} today={today} selected={selectedDay} onSelect={setSelectedDay} />
              {selectedDay && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold capitalize text-slate-700">{fmtDate(selectedDay, "EEEE d MMMM")}</h3>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(selectedDay)}><Plus className="size-4" /> Ajouter</Button>
                  </div>
                  <Card className="divide-y divide-slate-100">
                    {(byDay.get(selectedDay) ?? []).length === 0 ? <div className="p-4 text-sm text-slate-500">Aucune séance ce jour.</div> :
                      byDay.get(selectedDay)!.map((s) => <SessionRow key={s.id} s={s} showGroup />)}
                  </Card>
                </div>
              )}
            </>
          )}
        </>
      )}

      <AddSessionModal open={!!adding} onClose={() => setAdding(null)} groups={data?.groups ?? []} defaultGroupId={groupId || undefined}
        defaultDate={adding ?? undefined} onSaved={(id) => router.push(`/seances/${id}`)} />
    </>
  );
}

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-500">
      {(["planned", "pending", "validated", "cancelled"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className={cx("size-2 rounded-full", SESSION_STATUS[k].dot)} /> {SESSION_STATUS[k].label}</span>
      ))}
    </div>
  );
}

/* ---------------------------- Semaine (grille horaire) ---------------------------- */
function layoutDay(list: VSession[]) {
  const sorted = [...list].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const cols: VSession[][] = [];
  const pos = new Map<string, { col: number; cols: number }>();
  let cluster: VSession[] = []; let clusterEnd = -1;
  const flush = () => { const n = cols.length; cluster.forEach((s) => { const p = pos.get(s.id)!; pos.set(s.id, { ...p, cols: n }); }); cols.length = 0; cluster = []; };
  for (const s of sorted) {
    const st = timeToMinutes(s.start_time);
    if (st >= clusterEnd && cluster.length) flush();
    let c = cols.findIndex((col) => timeToMinutes(col[col.length - 1].end_time) <= st);
    if (c === -1) { cols.push([s]); c = cols.length - 1; } else cols[c].push(s);
    pos.set(s.id, { col: c, cols: 1 });
    cluster.push(s); clusterEnd = Math.max(clusterEnd, timeToMinutes(s.end_time));
  }
  if (cluster.length) flush();
  return pos;
}

function WeekGrid({ start, byDay, today, onAdd }: { start: string; byDay: Map<string, VSession[]>; today: string; onAdd: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const all = days.flatMap((d) => byDay.get(d) ?? []);
  const minH = Math.min(8, ...all.map((s) => Math.floor(timeToMinutes(s.start_time) / 60)));
  const maxH = Math.max(22, ...all.map((s) => Math.ceil(timeToMinutes(s.end_time) / 60)));
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);

  return (
    <Card className="overflow-hidden">
      <div className="scrollbar-thin overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-slate-100 bg-slate-50/80">
            <div />
            {days.map((d, i) => (
              <button key={d} onClick={() => onAdd(d)} title="Ajouter une séance ce jour"
                className={cx("py-2 text-center text-xs", d === today ? "text-violet-700" : "text-slate-500")}>
                <div className="font-medium uppercase">{WEEKDAYS_SHORT[i]}</div>
                <div className={cx("mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-sm font-semibold", d === today && "bg-violet-600 text-white")}>{fmtDate(d, "d")}</div>
              </button>
            ))}
          </div>
          <div className="relative grid grid-cols-[48px_repeat(7,1fr)]" style={{ height: hours.length * HOUR_PX }}>
            <div>{hours.map((h) => <div key={h} className="pr-1.5 text-right text-[11px] text-slate-400" style={{ height: HOUR_PX }}>{h}h</div>)}</div>
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              const pos = layoutDay(list);
              return (
                <div key={d} className={cx("relative border-l border-slate-100", d === today && "bg-violet-50/30")}>
                  {hours.map((h) => <div key={h} className="border-t border-slate-100" style={{ height: HOUR_PX }} />)}
                  {list.map((s) => {
                    const top = ((timeToMinutes(s.start_time) - minH * 60) / 60) * HOUR_PX;
                    const height = Math.max(28, ((timeToMinutes(s.end_time) - timeToMinutes(s.start_time)) / 60) * HOUR_PX - 2);
                    const p = pos.get(s.id)!;
                    const ds = sessionDisplayStatus(s);
                    return (
                      <Link key={s.id} href={`/seances/${s.id}`}
                        className={cx("absolute overflow-hidden rounded-lg border-l-4 px-1.5 py-1 text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md",
                          ds === "cancelled" ? "bg-slate-50 text-slate-400 line-through" : ds === "validated" ? "bg-emerald-50 text-emerald-900" : ds === "pending" ? "bg-amber-50 text-amber-900" : "bg-violet-50 text-violet-950")}
                        style={{ top, height, left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${100 / p.cols}% - 4px)`, borderLeftColor: s.color }}>
                        <div className="truncate font-semibold">{s.group_name}</div>
                        <div className="truncate opacity-80">{fmtTime(s.start_time)}–{fmtTime(s.end_time)} · {s.group_level}</div>
                        {height > 50 && (
                          <div className="mt-0.5 flex items-center gap-1.5 truncate opacity-80">
                            <span className="inline-flex items-center gap-0.5"><Users className="size-3" />{s.status === "validated" ? s.present_count : s.member_count}</span>
                            <span>{s.cycle_index ? `${s.cycle_index}/${s.planned_sessions}` : s.kind === "regular" ? "" : "Exc."}</span>
                            <span className={cx("size-1.5 rounded-full", SESSION_STATUS[ds].dot)} />
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------- Semaine (liste, idéale sur téléphone) ---------------------------- */
function WeekList({ start, byDay, today }: { start: string; byDay: Map<string, VSession[]>; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  return (
    <div className="space-y-4">
      {days.map((d) => (
        <div key={d}>
          <h3 className={cx("mb-1.5 text-sm font-semibold capitalize", d === today ? "text-violet-700" : "text-slate-600")}>{fmtDate(d, "EEEE d MMMM")}{d === today && " · aujourd'hui"}</h3>
          <Card className="divide-y divide-slate-100">
            {(byDay.get(d) ?? []).length === 0 ? <div className="px-3 py-2.5 text-xs text-slate-400">—</div> :
              byDay.get(d)!.map((s) => <SessionRow key={s.id} s={s} showGroup />)}
          </Card>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- Mois ---------------------------- */
function MonthGrid({ anchor, byDay, today, selected, onSelect }: {
  anchor: string; byDay: Map<string, VSession[]>; today: string; selected: string | null; onSelect: (d: string) => void;
}) {
  const days = monthGrid(anchor);
  const month = anchor.slice(0, 7);
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80">
        {WEEKDAYS_SHORT.map((d) => <div key={d} className="py-2 text-center text-xs font-medium uppercase text-slate-500">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const out = d.slice(0, 7) !== month;
          return (
            <button key={d} onClick={() => onSelect(d)}
              className={cx("min-h-20 border-b border-r border-slate-100 p-1 text-left align-top transition hover:bg-violet-50/40 sm:min-h-28",
                out && "bg-slate-50/60 text-slate-400", selected === d && "bg-violet-50 ring-2 ring-inset ring-violet-400")}>
              <div className={cx("mb-1 grid size-6 place-items-center rounded-full text-xs font-medium", d === today && "bg-violet-600 text-white")}>{Number(d.slice(8))}</div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((s) => {
                  const ds = sessionDisplayStatus(s);
                  return (
                    <div key={s.id} className={cx("flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] sm:text-[11px]", ds === "cancelled" ? "text-slate-400 line-through" : "bg-white ring-1 ring-slate-100")}>
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="hidden shrink-0 tabular-nums text-slate-500 sm:inline">{fmtTime(s.start_time)}</span>
                      <span className="truncate font-medium">{s.group_name}</span>
                      <span className={cx("ml-auto size-1.5 shrink-0 rounded-full", SESSION_STATUS[ds].dot)} />
                    </div>
                  );
                })}
                {list.length > 3 && <div className="px-1 text-[10px] text-slate-500">+{list.length - 3}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
