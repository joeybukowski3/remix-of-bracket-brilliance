// CFB Model V2 — production residual-pool reconstruction (WU3 §2/§12).
// Zero runtime dependency on src/lib/cfb/research/**.
//
// RESIDUAL-ORDERING DECISION (§2, resolved here — see
// historicalCutoffReconstruction.test.ts's residual-membership-parity tests
// for the evidence this rests on):
//
// research/phase5/phase5WalkForwardCore.ts draws bootstrap samples from
// `trainingPool.map(...)` — i.e. its OWN internal `calibrated` array, whose
// order is purely "games processed in chronological (season, week) order,
// and within a (season, week) in whatever order Phase 4's own upstream
// game-list iteration produced them" — an implementation detail of
// iteration order over an in-memory game list, not a documented model
// input. Phase 5 draws `pairs[Math.floor(random() * pairs.length)]` — a
// uniform index draw over the pool; nothing in the empirical-bootstrap
// family (research/phase5/distributionModels.ts's empiricalBootstrapFamily)
// treats array POSITION as meaningful beyond "one of the equally-likely
// members of the multiset" — resampling with replacement from a fixed
// multiset is a function of set MEMBERSHIP, not of storage order: for any
// fixed uniform-random index sequence, permuting the underlying array
// changes WHICH pair index i lands on, but the marginal distribution of
// resampled pairs (and therefore every aggregate statistic — win
// probability, any empirical interval) is invariant to that permutation
// stastically (though not for one fixed seed's literal per-index draw
// sequence, which does change).
//
// WU3A's calibration-residual-seed artifact stores rows sorted by
// (season, week, gameId) — a canonical, versioned, deterministic ordering
// (see scoringSupportTypes.ts) — which differs from Phase 5's own
// insertion order. Production therefore CANNOT reproduce Phase 9's
// bit-for-bit historical draw sequence from this artifact alone (no
// insertion-order field was captured in the frozen artifact). This is an
// EXPLICIT, VERSIONED PRODUCTION CHOICE (residualOrderPolicy =
// "GAME_ID_SORTED_v1", not "unresolved"): production uses the artifact's
// own canonical order, seeded per-game (see probability.ts), and proves
// STATISTICAL equivalence rather than bit-identical replay —
// phase9CoefficientParity.test.ts's sibling probability-parity test
// quantifies this via win-probability/interval comparison across many
// historical cutoffs rather than claiming exact draw-sequence parity.

import { isEligibleBeforeCutoff, type CfbV2CalibrationResidualSeedArtifact } from "./scoringSupportTypes";

export const CFB_V2_RESIDUAL_ORDER_POLICY = "GAME_ID_SORTED_v1" as const;

/** WU3 §12/§23 — matches phase5WalkForwardCore.ts's own `if (trainingPool.length < 10) continue` probability-availability gate. */
export const CFB_V2_MIN_RESIDUAL_POOL_SIZE = 10;

export type CfbV2ResidualPair = { readonly home: number; readonly away: number };

/**
 * Eligible residual pool at a cutoff: every calibration-seed row strictly
 * before (season, week), in the artifact's own canonical (season, week,
 * gameId) order (§2 above). A future 2026 weekly run can append eligible
 * CURRENT-season residual pairs (from newly completed 2026 games) via
 * `additionalEligiblePairs` without requiring research runtime data (§11).
 */
export function buildCfbV2ResidualPool(
  artifact: CfbV2CalibrationResidualSeedArtifact,
  season: number,
  week: number,
  additionalEligiblePairs: readonly CfbV2ResidualPair[] = [],
): readonly CfbV2ResidualPair[] {
  const historical = artifact.records
    .filter((row) => isEligibleBeforeCutoff(row, season, week))
    .map((row): CfbV2ResidualPair => ({ home: row.homeResidual, away: row.awayResidual }));
  return [...historical, ...additionalEligiblePairs];
}
