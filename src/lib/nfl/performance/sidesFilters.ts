import type { AtsResult, AtsSide, FavoriteUnderdog, SidesPerformanceRow } from "@/types/nfl/performance";

export type SidesFilters = {
  week: number | "all";
  jkbSide: AtsSide | "all";
  result: AtsResult | "all";
  favoriteUnderdog: FavoriteUnderdog | "all";
  jkbMarketDifferenceBucket: string | "all";
  trenchesAdvantage: "home" | "away" | "even" | "all";
  yppAdvantage: "home" | "away" | "even" | "all";
  epaAdvantage: "home" | "away" | "even" | "all";
};

export const DEFAULT_SIDES_FILTERS: SidesFilters = {
  week: "all",
  jkbSide: "all",
  result: "all",
  favoriteUnderdog: "all",
  jkbMarketDifferenceBucket: "all",
  trenchesAdvantage: "all",
  yppAdvantage: "all",
  epaAdvantage: "all",
};

export function applySidesFilters(rows: readonly SidesPerformanceRow[], filters: SidesFilters): SidesPerformanceRow[] {
  return rows.filter((row) => {
    if (filters.week !== "all" && row.week !== filters.week) return false;
    if (filters.jkbSide !== "all" && row.jkb_ats_side !== filters.jkbSide) return false;
    if (filters.result !== "all" && row.ats_result !== filters.result) return false;
    if (filters.favoriteUnderdog !== "all" && row.favorite_underdog !== filters.favoriteUnderdog) return false;
    if (filters.jkbMarketDifferenceBucket !== "all" && row.jkb_market_difference_bucket !== filters.jkbMarketDifferenceBucket) return false;
    if (
      filters.trenchesAdvantage !== "all" &&
      (row.context.trenches.provenance_status !== "available" || row.context.trenches.trenches_advantage_team !== filters.trenchesAdvantage)
    ) {
      return false;
    }
    if (
      filters.yppAdvantage !== "all" &&
      (row.context.ypp.provenance_status !== "available" || row.context.ypp.ypp_advantage_team !== filters.yppAdvantage)
    ) {
      return false;
    }
    if (
      filters.epaAdvantage !== "all" &&
      (row.context.epa.provenance_status !== "available" || row.context.epa.epa_advantage_team !== filters.epaAdvantage)
    ) {
      return false;
    }
    return true;
  });
}

export type SidesSortKey =
  | "week"
  | "projected_home_margin"
  | "market_spread"
  | "abs_jkb_market_diff"
  | "actual_margin"
  | "absolute_margin_error";

export type SidesSortState = { key: SidesSortKey; direction: "asc" | "desc" } | null;

const SORT_VALUE: Record<SidesSortKey, (row: SidesPerformanceRow) => number | null> = {
  week: (r) => r.week,
  projected_home_margin: (r) => r.projected_home_margin,
  market_spread: (r) => r.market_spread,
  abs_jkb_market_diff: (r) => (r.jkb_minus_market == null ? null : Math.abs(r.jkb_minus_market)),
  actual_margin: (r) => (r.game_completion_status === "final" ? r.actual_margin : null),
  absolute_margin_error: (r) => (r.game_completion_status === "final" ? r.absolute_margin_error : null),
};

export function sortSidesRows(rows: readonly SidesPerformanceRow[], sort: SidesSortState): SidesPerformanceRow[] {
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

export function nextSidesSort(current: SidesSortState, key: SidesSortKey, firstDirection: "asc" | "desc" = "desc"): SidesSortState {
  if (!current || current.key !== key) return { key, direction: firstDirection };
  if (current.direction === firstDirection) return { key, direction: firstDirection === "asc" ? "desc" : "asc" };
  return null;
}
