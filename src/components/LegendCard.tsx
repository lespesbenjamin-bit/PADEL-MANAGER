"use client";
/* PADEL LEGENDS — « La collection des 20 » : carte sportive premium.
   Un seul composant pour toute l'application (joueur, coach, fil, shop) ET le mode démo.
   Illustration : visuel graphique original dessiné en code (terrain 20×10, vitres, grillage + pictogramme),
   remplacé automatiquement par l'illustration définitive dès que image_url est renseignée dans le référentiel. */
import {
  Briefcase, Building2, CalendarX, Camera, Castle, ClipboardList, Crown, Eye, Gavel, Grid3x3, Heart, Hourglass, Infinity as InfinityIcon,
  Layers, Lock, Megaphone, MessageSquareWarning, Mic, Sparkles, Star, TrendingUp, Zap, type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import type { MascotLevel, Rarity } from "@/lib/legends";
import { RARITY } from "@/lib/legends";
import { cx } from "./ui";

const MOTIF: Record<number, LucideIcon> = {
  1: Camera, 2: CalendarX, 3: MessageSquareWarning, 4: Megaphone, 5: Heart, 6: Grid3x3, 7: ClipboardList, 8: Hourglass,
  9: Briefcase, 10: Layers, 11: Building2, 12: Gavel, 13: Eye, 14: TrendingUp, 15: Sparkles, 16: Crown,
  17: Mic, 18: Zap, 19: Castle, 20: InfinityIcon,
};

/* Familles visuelles (Bronze → Légendaire) */
const FAMILY: Record<Rarity, { border: string; bg: string; ink: string; sub: string; art: string; court: string; extra?: string }> = {
  bronze: {
    border: "from-[#8c5a2b] via-[#e8c39e] to-[#a8693a]", bg: "from-[#f7ead9] via-[#ecd3b3] to-[#d9b48a]",
    ink: "text-[#4a2c12]", sub: "text-[#7a4b22]", art: "#8c5a2b", court: "#a8693a",
  },
  argent: {
    border: "from-slate-400 via-white to-sky-300", bg: "from-slate-100 via-sky-50 to-slate-300",
    ink: "text-slate-800", sub: "text-slate-500", art: "#475569", court: "#64748b", extra: "pch-card-shine",
  },
  or: {
    border: "from-amber-500 via-yellow-200 to-amber-600", bg: "from-[#1d0f3a] via-[#3a1a6b] to-[#140a2a]",
    ink: "text-amber-100", sub: "text-amber-300/80", art: "#fcd34d", court: "#a78bfa", extra: "pch-card-shine",
  },
  platine: {
    border: "from-violet-300 via-cyan-200 to-fuchsia-400", bg: "from-slate-100 via-violet-300 to-violet-700",
    ink: "text-violet-950", sub: "text-violet-800/80", art: "#4c1d95", court: "#ede9fe", extra: "pch-card-holo",
  },
  legendaire: {
    border: "from-amber-300 via-fuchsia-500 to-amber-400", bg: "from-black via-[#1b0b2e] to-black",
    ink: "text-amber-200", sub: "text-fuchsia-300/80", art: "#fbbf24", court: "#a855f7", extra: "pch-card-holo pch-card-legend",
  },
};

const SIZE = {
  xs: { w: "w-14", r: "rounded-md", p: "p-[2px]", num: "text-[7px]", name: "text-[6px] leading-[7px]", icon: 16, punch: false, foot: false },
  sm: { w: "w-28", r: "rounded-xl", p: "p-[3px]", num: "text-[9px]", name: "text-[10px] leading-3", icon: 26, punch: false, foot: true },
  md: { w: "w-44", r: "rounded-2xl", p: "p-[3px]", num: "text-[10px]", name: "text-[13px] leading-4", icon: 38, punch: true, foot: true },
  lg: { w: "w-60", r: "rounded-[20px]", p: "p-1", num: "text-xs", name: "text-base leading-5", icon: 52, punch: true, foot: true },
  xl: { w: "w-72", r: "rounded-3xl", p: "p-1", num: "text-xs", name: "text-lg leading-6", icon: 64, punch: true, foot: true },
} as const;

export type CardSize = keyof typeof SIZE;

export function LegendCard({ card, size = "md", locked, prestige = 0, favorite, current, unlocking, onClick, className }: {
  card: MascotLevel; size?: CardSize; locked?: boolean; prestige?: number; favorite?: boolean; current?: boolean; unlocking?: boolean;
  onClick?: () => void; className?: string;
}) {
  const f = FAMILY[card.rarity] ?? FAMILY.bronze;
  const s = SIZE[size];
  const Motif = MOTIF[card.level] ?? Star;
  const Tag = onClick ? "button" : "div";
  const stars = card.level === 20 ? prestige : 0;
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={cx("group relative block shrink-0 text-left transition", s.w, onClick && "hover:-translate-y-1", unlocking && "pch-card-unlock", className)}
      aria-label={`Carte n° ${card.level} · ${card.status}${locked ? " (verrouillée)" : ""}`}>
      <div className={cx("bg-gradient-to-br shadow-lg", s.r, s.p, locked ? "from-slate-300 to-slate-400 shadow-none" : f.border,
        !locked && card.rarity === "legendaire" && "shadow-fuchsia-500/40", !locked && stars >= 3 && "ring-2 ring-amber-300", current && !locked && "ring-2 ring-violet-500 ring-offset-2")}>
        <div className={cx("relative flex aspect-[5/7] flex-col overflow-hidden bg-gradient-to-br", s.r, locked ? "from-slate-100 to-slate-200" : f.bg, !locked && f.extra, locked && "grayscale")}>
          {/* en-tête : numéro et rareté */}
          <div className={cx("flex items-center justify-between px-[8%] pt-[6%] font-bold uppercase tracking-wider", s.num, locked ? "text-slate-500" : f.sub)}>
            <span>N° {String(card.level).padStart(2, "0")}</span>
            {size !== "xs" && <span>{RARITY[card.rarity]?.label}</span>}
          </div>
          {/* illustration */}
          <div className="relative mx-[8%] mt-[4%] flex-1">
            {card.image_url && !locked ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={card.image_url} alt="" className="absolute inset-0 size-full rounded-lg object-cover" />
            ) : (
              <CourtArt color={locked ? "#94a3b8" : f.court} />
            )}
            {!card.image_url || locked ? (
              <div className="absolute inset-0 grid place-items-center">
                <div className={cx("grid place-items-center rounded-full", size === "xs" ? "size-7" : "size-[58%]", "aspect-square",
                  locked ? "bg-slate-300/70" : card.rarity === "or" || card.rarity === "legendaire" ? "bg-white/10 shadow-[0_0_30px_rgba(251,191,36,.35)]" : "bg-white/50")}>
                  {locked ? <Lock size={s.icon * 0.7} className="text-slate-500" /> : <Motif size={s.icon} color={f.art} strokeWidth={1.6} />}
                </div>
              </div>
            ) : null}
          </div>
          {/* nom et punchline */}
          <div className="px-[8%] pb-[6%] pt-[5%]">
            <div className={cx("font-extrabold", s.name, locked ? "text-slate-500" : f.ink)}>{card.status}</div>
            {s.punch && (
              <div className={cx("mt-1 italic", size === "md" ? "text-[10px] leading-3" : "text-xs leading-4", locked ? "text-slate-400" : f.sub)}>
                {locked ? "Carte à débloquer" : `« ${card.punchline ?? card.description} »`}
              </div>
            )}
            {s.foot && (
              <div className={cx("mt-1.5 flex items-center justify-between border-t pt-1 text-[9px] font-semibold uppercase tracking-wide",
                locked ? "border-slate-300 text-slate-500" : card.rarity === "or" || card.rarity === "legendaire" ? "border-white/15 " + f.sub : "border-black/10 " + f.sub)}>
                <span>{card.xp_required.toLocaleString("fr-FR")} XP</span>
                {locked ? <span className="flex items-center gap-0.5"><Lock className="size-2.5" />Verrouillée</span> : <span>Débloquée</span>}
              </div>
            )}
          </div>
          {stars > 0 && !locked && (
            <div className="absolute inset-x-0 top-[13%] text-center text-amber-300 drop-shadow" style={{ fontSize: size === "xs" ? 7 : size === "sm" ? 10 : 14 }}>
              {"★".repeat(stars)}
            </div>
          )}
        </div>
      </div>
      {favorite && size !== "xs" && (
        <span className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-violet-600 text-white shadow ring-2 ring-white" title="Carte favorite">
          <Heart className="size-3.5" fill="currentColor" />
        </span>
      )}
    </Tag>
  );
}

/* Terrain de padel vu de dessus (20 × 10) : lignes, filet, vitres et grillage */
function CourtArt({ color }: { color: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 140" className="absolute inset-0 size-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0L6 6M6 0L0 6" stroke={color} strokeWidth=".4" opacity=".35" /></pattern>
      </defs>
      <rect x="8" y="6" width="84" height="128" rx="3" fill="none" stroke={color} strokeWidth="1.6" opacity=".7" />
      <rect x="8" y="50" width="6" height="40" fill={`url(#${id})`} />
      <rect x="86" y="50" width="6" height="40" fill={`url(#${id})`} />
      <line x1="8" y1="70" x2="92" y2="70" stroke={color} strokeWidth="2" opacity=".85" />
      <line x1="8" y1="36" x2="92" y2="36" stroke={color} strokeWidth=".9" opacity=".6" />
      <line x1="8" y1="104" x2="92" y2="104" stroke={color} strokeWidth=".9" opacity=".6" />
      <line x1="50" y1="36" x2="50" y2="104" stroke={color} strokeWidth=".9" opacity=".6" />
      <rect x="8" y="6" width="84" height="10" fill={color} opacity=".12" />
      <rect x="8" y="124" width="84" height="10" fill={color} opacity=".12" />
    </svg>
  );
}

/* Cadre de profil (récompenses numériques) autour d'un avatar */
export function ProfileFrame({ frame, children, className }: { frame: "none" | "silver" | "holo" | "ultimate"; children: React.ReactNode; className?: string }) {
  if (frame === "none") return <>{children}</>;
  return (
    <span className={cx("inline-grid rounded-full p-[2px]", frame === "silver" ? "bg-gradient-to-br from-slate-300 via-white to-sky-300"
      : frame === "holo" ? "pch-card-holo bg-gradient-to-br from-violet-400 via-cyan-300 to-fuchsia-400" : "pch-card-legend bg-gradient-to-br from-amber-300 via-fuchsia-500 to-amber-400", className)}>
      {children}
    </span>
  );
}
