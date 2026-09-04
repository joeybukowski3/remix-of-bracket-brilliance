/**
 * WU4F.1 §8-10: a corrected, DIAGNOSTIC-ONLY role-conflict score.
 *
 * Root cause of the old `roleConflictScore = |priorShare - rankPrior|`
 * being miscalibrated: the shadow model's `fit.rankPrior` bucket key is
 * `rank:<n>` with NO position/pool prefix (see shareModels.ts /
 * walkForward.ts line ~61), so a depth-rank-1 QB and a depth-rank-1 RB
 * share the same "rank:1" training bucket. A starting QB who is the only
 * real rusher in his tiny QB sub-pool routinely has ~100%+ of that pool's
 * designed rushes (mean shareOfPositionalPool for QB1 in the real training
 * data is 1.417 -- see WU4F.1 checkpoint), which drags the blended
 * "rank:1" prior (0.85-1.06 depending on fit weighting) far above what an
 * RB1's own historical share ever looks like (RB1 mean = 0.6685). Comparing
 * an RB's bounded [0,1] priorShare against that QB-inflated reference makes
 * nearly every established RB1 starter look like a "conflict."
 *
 * Fix, diagnostic-only: build a pool-scoped rank prior (`rb:<n>` instead of
 * `rank:<n>`) from the SAME training rows the shadow model itself was fit
 * from, and compare like-for-like. This module does NOT touch
 * `shareModels.ts`'s `fit.rankPrior` or `predictRawShare` -- the actual
 * allocation math is completely unchanged. This is purely a better lens for
 * evaluation, uncertainty, and hard-case identification.
 */

export type ConflictLevel = "low" | "medium" | "high";

/** LOCKED structurally (quartile-shaped breaks in the real RB1-4 share distribution), never tuned against 2026 outcomes. */
export const CONFLICT_LEVEL_THRESHOLDS = { medium: 0.15, high: 0.35 } as const;

export interface PoolScopedTrainingRow {
  poolKey: string;
  depthRankProxy: number | null;
  shareOfPositionalPool: number;
}

const RANK_CAP = 6;
function rankBucket(rank: number | null): string {
  if (rank == null) return "NA";
  return String(Math.min(rank, RANK_CAP));
}

/**
 * Builds a `${poolKey}:${rank}` -> mean historical share map from training
 * rows, exactly mirroring `fitShareModel`'s rank-prior fit logic but scoped
 * to one pool at a time so a QB's near-monopoly share of a tiny QB pool
 * never blends into the RB (or WR/TE) reference.
 */
export function buildPoolScopedRankPrior(trainingRows: readonly PoolScopedTrainingRow[]): Map<string, number> {
  const byKey = new Map<string, number[]>();
  for (const row of trainingRows) {
    const key = `${row.poolKey}:${rankBucket(row.depthRankProxy)}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(row.shareOfPositionalPool);
  }
  const prior = new Map<string, number>();
  for (const [key, values] of byKey) {
    prior.set(key, values.reduce((sum, v) => sum + v, 0) / values.length);
  }
  return prior;
}

export function poolScopedRankPriorFor(
  prior: ReadonlyMap<string, number>,
  poolKey: string,
  depthRankProxy: number | null,
): number | null {
  const key = `${poolKey}:${rankBucket(depthRankProxy)}`;
  return prior.get(key) ?? prior.get(`${poolKey}:NA`) ?? null;
}

/**
 * Candidate A (WU4F.1 §9): normalized absolute difference between a
 * player's own historical share and the pool-scoped role prior for their
 * sourced depth rank. Both quantities are bounded [0,1] shares of the same
 * pool -- directly comparable, unlike the old cross-position score.
 */
export function computeNormalizedRoleConflictScore(
  historicalSharePrior: number | null,
  poolScopedRolePrior: number | null,
): number | null {
  if (historicalSharePrior == null || poolScopedRolePrior == null) return null;
  return Math.abs(historicalSharePrior - poolScopedRolePrior);
}

/**
 * Candidate B (WU4F.1 §9): does the player's historical-usage rank
 * (inferred from whether their own share exceeds the pool-scoped prior for
 * a shallower rank) disagree with their sourced depth rank? Kept simple and
 * interpretable: true when the sourced rank is not the rank whose
 * pool-scoped prior is closest to the player's own historical share.
 */
export function historicalRankDisagreesWithSourcedRank(
  historicalSharePrior: number | null,
  poolKey: string,
  sourcedDepthRank: number | null,
  poolScopedPrior: ReadonlyMap<string, number>,
  maxRankToConsider = 4,
): boolean | null {
  if (historicalSharePrior == null || sourcedDepthRank == null) return null;
  let closestRank: number | null = null;
  let closestDistance = Infinity;
  for (let rank = 1; rank <= maxRankToConsider; rank++) {
    const p = poolScopedRankPriorFor(poolScopedPrior, poolKey, rank);
    if (p == null) continue;
    const distance = Math.abs(historicalSharePrior - p);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestRank = rank;
    }
  }
  if (closestRank == null) return null;
  return closestRank !== Math.min(sourcedDepthRank, maxRankToConsider);
}

/**
 * LOW/MEDIUM/HIGH bucketing from the normalized conflict score alone,
 * using the structural thresholds above -- never fit against 2026 outcomes
 * (which do not exist yet for most of this dataset).
 */
export function classifyConflictLevel(normalizedConflictScore: number | null): ConflictLevel | null {
  if (normalizedConflictScore == null) return null;
  if (normalizedConflictScore >= CONFLICT_LEVEL_THRESHOLDS.high) return "high";
  if (normalizedConflictScore >= CONFLICT_LEVEL_THRESHOLDS.medium) return "medium";
  return "low";
}

/**
 * Candidate D (WU4F.1 §9): combines the normalized share gap with the
 * ordering disagreement -- a rank reversal is flagged HIGH regardless of
 * the raw gap size, since an ordering flip is what actually changes which
 * player gets more carries after pool allocation.
 */
export function classifyCombinedConflict(
  normalizedConflictScore: number | null,
  rankDisagrees: boolean | null,
): ConflictLevel | null {
  const base = classifyConflictLevel(normalizedConflictScore);
  if (base == null) return null;
  if (rankDisagrees === true) return "high";
  return base;
}

// ---------------------------------------------------------------------------
// WU4G.2 -- forward archive contract.
//
// Mirrors `receivingRoleConflictDiagnostic.ts`'s two-tier availability
// exactly: "available" describes whether the INPUTS this diagnostic needs
// exist at all (the committed pool-scoped prior artifact loaded, a depth
// rank was sourced, that pool+rank has a fitted prior bucket) -- NOT
// whether the player happens to have no personal history. A `noHistory`
// RB with a valid depth rank and a valid rank-prior lookup IS "available",
// with `conflict_score`/`conflict_level` legitimately null -- a real,
// expected diagnostic value, not an availability failure. Only a genuine
// structural gap (no fitted prior artifact, no depth rank, non-RB pool, or
// no rank-prior bucket for that rank) is "unavailable".
// ---------------------------------------------------------------------------

export type RushingRoleConflictV2UnavailableReason =
  | "missing_prior_artifact"
  | "unsupported_pool"
  | "missing_depth_rank"
  | "missing_rank_prior";

export type RushingRoleConflictV2Diagnostic = {
  historical_share: number | null;
  role_prior_share: number;
  conflict_score: number | null;
  conflict_level: ConflictLevel | null;
  depth_rank: number;
  role_sourced: boolean;
  team_changed: boolean | null;
  no_history: boolean;
};

export type RushingRoleConflictV2ArchiveEntry =
  | { available: true; diagnostic: RushingRoleConflictV2Diagnostic }
  | { available: false; reason: RushingRoleConflictV2UnavailableReason };

/**
 * Builds the archive entry for one RB rushing row. Reads ONLY the row's own
 * already-computed live evidence (`historicalSharePrior`, `depthRank`,
 * `roleSourced`, `teamChanged`, `noHistory` -- the exact same inputs the
 * shadow allocator itself already uses) plus the small committed
 * pool-scoped prior lookup -- never the 33MB research dataset, never a
 * recomputed historical allocation. `poolKey` gates eligibility: only "rb"
 * rows get a V2 diagnostic (a QB/WR/TE rushing row is structurally
 * unsupported -- the pool-scoped prior this fixes is RB-specific).
 */
export function buildRushingRoleConflictV2ArchiveEntry(args: {
  poolKey: "qb" | "rb" | "wrTe";
  depthRank: number | null;
  roleSourced: boolean;
  historicalSharePrior: number | null;
  teamChanged: boolean | null;
  noHistory: boolean;
  poolScopedRankPrior: ReadonlyMap<string, number>;
}): RushingRoleConflictV2ArchiveEntry {
  if (args.poolKey !== "rb") return { available: false, reason: "unsupported_pool" };
  if (args.depthRank == null) return { available: false, reason: "missing_depth_rank" };
  const rolePriorShare = poolScopedRankPriorFor(args.poolScopedRankPrior, "rb", args.depthRank);
  if (rolePriorShare == null) return { available: false, reason: "missing_rank_prior" };
  const conflictScore = computeNormalizedRoleConflictScore(args.historicalSharePrior, rolePriorShare);
  return {
    available: true,
    diagnostic: {
      historical_share: args.historicalSharePrior,
      role_prior_share: rolePriorShare,
      conflict_score: conflictScore,
      conflict_level: classifyConflictLevel(conflictScore),
      depth_rank: args.depthRank,
      role_sourced: args.roleSourced,
      team_changed: args.teamChanged,
      no_history: args.noHistory,
    },
  };
}
