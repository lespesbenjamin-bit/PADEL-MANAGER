"use client";
import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import * as hub from "@/lib/hub";
import { fmtDateTime } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { CourtView } from "@/components/court/Court";
import { Button, Card, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";

export default function DiagramsPage() {
  const { data, error, loading, reload } = useAsync(() => hub.getDiagrams(), []);
  return (
    <>
      <PageHeader title="Schémas tactiques" subtitle="Éditeur de terrain : joueurs, trajectoires, déplacements, zones, séquences"
        actions={<Link href="/schemas/nouveau"><Button><Plus className="size-4" /> Nouveau schéma</Button></Link>} />
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data?.length ? (
        <Empty action={<Link href="/schemas/nouveau"><Button>Dessiner mon premier schéma</Button></Link>}>Aucun schéma pour l&apos;instant.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((d) => (
            <Link key={d.id} href={`/schemas/${d.id}`}>
              <Card className="h-full p-3 transition hover:-translate-y-0.5 hover:shadow-md">
                <CourtView data={d.data} compact className="pointer-events-none" />
                <div className="mt-2 truncate text-sm font-semibold">{d.title}</div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{fmtDateTime(d.updated_at).slice(0, 10)}</span>
                  {d.data.frames.length > 1 && <span className="inline-flex items-center gap-0.5"><Layers className="size-3" />{d.data.frames.length} étapes</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
