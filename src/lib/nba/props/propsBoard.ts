/**
 * NBA player-props board: browser-safe view model.
 *
 * Joins a published board artifact (lines and projections) with Defense vs.
 * Position rows. Imports nothing that needs Node (no zod, no hashing), so UI
 * code may import it. Every missing input becomes an explicit state, never a
 * blank or an invented number.
 */
import { compareDvp, DVP_SEASONS, type DvpComparison, type DvpRow, type DvpSeason, type DvpStat } from "./dvp";
import { classifyRosterLabel, type DvpPosition, type PositionClassification } from "./dvpPositions";
import { NO_OVERRIDE, overrideView, playerOverrideKey, type OverrideView } from "./minutesOverride";
import { opponentLastTen, opponentLastTenUnavailable, opponentRecentKey, playerLastTen, type OpponentLastTen, type OpponentRecentSequence, type PlayerLastTen } from "./recentForm";
import { marketRates, recentPerGame, seasonColumns, type SeasonColumns, type SeasonStatsView } from "./seasonStats";

export const BOARD_SCHEMA_VERSION = "nba-props-board-v1";
export const BOARD_MARKETS = ["pts", "reb", "ast"] as const;
export type BoardMarket = (typeof BOARD_MARKETS)[number];
export const MARKET_STAT: Readonly<Record<BoardMarket, DvpStat>> = Object.freeze({ pts: "PTS", reb: "REB", ast: "AST" });
export type LineFreshness = "fresh" | "stale" | "unknown";

export interface BoardLine {
  sportsbook: string;
  line: number;
  overPrice: number;
  underPrice: number;
  capturedAtUtc: string;
  freshness: LineFreshness;
  ageMinutes: number | null;
}

export interface BoardProjection {
  value: number;
  minutes: number | null;
  modelVersion: string;
}

export interface BoardEntry {
  entryKey: string;
  playerName: string;
  team: string | null;
  opponent: string | null;
  gameKey: string;
  tipoffUtc: string;
  /** Roster position label (for example "G-F"); null when the roster source has none. */
  positionLabel: string | null;
  market: BoardMarket;
  /** Null when no line exists or it may not be shown; lineWithheldReason says why. */
  line: BoardLine | null;
  lineWithheldReason: string | null;
  projection: BoardProjection | null;
  projectionUnavailableReason: string | null;
  /**
   * Season-to-date production before this game. Present only on a private preview board (hoopR/ESPN-derived, not licensed
   * for publication); the public board builder never sets it. See seasonStats.ts.
   */
  seasonStats?: SeasonStatsView;
}

export interface BoardSources {
  /** Odds provider ids behind the lines. */
  lines: string[];
  /** Box-score source behind DvP; null when no DvP data exists. */
  dvp: string | null;
  dvpUpdatedUtc: string | null;
}

export interface PropsBoardArtifact {
  schemaVersion: typeof BOARD_SCHEMA_VERSION;
  generatedAtUtc: string;
  /** True when any line or box score is invented test data. The page must say so. */
  isSynthetic: boolean;
  sources: BoardSources;
  entries: BoardEntry[];
  dvpRows: DvpRow[];
  /**
   * What each opponent allowed to each estimated position over its last ten completed games, by `gameKey|team|position`
   * (recentForm.ts). Present only on a private preview board; the public board builder never sets it.
   */
  opponentRecent?: Record<string, OpponentRecentSequence>;
  /**
   * Present only on a board built for local, private preview from a source whose rights allow private research but
   * not publication (v1/privatePreview.ts). The page must show the notice. Such a board is never written under public/.
   */
  privatePreview?: { notice: string; attribution: string };
}

export type DvpState =
  | { kind: "ok"; position: DvpPosition; isMultiPosition: boolean; comparison: DvpComparison }
  | { kind: "no-position"; reason: string }
  | { kind: "no-opponent" }
  | { kind: "no-dvp-data"; position: DvpPosition };

/** The player's JKB projection in each market for this game (null where the board has none). */
export type JkbTriple = Record<BoardMarket, number | null>;

export interface BoardRow {
  entry: BoardEntry;
  /** JKB projection minus line; positive leans Over. Null unless both exist. Never changed by a minutes override. */
  difference: number | null;
  dvp: DvpState;
  /** Season-to-date columns for this market, or null when the board carries no season statistics for the player. */
  season: SeasonColumns | null;
  /** The player's last ten games in this market (oldest to newest) with their average. */
  playerL10: PlayerLastTen;
  /** The opponent's last ten games allowed to the player's estimated position in this market. */
  opponentL10: OpponentLastTen;
  /** The viewer's minutes override applied to this row (all null while none is active). The JKB values above stay as they were. */
  override: OverrideView;
  jkbTriple: JkbTriple;
}

const hasDvpData = (rows: readonly DvpRow[], team: string, position: DvpPosition, stat: DvpStat): boolean =>
  rows.some((r) => r.opponentTeam === team && r.position === position && r.statistic === stat);

export function dvpStateFor(entry: BoardEntry, rows: readonly DvpRow[]): DvpState {
  const position: PositionClassification = classifyRosterLabel(entry.positionLabel);
  if (position.ok === false) return { kind: "no-position", reason: position.reason };
  if (!entry.opponent) return { kind: "no-opponent" };
  const stat = MARKET_STAT[entry.market];
  if (!hasDvpData(rows, entry.opponent, position.primary, stat)) return { kind: "no-dvp-data", position: position.primary };
  return { kind: "ok", position: position.primary, isMultiPosition: position.isMultiPosition, comparison: compareDvp(rows, entry.opponent, position.primary, stat) };
}

/** The opponent's last-ten window for this row: the board's sequence for the opponent and the player's primary estimated position. */
export function opponentL10For(entry: BoardEntry, artifact: Pick<PropsBoardArtifact, "opponentRecent">): OpponentLastTen {
  if (artifact.opponentRecent === undefined) return opponentLastTenUnavailable("stale");
  const position = classifyRosterLabel(entry.positionLabel);
  if (position.ok === false) return opponentLastTenUnavailable("no-position");
  if (!entry.opponent) return opponentLastTenUnavailable("no-opponent");
  return opponentLastTen(artifact.opponentRecent[opponentRecentKey(entry.gameKey, entry.opponent, position.primary)], entry.market);
}

/** Each player's JKB projection by market, keyed like the minutes override. */
function jkbTriples(artifact: PropsBoardArtifact): Map<string, JkbTriple> {
  const triples = new Map<string, JkbTriple>();
  for (const entry of artifact.entries) {
    const key = playerOverrideKey(entry);
    const triple = triples.get(key) ?? { pts: null, reb: null, ast: null };
    triples.set(key, { ...triple, [entry.market]: entry.projection?.value ?? null });
  }
  return triples;
}

/**
 * @param minutes the viewer's applied minutes by player (minutesOverride.ts); omit for none. The rows' JKB fields are always
 * the model's own; the override only fills `override`.
 */
export function buildBoardRows(artifact: PropsBoardArtifact, market: BoardMarket, minutes: ReadonlyMap<string, number> = new Map()): BoardRow[] {
  const triples = jkbTriples(artifact);
  return artifact.entries
    .filter((entry) => entry.market === market)
    .map((entry) => {
      const key = playerOverrideKey(entry);
      const season = seasonColumns(entry.seasonStats);
      return {
        entry,
        difference: entry.line && entry.projection ? entry.projection.value - entry.line.line : null,
        dvp: dvpStateFor(entry, artifact.dvpRows),
        season,
        playerL10: playerLastTen(entry.seasonStats?.recentGames, entry.market),
        opponentL10: opponentL10For(entry, artifact),
        override: minutes.has(key)
          ? overrideView({ jkbProjection: entry.projection?.value ?? null, jkbMinutes: entry.projection?.minutes ?? null, line: entry.line?.line ?? null, seasonPerMinute: marketRates(season?.current ?? null, market).perMinute, userMinutes: minutes.get(key) ?? null })
          : NO_OVERRIDE,
        jkbTriple: triples.get(key) ?? { pts: null, reb: null, ast: null },
      };
    });
}

/**
 * True when a board carries anything that may only exist on a private preview: its notice or any season statistics. The
 * public page refuses such a board at run time, so a private file copied into the published data folder cannot be shown.
 */
export const containsPrivateData = (board: PropsBoardArtifact): boolean =>
  board.privatePreview !== undefined || board.opponentRecent !== undefined || board.entries.some((e) => e.seasonStats !== undefined);

export const BOARD_SORT_KEYS = [
  "player",
  "team",
  "difference",
  "line",
  "projection",
  "dvpRank",
  "jkbMinutes",
  "userMinutes",
  "adjustedProjection",
  "adjustedDifference",
  "seasonRateEstimate",
  "seasonMpg",
  "seasonStatPerGame",
  "seasonStatPerMinute",
  "lastFive",
  "lastTen",
  "oppLastTen",
  "dvpAllowed",
] as const;
export type BoardSortKey = (typeof BOARD_SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export interface BoardFilters {
  search: string;
  team: string | null;
  position: DvpPosition | null;
  onlyWithLine: boolean;
  onlyWithProjection: boolean;
}

export const DEFAULT_FILTERS: BoardFilters = Object.freeze({ search: "", team: null, position: null, onlyWithLine: false, onlyWithProjection: false });

export function filterBoardRows(rows: readonly BoardRow[], filters: BoardFilters): BoardRow[] {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter(({ entry }) => {
    if (needle && !entry.playerName.toLowerCase().includes(needle)) return false;
    if (filters.team && entry.team !== filters.team && entry.opponent !== filters.team) return false;
    if (filters.position) {
      const position = classifyRosterLabel(entry.positionLabel);
      if (!position.ok || !(filters.position in position.weights)) return false;
    }
    if (filters.onlyWithLine && !entry.line) return false;
    if (filters.onlyWithProjection && !entry.projection) return false;
    return true;
  });
}

const sortValue = (row: BoardRow, key: BoardSortKey): number | string | null => {
  switch (key) {
    case "player":
      return row.entry.playerName.toLowerCase();
    case "team":
      return row.entry.team ?? null;
    case "difference":
      return row.difference;
    case "line":
      return row.entry.line?.line ?? null;
    case "projection":
      return row.entry.projection?.value ?? null;
    case "dvpRank":
      return row.dvp.kind === "ok" ? row.dvp.comparison.blended?.rank ?? null : null;
    case "jkbMinutes":
      return row.entry.projection?.minutes ?? null;
    case "userMinutes":
      return row.override.userMinutes;
    case "adjustedProjection":
      return row.override.adjustedProjection;
    case "adjustedDifference":
      return row.override.adjustedDifference;
    case "seasonRateEstimate":
      return row.override.seasonRateEstimate;
    case "seasonMpg":
      return row.season?.current?.mpg ?? null;
    case "seasonStatPerGame":
      return marketRates(row.season?.current ?? null, row.entry.market).perGame;
    case "seasonStatPerMinute":
      return marketRates(row.season?.current ?? null, row.entry.market).perMinute;
    case "lastFive":
      return recentPerGame(row.season?.last5 ?? null, row.entry.market);
    case "lastTen":
      return recentPerGame(row.season?.last10 ?? null, row.entry.market);
    case "oppLastTen":
      return row.opponentL10.average;
    case "dvpAllowed":
      return row.dvp.kind === "ok" ? row.dvp.comparison.blended?.allowedPerGame ?? null : null;
  }
};

/** Sort without mutating the input. Rows missing the sort value always go last, in either direction. */
export function sortBoardRows(rows: readonly BoardRow[], key: BoardSortKey, direction: SortDirection): BoardRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === null && bv === null) return a.entry.entryKey.localeCompare(b.entry.entryKey);
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === "string" || typeof bv === "string" ? String(av).localeCompare(String(bv)) : av - bv;
    return cmp !== 0 ? sign * cmp : a.entry.entryKey.localeCompare(b.entry.entryKey);
  });
}

/**
 * How much of each season's opponent minutes could be attributed to an estimated position (0-1, averaged over the rows of
 * that season). The remainder is left out of DvP, so DvP describes only part of what opponents allowed. Seasons with no rows
 * are omitted rather than shown as zero.
 */
export function dvpPositionCoverage(rows: readonly DvpRow[]): Array<{ season: DvpSeason; coverage: number }> {
  return DVP_SEASONS.flatMap((season) => {
    const own = rows.filter((r) => r.season === season && Number.isFinite(r.minutesCoverage));
    return own.length === 0 ? [] : [{ season, coverage: own.reduce((sum, r) => sum + r.minutesCoverage, 0) / own.length }];
  });
}

/**
 * Fewest and most games any team has sampled this season in the DvP rows, or null when there are none. When the most is
 * below the prior-led threshold, every Opp allows / Matchup reading leans on last season, which the page says once.
 */
export function dvpCurrentSampleRange(rows: readonly DvpRow[]): { min: number; max: number } | null {
  const games = rows.filter((r) => r.season === DVP_SEASONS[1]).map((r) => r.gamesSampled);
  return games.length === 0 ? null : { min: Math.min(...games), max: Math.max(...games) };
}

export function boardTeams(artifact: PropsBoardArtifact): string[] {
  return [...new Set(artifact.entries.flatMap((e) => [e.team, e.opponent]).filter((t): t is string => t !== null))].sort();
}

/** "+110" / "-115" */
export const formatAmerican = (price: number): string => (price > 0 ? `+${price}` : String(price));
