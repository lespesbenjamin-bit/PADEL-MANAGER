"use client";
import { forwardRef, ReactNode, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DiagramData, DiagramElement } from "@/lib/hub";
import { cx } from "../ui";

/* Terrain de padel vu de dessus : 10 m × 20 m → 100 × 200 unités (1 unité = 10 cm). */
export const W = 100;
export const L = 200;
const PAD = 8;
export const VIEWBOX = `${-PAD} ${-PAD} ${W + PAD * 2} ${L + PAD * 2}`;
export const TEAM_COLORS = { A: "#7C3AED", B: "#E11D48" };
export const PALETTE = ["#FACC15", "#FFFFFF", "#22C55E", "#F97316", "#7C3AED", "#E11D48", "#0EA5E9", "#0F172A"];

const COURT = "#2F6FD8";
const COURT_OUT = "#1E4FA3";

export function CourtBackground() {
  const svc = 69.5; // ligne de service à 6,95 m du filet
  return (
    <g>
      <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={L + PAD * 2} fill={COURT_OUT} rx={4} />
      <rect x={0} y={0} width={W} height={L} fill={COURT} />
      {/* zones de service (légèrement plus claires) */}
      <rect x={0} y={L / 2 - svc} width={W} height={svc * 2} fill="#ffffff" opacity={0.04} />
      {/* lignes */}
      <g stroke="#fff" strokeWidth={0.8} fill="none" opacity={0.95}>
        <rect x={0} y={0} width={W} height={L} />
        <line x1={0} y1={L / 2 - svc} x2={W} y2={L / 2 - svc} />
        <line x1={0} y1={L / 2 + svc} x2={W} y2={L / 2 + svc} />
        <line x1={W / 2} y1={L / 2 - svc} x2={W / 2} y2={L / 2 + svc} />
      </g>
      {/* vitres : fonds + 4 m sur chaque côté depuis le fond (puis 2 m en option) */}
      <g stroke="#BAE6FD" strokeWidth={2.4} strokeLinecap="square" opacity={0.95}>
        <line x1={0} y1={-1.2} x2={W} y2={-1.2} />
        <line x1={0} y1={L + 1.2} x2={W} y2={L + 1.2} />
        <line x1={-1.2} y1={0} x2={-1.2} y2={40} /><line x1={W + 1.2} y1={0} x2={W + 1.2} y2={40} />
        <line x1={-1.2} y1={L - 40} x2={-1.2} y2={L} /><line x1={W + 1.2} y1={L - 40} x2={W + 1.2} y2={L} />
      </g>
      {/* grilles (côtés centraux) */}
      <g stroke="#CBD5E1" strokeWidth={1.4} strokeDasharray="1.5 1.5" opacity={0.85}>
        <line x1={-1.2} y1={40} x2={-1.2} y2={L - 40} /><line x1={W + 1.2} y1={40} x2={W + 1.2} y2={L - 40} />
      </g>
      {/* filet */}
      <line x1={-3} y1={L / 2} x2={W + 3} y2={L / 2} stroke="#F8FAFC" strokeWidth={1.6} />
      <line x1={-3} y1={L / 2} x2={W + 3} y2={L / 2} stroke="#0F172A" strokeWidth={0.6} strokeDasharray="1 1" />
      <circle cx={-3} cy={L / 2} r={1.4} fill="#F8FAFC" /><circle cx={W + 3} cy={L / 2} r={1.4} fill="#F8FAFC" />
    </g>
  );
}

const X = (v: number) => v * W;
const Y = (v: number) => v * L;

function arrowHead(x: number, y: number, fromX: number, fromY: number, color: string, size = 4) {
  const a = Math.atan2(y - fromY, x - fromX);
  const p1 = [x - size * Math.cos(a - 0.45), y - size * Math.sin(a - 0.45)];
  const p2 = [x - size * Math.cos(a + 0.45), y - size * Math.sin(a + 0.45)];
  return <polygon points={`${x},${y} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`} fill={color} />;
}

/** Dessin d'un élément du schéma */
export function ElementShape({ e, selected }: { e: DiagramElement; selected?: boolean }) {
  const x = X(e.x), y = Y(e.y);
  const sel = selected ? { filter: "drop-shadow(0 0 2px #fff) drop-shadow(0 0 3px #FACC15)" } : undefined;
  switch (e.type) {
    case "player":
      return (
        <g style={sel}>
          <circle cx={x} cy={y} r={5} fill={e.color} stroke="#fff" strokeWidth={1.2} />
          <text x={x} y={y + 2.1} textAnchor="middle" fontSize={5.8} fontWeight={700} fill="#fff" fontFamily="Inter, sans-serif">{e.label ?? ""}</text>
        </g>
      );
    case "ball":
      return <circle cx={x} cy={y} r={2} fill="#D9F99D" stroke="#4D7C0F" strokeWidth={0.6} style={sel} />;
    case "cone":
      return <polygon points={`${x},${y - 3.2} ${x - 2.8},${y + 2.4} ${x + 2.8},${y + 2.4}`} fill={e.color} stroke="#fff" strokeWidth={0.5} style={sel} />;
    case "text": {
      const t = e.label || "Texte";
      const w = Math.max(10, t.length * 3.1 + 4);
      return (
        <g style={sel}>
          <rect x={x - w / 2} y={y - 4.5} width={w} height={8} rx={2} fill="#0F172A" opacity={0.75} />
          <text x={x} y={y + 1.6} textAnchor="middle" fontSize={5} fontWeight={600} fill={e.color} fontFamily="Inter, sans-serif">{t}</text>
        </g>
      );
    }
    case "zone": {
      const x1 = Math.min(x, X(e.x2 ?? e.x)), y1 = Math.min(y, Y(e.y2 ?? e.y));
      const w = Math.abs(X(e.x2 ?? e.x) - x), h = Math.abs(Y(e.y2 ?? e.y) - y);
      return <rect x={x1} y={y1} width={w} height={h} fill={e.color} fillOpacity={0.28} stroke={e.color} strokeWidth={0.8} strokeDasharray="2 1.5" rx={1.5} style={sel} />;
    }
    case "arrow":
    case "move": {
      const x2 = X(e.x2 ?? e.x), y2 = Y(e.y2 ?? e.y);
      return (
        <g style={sel}>
          <line x1={x} y1={y} x2={x2} y2={y2} stroke={e.color} strokeWidth={1.4} strokeDasharray={e.type === "move" ? "3 2" : undefined} strokeLinecap="round" />
          {arrowHead(x2, y2, x, y, e.color)}
        </g>
      );
    }
    case "shot": {
      const x2 = X(e.x2 ?? e.x), y2 = Y(e.y2 ?? e.y);
      const cx = X(e.cx ?? (e.x + (e.x2 ?? e.x)) / 2), cy = Y(e.cy ?? (e.y + (e.y2 ?? e.y)) / 2);
      return (
        <g style={sel}>
          <path d={`M ${x} ${y} Q ${cx} ${cy} ${x2} ${y2}`} fill="none" stroke={e.color} strokeWidth={1.3} strokeDasharray="0.1 2.4" strokeLinecap="round" />
          {arrowHead(x2, y2, cx, cy, e.color)}
        </g>
      );
    }
  }
}

export const CourtSvg = forwardRef<SVGSVGElement, { elements: DiagramElement[]; selectedId?: string | null; children?: ReactNode; className?: string } & React.SVGProps<SVGSVGElement>>(
  function CourtSvg({ elements, selectedId, children, className, ...rest }, ref) {
    // ordre d'affichage : zones, lignes, objets, joueurs, textes
    const order = { zone: 0, arrow: 1, move: 1, shot: 1, cone: 2, ball: 3, player: 4, text: 5 } as const;
    const sorted = [...elements].sort((a, b) => order[a.type] - order[b.type]);
    return (
      <svg ref={ref} viewBox={VIEWBOX} xmlns="http://www.w3.org/2000/svg" className={cx("block h-full w-full select-none", className)} {...rest}>
        <CourtBackground />
        {sorted.map((e) => <g key={e.id} data-id={e.id}><ElementShape e={e} selected={e.id === selectedId} /></g>)}
        {children}
      </svg>
    );
  });

/** Lecture seule, avec navigation entre les étapes */
export function CourtView({ data, className, compact }: { data: DiagramData | null | undefined; className?: string; compact?: boolean }) {
  const frames = data?.frames?.length ? data.frames : [{ elements: [] }];
  const [i, setI] = useState(0);
  const f = frames[Math.min(i, frames.length - 1)];
  return (
    <div className={className}>
      <div className={cx("mx-auto", compact ? "max-w-[160px]" : "max-w-xs")}><CourtSvg elements={f.elements} /></div>
      {!compact && frames.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-600">
          <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="rounded-lg p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Étape précédente"><ChevronLeft className="size-4" /></button>
          Étape {i + 1}/{frames.length}
          <button onClick={() => setI(Math.min(frames.length - 1, i + 1))} disabled={i === frames.length - 1} className="rounded-lg p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Étape suivante"><ChevronRight className="size-4" /></button>
        </div>
      )}
      {!compact && f.note && <p className="mt-1 text-center text-xs text-slate-500">{f.note}</p>}
    </div>
  );
}

/* ------------------------------ Export PNG / PDF ------------------------------ */
/** Rendu caché de toutes les étapes, utilisé pour l'export */
export function ExportFrames({ data, refs }: { data: DiagramData; refs: React.MutableRefObject<(SVGSVGElement | null)[]> }) {
  return (
    <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 600 }}>
      {data.frames.map((f, i) => <CourtSvg key={i} ref={(el) => { refs.current[i] = el; }} elements={f.elements} width={600} height={1200} />)}
    </div>
  );
}

async function svgToCanvas(svgEl: SVGSVGElement): Promise<HTMLCanvasElement> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", "600"); clone.setAttribute("height", "1200");
  const str = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Rendu impossible")); img.src = url; });
  const c = document.createElement("canvas");
  c.width = 600; c.height = 1200;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c;
}

function download(href: string, name: string) {
  const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

const safe = (t: string) => t.replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-") || "schema";

export async function exportPng(svgEl: SVGSVGElement, title: string, frameIndex: number, frameCount: number) {
  const c = await svgToCanvas(svgEl);
  download(c.toDataURL("image/png"), `${safe(title)}${frameCount > 1 ? `-etape-${frameIndex + 1}` : ""}.png`);
}

export async function exportPdf(svgEls: SVGSVGElement[], data: DiagramData, title: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  for (let i = 0; i < svgEls.length; i++) {
    if (i > 0) pdf.addPage();
    pdf.setFontSize(16); pdf.text(title, 105, 16, { align: "center" });
    if (svgEls.length > 1) { pdf.setFontSize(11); pdf.text(`Étape ${i + 1} / ${svgEls.length}`, 105, 23, { align: "center" }); }
    const c = await svgToCanvas(svgEls[i]);
    pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 60, 28, 90, 180);
    const note = data.frames[i]?.note;
    if (note) { pdf.setFontSize(11); pdf.text(pdf.splitTextToSize(note, 170), 20, 218); }
    pdf.setFontSize(8); pdf.setTextColor(150); pdf.text("Padel Coach Hub", 105, 290, { align: "center" }); pdf.setTextColor(0);
  }
  pdf.save(`${safe(title)}.pdf`);
}
