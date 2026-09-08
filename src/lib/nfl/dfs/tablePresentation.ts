import type { CSSProperties } from "react";
import type { DfsEnrichedAnalyzerRow } from "./slateAnalyzer";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { computePercentileRanks, computePpgPercentiles, resolvePercentileDisplay, weeklyHeatStyle, weeklyRankHeatTone } from "@/lib/shared/jkbHeat";
// Same categorical hues as POSITION_TONES; FLEX and DST extend the roster vocabulary.
export const DFS_POSITION_ACCENT = { QB: "border-l-sky-400", RB: "border-l-emerald-400", WR: "border-l-violet-400", TE: "border-l-orange-400", FLEX: "border-l-amber-400", DST: "border-l-slate-500" } as const;

export function dfsWeeklyRankStyle(row: DfsEnrichedAnalyzerRow, projections: readonly WeeklyFantasyProjectionProductionRow[]) {
  const pool = projections.filter(entry => entry.position === row.position).length;
  return weeklyHeatStyle(weeklyRankHeatTone(row.jkbWeeklyPositionRank, pool));
}

/** Presentation percentiles across the unfiltered uploaded position pool; no ranks or model values change. */
export function dfsValueStyles(rows: readonly DfsEnrichedAnalyzerRow[], value: (row: DfsEnrichedAnalyzerRow) => number | null, benchmark = false): Map<string, CSSProperties> {
  const styles = new Map<string, CSSProperties>();
  for (const position of ["QB", "RB", "WR", "TE", "DST"] as const) {
    const pool = rows.filter(row => row.position === position);
    const values = pool.map(value);
    // TABLE_CONVENTIONS F: large populations use n; small position pools use n-1.
    const percentiles = values.filter(entry => entry != null && Number.isFinite(entry)).length >= 100
      ? new Map(computePercentileRanks(values).map((percentile, i) => [pool[i].dkId, percentile]))
      : computePpgPercentiles(pool.map(row => ({ key: row.dkId, projectedPpg: value(row) })));
    for (const row of pool) {
      const style = resolvePercentileDisplay({ value: value(row), percentile: percentiles.get(row.dkId), direction: "higherBetter", bypassSampleGate: !benchmark }).style;
      if (style) styles.set(row.dkId, style);
    }
  }
  return styles;
}
