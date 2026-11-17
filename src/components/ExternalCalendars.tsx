"use client";
import { useState } from "react";
import { CalendarPlus, Check, Link2, Trash2 } from "lucide-react";
import * as hub from "@/lib/hub";
import { useAsync } from "@/lib/hooks";
import { fmtDate } from "@/lib/dates";
import { Button, Card, errMsg, Input, Select, useToast } from "./ui";

const COLORS = ["#0D9488", "#0284C7", "#EA580C", "#DB2777", "#65A30D", "#475569"];
const FILTERS: Record<hub.ExternalCalendar["filter"], string> = {
  all: "Tous les cours",
  hide_collective: "Masquer ses cours collectifs (déjà dans l'appli)",
  individual: "Uniquement les cours individuels",
};

export function ExternalCalendarsCard() {
  const toast = useToast();
  const { data, reload } = useAsync(() => hub.getExternalCalendars(), []);
  const [editing, setEditing] = useState<hub.ExternalCalendar | "new" | null>(null);

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-slate-600">
        Colle ici le lien d&apos;abonnement de ton agenda <b>BookMyCoach</b> (ou Google / Apple). Tes indivs s&apos;afficheront dans le Planning et le
        tableau de bord, en lecture seule, mis à jour automatiquement. Le lien reste privé : seul toi peux le voir.
      </p>
      {(data ?? []).map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
          <span className="size-3 rounded-full" style={{ background: c.color }} />
          <span className="font-medium text-slate-900">{c.name}</span>
          <span className="text-xs text-slate-500">{FILTERS[c.filter]}</span>
          {!c.enabled && <span className="text-xs text-amber-600">désactivé</span>}
          <span className="flex-1" />
          <Button variant="secondary" onClick={() => setEditing(c)}>Modifier</Button>
          <Button variant="ghost" aria-label="Supprimer" onClick={async () => {
            if (!window.confirm(`Retirer le calendrier « ${c.name} » ? (rien n'est supprimé chez BookMyCoach)`)) return;
            try { await hub.deleteExternalCalendar(c.id); toast("Calendrier retiré"); reload(); } catch (e) { toast(errMsg(e), "err"); }
          }}><Trash2 className="size-4" /></Button>
        </div>
      ))}
      {editing ? (
        <CalendarForm cal={editing === "new" ? null : editing} onDone={() => { setEditing(null); reload(); }} />
      ) : (
        <Button variant="secondary" onClick={() => setEditing("new")}><CalendarPlus className="size-4" /> Ajouter un calendrier</Button>
      )}
    </Card>
  );
}

function CalendarForm({ cal, onDone }: { cal: hub.ExternalCalendar | null; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(cal?.name ?? "BookMyCoach");
  const [url, setUrl] = useState(cal?.url ?? "");
  const [color, setColor] = useState(cal?.color ?? COLORS[0]);
  const [filter, setFilter] = useState<hub.ExternalCalendar["filter"]>(cal?.filter ?? "hide_collective");
  const [enabled, setEnabled] = useState(cal?.enabled ?? true);
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = url.trim().replace(/^webcal:\/\//i, "https://");

  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3">
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Nom</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Lien d&apos;abonnement (iCal)</span>
        <Input value={url} onChange={(e) => { setUrl(e.target.value); setTest(null); }} placeholder="https://www.bookmycoach.pro/api/public/coach-calendar/…" /></label>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Quels cours afficher ?</span>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          {Object.entries(FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select></label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-slate-700">Couleur</span>
        {COLORS.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className="grid size-7 place-items-center rounded-full" style={{ background: c }}>
            {color === c && <Check className="size-4 text-white" />}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-slate-600">
          <input type="checkbox" className="accent-violet-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Activé
        </label>
      </div>
      {test && <p className="rounded-lg bg-white p-2 text-xs text-slate-700">{test}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!clean || busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await hub.testExternalCalendar(clean);
            setTest(r.count === 0 ? "✅ Lien valide, mais aucun cours à venir dedans pour l'instant."
              : `✅ ${r.count} cours trouvés (${r.individual} indivs, ${r.collective} collectifs), du ${fmtDate(r.first!, "d MMM")} au ${fmtDate(r.last!, "d MMM yyyy")}.`);
          } catch (e) { setTest(`❌ ${errMsg(e)}`); } finally { setBusy(false); }
        }}><Link2 className="size-4" /> Tester le lien</Button>
        <Button disabled={!clean || !name.trim() || busy} onClick={async () => {
          setBusy(true);
          try { await hub.saveExternalCalendar(cal?.id ?? null, { name: name.trim(), url: clean, color, filter, enabled }); toast("Calendrier enregistré"); onDone(); }
          catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
        }}>Enregistrer</Button>
        <Button variant="ghost" onClick={onDone}>Annuler</Button>
      </div>
    </div>
  );
}
