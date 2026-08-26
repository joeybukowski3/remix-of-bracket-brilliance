import type { NflProjectionMarket } from "./projectionOutput";

export const NFL_YARDAGE_MATCHUP_SCORE_SCHEMA_VERSION = "nfl-yardage-matchup-score-v2" as const;
export const NFL_YARDAGE_MATCHUP_SCORE_VERSION = "nfl-yardage-matchup-score-phase8-v1" as const;
export const NFL_YARDAGE_MATCHUP_REFERENCE_VERSION = "nfl-yardage-matchup-reference-2022-2024-v1" as const;

export type NflMatchupComponentDetail = {
  score: number;
  indicatorScores: Readonly<Record<string, number>>;
};

type NflYardageMatchupScoreBase = {
  schemaVersion: typeof NFL_YARDAGE_MATCHUP_SCORE_SCHEMA_VERSION;
  scoreVersion: typeof NFL_YARDAGE_MATCHUP_SCORE_VERSION;
  referenceDistributionVersion: typeof NFL_YARDAGE_MATCHUP_REFERENCE_VERSION;
  season: number;
  week: number;
  gameId: string | null;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  market: NflProjectionMarket;
  matchupScore: number;
  opportunityScore: number;
  environmentScore: number;
  generatedAt: string;
};

export type NflPassingMatchupScore = NflYardageMatchupScoreBase & {
  market: "passing";
  components: {
    opportunity: NflMatchupComponentDetail;
    opponent: NflMatchupComponentDetail;
    gameEnvironment: NflMatchupComponentDetail;
    passingQuality: NflMatchupComponentDetail;
  };
};

export type NflRushingMatchupScore = NflYardageMatchupScoreBase & {
  market: "rushing";
  components: {
    workload: NflMatchupComponentDetail;
    roleQuality: NflMatchupComponentDetail;
    teamRushingEnvironment: NflMatchupComponentDetail;
    opponent: NflMatchupComponentDetail;
  };
};

export type NflReceivingMatchupScore = NflYardageMatchupScoreBase & {
  market: "receiving";
  position: "RB" | "WR" | "TE";
  components: {
    opportunity: NflMatchupComponentDetail;
    roleStability: NflMatchupComponentDetail;
    opponent: NflMatchupComponentDetail;
    efficiencyProfile: NflMatchupComponentDetail;
  };
};

/** Structurally separate from projections, prop edges, and uncertainty. */
export type NflYardageMatchupScore = NflPassingMatchupScore | NflRushingMatchupScore | NflReceivingMatchupScore;

