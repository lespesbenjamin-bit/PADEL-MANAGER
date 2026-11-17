"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Flame, Plus, RefreshCw, Sparkles, Trash2, Trophy } from "lucide-react";
import { LegendCard, LevelChip, Ranking } from "@/components/Legends";
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Modal, PageHeader, Section, Segmented, Select, Spinner, StatTile, cx, errMsg, useToast } from "@/components/ui";
import { useAsync, useOpKey } from "@/lib/hooks";
import { fmtDate, timeAgo, todayISO } from "@/lib/dates";
import { RESULT_RANKS, TOURNAMENT_CATEGORIES } from "@/lib/hub";
import * as L from "@/lib/legends";

type Tab = "overview" | "tournaments" | "players" | "history" | "settings";

export default function GamificationPage() {
  return <Suspense fallback={<Spinner />}><Gamification /></Suspense>;
}

function Gamification() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const tab = (params.get("tab") as Tab) || "overview";
  const { data, error, loading, reload } = useAsync(() => L.getCoachOverview(), []);
  const levels = useAsync(() => L.getLevels(), []);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <PageHeader title="Gamification" subtitle={<>Padel Legends{data && <> · {data.season.name} (jusqu&apos;au {fmtDate(data.season.ends_on, "d MMM")})</>}</>}
        actions={<div className="flex gap-2"><Link href="/gamification/demo"><Button variant="secondary"><Sparkles className="size-4" /> Mode démo</Button></Link><Button variant="secondary" loading={busy} onClick={async () => {
          setBusy(true);
          try { const r = await L.recalculateAll(); toast(r.delta === 0 ? `Soldes vérifiés : tout est juste (${r.players} joueurs)` : `Recalcul effectué : ${r.delta > 0 ? "+" : ""}${r.delta} XP ajustés`); reload(); }
          catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
        }}><RefreshCw className="size-4" /> Recalculer</Button></div>} />
      <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
        <Segmented value={tab} onChange={(t) => router.replace(t === "overview" ? "/gamification" : `/gamification?tab=${t}`, { scroll: false })} options={[
          { value: "overview", label: "Vue d'ensemble" },
          { value: "tournaments", label: <span>Tournois{!!data?.pending_tournaments.length && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">{data.pending_tournaments.length}</span>}</span> },
          { value: "players", label: "Joueurs" }, { value: "history", label: "Historique" }, { value: "settings", label: "Réglages" },
        ]} />
      </div>
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : data && (
        <>
          {tab === "overview" && <Overview d={data} levels={levels.data ?? []} />}
          {tab === "tournaments" && <Tournaments d={data} onChange={reload} />}
          {tab === "players" && <Players d={data} levels={levels.data ?? []} />}
          {tab === "history" && <History d={data} />}
          {tab === "settings" && <Settings d={data} onChange={reload} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------ Vue d'ensemble ------------------------------ */
function Overview({ d, levels }: { d: L.CoachOverview; levels: L.MascotLevel[] }) {
  const streaks = [...d.players].filter((p) => p.current_streak > 0).sort((a, b) => b.current_streak - a.current_streak).slice(0, 6);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile tone="accent" label="Joueurs actifs (30 j)" value={d.stats.active_30d} hint={`sur ${d.stats.players} joueurs`} />
        <StatTile label="Séries ≥ 4 semaines" value={d.stats.streak_4plus} hint={`série moyenne : ${d.stats.avg_streak ?? 0} sem.`} />
        <StatTile label="XP de la saison" value={d.stats.xp_season} hint={`${d.stats.xp_30d} XP sur 30 jours`} />
        <StatTile label="Badges (30 j)" value={d.stats.badges_30d} hint={`${d.stats.linked} joueurs ont accès à l'appli`} />
      </div>
      {d.pending_tournaments.length > 0 && (
        <Link href="/gamification?tab=tournaments">
          <Card className="flex items-center gap-3 bg-amber-50 p-3 ring-amber-200">
            <Trophy className="size-5 text-amber-600" />
            <span className="text-sm text-amber-900"><b>{d.pending_tournaments.length}</b> résultat{d.pending_tournaments.length > 1 ? "s" : ""} de tournoi à valider pour attribuer les XP</span>
          </Card>
        </Link>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Classement"><Ranking coachMode /></Section>
        <div className="space-y-5">
          <Section title="Séries de régularité">
            {streaks.length === 0 ? <Empty>Aucune série en cours.</Empty> : (
              <Card className="divide-y divide-slate-100">
                {streaks.map((p) => (
                  <Link key={p.id} href={`/gamification/joueur/${p.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                    <Flame className={cx("size-5", p.current_streak >= 8 ? "text-rose-500" : "text-orange-400")} />
                    <span className="flex-1 text-sm font-medium">{p.first_name} {p.last_name}</span>
                    <span className="text-sm tabular-nums text-slate-600"><b>{p.current_streak}</b> sem. <span className="text-xs text-slate-400">(record {p.best_streak})</span></span>
                  </Link>
                ))}
              </Card>
            )}
          </Section>
          <Section title="Derniers badges">
            {d.recent_badges.length === 0 ? <Empty>Aucun badge débloqué pour l&apos;instant.</Empty> : (
              <Card className="divide-y divide-slate-100">
                {d.recent_badges.slice(0, 8).map((b, i) => (
                  <Link key={i} href={`/gamification/joueur/${b.player_id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
                    <span className="text-xl">{b.icon}</span>
                    <span className="flex-1 text-sm"><b>{b.player}</b> · {b.name}</span>
                    <span className="text-xs text-slate-400">{timeAgo(b.earned_at)}</span>
                  </Link>
                ))}
              </Card>
            )}
          </Section>
          <Section title="Répartition par niveau">
            <LevelSpread d={d} levels={levels} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function LevelSpread({ d, levels }: { d: L.CoachOverview; levels: L.MascotLevel[] }) {
  const counts = new Map<number, number>();
  d.players.forEach((p) => counts.set(p.level, (counts.get(p.level) ?? 0) + 1));
  const rows = levels.filter((l) => counts.has(l.level));
  if (!rows.length) return <Empty>Aucun joueur.</Empty>;
  return (
    <Card className="flex flex-wrap gap-3 p-4">
      {rows.map((l) => (
        <div key={l.level} className="flex items-center gap-2">
          <LegendCard card={l} size="xs" />
          <div className="text-xs"><div className="font-semibold">{l.status}</div><div className="text-slate-500">Niv. {l.level} · {counts.get(l.level)} joueur{counts.get(l.level)! > 1 ? "s" : ""}</div></div>
        </div>
      ))}
    </Card>
  );
}

/* ------------------------------ Tournois à valider ------------------------------ */
function tierOf(settings: L.GamiSettings, cat: string): "t1" | "t2" | "t3" {
  const t = settings.category_tiers[cat?.toUpperCase()];
  if (t) return t;
  const n = Number(String(cat).replace(/\D/g, ""));
  return !n || n <= 100 ? "t1" : n <= 500 ? "t2" : "t3";
}
function bucketOf(r: string) {
  const s = r.toLowerCase();
  return s.startsWith("vainqueur") ? "winner" : s.startsWith("finaliste") ? "final" : s.startsWith("1/2") ? "semi" : s.startsWith("1/4") ? "quarter" : "participation";
}

function Tournaments({ d, onChange }: { d: L.CoachOverview; onChange: () => void }) {
  const [edit, setEdit] = useState<{ id: string; player: string; name: string; category: string; result: string; correcting: boolean } | null>(null);
  return (
    <div className="space-y-5">
      <Section title={`À valider (${d.pending_tournaments.length})`}>
        <p className="mb-2 text-sm text-slate-500">Tournois terminés déclarés par les joueurs. Les XP sont attribués après ta validation, un seul résultat par tournoi.</p>
        {d.pending_tournaments.length === 0 ? <Empty>Rien à valider. 🎾</Empty> : (
          <Card className="divide-y divide-slate-100">
            {d.pending_tournaments.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{t.player} · {t.name}</div>
                  <div className="text-xs text-slate-500">{fmtDate(t.start_date, "d MMM yyyy")} · {t.category} · Résultat déclaré : <b>{t.result_rank ?? "non renseigné"}</b>
                    {t.xp_validated_at && <span className="text-amber-700"> · modifié après validation (avant : {t.xp_result})</span>}</div>
                </div>
                <Button size="sm" onClick={() => setEdit({ id: t.id, player: t.player, name: t.name, category: t.category, result: t.result_rank ?? "Participation", correcting: !!t.xp_validated_at })}>
                  <Check className="size-4" /> Valider
                </Button>
              </div>
            ))}
          </Card>
        )}
      </Section>
      <Section title="Derniers résultats validés">
        {d.validated_tournaments.length === 0 ? <Empty>Aucun pour l&apos;instant.</Empty> : (
          <Card className="divide-y divide-slate-100">
            {d.validated_tournaments.map((t) => {
              const xp = d.rules.find((r) => r.code === `${tierOf(d.settings, t.xp_category)}_${bucketOf(t.xp_result)}`)?.xp;
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.player} · {t.name}</div>
                    <div className="text-xs text-slate-500">{t.xp_category} · {t.xp_result} · validé {timeAgo(t.xp_validated_at)}</div>
                  </div>
                  {xp != null && <Badge className="bg-violet-50 text-violet-700 ring-violet-200">+{xp} XP</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ id: t.id, player: t.player, name: t.name, category: t.xp_category, result: t.xp_result, correcting: true })}>Corriger</Button>
                </div>
              );
            })}
          </Card>
        )}
      </Section>
      {edit && <ValidateModal d={d} t={edit} onClose={() => setEdit(null)} onDone={onChange} />}
    </div>
  );
}

function ValidateModal({ d, t, onClose, onDone }: {
  d: L.CoachOverview; t: { id: string; player: string; name: string; category: string; result: string; correcting: boolean }; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const op = useOpKey();
  const [result, setResult] = useState(RESULT_RANKS.includes(t.result) ? t.result : t.result || "Participation");
  const [category, setCategory] = useState(t.category);
  const [busy, setBusy] = useState(false);
  const cats = Array.from(new Set([...TOURNAMENT_CATEGORIES, ...Object.keys(d.settings.category_tiers), t.category]));
  const tier = tierOf(d.settings, category);
  const rule = d.rules.find((r) => r.code === `${tier}_${bucketOf(result)}`);
  return (
    <Modal open onClose={onClose} title={`${t.correcting ? "Corriger" : "Valider"} · ${t.name}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await L.validateTournament(op.get(), t.id, result, category);
            toast(r.delta === 0 ? "Résultat validé (XP inchangés)" : `Résultat validé : ${r.delta > 0 ? "+" : ""}${r.delta} XP pour ${t.player}`);
            onDone(); onClose();
          } catch (e) { toast(errMsg(e), "err"); } finally { setBusy(false); }
        }}>Valider le résultat</Button>
      </>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{t.player}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Catégorie"><Select value={category} onChange={(e) => { setCategory(e.target.value); op.renew(); }}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Résultat"><Select value={result} onChange={(e) => { setResult(e.target.value); op.renew(); }}>
            {["Participation", ...RESULT_RANKS].map((r) => <option key={r}>{r}</option>)}
          </Select></Field>
        </div>
        <Card className="bg-violet-50 p-3 text-sm text-violet-900 ring-violet-200">
          Barème {L.TIER_LABEL[tier]} : <b>{rule?.enabled === false ? "règle désactivée" : `+${rule?.xp ?? 0} XP`}</b>.
          {t.correcting && " Les XP déjà attribués pour ce tournoi seront ajustés (écriture corrective), jamais cumulés."}
        </Card>
      </div>
    </Modal>
  );
}

/* ------------------------------ Joueurs ------------------------------ */
function Players({ d, levels }: { d: L.CoachOverview; levels: L.MascotLevel[] }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => d.players.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q.toLowerCase())), [d, q]);
  return (
    <div className="space-y-3">
      <Input placeholder="Rechercher un joueur…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Joueur</th><th className="px-2">Niveau</th><th className="px-2 text-right">XP</th><th className="px-2 text-right">Saison</th>
            <th className="px-2 text-right">Série</th><th className="px-2 text-right">Séances</th><th className="px-2 text-right">Tournois</th><th className="px-2 text-right">Badges</th>
          </tr></thead>
          <tbody>
            {rows.map((p) => {
              const l = levels.find((x) => x.level === p.level);
              return (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2"><Link href={`/gamification/joueur/${p.id}`} className="font-medium text-slate-900 hover:text-violet-700">{p.first_name} {p.last_name}</Link>
                    {!p.linked && <span className="ml-1 text-xs text-slate-400">(sans accès)</span>}</td>
                  <td className="px-2"><span className="flex items-center gap-2">{l && <LegendCard card={l} size="xs" />}<span><LevelChip level={p.level} prestige={p.prestige} /><span className="block max-w-40 truncate text-xs text-slate-500">{l?.status}</span></span></span></td>
                  <td className="px-2 text-right font-semibold tabular-nums text-violet-700">{p.total_xp}</td>
                  <td className="px-2 text-right tabular-nums">{p.season_xp}</td>
                  <td className="px-2 text-right tabular-nums">{p.current_streak} <span className="text-xs text-slate-400">/ {p.best_streak}</span></td>
                  <td className="px-2 text-right tabular-nums">{p.sessions_count}</td>
                  <td className="px-2 text-right tabular-nums">{p.tournaments_count}</td>
                  <td className="px-2 text-right tabular-nums">{p.badges}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ------------------------------ Historique (corrections + journal) ------------------------------ */
function History({ d }: { d: L.CoachOverview }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Corrections & bonus">
        {d.corrections.length === 0 ? <Empty>Aucune correction.</Empty> : (
          <Card className="divide-y divide-slate-100">
            {d.corrections.map((c) => (
              <div key={c.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm"><b>{c.player}</b> · {c.label}</div>
                  <div className="text-xs text-slate-500">{fmtDate(c.created_at.slice(0, 10), "d MMM yyyy")}{c.reason && ` · ${c.reason}`}</div>
                </div>
                <span className={cx("font-semibold tabular-nums", c.xp >= 0 ? "text-emerald-600" : "text-rose-600")}>{c.xp > 0 ? "+" : ""}{c.xp}</span>
              </div>
            ))}
          </Card>
        )}
      </Section>
      <Section title="Journal des actions">
        {d.audit.length === 0 ? <Empty>Rien pour l&apos;instant.</Empty> : (
          <Card className="divide-y divide-slate-100">
            {d.audit.map((a) => (
              <div key={a.id} className="px-4 py-2.5">
                <div className="text-sm"><b>{L.AUDIT_LABEL[a.action] ?? a.action}</b>{a.player && ` · ${a.player}`}</div>
                <div className="text-xs text-slate-500">{timeAgo(a.created_at)}{a.reason && ` · ${a.reason}`} {describeAudit(a)}</div>
              </div>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}
function describeAudit(a: L.CoachOverview["audit"][number]) {
  const x = a.details as Record<string, string | number | null>;
  if (a.action.startsWith("tournament_")) return `· ${x.tournament} (${x.category}) : ${x.previous_result ? `${x.previous_result} → ` : ""}${x.result} · ${x.xp_before} → ${x.xp_after} XP`;
  if (a.action.startsWith("manual_")) return `· ${Number(x.xp) > 0 ? "+" : ""}${x.xp} XP`;
  if (a.action === "rule_updated") return `· ${x.code} : ${x.previous_xp ?? "–"} → ${x.xp} XP${x.enabled ? "" : " (désactivée)"}`;
  if (a.action.startsWith("neutral_week")) return `· semaine du ${fmtDate(String(x.week), "d MMM yyyy")}`;
  if (a.action === "recalculated") return `· ${x.players} joueurs, écart ${Number(x.xp_after) - Number(x.xp_before)} XP`;
  if (a.action === "season_archived") return `· ${x.season}`;
  return "";
}

/* ------------------------------ Réglages ------------------------------ */
const CAT_TITLE: Record<L.XpRule["category"], string> = { session: "Séances", streak: "Régularité", milestone: "Séances cumulées", tournament: "Tournois" };

function Settings({ d, onChange }: { d: L.CoachOverview; onChange: () => void }) {
  const toast = useToast();
  const save = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); onChange(); } catch (e) { toast(errMsg(e), "err"); }
  };
  const [week, setWeek] = useState(todayISO());
  const [weekReason, setWeekReason] = useState("Vacances");
  const [newCat, setNewCat] = useState("");
  const [msThreshold, setMsThreshold] = useState("150");
  const [msXp, setMsXp] = useState("300");
  const s = d.settings;

  return (
    <div className="space-y-6">
      <Section title="Barème XP">
        <p className="mb-2 text-sm text-slate-500">Une modification s&apos;applique aux prochains gains ; les XP déjà acquis ne changent pas. Une règle désactivée n&apos;attribue plus rien.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["session", "streak", "milestone", "tournament"] as const).map((c) => (
            <Card key={c} className="p-4">
              <h4 className="mb-2 font-semibold text-slate-900">{CAT_TITLE[c]}</h4>
              <div className="space-y-1.5">
                {d.rules.filter((r) => r.category === c).map((r) => <RuleRow key={r.code} rule={r} onSave={(xp, en) => save(() => L.saveRule(r.code, xp, en), "Règle enregistrée")} />)}
              </div>
              {c === "milestone" && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                  <Field label="Nouveau palier (séances)"><Input type="number" className="w-28" value={msThreshold} onChange={(e) => setMsThreshold(e.target.value)} /></Field>
                  <Field label="XP"><Input type="number" className="w-24" value={msXp} onChange={(e) => setMsXp(e.target.value)} /></Field>
                  <Button variant="secondary" onClick={() => save(() => L.saveRule(null, Number(msXp), true, Number(msThreshold)), "Palier ajouté")}><Plus className="size-4" /> Ajouter</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Régularité et semaines neutres">
        <Card className="space-y-3 p-4">
          <Checkbox label="Semaine sans séance prévue pour le joueur = semaine neutre" hint="Vacances, séance annulée ou groupe en pause : la série est préservée, sans XP."
            checked={s.auto_neutral_weeks} onChange={(v) => save(() => L.updateSettings({ auto_neutral_weeks: v }), "Réglage enregistré")} />
          <Checkbox label="Une absence excusée préserve la série" hint="Sinon, une absence excusée interrompt la série comme une absence."
            checked={s.excused_preserves_streak} onChange={(v) => save(() => L.updateSettings({ excused_preserves_streak: v }), "Réglage enregistré")} />
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 text-sm font-medium text-slate-700">Semaines neutres pour tout le monde (fermeture du club, vacances…)</div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Semaine du"><Input type="date" value={week} onChange={(e) => setWeek(e.target.value)} /></Field>
              <Field label="Motif"><Input value={weekReason} onChange={(e) => setWeekReason(e.target.value)} /></Field>
              <Button variant="secondary" onClick={() => save(() => L.setNeutralWeek(week, true, weekReason), "Semaine neutre ajoutée")}><Plus className="size-4" /> Ajouter</Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.neutral_weeks.map((w) => (
                <Badge key={w.id} className="bg-sky-50 text-sky-800 ring-sky-200">
                  Sem. du {fmtDate(w.week_start, "d MMM yyyy")}{w.reason && ` · ${w.reason}`}
                  <button aria-label="Retirer" onClick={() => save(() => L.setNeutralWeek(w.week_start, false), "Semaine neutre retirée")}><Trash2 className="size-3" /></button>
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      </Section>

      <Section title="Catégories de tournois">
        <Card className="p-4">
          <p className="mb-2 text-sm text-slate-500">Barème appliqué à chaque catégorie. Une catégorie inconnue est classée selon son nombre (≤ 100, ≤ 500, au-delà).</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(s.category_tiers).sort((a, b) => Number(a[0].replace(/\D/g, "")) - Number(b[0].replace(/\D/g, ""))).map(([cat, tier]) => (
              <label key={cat} className="flex items-center gap-2 text-sm">
                <span className="w-14 font-medium">{cat}</span>
                <Select value={tier} onChange={(e) => save(() => L.updateSettings({ category_tiers: { ...s.category_tiers, [cat]: e.target.value as "t1" } }), "Catégorie enregistrée")}>
                  {(["t1", "t2", "t3"] as const).map((t) => <option key={t} value={t}>{L.TIER_LABEL[t]}</option>)}
                </Select>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <Field label="Nouvelle catégorie"><Input placeholder="ex. P750" value={newCat} onChange={(e) => setNewCat(e.target.value.toUpperCase())} className="w-32" /></Field>
            <Button variant="secondary" disabled={!newCat.trim()} onClick={() => {
              const n = Number(newCat.replace(/\D/g, ""));
              save(() => L.updateSettings({ category_tiers: { ...s.category_tiers, [newCat.trim()]: !n || n <= 100 ? "t1" : n <= 500 ? "t2" : "t3" } }), "Catégorie ajoutée");
              setNewCat("");
            }}><Plus className="size-4" /> Ajouter</Button>
          </div>
        </Card>
      </Section>

      <Section title="Badges">
        <Card className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {d.badge_catalog.map((b) => {
            const on = !s.disabled_badges.includes(b.code);
            return (
              <label key={b.code} className={cx("flex items-center gap-2 rounded-xl p-2 text-sm", on ? "bg-violet-50/50" : "bg-slate-50 opacity-70")}>
                <input type="checkbox" className="accent-violet-600" checked={on} onChange={() => save(() => L.updateSettings({
                  disabled_badges: on ? [...s.disabled_badges, b.code] : s.disabled_badges.filter((x) => x !== b.code) }), on ? "Badge désactivé" : "Badge activé")} />
                <span className="text-lg">{b.icon}</span>
                <span><b>{b.name}</b><span className="block text-xs text-slate-500">{b.description}</span></span>
              </label>
            );
          })}
        </Card>
      </Section>

      <Section title="Contrôles anti-abus">
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Plafond d'un bonus ou d'une correction manuelle (XP)">
            <Input type="number" defaultValue={s.manual_max_xp} className="w-28" onBlur={(e) => {
              const v = Number(e.target.value); if (v && v !== s.manual_max_xp) save(() => L.updateSettings({ manual_max_xp: v }), "Plafond enregistré");
            }} />
          </Field>
          <p className="max-w-md text-xs text-slate-500">Autres garde-fous fixes : motif obligatoire, 3 ajustements manuels maximum par joueur et par 24 h, total jamais négatif, historique non effaçable, XP de séances et tournois calculés uniquement par le serveur.</p>
        </Card>
      </Section>
    </div>
  );
}

function RuleRow({ rule, onSave }: { rule: L.XpRule & { enabled: boolean }; onSave: (xp: number, enabled: boolean) => void }) {
  const [xp, setXp] = useState(String(rule.xp));
  const dirty = Number(xp) !== rule.xp;
  return (
    <div className={cx("flex items-center gap-2 text-sm", !rule.enabled && "opacity-60")}>
      <input type="checkbox" className="accent-violet-600" checked={rule.enabled} onChange={(e) => onSave(rule.xp, e.target.checked)} aria-label="Activer la règle" />
      <span className="flex-1 text-slate-700">{rule.label}</span>
      <Input type="number" value={xp} onChange={(e) => setXp(e.target.value)} className="h-8 w-20 text-right" />
      <span className="text-xs text-slate-400">XP</span>
      {dirty && <Button size="sm" onClick={() => onSave(Number(xp), rule.enabled)}>OK</Button>}
    </div>
  );
}
