/**
 * Canonical NBA player-prop schemas (Phase 1).
 *
 * Identity: ids are source-native (stats.nba.com PERSON_ID / TEAM_ID / 10-digit
 * GAME_ID for Phase 1 data). A dataset holds one source; mapping between
 * sources goes through a PlayerIdCrosswalk (sources/types.ts).
 * Team abbreviations are stored as display-at-time values only (franchise
 * relocations and renames keep TEAM_ID but change the abbreviation).
 */
import type { NbaSeasonType } from "./seasonType";

export const RAW_ENDPOINTS = ["playergamelogs", "teamgamelogs"] as const;
export type RawEndpoint = (typeof RAW_ENDPOINTS)[number];

/** Provenance written next to every preserved raw response body. */
export interface RawSnapshotMeta {
  schemaVersion: "nba-raw-snapshot-meta-v1";
  /** `<endpoint>/<season>/<seasonType>/<stamp>`; unique per request. */
  snapshotId: string;
  source: "stats.nba.com";
  endpoint: RawEndpoint;
  season: string;
  seasonType: NbaSeasonType;
  params: Record<string, string>;
  requestUrl: string;
  retrievedAtUtc: string;
  httpStatus: number;
  attempts: number;
  bodyFile: string;
  bodyByteSize: number;
  bodySha256: string;
  rowCount: number;
}

export interface NbaBoxStats {
  pts: number;
  reb: number;
  ast: number;
  oreb: number;
  dreb: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  plusMinus: number | null;
}

interface NbaGameContext {
  gameId: string;
  /** Local game date as reported by stats.nba.com (YYYY-MM-DD). No tip time is available. */
  gameDate: string;
  season: string;
  seasonType: NbaSeasonType;
  teamId: number;
  teamAbbr: string;
  /** Resolved from the matching team-game row; null only if that row is missing. */
  opponentTeamId: number | null;
  opponentAbbr: string;
  isHome: boolean;
  sourceSnapshotId: string;
}

/**
 * One row per player who appeared in a game. Players who did not play (DNP,
 * inactive, not with the team) have no row in the season game logs; see
 * `docs/nba-player-props-phase-1.md` for the participation contract.
 */
export interface NbaPlayerGame extends NbaGameContext, NbaBoxStats {
  schemaVersion: "nba-player-game-v1";
  playerId: number;
  playerName: string;
  /** Decimal minutes from MIN, falling back to MIN_SEC ("mm:ss", which can read "mm:60"). */
  minutes: number;
}

export interface NbaTeamGame extends NbaGameContext, NbaBoxStats {
  schemaVersion: "nba-team-game-v1";
  /** Team minutes as reported (48 = regulation, + 5 per overtime). */
  minutes: number;
  won: boolean | null;
}

export interface NbaGame {
  gameId: string;
  gameDate: string;
  season: string;
  seasonType: NbaSeasonType;
  /** Both participants, ascending. */
  teamIds: [number, number];
  /** Null for neutral-site games (international, NBA Cup knockout in Las Vegas). */
  homeTeamId: number | null;
  awayTeamId: number | null;
  /** stats.nba.com lists both teams as "@" for neutral-site games. */
  neutralSite: boolean;
}

export interface NbaPlayerIdentity {
  playerId: number;
  /** Most recent name observed; `namesSeen` keeps every spelling. */
  playerName: string;
  namesSeen: string[];
  firstGameDate: string;
  lastGameDate: string;
  teamIdsSeen: number[];
}

export interface NbaTeamIdentity {
  teamId: number;
  abbreviationsBySeason: Record<string, string>;
  namesSeen: string[];
}

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  gameId?: string;
  playerId?: number;
  teamId?: number;
  snapshotId?: string;
}

export const PROJECTED_STATS = ["minutes", "pts", "reb", "ast"] as const;
export type ProjectedStat = (typeof PROJECTED_STATS)[number];

/**
 * A pregame projection snapshot. Never contains the actual result; outcomes
 * live in `NbaOutcomeRecord` and are only joined during evaluation.
 */
export interface NbaPredictionSnapshot {
  schemaVersion: "nba-prediction-snapshot-v1";
  modelVersion: string;
  /** Features use only games dated strictly before this date. */
  cutoffDate: string;
  gameId: string;
  playerId: number;
  teamId: number;
  season: string;
  seasonType: NbaSeasonType;
  flags: {
    historyTier: "none" | "thin" | "partial" | "full";
    teamChanged: boolean;
    teamChangedRecently: boolean;
    returningFromAbsence: boolean;
    roleChange: boolean;
  };
  priorGames: number;
  /** Model projection plus each naive comparison; null when a method is undefined. */
  projections: Record<string, Record<ProjectedStat, number | null>>;
}

export interface NbaOutcomeRecord {
  schemaVersion: "nba-outcome-v1";
  gameId: string;
  playerId: number;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
}
