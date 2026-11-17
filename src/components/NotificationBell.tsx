"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import * as hub from "@/lib/hub";
import { timeAgo } from "@/lib/dates";
import { cx } from "./ui";

export function NotificationBell({ align = "right" }: { align?: "left" | "right" }) {
  const router = useRouter();
  const [list, setList] = useState<hub.Notification[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { hub.getNotifications().then(setList).catch(() => {}); }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  const unread = list.filter((n) => !n.read_at).length;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread) { try { await hub.markAllRead(); } catch {} setTimeout(load, 400); }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={cx("absolute z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200", align === "right" ? "right-0" : "left-0")}>
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">Notifications</div>
            <div className="max-h-96 overflow-y-auto">
              {list.length === 0 ? <p className="p-4 text-sm text-slate-500">Rien de nouveau.</p> : list.map((n) => (
                <button key={n.id} onClick={() => { setOpen(false); if (n.link) router.push(n.link); }}
                  className={cx("block w-full border-b border-slate-50 px-4 py-2.5 text-left text-sm hover:bg-slate-50", !n.read_at && "bg-violet-50/50")}>
                  <div className="font-medium text-slate-800">{n.title}</div>
                  {n.body && <div className="line-clamp-2 text-xs text-slate-500">{n.body}</div>}
                  <div className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.created_at)}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
