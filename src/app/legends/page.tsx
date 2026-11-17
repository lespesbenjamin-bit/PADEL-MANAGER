"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlayerLegendsView, type LegendsTab } from "@/components/Legends";
import { ErrorBox, PageHeader, Spinner, errMsg, useToast } from "@/components/ui";
import { useAsync } from "@/lib/hooks";
import * as L from "@/lib/legends";

export default function LegendsPage() {
  return <Suspense fallback={<Spinner />}><Legends /></Suspense>;
}

function Legends() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const tab = (params.get("tab") as LegendsTab) || "home";
  const { data, error, loading, reload } = useAsync(() => L.getPlayerSpace(), []);
  return (
    <div>
      <PageHeader title="Padel Legends" subtitle="Ta progression, tes mascottes et tes badges" />
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : data && (
        <PlayerLegendsView space={data} tab={tab} onTab={(t) => router.replace(t === "home" ? "/legends" : `/legends?tab=${t}`, { scroll: false })}
          onToggleHidden={async (v) => {
            try { await L.setHidden(v); toast(v ? "Tu n'apparais plus dans les classements des joueurs" : "Tu apparais de nouveau dans les classements"); reload(); }
            catch (e) { toast(errMsg(e), "err"); }
          }} />
      )}
    </div>
  );
}
