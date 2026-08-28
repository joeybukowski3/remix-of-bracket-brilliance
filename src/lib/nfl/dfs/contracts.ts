// DraftKings NFL Classic source contract for WU1.
// This file defines the shape of an uploaded DraftKings NFL Classic salary CSV
// after strict validation. It intentionally carries no scoring, ranking, or
// projection logic — see nflClassicRules.ts for the informational rules
// contract, and draftKingsCsv.ts for the parser that produces these types.

/**
 * Exact DraftKings NFL Classic CSV header names, in the order observed in a
 * real export. Column lookup during parsing is done by header name, not
 * position, so reordered headers are still accepted.
 */
export const DK_NFL_CLASSIC_HEADERS = [
  "Position",
  "Name + ID",
  "Name",
  "ID",
  "Roster Position",
  "Salary",
  "Game Info",
  "TeamAbbrev",
  "AvgPointsPerGame",
  "Status",
] as const;

export type DraftKingsNflClassicHeader = (typeof DK_NFL_CLASSIC_HEADERS)[number];

/** Positions supported by DraftKings NFL Classic in V1. */
export const DK_NFL_CLASSIC_POSITIONS = ["QB", "RB", "WR", "TE", "DST"] as const;

export type DraftKingsNflClassicPosition = (typeof DK_NFL_CLASSIC_POSITIONS)[number];

/**
 * Expected Roster Position value for each football position, based on the
 * real DraftKings NFL Classic export. RB/WR/TE all carry a FLEX-eligible
 * roster position suffix; QB and DST do not.
 */
export const DK_NFL_CLASSIC_ROSTER_POSITION_BY_POSITION: Record<DraftKingsNflClassicPosition, string> = {
  QB: "QB",
  RB: "RB/FLEX",
  WR: "WR/FLEX",
  TE: "TE/FLEX",
  DST: "DST",
};

/**
 * Status values observed in real exports. Not guaranteed complete — unknown
 * nonblank statuses are preserved and surfaced via a diagnostic rather than
 * rejected outright.
 */
export const DK_NFL_CLASSIC_KNOWN_STATUSES = ["Q", "D", "OUT", "IR"] as const;

export type DraftKingsNflClassicKnownStatus = (typeof DK_NFL_CLASSIC_KNOWN_STATUSES)[number];

/** Contest format detected from CSV headers and row content. */
export type DraftKingsContestFormat = "NFL_CLASSIC" | "SHOWDOWN" | "UNKNOWN";

export const DRAFTKINGS_DIAGNOSTIC_CODES = [
  "EMPTY_FILE",
  "HEADER_ONLY_FILE",
  "MISSING_REQUIRED_COLUMN",
  "DUPLICATE_HEADER",
  "UNKNOWN_COLUMN",
  "INVALID_ROW_WIDTH",
  "CSV_PARSE_ERROR",
  "MISSING_REQUIRED_VALUE",
  "INVALID_POSITION",
  "INVALID_ROSTER_POSITION",
  "INVALID_SALARY",
  "INVALID_DK_ID",
  "DUPLICATE_DK_ID",
  "INVALID_AVG_POINTS",
  "UNKNOWN_STATUS",
  "UNPARSED_GAME_INFO",
  "UNSUPPORTED_CONTEST_FORMAT",
] as const;

export type DraftKingsDiagnosticCode = (typeof DRAFTKINGS_DIAGNOSTIC_CODES)[number];

export type DraftKingsDiagnosticSeverity = "error" | "warning";

export type DraftKingsDiagnostic = {
  severity: DraftKingsDiagnosticSeverity;
  code: DraftKingsDiagnosticCode;
  message: string;
  row: number | null;
  field: string | null;
  value: string | null;
};

/** Deterministic subfields parsed out of a stable "Game Info" grammar. */
export type DraftKingsParsedGameInfo = {
  awayTeam: string;
  homeTeam: string;
  date: string;
  time: string;
  timezone: string;
};

/** A single DraftKings NFL Classic salary row after passing all validation. */
export type ValidatedDraftKingsNflClassicRow = {
  position: DraftKingsNflClassicPosition;
  namePlusId: string;
  name: string;
  /** Preserved as DraftKings source identity only — not a GSIS/NFLVerse ID. */
  dkId: string;
  rosterPosition: string;
  salary: number;
  gameInfoRaw: string;
  game: DraftKingsParsedGameInfo | null;
  teamAbbrev: string;
  /** DraftKings source context only — not a JKB projection. */
  avgPointsPerGame: number | null;
  status: string | null;
};

export type DraftKingsNflClassicSummary = {
  positions: DraftKingsNflClassicPosition[];
  rosterPositions: string[];
  teams: string[];
  games: string[];
  duplicateDkIds: string[];
  statusCounts: Record<string, number>;
};

export type DraftKingsNflClassicParseResult = {
  accepted: boolean;
  contestFormat: DraftKingsContestFormat;
  headers: string[];
  rawRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  rows: ValidatedDraftKingsNflClassicRow[];
  diagnostics: DraftKingsDiagnostic[];
  summary: DraftKingsNflClassicSummary;
};
