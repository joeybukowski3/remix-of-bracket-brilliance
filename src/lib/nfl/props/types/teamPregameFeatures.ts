export const NFL_TEAM_PREGAME_FEATURES_SCHEMA_VERSION = "nfl-team-pregame-features-v1" as const;

/** One team's per-game play-volume/tendency counters, as aggregated from play-by-play. */
export type NflTeamGamePlayVolumeRecord = {
  gameId: string;
  season: number;
  week: number;
  team: string;
  opponent: string;
  eligiblePlays: number;
  passPlays: number;
  rushPlays: number;
  neutralEligiblePlays: number;
  neutralPassPlays: number;
  passOeSum: number;
  passOeCount: number;
};

/**
 * A rolling-window summary over zero or more of a team's own prior games.
 * Every rate is null (not zero) when its denominator is zero -- a team with
 * no games in the window has no rate, it does not have a rate of zero.
 * `*Sample` fields carry the raw play count backing a rate so a consumer
 * can judge reliability without re-deriving it from `gamesIncluded`.
 */
export type NflRollingWindowVolumeTendency = {
  gamesIncluded: number;
  offensivePlaysPerGame: number | null;
  passAttemptsPerGame: number | null;
  rushAttemptsPerGame: number | null;
  /** dropbacks (pass==1) / all eligible plays, unconditional on situation. */
  overallDropbackRate: number | null;
  /** neutral-situation dropbacks / neutral-situation eligible plays. See NEUTRAL_SITUATION_DEFINITION. */
  earlyDownNeutralPassRate: number | null;
  neutralEligiblePlaysSample: number;
  /**
   * True pass-rate-over-expected: mean of nflfastR's own play-level
   * `pass_oe` (percentage points) over every eligible play with a
   * published value, unconditional on neutral/non-neutral situation
   * because `xpass` already conditions each play on its own situation.
   * See docs/nfl-play-by-play-audit.md for why this is provenance-defensible.
   */
  passRateOverExpected: number | null;
  passOeSample: number;
};

const EMPTY_WINDOW: NflRollingWindowVolumeTendency = {
  gamesIncluded: 0,
  offensivePlaysPerGame: null,
  passAttemptsPerGame: null,
  rushAttemptsPerGame: null,
  overallDropbackRate: null,
  earlyDownNeutralPassRate: null,
  neutralEligiblePlaysSample: 0,
  passRateOverExpected: null,
  passOeSample: 0,
};

export function emptyRollingWindow(): NflRollingWindowVolumeTendency {
  return { ...EMPTY_WINDOW };
}

/**
 * Pregame team opportunity/tendency features for one team entering one
 * game. `seasonPrior` / `last3` / `priorSeason` are deliberately kept as
 * three SEPARATE raw windows -- never blended into one number -- because
 * choosing a blend weight between them is model-fitting, out of scope for
 * this phase. See README "Early-season handling".
 */
export type NflTeamPregameFeatures = {
  schemaVersion: typeof NFL_TEAM_PREGAME_FEATURES_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  homeAway: "home" | "away" | null;
  gameDateUtc: string | null;
  gamesPlayedPriorThisSeason: number;
  hasPriorSeason: boolean;
  seasonPrior: NflRollingWindowVolumeTendency;
  last3: NflRollingWindowVolumeTendency;
  priorSeason: NflRollingWindowVolumeTendency;
  provenance: {
    source: "nflverse play-by-play (compact play-volume cache)";
    neutralSituationDefinition: string;
  };
};
