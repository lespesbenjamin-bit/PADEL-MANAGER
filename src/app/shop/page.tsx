"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlayerShop, type ShopTab } from "@/components/Shop";
import { ShopAdmin, type AdminTab } from "@/components/ShopAdmin";
import { PageHeader, Spinner } from "@/components/ui";
import { useIsCoach } from "@/lib/role";

export default function ShopPage() {
  return <Suspense fallback={<Spinner />}><Shop /></Suspense>;
}

function Shop() {
  const coach = useIsCoach();
  const params = useSearchParams();
  const router = useRouter();
  const go = (t: string, def: string) => router.replace(t === def ? "/shop" : `/shop?tab=${t}`, { scroll: false });
  if (coach) {
    const tab = (params.get("tab") as AdminTab) || "dashboard";
    return (
      <div>
        <PageHeader title="Shop & Padel Coins" subtitle="Boutique de fidélité · budget maîtrisé, Coins gagnés sur les séances payées" />
        <ShopAdmin tab={tab} onTab={(t) => go(t, "dashboard")} />
      </div>
    );
  }
  const raw = params.get("tab");
  const tab: ShopTab = raw === "wallet" || raw === "orders" ? raw : "shop";
  return (
    <div>
      <PageHeader title="Shop" subtitle="Échange tes Padel Coins contre des récompenses" />
      <PlayerShop tab={tab} onTab={(t) => go(t, "shop")} />
    </div>
  );
}
