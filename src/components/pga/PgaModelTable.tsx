import { useState } from "react";
import PgaModelMobileCard from "@/components/pga/PgaModelMobileCard";
import type { PlayerModelRow } from "@/lib/pga/pgaTypes";

type Props = {
  rows: PlayerModelRow[];
  isFullPage?: boolean;
  onExpandFullPage?: () => void;
};

// ── Rank color helper (green = low rank = best) ───────────────────────
function rankBg(rank: number | null, max: number): string {
  if (rank == null) return "";
  const pct = rank / max;
  if (pct <= 0.2)  return "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
  if (pct <= 0.4)  return "bg-green-50 text-green-800 dark:bg-green-950/50 dark:text-green-400";
  if (pct <= 0.6)  return "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300";
  if (pct <= 0.8)  return "bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400";
  return "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-400";
}

function finishColor(val: string | null): string {
  if (!val || val === "—") return "text-muted-foreground";
  if (val === "CUT") return "text-red-500 dark:text-red-400";
  try {
    const n = parseInt(val.replace("T", ""));
    if (n <= 5)  return "font-semibold text-emerald-700 dark:text-emerald-400";
    if (n <= 20) return "text-sky-700 dark:text-sky-400";
  } catch { /* ignore */ }
  return "text-foreground";
}

function mastersGroupPill(group: string | null) {
  if (!group) return null;
  const styles: Record<string, string> = {
    "T6-15":  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300",
    "MC":     "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300",
    "DNP":    "bg-secondary text-muted-foreground",
    "T16-25": "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300",
    "T26-54": "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
    "T1-5":   "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  };
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${styles[group] ?? "bg-secondary text-muted-foreground"}`}>
      {group}
    </span>
  );
}

function csgColor(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v > 1.0) return "font-semibold text-emerald-700 dark:text-emerald-400";
  if (v > 0.3) return "text-emerald-600 dark:text-emerald-500";
  if (v >= 0)  return "text-foreground";
  return "text-red-500 dark:text-red-400";
}

// ── Column definitions ────────────────────────────────────────────────
const STAT_COLUMNS = [
  { key: "sgApproachRank",      label: "SG: App",     abbr: "App" },
  { key: "par4Rank",            label: "Par 4",       abbr: "P4" },
  { key: "drivingAccuracyRank", label: "Drive Acc",   abbr: "DA" },
  { key: "bogeyAvoidanceRank",  label: "Bogey Av",    abbr: "BAvd" },
  { key: "sgAroundGreenRank",   label: "SG: ARG",     abbr: "ARG" },
  { key: "birdie125150Rank",    label: "BB 125-150",  abbr: "125" },
  { key: "sgPuttingRank",       label: "SG: Putt",    abbr: "Putt" },
  { key: "birdieUnder125Rank",  label: "BB <125",     abbr: "<125" },
] as const;

type StatColKey = typeof STAT_COLUMNS[number]["key"];

export default function PgaModelTable({ rows, isFullPage = false, onExpandFullPage }: Props) {
  const [visibleStats, setVisibleStats] = useState<Set<StatColKey>>(
    new Set(["sgApproachRank", "par4Rank", "drivingAccuracyRank", "bogeyAvoidanceRank", "sgAroundGreenRank", "birdie125150Rank", "sgPuttingRank", "birdieUnder125Rank"])
  );
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
    .filter((v): v is number => typeof v === "number");
  const maxRank = rankValues.length > 0 ? Math.max(...rankValues) : rows.length;

  function toggleStat(key: StatColKey) {
    setVisibleStats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // keep at least 1
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const visibleCols = STAT_COLUMNS.filter((c) => visibleStats.has(c.key));

  // Estimated min-width: 40px rank + 160px player + 60px each stat + history cols
  const tableMinWidth = 40 + 160 + 70 + 70 + 60 + 60 + 60*5 + 80 + 70*visibleCols.length + 80 + 70;

  return (
    <section className="rounded-[30px] bg-card shadow-[0_2px_12px_hsl(var(--foreground)/0.06)] ring-1 ring-border/60">
      {/* ── Section header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">
            Harbour Town Model — Full Field
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ranked by composite score · lower stat rank = better · green heatmap
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{rows.length} golfers</span>

          {/* Column toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColPicker((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
              Columns
            </button>
            {showColPicker && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-52 rounded-2xl border border-border bg-card p-3 shadow-xl">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Toggle stat columns
                </p>
                {STAT_COLUMNS.map((col) => (
                  <label key={col.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-secondary">
                    <input
                      type="checkbox"
                      checked={visibleStats.has(col.key)}
                      onChange={() => toggleStat(col.key)}
                      className="accent-primary"
                    />
                    <span className="text-xs text-foreground">{col.label}</span>
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
            )}
          </div>

          {/* Full-page button — only show in normal mode */}
          {!isFullPage && onExpandFullPage && (
            <button
              type="button"
              onClick={onExpandFullPage}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
              </svg>
              Full Page
            </button>
          )}
        </div>
      </div>

      {/* ── Empty state ── */}
      {rows.length === 0 && (
        <div className="px-5 py-12 text-center">
          <p className="text-sm font-medium text-foreground">No player rows available.</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Check that rbc_data.json is in the /public folder and reload.
          </p>
        </div>
      )}

      {/* ── Mobile cards ── */}
      {rows.length > 0 && (
        <div className="space-y-3 p-4 md:hidden">
          {rows.map((row) => (
            <PgaModelMobileCard key={row.id} player={row} maxRank={maxRank} />
          ))}
        </div>
      )}

      {/* ── Desktop table ── */}
      {rows.length > 0 && (
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ minWidth: `${tableMinWidth}px` }}>
              <thead>
                {/* Section group row */}
                <tr className="border-b border-border/50 bg-secondary/40">
                  <th colSpan={2} className="border-r border-border/30 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Rank
                  </th>
                  <th colSpan={5} className="border-r border-border/30 bg-emerald-50/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                    Harbour Town History
                  </th>
                  <th
                    colSpan={visibleCols.length + 1}
                    className="border-r border-border/30 bg-sky-50/60 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:bg-sky-950/20 dark:text-sky-400"
                  >
                    Weighted Stats — Field Rank (lower = better)
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-purple-700 dark:text-purple-400">
                    Score
                  </th>
                </tr>

                {/* Column headers */}
                <tr className="border-b-2 border-border bg-secondary/20">
                  <th className="w-10 px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">#</th>
                  <th className="min-w-[160px] px-3 py-2.5 text-left text-[11px] font-semibold text-foreground">Player</th>

                  {/* HT History */}
                  <th className="border-l border-emerald-200/50 px-2.5 py-2.5 text-center text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400">
                    DG Rank
                  </th>
                  <th className="px-2.5 py-2.5 text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    HT Rnds
                  </th>
                  <th className="px-2.5 py-2.5 text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Masters
                  </th>
                  <th className="px-2.5 py-2.5 text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Cuts/5
                  </th>
                  <th className="border-r border-emerald-200/50 px-2.5 py-2.5 text-center text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400">
                    Course SG
                  </th>

                  {/* Stat rank columns */}
                  {visibleCols.map((col, i) => (
                    <th
                      key={col.key}
                      className={`px-2.5 py-2.5 text-center text-[11px] font-semibold text-sky-700 dark:text-sky-400 ${i === 0 ? "border-l border-sky-200/50 dark:border-sky-900/50" : ""} ${i === visibleCols.length - 1 ? "border-r border-sky-200/50 dark:border-sky-900/50" : ""}`}
                      title={col.label}
                    >
                      {col.abbr}
                    </th>
                  ))}

                  {/* Score */}
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-purple-700 dark:text-purple-400">
                    Score
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/40">
                {rows.map((row, idx) => {
                  const isEven = idx % 2 === 0;
                  const rowBg = isEven ? "" : "bg-secondary/20";
                  const isTop5 = row.rank <= 5;
                  const isTop10 = row.rank <= 10;

                  return (
                    <tr
                      key={row.id}
                      className={`${rowBg} transition-colors hover:bg-accent/40 ${isTop5 ? "ring-inset ring-1 ring-emerald-200/60 dark:ring-emerald-900/40" : ""}`}
                    >
                      {/* Rank */}
                      <td className="w-10 px-3 py-2 text-center">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                            isTop5
                              ? "bg-emerald-600 text-white"
                              : isTop10
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground"
                          }`}
                        >
                          {row.rank}
                        </span>
                      </td>

                      {/* Player name + Masters group badge */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">{row.player}</span>
                          {row.masters2026 && (
                            <div className="flex items-center gap-1">
                              {mastersGroupPill(row.masters2026 === "CUT" ? "MC" :
                                (() => {
                                  try {
                                    const n = parseInt((row.masters2026 ?? "").replace("T", ""));
                                    if (n <= 5) return "T1-5";
                                    if (n <= 15) return "T6-15";
                                    if (n <= 25) return "T16-25";
                                    return "T26-54";
                                  } catch { return null; }
                                })()
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* DG Trend Rank */}
                      <td className="border-l border-emerald-100/60 px-2.5 py-2 text-center text-[11px] text-muted-foreground dark:border-emerald-900/30">
                        {row.trendRank ?? "—"}
                      </td>

                      {/* HT Rounds */}
                      <td className="px-2.5 py-2 text-center text-[11px] text-foreground">
                        {row.htRounds ?? "—"}
                      </td>

                      {/* Masters 2026 result */}
                      <td className={`px-2.5 py-2 text-center font-mono text-[11px] ${finishColor(row.masters2026)}`}>
                        {row.masters2026 || "—"}
                      </td>

                      {/* Cuts last 5 */}
                      <td className="px-2.5 py-2 text-center text-[11px] font-medium text-foreground">
                        {row.cutsLast5}
                      </td>

                      {/* Course True SG */}
                      <td className={`border-r border-emerald-100/60 px-2.5 py-2 text-center font-mono text-[11px] dark:border-emerald-900/30 ${csgColor(row.courseTrueSg)}`}>
                        {row.courseTrueSg != null ? row.courseTrueSg.toFixed(2) : "—"}
                      </td>

                      {/* Stat rank cells */}
                      {visibleCols.map((col, i) => {
                        const rank = row[col.key as keyof PlayerModelRow] as number | null;
                        return (
                          <td
                            key={col.key}
                            className={`px-2 py-2 text-center text-[11px] font-medium ${rankBg(rank, maxRank)} ${i === 0 ? "border-l border-sky-100/60 dark:border-sky-900/30" : ""} ${i === visibleCols.length - 1 ? "border-r border-sky-100/60 dark:border-sky-900/30" : ""}`}
                          >
                            {rank ?? "—"}
                          </td>
                        );
                      })}

                      {/* Composite score */}
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block rounded-lg px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            isTop5
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : isTop10
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground"
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
      )}
    </section>
  );
}
