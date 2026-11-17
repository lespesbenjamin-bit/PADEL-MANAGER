"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Share2 } from "lucide-react";
import { PlayerLegendsView, UnlockOverlay, type LegendsTab } from "@/components/Legends";
import { Button, Card, ErrorBox, PageHeader, Spinner, errMsg, useToast } from "@/components/ui";
import { useAsync } from "@/lib/hooks";
import * as L from "@/lib/legends";

export default function LegendsPage() {
  return <Suspense fallback={<Spinner />}><Legends /></Suspense>;
}

function Legends() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const raw = params.get("tab");
  const tab: LegendsTab = raw === "collection" || raw === "badges" || raw === "history" || raw === "ranking" ? raw : "home";
  const { data, error, loading, reload } = useAsync(() => L.getPlayerSpace(), []);
  const [dismissed, setDismissed] = useState(false);
  const p = data?.profile;
  const card = data && p ? data.levels.find((l) => l.level === p.level) : undefined;
  const showUnlock = !!(card && p && !dismissed && (p.last_seen_level ?? 0) < p.level);
  const canShare = !!(p && (p.last_shared_level ?? 0) < p.level);

  const share = async () => {
    if (!p) return;
    try { await L.shareCard(p.level, true); await L.markSeen(p.level); toast("Publié sur le fil d'actualité 🃏"); setDismissed(true); reload(); }
    catch (e) { toast(errMsg(e), "err"); }
  };
  return (
    <div>
      <PageHeader title="Padel Legends" subtitle="La collection des 20 · ta progression, tes cartes et tes badges" />
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : data && (
        <>
          {canShare && !showUnlock && card && (
            <Card className="mb-4 flex flex-wrap items-center gap-3 bg-violet-50 p-3 ring-violet-200">
              <span className="flex-1 text-sm text-violet-900">Tu as débloqué <b>{card.status}</b>. Le partager avec le groupe ?</span>
              <Button size="sm" onClick={share}><Share2 className="size-4" /> Publier</Button>
              <Button size="sm" variant="ghost" onClick={async () => { await L.shareCard(card.level, false).catch(() => {}); reload(); }}>Non merci</Button>
            </Card>
          )}
          <PlayerLegendsView space={data} tab={tab} onTab={(t) => router.replace(t === "home" ? "/legends" : `/legends?tab=${t}`, { scroll: false })}
            onFavorite={async (level) => {
              try { await L.setFavorite(level); toast(level ? "Carte favorite affichée sur ton profil" : "Ta carte actuelle est de nouveau affichée"); reload(); }
              catch (e) { toast(errMsg(e), "err"); }
            }}
            onToggleHidden={async (v) => {
              try { await L.setHidden(v); toast(v ? "Tu n'apparais plus dans les classements des joueurs" : "Tu apparais de nouveau dans les classements"); reload(); }
              catch (e) { toast(errMsg(e), "err"); }
            }} />
          {showUnlock && card && (
            <UnlockOverlay card={card} prestige={p!.prestige} onShare={canShare ? share : undefined}
              onClose={async () => { setDismissed(true); await L.markSeen(card.level).catch(() => {}); reload(); }} />
          )}
        </>
      )}
    </div>
  );
}
