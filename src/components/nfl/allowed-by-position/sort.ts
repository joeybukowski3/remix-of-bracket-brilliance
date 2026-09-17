import type { AllowedByPositionDisplayMode, AllowedByPositionRow, AllowedByPositionSortDirection, AllowedByPositionSortKey } from "./types";

/**
 * Sorts rows by team, opponent (alphabetical, nulls last), or a position
 * column's numeric value (nulls always sorted last regardless of direction --
 * missing data is "no data", never "best" or "worst"). `valueMode` picks
 * which numeric field a position column sorts by: "rank" (default) or the
 * underlying "raw" metric value, mirroring whatever the table is displaying.
 */
export function sortAllowedByPositionRows<ColumnKey extends string>(
  rows: readonly AllowedByPositionRow<ColumnKey>[],
  sortKey: AllowedByPositionSortKey,
  direction: AllowedByPositionSortDirection,
  valueMode: AllowedByPositionDisplayMode = "rank",
): AllowedByPositionRow<ColumnKey>[] {
  const sign = direction === "asc" ? 1 : -1;
  const sorted = [...rows];

  if (sortKey === "team") {
    sorted.sort((a, b) => sign * a.team.localeCompare(b.team));
    return sorted;
  }

  if (sortKey === "opponent") {
    sorted.sort((a, b) => {
      if (a.opponent == null && b.opponent == null) return 0;
      if (a.opponent == null) return 1;
      if (b.opponent == null) return -1;
      return sign * a.opponent.localeCompare(b.opponent);
    });
    return sorted;
  }

  const columnKey = sortKey as ColumnKey;
  const valueOf = (row: AllowedByPositionRow<ColumnKey>): number | null => {
    const cell = row.cells[columnKey];
    return valueMode === "raw" ? (cell?.rawValue ?? null) : (cell?.rank ?? null);
  };
  sorted.sort((a, b) => {
    const valueA = valueOf(a);
    const valueB = valueOf(b);
    if (valueA == null && valueB == null) return a.team.localeCompare(b.team);
    if (valueA == null) return 1;
    if (valueB == null) return -1;
    if (valueA !== valueB) return sign * (valueA - valueB);
    return a.team.localeCompare(b.team);
  });
  return sorted;
}

/** Click behavior: a new column starts ascending; the active column toggles direction. */
export function nextAllowedByPositionSort(
  current: { key: AllowedByPositionSortKey; direction: AllowedByPositionSortDirection },
  clickedKey: AllowedByPositionSortKey,
): { key: AllowedByPositionSortKey; direction: AllowedByPositionSortDirection } {
  if (current.key !== clickedKey) return { key: clickedKey, direction: "asc" };
  return { key: clickedKey, direction: current.direction === "asc" ? "desc" : "asc" };
}
