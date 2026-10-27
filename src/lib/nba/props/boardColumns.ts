/**
 * Which columns the props table shows: the registry of column ids, the compact default set, and the viewer's choice.
 *
 * Browser-safe, no React. The only thing ever remembered between visits is a list of column ids (a display preference).
 * Player names, statistics, projections, lines and minutes overrides are never written anywhere; see the tests.
 */

/** In display order. Optional columns sit beside the default column they relate to. */
export const COLUMN_IDS = [
  "seasonSample",
  "mpg",
  "perGame",
  "perMinute",
  "last5",
  "last10",
  "lastSeason",
  "oppLast10",
  "dvpAllowed",
  "dvpPrior",
  "dvpCurrent",
  "dvpGames",
  "matchup",
  "line",
  "jkbProjection",
  "modelEdge",
  "overUnder",
  "jkbMinutes",
  "userMinutes",
  "adjustedProjection",
  "adjustedDifference",
  "seasonRateEstimate",
  "jkbTriple",
  "source",
] as const;
export type ColumnId = (typeof COLUMN_IDS)[number];

/**
 * The compact table: MPG, per game, per minute, the player's last ten, what the opponent allowed over its last ten, matchup,
 * Vegas Line, JKB projection (the player column is always shown). Last five and the season-long Opp allows stay one click away.
 */
export const DEFAULT_COLUMNS: readonly ColumnId[] = Object.freeze(["mpg", "perGame", "perMinute", "last10", "oppLast10", "matchup", "line", "jkbProjection"] as const);

/**
 * Columns that cannot be hidden. Vegas Line sits immediately before JKB Projection and is always there, because a projection
 * is read against the line; it shows N/A where no permitted line exists.
 */
export const FIXED_COLUMNS: readonly ColumnId[] = Object.freeze(["line"] as const);
export const isFixedColumn = (id: ColumnId): boolean => FIXED_COLUMNS.includes(id);

/** Columns that exist only where the board carries season statistics (a private preview board). */
const SEASON_ONLY: ReadonlySet<ColumnId> = new Set(["seasonSample", "mpg", "perGame", "perMinute", "last5", "last10", "lastSeason", "oppLast10", "seasonRateEstimate"]);
export const needsSeasonStats = (id: ColumnId): boolean => SEASON_ONLY.has(id);

export const isColumnId = (value: unknown): value is ColumnId => typeof value === "string" && (COLUMN_IDS as readonly string[]).includes(value);

/** The chosen ids plus the fixed ones, as a new set: an older saved choice that predates a fixed column still shows it. */
export const withFixedColumns = (selected: ReadonlySet<ColumnId>): Set<ColumnId> => new Set([...selected, ...FIXED_COLUMNS]);

/** The chosen ids that can be shown on this board, in display order. Fixed columns are always included. */
export function visibleColumns(selected: ReadonlySet<ColumnId>, hasSeasonStats: boolean): ColumnId[] {
  const chosen = withFixedColumns(selected);
  return COLUMN_IDS.filter((id) => chosen.has(id) && (hasSeasonStats || !needsSeasonStats(id)));
}

/** A new selection with one column switched on or off; the input is not modified. A fixed column cannot be switched off. */
export function withColumn(selected: ReadonlySet<ColumnId>, id: ColumnId, on: boolean): Set<ColumnId> {
  const next = new Set(selected);
  if (on || isFixedColumn(id)) next.add(id);
  else next.delete(id);
  return next;
}

export const defaultSelection = (): Set<ColumnId> => new Set(DEFAULT_COLUMNS);

export const COLUMN_PREFERENCE_KEY = "jkb-nba-props-columns-v1";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** What was stored, or null when it is missing, unreadable, or names nothing this page knows. Unknown ids are dropped. */
export function parseColumnPreference(raw: string | null): Set<ColumnId> | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const columns = typeof parsed === "object" && parsed !== null ? (parsed as { columns?: unknown }).columns : undefined;
    if (!Array.isArray(columns)) return null;
    const known = columns.filter(isColumnId);
    // An explicitly empty list is a real choice (no optional columns); a list of ids this page no longer knows is not.
    return columns.length > 0 && known.length === 0 ? null : new Set(known);
  } catch {
    return null;
  }
}

/** Storage can be missing, blocked or throw (private windows, cleared site data): every access is guarded. */
export function loadColumnPreference(getStorage: () => PreferenceStorage | null): Set<ColumnId> | null {
  try {
    return parseColumnPreference(getStorage()?.getItem(COLUMN_PREFERENCE_KEY) ?? null);
  } catch {
    return null;
  }
}

/** Remembers only the column ids. Returns false when the browser would not store them; the page keeps working either way. */
export function saveColumnPreference(getStorage: () => PreferenceStorage | null, selected: ReadonlySet<ColumnId>): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(COLUMN_PREFERENCE_KEY, JSON.stringify({ version: 1, columns: COLUMN_IDS.filter((id) => selected.has(id)) }));
    return true;
  } catch {
    return false;
  }
}

export function clearColumnPreference(getStorage: () => PreferenceStorage | null): void {
  try {
    getStorage()?.removeItem(COLUMN_PREFERENCE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export const browserStorage = (): PreferenceStorage | null => (typeof window === "undefined" ? null : window.localStorage);
