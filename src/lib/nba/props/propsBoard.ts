/**
 * NBA player-props board: browser-safe view model.
 *
 * Joins a published board artifact (lines and projections) with Defense vs.
 * Position rows. Imports nothing that needs Node (no zod, no hashing), so UI
 * code may import it. Every missing input becomes an explicit state, never a
 * blank or an invented number.
 */
import { compareDvp, type DvpComparison, type DvpRow, type DvpStat } from "./dvp";
import { classifyRosterLabel, type DvpPosition, type PositionClassification } from "./dvpPositions";

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

export interface BoardRow {
  entry: BoardEntry;
  /** Projection minus line; positive leans Over. Null unless both exist. */
  difference: number | null;
  dvp: DvpState;
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

export function buildBoardRows(artifact: PropsBoardArtifact, market: BoardMarket): BoardRow[] {
  return artifact.entries
    .filter((entry) => entry.market === market)
    .map((entry) => ({
      entry,
      difference: entry.line && entry.projection ? entry.projection.value - entry.line.line : null,
      dvp: dvpStateFor(entry, artifact.dvpRows),
    }));
}

export const BOARD_SORT_KEYS = ["player", "team", "difference", "line", "projection", "dvpRank"] as const;
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

export function boardTeams(artifact: PropsBoardArtifact): string[] {
  return [...new Set(artifact.entries.flatMap((e) => [e.team, e.opponent]).filter((t): t is string => t !== null))].sort();
}

/** "+110" / "-115" */
export const formatAmerican = (price: number): string => (price > 0 ? `+${price}` : String(price));
