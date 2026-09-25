import { useMemo, useState } from "react";
import NflPerformanceKpiStrip, { type NflKpiItem } from "./NflPerformanceKpiStrip";
import NflPerformanceEmptyState from "./NflPerformanceEmptyState";
import NflPerformanceFilterToolbar, { NflFilterGroup, NflFilterSelect } from "./NflPerformanceFilterToolbar";
import NflPerformanceRecordSummary, { type NflRecordMetric } from "./NflPerformanceRecordSummary";
import NflPerformanceTotalsTable from "./NflPerformanceTotalsTable";
import NflPerformanceWeekSelector from "./NflPerformanceWeekSelector";
import { formatCount, formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import { availableWeeks, computeOuRecord, rowsForWeek } from "@/lib/nfl/performance/records";
import {
  applyTotalsFilters,
  clearTotalsToolbarFilters,
  countActiveTotalsFilters,
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

const allOr = (allLabel: string) => (option: string) => (option === "all" ? allLabel : option);

/**
 * Totals view. The O/U record is a straight tally of the artifact's canonical `directional_result`
 * (JKB direction vs market total); NEUTRAL calls are reported next to it, not inside the W-L-P.
 */
export default function NflPerformanceTotalsTab({
  state,
}: {
  state: NflPerformanceArtifactState<NflTotalsPerformanceArtifact>;
}) {
  const [filters, setFilters] = useState<TotalsFilters>(DEFAULT_TOTALS_FILTERS);
  const [sort, setSort] = useState<TotalsSortState>({ key: "week", direction: "asc" });

  const weekOptions = useMemo(() => (state.data ? availableWeeks(state.data.rows) : []), [state.data]);

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
  const allRows = state.data.rows;
  const weekRows = filters.week === "all" ? null : rowsForWeek(allRows, filters.week);
  const metrics: NflRecordMetric[] = [
    { key: "ou", label: "O/U", season: computeOuRecord(allRows), week: weekRows && computeOuRecord(weekRows), neutralNoun: "neutral" },
  ];
  const seasons = [...new Set(allRows.map((r) => r.season))].sort();
  const seasonLabel = `${seasons.join(" / ") || "2026"} Season`;
  const activeCount = countActiveTotalsFilters(filters);
  const setFilter =
    <K extends keyof TotalsFilters>(key: K) =>
    (value: TotalsFilters[K]) =>
      setFilters((f) => ({ ...f, [key]: value }));
  const qualityKpis: NflKpiItem[] = [
    { key: "graded", label: "Graded Games", value: formatCount(summary.graded_games) },
    { key: "mae", label: "Game Total MAE", value: formatMetric(summary.game_total_mae) },
    { key: "team-mae", label: "Team Score MAE", value: formatMetric(summary.team_score_mae) },
    { key: "bias", label: "Bias", value: formatSigned(summary.mean_signed_error) },
    { key: "corr", label: "Correlation", value: formatMetric(summary.correlation_projected_actual, 2) },
  ];

  return (
    <div className="space-y-4">
      {summary.graded_games === 0 ? (
        <NflPerformanceEmptyState description="Totals results will populate as 2026 games are completed and graded." />
      ) : (
        <>
          <NflPerformanceWeekSelector weeks={weekOptions} value={filters.week} onChange={setFilter("week")} />
          <NflPerformanceRecordSummary
            seasonLabel={seasonLabel}
            weekLabel={filters.week === "all" ? null : `Week ${filters.week}`}
            metrics={metrics}
          />

          <section aria-label="Model quality" className="space-y-1">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Model quality · season</h3>
            <NflPerformanceKpiStrip items={qualityKpis} compact className="lg:grid-cols-5" />
          </section>

          <NflPerformanceFilterToolbar activeCount={activeCount} onClear={() => setFilters(clearTotalsToolbarFilters)}>
            <NflFilterGroup label="JKB call">
              <NflFilterSelect label="Direction" options={DIRECTION_OPTIONS} value={filters.direction} onChange={setFilter("direction")} formatOption={allOr("All")} />
              <NflFilterSelect label="O/U result" options={RESULT_OPTIONS} value={filters.result} onChange={setFilter("result")} formatOption={allOr("All")} />
            </NflFilterGroup>
            {(projectedBucketOptions.length > 0 || diffBucketOptions.length > 0) && (
              <NflFilterGroup label="Market">
                {projectedBucketOptions.length > 0 && (
                  <NflFilterSelect label="Projected total" options={["all", ...projectedBucketOptions]} value={filters.projectedTotalBucket} onChange={setFilter("projectedTotalBucket")} formatOption={allOr("All")} />
                )}
                {diffBucketOptions.length > 0 && (
                  <NflFilterSelect label="JKB-Market diff" options={["all", ...diffBucketOptions]} value={filters.jkbMarketDifferenceBucket} onChange={setFilter("jkbMarketDifferenceBucket")} formatOption={allOr("All")} />
                )}
              </NflFilterGroup>
            )}
          </NflPerformanceFilterToolbar>

          <p className="text-[11px] text-slate-500" data-testid="nfl-totals-shown-count">
            {sortedRows.length} of {allRows.length} graded games shown
            {filters.week !== "all" && ` · Week ${filters.week} selected`}
          </p>

          {sortedRows.length === 0 ? (
            <NflPerformanceEmptyState title="No games match the current filters." description="Adjust or clear a filter to see more results." />
          ) : (
            <NflPerformanceTotalsTable rows={sortedRows} sort={sort} onSort={handleSort} />
          )}

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-5 text-slate-600" data-testid="nfl-totals-record-note">
            O/U record = JKB&apos;s over/under call against the market total. Pushes are games landing on the number; NEUTRAL
            (no lean) calls are shown beside the record and excluded from the W-L-P and hit rate. Season and Week records ignore the
            secondary filters.
          </p>
        </>
      )}
    </div>
  );
}
