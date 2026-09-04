/**
 * NFL total-model research (Phase A-I). Everything under
 * src/lib/nfl/research/total/** is research infrastructure -- it is not
 * wired into any production consumer, does not read matchup-metrics.json
 * or any other presentation artifact, and never accepts a Vegas
 * spread/total as a projection input. See
 * docs/modeling/JKB_MODELING_MASTER_SPEC.md Phase C for the governing
 * context and scripts/analysis/nfl-total-model-research/ for the CLI
 * harness that drives this module against real historical data.
 */

/** One completed REG-season team-game outcome, both sides. */
export type NflTotalResearchGameOutcome = {
  gameId: string;
  season: number;
  week: number;
  seasonType: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  totalPoints: number;
};

/** One team's raw offensive play-sums for one game, from the compact scoring-support cache. */
export type NflTotalResearchScoringSupportRow = {
  gameId: string;
  season: number;
  week: number;
  team: string;
  opponent: string;
  eligiblePlays: number;
  offEpaSum: number;
  successNum: number;
  successDen: number;
  explosiveCount: number;
};

/** A cutoff strictly identifies "before this team-game" -- season+week only (no time-of-day). */
export type NflTotalResearchCutoff = {
  season: number;
  week: number;
};

export type NflTotalResearchWindowLabel = "seasonPrior" | "priorSeason" | "insufficient";

/** One aggregated EPA/success/explosive window (either a team's own offense, or what its defense allowed). */
export type NflTotalResearchScoringWindow = {
  epaPerPlay: number | null;
  successRate: number | null;
  explosiveRate: number | null;
  sampleGames: number;
  samplePlays: number;
  window: NflTotalResearchWindowLabel;
};

export type NflTotalResearchScoringEnvironmentMode =
  | "priorSeasonOnly"
  | "seasonToDateWithPriorFallback"
  | "rollingWindow";

export type NflTotalResearchScoringEnvironment = {
  value: number | null;
  sampleGames: number;
  mode: NflTotalResearchScoringEnvironmentMode;
  method: "seasonToDate" | "priorSeason" | "rollingWindow" | "allTimeFallback" | "insufficient";
};

/** One row of the Phase C research dataset -- one team's side of one game. */
export type NflTotalResearchDatasetRow = {
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  actualTeamPoints: number;
  actualGameTotal: number;

  scoringEnvironment: NflTotalResearchScoringEnvironment;
  offense: NflTotalResearchScoringWindow;
  opponentDefenseAllowed: NflTotalResearchScoringWindow;

  /** True only when every feature used a real (non-insufficient) window -- rows with any "insufficient" window are flagged, never silently zero-filled. */
  pregameSafe: boolean;
};
