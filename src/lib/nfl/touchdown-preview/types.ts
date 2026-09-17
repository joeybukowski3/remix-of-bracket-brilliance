export const NFL_TOUCHDOWN_PREVIEW_SCHEMA_VERSION = "nfl-touchdown-preview-v1" as const;

export type TouchdownPosition = "QB" | "RB" | "WR" | "TE";
export type TouchdownWindowKey = "2025" | "2026" | "last8";
export type TouchdownSampleState = "available" | "zero" | "missing";

/**
 * Provenance of the "Opp TD/Game vs Pos SZN" value:
 * - `"current_season"` -- the opponent has >=1 completed current-season game, so
 *   the figure is a true current-season YTD rate.
 * - `"prior_season_fallback"` -- the opponent has 0 completed current-season
 *   games; the figure is the opponent's FULL prior regular-season rate. It is
 *   never a blend of the two seasons, and must never be labelled as YTD.
 * - `null` -- neither sample exists.
 */
export type TouchdownSeasonMetricSource = "current_season" | "prior_season_fallback";

/**
 * Per-player anytime-TD market state. "unavailable" covers both "no
 * approved-book quote exists for this player" and "no market artifact was
 * ever produced" -- either way there is nothing real to show. "suspended"
 * means a quote was resolved but this game's kickoff has already passed, so
 * the odds are frozen/stale rather than live. Odds are presentation only;
 * this state never affects JKB TD Score.
 */
export type TouchdownOddsSourceState = "available" | "unavailable" | "suspended";

export type TouchdownPlayerGame = {
  gameId: string;
  season: number;
  week: number;
  date: string | null;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  teamScore: number | null;
  opponentScore: number | null;
  carries: number;
  targets: number;
  scorerOpportunities: number | null;
  teamScorerOpportunities: number | null;
  teamRzOpportunities: number | null;
  teamGoalLineOpportunities: number | null;
  rushingTds: number;
  receivingTds: number;
  touchdowns: number;
  rzOpportunities: number | null;
  inside10Opportunities: number | null;
  goalLineOpportunities: number | null;
};

export type TouchdownOpponentGame = {
  gameId: string;
  season: number;
  week: number;
  date: string | null;
  defense: string;
  opponent: string;
  homeAway: "home" | "away";
  defenseScore: number | null;
  opponentScore: number | null;
  offensiveTdsAllowed: number;
  rzOpportunitiesAllowed: number | null;
  inside10OpportunitiesAllowed: number | null;
  goalLineOpportunitiesAllowed: number | null;
  touchdownsAllowedByPosition: Record<TouchdownPosition, number>;
};

export type TouchdownCandidateInput = {
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away";
  position: TouchdownPosition;
  gameId: string;
  kickoff: string | null;
  impliedTeamPoints: number | null;
  playerGames: readonly TouchdownPlayerGame[] | null;
  opponentGames: readonly TouchdownOpponentGame[] | null;
  /** Sportsbook context only -- see TouchdownOddsSourceState. Never a model input. */
  anytimeTdOdds?: number | null;
  anytimeTdBook?: string | null;
  /** Vig-inclusive sportsbook-implied probability (0-1), NOT devigged. Never "fair" or "JKB" probability. */
  marketImpliedProbability?: number | null;
  oddsUpdatedAt?: string | null;
  oddsSourceState?: TouchdownOddsSourceState;
};

export type TouchdownMetric = {
  value: number | null;
  percentile: number | null;
  rank: number | null;
  poolSize: number;
};

export type TouchdownScoreComponents = {
  playerUsage: TouchdownMetric;
  tdOpportunities: TouchdownMetric;
  teamUsage: TouchdownMetric;
  tdSuccess: TouchdownMetric;
  opponentTdOpportunities: TouchdownMetric;
  opponentPositionTdsAllowed: TouchdownMetric;
  impliedTeamPoints: TouchdownMetric;
};

export type TouchdownWindowMetrics = {
  sampleState: TouchdownSampleState;
  sampleGames: number;
  sampleLabel: string;
  tdPerGame: number | null;
  tdLast5PerGame: number | null;
  usagePerGame: number | null;
  teamUsageShare: number | null;
  rzOpportunitiesPerGame: number | null;
  inside10OpportunitiesPerGame: number | null;
  goalLineOpportunitiesPerGame: number | null;
  rzOpportunityShare: number | null;
  goalLineOpportunityShare: number | null;
  impliedTeamPoints: number | null;
  opponentTdOpportunitiesPerGame: number | null;
  opponentPositionTdsAllowedPerGame: number | null;
  /**
   * TDs the opponent has allowed to the candidate's position, per game, over the
   * CURRENT season only (YTD). Window-independent: never affected by the Last 8
   * UI selection. When the opponent has no current-season games yet, this falls
   * back to the opponent's FULL prior regular-season rate (see
   * `opponentPositionTdsAllowedPerGameSeasonSource`); it is `null` only when
   * neither season has an applicable game. Never a blend of the two seasons.
   */
  opponentPositionTdsAllowedPerGameSeason: number | null;
  /** Provenance of `opponentPositionTdsAllowedPerGameSeason`. See `TouchdownSeasonMetricSource`. */
  opponentPositionTdsAllowedPerGameSeasonSource: TouchdownSeasonMetricSource | null;
  /**
   * TDs the opponent has allowed to the candidate's position, per game, over the
   * opponent's trailing five applicable games in strict (season, week) reverse
   * chronological order -- crossing the season boundary until five current-season
   * games exist. Window-independent: never the Last 8 UI window. `null` when the
   * opponent has no applicable games.
   */
  opponentPositionTdsAllowedPerGameLast5: number | null;
  /**
   * Favorable percentile (higher raw allowance = higher percentile) of
   * `opponentPositionTdsAllowedPerGameSeason` / `...Last5` over the FULL fixed
   * candidate population, from the same `computePercentileRanks` methodology the
   * board heat lookups use. These are the two distinct raw metrics' own
   * percentiles -- never the JKB `components.opponentPositionTdsAllowed` value,
   * which ranks a position-relative index over the selected window.
   */
  opponentPositionTdsAllowedPerGameSeasonPercentile: number | null;
  opponentPositionTdsAllowedPerGameLast5Percentile: number | null;
  tdSuccessRate: number | null;
  components: TouchdownScoreComponents;
  jkbTdScore: number | null;
  scoreRank: number | null;
  scorePoolSize: number;
};

export type TouchdownPreviewPlayer = Omit<TouchdownCandidateInput, "playerGames" | "opponentGames"> & {
  windows: Record<TouchdownWindowKey, TouchdownWindowMetrics>;
  playerHistory: TouchdownPlayerGame[];
  opponentHistory: TouchdownOpponentGame[];
};

export type TouchdownPreviewArtifact = {
  schemaVersion: typeof NFL_TOUCHDOWN_PREVIEW_SCHEMA_VERSION;
  modelVersion: "jkb-td-score-v1.0.0";
  season: number;
  week: number;
  generatedAt: string | null;
  defaultWindow: TouchdownWindowKey;
  sourceStatus: {
    playerWeekStats: "available" | "missing";
    touchdownContext: "available" | "missing";
    marketImpliedPoints: "available" | "partial" | "missing";
    /** "unsupported" = no anytime-TD market artifact has ever been produced; otherwise reflects join coverage across this week's candidates. */
    anytimeTdOdds: "available" | "partial" | "missing" | "unsupported";
  };
  methodology: {
    normalization: string;
    tdSuccess: string;
    positionAdjustment: string;
    componentWeights: Record<keyof TouchdownScoreComponents, number>;
    opportunityWeights: { rz: number; inside10: number; goalLine: number };
  };
  players: TouchdownPreviewPlayer[];
};
