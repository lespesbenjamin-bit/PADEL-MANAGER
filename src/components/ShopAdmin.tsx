"use client";
/* SHOP & PADEL COINS – administration coach */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Calculator, Check, Gift, ImagePlus, PackageCheck, Plus, ShieldCheck, Trash2, Truck, X } from "lucide-react";
import * as S from "@/lib/shop";
import { uploadPhoto } from "@/lib/hub";
import { useAsync, useOpKey } from "@/lib/hooks";
import { useRole } from "@/lib/role";
import { fmtDate, timeAgo } from "@/lib/dates";
import { Badge, Button, Card, Checkbox, cx, Empty, errMsg, ErrorBox, Field, Input, Modal, Section, Segmented, Select, Spinner, StatTile, Textarea, useToast } from "./ui";
import { CoinAmount, ProductImage } from "./Shop";

export type AdminTab = "dashboard" | "orders" | "products" | "calculator" | "settings" | "ledger";

export function ShopAdmin({ tab, onTab }: { tab: AdminTab; onTab: (t: AdminTab) => void }) {
  const { data, error, loading, reload } = useAsync(() => S.getShopOverview(), []);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const open = data.orders.filter((o) => ["pending", "validated", "ready"].includes(o.status)).length;
  return (
    <div className="space-y-4">
      {!data.settings.enabled && (
        <Card className="flex flex-wrap items-center gap-3 bg-amber-50 p-4 ring-amber-200">
          <AlertTriangle className="size-5 text-amber-600" />
          <div className="flex-1 text-sm text-amber-900"><b>Boutique fermée.</b> Aucun Coin n&apos;est émis tant que tu ne l&apos;as pas ouverte. Renseigne d&apos;abord tes coûts (terrain, URSSAF) dans Réglages.</div>
          <Button size="sm" onClick={() => onTab("settings")}>Réglages</Button>
        </Card>
      )}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented value={tab} onChange={onTab} options={[
          { value: "dashboard", label: "Tableau de bord" },
          { value: "orders", label: <span>Commandes{open > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">{open}</span>}</span> },
          { value: "products", label: "Produits" }, { value: "calculator", label: "Calculateur" },
          { value: "settings", label: "Réglages" }, { value: "ledger", label: "Journal" },
        ]} />
      </div>
      {tab === "dashboard" && <Dashboard d={data} onTab={onTab} />}
      {tab === "orders" && <Orders d={data} onChange={reload} />}
      {tab === "products" && <Products d={data} onChange={reload} />}
      {tab === "calculator" && <CalculatorTab d={data} />}
      {tab === "settings" && <SettingsTab d={data} onChange={reload} />}
      {tab === "ledger" && <Ledger d={data} onChange={reload} />}
    </div>
  );
}

/* ------------------------------ Alertes ------------------------------ */
function alerts(d: S.ShopOverview) {
  const a: { tone: "warn" | "alert"; text: string }[] = [];
  const k = d.kpis, s = d.settings;
  if (k.budget_remaining < 0) a.push({ tone: "alert", text: `Budget fidélité dépassé de ${S.euro(-k.budget_remaining)} : les récompenses remises ou engagées coûtent plus que le budget généré.` });
  else if (s.enabled && k.budget_remaining <= s.budget_alert_eur) a.push({ tone: "warn", text: `Budget restant faible : ${S.euro(k.budget_remaining)} (seuil d'alerte ${S.euro(s.budget_alert_eur)}).` });
  if (k.circulation_value > Math.max(0, k.budget_remaining) + 0.01) a.push({ tone: "warn", text: `Les Coins en circulation valent ${S.euro(k.circulation_value)} (valeur de référence) pour ${S.euro(Math.max(0, k.budget_remaining))} de budget restant. La marge de sécurité sur tes prix couvre en principe cet écart.` });
  if (k.negative_wallets > 0) a.push({ tone: "alert", text: `${k.negative_wallets} portefeuille(s) négatif(s) après correction de séance : commandes bloquées jusqu'au retour à zéro.` });
  for (const p of d.products.filter((p) => p.active)) {
    if (p.variants.length) {
      for (const v of p.variants.filter((v) => v.active && v.stock != null && v.stock <= p.low_stock_threshold))
        a.push({ tone: v.stock === 0 ? "alert" : "warn", text: `Stock ${v.stock === 0 ? "épuisé" : "bas"} : ${p.name} (${v.label}) · ${v.stock}` });
    } else if (p.stock != null && p.stock <= p.low_stock_threshold) a.push({ tone: p.stock === 0 ? "alert" : "warn", text: `Stock ${p.stock === 0 ? "épuisé" : "bas"} : ${p.name} · ${p.stock}` });
    const sp = S.suggestPrice(s, p.unit_cost, p.extra_cost);
    if (p.price_coins < sp.min) a.push({ tone: "alert", text: `${p.name} : prix ${p.price_coins} Coins inférieur au coût réel (${sp.min} Coins minimum).` });
  }
  if (d.package_prices.without_price > 0) a.push({ tone: "warn", text: `${d.package_prices.without_price} forfait(s) sans prix : leurs séances ne rapportent pas de Coins.` });
  return a;
}

function Dashboard({ d, onTab }: { d: S.ShopOverview; onTab: (t: AdminTab) => void }) {
  const k = d.kpis;
  const al = alerts(d);
  const pending = d.orders.filter((o) => ["pending", "validated", "ready"].includes(o.status));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone="accent" label="Coins en circulation" value={k.coins_circulation.toLocaleString("fr-FR")} hint={`valeur de référence ${S.euro(k.circulation_value)}`} />
        <StatTile label="Coins émis" value={k.coins_issued.toLocaleString("fr-FR")} hint={`${k.paid_sessions} séances payées · ${k.avg_coins_per_session ?? 0} / séance`} />
        <StatTile label="Budget fidélité généré" value={S.euro(k.budget_generated)} hint={`${d.settings.rate_pct} % du disponible`} />
        <StatTile tone={k.budget_remaining < 0 ? "alert" : k.budget_remaining <= d.settings.budget_alert_eur ? "warn" : "default"} label="Budget restant" value={S.euro(k.budget_remaining)} hint={`remis ${S.euro(k.delivered_cost)} · engagé ${S.euro(k.committed_cost)}`} />
      </div>
      {al.length > 0 && (
        <div className="space-y-2">
          {al.map((x, i) => (
            <Card key={i} className={cx("flex items-start gap-2 p-3 text-sm", x.tone === "alert" ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-amber-50 text-amber-900 ring-amber-200")}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />{x.text}
            </Card>
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={`Commandes en cours (${pending.length})`} actions={<button className="text-sm text-violet-600" onClick={() => onTab("orders")}>Tout voir</button>}>
          {pending.length === 0 ? <Empty>Aucune commande en cours.</Empty> : (
            <Card className="divide-y divide-slate-100">{pending.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1"><b>{o.player}</b> · {o.items.map((i) => i.name).join(", ")}</span>
                <Badge className={S.ORDER_STATUS[o.status].cls}>{S.ORDER_STATUS[o.status].label}</Badge>
              </div>))}
            </Card>
          )}
        </Section>
        <Section title="Stock disponible">
          {d.products.filter((p) => p.active).length === 0 ? <Empty action={<Button size="sm" onClick={() => onTab("products")}>Gérer les produits</Button>}>Aucun produit actif.</Empty> : (
            <Card className="divide-y divide-slate-100">{d.products.filter((p) => p.active).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 font-medium">{p.name}</span>
                <span className="text-slate-500">{p.variants.length ? p.variants.filter((v) => v.active).map((v) => `${v.label} : ${v.stock ?? "∞"}`).join(" · ") : p.stock ?? "illimité"}</span>
                <span className="text-xs text-slate-400">{p.delivered_qty} remis</span>
              </div>))}
            </Card>
          )}
        </Section>
      </div>
      <Section title="Portefeuilles">
        <Card className="divide-y divide-slate-100">{d.wallets.filter((w) => w.earned || w.balance).slice(0, 10).map((w) => (
          <div key={w.player_id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="flex-1">{w.name}</span>
            <span className="text-xs text-slate-500">gagnés {w.earned} · dépensés {w.spent}</span>
            <CoinAmount value={w.balance} className={w.balance < 0 ? "text-rose-600" : "text-violet-700"} />
          </div>))}
          {d.wallets.every((w) => !w.earned && !w.balance) && <div className="p-4 text-sm text-slate-500">Aucun Coin émis pour l&apos;instant.</div>}
        </Card>
      </Section>
    </div>
  );
}

/* ------------------------------ Commandes ------------------------------ */
function Orders({ d, onChange }: { d: S.ShopOverview; onChange: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const list = d.orders.filter((o) => filter === "all" || ["pending", "validated", "ready"].includes(o.status));
  const act = async (o: S.AdminOrder, status: S.OrderStatus) => {
    let reason: string | undefined;
    if (status === "cancelled") { const r = window.prompt("Motif de l'annulation (visible par le joueur) :", "Rupture de stock"); if (r === null) return; reason = r; }
    setBusy(o.id + status);
    try { await S.updateOrder(S_newOp(), o.id, status, reason); toast(status === "cancelled" ? `Commande annulée, ${o.total_coins} Coins restitués` : `Commande ${S.ORDER_STATUS[status].label.toLowerCase()}`); onChange(); }
    catch (e) { toast(errMsg(e), "err"); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3">
      <Segmented value={filter} onChange={setFilter} options={[{ value: "open", label: "En cours" }, { value: "all", label: "Historique complet" }]} />
      {list.length === 0 ? <Empty>Aucune commande.</Empty> : (
        <Card className="divide-y divide-slate-100">
          {list.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{o.player} · {o.items.map((i) => `${i.name}${i.variant ? ` (${i.variant})` : ""}${i.qty > 1 ? ` ×${i.qty}` : ""}`).join(", ")}</div>
                <div className="text-xs text-slate-500">{timeAgo(o.created_at)} · coût réel {S.euro(o.total_cost)}{o.cancel_reason && ` · ${o.cancel_reason}`}</div>
              </div>
              <CoinAmount value={o.total_coins} className="text-slate-700" />
              <Badge className={S.ORDER_STATUS[o.status].cls}>{S.ORDER_STATUS[o.status].label}</Badge>
              <div className="flex gap-1">
                {o.status === "pending" && <Button size="sm" loading={busy === o.id + "validated"} onClick={() => act(o, "validated")}><Check className="size-4" /> Valider</Button>}
                {o.status === "validated" && <Button size="sm" loading={busy === o.id + "ready"} onClick={() => act(o, "ready")}><Truck className="size-4" /> Prête</Button>}
                {(o.status === "validated" || o.status === "ready") && <Button size="sm" variant="success" loading={busy === o.id + "delivered"} onClick={() => act(o, "delivered")}><PackageCheck className="size-4" /> Remise</Button>}
                {["pending", "validated", "ready"].includes(o.status) && <Button size="sm" variant="ghost" onClick={() => act(o, "cancelled")}><X className="size-4" /> Annuler</Button>}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
const S_newOp = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/* ------------------------------ Produits ------------------------------ */
function Products({ d, onChange }: { d: S.ShopOverview; onChange: () => void }) {
  const toast = useToast();
  const [edit, setEdit] = useState<S.AdminProduct | "new" | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEdit("new")}><Plus className="size-4" /> Nouveau produit</Button>
        <Button variant="secondary" onClick={async () => {
          try { const n = await S.addStarterProducts(); toast(n ? `${n} produits de départ ajoutés (inactifs, à compléter)` : "Les produits de départ existent déjà"); onChange(); }
          catch (e) { toast(errMsg(e), "err"); }
        }}><Gift className="size-4" /> Produits de départ</Button>
      </div>
      {d.products.length === 0 ? <Empty>Aucun produit. Ajoute-en un ou charge les produits de départ.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.products.map((p) => {
            const sp = S.suggestPrice(d.settings, p.unit_cost, p.extra_cost);
            const under = p.price_coins < sp.min;
            return (
              <button key={p.id} onClick={() => setEdit(p)} className={cx("flex gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:ring-violet-300", !p.active && "opacity-60")}>
                <ProductImage path={p.image_path} category={p.category} className="size-20 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap gap-1">
                    <Badge className={S.RARITY_STYLE[p.rarity].cls}>{S.RARITY_STYLE[p.rarity].label}</Badge>
                    {!p.active && <Badge className="bg-slate-100 text-slate-500 ring-slate-200">Inactif</Badge>}
                    {p.is_ambassador && <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Ambassadeur</Badge>}
                  </div>
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="flex items-center gap-2 text-sm"><CoinAmount value={p.price_coins} className="text-violet-700" /><span className="text-xs text-slate-500">coût {S.euro(p.unit_cost + Number(p.extra_cost))}</span></div>
                  <div className={cx("text-xs", under ? "font-medium text-rose-600" : "text-slate-500")}>{under ? `Sous le coût ! minimum ${sp.min}` : `minimum ${sp.min} · conseillé ${sp.suggested}`} · stock {p.variants.length ? "par option" : p.stock ?? "illimité"}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {edit && <ProductModal d={d} product={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={onChange} />}
    </div>
  );
}

function ProductModal({ d, product, onClose, onDone }: { d: S.ShopOverview; product: S.AdminProduct | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { profile } = useRole();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({
    name: product?.name ?? "", description: product?.description ?? "", category: product?.category ?? "equipement" as S.ProductCategory,
    image_path: product?.image_path ?? null as string | null, unit_cost: String(product?.unit_cost ?? ""), extra_cost: String(product?.extra_cost ?? "0"),
    commercial_value: product?.commercial_value != null ? String(product.commercial_value) : "", price_coins: String(product?.price_coins ?? ""),
    rarity: product?.rarity ?? "commun" as S.ProductRarity, is_ambassador: product?.is_ambassador ?? false, min_level: product?.min_level ? String(product.min_level) : "",
    stock: product?.stock != null ? String(product.stock) : "", unlimited: product ? product.stock == null : false, low: String(product?.low_stock_threshold ?? 2),
    active: product?.active ?? false,
  });
  const [variants, setVariants] = useState(product?.variants.map((v) => ({ ...v, stock: v.stock })) ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const sp = S.suggestPrice(d.settings, Number(f.unit_cost || 0), Number(f.extra_cost || 0));
  const price = Number(f.price_coins || 0);
  const avg = d.kpis.avg_coins_per_session;
  return (
    <Modal open onClose={onClose} wide title={product ? `Modifier · ${product.name}` : "Nouveau produit"} footer={<>
      {product && <Button variant="ghost" className="mr-auto text-rose-600" onClick={async () => {
        if (!window.confirm(`Supprimer « ${product.name} » ? Les commandes passées restent dans l'historique.`)) return;
        try { await S.deleteProduct(product.id); toast("Produit supprimé"); onDone(); onClose(); } catch (e) { toast(errMsg(e), "err"); }
      }}><Trash2 className="size-4" /> Supprimer</Button>}
      <Button variant="ghost" onClick={onClose}>Annuler</Button>
      <Button loading={busy} disabled={!f.name.trim() || price < 1} onClick={async () => {
        if (f.active && price < sp.min && !window.confirm(`Le prix (${price} Coins) est inférieur au coût réel (${sp.min} Coins minimum). Enregistrer quand même ?`)) return;
        setBusy(true);
        try {
          const id = await S.saveProduct(product?.id ?? null, {
            name: f.name.trim(), description: f.description.trim() || null, category: f.category, image_path: f.image_path,
            unit_cost: Number(f.unit_cost || 0), extra_cost: Number(f.extra_cost || 0), commercial_value: f.commercial_value ? Number(f.commercial_value) : null,
            price_coins: price, rarity: f.rarity, is_ambassador: f.is_ambassador, min_level: f.min_level ? Number(f.min_level) : null,
            stock: f.unlimited ? null : Number(f.stock || 0), low_stock_threshold: Number(f.low || 0), active: f.active,
          });
          for (const r of removed) await S.deleteVariant(r);
          for (const [i, v] of variants.entries()) if (v.label.trim()) await S.saveVariant(id, { id: v.id || undefined, label: v.label.trim(), stock: v.stock, active: v.active, sort: i });
          toast("Produit enregistré"); onDone(); onClose();
        } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
      }}>Enregistrer</Button>
    </>}>
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          <Field label="Nom"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex. Surgrip personnalisé" /></Field>
          <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Catégorie"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as S.ProductCategory })}>
              {Object.entries(S.CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Rareté"><Select value={f.rarity} onChange={(e) => setF({ ...f, rarity: e.target.value as S.ProductRarity })}>
              {Object.entries(S.RARITY_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
            <Field label="Coût d'achat réel (€)" hint="Ce que TU paies"><Input type="number" min={0} step="0.01" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: e.target.value })} /></Field>
            <Field label="Frais en plus (€)" hint="Personnalisation, port…"><Input type="number" min={0} step="0.01" value={f.extra_cost} onChange={(e) => setF({ ...f, extra_cost: e.target.value })} /></Field>
            <Field label="Prix en Coins"><Input type="number" min={1} value={f.price_coins} onChange={(e) => setF({ ...f, price_coins: e.target.value })} /></Field>
            <Field label="Valeur commerciale (€)" hint="Information seulement"><Input type="number" min={0} step="0.01" value={f.commercial_value} onChange={(e) => setF({ ...f, commercial_value: e.target.value })} /></Field>
            <Field label="Niveau Legends requis"><Input type="number" min={1} max={20} placeholder="Aucun" value={f.min_level} onChange={(e) => setF({ ...f, min_level: e.target.value })} /></Field>
            <Field label="Alerte stock bas à"><Input type="number" min={0} value={f.low} onChange={(e) => setF({ ...f, low: e.target.value })} /></Field>
          </div>
          {variants.length === 0 && (
            <div className="flex items-end gap-3">
              <Field label="Stock"><Input type="number" min={0} disabled={f.unlimited} value={f.unlimited ? "" : f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} className="w-28" /></Field>
              <Checkbox label="Illimité (numérique)" checked={f.unlimited} onChange={(v) => setF({ ...f, unlimited: v })} />
            </div>
          )}
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="mb-2 text-sm font-medium text-slate-700">Options (tailles, couleurs) : le stock se gère alors par option</div>
            {variants.map((v, i) => (
              <div key={v.id || i} className="mb-1.5 flex items-center gap-2">
                <Input value={v.label} placeholder="Ex. M" onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="h-9" />
                <Input type="number" min={0} placeholder="stock" value={v.stock ?? ""} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, stock: e.target.value === "" ? null : Number(e.target.value) } : x))} className="h-9 w-24" />
                <input type="checkbox" className="accent-violet-600" checked={v.active} aria-label="Active" onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, active: e.target.checked } : x))} />
                <button aria-label="Retirer" onClick={() => { if (v.id) setRemoved([...removed, v.id]); setVariants(variants.filter((_, j) => j !== i)); }}><Trash2 className="size-4 text-slate-400" /></button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setVariants([...variants, { id: "", label: "", stock: 0, active: true, sort: variants.length }])}><Plus className="size-4" /> Option</Button>
          </div>
          <div className="flex flex-wrap gap-4">
            <Checkbox label="Produit ambassadeur (mis en avant)" checked={f.is_ambassador} onChange={(v) => setF({ ...f, is_ambassador: v })} />
            <Checkbox label="Actif (visible dans la boutique)" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
          </div>
        </div>
        <div className="space-y-3">
          <ProductImage path={f.image_path} category={f.category} className="aspect-square w-full rounded-2xl" />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            try { const path = await uploadPhoto(file, profile.id, profile.id); setF((x) => ({ ...x, image_path: path })); } catch (err) { toast(errMsg(err), "err"); }
            e.target.value = "";
          }} />
          <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> {f.image_path ? "Changer la photo" : "Ajouter une photo"}</Button>
          <Card className="space-y-1 bg-violet-50 p-3 text-sm ring-violet-200">
            <div className="flex items-center gap-1.5 font-semibold text-violet-900"><Calculator className="size-4" /> Rentabilité</div>
            <Row k="Coût complet" v={S.euro(sp.full)} />
            <Row k="Prix minimum (coût couvert)" v={`${sp.min} Coins`} />
            <Row k={`Prix conseillé (+${d.settings.safety_margin_pct} % de marge)`} v={<button className="font-semibold text-violet-700 underline" onClick={() => setF({ ...f, price_coins: String(sp.suggested) })}>{sp.suggested} Coins</button>} />
            {price > 0 && <Row k="Budget fidélité mobilisé" v={S.euro(price * d.settings.coin_value)} />}
            {price > 0 && <Row k="Séances estimées pour l'obtenir" v={avg ? `≈ ${Math.ceil(price / avg)}` : "pas encore de données"} />}
            {price > 0 && price < sp.min && <div className="text-xs font-medium text-rose-600">Prix sous le coût réel : chaque remise te coûte de l&apos;argent.</div>}
          </Card>
        </div>
      </div>
    </Modal>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-2"><span className="text-violet-900/80">{k}</span><span className="text-right font-medium tabular-nums">{v}</span></div>;
}

/* ------------------------------ Calculateur ------------------------------ */
function CalculatorTab({ d }: { d: S.ShopOverview }) {
  const s = d.settings;
  const [paid, setPaid] = useState(String(d.package_prices.avg_session_price ?? 25));
  const [dur, setDur] = useState("1.5");
  const [players, setPlayers] = useState("4");
  const [court, setCourt] = useState(String(s.court_cost_per_hour));
  const [cost, setCost] = useState("3");
  const r = S.simulateCoins(s, { paid: Number(paid || 0), durationH: Number(dur || 0), players: Number(players || 1), courtPerHour: Number(court || 0) });
  const sp = S.suggestPrice(s, Number(cost || 0), 0);
  const totalCost = d.products.filter((p) => p.active).reduce((a, p) => a + (p.unit_cost + Number(p.extra_cost)), 0);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Coins gagnés pour une séance">
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix payé par le joueur (€)" hint="Forfait ÷ nb de séances"><Input type="number" step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
            <Field label="Durée (h)"><Input type="number" step="0.25" value={dur} onChange={(e) => setDur(e.target.value)} /></Field>
            <Field label="Joueurs présents"><Input type="number" min={1} value={players} onChange={(e) => setPlayers(e.target.value)} /></Field>
            <Field label="Terrain (€/h)"><Input type="number" step="0.5" value={court} onChange={(e) => setCourt(e.target.value)} /></Field>
          </div>
          <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
            <CalcRow k="Payé" v={S.euro(Number(paid || 0))} />
            <CalcRow k={`− URSSAF (${s.urssaf_pct} %)`} v={S.euro(-r.urssaf)} />
            <CalcRow k="− Terrain (part du joueur)" v={S.euro(-r.court)} />
            <CalcRow k="− Autres frais" v={S.euro(-r.other)} />
            <CalcRow k="= Disponible" v={S.euro(r.available)} strong />
            <CalcRow k={`× ${s.rate_pct} % = budget fidélité`} v={S.euro(r.budget)} />
            <CalcRow k={`÷ ${S.euro(s.coin_value)} = Coins gagnés`} v={<CoinAmount value={r.coins} className="text-violet-700" />} strong />
          </div>
          {r.coins === 0 && <p className="text-xs text-amber-700">Aucun Coin : la séance ne dégage pas assez de disponible une fois les coûts déduits.</p>}
        </Card>
      </Section>
      <Section title="Prix d'une récompense">
        <Card className="space-y-3 p-4">
          <Field label="Coût complet du produit (€)" hint="Achat + personnalisation + port"><Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
          <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
            <CalcRow k="Prix minimum" v={`${sp.min} Coins`} />
            <CalcRow k={`Prix conseillé (+${s.safety_margin_pct} %)`} v={`${sp.suggested} Coins`} strong />
            <CalcRow k="Séances pour l'obtenir (calcul ci-contre)" v={r.coins > 0 ? `≈ ${Math.ceil(sp.suggested / r.coins)}` : "—"} />
            <CalcRow k="Séances (moyenne réelle)" v={d.kpis.avg_coins_per_session ? `≈ ${Math.ceil(sp.suggested / d.kpis.avg_coins_per_session)}` : "pas encore de données"} />
          </div>
        </Card>
        <Card className="mt-3 space-y-1 p-4 text-sm">
          <CalcRow k="Coût d'une unité de chaque produit actif" v={S.euro(totalCost)} />
          <CalcRow k="Coût réel des récompenses remises" v={S.euro(d.kpis.delivered_cost)} />
          <CalcRow k="Valeur des Coins non utilisés" v={S.euro(d.kpis.circulation_value)} />
        </Card>
      </Section>
    </div>
  );
}
function CalcRow({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return <div className={cx("flex justify-between gap-2", strong && "border-t border-slate-200 pt-1 font-semibold")}><span className="text-slate-600">{k}</span><span className="tabular-nums">{v}</span></div>;
}

/* ------------------------------ Réglages ------------------------------ */
function SettingsTab({ d, onChange }: { d: S.ShopOverview; onChange: () => void }) {
  const toast = useToast();
  const s = d.settings;
  const [f, setF] = useState({
    rate_pct: String(s.rate_pct), rate_cap_pct: String(s.rate_cap_pct), urssaf_pct: String(s.urssaf_pct), court_cost_per_hour: String(s.court_cost_per_hour),
    court_split: s.court_split, other_cost_per_session: String(s.other_cost_per_session), other_cost_per_player: String(s.other_cost_per_player),
    safety_margin_pct: String(s.safety_margin_pct), budget_alert_eur: String(s.budget_alert_eur), max_pending_orders: String(s.max_pending_orders),
    manual_max_coins: String(s.manual_max_coins), start_date: s.start_date ?? "",
  });
  const [busy, setBusy] = useState(false);
  const save = async (extra: Partial<S.LoyaltySettings> = {}) => {
    setBusy(true);
    try {
      await S.saveSettings({
        rate_cap_pct: Number(f.rate_cap_pct), rate_pct: Number(f.rate_pct), urssaf_pct: Number(f.urssaf_pct), court_cost_per_hour: Number(f.court_cost_per_hour),
        court_split: f.court_split, other_cost_per_session: Number(f.other_cost_per_session), other_cost_per_player: Number(f.other_cost_per_player),
        safety_margin_pct: Number(f.safety_margin_pct), budget_alert_eur: Number(f.budget_alert_eur), max_pending_orders: Number(f.max_pending_orders),
        manual_max_coins: Number(f.manual_max_coins), ...(f.start_date ? { start_date: f.start_date } : {}), ...extra,
      });
      toast(extra.enabled === true ? "Boutique ouverte : les Coins sont calculés" : extra.enabled === false ? "Boutique fermée" : "Réglages enregistrés"); onChange();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  };
  const ex = S.simulateCoins({ ...s, rate_pct: Math.min(Number(f.rate_pct), Number(f.rate_cap_pct)), urssaf_pct: Number(f.urssaf_pct), court_cost_per_hour: Number(f.court_cost_per_hour),
    other_cost_per_session: Number(f.other_cost_per_session), other_cost_per_player: Number(f.other_cost_per_player) },
    { paid: d.package_prices.avg_session_price ?? 25, durationH: 1.5, players: 4 });
  return (
    <div className="space-y-5">
      <Card className={cx("flex flex-wrap items-center gap-3 p-4", s.enabled ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50")}>
        <div className="flex-1 text-sm">
          {s.enabled ? <><b>Boutique ouverte</b> depuis le {s.start_date ? fmtDate(s.start_date, "d MMM yyyy") : "—"} : les séances payées validées à partir de cette date rapportent des Coins.</>
            : <><b>Boutique fermée.</b> À l&apos;ouverture, les Coins sont calculés pour les séances à partir de la date de départ (par défaut aujourd&apos;hui).</>}
        </div>
        {!s.enabled && <Field label="Date de départ"><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>}
        <Button loading={busy} variant={s.enabled ? "secondary" : "primary"} onClick={() => {
          if (!s.enabled && !window.confirm("Ouvrir la boutique ? Les Coins seront calculés sur tes séances payées et validées à partir de la date de départ. Vérifie d'abord tes coûts ci-dessous.")) return;
          save({ enabled: !s.enabled });
        }}>{s.enabled ? "Fermer la boutique" : "Ouvrir la boutique"}</Button>
      </Card>

      <Section title="Règle financière">
        <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Taux fidélité (% du disponible)" hint={`Plafonné à ${f.rate_cap_pct} %`}><Input type="number" step="0.1" min={0} max={Number(f.rate_cap_pct)} value={f.rate_pct} onChange={(e) => setF({ ...f, rate_pct: e.target.value })} /></Field>
          <Field label="Plafond du taux (%)" hint="5 % par défaut"><Input type="number" step="0.1" min={0} max={10} value={f.rate_cap_pct} onChange={(e) => setF({ ...f, rate_cap_pct: e.target.value })} /></Field>
          <Field label="Cotisations URSSAF (%)" hint="Appliquées au montant payé"><Input type="number" step="0.1" value={f.urssaf_pct} onChange={(e) => setF({ ...f, urssaf_pct: e.target.value })} /></Field>
          <Field label="Terrain (€ / heure)" hint="Coût que tu supportes"><Input type="number" step="0.5" min={0} value={f.court_cost_per_hour} onChange={(e) => setF({ ...f, court_cost_per_hour: e.target.value })} /></Field>
          <Field label="Partage du terrain"><Select value={f.court_split} onChange={(e) => setF({ ...f, court_split: e.target.value as "present" | "capacity" })}>
            <option value="present">Entre les joueurs présents</option><option value="capacity">Selon la capacité du groupe</option></Select></Field>
          <Field label="Autres frais par séance (€)" hint="Partagés entre les joueurs"><Input type="number" step="0.5" min={0} value={f.other_cost_per_session} onChange={(e) => setF({ ...f, other_cost_per_session: e.target.value })} /></Field>
          <Field label="Autres frais par joueur (€)" hint="Balles, matériel…"><Input type="number" step="0.1" min={0} value={f.other_cost_per_player} onChange={(e) => setF({ ...f, other_cost_per_player: e.target.value })} /></Field>
          <Field label="Marge de sécurité sur les prix (%)"><Input type="number" min={0} value={f.safety_margin_pct} onChange={(e) => setF({ ...f, safety_margin_pct: e.target.value })} /></Field>
          <Field label="Alerte budget restant sous (€)"><Input type="number" min={0} value={f.budget_alert_eur} onChange={(e) => setF({ ...f, budget_alert_eur: e.target.value })} /></Field>
          <Field label="Commandes en cours max / joueur"><Input type="number" min={1} max={20} value={f.max_pending_orders} onChange={(e) => setF({ ...f, max_pending_orders: e.target.value })} /></Field>
          <Field label="Ajustement manuel max (Coins)"><Input type="number" min={1} value={f.manual_max_coins} onChange={(e) => setF({ ...f, manual_max_coins: e.target.value })} /></Field>
        </Card>
        <Card className="mt-3 bg-violet-50 p-3 text-sm text-violet-900 ring-violet-200">
          Exemple avec ces réglages : séance à {S.euro(d.package_prices.avg_session_price ?? 25)}, 1h30, 4 joueurs → disponible {S.euro(ex.available)} → <b>{ex.coins} Coins</b> ({S.euro(ex.budget)} de budget).
          Les réglages s&apos;appliquent aux <b>prochains</b> gains ; les Coins déjà émis ne changent pas.
        </Card>
        <div className="mt-3"><Button loading={busy} onClick={() => save()}>Enregistrer les réglages</Button></div>
      </Section>

      <Section title="Coût du terrain par groupe (si différent)">
        <Card className="divide-y divide-slate-100">
          {d.group_costs.map((g) => <GroupCostRow key={g.group_id} g={g} def={s} onSaved={onChange} />)}
          {d.group_costs.length === 0 && <div className="p-4 text-sm text-slate-500">Aucun groupe.</div>}
        </Card>
      </Section>
    </div>
  );
}

function GroupCostRow({ g, def, onSaved }: { g: S.ShopOverview["group_costs"][number]; def: S.LoyaltySettings; onSaved: () => void }) {
  const toast = useToast();
  const [court, setCourt] = useState(g.court_cost_per_hour != null ? String(g.court_cost_per_hour) : "");
  const [other, setOther] = useState(g.other_cost_per_session != null ? String(g.other_cost_per_session) : "");
  const dirty = court !== (g.court_cost_per_hour != null ? String(g.court_cost_per_hour) : "") || other !== (g.other_cost_per_session != null ? String(g.other_cost_per_session) : "");
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
      <span className="min-w-40 flex-1 font-medium">{g.name} <span className="text-xs font-normal text-slate-400">{g.start_time.slice(0, 5)}–{g.end_time.slice(0, 5)} · {g.capacity} places</span></span>
      <Input type="number" min={0} step="0.5" placeholder={`${def.court_cost_per_hour} €/h`} value={court} onChange={(e) => setCourt(e.target.value)} className="h-8 w-28" aria-label="Terrain €/h" />
      <Input type="number" min={0} step="0.5" placeholder={`frais ${def.other_cost_per_session} €`} value={other} onChange={(e) => setOther(e.target.value)} className="h-8 w-28" aria-label="Autres frais" />
      {dirty && <Button size="sm" onClick={async () => {
        try { await S.saveGroupCost(g.group_id, court === "" ? null : Number(court), other === "" ? null : Number(other)); toast("Coût du groupe enregistré"); onSaved(); }
        catch (e) { toast(errMsg(e), "err"); }
      }}>OK</Button>}
    </div>
  );
}

/* ------------------------------ Journal comptable ------------------------------ */
function Ledger({ d, onChange }: { d: S.ShopOverview; onChange: () => void }) {
  const toast = useToast();
  const op = useOpKey();
  const [adj, setAdj] = useState(false);
  const [player, setPlayer] = useState(d.wallets[0]?.player_id ?? "");
  const [coins, setCoins] = useState("10");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<S.ShopOverview["ledger"][number] | null>(null);
  const players = useMemo(() => [...d.wallets].sort((a, b) => a.name.localeCompare(b.name)), [d.wallets]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy} onClick={async () => {
          setBusy(true);
          try { const r = await S.verifyBalances(); toast(r.wallets_fixed === 0 && r.coins_delta === 0 ? "Soldes vérifiés : tout est juste" : `Vérification : ${r.wallets_fixed} portefeuille(s) recalculé(s), ${r.coins_delta} Coins d'écart rattrapés`); onChange(); }
          catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
        }}><ShieldCheck className="size-4" /> Vérifier les soldes</Button>
        <Button variant="secondary" onClick={() => setAdj(true)}><Gift className="size-4" /> Ajuster un portefeuille</Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Écritures (non modifiables)">
          <Card className="divide-y divide-slate-100">
            {d.ledger.length === 0 && <div className="p-4 text-sm text-slate-500">Aucune écriture.</div>}
            {d.ledger.map((t) => (
              <button key={t.id} onClick={() => t.kind === "earn" && setDetail(t)} className={cx("flex w-full items-start gap-3 px-4 py-2 text-left text-sm", t.kind === "earn" && "hover:bg-slate-50")}>
                <span className="w-16 shrink-0 text-xs text-slate-500">{fmtDate(t.created_at.slice(0, 10), "d MMM")}</span>
                <span className="min-w-0 flex-1"><b>{t.player}</b> · {t.label}<span className="block text-xs text-slate-500">{S.KIND_LABEL[t.kind]}{t.reason && ` · ${t.reason}`}{t.kind === "earn" && " · voir le calcul"}</span></span>
                <span className={cx("font-semibold tabular-nums", t.coins >= 0 ? "text-emerald-600" : "text-rose-600")}>{t.coins > 0 ? "+" : ""}{t.coins}</span>
              </button>
            ))}
          </Card>
        </Section>
        <Section title="Journal des actions">
          <Card className="divide-y divide-slate-100">
            {d.audit.length === 0 && <div className="p-4 text-sm text-slate-500">Rien pour l&apos;instant.</div>}
            {d.audit.map((a, i) => (
              <div key={i} className="px-4 py-2 text-sm"><b>{S.AUDIT_LABEL[a.action] ?? a.action}</b>{a.player && ` · ${a.player}`}
                <div className="text-xs text-slate-500">{timeAgo(a.created_at)}{a.reason && ` · ${a.reason}`}</div></div>
            ))}
          </Card>
        </Section>
      </div>
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Détail du calcul">
        {detail && (
          <div className="space-y-1 text-sm">
            <p className="mb-2 text-slate-600">{detail.player} · {detail.label}</p>
            <CalcRow k="Payé (part du forfait)" v={S.euro(detail.details.paid)} />
            <CalcRow k={`− URSSAF (${detail.details.urssaf_pct} %)`} v={S.euro(-Number(detail.details.urssaf))} />
            <CalcRow k={`− Terrain (${detail.details.court_per_hour} €/h × ${detail.details.duration_h} h ÷ ${detail.details.players})`} v={S.euro(-Number(detail.details.court))} />
            <CalcRow k="− Autres frais" v={S.euro(-Number(detail.details.other))} />
            <CalcRow k="= Disponible" v={S.euro(detail.details.available)} strong />
            <CalcRow k={`× ${detail.details.rate_pct} %`} v={S.euro(detail.details.budget)} />
            <CalcRow k="Coins" v={detail.coins} strong />
          </div>
        )}
      </Modal>
      <Modal open={adj} onClose={() => setAdj(false)} title="Ajuster un portefeuille" footer={<>
        <Button variant="ghost" onClick={() => setAdj(false)}>Annuler</Button>
        <Button loading={busy} disabled={!player || !Number(coins) || reason.trim().length < 5} onClick={async () => {
          setBusy(true);
          try { await S.adjustCoins(op.get(), player, Number(coins), reason.trim()); op.renew(); toast("Ajustement enregistré"); setAdj(false); setReason(""); onChange(); }
          catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
        }}>Enregistrer</Button>
      </>}>
        <div className="space-y-3">
          <Field label="Joueur"><Select value={player} onChange={(e) => { setPlayer(e.target.value); op.renew(); }}>{players.map((w) => <option key={w.player_id} value={w.player_id}>{w.name} ({w.balance} Coins)</option>)}</Select></Field>
          <Field label="Coins" hint="Négatif pour retirer"><Input type="number" value={coins} onChange={(e) => { setCoins(e.target.value); op.renew(); }} /></Field>
          <Field label="Motif (obligatoire, visible par le joueur)"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <p className="text-xs text-slate-500">Plafond {d.settings.manual_max_coins} Coins, 3 ajustements par joueur et par 24 h, jamais de solde négatif. L&apos;écriture est définitive (une erreur se corrige par un ajustement inverse).</p>
        </div>
      </Modal>
    </div>
  );
}
