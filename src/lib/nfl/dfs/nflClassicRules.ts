// NFL Classic lineup/scoring rules — informational metadata only.
// This contract does not calculate player projections, points, or value. It
// exists so the future DFS analyzer has a single, versioned source of truth
// for the rules a user is drafting against.
//
// The DraftKings salary-cap dollar amount is intentionally omitted: the
// source screenshots this contract was built from do not prove a cap value,
// and no repository evidence was found for one. Do not hardcode $50,000 or
// any other figure here without that evidence.

export const NFL_CLASSIC_RULES_VERSION = "nfl-classic-rules-v1" as const;

export const NFL_CLASSIC_RULES_SOURCE = "User-supplied DraftKings NFL Classic lineup/scoring rules; informational only" as const;

export const NFL_CLASSIC_ROSTER = {
  totalSlots: 9,
  slots: [
    { slot: "QB", count: 1, eligiblePositions: ["QB"] as const },
    { slot: "RB", count: 2, eligiblePositions: ["RB"] as const },
    { slot: "WR", count: 3, eligiblePositions: ["WR"] as const },
    { slot: "TE", count: 1, eligiblePositions: ["TE"] as const },
    { slot: "FLEX", count: 1, eligiblePositions: ["RB", "WR", "TE"] as const },
    { slot: "DST", count: 1, eligiblePositions: ["DST"] as const },
  ],
  /** A valid lineup must include players from at least this many NFL games. */
  minimumGamesRequired: 2,
} as const;

export const NFL_CLASSIC_OFFENSIVE_SCORING = {
  passing: {
    touchdown: 4,
    pointsPerYard: 0.04,
    bonus: { yardThreshold: 300, points: 3 },
    interception: -1,
  },
  rushing: {
    touchdown: 6,
    pointsPerYard: 0.1,
    bonus: { yardThreshold: 100, points: 3 },
  },
  receiving: {
    touchdown: 6,
    pointsPerYard: 0.1,
    reception: 1,
    bonus: { yardThreshold: 100, points: 3 },
  },
  other: {
    fumbleLost: -1,
    twoPointConversion: 2,
    puntKickoffFieldGoalReturnTouchdown: 6,
    offensiveFumbleRecoveryTouchdown: 6,
  },
} as const;

export const NFL_CLASSIC_DST_SCORING = {
  sack: 1,
  interception: 2,
  fumbleRecovery: 2,
  puntKickoffFieldGoalReturnTouchdown: 6,
  interceptionReturnTouchdown: 6,
  fumbleRecoveryTouchdown: 6,
  blockedPuntOrFieldGoalReturnTouchdown: 6,
  safety: 2,
  blockedKick: 2,
  twoPointConversionOrExtraPointReturn: 2,
  /**
   * Points-allowed tiers. `max: null` means "and above" (no upper bound).
   */
  pointsAllowed: [
    { min: 0, max: 0, points: 10 },
    { min: 1, max: 6, points: 7 },
    { min: 7, max: 13, points: 4 },
    { min: 14, max: 20, points: 1 },
    { min: 21, max: 27, points: 0 },
    { min: 28, max: 34, points: -1 },
    { min: 35, max: null as number | null, points: -4 },
  ],
} as const;

/**
 * Intentionally unknown. The supplied source material does not prove a
 * salary-cap dollar amount, so none is encoded here. See file header.
 */
export const NFL_CLASSIC_SALARY_CAP = null;

export const NFL_CLASSIC_RULES = {
  version: NFL_CLASSIC_RULES_VERSION,
  source: NFL_CLASSIC_RULES_SOURCE,
  roster: NFL_CLASSIC_ROSTER,
  offensiveScoring: NFL_CLASSIC_OFFENSIVE_SCORING,
  dstScoring: NFL_CLASSIC_DST_SCORING,
  salaryCap: NFL_CLASSIC_SALARY_CAP,
} as const;

export type NflClassicRules = typeof NFL_CLASSIC_RULES;
