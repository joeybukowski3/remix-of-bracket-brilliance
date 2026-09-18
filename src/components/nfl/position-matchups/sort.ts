import { POSITION_MATCHUP_POSITION_KEYS, type PositionMatchupPositionKey } from "@/lib/nfl/positionMatchups/types";
import type { PositionMatchupTableRow } from "@/lib/nfl/positionMatchups/presentation";
import type { PositionMatchupDisplayMode, PositionMatchupSortDirection, PositionMatchupSortField, PositionMatchupSortKey, PositionMatchupSortState } from "./types";

function parsePositionSortKey(key: PositionMatchupSortKey): { position: PositionMatchupPositionKey; field: PositionMatchupSortField } | null {
  for (const position of POSITION_MATCHUP_POSITION_KEYS) {
    if (key === `${position}-for`) return { position, field: "for" };
    if (key === `${position}-allowed`) return { position, field: "allowed" };
    if (key === `${position}-edge`) return { position, field: "edge" };
  }
  return null;
}

/**
 * Sorts rows by team, opponent (alphabetical, nulls last), or a position
 * cell's numeric value (nulls always sorted last, regardless of direction --
 * missing data is "no data", never "best" or "worst"). EDGE always sorts by
 * its own signed value; FOR/ALLOWED sort by rank in "rank" display mode and
 * by the raw per-game value in "raw" display mode, mirroring what the table
 * currently shows.
 */
export function sortPositionMatchupRows(
  rows: readonly PositionMatchupTableRow[],
  sortKey: PositionMatchupSortKey,
  direction: PositionMatchupSortDirection,
  displayMode: PositionMatchupDisplayMode = "rank",
): PositionMatchupTableRow[] {
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

  const parsed = parsePositionSortKey(sortKey);
  if (!parsed) return sorted;
  const { position, field } = parsed;

  const valueOf = (row: PositionMatchupTableRow): number | null => {
    const cell = row.cells[position];
    if (field === "edge") return cell.edge;
    if (field === "for") return displayMode === "raw" ? cell.forRaw : cell.forRank;
    return displayMode === "raw" ? cell.allowedRaw : cell.allowedRank;
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
export function nextPositionMatchupSort(current: PositionMatchupSortState, clickedKey: PositionMatchupSortKey): PositionMatchupSortState {
  if (current.key !== clickedKey) return { key: clickedKey, direction: "asc" };
  return { key: clickedKey, direction: current.direction === "asc" ? "desc" : "asc" };
}
