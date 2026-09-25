import type { DirectionalResult, MarketDirection, TotalsPerformanceRow } from "@/types/nfl/performance";

export type TotalsFilters = {
  week: number | "all";
  direction: MarketDirection | "all";
  result: DirectionalResult | "all";
  projectedTotalBucket: string | "all";
  jkbMarketDifferenceBucket: string | "all";
};

export const DEFAULT_TOTALS_FILTERS: TotalsFilters = {
  week: "all",
  direction: "all",
  result: "all",
  projectedTotalBucket: "all",
  jkbMarketDifferenceBucket: "all",
};

/** Number of toolbar filters that differ from the default. `week` is excluded: it has its own selector. */
export function countActiveTotalsFilters(filters: TotalsFilters): number {
  const { week: _week, ...rest } = filters;
  const { week: _defaultWeek, ...defaults } = DEFAULT_TOTALS_FILTERS;
  return (Object.keys(defaults) as (keyof typeof defaults)[]).filter((key) => rest[key] !== defaults[key]).length;
}

/** Resets every toolbar filter but keeps the selected week. */
export function clearTotalsToolbarFilters(filters: TotalsFilters): TotalsFilters {
  return { ...DEFAULT_TOTALS_FILTERS, week: filters.week };
}

export function applyTotalsFilters(rows: readonly TotalsPerformanceRow[], filters: TotalsFilters): TotalsPerformanceRow[] {
  return rows.filter((row) => {
    if (filters.week !== "all" && row.week !== filters.week) return false;
    if (filters.direction !== "all" && row.jkb_market_direction !== filters.direction) return false;
    if (filters.result !== "all" && row.directional_result !== filters.result) return false;
    if (filters.projectedTotalBucket !== "all" && row.projected_total_bucket !== filters.projectedTotalBucket) return false;
    if (filters.jkbMarketDifferenceBucket !== "all" && row.jkb_market_difference_bucket !== filters.jkbMarketDifferenceBucket) return false;
    return true;
  });
}

export type TotalsSortKey = "week" | "projected_game_total" | "market_total" | "abs_jkb_market_diff" | "actual_game_total" | "absolute_total_error";

export type TotalsSortState = { key: TotalsSortKey; direction: "asc" | "desc" } | null;

const SORT_VALUE: Record<TotalsSortKey, (row: TotalsPerformanceRow) => number | null> = {
  week: (r) => r.week,
  projected_game_total: (r) => r.projected_game_total,
  market_total: (r) => r.market_total,
  abs_jkb_market_diff: (r) => (r.jkb_minus_market == null ? null : Math.abs(r.jkb_minus_market)),
  actual_game_total: (r) => r.actual_game_total,
  absolute_total_error: (r) => r.absolute_total_error,
};

export function sortTotalsRows(rows: readonly TotalsPerformanceRow[], sort: TotalsSortState): TotalsPerformanceRow[] {
  if (!sort) return [...rows];
  const getValue = SORT_VALUE[sort.key];
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getValue(a);
    const bv = getValue(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * factor;
  });
}

export function nextTotalsSort(current: TotalsSortState, key: TotalsSortKey, firstDirection: "asc" | "desc" = "desc"): TotalsSortState {
  if (!current || current.key !== key) return { key, direction: firstDirection };
  if (current.direction === firstDirection) return { key, direction: firstDirection === "asc" ? "desc" : "asc" };
  return null;
}
