"use client";
import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { useIsCoach } from "@/lib/role";
import { Button, Card } from "./ui";

/** Module prévu mais pas encore développé : aucune donnée fictive, juste ce qui arrive. */
export function ComingSoon({ icon: Icon, title, step, coach, player }: {
  icon: LucideIcon; title: string; step: number; coach: string[]; player?: string[];
}) {
  const isCoach = useIsCoach();
  const items = isCoach ? coach : (player ?? coach);
  return (
    <div className="mx-auto max-w-2xl">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-violet-600 to-violet-500 px-6 py-8 text-white">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-white/15"><Icon className="size-6" /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-violet-100">Module en cours de développement · étape {step} du projet</p>
        </div>
        <div className="p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Ce qui arrive</h2>
          <ul className="space-y-2">
            {items.map((t) => (
              <li key={t} className="flex gap-2.5 text-sm text-slate-700"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-500" />{t}</li>
            ))}
          </ul>
          <Link href="/" className="mt-6 inline-block"><Button variant="secondary">Retour à l&apos;accueil</Button></Link>
        </div>
      </Card>
    </div>
  );
}
