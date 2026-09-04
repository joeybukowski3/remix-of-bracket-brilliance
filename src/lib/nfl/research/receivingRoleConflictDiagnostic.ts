/**
 * WU4F.2 §4 -- a DIAGNOSTIC-ONLY receiving role-conflict score.
 *
 * Unlike the rushing shadow model (see `rushingRoleConflictDiagnosticV2.ts`),
 * receiving v2's `fit.rankPrior` is ALREADY scoped per-position
 * (`walkForward.ts` builds `rankKey` as `${position}:${depthRank}`, e.g.
 * `WR:1`, `TE:1` -- never a bare `rank:<n>`). There is no QB/RB pool-mixing
 * bug to correct here: a player's own `priorTargetShare` and the model's own
 * `fit.rankPrior.get(rankKey)` are already directly comparable, bounded
 * [0,1] shares of the SAME finite receiving pool for the SAME position. This
 * module therefore does not need to rebuild a pool-scoped prior -- it reads
 * the production model's own rank-prior table as-is.
 *
 * This module does NOT touch `shareModels.ts`, `receivingProduction.ts`, or
 * any production allocation math. It is purely a lens for evaluation,
 * uncertainty, and hard-case identification -- see WU4F.2 checkpoint.
 */

export type ReceivingConflictLevel = "low" | "medium" | "high";

/**
 * LOCKED structurally, mirroring the rushing S5E diagnostic's quartile-shaped
 * breaks (WU4F.1 §9/§10) -- never tuned against 2026 outcomes. Receiving
 * target shares occupy a narrower, less concentrated range than rushing
 * carry shares (a starting WR1 rarely exceeds ~0.30 of team targets, vs an
 * RB1 routinely exceeding ~0.65 of a rush pool), so the same 0.15/0.35
 * absolute-share breakpoints used for rushing would rarely fire for
 * receiving. Thresholds below are set from the STRUCTURE of the receiving
 * share distribution (roughly: HIGH = a full role tier of separation, e.g.
 * WR1-vs-WR3 typical share gap; MEDIUM = about half a role tier), not from
 * fitting to any outcome.
 */
export const RECEIVING_CONFLICT_LEVEL_THRESHOLDS = { medium: 0.08, high: 0.16 } as const;

export type ReceivingRolePosition = "WR" | "TE" | "RB";

const RANK_CAP = 6;
function rankBucket(rank: number | null): string {
  if (rank == null) return "NA";
  return String(Math.min(rank, RANK_CAP));
}

/** `${position}:${rank}` -- must match `walkForward.ts`'s `rankKey` construction exactly. */
export function receivingRankKey(position: ReceivingRolePosition, depthRank: number | null): string {
  return `${position}:${rankBucket(depthRank)}`;
}

export function rolePriorShareFor(
  rankPrior: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  position: ReceivingRolePosition,
  depthRank: number | null,
): number | null {
  const key = receivingRankKey(position, depthRank);
  const value = rankPrior instanceof Map ? rankPrior.get(key) : rankPrior[key];
  return value ?? null;
}

/**
 * Normalized conflict score: absolute gap between a player's own historical
 * target share and the position+depth-rank role prior. Both bounded [0,1]
 * shares of the same receiving pool -- directly comparable.
 */
export function computeReceivingConflictScore(historicalTargetShare: number | null, rolePriorShare: number | null): number | null {
  if (historicalTargetShare == null || rolePriorShare == null) return null;
  return Math.abs(historicalTargetShare - rolePriorShare);
}

export function classifyReceivingConflictLevel(conflictScore: number | null): ReceivingConflictLevel | null {
  if (conflictScore == null) return null;
  if (conflictScore >= RECEIVING_CONFLICT_LEVEL_THRESHOLDS.high) return "high";
  if (conflictScore >= RECEIVING_CONFLICT_LEVEL_THRESHOLDS.medium) return "medium";
  return "low";
}

/**
 * Ordering conflict: does the sourced depth rank disagree with the rank
 * whose role prior is closest to the player's own historical share? Kept
 * position-scoped and simple -- WR ranks are never compared against TE
 * ranks (per WU4F.2 instructions, do not mix WR and TE rank priors).
 */
export function receivingRankOrderingConflict(args: {
  historicalTargetShare: number | null;
  position: ReceivingRolePosition;
  sourcedDepthRank: number | null;
  rankPrior: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
  maxRankToConsider?: number;
}): boolean | null {
  const { historicalTargetShare, position, sourcedDepthRank, rankPrior, maxRankToConsider = 4 } = args;
  if (historicalTargetShare == null || sourcedDepthRank == null) return null;
  let closestRank: number | null = null;
  let closestDistance = Infinity;
  for (let rank = 1; rank <= maxRankToConsider; rank++) {
    const p = rolePriorShareFor(rankPrior, position, rank);
    if (p == null) continue;
    const distance = Math.abs(historicalTargetShare - p);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestRank = rank;
    }
  }
  if (closestRank == null) return null;
  return closestRank !== Math.min(sourcedDepthRank, maxRankToConsider);
}

/**
 * Combines the normalized gap with the ordering disagreement. Unlike the
 * rushing diagnostic (rank tiers widely separated: RB1 ~0.67, RB2 ~0.2), a
 * receiving pool's adjacent rank priors sit close together (WR1 ~0.23, WR2
 * ~0.16, WR3 ~0.10 in the current fit) -- a normal player's own share
 * routinely falls closer to a NEIGHBORING rank's mean purely from
 * within-rank variance, not a real role conflict. An initial pass that
 * forced HIGH on any ordering disagreement (mirroring rushing exactly)
 * flagged roughly half of ALL rows -- including obviously-correct
 * established same-team WR1s -- as "high" (WU4F.2 §5 first-pass finding).
 * An ordering disagreement therefore only escalates the level when the raw
 * gap is ALSO at least MEDIUM; a disagreement paired with a tiny gap stays
 * at its score-based level.
 */
export function classifyReceivingCombinedConflict(conflictScore: number | null, rankDisagrees: boolean | null): ReceivingConflictLevel | null {
  const base = classifyReceivingConflictLevel(conflictScore);
  if (base == null) return null;
  if (rankDisagrees === true && base !== "low") return "high";
  return base;
}

export type ReceivingRoleConflictDiagnostic = {
  playerId: string;
  playerName: string;
  team: string;
  position: ReceivingRolePosition;
  depthRank: number | null;
  roleSourced: boolean;
  historicalTargetShare: number | null;
  rolePriorShare: number | null;
  conflictScore: number | null;
  rankDisagrees: boolean | null;
  conflictLevel: ReceivingConflictLevel | null;
  teamChanged: boolean | null;
  noHistory: boolean;
  limitedHistory: boolean;
};

/** Builds the full per-player diagnostic row -- the single entry point the WU4F.2 scan script uses. */
export function buildReceivingRoleConflictDiagnostic(args: {
  playerId: string;
  playerName: string;
  team: string;
  position: ReceivingRolePosition;
  depthRank: number | null;
  roleSourced: boolean;
  historicalTargetShare: number | null;
  teamChanged: boolean | null;
  noHistory: boolean;
  limitedHistory: boolean;
  rankPrior: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
}): ReceivingRoleConflictDiagnostic {
  const rolePriorShare = rolePriorShareFor(args.rankPrior, args.position, args.depthRank);
  const conflictScore = computeReceivingConflictScore(args.historicalTargetShare, rolePriorShare);
  const rankDisagrees = receivingRankOrderingConflict({
    historicalTargetShare: args.historicalTargetShare,
    position: args.position,
    sourcedDepthRank: args.depthRank,
    rankPrior: args.rankPrior,
  });
  return {
    playerId: args.playerId,
    playerName: args.playerName,
    team: args.team,
    position: args.position,
    depthRank: args.depthRank,
    roleSourced: args.roleSourced,
    historicalTargetShare: args.historicalTargetShare,
    rolePriorShare,
    conflictScore,
    rankDisagrees,
    conflictLevel: classifyReceivingCombinedConflict(conflictScore, rankDisagrees),
    teamChanged: args.teamChanged,
    noHistory: args.noHistory,
    limitedHistory: args.limitedHistory,
  };
}

// ---------------------------------------------------------------------------
// WU4F.2A -- forward archive contract.
//
// Two-tier availability (§4): "available" describes whether the INPUTS the
// diagnostic needs exist on the row at all (a v2 allocation ran, a depth
// rank was sourced, the fitted model has a prior for that position+rank
// bucket) -- NOT whether the player happens to have no personal history.
// A `noHistory` player with a valid depth rank and a valid rank-prior
// lookup IS "available", with `conflict_score`/`conflict_level` legitimately
// null (see WU4F.2 §8) -- that is a real, expected diagnostic value, not an
// availability failure. Only a genuine structural gap (no v2 diagnostics
// block on the row at all, no depth rank to index with, or no rank-prior
// bucket for that position+rank in the fitted model) is "unavailable".
// ---------------------------------------------------------------------------

export type ReceivingRoleConflictUnavailableReason =
  | "missing_prior_share"
  | "missing_rank_prior"
  | "missing_depth_rank"
  | "unsupported_position"
  | "other";

/** JSON-safe archive shape -- matches the WU4F.2A `receiving_role_conflict` contract exactly. */
export type ReceivingRoleConflictArchiveDiagnostic = {
  historical_share: number | null;
  role_prior_share: number | null;
  conflict_score: number | null;
  conflict_level: ReceivingConflictLevel | null;
  ordering_conflict: boolean | null;
  depth_rank: number | null;
  role_sourced: boolean;
  team_changed: boolean | null;
  no_history: boolean;
  limited_history: boolean;
};

export type ReceivingRoleConflictArchiveEntry =
  | { available: true; diagnostic: ReceivingRoleConflictArchiveDiagnostic }
  | { available: false; reason: ReceivingRoleConflictUnavailableReason };

const RECEIVING_ROLE_CONFLICT_POSITIONS: ReadonlySet<string> = new Set(["WR", "TE", "RB"]);

/**
 * Builds the archive entry for one receiving row. Composes
 * `buildReceivingRoleConflictDiagnostic` (never reimplements its scoring
 * logic) and adds the explicit availability tier around it. Pure --
 * depends only on caller-supplied values, no I/O.
 */
export function buildReceivingRoleConflictArchiveEntry(args: {
  /** false when this row never went through v2 allocation at all (v1 fallback) -- no `priorOpportunityShare` field exists to read. */
  hasAllocationDiagnostics: boolean;
  position: string;
  depthRank: number | null;
  roleSourced: boolean;
  historicalTargetShare: number | null;
  teamChanged: boolean | null;
  noHistory: boolean;
  limitedHistory: boolean;
  rankPrior: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
}): ReceivingRoleConflictArchiveEntry {
  if (!args.hasAllocationDiagnostics) return { available: false, reason: "missing_prior_share" };
  if (!RECEIVING_ROLE_CONFLICT_POSITIONS.has(args.position)) return { available: false, reason: "unsupported_position" };
  const position = args.position as ReceivingRolePosition;
  if (args.depthRank == null) return { available: false, reason: "missing_depth_rank" };
  const rolePriorShare = rolePriorShareFor(args.rankPrior, position, args.depthRank);
  if (rolePriorShare == null) return { available: false, reason: "missing_rank_prior" };

  const diag = buildReceivingRoleConflictDiagnostic({
    playerId: "", playerName: "", team: "",
    position, depthRank: args.depthRank, roleSourced: args.roleSourced,
    historicalTargetShare: args.historicalTargetShare, teamChanged: args.teamChanged,
    noHistory: args.noHistory, limitedHistory: args.limitedHistory, rankPrior: args.rankPrior,
  });
  return {
    available: true,
    diagnostic: {
      historical_share: diag.historicalTargetShare,
      role_prior_share: diag.rolePriorShare,
      conflict_score: diag.conflictScore,
      conflict_level: diag.conflictLevel,
      ordering_conflict: diag.rankDisagrees,
      depth_rank: diag.depthRank,
      role_sourced: diag.roleSourced,
      team_changed: diag.teamChanged,
      no_history: diag.noHistory,
      limited_history: diag.limitedHistory,
    },
  };
}
