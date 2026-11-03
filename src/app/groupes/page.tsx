"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { WEEKDAYS } from "@/lib/dates";
import { GroupCard } from "@/components/GroupCard";
import { GroupFormModal } from "@/components/forms";
import { Button, Empty, ErrorBox, PageHeader, Section, Segmented, Spinner } from "@/components/ui";

export default function GroupsPage() {
  const router = useRouter();
  const [view, setView] = useState<"active" | "suspended" | "archived">("active");
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useAsync(() => api.getGroups(true), []);

  const byDay = useMemo(() => {
    const list = (data ?? []).filter((g) => g.status === view);
    return WEEKDAYS.map((d, i) => ({ day: d, groups: list.filter((g) => g.weekday === i + 1) })).filter((x) => x.groups.length);
  }, [data, view]);

  const count = (s: string) => (data ?? []).filter((g) => g.status === s).length;

  return (
    <>
      <PageHeader title="Mes groupes" subtitle={`${count("active")} groupe${count("active") > 1 ? "s" : ""} actif${count("active") > 1 ? "s" : ""}`}
        actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Nouveau groupe</Button>} />
      <div className="mb-5">
        <Segmented value={view} onChange={setView} options={[
          { value: "active", label: `Actifs (${count("active")})` },
          { value: "suspended", label: `Suspendus (${count("suspended")})` },
          { value: "archived", label: `Archivés (${count("archived")})` },
        ]} />
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> :
        byDay.length === 0 ? <Empty action={view === "active" ? <Button onClick={() => setCreating(true)}>Créer un groupe</Button> : undefined}>Aucun groupe dans cette catégorie.</Empty> :
          byDay.map((d) => (
            <Section key={d.day} title={d.day}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{d.groups.map((g) => <GroupCard key={g.id} g={g} />)}</div>
            </Section>
          ))}
      <GroupFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => router.push(`/groupes/${id}`)} />
    </>
  );
}
