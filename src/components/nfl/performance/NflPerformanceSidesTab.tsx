import { useMemo, useState } from "react";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import NflPerformanceKpiStrip, { type NflKpiItem } from "./NflPerformanceKpiStrip";
import NflPerformanceEmptyState from "./NflPerformanceEmptyState";
import NflPerformanceSidesTable from "./NflPerformanceSidesTable";
import { formatCount, formatMetric, formatPercent, formatSigned } from "@/lib/nfl/performance/format";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import {
  applySidesFilters,
  DEFAULT_SIDES_FILTERS,
  nextSidesSort,
  sortSidesRows,
  type SidesFilters,
  type SidesSortKey,
  type SidesSortState,
} from "@/lib/nfl/performance/sidesFilters";
import type { NflPerformanceArtifactState } from "@/hooks/useNflPerformanceArtifact";
import type { AtsResult, AtsSide, NflSidesPerformanceArtifact } from "@/types/nfl/performance";

const SIDE_OPTIONS: readonly (AtsSide | "all")[] = ["all", "home", "away", "pick"];
const RESULT_OPTIONS: readonly (AtsResult | "all")[] = ["all", "WIN", "LOSS", "PUSH", "NEUTRAL"];
const FAVDOG_OPTIONS = ["all", "favorite", "underdog", "pick"] as const;
const ADVANTAGE_OPTIONS = ["all", "home", "away", "even"] as const;
const COACHING_AGREEMENT_OPTIONS = ["all", "agree", "disagree", "even"] as const;

/**
 * WU6 -- detailed Sides (spread) performance view, backed by the dedicated
 * canonical artifact public/data/nfl/performance/sides.json (live side model
 * jkb-power-number-v1.0.0). It never parses the raw spread archive; every
 * row/metric/bucket is read verbatim from that artifact.
 */
export default function NflPerformanceSidesTab({
  state,
}: {
  state: NflPerformanceArtifactState<NflSidesPerformanceArtifact>;
}) {
  const [filters, setFilters] = useState<SidesFilters>(DEFAULT_SIDES_FILTERS);
  const [sort, setSort] = useState<SidesSortState>({ key: "week", direction: "asc" });

  const weekOptions = useMemo(() => {
    if (!state.data) return [];
    return [...new Set(state.data.rows.map((r) => r.week))].sort((a, b) => a - b);
  }, [state.data]);

  const diffBucketOptions = useMemo(() => {
    if (!state.data) return [];
    return [...new Set(state.data.rows.map((r) => r.jkb_market_difference_bucket).filter((v): v is string => v != null))];
  }, [state.data]);

  const filteredRows = useMemo(() => {
    if (!state.data) return [];
    return applySidesFilters(state.data.rows, filters);
  }, [state.data, filters]);

  const sortedRows = useMemo(() => sortSidesRows(filteredRows, sort), [filteredRows, sort]);

  const handleSort = (key: SidesSortKey) => setSort((current) => nextSidesSort(current, key, key === "week" ? "asc" : "desc"));

  if (state.loading) return <p className="text-sm text-slate-500">Loading sides performance…</p>;
  if (state.error || !state.data) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        Could not load sides performance. Please try again later.
      </p>
    );
  }

  const { summary, performanceMeta } = state.data;
  const kpis: NflKpiItem[] = [
    { key: "graded", label: "Graded Games", value: formatCount(summary.graded_games) },
    { key: "mae", label: "Margin MAE", value: formatMetric(summary.margin_mae) },
    { key: "bias", label: "Bias", value: formatSigned(summary.mean_signed_error) },
    { key: "corr", label: "Correlation", value: formatMetric(summary.correlation_projected_actual_margin, 2) },
    { key: "hit-rate", label: "ATS Directional Hit Rate", value: formatPercent(summary.ats_directional_hit_rate) },
    { key: "avg-diff", label: "Avg |JKB−Market|", value: formatMetric(summary.average_abs_jkb_market_difference) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          Model: <span className="font-semibold text-slate-700">{performanceMeta.liveModelVersion}</span>
        </span>
        {performanceMeta.latestOutcomeTimestamp && (
          <span>Latest grade: {formatNflMetadataTimestamp(performanceMeta.latestOutcomeTimestamp)}</span>
        )}
        <span>Market coverage: {formatCount(performanceMeta.marketCoverageCount)}</span>
      </div>

      <NflPerformanceKpiStrip items={kpis} />

      {summary.graded_games === 0 ? (
        <NflPerformanceEmptyState
          title="No graded results yet"
          description="Sides results will populate as 2026 games are completed and graded."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <NflFilterChips label="Week" options={["all", ...weekOptions]} value={filters.week} onChange={(v) => setFilters((f) => ({ ...f, week: v }))} formatOption={(o) => (o === "all" ? "All Weeks" : `Week ${o}`)} size="sm" />
            <NflFilterChips label="JKB Side" options={SIDE_OPTIONS} value={filters.jkbSide} onChange={(v) => setFilters((f) => ({ ...f, jkbSide: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="sky" />
            <NflFilterChips label="Result" options={RESULT_OPTIONS} value={filters.result} onChange={(v) => setFilters((f) => ({ ...f, result: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="teal" />
            <NflFilterChips label="Favorite / Underdog" options={FAVDOG_OPTIONS} value={filters.favoriteUnderdog} onChange={(v) => setFilters((f) => ({ ...f, favoriteUnderdog: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="amber" />
            {diffBucketOptions.length > 0 && (
              <NflFilterChips label="JKB−Market Diff" options={["all", ...diffBucketOptions]} value={filters.jkbMarketDifferenceBucket} onChange={(v) => setFilters((f) => ({ ...f, jkbMarketDifferenceBucket: v }))} formatOption={(o) => (o === "all" ? "All Diffs" : o)} size="sm" tone="violet" />
            )}
            <NflFilterChips label="Trenches Adv." options={ADVANTAGE_OPTIONS} value={filters.trenchesAdvantage} onChange={(v) => setFilters((f) => ({ ...f, trenchesAdvantage: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" />
            <NflFilterChips label="YPP Adv." options={ADVANTAGE_OPTIONS} value={filters.yppAdvantage} onChange={(v) => setFilters((f) => ({ ...f, yppAdvantage: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" />
            <NflFilterChips label="EPA Adv." options={ADVANTAGE_OPTIONS} value={filters.epaAdvantage} onChange={(v) => setFilters((f) => ({ ...f, epaAdvantage: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" />
            <NflFilterChips label="Coaching Adv." options={ADVANTAGE_OPTIONS} value={filters.coachingAdvantage} onChange={(v) => setFilters((f) => ({ ...f, coachingAdvantage: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="violet" />
            <NflFilterChips label="JKB Side vs Coaching Adv." options={COACHING_AGREEMENT_OPTIONS} value={filters.coachingAgreement} onChange={(v) => setFilters((f) => ({ ...f, coachingAgreement: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="violet" />
          </div>

          <p className="text-[11px] text-slate-500">{sortedRows.length} of {state.data.rows.length} graded games shown</p>

          {sortedRows.length === 0 ? (
            <NflPerformanceEmptyState title="No games match the current filters." description="Adjust or clear a filter to see more results." />
          ) : (
            <NflPerformanceSidesTable rows={sortedRows} sort={sort} onSort={handleSort} />
          )}
        </>
      )}

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-5 text-slate-600" data-testid="nfl-sides-artifact-note">
        Sign convention: every margin and error is a home margin (home − away points). Market spread is the posted home line
        (negative = home favored). Coaching Rating v1 is analysis context only — it is never an input to the spread model, and the
        JKB Side vs Coaching Advantage filter describes co-occurrence, not causation. ATS records are shown as historical context and
        are not weighted in the JKB Coaching Rating.
      </p>
    </div>
  );
}
