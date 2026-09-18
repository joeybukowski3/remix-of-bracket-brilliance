import type { PositionMatchupPositionKey } from "@/lib/nfl/positionMatchups/types";

/** "rank" shows bare FOR/ALLOWED ranks; "raw" shows PPG with rank in parentheses. EDGE +/- and RATING are unaffected by display mode. */
export type PositionMatchupDisplayMode = "rank" | "raw";

export const DEFAULT_POSITION_MATCHUP_DISPLAY_MODE: PositionMatchupDisplayMode = "rank";

export type PositionMatchupSortField = "for" | "allowed" | "edge";

/** "team"/"opponent" sort alphabetically; "<position>-<field>" sorts by that cell's numeric value. */
export type PositionMatchupSortKey = "team" | "opponent" | `${PositionMatchupPositionKey}-${PositionMatchupSortField}`;

export type PositionMatchupSortDirection = "asc" | "desc";

export type PositionMatchupSortState = {
  key: PositionMatchupSortKey;
  direction: PositionMatchupSortDirection;
};

export const DEFAULT_POSITION_MATCHUP_SORT: PositionMatchupSortState = {
  key: "team",
  direction: "asc",
};

export function positionMatchupSortKey(position: PositionMatchupPositionKey, field: PositionMatchupSortField): PositionMatchupSortKey {
  return `${position}-${field}`;
}
