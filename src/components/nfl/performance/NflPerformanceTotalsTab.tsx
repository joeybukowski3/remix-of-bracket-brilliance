import { useMemo, useState } from "react";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import NflPerformanceKpiStrip, { type NflKpiItem } from "./NflPerformanceKpiStrip";
import NflPerformanceEmptyState from "./NflPerformanceEmptyState";
import NflPerformanceTotalsTable from "./NflPerformanceTotalsTable";
import { formatCount, formatMetric, formatPercent, formatSigned } from "@/lib/nfl/performance/format";
import {
  applyTotalsFilters,
  DEFAULT_TOTALS_FILTERS,
  nextTotalsSort,
  sortTotalsRows,
  type TotalsFilters,
  type TotalsSortKey,
  type TotalsSortState,
} from "@/lib/nfl/performance/totalsFilters";
import type { NflPerformanceArtifactState } from "@/hooks/useNflPerformanceArtifact";
import type { DirectionalResult, MarketDirection, NflTotalsPerformanceArtifact } from "@/types/nfl/performance";

const RESULT_OPTIONS: readonly (DirectionalResult | "all")[] = ["all", "WIN", "LOSS", "PUSH", "NEUTRAL"];
const DIRECTION_OPTIONS: readonly (MarketDirection | "all")[] = ["all", "JKB_OVER", "JKB_UNDER", "NEUTRAL"];

export default function NflPerformanceTotalsTab({
  state,
}: {
  state: NflPerformanceArtifactState<NflTotalsPerformanceArtifact>;
}) {
  const [filters, setFilters] = useState<TotalsFilters>(DEFAULT_TOTALS_FILTERS);
  const [sort, setSort] = useState<TotalsSortState>({ key: "week", direction: "asc" });

  const weekOptions = useMemo(() => {
    if (!state.data) return [];
    return [...new Set(state.data.rows.map((r) => r.week))].sort((a, b) => a - b);
  }, [state.data]);

  const projectedBucketOptions = useMemo(() => {
    if (!state.data) return [];
    return [...new Set(state.data.rows.map((r) => r.projected_total_bucket).filter((v): v is string => v != null))];
  }, [state.data]);

  const diffBucketOptions = useMemo(() => {
    if (!state.data) return [];
    return [...new Set(state.data.rows.map((r) => r.jkb_market_difference_bucket).filter((v): v is string => v != null))];
  }, [state.data]);

  const filteredRows = useMemo(() => {
    if (!state.data) return [];
    return applyTotalsFilters(state.data.rows, filters);
  }, [state.data, filters]);

  const sortedRows = useMemo(() => sortTotalsRows(filteredRows, sort), [filteredRows, sort]);

  const handleSort = (key: TotalsSortKey) => setSort((current) => nextTotalsSort(current, key, key === "week" ? "asc" : "desc"));

  if (state.loading) return <p className="text-sm text-slate-500">Loading totals performance…</p>;
  if (state.error || !state.data) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        Could not load totals performance. Please try again later.
      </p>
    );
  }

  const { summary } = state.data;
  const kpis: NflKpiItem[] = [
    { key: "graded", label: "Graded Games", value: formatCount(summary.graded_games) },
    { key: "mae", label: "Game Total MAE", value: formatMetric(summary.game_total_mae) },
    { key: "team-mae", label: "Team Score MAE", value: formatMetric(summary.team_score_mae) },
    { key: "bias", label: "Bias", value: formatSigned(summary.mean_signed_error) },
    { key: "corr", label: "Correlation", value: formatMetric(summary.correlation_projected_actual, 2) },
    { key: "hit-rate", label: "Directional Hit Rate", value: formatPercent(summary.directional_hit_rate) },
  ];

  return (
    <div className="space-y-4">
      <NflPerformanceKpiStrip items={kpis} />

      {summary.graded_games === 0 ? (
        <NflPerformanceEmptyState description="Totals results will populate as 2026 games are completed and graded." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <NflFilterChips label="Week" options={["all", ...weekOptions]} value={filters.week} onChange={(v) => setFilters((f) => ({ ...f, week: v }))} formatOption={(o) => (o === "all" ? "All Weeks" : `Week ${o}`)} size="sm" />
            <NflFilterChips label="Direction" options={DIRECTION_OPTIONS} value={filters.direction} onChange={(v) => setFilters((f) => ({ ...f, direction: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="sky" />
            <NflFilterChips label="Result" options={RESULT_OPTIONS} value={filters.result} onChange={(v) => setFilters((f) => ({ ...f, result: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="teal" />
            {projectedBucketOptions.length > 0 && (
              <NflFilterChips label="Projected Total" options={["all", ...projectedBucketOptions]} value={filters.projectedTotalBucket} onChange={(v) => setFilters((f) => ({ ...f, projectedTotalBucket: v }))} formatOption={(o) => (o === "all" ? "All Totals" : o)} size="sm" tone="amber" />
            )}
            {diffBucketOptions.length > 0 && (
              <NflFilterChips label="JKB-Market Diff" options={["all", ...diffBucketOptions]} value={filters.jkbMarketDifferenceBucket} onChange={(v) => setFilters((f) => ({ ...f, jkbMarketDifferenceBucket: v }))} formatOption={(o) => (o === "all" ? "All Diffs" : o)} size="sm" tone="violet" />
            )}
          </div>

          <p className="text-[11px] text-slate-500">{sortedRows.length} of {state.data.rows.length} graded games shown</p>

          {sortedRows.length === 0 ? (
            <NflPerformanceEmptyState title="No games match the current filters." description="Adjust or clear a filter to see more results." />
          ) : (
            <NflPerformanceTotalsTable rows={sortedRows} sort={sort} onSort={handleSort} />
          )}
        </>
      )}
    </div>
  );
}
