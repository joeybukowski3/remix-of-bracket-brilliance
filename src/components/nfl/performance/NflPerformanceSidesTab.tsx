import { useMemo, useState } from "react";
import NflPerformanceKpiStrip, { type NflKpiItem } from "./NflPerformanceKpiStrip";
import NflPerformanceEmptyState from "./NflPerformanceEmptyState";
import NflPerformanceFilterToolbar, { NflFilterGroup, NflFilterSelect } from "./NflPerformanceFilterToolbar";
import NflPerformanceRecordSummary, { type NflRecordMetric } from "./NflPerformanceRecordSummary";
import NflPerformanceSidesTable from "./NflPerformanceSidesTable";
import NflPerformanceWeekSelector from "./NflPerformanceWeekSelector";
import { formatCount, formatMetric, formatSigned } from "@/lib/nfl/performance/format";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { availableWeeks, computeAtsRecord, computeSuRecord, rowsForWeek } from "@/lib/nfl/performance/records";
import {
  applySidesFilters,
  clearSidesToolbarFilters,
  countActiveSidesFilters,
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

const allOr = (allLabel: string) => (option: string) => (option === "all" ? allLabel : option);

/**
 * WU6 -- detailed Sides (spread) performance view, backed by the dedicated
 * canonical artifact public/data/nfl/performance/sides.json (live side model
 * jkb-power-number-v1.1.0; v1.0.0 history included). It never parses the raw spread archive; every
 * row/metric/bucket is read verbatim from that artifact. ATS is the artifact's own `ats_result`;
 * SU is derived in lib/nfl/performance/records.ts from projected_home_margin vs actual_margin.
 */
export default function NflPerformanceSidesTab({
  state,
}: {
  state: NflPerformanceArtifactState<NflSidesPerformanceArtifact>;
}) {
  const [filters, setFilters] = useState<SidesFilters>(DEFAULT_SIDES_FILTERS);
  const [sort, setSort] = useState<SidesSortState>({ key: "week", direction: "asc" });

  const weekOptions = useMemo(() => (state.data ? availableWeeks(state.data.rows) : []), [state.data]);

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
  const allRows = state.data.rows;
  const weekRows = filters.week === "all" ? null : rowsForWeek(allRows, filters.week);
  const metrics: NflRecordMetric[] = [
    { key: "ats", label: "ATS", season: computeAtsRecord(allRows), week: weekRows && computeAtsRecord(weekRows), neutralNoun: "no lean" },
    {
      key: "su",
      label: "SU",
      season: computeSuRecord(allRows),
      week: weekRows && computeSuRecord(weekRows),
      hidePushesWhenZero: true,
      pushNoun: "ties",
      neutralNoun: "pick",
    },
  ];
  const seasonLabel = `${performanceMeta.seasons.join(" / ")} Season`;
  const activeCount = countActiveSidesFilters(filters);
  const setFilter =
    <K extends keyof SidesFilters>(key: K) =>
    (value: SidesFilters[K]) =>
      setFilters((f) => ({ ...f, [key]: value }));
  const qualityKpis: NflKpiItem[] = [
    { key: "graded", label: "Graded Games", value: formatCount(summary.graded_games) },
    { key: "mae", label: "Margin MAE", value: formatMetric(summary.margin_mae) },
    { key: "bias", label: "Bias", value: formatSigned(summary.mean_signed_error) },
    { key: "corr", label: "Correlation", value: formatMetric(summary.correlation_projected_actual_margin, 2) },
    { key: "avg-diff", label: "Avg |JKB−Market|", value: formatMetric(summary.average_abs_jkb_market_difference) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          Model: <span className="font-semibold text-emerald-700">{performanceMeta.liveModelVersion}</span>
          {performanceMeta.modelVersions.length > 1 && (
            <span className="text-slate-400"> · results span {performanceMeta.modelVersions.join(", ")}</span>
          )}
        </span>
        {performanceMeta.latestOutcomeTimestamp && (
          <span>Latest grade: {formatNflMetadataTimestamp(performanceMeta.latestOutcomeTimestamp)}</span>
        )}
        <span>Market coverage: {formatCount(performanceMeta.marketCoverageCount)}</span>
      </div>

      {summary.graded_games === 0 ? (
        <NflPerformanceEmptyState
          title="No graded results yet"
          description="Sides results will populate as 2026 games are completed and graded."
        />
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

          <NflPerformanceFilterToolbar activeCount={activeCount} onClear={() => setFilters(clearSidesToolbarFilters)}>
            <NflFilterGroup label="JKB pick">
              <NflFilterSelect label="Side" options={SIDE_OPTIONS} value={filters.jkbSide} onChange={setFilter("jkbSide")} formatOption={allOr("All")} />
              <NflFilterSelect label="ATS result" options={RESULT_OPTIONS} value={filters.result} onChange={setFilter("result")} formatOption={allOr("All")} />
            </NflFilterGroup>
            <NflFilterGroup label="Market">
              <NflFilterSelect label="Favorite / dog" options={FAVDOG_OPTIONS} value={filters.favoriteUnderdog} onChange={setFilter("favoriteUnderdog")} formatOption={allOr("All")} />
              {diffBucketOptions.length > 0 && (
                <NflFilterSelect label="JKB−Market diff" options={["all", ...diffBucketOptions]} value={filters.jkbMarketDifferenceBucket} onChange={setFilter("jkbMarketDifferenceBucket")} formatOption={allOr("All")} />
              )}
            </NflFilterGroup>
            <NflFilterGroup label="Context">
              <NflFilterSelect label="Trenches adv." options={ADVANTAGE_OPTIONS} value={filters.trenchesAdvantage} onChange={setFilter("trenchesAdvantage")} formatOption={allOr("All")} />
              <NflFilterSelect label="YPP adv." options={ADVANTAGE_OPTIONS} value={filters.yppAdvantage} onChange={setFilter("yppAdvantage")} formatOption={allOr("All")} />
              <NflFilterSelect label="EPA adv." options={ADVANTAGE_OPTIONS} value={filters.epaAdvantage} onChange={setFilter("epaAdvantage")} formatOption={allOr("All")} />
              <NflFilterSelect label="Coaching adv." options={ADVANTAGE_OPTIONS} value={filters.coachingAdvantage} onChange={setFilter("coachingAdvantage")} formatOption={allOr("All")} />
              <NflFilterSelect label="JKB side vs coaching" options={COACHING_AGREEMENT_OPTIONS} value={filters.coachingAgreement} onChange={setFilter("coachingAgreement")} formatOption={allOr("All")} />
            </NflFilterGroup>
          </NflPerformanceFilterToolbar>

          <p className="text-[11px] text-slate-500" data-testid="nfl-sides-shown-count">
            {sortedRows.length} of {allRows.length} graded games shown
            {filters.week !== "all" && ` · Week ${filters.week} selected`}
          </p>

          {sortedRows.length === 0 ? (
            <NflPerformanceEmptyState title="No games match the current filters." description="Adjust or clear a filter to see more results." />
          ) : (
            <NflPerformanceSidesTable rows={sortedRows} sort={sort} onSort={handleSort} />
          )}
        </>
      )}

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-5 text-slate-600" data-testid="nfl-sides-artifact-note">
        Sign convention: every margin and error is a home margin (home − away points). Market spread is the posted home line
        (negative = home favored). SU compares JKB&apos;s projected winner (sign of the projected home margin; a 0 projection is a
        pick and is not scored) with the actual winner; a tied game is a tie. ATS uses the canonical graded result against the
        posted market spread. Season and Week records ignore the secondary filters. Coaching Rating v1 is analysis context only —
        it is never an input to the spread model, and the JKB Side vs Coaching Advantage filter describes co-occurrence, not
        causation. ATS records are shown as historical context and are not weighted in the JKB Coaching Rating.
      </p>
    </div>
  );
}
