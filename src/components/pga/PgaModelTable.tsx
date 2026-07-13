import { useState } from "react";
import { areWeightsEqual, getWeightTotal } from "@/lib/pga/modelEngine";
import { getRankColor } from "@/lib/pga/rankColors";
import { PGA_CUSTOM_MODEL_KEY, PGA_TOP_20_PROFILE_KEY, PGA_WEIGHT_DEFINITIONS } from "@/lib/pga/pgaWeights";
import type { PgaModelTableConfig, PlayerModelRow, PgaWeights } from "@/lib/pga/pgaTypes";

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseFinishNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).trim().toUpperCase().replace(/^T/, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function finishCellStyle(v: string | null | undefined): string {
  const n = parseFinishNum(v);
  if (n == null) return "text-muted-foreground/40";
  if (n <= 5)  return "bg-emerald-100 text-emerald-800 font-bold rounded";
  if (n <= 15) return "bg-emerald-50 text-emerald-700 font-semibold rounded";
  if (n <= 30) return "bg-amber-50 text-amber-700 rounded";
  return "bg-red-50 text-red-700 rounded";
}

function courseHistoryColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 1.0) return "font-semibold text-emerald-700 dark:text-emerald-400";
  if (v > 0.3) return "text-emerald-600 dark:text-emerald-500";
  if (v >= 0)  return "text-foreground";
  return "text-red-500 dark:text-red-400";
}

// ─── types ───────────────────────────────────────────────────────────────────

type StatColKey = NonNullable<PgaModelTableConfig["statColumns"]>[number]["key"];
type ViewMode = "model" | "history";

type Props = {
  rows: PlayerModelRow[];
  tableConfig: PgaModelTableConfig;
  isFullPage?: boolean;
  onExpandFullPage?: () => void;
  draftWeights?: PgaWeights;
  appliedWeights?: PgaWeights;
  selectedPreset?: string;
  activeModelLabel?: string;
  presetOptions?: Array<{ key: string; label: string; description: string }>;
  onPresetSelect?: (preset: string) => void;
  onWeightChange?: (key: keyof PgaWeights, value: number) => void;
  onApply?: () => void;
  onNormalize?: () => void;
  onLoadTop20?: () => void;
  onReset?: () => void;
};

// ─── Weight sliders (unchanged) ──────────────────────────────────────────────

const CATEGORIES = ["Ball Striking", "Short Game", "Scoring", "Form"] as const;

export function PgaModelControls({
  draftWeights, appliedWeights, selectedPreset, activeModelLabel,
  presetOptions, onPresetSelect, onWeightChange, onApply, onNormalize, onLoadTop20, onReset,
}: {
  draftWeights: PgaWeights; appliedWeights: PgaWeights; selectedPreset: string;
  activeModelLabel: string;
  presetOptions: Array<{ key: string; label: string; description: string }>;
  onPresetSelect: (preset: string) => void;
  onWeightChange: (key: keyof PgaWeights, value: number) => void;
  onApply: () => void; onNormalize: () => void; onLoadTop20: () => void; onReset: () => void;
}) {
  const draftTotal = getWeightTotal(draftWeights);
  const hasDraftChanges = !areWeightsEqual(draftWeights, appliedWeights);
  const totalOk = Math.abs(draftTotal - 100) < 0.001;
  const canApply = draftTotal > 0 && Number.isFinite(draftTotal);
  const isCustom = selectedPreset === PGA_CUSTOM_MODEL_KEY;
  const selectedPresetDescription = presetOptions.find((p) => p.key === selectedPreset)?.description;
  const isTop20Profile = selectedPreset === PGA_TOP_20_PROFILE_KEY;

  return (
    <div className="border-b border-border/60 bg-secondary/20 px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active Model</span>
          <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border/70">{activeModelLabel}</span>
          {isCustom ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${totalOk ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{formatWeight(draftTotal)}% total</span> : null}
          {isCustom && hasDraftChanges ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Unapplied changes</span> : null}
        </div>
        <div className="min-w-0 sm:min-w-52">
          <label className="sr-only" htmlFor="pga-preset-select">Model preset</label>
          <select
            id="pga-preset-select" value={selectedPreset}
            onChange={(e) => onPresetSelect(e.target.value)}
            className="w-full min-w-0 rounded-full border border-border bg-card px-3 py-2 text-[11px] font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 sm:py-1.5"
          >
            {presetOptions.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            <option value={PGA_CUSTOM_MODEL_KEY}>Custom Model</option>
          </select>
        </div>
      </div>

      {!isCustom ? (
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground sm:max-w-[52rem]">
          {isTop20Profile
            ? "Top 20 Profile emphasizes the existing model categories most associated with strong, high-floor placement performance. It is a comparative rating, not a predicted probability."
            : selectedPresetDescription}
          {isTop20Profile ? <span className="mt-1 block text-[10px]">Methodology: This is a comparative model rating, not a calibrated Top 20 probability or fair betting price.</span> : null}
        </p>
      ) : (
        <details open className="mt-3 rounded-2xl border border-border/70 bg-card/60 px-3 py-3 sm:px-4">
          <summary className="cursor-pointer text-[11px] font-semibold text-foreground">Edit Weights</summary>
          <div className="mt-3 flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className={`text-[10px] ${totalOk ? "text-muted-foreground" : "font-medium text-amber-700"}`} role={totalOk ? undefined : "alert"}>
              {totalOk ? "Weights total 100%." : `Weights total ${formatWeight(draftTotal)}%. Normalize manually or Apply to normalize to 100%.`}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button type="button" onClick={onLoadTop20} className="rounded-full border border-border bg-card px-3 py-2 text-[10px] font-medium text-foreground transition hover:bg-secondary sm:py-1.5">Load Top 20</button>
              <button type="button" onClick={onNormalize} disabled={!canApply || totalOk} className="rounded-full border border-border bg-card px-3 py-2 text-[10px] font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">Normalize</button>
              <button type="button" onClick={onReset} className="rounded-full border border-border bg-card px-3 py-2 text-[10px] font-medium text-muted-foreground transition hover:bg-secondary sm:py-1.5">Reset Default</button>
              <button type="button" onClick={onApply} disabled={!canApply || !hasDraftChanges} className="rounded-full bg-primary px-3 py-2 text-[10px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">Apply</button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
            {CATEGORIES.map((category) => (
              <div key={category} className="min-w-0">
                <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">{category}</p>
                <div className="grid grid-cols-2 gap-2 sm:block sm:space-y-2">
                  {PGA_WEIGHT_DEFINITIONS.filter((definition) => definition.category === category).map((definition) => (
                    <div key={definition.key} className="min-w-0 rounded-xl bg-card px-3 py-2" title={definition.label}>
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <label htmlFor={`pga-weight-${definition.key}`} className="min-w-0 truncate text-[10px] text-muted-foreground">{definition.label}</label>
                        <div className="flex shrink-0 items-center gap-1">
                          <input
                            id={`pga-weight-${definition.key}`}
                            aria-label={`${definition.label} weight`}
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={draftWeights[definition.key]}
                            onChange={(event) => {
                              const value = event.currentTarget.valueAsNumber;
                              if (Number.isFinite(value) && value >= 0 && value <= 100) {
                                onWeightChange(definition.key, value);
                                return;
                              }
                              event.currentTarget.value = String(draftWeights[definition.key]);
                            }}
                            className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-right text-[10px] font-semibold tabular-nums text-foreground"
                          />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                      </div>
                      <input
                        aria-label={`${definition.label} weight slider`}
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={draftWeights[definition.key]}
                        onChange={(event) => onWeightChange(definition.key, event.currentTarget.valueAsNumber)}
                        className="mt-2 hidden h-2 w-full min-w-0 cursor-pointer accent-primary sm:block"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function formatWeight(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

// ─── Compact rank badge (matches hub style) ───────────────────────────────────

function RankBadge({ rank, fieldSize }: { rank: number | null; fieldSize: number }) {
  if (rank == null) return <span className="text-slate-300 text-[11px]">—</span>;
  const tone = getRankColor(rank, fieldSize);
  return (
    <span style={{ background: tone.bg, color: tone.text, borderRadius: 4, display: "inline-block",
      minWidth: 28, padding: "2px 5px", fontWeight: 600, fontSize: 11, textAlign: "center" }}>
      {rank}
    </span>
  );
}

// ─── Score pill ───────────────────────────────────────────────────────────────

function ScorePill({ score, rank }: { score: number; rank: number }) {
  const isTop5  = rank <= 5;
  const isTop10 = rank <= 10;
  const bg    = isTop5  ? "#16a34a" : isTop10 ? "rgba(22,163,74,0.15)" : "rgba(148,163,184,0.15)";
  const color = isTop5  ? "#fff"    : isTop10 ? "#15803d"               : "#475569";
  return (
    <span style={{ background: bg, color, borderRadius: 999, display: "inline-block",
      padding: "2px 8px", fontWeight: 900, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
      {score.toFixed(2)}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PgaModelTable({
  rows, tableConfig, isFullPage = false, onExpandFullPage,
  draftWeights, appliedWeights, selectedPreset, activeModelLabel,
  presetOptions, onPresetSelect, onWeightChange, onApply, onNormalize, onLoadTop20, onReset,
}: Props) {
  const [view, setView]               = useState<ViewMode>("model");
  const [visibleStats, setVisibleStats] = useState<Set<StatColKey>>(
    new Set(tableConfig.statColumns.map((c) => c.key))
  );
  const [showColPicker, setShowColPicker] = useState(false);

  const historyYears = ["2025", "2024", "2023", "2022", "2021"] as const;
  const fieldSize = rows.length || 156;

  const courseHistoryRows = [...rows].sort((a, b) => {
    if (a.avgFinish == null && b.avgFinish == null) return 0;
    if (a.avgFinish == null) return 1;
    if (b.avgFinish == null) return -1;
    return a.avgFinish - b.avgFinish;
  });

  const visibleCols = tableConfig.statColumns.filter((c) => visibleStats.has(c.key));

  function toggleStat(key: StatColKey) {
    setVisibleStats((cur) => {
      const next = new Set(cur);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  }

  const hasWeights = draftWeights && appliedWeights && selectedPreset &&
    activeModelLabel && presetOptions && onPresetSelect && onWeightChange && onApply && onNormalize && onLoadTop20 && onReset;

  return (
    <section className="rounded-[30px] bg-card shadow-[0_2px_12px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">

      {/* ── Header bar ── */}
      <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-[-0.02em] text-foreground">{tableConfig.title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{tableConfig.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{rows.length} golfers</span>

          {/* View toggle */}
          <div className="flex rounded-full border border-border bg-secondary p-0.5 text-[11px]">
            <button type="button" onClick={() => setView("model")}
              className={`rounded-full px-3 py-1 font-medium transition ${view === "model" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Model
            </button>
            <button type="button" onClick={() => setView("history")}
              className={`rounded-full px-3 py-1 font-medium transition ${view === "history" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              History
            </button>
          </div>

          {/* Column picker (model view only) */}
          {view === "model" && (
            <div className="relative">
              <button type="button" onClick={() => setShowColPicker((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-[11px] font-medium text-foreground transition hover:bg-accent">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
                Cols
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-2xl border border-border bg-card p-3 shadow-xl">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Toggle columns</p>
                  {tableConfig.statColumns.map((col) => (
                    <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-secondary">
                      <input type="checkbox" checked={visibleStats.has(col.key)} onChange={() => toggleStat(col.key)} className="accent-primary" />
                      <span className="text-[11px] text-foreground">{col.tooltip.split(" — ")[0]}</span>
                    </label>
                  ))}
                  <button type="button" onClick={() => setShowColPicker(false)}
                    className="mt-2 w-full rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-medium text-foreground transition hover:bg-accent">Done</button>
                </div>
              )}
            </div>
          )}

          {!isFullPage && onExpandFullPage && (
            <button type="button" onClick={onExpandFullPage}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
              </svg>
              Full Page
            </button>
          )}
        </div>
      </div>

      {/* ── Weight sliders ── */}
      {hasWeights && (
        <PgaModelControls
          draftWeights={draftWeights!} appliedWeights={appliedWeights!}
          selectedPreset={selectedPreset!} activeModelLabel={activeModelLabel!}
          presetOptions={presetOptions!}
          onPresetSelect={onPresetSelect!} onWeightChange={onWeightChange!}
          onApply={onApply!} onNormalize={onNormalize!} onLoadTop20={onLoadTop20!} onReset={onReset!} />
      )}

      {/* ── Empty state ── */}
      {rows.length === 0 && (
        <div className="px-5 py-12 text-center border-t border-border/40">
          <p className="text-sm font-medium text-foreground">Model ready with placeholder presets</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground max-w-md mx-auto">
            Real player rankings will appear once the weekly data file is populated.
          </p>
        </div>
      )}

      {/* ── Compact table (all screen sizes) ── */}
      {rows.length > 0 && (
        <div className="overflow-x-auto">

          {/* MODEL VIEW */}
          {view === "model" && (
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="sticky left-0 z-30 bg-slate-50 px-2 py-2 w-8">#</th>
                  <th className="sticky left-8 z-30 bg-slate-50 px-2 py-2 min-w-[130px] border-r border-slate-200">Player</th>
                  {visibleCols.map((col) => (
                    <th key={col.key} title={col.tooltip} className="px-2 py-2 whitespace-nowrap text-center cursor-help">{col.abbr}</th>
                  ))}
                  <th className="px-2 py-2 whitespace-nowrap text-center">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const sbg = i % 2 === 0 ? "bg-white" : "bg-slate-50";
                  return (
                    <tr key={row.id} className={`${sbg} hover:bg-emerald-50/30`}>
                      {/* Rank */}
                      <td className={`sticky left-0 z-20 border-b border-slate-100 px-2 py-1.5 ${sbg}`}>
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold
                          ${row.rank <= 5 ? "bg-emerald-600 text-white" : row.rank <= 10 ? "bg-primary/15 text-primary" : "text-slate-400"}`}>
                          {row.rank}
                        </span>
                      </td>
                      {/* Player */}
                      <td className={`sticky left-8 z-20 border-b border-r border-slate-100 px-2 py-1.5 font-semibold text-slate-900 whitespace-nowrap ${sbg}`}>
                        {row.player}
                      </td>
                      {/* Stat rank cols */}
                      {visibleCols.map((col) => {
                        const rank = row[col.key as keyof PlayerModelRow] as number | null;
                        return (
                          <td key={col.key} className="border-b border-slate-100 px-1.5 py-1.5 text-center">
                            <RankBadge rank={rank} fieldSize={fieldSize} />
                          </td>
                        );
                      })}
                      {/* Score */}
                      <td className="border-b border-slate-100 px-2 py-1.5 text-center">
                        <ScorePill score={row.score} rank={row.rank} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* HISTORY VIEW */}
          {view === "history" && (
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="sticky left-0 z-30 bg-slate-50 px-2 py-2 w-8">#</th>
                  <th className="sticky left-8 z-30 bg-slate-50 px-2 py-2 min-w-[130px] border-r border-slate-200">Player</th>
                  {historyYears.map((y) => (
                    <th key={y} className="px-2 py-2 text-center whitespace-nowrap">{y}</th>
                  ))}
                  <th className="px-2 py-2 text-center whitespace-nowrap text-amber-600">Avg</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">Rnds</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap text-emerald-700">SG</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">Rank</th>
                </tr>
              </thead>
              <tbody>
                {courseHistoryRows.map((row, i) => {
                  const sbg = i % 2 === 0 ? "bg-white" : "bg-slate-50";
                  return (
                    <tr key={row.id} className={`${sbg} hover:bg-emerald-50/30`}>
                      <td className={`sticky left-0 z-20 border-b border-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-400 ${sbg}`}>{i + 1}</td>
                      <td className={`sticky left-8 z-20 border-b border-r border-slate-100 px-2 py-1.5 font-semibold text-slate-900 whitespace-nowrap ${sbg}`}>{row.player}</td>
                      {historyYears.map((_, yi) => {
                        const v = row.recentFinishes[yi];
                        return (
                          <td key={yi} className="border-b border-slate-100 px-1.5 py-1.5 text-center">
                            {v ? <span className={`inline-block px-1 py-0.5 text-[11px] ${finishCellStyle(v)}`}>{v}</span>
                               : <span className="text-slate-200 text-[11px]">—</span>}
                          </td>
                        );
                      })}
                      <td className="border-b border-slate-100 px-2 py-1.5 text-center bg-amber-50/30">
                        <span className={`text-[11px] font-bold ${row.avgFinish != null && row.avgFinish <= 15 ? "text-amber-700" : "text-slate-400"}`}>
                          {row.avgFinish != null ? row.avgFinish.toFixed(1) : "—"}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 text-center text-[11px] text-slate-400">{row.courseHistoryRounds ?? "—"}</td>
                      <td className={`border-b border-slate-100 px-2 py-1.5 text-center font-mono text-[11px] ${courseHistoryColor(row.courseHistoryScore)}`}>
                        {row.courseHistoryScore != null ? row.courseHistoryScore.toFixed(2) : "—"}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-1.5 text-center text-[11px] font-bold text-slate-400">{row.rank}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

        </div>
      )}
    </section>
  );
}
