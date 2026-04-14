import { useState } from "react";
import PgaModelMobileCard from "@/components/pga/PgaModelMobileCard";
import { PGA_WEIGHT_DEFINITIONS, RBC_HERITAGE_WEIGHTS } from "@/lib/pga/pgaWeights";
import { getWeightTotal, areWeightsEqual } from "@/lib/pga/pgaModelHelpers";
import type { PlayerModelRow, PgaWeights } from "@/lib/pga/pgaTypes";

type Props = {
  rows: PlayerModelRow[];
  isFullPage?: boolean;
  onExpandFullPage?: () => void;
  draftWeights?: PgaWeights;
  appliedWeights?: PgaWeights;
  onWeightChange?: (key: keyof PgaWeights, value: number) => void;
  onApply?: () => void;
  onReset?: () => void;
};

// ── Color helpers ─────────────────────────────────────────────────────
function rankBg(rank: number | null, max: number): string {
  if (rank == null) return "";
  const pct = rank / max;
  if (pct <= 0.2) return "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
  if (pct <= 0.4) return "bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-400";
  if (pct <= 0.6) return "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300";
  if (pct <= 0.8) return "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400";
  return "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-400";
}

function finishColor(val: string | null): string {
  if (!val || val === "—") return "text-muted-foreground";
  if (val === "CUT") return "text-red-500 dark:text-red-400";
  try {
    const n = parseInt(val.replace("T", ""));
    if (n <= 5) return "font-semibold text-emerald-700 dark:text-emerald-400";
    if (n <= 20) return "text-sky-700 dark:text-sky-400";
  } catch { /* ignore */ }
  return "text-foreground";
}

function csgColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 1.0) return "font-semibold text-emerald-700 dark:text-emerald-400";
  if (v > 0.3) return "text-emerald-600 dark:text-emerald-500";
  if (v >= 0) return "text-foreground";
  return "text-red-500 dark:text-red-400";
}

// ── Column definitions with full tooltip text ─────────────────────────
const STAT_COLUMNS = [
  { key: "sgApproachRank",      abbr: "App",  tooltip: "SG: Approach the Green — Strokes Gained on approach shots. Most important stat at Harbour Town." },
  { key: "par4Rank",            abbr: "P4",   tooltip: "Par 4 Scoring Average — average score on par 4s. Lower score = better rank." },
  { key: "drivingAccuracyRank", abbr: "DA",   tooltip: "Driving Accuracy % — percentage of fairways hit. Key at narrow Harbour Town." },
  { key: "bogeyAvoidanceRank",  abbr: "BAvd", tooltip: "Bogey Avoidance % — how often a player avoids making bogey or worse." },
  { key: "sgAroundGreenRank",   abbr: "ARG",  tooltip: "SG: Around the Green — Strokes Gained chipping and pitching from off the green." },
  { key: "birdie125150Rank",    abbr: "125",  tooltip: "Birdie or Better from 125–150 yards — key Harbour Town scoring distance." },
  { key: "sgPuttingRank",       abbr: "Putt", tooltip: "SG: Putting — Strokes Gained on the Bermuda greens." },
  { key: "birdieUnder125Rank",  abbr: "<125", tooltip: "Birdie or Better from inside 125 yards — scoring from close range." },
] as const;

const HISTORY_COLS = [
  { label: "DG Rank",   tooltip: "DataGolf Trend Rank — current global player ranking per the DataGolf model" },
  { label: "HT Rnds",  tooltip: "Rounds at Harbour Town — total career rounds played at this course" },
  { label: "Masters",  tooltip: "2026 Masters Tournament final finish position" },
  { label: "Cuts/5",   tooltip: "Cuts Made — out of the last 5 RBC Heritage appearances" },
  { label: "Course SG", tooltip: "Course True SG — historical Strokes Gained specifically at Harbour Town Golf Links" },
] as const;

type StatColKey = typeof STAT_COLUMNS[number]["key"];
const CATEGORIES = ["Ball Striking", "Short Game", "Scoring", "Form"] as const;

// ── Inline weight sliders ─────────────────────────────────────────────
function WeightSliderRow({
  draftWeights, appliedWeights, onWeightChange, onApply, onReset,
}: {
  draftWeights: PgaWeights;
  appliedWeights: PgaWeights;
  onWeightChange: (key: keyof PgaWeights, value: number) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const draftTotal = getWeightTotal(draftWeights);
  const hasDraftChanges = !areWeightsEqual(draftWeights, appliedWeights);
  const isPreset = areWeightsEqual(draftWeights, RBC_HERITAGE_WEIGHTS) && areWeightsEqual(appliedWeights, RBC_HERITAGE_WEIGHTS);
  const totalOk = Math.abs(draftTotal - 100) < 5;

  return (
    <div className="border-b border-border/60 bg-secondary/20 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Model Weights
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${totalOk ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"}`}>
            {draftTotal}% total
          </span>
          {hasDraftChanges && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={isPreset}
            className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!hasDraftChanges}
            className="rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply Weights
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        {CATEGORIES.map((cat) => {
          const defs = PGA_WEIGHT_DEFINITIONS.filter((d) => d.category === cat);
          return (
            <div key={cat}>
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">{cat}</p>
              <div className="space-y-2.5">
                {defs.map((def) => (
                  <div key={def.key} className="flex items-center gap-2" title={def.label}>
                    <span className="w-[88px] shrink-0 truncate text-[10px] text-muted-foreground">{def.label}</span>
                    <input
                      type="range"
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      value={draftWeights[def.key]}
                      onChange={(e) => onWeightChange(def.key, Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="w-7 shrink-0 text-right text-[10px] font-semibold tabular-nums text-foreground">
                      {draftWeights[def.key]}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────
export default function PgaModelTable({
  rows, isFullPage = false, onExpandFullPage,
  draftWeights, appliedWeights, onWeightChange, onApply, onReset,
}: Props) {
  const [visibleStats, setVisibleStats] = useState<Set<StatColKey>>(
    new Set(["sgApproachRank", "par4Rank", "drivingAccuracyRank", "bogeyAvoidanceRank", "sgAroundGreenRank", "birdie125150Rank", "sgPuttingRank", "birdieUnder125Rank"])
  );
  const [showColPicker, setShowColPicker] = useState(false);

  const rankValues = rows
    .flatMap((row) => [row.trendRank, row.sgApproachRank, row.par4Rank, row.drivingAccuracyRank, row.bogeyAvoidanceRank, row.sgAroundGreenRank, row.birdie125150Rank, row.sgPuttingRank, row.birdieUnder125Rank])
    .filter((v): v is number => typeof v === "number");
  const maxRank = rankValues.length > 0 ? Math.max(...rankValues) : rows.length;

  function toggleStat(key: StatColKey) {
    setVisibleStats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); } else next.add(key);
      return next;
    });
  }

  const visibleCols = STAT_COLUMNS.filter((c) => visibleStats.has(c.key));
  const hasWeights = draftWeights && appliedWeights && onWeightChange && onApply && onReset;

  return (
    <section className="rounded-[30px] bg-card shadow-[0_2px_12px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">

      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">Harbour Town Model — Full Field</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Ranked by composite score · lower stat rank = better · hover column headers for full name</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{rows.length} golfers</span>

          {/* Column toggle dropdown */}
          <div className="relative">
            <button type="button" onClick={() => setShowColPicker((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
              Columns
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-2xl border border-border bg-card p-3 shadow-xl">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Toggle stat columns</p>
                {STAT_COLUMNS.map((col) => (
                  <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-secondary">
                    <input type="checkbox" checked={visibleStats.has(col.key)} onChange={() => toggleStat(col.key)} className="accent-primary" />
                    <span className="text-xs text-foreground">{col.tooltip.split(" — ")[0]}</span>
                  </label>
                ))}
                <button type="button" onClick={() => setShowColPicker(false)} className="mt-2 w-full rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent">Done</button>
              </div>
            )}
          </div>

          {/* Full page button */}
          {!isFullPage && onExpandFullPage && (
            <button type="button" onClick={onExpandFullPage} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
              </svg>
              Full Page
            </button>
          )}
        </div>
      </div>

      {/* Inline weight sliders */}
      {hasWeights && (
        <WeightSliderRow
          draftWeights={draftWeights!}
          appliedWeights={appliedWeights!}
          onWeightChange={onWeightChange!}
          onApply={onApply!}
          onReset={onReset!}
        />
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">No player rows available.</p>
          <p className="mt-1.5 text-xs text-muted-foreground">Check that rbc_data.json is in /public and reload.</p>
        </div>
      )}

      {/* Mobile cards */}
      {rows.length > 0 && (
        <div className="space-y-3 p-4 md:hidden">
          {rows.map((row) => <PgaModelMobileCard key={row.id} player={row} maxRank={maxRank} />)}
        </div>
      )}

      {/* Desktop table */}
      {rows.length > 0 && (
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ minWidth: "1100px" }}>
              <thead>
                {/* Section group headers */}
                <tr className="border-b border-border/50 bg-secondary/40">
                  <th colSpan={2} className="border-r border-border/30 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Rank</th>
                  <th colSpan={5} className="border-r border-border/30 bg-emerald-50/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">Harbour Town History</th>
                  <th colSpan={visibleCols.length} className="border-r border-border/30 bg-sky-50/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:bg-sky-950/20 dark:text-sky-400">Weighted Stats — Field Rank (lower = better)</th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-purple-700 dark:text-purple-400">Score</th>
                </tr>

                {/* Column headers with title tooltips */}
                <tr className="border-b-2 border-border bg-secondary/20">
                  <th title="Model rank based on composite score" className="w-10 px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">#</th>
                  <th title="Player name" className="min-w-[180px] px-3 py-2.5 text-left text-[11px] font-semibold text-foreground">Player</th>

                  {/* History column headers */}
                  {HISTORY_COLS.map((col, i) => (
                    <th
                      key={col.label}
                      title={col.tooltip}
                      className={`cursor-help px-2.5 py-2.5 text-center text-[11px] font-semibold text-emerald-700 underline decoration-dotted underline-offset-2 dark:text-emerald-400 ${i === 0 ? "border-l border-emerald-200/50 dark:border-emerald-900/50" : ""} ${i === 4 ? "border-r border-emerald-200/50 dark:border-emerald-900/50" : ""}`}
                    >
                      {col.label}
                    </th>
                  ))}

                  {/* Stat rank headers */}
                  {visibleCols.map((col, i) => (
                    <th
                      key={col.key}
                      title={col.tooltip}
                      className={`cursor-help px-2.5 py-2.5 text-center text-[11px] font-semibold text-sky-700 underline decoration-dotted underline-offset-2 dark:text-sky-400 ${i === 0 ? "border-l border-sky-200/50 dark:border-sky-900/50" : ""} ${i === visibleCols.length - 1 ? "border-r border-sky-200/50 dark:border-sky-900/50" : ""}`}
                    >
                      {col.abbr}
                    </th>
                  ))}

                  <th title="Composite model score — higher is better" className="px-3 py-2.5 text-center text-[11px] font-semibold text-purple-700 dark:text-purple-400">Score</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/40">
                {rows.map((row, idx) => {
                  const isTop5 = row.rank <= 5;
                  const isTop10 = row.rank <= 10;
                  return (
                    <tr key={row.id} className={`${idx % 2 !== 0 ? "bg-secondary/20" : ""} transition-colors hover:bg-accent/40 ${isTop5 ? "ring-inset ring-1 ring-emerald-200/60 dark:ring-emerald-900/40" : ""}`}>
                      {/* Rank */}
                      <td className="w-10 px-3 py-2 text-center">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${isTop5 ? "bg-emerald-600 text-white" : isTop10 ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                          {row.rank}
                        </span>
                      </td>

                      {/* Player — name only, no badge */}
                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{row.player}</span>
                      </td>

                      {/* DG Rank */}
                      <td className="border-l border-emerald-100/60 px-2.5 py-2 text-center text-[11px] text-muted-foreground dark:border-emerald-900/30">{row.trendRank ?? "—"}</td>
                      {/* HT Rounds */}
                      <td className="px-2.5 py-2 text-center text-[11px] text-foreground">{row.htRounds ?? "—"}</td>
                      {/* Masters */}
                      <td className={`px-2.5 py-2 text-center font-mono text-[11px] ${finishColor(row.masters2026)}`}>{row.masters2026 || "—"}</td>
                      {/* Cuts/5 */}
                      <td className="px-2.5 py-2 text-center text-[11px] font-medium text-foreground">{row.cutsLast5}</td>
                      {/* Course SG */}
                      <td className={`border-r border-emerald-100/60 px-2.5 py-2 text-center font-mono text-[11px] dark:border-emerald-900/30 ${csgColor(row.courseTrueSg)}`}>
                        {row.courseTrueSg != null ? row.courseTrueSg.toFixed(2) : "—"}
                      </td>

                      {/* Stat rank cells */}
                      {visibleCols.map((col, i) => {
                        const rank = row[col.key as keyof PlayerModelRow] as number | null;
                        return (
                          <td key={col.key} className={`px-2 py-2 text-center text-[11px] font-medium ${rankBg(rank, maxRank)} ${i === 0 ? "border-l border-sky-100/60 dark:border-sky-900/30" : ""} ${i === visibleCols.length - 1 ? "border-r border-sky-100/60 dark:border-sky-900/30" : ""}`}>
                            {rank ?? "—"}
                          </td>
                        );
                      })}

                      {/* Score */}
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block rounded-lg px-2 py-0.5 font-mono text-[11px] font-semibold ${isTop5 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : isTop10 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                          {row.score.toFixed(3)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
