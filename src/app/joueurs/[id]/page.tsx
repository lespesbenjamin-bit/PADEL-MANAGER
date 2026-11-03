"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Mail, Pencil, Phone, Plus, SlidersHorizontal, Trash2, Wallet } from "lucide-react";
import * as api from "@/lib/api";
import { fmtDate, fmtDateTime, todayISO } from "@/lib/dates";
import { useAsync } from "@/lib/hooks";
import { ATTENDANCE } from "@/lib/labels";
import { ConfirmModal, PlayerFormModal } from "@/components/forms";
import {
  Button, Card, cx, ErrorBox, errMsg, Field, Input, LevelBadge, Modal, Progress, Section, Segmented, Spinner, StatTile, useToast,
} from "@/components/ui";

const TX_LABEL = { purchase: "Achat de forfait", consume: "Séance décomptée", refund: "Recrédit", adjust: "Ajustement" } as const;

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(async () => {
    const [player, packages, txs, parts, memberships] = await Promise.all([
      api.getPlayer(id), api.getPackages(id), api.getTransactions(id), api.getParticipations(id), api.getPlayerMemberships(id),
    ]);
    return { player, packages, txs, parts, memberships };
  }, [id]);
  const [modal, setModal] = useState<null | "edit" | "pack" | "adjust">(null);
  const [delPack, setDelPack] = useState<string | null>(null);
  const [tab, setTab] = useState<"parts" | "tx">("parts");

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  const p = data.player;
  const current = data.memberships.filter((m) => !m.left_on && m.groups?.status !== "archived");
  const past = data.memberships.filter((m) => m.left_on || m.groups?.status === "archived");
  const validatedParts = data.parts.filter((x) => x.sessions?.status === "validated");

  return (
    <>
      <Link href="/joueurs" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="size-4" /> Joueurs</Link>
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-violet-100 text-lg font-semibold text-violet-700">{p.first_name[0]}{p.last_name?.[0]}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{p.first_name} {p.last_name}</h1>{p.level && <LevelBadge level={p.level} />}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {p.phone && <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-violet-700"><Phone className="size-4" /> {p.phone}</a>}
              {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-violet-700"><Mail className="size-4" /> {p.email}</a>}
            </div>
            {p.notes && <p className="mt-2 text-sm text-slate-500">{p.notes}</p>}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setModal("edit")}><Pencil className="size-4" /> Modifier</Button>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Crédits disponibles" value={p.credits_balance} tone={p.credits_balance < 0 ? "alert" : p.credits_balance <= 1 ? "warn" : "accent"} hint={p.credits_balance <= 1 ? "Forfait à renouveler" : undefined} />
        <StatTile label="Crédits consommés" value={p.credits_consumed} />
        <StatTile label="Séances jouées" value={p.sessions_played} hint="présent, séance validée" />
        <StatTile label="Groupes" value={current.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Section title="Groupes">
            <Card className="divide-y divide-slate-100">
              {current.length === 0 && <div className="p-3 text-sm text-slate-500">Aucun groupe actuellement.</div>}
              {current.map((m) => (
                <Link key={m.id} href={`/groupes/${m.group_id}`} className="flex items-center gap-2 p-3 text-sm hover:bg-slate-50">
                  <span className="size-2 rounded-full" style={{ background: m.groups?.color }} />
                  <span className="flex-1 font-medium">{m.groups?.name}</span>
                  <span className="text-xs text-slate-500">depuis {fmtDate(m.joined_on, "MMM yyyy")}</span>
                </Link>
              ))}
              {past.map((m) => (
                <div key={m.id} className="flex items-center gap-2 p-3 text-sm text-slate-400">
                  <span className="size-2 rounded-full bg-slate-300" /><span className="flex-1">{m.groups?.name}</span>
                  <span className="text-xs">{m.left_on ? `jusqu'au ${fmtDate(m.left_on, "d MMM yyyy")}` : "archivé"}</span>
                </div>
              ))}
            </Card>
          </Section>

          <Section title="Forfaits" actions={<div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setModal("adjust")} title="Ajustement manuel"><SlidersHorizontal className="size-4" /></Button>
            <Button size="sm" variant="secondary" onClick={() => setModal("pack")}><Plus className="size-4" /> Forfait</Button>
          </div>}>
            <Card className="divide-y divide-slate-100">
              {data.packages.length === 0 && <div className="p-3 text-sm text-slate-500">Aucun forfait.</div>}
              {data.packages.map((k) => (
                <div key={k.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-4 text-slate-400" />
                    <span className="flex-1 text-sm font-medium">{k.label}</span>
                    <span className={cx("text-sm font-semibold tabular-nums", k.remaining <= 0 ? "text-slate-400" : "text-slate-800")}>{k.remaining}/{k.total_credits}</span>
                    {k.consumed === 0 && <button onClick={() => setDelPack(k.id)} className="rounded p-1 text-slate-300 hover:text-rose-600" aria-label="Supprimer"><Trash2 className="size-4" /></button>}
                  </div>
                  <Progress value={(k.consumed / k.total_credits) * 100} className="mt-2 h-1.5" />
                  <div className="mt-1 text-xs text-slate-500">Acheté le {fmtDate(k.purchased_on, "d MMM yyyy")}{k.price ? ` · ${Number(k.price).toFixed(0)} €` : ""}{k.expires_on ? ` · expire le ${fmtDate(k.expires_on, "d MMM yyyy")}` : ""}</div>
                </div>
              ))}
            </Card>
            <p className="mt-2 text-xs text-slate-500">Les crédits sont personnels et utilisables dans tous les groupes, y compris en rattrapage. Ils ne sont décomptés qu&apos;à la validation d&apos;une séance.</p>
          </Section>
        </div>

        <div className="lg:col-span-3">
          <div className="mb-3"><Segmented value={tab} onChange={setTab} options={[
            { value: "parts", label: `Participations (${validatedParts.length})` }, { value: "tx", label: `Mouvements (${data.txs.length})` },
          ]} /></div>
          {tab === "parts" ? (
            <Card className="divide-y divide-slate-100">
              {validatedParts.length === 0 && <div className="p-3 text-sm text-slate-500">Aucune participation validée.</div>}
              {validatedParts.map((x) => (
                <Link key={x.id} href={`/seances/${x.sessions?.id}`} className="flex items-center gap-3 p-3 text-sm hover:bg-slate-50">
                  <span className="w-20 shrink-0 text-xs text-slate-500">{fmtDate(x.sessions?.session_date, "d MMM yy")}</span>
                  <span className="min-w-0 flex-1 truncate">{x.sessions?.groups?.name}{x.is_guest && <span className="ml-1 text-xs text-sky-700">(invité)</span>}</span>
                  <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-semibold", ATTENDANCE[x.status].cls)}>{ATTENDANCE[x.status].label}</span>
                  <span className="w-10 text-right text-xs text-slate-500">{x.consume_credit ? "−1" : "0"}</span>
                </Link>
              ))}
            </Card>
          ) : (
            <Card className="divide-y divide-slate-100">
              {data.txs.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{TX_LABEL[t.kind]}{t.sessions?.groups?.name ? ` · ${t.sessions.groups.name}` : ""}</div>
                    <div className="truncate text-xs text-slate-500">{fmtDateTime(t.created_at)}{t.sessions?.session_date ? ` · séance du ${fmtDate(t.sessions.session_date, "d MMM")}` : ""}{t.note ? ` · ${t.note}` : ""}</div>
                  </div>
                  <span className={cx("font-semibold tabular-nums", t.delta > 0 ? "text-emerald-600" : "text-rose-600")}>{t.delta > 0 ? `+${t.delta}` : t.delta}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      <PlayerFormModal open={modal === "edit"} onClose={() => setModal(null)} player={p} onSaved={reload} />
      <PackageModal open={modal === "pack"} onClose={() => setModal(null)} playerId={p.id} onSaved={reload} />
      <AdjustModal open={modal === "adjust"} onClose={() => setModal(null)} playerId={p.id} onSaved={reload} />
      <ConfirmModal open={!!delPack} onClose={() => setDelPack(null)} title="Supprimer le forfait" danger confirmLabel="Supprimer"
        onConfirm={async () => { try { await api.deletePackage(delPack!); toast("Forfait supprimé"); setDelPack(null); reload(); } catch (e) { toast(errMsg(e), "err"); } }}>
        Ce forfait n&apos;a pas encore été utilisé. Il sera supprimé avec son mouvement d&apos;achat.
      </ConfirmModal>
    </>
  );
}

function PackageModal({ open, onClose, playerId, onSaved }: { open: boolean; onClose: () => void; playerId: string; onSaved: () => void }) {
  const toast = useToast();
  const [size, setSize] = useState(10);
  const [custom, setCustom] = useState(8);
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayISO());
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const n = size === 0 ? custom : size;
  async function save() {
    if (!n || n < 1) return toast("Nombre de crédits invalide", "err");
    setBusy(true);
    try {
      await api.createPackage({ player_id: playerId, label: `Forfait ${n} séances`, total_credits: n, price: price ? Number(price) : null, purchased_on: date, expires_on: expires || null });
      toast(`Forfait de ${n} séances ajouté`); onSaved(); onClose();
    } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Nouveau forfait"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Ajouter</Button></>}>
      <div className="space-y-4">
        <Field label="Nombre de séances">
          <div className="flex flex-wrap items-center gap-2">
            {[5, 10, 20].map((x) => (
              <button key={x} type="button" onClick={() => setSize(x)} className={cx("h-10 rounded-xl px-4 text-sm font-medium ring-1", size === x ? "bg-violet-600 text-white ring-violet-600" : "bg-white ring-slate-200")}>{x}</button>
            ))}
            <button type="button" onClick={() => setSize(0)} className={cx("h-10 rounded-xl px-4 text-sm font-medium ring-1", size === 0 ? "bg-violet-600 text-white ring-violet-600" : "bg-white ring-slate-200")}>Autre</button>
            {size === 0 && <Input type="number" min={1} className="!w-24" value={custom} onChange={(e) => setCustom(Number(e.target.value))} />}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix (€, facultatif)"><Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Date d'achat"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Expiration (facultatif)"><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AdjustModal({ open, onClose, playerId, onSaved }: { open: boolean; onClose: () => void; playerId: string; onSaved: () => void }) {
  const toast = useToast();
  const [delta, setDelta] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!delta) return;
    if (!note.trim()) return toast("Indique un motif", "err");
    setBusy(true);
    try { await api.adjustCredits(playerId, delta, note); toast("Ajustement enregistré"); onSaved(); onClose(); setNote(""); }
    catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Ajustement manuel des crédits"
      footer={<><Button variant="ghost" onClick={onClose}>Annuler</Button><Button onClick={save} loading={busy}>Enregistrer</Button></>}>
      <div className="space-y-4">
        <Field label="Variation" hint="Positif pour ajouter, négatif pour retirer"><Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} /></Field>
        <Field label="Motif"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. séance offerte" /></Field>
      </div>
    </Modal>
  );
}
