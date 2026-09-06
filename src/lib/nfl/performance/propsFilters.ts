import type {
  PropsPerformanceRow,
  StarterPosition,
  StarterPropDirection,
  StarterPropDirectionalResult,
  StarterPropMarket,
} from "@/types/nfl/performance";

export type PropsMarketFilter = "all" | StarterPropMarket;

export type PropsFilters = {
  week: number | "all";
  position: StarterPosition | "all";
  direction: StarterPropDirection | "all";
  result: StarterPropDirectionalResult | "all";
  starterBasis: string | "all";
};

export const DEFAULT_PROPS_FILTERS: PropsFilters = {
  week: "all",
  position: "all",
  direction: "all",
  result: "all",
  starterBasis: "all",
};

export function applyPropsMarketFilter(rows: readonly PropsPerformanceRow[], market: PropsMarketFilter): PropsPerformanceRow[] {
  if (market === "all") return [...rows];
  return rows.filter((row) => row.market === market);
}

export function applyPropsFilters(rows: readonly PropsPerformanceRow[], filters: PropsFilters): PropsPerformanceRow[] {
  return rows.filter((row) => {
    if (filters.week !== "all" && row.week !== filters.week) return false;
    if (filters.position !== "all" && row.position !== filters.position) return false;
    if (filters.direction !== "all" && row.direction !== filters.direction) return false;
    if (filters.result !== "all" && row.result !== filters.result) return false;
    if (filters.starterBasis !== "all" && row.starter_basis !== filters.starterBasis) return false;
    return true;
  });
}

export type PropsSortKey = "week" | "jkb_projection" | "line" | "abs_difference" | "actual" | "absolute_error";

export type PropsSortState = { key: PropsSortKey; direction: "asc" | "desc" } | null;

const SORT_VALUE: Record<PropsSortKey, (row: PropsPerformanceRow) => number | null> = {
  week: (r) => r.week,
  jkb_projection: (r) => r.jkb_projection,
  line: (r) => r.line,
  abs_difference: (r) => Math.abs(r.difference),
  actual: (r) => r.actual,
  absolute_error: (r) => r.absolute_error,
};

export function sortPropsRows(rows: readonly PropsPerformanceRow[], sort: PropsSortState): PropsPerformanceRow[] {
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

export function nextPropsSort(current: PropsSortState, key: PropsSortKey, firstDirection: "asc" | "desc" = "desc"): PropsSortState {
  if (!current || current.key !== key) return { key, direction: firstDirection };
  if (current.direction === firstDirection) return { key, direction: firstDirection === "asc" ? "desc" : "asc" };
  return null;
}

export const PROPS_MARKET_LABEL: Record<StarterPropMarket, string> = {
  passing_yards: "Pass Yds",
  rushing_yards: "Rush Yds",
  receiving_yards: "Rec Yds",
};
