// CFB Model V2 — successive-refresh shadow diff (WU6 §5). Pure comparison
// between two already-loaded valid snapshots. Flags large movements for
// human REVIEW only — never treats a large delta as an automatic failure
// (that judgment belongs to a person looking at the ranked list, not this
// module). No numeric alert thresholds are invented here; see
// shadowAudit's caller / the WU6 report for why (§16 — insufficient
// historical replay data in production input formats to derive validated
// percentile thresholds; ranked "largest movers" reporting is used
// instead of an unjustified cutoff).

import type { CfbV2GameProjection, CfbV2PriorTier, CfbV2TeamRating } from "./types";

export type CfbV2RatingMovement = {
  teamId: string;
  overallRatingBefore: number;
  overallRatingAfter: number;
  absoluteDelta: number;
  priorTierBefore: CfbV2PriorTier;
  priorTierAfter: CfbV2PriorTier;
  componentSizeBefore: number;
  componentSizeAfter: number;
};

export type CfbV2ProjectionMovement = {
  gameId: string;
  projectedMarginBefore: number | null;
  projectedMarginAfter: number | null;
  marginDelta: number | null;
  projectedTotalBefore: number | null;
  projectedTotalAfter: number | null;
  totalDelta: number | null;
  homeWinProbabilityBefore: number | null;
  homeWinProbabilityAfter: number | null;
  homeWinProbabilityDelta: number | null;
  projectionStatusBefore: CfbV2GameProjection["projectionStatus"];
  projectionStatusAfter: CfbV2GameProjection["projectionStatus"];
  availabilityChanged: boolean;
};

export type CfbV2ShadowDiffResult = {
  ratings: {
    comparedTeamCount: number;
    onlyInBefore: readonly string[];
    onlyInAfter: readonly string[];
    medianAbsoluteMovement: number;
    largestMovers: readonly CfbV2RatingMovement[];
    priorTierTransitions: readonly { teamId: string; from: CfbV2PriorTier; to: CfbV2PriorTier }[];
    componentSizeChanges: readonly { teamId: string; from: number; to: number }[];
  };
  projections: {
    comparedGameCount: number;
    onlyInBefore: readonly string[];
    onlyInAfter: readonly string[];
    largestMarginMovers: readonly CfbV2ProjectionMovement[];
    availabilityTransitions: readonly { gameId: string; from: CfbV2GameProjection["projectionStatus"]; to: CfbV2GameProjection["projectionStatus"] }[];
  };
};

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const TOP_MOVERS_COUNT = 10;

export function diffCfbV2ShadowRatings(before: readonly CfbV2TeamRating[], after: readonly CfbV2TeamRating[]): CfbV2ShadowDiffResult["ratings"] {
  const beforeById = new Map(before.map((r) => [r.teamId, r]));
  const afterById = new Map(after.map((r) => [r.teamId, r]));
  const commonIds = [...beforeById.keys()].filter((id) => afterById.has(id));

  const movements: CfbV2RatingMovement[] = commonIds.map((teamId) => {
    const b = beforeById.get(teamId)!;
    const a = afterById.get(teamId)!;
    return {
      teamId,
      overallRatingBefore: b.overallRating,
      overallRatingAfter: a.overallRating,
      absoluteDelta: Math.abs(a.overallRating - b.overallRating),
      priorTierBefore: b.priorTier,
      priorTierAfter: a.priorTier,
      componentSizeBefore: b.connectivity.componentSize,
      componentSizeAfter: a.connectivity.componentSize,
    };
  });

  const largestMovers = [...movements].sort((x, y) => y.absoluteDelta - x.absoluteDelta).slice(0, TOP_MOVERS_COUNT);
  const priorTierTransitions = movements.filter((m) => m.priorTierBefore !== m.priorTierAfter).map((m) => ({ teamId: m.teamId, from: m.priorTierBefore, to: m.priorTierAfter }));
  const componentSizeChanges = movements.filter((m) => m.componentSizeBefore !== m.componentSizeAfter).map((m) => ({ teamId: m.teamId, from: m.componentSizeBefore, to: m.componentSizeAfter }));

  return {
    comparedTeamCount: commonIds.length,
    onlyInBefore: [...beforeById.keys()].filter((id) => !afterById.has(id)),
    onlyInAfter: [...afterById.keys()].filter((id) => !beforeById.has(id)),
    medianAbsoluteMovement: median(movements.map((m) => m.absoluteDelta)),
    largestMovers,
    priorTierTransitions,
    componentSizeChanges,
  };
}

export function diffCfbV2ShadowProjections(before: readonly CfbV2GameProjection[], after: readonly CfbV2GameProjection[]): CfbV2ShadowDiffResult["projections"] {
  const beforeById = new Map(before.map((p) => [p.gameId, p]));
  const afterById = new Map(after.map((p) => [p.gameId, p]));
  const commonIds = [...beforeById.keys()].filter((id) => afterById.has(id));

  const movements: CfbV2ProjectionMovement[] = commonIds.map((gameId) => {
    const b = beforeById.get(gameId)!;
    const a = afterById.get(gameId)!;
    const marginDelta = b.projectedMargin !== null && a.projectedMargin !== null ? a.projectedMargin - b.projectedMargin : null;
    const totalDelta = b.projectedTotal !== null && a.projectedTotal !== null ? a.projectedTotal - b.projectedTotal : null;
    const homeWinProbabilityDelta = b.homeWinProbability !== null && a.homeWinProbability !== null ? a.homeWinProbability - b.homeWinProbability : null;
    return {
      gameId,
      projectedMarginBefore: b.projectedMargin,
      projectedMarginAfter: a.projectedMargin,
      marginDelta,
      projectedTotalBefore: b.projectedTotal,
      projectedTotalAfter: a.projectedTotal,
      totalDelta,
      homeWinProbabilityBefore: b.homeWinProbability,
      homeWinProbabilityAfter: a.homeWinProbability,
      homeWinProbabilityDelta,
      projectionStatusBefore: b.projectionStatus,
      projectionStatusAfter: a.projectionStatus,
      availabilityChanged: b.projectionStatus !== a.projectionStatus,
    };
  });

  const largestMarginMovers = [...movements]
    .filter((m) => m.marginDelta !== null)
    .sort((x, y) => Math.abs(y.marginDelta as number) - Math.abs(x.marginDelta as number))
    .slice(0, TOP_MOVERS_COUNT);
  const availabilityTransitions = movements.filter((m) => m.availabilityChanged).map((m) => ({ gameId: m.gameId, from: m.projectionStatusBefore, to: m.projectionStatusAfter }));

  return {
    comparedGameCount: commonIds.length,
    onlyInBefore: [...beforeById.keys()].filter((id) => !afterById.has(id)),
    onlyInAfter: [...afterById.keys()].filter((id) => !beforeById.has(id)),
    largestMarginMovers,
    availabilityTransitions,
  };
}

export function diffCfbV2Shadow(
  before: { ratings: readonly CfbV2TeamRating[]; projections: readonly CfbV2GameProjection[] },
  after: { ratings: readonly CfbV2TeamRating[]; projections: readonly CfbV2GameProjection[] },
): CfbV2ShadowDiffResult {
  return {
    ratings: diffCfbV2ShadowRatings(before.ratings, after.ratings),
    projections: diffCfbV2ShadowProjections(before.projections, after.projections),
  };
}
