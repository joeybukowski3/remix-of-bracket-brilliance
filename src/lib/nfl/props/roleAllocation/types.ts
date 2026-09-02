/**
 * WU4B — positional pools + player opportunity-share allocation. Types.
 *
 * WU4A produces, per team per game, a finite team opportunity pool:
 *   projected_team_plays / projected_dropback_rate
 *   projected_pass_attempts (== dropbacks) / projected_rush_attempts (== designed rushes)
 *
 * WU4B splits those pools into positional sub-pools and then allocates each
 * sub-pool across the eligible players by a projected opportunity share.
 * This file only carries the DATASET shapes (historical share targets +
 * point-in-time role features). Candidate share models and the allocation
 * engine live in sibling modules.
 *
 * ACCOUNTING (documented exactly — see docs/modeling/MODEL_CHANGELOG.md WU4B):
 *
 * RUSHING. WU4A `projected_rush_attempts` are DESIGNED rushes (`rush_plays`
 * from the compact play-volume cache): they include RB carries, QB designed
 * runs and WR/TE designed runs, and they EXCLUDE QB scrambles (scrambles
 * are dropbacks) and kneels. We split that pool three ways:
 *   rush_plays ≈ qbDesignedPool + rbPool + wrTePool
 * Player-week `carries` (the box-score column, and the modeling target)
 * additionally include scrambles for QBs and kneels, so raw summed carries
 * over-cover `rush_plays`. We therefore (a) net scrambles out of the QB
 * carry count when forming the QB pool, and (b) store an explicit
 * `poolCoverageRatio` / `residualDesignedRushes` per team-game rather than
 * silently forcing coverage. For the projection identity the three pool
 * SHARES are renormalised to sum to 1, so the emitted sub-pools always sum
 * back to `projected_rush_attempts` exactly.
 *
 * RECEIVING. WU4A `projected_pass_attempts` are DROPBACKS (attempts + sacks
 * + scrambles). Targets are only thrown balls. Before allocating targets we
 * reduce dropbacks to a targetable pass pool:
 *   projected_targetable_pass_attempts = projected_dropbacks − E[sacks] − E[scrambles]
 * Two candidate reductions are carried and compared in walk-forward
 * validation (neither is combined, neither is tuned to Week 1):
 *   A. calibrated ratio  — targetable = dropbacks × team targetable-ratio,
 *      the point-in-time (team → league) mean of attempts / dropbacks.
 *   B. explicit subtraction — targetable = dropbacks − E[sacks] − E[scrambles],
 *      each expectation a point-in-time (team → league) per-dropback rate.
 * `sacks_suffered` and team pass `attempts` come from stats_team_week;
 * scrambles = dropbacks − attempts − sacks_suffered (clamped ≥ 0).
 */

export const NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION = "nfl-role-allocation-dataset-v1" as const;

export type NflRushPoolKey = "qb" | "rb" | "wrTe";
export type NflReceivingPoolKey = "rbTe" | "wr" | "all";

/**
 * One team-game's realised positional pools. Historical only (needs the
 * played game's play-volume + team-week box score). All counts are actual.
 */
export type NflTeamPositionalPoolRow = {
  schemaVersion: typeof NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  gameDateUtc: string;

  /** Actual designed rushes (`rush_plays`). */
  designedRushes: number;
  /** Actual dropbacks (`pass_plays`). */
  dropbacks: number;
  /** Actual team pass attempts (thrown balls) from stats_team_week. */
  teamPassAttempts: number;
  /** Actual team sacks suffered from stats_team_week. */
  sacks: number;
  /** dropbacks − teamPassAttempts − sacks, clamped ≥ 0. */
  scrambles: number;
  /** Actual summed team targets from stats_team_week (thrown-ball receivers). */
  teamTargets: number;

  /** Raw summed player-week carries by position group (include scrambles/kneels). */
  rawCarries: { qb: number; rb: number; wrTe: number };
  /** QB carries with scrambles netted out (clamped 0..rawCarries.qb). */
  qbDesignedRushes: number;
  /** Designed-rush pool counts that we DO allocate. */
  rushPools: { qb: number; rb: number; wrTe: number };
  /** (qbDesignedRushes + rb + wrTe) / designedRushes — 1.0 is perfect coverage. */
  poolCoverageRatio: number;
  /** designedRushes − allocated designed rushes (can be ±; kneels push it up). */
  residualDesignedRushes: number;
  /** Renormalised pool shares (sum to exactly 1) used for the projection identity. */
  rushPoolShares: { qb: number; rb: number; wrTe: number };

  /** Actual targetable pass attempts under each candidate reduction. */
  targetable: {
    /** attempts / dropbacks this game (actual). */
    ratioActual: number;
    /** sacks / dropbacks this game (actual). */
    sackRateActual: number;
    /** scrambles / dropbacks this game (actual). */
    scrambleRateActual: number;
  };
};

export type NflRushShareRoleEvidence = {
  /** Depth rank among the team's same-position group by point-in-time pool share (1 = highest). Null if no history. */
  depthRankProxy: number | null;
  /** depthRankProxy === 1. */
  isProjectedStarter: boolean;
  position: "QB" | "RB" | "WR" | "TE";
  /** Player's team this week (from weekly_rosters, 2023+). Null pre-2023 / unresolved. */
  currentTeam: string | null;
  /** Team of the player's most recent prior game in the log. Null if none. */
  priorTeam: string | null;
  teamChanged: boolean | null;
  priorGamesPlayed: number;
  noHistory: boolean;
  limitedHistory: boolean;
  /** Point-in-time mean of (player carries / team RB-pool carries) over prior games (coalesced season → prior season). */
  priorPoolShare: number | null;
  /** Point-in-time mean of (player carries / team designed rushes). */
  priorDesignedShare: number | null;
  priorCarriesPerGame: number | null;
  /** Eligible same-position players on the roster this week. Null pre-2023. */
  rosterCompetitionCount: number | null;
  /** Team's recent leading-back carry concentration (committee proxy, reused from WU-rushing). */
  committeeConcentration: number | null;
};

export type NflReceivingShareRoleEvidence = {
  depthRankProxy: number | null;
  isProjectedStarter: boolean;
  position: "RB" | "WR" | "TE";
  currentTeam: string | null;
  priorTeam: string | null;
  teamChanged: boolean | null;
  priorGamesPlayed: number;
  noHistory: boolean;
  limitedHistory: boolean;
  priorTargetShare: number | null;
  priorTargetsPerGame: number | null;
  rosterCompetitionCount: number | null;
  /** Team's recent top-target concentration (committee proxy). */
  concentration: number | null;
};

/** One player-game rushing SHARE observation (historical). */
export type NflRushShareRow = {
  schemaVersion: typeof NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  playerId: string;
  playerName: string;
  gameDateUtc: string;
  /** Actual carries (box score; the WU-rushing target denominator). */
  carries: number;
  /** Actual rushing yards (box score). */
  rushingYards: number;
  /** Point-in-time mean yards/carry over prior games (season → prior season), unshrunk. Null if no prior carries. */
  priorYardsPerCarry: number | null;
  /** carries / team designed rushes (rush_plays). */
  shareOfDesignedRushes: number | null;
  /** carries / team pool count for this player's position group. */
  shareOfPositionalPool: number | null;
  poolKey: NflRushPoolKey;
  role: NflRushShareRoleEvidence;
};

/** One player-game receiving SHARE observation (historical). */
export type NflReceivingShareRow = {
  schemaVersion: typeof NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION;
  season: number;
  week: number;
  gameId: string;
  team: string;
  opponent: string;
  playerId: string;
  playerName: string;
  gameDateUtc: string;
  targets: number;
  /** Actual receiving yards (box score). */
  receivingYards: number;
  /** Point-in-time mean yards/target over prior games (season → prior season), unshrunk. Null if no prior targets. */
  priorYardsPerTarget: number | null;
  /** targets / team pass attempts (targetable actual). */
  shareOfTargetable: number | null;
  /** targets / team dropbacks. */
  shareOfDropbacks: number | null;
  role: NflReceivingShareRoleEvidence;
};

export type NflRoleAllocationDataset = {
  schemaVersion: typeof NFL_ROLE_ALLOCATION_DATASET_SCHEMA_VERSION;
  generatedAt: string;
  seasons: number[];
  teamPositionalPools: NflTeamPositionalPoolRow[];
  rushShares: NflRushShareRow[];
  receivingShares: NflReceivingShareRow[];
  qa: NflRoleAllocationDatasetQa;
};

export type NflRoleAllocationDatasetQa = {
  teamGamesExpected: number;
  teamGamesResolved: number;
  rushShareRows: number;
  receivingShareRows: number;
  rushPoolCoverage: { min: number; p10: number; median: number; mean: number; max: number };
  targetableRatio: { min: number; p10: number; median: number; mean: number; max: number };
  sackRate: { median: number; mean: number };
  scrambleRate: { median: number; mean: number };
  teamGamesWithNegativeResidual: number;
  rosterCoverageBySeasonPct: Record<string, number>;
  rushShareSumByTeamGame: { min: number; median: number; mean: number; max: number };
  receivingTargetSumVsAttempts: { min: number; median: number; mean: number; max: number };
};
