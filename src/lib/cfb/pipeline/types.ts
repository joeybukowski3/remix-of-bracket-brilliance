import type {
  CfbOpponentAdjustedInputs,
  CfbPreseasonModelInputs,
  CfbRawTeamRating,
  CfbRatingBreakdown,
} from "../model";

export type CfbdTeam = {
  id: number;
  school: string;
  classification?: string | null;
};

export type CfbdGame = {
  id: number;
  season: number;
  week: number;
  seasonType: "regular" | "postseason";
  startDate: string;
  startTimeTBD: boolean;
  completed: boolean;
  neutralSite: boolean;
  venue?: string | null;
  homeId: number;
  homeTeam: string;
  homeClassification?: string | null;
  homePoints?: number | null;
  awayId: number;
  awayTeam: string;
  awayClassification?: string | null;
  awayPoints?: number | null;
  notes?: string | null;
  playoff?: unknown | null;
};

export type CfbdGameTeamStats = {
  id: number;
  teams: Array<{
    teamId: number;
    team: string;
    homeAway: "home" | "away";
    points?: number | null;
    stats: Array<{ category: string; stat: string }>;
  }>;
};

export type CfbdReturningProduction = {
  season: number;
  team: string;
  percentPPA: number;
  usage: number;
};

export type CfbdTalent = { year: number; team: string; talent: number };

export type CfbdTransitionTeamPrior = {
  teamId: string;
  team: string;
  sourceClassification: "fcs";
  games: CfbdGame[];
  teamStats: CfbdGameTeamStats[];
};

export type CfbdTransitionTeamCache = {
  schemaVersion: "jkb-cfbd-transition-team-cache-v1";
  provider: "CollegeFootballData.com API v2";
  season: 2025;
  fetchedAt: string;
  teams: CfbdTransitionTeamPrior[];
};

export type CfbHistoricalGameType =
  | "regular"
  | "conference_championship"
  | "bowl"
  | "playoff"
  | "other_postseason";

export type CfbNormalizedHistoricalGame = {
  gameId: string;
  season: number;
  week: number;
  date: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeExternalOpponentId: string | null;
  awayExternalOpponentId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  neutralSite: boolean;
  completed: boolean;
  status: "scheduled" | "final";
  seasonType: "regular" | "postseason";
  gameType: CfbHistoricalGameType;
  homeClassification: string | null;
  awayClassification: string | null;
  includesFcsOpponent: boolean;
};

export type CfbTeamGamePerformance = {
  gameId: string;
  teamId: string;
  teamClassification: string | null;
  opponentTeamId: string | null;
  opponentClassification: string | null;
  points: number | null;
  pointsAllowed: number | null;
  plays: number | null;
  totalYards: number | null;
  yardsPerPlay: number | null;
  yardsPerPlayAllowed: number | null;
  turnovers: number | null;
};

export type CfbPriorPerformanceQa = {
  teamId: string;
  priorPerformanceSource: CfbPreseasonModelInputs["priorPerformanceMetadata"];
  rawOffense: number | null;
  rawDefense: number | null;
  opponentAdjustedOffense: number | null;
  opponentAdjustedDefense: number | null;
  games: number;
  fbsGames: number;
  fcsGames: number;
};

export type CfbTransitionPriorFallback = {
  teamId: string;
  sourceClassification: "fcs";
  games: CfbNormalizedHistoricalGame[];
  performances: CfbTeamGamePerformance[];
  sourceGameIds: string[];
  overlappingFbsCacheGameIds: string[];
  duplicateGameIdsRemoved: number;
};

export type CfbGeneratedRatingRow = {
  teamId: string;
  raw: CfbRawTeamRating;
  display: {
    jkbOffensiveRating: number | null;
    jkbDefensiveRating: number | null;
    jkbPowerRating: number | null;
    jkbRank: number | null;
  };
  sosRemainingRating: number | null;
  sosRemainingRank: number | null;
  inputs: CfbPreseasonModelInputs;
  priorQa: CfbPriorPerformanceQa;
  ratingBreakdown: CfbRatingBreakdown;
  provenance: "model-computed";
};

export type CfbOpponentAdjustmentResult = {
  adjusted: CfbOpponentAdjustedInputs[];
  iterations: number;
  eligibleGameCount: number;
};

/** Raw /lines response shape (CollegeFootballData.com API v2). One row per (game, provider). */
export type CfbdLineEntryRaw = {
  provider: string;
  spread?: number | null;
  spreadOpen?: number | null;
  overUnder?: number | null;
  overUnderOpen?: number | null;
  homeMoneyline?: number | null;
  awayMoneyline?: number | null;
};

export type CfbdLinesGameRaw = {
  id: number;
  lines: CfbdLineEntryRaw[];
};
