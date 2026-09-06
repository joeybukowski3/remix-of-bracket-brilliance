import { useMemo, useState } from "react";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import NflPerformanceKpiStrip, { type NflKpiItem } from "./NflPerformanceKpiStrip";
import NflPerformanceEmptyState from "./NflPerformanceEmptyState";
import NflPerformancePropsTable from "./NflPerformancePropsTable";
import { formatCount, formatMetric, formatPercent, formatSigned } from "@/lib/nfl/performance/format";
import {
  applyPropsFilters,
  applyPropsMarketFilter,
  DEFAULT_PROPS_FILTERS,
  nextPropsSort,
  sortPropsRows,
  type PropsFilters,
  type PropsMarketFilter,
  type PropsSortKey,
  type PropsSortState,
} from "@/lib/nfl/performance/propsFilters";
import type { NflPerformanceArtifactState } from "@/hooks/useNflPerformanceArtifact";
import type {
  NflPropsPerformanceArtifact,
  StarterPropDirection,
  StarterPropDirectionalResult,
  StarterPosition,
} from "@/types/nfl/performance";

const MARKET_TABS: readonly { id: PropsMarketFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "passing_yards", label: "Passing" },
  { id: "rushing_yards", label: "Rushing" },
  { id: "receiving_yards", label: "Receiving" },
];

const RESULT_OPTIONS: readonly (StarterPropDirectionalResult | "all")[] = ["all", "WIN", "LOSS", "PUSH", "NEUTRAL"];
const DIRECTION_OPTIONS: readonly (StarterPropDirection | "all")[] = ["all", "OVER", "UNDER", "NEUTRAL"];
const POSITION_OPTIONS: readonly (StarterPosition | "all")[] = ["all", "QB", "RB", "WR", "TE"];

export default function NflPerformancePropsTab({
  state,
}: {
  state: NflPerformanceArtifactState<NflPropsPerformanceArtifact>;
}) {
  const [market, setMarket] = useState<PropsMarketFilter>("all");
  const [filters, setFilters] = useState<PropsFilters>(DEFAULT_PROPS_FILTERS);
  const [sort, setSort] = useState<PropsSortState>({ key: "week", direction: "asc" });

  const marketRows = useMemo(() => (state.data ? applyPropsMarketFilter(state.data.rows, market) : []), [state.data, market]);

  const weekOptions = useMemo(() => [...new Set(marketRows.map((r) => r.week))].sort((a, b) => a - b), [marketRows]);
  const starterBasisOptions = useMemo(() => [...new Set(marketRows.map((r) => r.starter_basis))], [marketRows]);

  const filteredRows = useMemo(() => applyPropsFilters(marketRows, filters), [marketRows, filters]);
  const sortedRows = useMemo(() => sortPropsRows(filteredRows, sort), [filteredRows, sort]);

  const handleSort = (key: PropsSortKey) => setSort((current) => nextPropsSort(current, key, key === "week" ? "asc" : "desc"));

  if (state.loading) return <p className="text-sm text-slate-500">Loading starter props performance…</p>;
  if (state.error || !state.data) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
        Could not load starter props performance. Please try again later.
      </p>
    );
  }

  const { summary } = state.data;
  const kpis: NflKpiItem[] = [
    { key: "graded", label: "Graded Starter Props", value: formatCount(summary.graded_starter_props) },
    { key: "hit-rate", label: "Directional Hit Rate", value: formatPercent(summary.directional_hit_rate) },
    { key: "mae", label: "Projection MAE", value: formatMetric(summary.projection_mae) },
    { key: "over", label: "Over Hit Rate", value: formatPercent(summary.over_hit_rate) },
    { key: "under", label: "Under Hit Rate", value: formatPercent(summary.under_hit_rate) },
    { key: "avg-diff", label: "Avg |JKB − Line|", value: formatMetric(summary.average_abs_jkb_line_difference) },
  ];

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">
        <strong className="font-semibold text-slate-700">Starter Props</strong> — QB1 / RB1 / top 3 WR / TE1 per team from archived pregame
        starter/workload evidence. These are graded projections, not betting recommendations.
      </p>

      <NflPerformanceKpiStrip items={kpis} />
      <p className="text-[11px] text-slate-500">
        Starter cohort coverage: {formatCount(state.data.coverage.total_cohort_rows)} rows · {formatCount(state.data.coverage.gradeable_rows)} gradeable
      </p>

      {summary.graded_starter_props === 0 ? (
        <NflPerformanceEmptyState description="Starter prop results will populate as 2026 games are completed and graded." />
      ) : (
        <>
          <NflFilterChips label="Market" options={MARKET_TABS.map((m) => m.id)} value={market} onChange={setMarket} formatOption={(id) => MARKET_TABS.find((m) => m.id === id)!.label} />

          <div className="flex flex-wrap items-center gap-3">
            <NflFilterChips label="Week" options={["all", ...weekOptions]} value={filters.week} onChange={(v) => setFilters((f) => ({ ...f, week: v }))} formatOption={(o) => (o === "all" ? "All Weeks" : `Week ${o}`)} size="sm" />
            <NflFilterChips label="Position" options={POSITION_OPTIONS} value={filters.position} onChange={(v) => setFilters((f) => ({ ...f, position: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="violet" />
            <NflFilterChips label="Direction" options={DIRECTION_OPTIONS} value={filters.direction} onChange={(v) => setFilters((f) => ({ ...f, direction: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="sky" />
            <NflFilterChips label="Result" options={RESULT_OPTIONS} value={filters.result} onChange={(v) => setFilters((f) => ({ ...f, result: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="teal" />
            {starterBasisOptions.length > 0 && (
              <NflFilterChips label="Starter Basis" options={["all", ...starterBasisOptions]} value={filters.starterBasis} onChange={(v) => setFilters((f) => ({ ...f, starterBasis: v }))} formatOption={(o) => (o === "all" ? "All" : o)} size="sm" tone="amber" />
            )}
          </div>

          <p className="text-[11px] text-slate-500">{sortedRows.length} of {marketRows.length} graded props shown</p>

          {sortedRows.length === 0 ? (
            <NflPerformanceEmptyState title="No props match the current filters." description="Adjust or clear a filter to see more results." />
          ) : (
            <NflPerformancePropsTable rows={sortedRows} sort={sort} onSort={handleSort} />
          )}
        </>
      )}
    </div>
  );
}
