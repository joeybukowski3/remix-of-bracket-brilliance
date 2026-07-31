/**
 * Shared game-start-time formatting, fallback, and sort helpers for the MLB
 * prop tables (HR Props, Strikeout Props, and the Batter-vs-Pitcher matchup
 * table). One implementation so every table renders and sorts "Game Time"
 * identically instead of drifting via copy-pasted parsing logic.
 */

/** Matches the existing game-time convention already used on the live schedule page (MlbGameDetail.tsx formatGameTime). */
const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

/** Shown whenever a start time is missing or cannot be parsed. Never render "Invalid Date". */
export const GAME_TIME_FALLBACK_LABEL = "TBD";

/** Formats an ISO game-start timestamp as e.g. "7:10 PM" (America/New_York), or the TBD fallback when absent/malformed. */
export function formatGameTime(value: string | null | undefined): string {
  if (!value) return GAME_TIME_FALLBACK_LABEL;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return GAME_TIME_FALLBACK_LABEL;
  return TIME_FORMATTER.format(date);
}

/** Numeric sort key for a game-start timestamp. Missing/unparseable values map to +Infinity so they can be pushed to the end of both ascending and descending sorts. */
export function getGameTimeSortValue(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * Comparator for a "gameStartTime" sortable column. Valid timestamps sort
 * chronologically in the requested direction; missing/unparseable values
 * always sort after every valid timestamp, in both ascending and descending
 * order (a deliberate exception to simple sign-flipping) so a table full of
 * scheduled games with one "TBD" row never buries every real time under it.
 */
export function compareGameStartTime(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: "asc" | "desc",
): number {
  const av = getGameTimeSortValue(a);
  const bv = getGameTimeSortValue(b);
  if (av === Number.POSITIVE_INFINITY && bv === Number.POSITIVE_INFINITY) return 0;
  if (av === Number.POSITIVE_INFINITY) return 1;
  if (bv === Number.POSITIVE_INFINITY) return -1;
  const base = av - bv;
  return dir === "asc" ? base : -base;
}
