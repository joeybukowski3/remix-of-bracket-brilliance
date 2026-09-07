import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";

export type HistoricalSportsbookLine = {
  point: number;
  bookmaker: string;
  observedAt: string;
  selectionPolicyVersion: "approved-final-pre-kickoff-v1";
};

export type YardageAppearance = {
  rowId: string;
  gameId: string;
  season: number;
  week: number;
  /** Canonical scheduled kickoff, UTC. */
  dateUtc: string;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  /** Offensive player's orientation, including defense-matchup rows. */
  homeAway: "home" | "away";
  position: "QB" | "RB" | "WR" | "TE";
  market: NflProjectionMarket;
  actualYards: number;
  historicalSportsbookLine: HistoricalSportsbookLine | null;
  lineResult: "over" | "under" | "push" | "unavailable";
  /** N-1 event chronology; corrected caches do not prove historical publication time. */
  temporalQuality: "event-time-reconstructed";
};

export type PlayerYardageHistoryRow = YardageAppearance & {
  comparison: "player-vs-aggregate-positional-allowance";
  allowanceScope: "entire-position-group-per-defense-game";
  opponentPregamePositionalAllowance: number | null;
  opponentPregamePositionalAllowanceSampleSize: number;
  actualMinusOpponentAllowance: number | null;
  missingReferenceReason: "no-complete-prior-positional-reference" | null;
};

/** opponent is the requested defense; playerId/team identify each opposing individual. */
export type DefenseIndividualMatchupRow = YardageAppearance & {
  comparison: "individual-player-vs-own-pregame-average";
  playerPregameTrailing10Average: number | null;
  playerReferenceSampleSize: number;
  actualMinusPlayerAverage: number | null;
  missingReferenceReason: "no-prior-player-reference" | null;
};

export type IndividualYardageHistoryContext = {
  schemaVersion: "nfl-individual-yardage-history-v1";
  season: number;
  week: number;
  asOf: string;
  lastN: number;
  targetGameIds: string[];
  cohortPolicy: "individual-recorded-offensive-appearances-v1";
  referencePolicy: "entering-game-trailing-10-recorded-games-v1";
  temporalQuality: "event-time-reconstructed";
  players: Record<string, PlayerYardageHistoryRow[]>;
  defenseMatchups: Record<string, DefenseIndividualMatchupRow[]>;
  diagnostics: {
    excludedCutoff: number;
    missingGame: number;
    noRecordedAppearance: number;
    duplicateIdentity: number;
    missingYardage: number;
  };
};

export type HistoryDeltaSummary = {
  /** Number of input rows, including missing comparisons; never the requested window size. */
  n: number;
  comparisonCount: number;
  mean: number | null;
  median: number | null;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  missingCount: number;
};
