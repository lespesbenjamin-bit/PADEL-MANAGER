"use client";
/* Carte Padel Legends affichée à côté du nom d'un joueur (fil d'actualité) : titre, cadre, carte favorite.
   Les demandes sont regroupées en un seul appel serveur par page. */
import { useEffect, useState } from "react";
import * as L from "@/lib/legends";
import { Badge } from "./ui";
import { LegendCard, ProfileFrame } from "./LegendCard";

type Info = { level: number; prestige: number; card: L.MascotLevel } | null;
const cache = new Map<string, Promise<Info>>();
let queue: { id: string; resolve: (v: Info) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let levelsP: Promise<L.MascotLevel[]> | null = null;

function flush() {
  const batch = queue; queue = []; timer = null;
  levelsP ??= L.getLevels().catch(() => []);
  Promise.all([L.getAuthorCards(batch.map((b) => b.id)).catch(() => [] as L.AuthorCard[]), levelsP]).then(([rows, levels]) => {
    for (const b of batch) {
      const r = rows.find((x) => x.user_id === b.id);
      const card = r && levels.find((l) => l.level === r.card_level);
      b.resolve(r && card ? { level: r.level, prestige: r.prestige, card } : null);
    }
  });
}
function load(id: string): Promise<Info> {
  let p = cache.get(id);
  if (!p) {
    p = new Promise<Info>((resolve) => { queue.push({ id, resolve }); timer ??= setTimeout(flush, 30); });
    cache.set(id, p);
  }
  return p;
}
export function useAuthorCard(userId: string | null | undefined, enabled = true) {
  const [info, setInfo] = useState<Info>(null);
  useEffect(() => { let on = true; if (userId && enabled) load(userId).then((v) => on && setInfo(v)); return () => { on = false; }; }, [userId, enabled]);
  return info;
}

export function AuthorFrame({ userId, enabled, children }: { userId: string; enabled: boolean; children: React.ReactNode }) {
  const info = useAuthorCard(userId, enabled);
  return <ProfileFrame frame={info ? L.profileFrame(info.level) : "none"}>{children}</ProfileFrame>;
}
export function AuthorBadge({ userId, enabled }: { userId: string; enabled: boolean }) {
  const info = useAuthorCard(userId, enabled);
  if (!info) return null;
  const title = L.profileTitle(info.level);
  return (
    <>
      <Badge className={L.RARITY[info.card.rarity].chip}>🃏 {info.card.status}</Badge>
      {title && <Badge className={info.level >= 20 ? "bg-slate-900 text-amber-300 ring-amber-400" : "bg-amber-50 text-amber-700 ring-amber-300"}>{title}{info.prestige > 0 ? ` ${"★".repeat(info.prestige)}` : ""}</Badge>}
    </>
  );
}
/* Carte jointe à une publication « nouvelle carte débloquée » */
export function SharedCard({ level }: { level: number }) {
  const [card, setCard] = useState<L.MascotLevel | null>(null);
  useEffect(() => { levelsP ??= L.getLevels().catch(() => []); levelsP.then((ls) => setCard(ls.find((l) => l.level === level) ?? null)); }, [level]);
  if (!card) return null;
  return <div className="flex justify-center py-3"><LegendCard card={card} size="md" /></div>;
}
