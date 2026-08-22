/**
 * Exploratory sorting for the season-baseline matchup-context rows.
 * The public Weekly Rankings route does not render this order because it is
 * not canonical weekly ranking authority.
 *
 * THIS IS A RESEARCH SORT, NOT A WEEKLY RANKING. `row.rank` is the season-PPG
 * baseline assigned by `buildWeeklyRankingRows` and is never recomputed here.
 *
 * Stat columns sort on the RAW metric, not the percentile. The two are strictly
 * monotonic with each other (`computeTeamPercentiles` gives equal percentiles
 * only to equal raw values), so the ordering is identical either way — raw is
 * used because it keeps full precision and cannot collapse a tie the percentile
 * rounding would hide. This is also why the Percentile/Raw display toggle can
 * never change the order.
 *
 * Missing values always sort last, in both directions. A player with no
 * resolvable opponent should not lead the board just because their FPA is null.
 */

import type { WeeklyRankingRow, WeeklyStatColumn } from "@/lib/fantasy/weeklyRankings";

export type WeeklySortDirection = "asc" | "desc";

/** Sortable columns. Stat columns are addressed by their config id. */
export type WeeklySortKey = "projPpg" | "fpaPerGame" | "fpaRank" | `stat:${string}`;

export type WeeklySort = {
  key: WeeklySortKey;
  direction: WeeklySortDirection;
};

/** Season projected PPG descending — the baseline research order. */
export const DEFAULT_WEEKLY_SORT: WeeklySort = { key: "projPpg", direction: "desc" };

export function statSortKey(columnId: string): WeeklySortKey {
  return `stat:${columnId}`;
}

/**
 * The direction a column opens on: best-first, whatever "best" means for that
 * column. Projected PPG and FPA/G are higher-is-better, FPA rank is 1-is-best,
 * and a stat column follows its own declared `direction` — so adding a
 * lower-is-better metric needs no change here.
 */
export function defaultDirectionFor(
  key: WeeklySortKey,
  columns: readonly WeeklyStatColumn[],
): WeeklySortDirection {
  if (key === "fpaRank") return "asc";
  if (key === "projPpg" || key === "fpaPerGame") return "desc";
  const column = columns.find((entry) => statSortKey(entry.id) === key);
  return column?.direction === "lower-is-better" ? "asc" : "desc";
}

/**
 * Next sort state for a header click: a new column opens best-first, the active
 * column reverses.
 */
export function nextSort(
  current: WeeklySort,
  key: WeeklySortKey,
  columns: readonly WeeklyStatColumn[],
): WeeklySort {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: defaultDirectionFor(key, columns) };
}

/** The comparable number for one row under one sort key; null when missing. */
function sortValue(
  row: WeeklyRankingRow,
  key: WeeklySortKey,
  columns: readonly WeeklyStatColumn[],
): number | null {
  if (key === "projPpg") return row.projectedPpg;
  if (key === "fpaPerGame") return row.fpa?.pointsAllowed ?? null;
  if (key === "fpaRank") return row.fpa?.rank ?? null;
  const index = columns.findIndex((entry) => statSortKey(entry.id) === key);
  if (index < 0) return null;
  return row.stats[index]?.raw ?? null;
}

/**
 * A new array in the requested order. Ties break on baseline rank ascending,
 * so the order is deterministic.
 */
export function sortWeeklyRows(
  rows: readonly WeeklyRankingRow[],
  sort: WeeklySort,
  columns: readonly WeeklyStatColumn[],
): WeeklyRankingRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort.key, columns);
    const right = sortValue(b, sort.key, columns);
    if (left == null && right == null) return a.rank - b.rank;
    if (left == null) return 1;
    if (right == null) return -1;
    if (left !== right) return sign * (left - right);
    return a.rank - b.rank;
  });
}
