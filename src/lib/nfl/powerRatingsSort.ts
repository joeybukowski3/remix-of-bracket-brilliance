/**
 * Pure column sorting for the /nfl/power-ratings table.
 *
 * The page owns the {key, direction} sort state and the header buttons; this
 * module is the single definition of *how* each column orders rows. It never
 * mutates the input array and never touches a row's underlying numbers — it
 * only reorders.
 *
 * Rules that hold for every column:
 *   - sorting is on raw numeric/structured data, never formatted display text
 *     ("#4", "68.5", "12.8 avg", "6-2"), so the Rankings/Ratings display toggle
 *     cannot change row order;
 *   - null / unavailable values sort to the bottom in BOTH directions;
 *   - team abbreviation is the deterministic final tie-break, always ascending.
 *
 * Each column has a preferred (default) direction — the first header click uses
 * it, a second click on the same header reverses it:
 *
 *   rank / form rank   #1 → #32                 (ascending)
 *   team              A → Z                     (ascending)
 *   OFF/DEF/OVR/YPP/EPA/Success  highest rating first   (descending)
 *   SoS               hardest schedule first    (ascending avg opponent rank)
 *   record            best winning % first      (descending)
 */

import type { PowerRatingsRow } from "@/hooks/useNflPowerRatingsBoard";
import type { WinLossTie } from "@/lib/nfl/standings";

export const POWER_RATINGS_SORT_KEYS = [
  "rank",
  "team",
  "off",
  "def",
  "ovr",
  "ypp",
  "epa",
  "success",
  "sos",
  "record",
] as const;

export type PowerRatingsSortKey = (typeof POWER_RATINGS_SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export type PowerRatingsSort = { key: PowerRatingsSortKey; direction: SortDirection };

/** The direction applied on the first click of a column's header. */
export function defaultSortDirection(key: PowerRatingsSortKey): SortDirection {
  switch (key) {
    case "rank":
    case "team":
    case "sos":
      return "asc";
    default:
      // metrics + record: "best" is a higher number, shown first.
      return "desc";
  }
}

/** Period-default sort: that period's primary ranking, #1 → #32. */
export function defaultSortForPeriod(): PowerRatingsSort {
  return { key: "rank", direction: defaultSortDirection("rank") };
}

/** winPct = (W + 0.5·T) / games, or null for a 0-game record. */
export function recordWinPct(stats: WinLossTie | null | undefined): number | null {
  if (!stats) return null;
  const games = stats.wins + stats.losses + stats.ties;
  if (games <= 0) return null;
  return (stats.wins + 0.5 * stats.ties) / games;
}

/** Raw comparable value for a metric/rank column, or null when unavailable. */
function columnValue(row: PowerRatingsRow, key: PowerRatingsSortKey): number | null {
  switch (key) {
    case "rank":
      return row.rank;
    case "sos":
      return row.sos.value; // avg opponent EPA-Overall rank; lower = harder
    case "record":
      return recordWinPct(row.recordStats);
    case "team":
      return null; // handled by the string path
    default:
      return row[key].value;
  }
}

/** Record quality tie-break: wins ↓, losses ↑, ties ↓. 0 for other columns. */
function recordQuality(a: PowerRatingsRow, b: PowerRatingsRow): number {
  const ra = a.recordStats;
  const rb = b.recordStats;
  if (!ra || !rb) return 0;
  return rb.wins - ra.wins || ra.losses - rb.losses || rb.ties - ra.ties;
}

/**
 * Return a new array of `rows` ordered by `sort`. Input is never mutated.
 */
export function sortPowerRatingRows(
  rows: readonly PowerRatingsRow[],
  sort: PowerRatingsSort
): PowerRatingsRow[] {
  const { key, direction } = sort;
  const reversed = direction !== defaultSortDirection(key);
  const flip = reversed ? -1 : 1;
  const byAbbr = (a: PowerRatingsRow, b: PowerRatingsRow) => a.abbr.localeCompare(b.abbr);
  const copy = [...rows];

  if (key === "team") {
    copy.sort((a, b) => flip * a.name.localeCompare(b.name) || byAbbr(a, b));
    return copy;
  }

  const ascendingByDefault = defaultSortDirection(key) === "asc";

  copy.sort((a, b) => {
    const av = columnValue(a, key);
    const bv = columnValue(b, key);

    // Nulls always last, regardless of direction.
    if (av === null && bv === null) return recordQuality(a, b) || byAbbr(a, b);
    if (av === null) return 1;
    if (bv === null) return -1;

    const base = ascendingByDefault ? av - bv : bv - av;
    const primary = flip * base;
    if (primary !== 0) return primary;

    return flip * recordQuality(a, b) || byAbbr(a, b);
  });

  return copy;
}
