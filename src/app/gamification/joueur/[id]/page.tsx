"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Gift } from "lucide-react";
import { PlayerLegendsView, type LegendsTab } from "@/components/Legends";
import { Button, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { ManualXpModal } from "@/components/LegendsCoach";
import { useAsync } from "@/lib/hooks";
import * as L from "@/lib/legends";

export default function CoachPlayerLegends() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<LegendsTab>("home");
  const [manual, setManual] = useState(false);
  const { data, error, loading, reload } = useAsync(() => L.getPlayerSpace(id), [id]);
  return (
    <div>
      <Link href="/gamification" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft className="size-4" /> Gamification</Link>
      <PageHeader title={data ? `Padel Legends · ${data.player.name}` : "Padel Legends"}
        subtitle={<Link href={`/joueurs/${id}`} className="text-violet-600">Fiche joueur & crédits</Link>}
        actions={<Button variant="secondary" onClick={() => setManual(true)}><Gift className="size-4" /> Bonus / correction</Button>} />
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : data && (
        <PlayerLegendsView space={data} tab={tab} onTab={setTab} coachMode />
      )}
      {data && <ManualXpModal open={manual} onClose={() => setManual(false)} playerId={id} name={data.player.name} onDone={reload} />}
    </div>
  );
}

