// CFB Model V2 — legacy contract compatibility helpers (Phase 10 §11/§17/§22, WU1).
//
// Pure conversion only. Nothing here is wired into a current production
// consumer in this work unit — `CfbGameModelProjections` behavior must not
// change (WU1 §17/§23).

import type { CfbGameModelProjections } from "@/data/cfb/types";
import type { CfbV2GameProjection } from "./types";

/**
 * `CfbV2GameProjection.projectedMargin` is `home - away` (§11). The
 * existing UI/legacy `CfbGameOdds`/`jkbProjectedSpread` convention stores
 * spread "from the home team's perspective" (src/data/cfb/types.ts comment
 * on `CfbGameOdds`), i.e. negative means the home team is favored (matches
 * standard sportsbook spread notation). A positive home-margin (home
 * favored) must therefore become a NEGATIVE spread value — this function
 * makes that sign flip explicit rather than assigning `projectedMargin`
 * straight into a spread field.
 */
export function projectedMarginToUiSpread(projectedMargin: number | null): number | null {
  if (projectedMargin === null) return null;
  return projectedMargin === 0 ? 0 : -projectedMargin;
}

/**
 * Maps a V2 game projection onto the existing (legacy) `CfbGameModelProjections`
 * shape, for a future adapter work unit. Not called by any current
 * production consumer (WU1 §17).
 */
export function toLegacyGameModelProjections(projection: CfbV2GameProjection): CfbGameModelProjections {
  return {
    jkbProjectedSpread: projectedMarginToUiSpread(projection.projectedMargin),
    jkbProjectedTotal: projection.projectedTotal,
    homeWinProbability: projection.homeWinProbability,
    awayWinProbability: projection.awayWinProbability,
    neutralPowerDifference: null,
    homeFieldAdjustment: null,
    jkbPowerLine: null,
  };
}
