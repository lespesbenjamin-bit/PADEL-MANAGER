"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import * as hub from "@/lib/hub";
import { cx } from "./ui";

/** Sélecteur de photos (aperçu local, envoi au moment de la validation) */
export function PhotoPicker({ files, onChange, max = 6 }: { files: File[]; onChange: (f: File[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return (
    <div className="flex flex-wrap gap-2">
      {previews.map((u, i) => (
        <div key={u} className="relative size-20 overflow-hidden rounded-xl ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="size-full object-cover" />
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label="Retirer"
            className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-slate-900/70 text-white"><X className="size-3" /></button>
        </div>
      ))}
      {files.length < max && (
        <button type="button" onClick={() => input.current?.click()}
          className="grid size-20 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-violet-400 hover:text-violet-600">
          <ImagePlus className="size-6" />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" multiple hidden
        onChange={(e) => { onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, max)); e.target.value = ""; }} />
    </div>
  );
}

/** Affiche des photos privées (liens temporaires signés) */
export function PhotoGrid({ paths, className }: { paths: string[]; className?: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!paths.length) return;
    hub.signedUrls(paths).then(setUrls).catch(() => setUrls({}));
  }, [paths]);
  if (!paths.length) return null;
  return (
    <>
      <div className={cx("grid gap-1 overflow-hidden rounded-xl", paths.length === 1 ? "grid-cols-1" : "grid-cols-2", className)}>
        {paths.slice(0, 4).map((p, i) => (
          <button key={p} type="button" onClick={() => urls[p] && setOpen(urls[p])}
            className={cx("relative bg-slate-100", paths.length === 1 ? "aspect-[4/3]" : "aspect-square", paths.length === 3 && i === 0 && "row-span-2 aspect-auto")}>
            {urls[p] && /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[p]} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
            {i === 3 && paths.length > 4 && <span className="absolute inset-0 grid place-items-center bg-slate-900/50 text-lg font-semibold text-white">+{paths.length - 4}</span>}
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/90 p-4" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </>
  );
}
