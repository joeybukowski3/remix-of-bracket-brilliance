/**
 * WU4F.1 §13: defines (but does not wire into any pipeline) the downstream
 * evaluation contract for comparing archived shadow rushing predictions
 * against archived production predictions once games resolve.
 *
 * Critical invariant: both `productionCarries` and `shadowCarries` must
 * come from the IMMUTABLE archived pregame prediction row (WU1) --
 * `feature_snapshot.values.production_feature_snapshot`/`projection` for
 * production, `feature_snapshot.values.allocation_diagnostics.projectedCarries`
 * for shadow. Never recompute a historical shadow prediction after the
 * game using outcome data; that would be leakage into an evaluation meant
 * to prove the shadow model is real pregame skill.
 */

export interface ShadowVsProductionRow {
  playerId: string;
  gameId: string;
  season: number;
  week: number;
  /** From the archived row's own production projection -- never recomputed. */
  productionCarries: number;
  /** From the archived row's `allocation_diagnostics.projectedCarries` -- null if shadow was unavailable that week (see shadowAvailability.ts). */
  shadowCarries: number | null;
  /** Realised outcome, joined in AFTER the game from the immutable outcome archive -- never used to build either prediction above. */
  actualCarries: number;
}

export interface ShadowVsProductionErrors {
  playerId: string;
  gameId: string;
  productionCarriesError: number;
  shadowCarriesError: number | null;
  productionShareError: number | null;
  shadowShareError: number | null;
}

/**
 * Pure, deterministic error calculation from already-archived pregame
 * predictions and an already-resolved outcome. Does not read or write any
 * file; callers own sourcing `rows` from the immutable archive and outcome
 * resolver.
 */
export function computeShadowVsProductionErrors(
  rows: readonly ShadowVsProductionRow[],
  actualShareOf: (row: ShadowVsProductionRow) => number | null,
  productionShareOf: (row: ShadowVsProductionRow) => number | null,
  shadowShareOf: (row: ShadowVsProductionRow) => number | null,
): ShadowVsProductionErrors[] {
  return rows.map((row) => {
    const actualShare = actualShareOf(row);
    const prodShare = productionShareOf(row);
    const shadShare = shadowShareOf(row);
    return {
      playerId: row.playerId,
      gameId: row.gameId,
      productionCarriesError: Math.abs(row.productionCarries - row.actualCarries),
      shadowCarriesError: row.shadowCarries == null ? null : Math.abs(row.shadowCarries - row.actualCarries),
      productionShareError: actualShare == null || prodShare == null ? null : Math.abs(prodShare - actualShare),
      shadowShareError: actualShare == null || shadShare == null ? null : Math.abs(shadShare - actualShare),
    };
  });
}

/** WU4F.1 §14: cohort keys the future evaluation must be able to slice by. */
export type NflRushingEvaluationCohort =
  | "overall"
  | "week1"
  | "weeks1to4"
  | "teamChanged"
  | "sameTeam"
  | "sourcedStarter"
  | "sourcedBackup"
  | "noHistory"
  | "roleConflictLow"
  | "roleConflictMedium"
  | "roleConflictHigh"
  | "productionShadowOrderingDisagreement";
