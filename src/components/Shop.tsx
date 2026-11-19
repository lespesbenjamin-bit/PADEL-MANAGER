"use client";
/* SHOP & PADEL COINS – espace joueur */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Lock, PackageCheck, ShoppingBag, Sparkles, Star } from "lucide-react";
import * as S from "@/lib/shop";
import { signedUrls } from "@/lib/hub";
import { displayedCardLevel, getPlayerSpace } from "@/lib/legends";
import { LegendCard } from "./LegendCard";
import { useAsync, useOpKey } from "@/lib/hooks";
import { fmtDate, timeAgo } from "@/lib/dates";
import { Badge, Button, Card, cx, Empty, errMsg, ErrorBox, Modal, Segmented, Select, Spinner, useToast } from "./ui";

export type ShopTab = "shop" | "wallet" | "orders";

/* Carte Padel Legends du joueur (favorite ou actuelle) : purement visuelle, sans lien avec les Coins */
function MyLegendCard() {
  const { data } = useAsync(() => getPlayerSpace().catch(() => null), []);
  if (!data?.profile) return null;
  const lv = displayedCardLevel(data.profile.level, data.profile.favorite_level);
  const card = data.levels.find((l) => l.level === lv);
  return card ? <Link href="/legends" title={card.status}><LegendCard card={card} size="xs" prestige={data.profile.prestige} /></Link> : null;
}

/* Petite pièce (icône maison, couleurs de l'appli) */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <span className={cx("inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 font-bold text-amber-950 ring-1 ring-amber-600/30", className ?? "size-5 text-[10px]")} aria-hidden>
      C
    </span>
  );
}
export function CoinAmount({ value, className }: { value: number; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 font-semibold tabular-nums", className)}><CoinIcon />{value.toLocaleString("fr-FR")}</span>;
}

/* Image produit (photo du coach ou visuel provisoire) */
export function ProductImage({ path, category, className }: { path: string | null; category: S.ProductCategory; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; if (path) signedUrls([path]).then((m) => on && setUrl(m[path] ?? null)).catch(() => {}); return () => { on = false; }; }, [path]);
  return (
    <div className={cx("grid place-items-center overflow-hidden bg-gradient-to-br from-violet-50 via-white to-amber-50", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <span className="text-5xl" aria-hidden>{S.CATEGORY_EMOJI[category]}</span>}
    </div>
  );
}

/* Animation discrète lorsqu'un joueur a gagné des Coins depuis sa dernière visite */
function useCoinGain(playerId: string | undefined, earned: number | undefined) {
  const [gain, setGain] = useState(0);
  useEffect(() => {
    if (!playerId || earned == null) return;
    const key = `pch-coins-seen-${playerId}`;
    let seen: number | null = null;
    try { const v = localStorage.getItem(key); seen = v == null ? null : Number(v); localStorage.setItem(key, String(earned)); } catch { /* stockage indisponible */ }
    if (seen != null && earned > seen) setGain(earned - seen);
  }, [playerId, earned]);
  return gain;
}

export function WalletCard({ space, compact }: { space: S.ShopSpace; compact?: boolean }) {
  const w = space.wallet;
  const gain = useCoinGain(space.player.id, w.earned);
  const next = useMemo(() => nextReward(space), [space]);
  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-violet-600 to-violet-950 p-5 text-white ring-violet-600">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-100">Mes Padel Coins</div>
          <div className="mt-1 flex items-center gap-2 text-4xl font-bold tabular-nums">
            <CoinIcon className={cx("size-9 text-base", gain > 0 && "pch-coin-shine")} />{w.balance.toLocaleString("fr-FR")}
          </div>
          {gain > 0 && <div className="pch-coin-pop absolute left-28 top-6 rounded-full bg-amber-300 px-2 py-0.5 text-sm font-bold text-amber-950">+{gain}</div>}
        </div>
        {compact ? <Link href="/shop" className="rounded-xl bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25">Boutique →</Link> : <MyLegendCard />}
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-white/10 p-2"><div className="text-base font-semibold tabular-nums">{w.earned}</div>gagnés</div>
          <div className="rounded-xl bg-white/10 p-2"><div className="text-base font-semibold tabular-nums">{w.spent}</div>dépensés</div>
          <div className="rounded-xl bg-white/10 p-2"><div className="text-base font-semibold tabular-nums">{w.pending}</div>en commande</div>
        </div>
      )}
      {next && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-violet-100">
            <span>Prochaine récompense : <b className="text-white">{next.product.name}</b></span>
            <span className="tabular-nums">{Math.min(w.balance, next.product.price_coins)}/{next.product.price_coins}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${Math.max(3, Math.min(100, (w.balance / next.product.price_coins) * 100))}%` }} />
          </div>
          {next.sessions != null && next.missing > 0 && <div className="mt-1 text-xs text-violet-100">Encore {next.missing} Coins, soit environ {next.sessions} séance{next.sessions > 1 ? "s" : ""}.</div>}
          {next.missing <= 0 && <div className="mt-1 text-xs font-medium text-amber-200">Tu peux te l&apos;offrir dès maintenant !</div>}
        </div>
      )}
    </Card>
  );
}

function nextReward(space: S.ShopSpace) {
  const ok = space.products.filter((p) => p.in_stock && (!p.min_level || space.player.level >= p.min_level)).sort((a, b) => a.price_coins - b.price_coins);
  const product = ok.find((p) => p.price_coins > space.wallet.balance) ?? ok[ok.length - 1];
  if (!product) return null;
  const missing = product.price_coins - space.wallet.balance;
  const avg = space.avg_coins_per_session;
  return { product, missing, sessions: avg && avg > 0 && missing > 0 ? Math.ceil(missing / avg) : null };
}

/* ------------------------------ Page joueur ------------------------------ */
export function PlayerShop({ tab, onTab }: { tab: ShopTab; onTab: (t: ShopTab) => void }) {
  const { data, error, loading, reload } = useAsync(() => S.getShopSpace(), []);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.enabled) return (
    <Card className="p-6 text-center">
      <ShoppingBag className="mx-auto mb-2 size-8 text-violet-500" />
      <div className="font-semibold">La boutique ouvre bientôt</div>
      <p className="text-sm text-slate-500">Ton coach prépare les récompenses. Tes Padel Coins seront gagnés sur tes séances payées et validées.</p>
    </Card>
  );
  return (
    <div className="space-y-4">
      <WalletCard space={data} />
      <Segmented value={tab} onChange={onTab} options={[
        { value: "shop", label: "Boutique" }, { value: "wallet", label: "Historique" },
        { value: "orders", label: <span>Commandes{data.orders.some((o) => ["pending", "validated", "ready"].includes(o.status)) && <span className="ml-1 inline-block size-2 rounded-full bg-amber-500" />}</span> },
      ]} />
      {tab === "shop" && <Catalog space={data} onOrdered={() => { reload(); onTab("orders"); }} />}
      {tab === "wallet" && <CoinHistory items={data.history} space={data} />}
      {tab === "orders" && <MyOrders orders={data.orders} onChange={reload} />}
    </div>
  );
}

function Catalog({ space, onOrdered }: { space: S.ShopSpace; onOrdered: () => void }) {
  const [cat, setCat] = useState<S.ProductCategory | "all">("all");
  const [onlyAffordable, setOnlyAffordable] = useState(false);
  const [open, setOpen] = useState<S.PlayerProduct | null>(null);
  const cats = Array.from(new Set(space.products.map((p) => p.category)));
  const list = space.products.filter((p) => (cat === "all" || p.category === cat) && (!onlyAffordable || p.price_coins <= space.wallet.balance));
  const amb = list.filter((p) => p.is_ambassador);
  const rest = list.filter((p) => !p.is_ambassador);
  if (space.products.length === 0) return <Empty>Aucune récompense pour l&apos;instant.</Empty>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...cats] as const).map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cx("rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition",
            cat === c ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>
            {c === "all" ? "Tout" : `${S.CATEGORY_EMOJI[c]} ${S.CATEGORY_LABEL[c]}`}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" className="accent-violet-600" checked={onlyAffordable} onChange={(e) => setOnlyAffordable(e.target.checked)} /> Accessibles maintenant
        </label>
      </div>
      {amb.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600"><Star className="size-3.5" /> Collection ambassadeur</h3>
          <div className="grid gap-3 sm:grid-cols-2">{amb.map((p) => <ProductCard key={p.id} p={p} space={space} onOpen={() => setOpen(p)} featured />)}</div>
        </div>
      )}
      {rest.length > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{rest.map((p) => <ProductCard key={p.id} p={p} space={space} onOpen={() => setOpen(p)} />)}</div>}
      {list.length === 0 && <Empty>Aucun produit dans ce filtre.</Empty>}
      {open && <OrderModal p={open} space={space} onClose={() => setOpen(null)} onDone={onOrdered} />}
    </div>
  );
}

function lockReason(p: S.PlayerProduct, space: S.ShopSpace) {
  if (p.min_level && space.player.level < p.min_level) return `Niveau ${p.min_level} requis`;
  if (!p.in_stock) return "Épuisé";
  return null;
}

function ProductCard({ p, space, onOpen, featured }: { p: S.PlayerProduct; space: S.ShopSpace; onOpen: () => void; featured?: boolean }) {
  const lock = lockReason(p, space);
  const afford = space.wallet.balance >= p.price_coins;
  const r = S.RARITY_STYLE[p.rarity];
  return (
    <button type="button" onClick={onOpen} className={cx("group flex overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 transition hover:-translate-y-0.5",
      featured ? "flex-row ring-2 ring-amber-300" : "flex-col", r.ring)}>
      <ProductImage path={p.image_path} category={p.category} className={featured ? "w-32 shrink-0" : "aspect-square w-full"} />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap gap-1">
          <Badge className={r.cls}>{r.label}</Badge>
          {p.is_ambassador && <Badge className="bg-amber-400 text-amber-950 ring-amber-500"><Sparkles className="size-3" /> Ambassadeur</Badge>}
        </div>
        <div className="font-semibold leading-tight text-slate-900">{p.name}</div>
        {featured && p.description && <p className="line-clamp-2 text-xs text-slate-500">{p.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <CoinAmount value={p.price_coins} className={afford ? "text-violet-700" : "text-slate-500"} />
          {lock ? <span className="flex items-center gap-1 text-xs text-slate-500"><Lock className="size-3" />{lock}</span>
            : afford ? <span className="text-xs font-medium text-emerald-600">Accessible</span> : <span className="text-xs text-slate-400">encore {p.price_coins - space.wallet.balance}</span>}
        </div>
      </div>
    </button>
  );
}

function OrderModal({ p, space, onClose, onDone }: { p: S.PlayerProduct; space: S.ShopSpace; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const op = useOpKey();
  const [variant, setVariant] = useState(p.variants.find((v) => v.in_stock)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const lock = lockReason(p, space);
  const afford = space.wallet.balance >= p.price_coins;
  return (
    <Modal open onClose={onClose} title={p.name} footer={<>
      <Button variant="ghost" onClick={onClose}>Fermer</Button>
      <Button loading={busy} disabled={!!lock || !afford || (p.variants.length > 0 && !variant)} onClick={async () => {
        setBusy(true);
        try {
          const r = await S.placeOrder(op.get(), p.id, variant || null);
          toast(`Commande envoyée à ton coach · solde ${r.balance} Coins`); onDone(); onClose();
        } catch (e) { toast(errMsg(e), "err"); op.renew(); } finally { setBusy(false); }
      }}><ShoppingBag className="size-4" /> Commander pour {p.price_coins} Coins</Button>
    </>}>
      <div className="space-y-3">
        <ProductImage path={p.image_path} category={p.category} className="aspect-video w-full rounded-xl" />
        {p.description && <p className="text-sm text-slate-600">{p.description}</p>}
        {p.variants.length > 0 && (
          <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Option</span>
            <Select value={variant} onChange={(e) => setVariant(e.target.value)}>
              <option value="">Choisir…</option>
              {p.variants.map((v) => <option key={v.id} value={v.id} disabled={!v.in_stock}>{v.label}{!v.in_stock ? " (épuisé)" : ""}</option>)}
            </Select></label>
        )}
        <Card className="bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span>Ton solde</span><CoinAmount value={space.wallet.balance} /></div>
          <div className="flex justify-between"><span>Prix</span><CoinAmount value={p.price_coins} /></div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-medium"><span>Après commande</span>
            <span className={afford ? "text-slate-900" : "text-rose-600"}>{space.wallet.balance - p.price_coins} Coins</span></div>
        </Card>
        {lock && <p className="text-sm text-amber-700">{lock}</p>}
        {!afford && !lock && <p className="text-sm text-slate-500">Il te manque {p.price_coins - space.wallet.balance} Coins.</p>}
        <p className="text-xs text-slate-500">Les Coins sont réservés tout de suite. Ton coach valide puis te remet la récompense ; s&apos;il annule, tes Coins te sont rendus. Les Coins ne sont ni échangeables contre de l&apos;argent ni transférables.</p>
      </div>
    </Modal>
  );
}

function CoinHistory({ items, space }: { items: S.CoinTx[]; space: S.ShopSpace }) {
  if (!items.length) return <Empty>Pas encore de Coins. Ils arrivent quand une séance payée (forfait) est validée par ton coach et que tu étais présent.</Empty>;
  return (
    <div className="space-y-2">
      <Card className="divide-y divide-slate-100 px-4">
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-3 py-2.5">
            <div className="w-14 shrink-0 pt-0.5 text-xs text-slate-500">{fmtDate(t.created_at.slice(0, 10), "d MMM")}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-800">{t.label}</div>
              <div className="text-xs text-slate-500">{S.KIND_LABEL[t.kind]}{t.reason && ` · ${t.reason}`}</div>
            </div>
            <div className={cx("shrink-0 font-semibold tabular-nums", t.coins >= 0 ? "text-emerald-600" : "text-rose-600")}>{t.coins > 0 ? "+" : ""}{t.coins}</div>
          </div>
        ))}
      </Card>
      <p className="text-xs text-slate-500">1 Coin = {S.euro(space.coin_value)} de valeur de référence. Tu gagnes des Coins sur les séances payées et réellement suivies ; une absence ou une séance offerte n&apos;en rapporte pas.</p>
    </div>
  );
}

function MyOrders({ orders, onChange }: { orders: S.PlayerOrder[]; onChange: () => void }) {
  const toast = useToast();
  const op = useOpKey();
  if (!orders.length) return <Empty>Aucune commande pour l&apos;instant.</Empty>;
  const delivered = orders.filter((o) => o.status === "delivered");
  return (
    <div className="space-y-3">
      <Card className="divide-y divide-slate-100">
        {orders.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">{o.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""}`).join(", ")}</div>
              <div className="text-xs text-slate-500">{timeAgo(o.created_at)}{o.cancel_reason && ` · ${o.cancel_reason}`}</div>
            </div>
            <CoinAmount value={o.total_coins} className="text-slate-700" />
            <Badge className={S.ORDER_STATUS[o.status].cls}>{S.ORDER_STATUS[o.status].label}</Badge>
            {o.status === "pending" && (
              <Button size="sm" variant="ghost" onClick={async () => {
                if (!window.confirm("Annuler cette commande ? Tes Coins te seront rendus.")) return;
                try { await S.updateOrder(op.get(), o.id, "cancelled", "Annulée par le joueur"); op.renew(); toast("Commande annulée, Coins restitués"); onChange(); }
                catch (e) { toast(errMsg(e), "err"); op.renew(); }
              }}>Annuler</Button>
            )}
          </div>
        ))}
      </Card>
      {delivered.length > 0 && <p className="flex items-center gap-1.5 text-sm text-emerald-700"><PackageCheck className="size-4" /> {delivered.length} récompense{delivered.length > 1 ? "s" : ""} obtenue{delivered.length > 1 ? "s" : ""}</p>}
    </div>
  );
}

/* Résumé pour « Mon espace » */
export function WalletSummary() {
  const { data } = useAsync(() => S.getShopSpace().catch(() => null), []);
  if (!data?.enabled) return null;
  return <WalletCard space={data} compact />;
}

