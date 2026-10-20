/**
 * Every fixed choice that shapes an evaluation's results. All of them are
 * recorded in the manifest, so changing one changes the manifest id.
 */
export const EVALUATION_FRAMEWORK_VERSION = "nba-evaluation-framework-v2";

/** Recent team games in which an appearance qualifies a player for the pregame roster. */
export const ROSTER_LOOKBACK_TEAM_GAMES = 10;

/** Training minutes a player needs before contributing to usage cut points. */
export const USAGE_MIN_TRAIN_MINUTES = 100;
/** Recent prior minutes needed before a pregame usage proxy is defined. */
export const USAGE_MIN_RECENT_MINUTES = 60;
export const USAGE_RECENT_GAMES = 20;
/** usage proxy per minute = (FGA + FTA_WEIGHT x FTA + TOV) / minutes. */
export const FTA_WEIGHT = 0.44;

/** Pseudo-observations pulling a status's play rate toward the overall rate. */
export const STATUS_SHRINK_SAMPLES = 5;
/** Used only when a training window has no establishable samples. */
export const FALLBACK_PARTICIPATION_RATE = 0.9;

export const CALIBRATION_EDGES = [0, 0.5, 0.8, 0.95, 1] as const;
export const SEGMENT_NAMES = ["minutesBucket", "usageBucket", "teamChange", "venue", "historyTier"] as const;

export const FRAMEWORK_PARAMETERS = {
  version: EVALUATION_FRAMEWORK_VERSION,
  rosterLookbackTeamGames: ROSTER_LOOKBACK_TEAM_GAMES,
  usage: { minTrainMinutes: USAGE_MIN_TRAIN_MINUTES, minRecentMinutes: USAGE_MIN_RECENT_MINUTES, recentGames: USAGE_RECENT_GAMES, ftaWeight: FTA_WEIGHT },
  availability: { statusShrinkSamples: STATUS_SHRINK_SAMPLES, fallbackParticipationRate: FALLBACK_PARTICIPATION_RATE },
  calibrationEdges: CALIBRATION_EDGES,
  segments: SEGMENT_NAMES,
} as const;
