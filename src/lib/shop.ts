/* SHOP & PADEL COINS – types, appels serveur et calculs (miroir exact des formules SQL) */
import { check, rpc } from "./api";
import { supabase } from "./supabase";

export type ProductCategory = "equipement" | "textile" | "numerique" | "evenement" | "autre";
export type ProductRarity = "commun" | "rare" | "epique" | "legendaire";
export type OrderStatus = "pending" | "validated" | "ready" | "delivered" | "cancelled";
export type CoinKind = "earn" | "earn_reversal" | "order" | "order_refund" | "adjust";

export interface LoyaltySettings {
  enabled: boolean; start_date: string | null; coin_value: number; rate_cap_pct: number; rate_pct: number; urssaf_pct: number;
  court_cost_per_hour: number; court_split: "present" | "capacity"; other_cost_per_session: number; other_cost_per_player: number;
  safety_margin_pct: number; budget_alert_eur: number; max_pending_orders: number; manual_max_coins: number;
}
export interface PlayerProduct {
  id: string; name: string; description: string | null; category: ProductCategory; image_path: string | null; price_coins: number;
  rarity: ProductRarity; is_ambassador: boolean; min_level: number | null; in_stock: boolean; variants: { id: string; label: string; in_stock: boolean }[];
}
export interface CoinTx { id: string; kind: CoinKind; coins: number; label: string; reason: string | null; created_at: string; order_id: string | null; paid?: string | null }
export interface PlayerOrder {
  id: string; status: OrderStatus; total_coins: number; created_at: string; delivered_at: string | null; cancel_reason: string | null;
  items: { name: string; variant: string | null; qty: number; product_id: string | null }[];
}
export interface ShopSpace {
  player: { id: string; name: string; level: number };
  enabled: boolean; coin_value: number;
  wallet: { balance: number; earned: number; spent: number; pending: number };
  history: CoinTx[]; avg_coins_per_session: number | null; products: PlayerProduct[]; orders: PlayerOrder[];
}
export interface AdminProduct {
  id: string; name: string; description: string | null; category: ProductCategory; image_path: string | null; price_coins: number;
  unit_cost: number; extra_cost: number; commercial_value: number | null; rarity: ProductRarity; is_ambassador: boolean; min_level: number | null;
  stock: number | null; low_stock_threshold: number; active: boolean; sort: number; delivered_qty: number;
  variants: { id: string; label: string; stock: number | null; active: boolean; sort: number }[];
}
export interface AdminOrder {
  id: string; status: OrderStatus; total_coins: number; total_cost: number; created_at: string; delivered_at: string | null; cancel_reason: string | null;
  player_id: string; player: string; items: { name: string; variant: string | null; qty: number }[];
}
export interface ShopOverview {
  settings: LoyaltySettings;
  kpis: {
    coins_issued: number; coins_spent: number; coins_circulation: number; circulation_value: number; budget_generated: number;
    delivered_cost: number; committed_cost: number; budget_remaining: number; paid_sessions: number; avg_coins_per_session: number | null;
    negative_wallets: number; pending_orders: number;
  };
  orders: AdminOrder[];
  products: AdminProduct[];
  wallets: { player_id: string; name: string; balance: number; earned: number; spent: number }[];
  ledger: { id: string; kind: CoinKind; coins: number; label: string; reason: string | null; euro_budget: number; details: Record<string, number | string>; created_at: string; player: string }[];
  group_costs: { group_id: string; name: string; capacity: number; start_time: string; end_time: string; court_cost_per_hour: number | null; other_cost_per_session: number | null }[];
  package_prices: { without_price: number; avg_session_price: number | null };
  audit: { action: string; details: Record<string, unknown>; reason: string | null; created_at: string; player: string | null }[];
}

/* ------------------------------ Appels serveur ------------------------------ */
export const getShopSpace = (playerId?: string) => rpc<ShopSpace>("shop_player_space", playerId ? { p_player: playerId } : {});
export const placeOrder = (op: string, productId: string, variantId: string | null, qty = 1) =>
  rpc<{ order_id: string; balance: number }>("shop_place_order", { p_op: op, p_product: productId, p_variant: variantId, p_qty: qty });
export const updateOrder = (op: string, orderId: string, status: OrderStatus, reason?: string) =>
  rpc("shop_update_order", { p_op: op, p_order: orderId, p_status: status, p_reason: reason ?? null });
export const getShopOverview = () => rpc<ShopOverview>("shop_coach_overview", {});
export const saveSettings = (p: Partial<LoyaltySettings>) => rpc("shop_save_settings", { p });
export const saveGroupCost = (groupId: string, court: number | null, other: number | null) =>
  rpc("shop_save_group_cost", { p_group: groupId, p_court: court, p_other: other });
export const adjustCoins = (op: string, playerId: string, coins: number, reason: string) =>
  rpc("shop_adjust_coins", { p_op: op, p_player: playerId, p_coins: coins, p_reason: reason });
export const verifyBalances = () => rpc<{ wallets_fixed: number; coins_delta: number; negative_wallets: number }>("shop_verify", {});
export const addStarterProducts = () => rpc<number>("shop_add_starter_products", {});

type ProductInput = Omit<AdminProduct, "id" | "delivered_qty" | "variants">;
export async function saveProduct(id: string | null, p: Partial<ProductInput>): Promise<string> {
  if (id) { check(await supabase().from("shop_products").update(p).eq("id", id)); return id; }
  const row = check(await supabase().from("shop_products").insert(p).select("id").single()) as { id: string };
  return row.id;
}
export async function deleteProduct(id: string) { return check(await supabase().from("shop_products").delete().eq("id", id)); }
export async function saveVariant(productId: string, v: { id?: string; label: string; stock: number | null; active: boolean; sort: number }) {
  if (v.id) return check(await supabase().from("shop_product_variants").update({ label: v.label, stock: v.stock, active: v.active, sort: v.sort }).eq("id", v.id));
  return check(await supabase().from("shop_product_variants").insert({ product_id: productId, label: v.label, stock: v.stock, active: v.active, sort: v.sort }));
}
export async function deleteVariant(id: string) { return check(await supabase().from("shop_product_variants").delete().eq("id", id)); }

/* ------------------------------ Formules ------------------------------ */
/** Coins gagnés pour une séance payée (même calcul que le serveur) */
export function simulateCoins(s: LoyaltySettings, o: { paid: number; durationH: number; players: number; courtPerHour?: number | null; otherPerSession?: number | null }) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const n = Math.max(1, o.players);
  const urssaf = r2(o.paid * s.urssaf_pct / 100);
  const court = r2((o.courtPerHour ?? s.court_cost_per_hour) * o.durationH / n);
  const other = r2((o.otherPerSession ?? s.other_cost_per_session) / n + Number(s.other_cost_per_player));
  const available = o.paid - urssaf - court - other;
  const budget = Math.max(0, Math.round(available * s.rate_pct / 100 * 10000) / 10000);
  return { urssaf, court, other, available: r2(available), budget, coins: Math.floor(budget / s.coin_value + 1e-9) };
}
/** Prix minimum en Coins pour couvrir le coût complet (+ marge de sécurité) */
export function suggestPrice(s: Pick<LoyaltySettings, "coin_value" | "safety_margin_pct">, unitCost: number, extraCost: number) {
  const full = Number(unitCost) + Number(extraCost);
  const min = Math.ceil(full / s.coin_value - 1e-9);
  const suggested = Math.ceil((full * (1 + s.safety_margin_pct / 100)) / s.coin_value - 1e-9);
  return { full, min, suggested };
}

/* ------------------------------ Présentation ------------------------------ */
export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  equipement: "Équipement", textile: "Textile", numerique: "Numérique", evenement: "Événement", autre: "Autre",
};
export const CATEGORY_EMOJI: Record<ProductCategory, string> = { equipement: "🎾", textile: "👕", numerique: "🎬", evenement: "🎟️", autre: "🎁" };
export const RARITY_STYLE: Record<ProductRarity, { label: string; cls: string; ring: string }> = {
  commun: { label: "Commun", cls: "bg-slate-100 text-slate-600 ring-slate-200", ring: "ring-slate-200" },
  rare: { label: "Rare", cls: "bg-sky-50 text-sky-700 ring-sky-200", ring: "ring-sky-300" },
  epique: { label: "Épique", cls: "bg-violet-50 text-violet-700 ring-violet-200", ring: "ring-violet-400" },
  legendaire: { label: "Légendaire", cls: "bg-amber-50 text-amber-700 ring-amber-300", ring: "ring-amber-400" },
};
export const ORDER_STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  validated: { label: "Validée", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  ready: { label: "Prête à remettre", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  delivered: { label: "Remise", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  cancelled: { label: "Annulée", cls: "bg-slate-100 text-slate-500 ring-slate-200" },
};
export const KIND_LABEL: Record<CoinKind, string> = {
  earn: "Séance payée", earn_reversal: "Correction", order: "Commande", order_refund: "Remboursement", adjust: "Ajustement coach",
};
export const AUDIT_LABEL: Record<string, string> = {
  order_placed: "Commande passée", order_validated: "Commande validée", order_ready: "Commande prête", order_delivered: "Commande remise",
  order_cancelled: "Commande annulée", coins_adjusted: "Coins ajustés", settings_updated: "Réglages modifiés", verified: "Vérification des soldes",
  group_cost_updated: "Coût de groupe modifié",
};
export const euro = (n: number | string | null | undefined) =>
  `${Number(n ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
