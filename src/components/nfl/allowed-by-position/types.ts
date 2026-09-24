/**
 * Generic shell for "N Allowed by Position" defense-rank tables (Fantasy
 * Points Allowed today; TDs Allowed by Position is expected to reuse this
 * unchanged). Metric-specific logic (scoring, artifact shape, column
 * labels/colors) stays in the metric's own lib module and is mapped into
 * these generic shapes before reaching the table.
 */

export type AllowedByPositionColumn<ColumnKey extends string> = {
  key: ColumnKey;
  label: string;
  /** Understated header background/text accent, e.g. "bg-rose-50 text-rose-700". */
  headerClassName?: string;
  /** Render "QB PASS" as a compact two-line header ("QB" over "PASS"); `label` stays the accessible/sort name. */
  stackLabel?: boolean;
};

export type AllowedByPositionCell = {
  rank: number | null;
  /** Underlying raw metric value for Raw display mode and raw-value sorting. Omit for tables that only ever show rank. */
  rawValue?: number | null;
  /** Pre-formatted raw text (e.g. "5.4") -- the table renders this verbatim, it does not format numbers itself. */
  rawDisplay?: string | null;
};

/** "rank" shows the bare defensive rank; "raw" shows the underlying metric with rank in parentheses. Heat color is always rank-driven in both modes. */
export type AllowedByPositionDisplayMode = "rank" | "raw";

export const DEFAULT_ALLOWED_BY_POSITION_DISPLAY_MODE: AllowedByPositionDisplayMode = "rank";

export type AllowedByPositionRow<ColumnKey extends string> = {
  /** Stable unique key, e.g. team abbreviation. */
  id: string;
  team: string;
  opponent: string | null;
  location: "@" | "vs" | null;
  cells: Record<ColumnKey, AllowedByPositionCell>;
};

/** "team" and "opponent" sort alphabetically; any other value is a column key sorting by rank. */
export type AllowedByPositionSortKey = "team" | "opponent" | (string & {});

export type AllowedByPositionSortDirection = "asc" | "desc";

export type AllowedByPositionSortState = {
  key: AllowedByPositionSortKey;
  direction: AllowedByPositionSortDirection;
};

export const DEFAULT_ALLOWED_BY_POSITION_SORT: AllowedByPositionSortState = {
  key: "team",
  direction: "asc",
};
