import { useState } from "react";
import PgaModelMobileCard from "@/components/pga/PgaModelMobileCard";
import { areWeightsEqual, getWeightTotal } from "@/lib/pga/modelEngine";
import { getRankColor, RANK_COLOR_LEGEND } from "@/lib/pga/rankColors";
import { PGA_WEIGHT_DEFINITIONS } from "@/lib/pga/pgaWeights";
import type { PgaModelTableConfig, PlayerModelRow, PgaWeights } from "@/lib/pga/pgaTypes";

type Props = {
  rows: PlayerModelRow[];
  tableConfig: PgaModelTableConfig;
  isFullPage?: boolean;
  onExpandFullPage?: () => void;
  draftWeights?: PgaWeights;
  appliedWeights?: PgaWeights;
  selectedPreset?: string;
  activePreset?: string | null;
  draftPreset?: string | null;
  presetOptions?: Array<{
    key: string;
    label: string;
    description: string;
  }>;
  onPresetSelect?: (preset: string) => void;
  onWeightChange?: (key: keyof PgaWeights, value: number) => void;
  onApply?: () => void;
  onReset?: () => void;
};

type StatColKey = NonNullable<PgaModelTableConfig["statColumns"]>[number]["key"];
const CATEGORIES = ["Ball Striking", "Short Game", "Scoring", "Form"] as const;

function finishColor(val: string | null): string {
  if (!val || val === "—") return "text-muted-foreground";
  if (val === "CUT") return "text-red-500 dark:text-red-400";
  try {
    const n = parseInt(val.replace("T", ""), 10);
    if (n <= 5) return "font-semibold text-emerald-700 dark:text-emerald-400";
    if (n <= 20) return "text-sky-700 dark:text-sky-400";
  } catch {
    // Ignore parse failures and use the default text color.
  }
  return "text-foreground";
}

function courseHistoryColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 1.0) return "font-semibold text-emerald-700 dark:text-emerald-400";
  if (v > 0.3) return "text-emerald-600 dark:text-emerald-500";
  if (v >= 0) return "text-foreground";
  return "text-red-500 dark:text-red-400";
}

function WeightSliderRow({
  draftWeights,
  appliedWeights,
  selectedPreset,
  activePreset,
  draftPreset,
  presetOptions,
  onPresetSelect,
  onWeightChange,
  onApply,
  onReset,
}: {
  draftWeights: PgaWeights;
  appliedWeights: PgaWeights;
  selectedPreset: string;
  activePreset: string | null;
  draftPreset: string | null;
  presetOptions: Array<{
    key: string;
    label: string;
    description: string;
  }>;
  onPresetSelect: (preset: string) => void;
  onWeightChange: (key: keyof PgaWeights, value: number) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const draftTotal = getWeightTotal(draftWeights);
  const hasDraftChanges = !areWeightsEqual(draftWeights, appliedWeights);
  const totalOk = Math.abs(draftTotal - 100) < 5;
  const visibleActivePreset = presetOptions.find((preset) => preset.key === activePreset)?.label ?? "Custom";
  const visibleDraftPreset = presetOptions.find((preset) => preset.key === draftPreset)?.label ?? "Custom";
  const selectedPresetDescription = presetOptions.find((preset) => preset.key === selectedPreset)?.description;

  return (
    <div className="border-b border-border/60 bg-secondary/20 px-4 py-4 sm:px-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Model Weights</span>
          <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border/70">
            Active: {visibleActivePreset}
          </span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
            Draft: {visibleDraftPreset}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              totalOk
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
            }`}
          >
            {draftTotal}% total
          </span>
          {hasDraftChanges ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              Unsaved changes
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <label className="sr-only" htmlFor="pga-preset-select">
            Model preset
          </label>
          <select
            id="pga-preset-select"
            value={selectedPreset}
            onChange={(event) => onPresetSelect(event.target.value)}
            className="w-full min-w-0 rounded-full border border-border bg-card px-3 py-2 text-[11px] font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 sm:w-auto sm:py-1"
          >
            {presetOptions.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onReset}
              className="rounded-full border border-border bg-card px-3 py-2 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary sm:py-1"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={!hasDraftChanges}
              className="rounded-full bg-primary px-3 py-2 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 sm:py-1"
            >
              Apply Weights
            </button>
          </div>
        </div>
      </div>

      <p className="mb-4 text-[11px] leading-5 text-muted-foreground sm:max-w-[44rem]">
        Preset: <span className="font-medium text-foreground">{presetOptions.find((preset) => preset.key === selectedPreset)?.label}</span>{" "}
        {selectedPresetDescription}
      </p>

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {CATEGORIES.map((category) => {
          const defs = PGA_WEIGHT_DEFINITIONS.filter((definition) => definition.category === category);
          return (
            <div key={category} className="min-w-0">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">{category}</p>
              <div className="space-y-2.5">
                {defs.map((definition) => (
                  <div key={definition.key} className="min-w-0 overflow-hidden rounded-2xl bg-card/80 px-3 py-2.5" title={definition.label}>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-[10px] text-muted-foreground">{definition.label}</span>
                      <span className="shrink-0 text-right text-[10px] font-semibold tabular-nums text-foreground">
                        {draftWeights[definition.key]}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={definition.min}
                      max={definition.max}
                      step={definition.step}
                      value={draftWeights[definition.key]}
                      onChange={(event) => onWeightChange(definition.key, Number(event.target.value))}
                      className="mt-2 block h-2 w-full min-w-0 cursor-pointer accent-primary"
                    />
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

export default function PgaModelTable({
  rows,
  tableConfig,
  isFullPage = false,
  onExpandFullPage,
  draftWeights,
  appliedWeights,
  selectedPreset,
  activePreset,
  draftPreset,
  presetOptions,
  onPresetSelect,
  onWeightChange,
  onApply,
  onReset,
}: Props) {
  const [visibleStats, setVisibleStats] = useState<Set<StatColKey>>(new Set(tableConfig.statColumns.map((column) => column.key)));
  const [showColPicker, setShowColPicker] = useState(false);

  const rankValues = rows
    .flatMap((row) => [
      row.trendRank,
      row.sgApproachRank,
      row.par4Rank,
      row.drivingAccuracyRank,
      row.bogeyAvoidanceRank,
      row.sgAroundGreenRank,
      row.birdie125150Rank,
      row.sgPuttingRank,
      row.birdieUnder125Rank,
    ])
    .filter((value): value is number => typeof value === "number");
  const maxRank = rankValues.length > 0 ? Math.max(...rankValues) : rows.length;

  function toggleStat(key: StatColKey) {
    setVisibleStats((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const visibleCols = tableConfig.statColumns.filter((column) => visibleStats.has(column.key));
  const hasWeights =
    draftWeights &&
    appliedWeights &&
    selectedPreset &&
    presetOptions &&
    onPresetSelect &&
    onWeightChange &&
    onApply &&
    onReset;

  return (
    <section className="rounded-[30px] bg-card shadow-[0_2px_12px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
      <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">{tableConfig.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tableConfig.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{rows.length} golfers</span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColPicker((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
              Columns
            </button>
            {showColPicker ? (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-2xl border border-border bg-card p-3 shadow-xl">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Toggle stat columns
                </p>
                {tableConfig.statColumns.map((column) => (
                  <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-secondary">
                    <input
                      type="checkbox"
                      checked={visibleStats.has(column.key)}
                      onChange={() => toggleStat(column.key)}
                      className="accent-primary"
                    />
                    <span className="text-xs text-foreground">{column.tooltip.split(" — ")[0]}</span>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => setShowColPicker(false)}
                  className="mt-2 w-full rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent"
                >
                  Done
                </button>
              </div>
            ) : null}
          </div>

          {!isFullPage && onExpandFullPage ? (
            <button
              type="button"
              onClick={onExpandFullPage}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
              Full Page
            </button>
          ) : null}
        </div>
      </div>

      {hasWeights ? (
        <WeightSliderRow
          draftWeights={draftWeights}
          appliedWeights={appliedWeights}
          selectedPreset={selectedPreset}
          activePreset={activePreset ?? null}
          draftPreset={draftPreset ?? null}
          presetOptions={presetOptions}
          onPresetSelect={onPresetSelect}
          onWeightChange={onWeightChange}
          onApply={onApply}
          onReset={onReset}
        />
      ) : null}

      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">No player rows available.</p>
          <p className="mt-1.5 text-xs text-muted-foreground">Check that the tournament player data file is available and reload.</p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="space-y-3 p-4 md:hidden">
          {rows.map((row) => (
            <PgaModelMobileCard key={row.id} player={row} maxRank={maxRank} tableConfig={tableConfig} />
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="hidden md:block">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/40 px-4 py-3 text-[12px] text-muted-foreground sm:px-5">
            {RANK_COLOR_LEGEND.map((tier) => (
              <div key={tier.label} className="inline-flex items-center gap-2">
                <span className="inline-block h-[18px] w-[32px] rounded" style={{ background: tier.bg, border: tier.border ?? "none" }} />
                <span>{tier.label}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ minWidth: "1100px" }}>
              <thead>
                <tr className="border-b border-border/50 bg-secondary/40">
                  <th colSpan={2} className="border-r border-border/30 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Rank
                  </th>
                  <th colSpan={5} className="border-r border-border/30 bg-emerald-50/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                    {tableConfig.historySectionTitle}
                  </th>
                  <th colSpan={visibleCols.length} className="border-r border-border/30 bg-sky-50/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:bg-sky-950/20 dark:text-sky-400">
                    {tableConfig.statsSectionTitle}
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-purple-700 dark:text-purple-400">
                    {tableConfig.scoreSectionTitle}
                  </th>
                </tr>
                <tr className="border-b-2 border-border bg-secondary/20">
                  <th title="Model rank based on composite score" className="w-10 px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">
                    #
                  </th>
                  <th title="Player name" className="min-w-[180px] px-3 py-2.5 text-left text-[11px] font-semibold text-foreground">
                    Player
                  </th>
                  {[
                    [tableConfig.historyLabels.trendLabel, tableConfig.historyLabels.trendTooltip],
                    [tableConfig.historyLabels.courseRoundsLabel, tableConfig.historyLabels.courseRoundsTooltip],
                    [tableConfig.historyLabels.relatedEventLabel, tableConfig.historyLabels.relatedEventTooltip],
                    [tableConfig.historyLabels.cutsLabel, tableConfig.historyLabels.cutsTooltip],
                    [tableConfig.historyLabels.courseHistoryScoreLabel, tableConfig.historyLabels.courseHistoryScoreTooltip],
                  ].map(([label, tooltip], index) => (
                    <th
                      key={label}
                      title={tooltip}
                      className={`cursor-help px-2.5 py-2.5 text-center text-[11px] font-semibold text-emerald-700 underline decoration-dotted underline-offset-2 dark:text-emerald-400 ${
                        index === 0 ? "border-l border-emerald-200/50 dark:border-emerald-900/50" : ""
                      } ${index === 4 ? "border-r border-emerald-200/50 dark:border-emerald-900/50" : ""}`}
                    >
                      {label}
                    </th>
                  ))}
                  {visibleCols.map((column, index) => (
                    <th
                      key={column.key}
                      title={column.tooltip}
                      className={`cursor-help px-2.5 py-2.5 text-center text-[11px] font-semibold text-sky-700 underline decoration-dotted underline-offset-2 dark:text-sky-400 ${
                        index === 0 ? "border-l border-sky-200/50 dark:border-sky-900/50" : ""
                      } ${index === visibleCols.length - 1 ? "border-r border-sky-200/50 dark:border-sky-900/50" : ""}`}
                    >
                      {column.abbr}
                    </th>
                  ))}
                  <th title="Composite model score — higher is better" className="px-3 py-2.5 text-center text-[11px] font-semibold text-purple-700 dark:text-purple-400">
                    Score
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/40">
                {rows.map((row, index) => {
                  const isTop5 = row.rank <= 5;
                  const isTop10 = row.rank <= 10;

                  return (
                    <tr
                      key={row.id}
                      className={`${index % 2 !== 0 ? "bg-secondary/20" : ""} transition-colors hover:bg-accent/40 ${
                        isTop5 ? "ring-inset ring-1 ring-emerald-200/60 dark:ring-emerald-900/40" : ""
                      }`}
                    >
                      <td className="w-10 px-3 py-2 text-center">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                            isTop5 ? "bg-emerald-600 text-white" : isTop10 ? "bg-primary/15 text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {row.rank}
                        </span>
                      </td>

                      <td className="px-3 py-2">
                        <span className="font-medium text-foreground">{row.player}</span>
                      </td>

                      <td className="border-l border-emerald-100/60 px-2.5 py-2 text-center text-[11px] text-muted-foreground dark:border-emerald-900/30">
                        {row.trendRank ?? "—"}
                      </td>
                      <td className="px-2.5 py-2 text-center text-[11px] text-foreground">{row.courseHistoryRounds ?? "—"}</td>
                      <td className={`px-2.5 py-2 text-center font-mono text-[11px] ${finishColor(row.relatedEventFinish)}`}>
                        {row.relatedEventFinish || "—"}
                      </td>
                      <td className="px-2.5 py-2 text-center text-[11px] font-medium text-foreground">{row.cutsLastFive}</td>
                      <td className={`border-r border-emerald-100/60 px-2.5 py-2 text-center font-mono text-[11px] dark:border-emerald-900/30 ${courseHistoryColor(row.courseHistoryScore)}`}>
                        {row.courseHistoryScore != null ? row.courseHistoryScore.toFixed(2) : "—"}
                      </td>

                      {visibleCols.map((column, columnIndex) => {
                        const rank = row[column.key as keyof PlayerModelRow] as number | null;
                        const tone = getRankColor(rank, rows.length);
                        return (
                          <td
                            key={column.key}
                            className={`px-2 py-2 text-center ${
                              columnIndex === 0 ? "border-l border-sky-100/60 dark:border-sky-900/30" : ""
                            } ${columnIndex === visibleCols.length - 1 ? "border-r border-sky-100/60 dark:border-sky-900/30" : ""}`}
                          >
                            <span
                              style={{
                                background: tone.bg,
                                color: tone.text,
                                borderRadius: "5px",
                                display: "inline-block",
                                minWidth: "32px",
                                padding: "3px 6px",
                                fontWeight: 500,
                                fontSize: "12px",
                                textAlign: "center",
                              }}
                            >
                              {rank ?? "—"}
                            </span>
                          </td>
                        );
                      })}

                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block rounded-lg px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            isTop5 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : isTop10 ? "bg-primary/10 text-primary" : "text-muted-foreground"
                          }`}
                        >
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
      ) : null}
    </section>
  );
}
