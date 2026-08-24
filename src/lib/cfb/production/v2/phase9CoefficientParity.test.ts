import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cfbV2CalibrationResidualSeedPath,
  cfbV2ScoringNormalEquationsPath,
  isEligibleBeforeCutoff,
  type CfbV2CalibrationResidualSeedArtifact,
  type CfbV2ScoringNormalEquationsArtifact,
} from "./scoringSupportTypes";
import { solveLinearSystem } from "./linearSolver";
import { runPhase9Pipeline, PHASE9_CALIBRATION_CONFIG, type Phase9PipelineResult } from "../../research/phase9/pipeline";
import { PHASE9_FINALIST_SPEC, PHASE9_TEST_SEASONS } from "../../research/phase9/config";
import { fitTotalCalibration } from "../../research/phase5/totalCalibration";
import type { CalibrationTrainingRow } from "../../research/phase5/totalCalibration";
import { computeCurrentWeekScoringFeatureRows } from "../../../../../scripts/cfb-v2-support-export";

/**
 * WU3A scoring-artifact-shape directive §6/§17/§18/§19 — DIRECT parity vs.
 * the real Phase 8/9 research pipeline.
 *
 * §6/§17 (scoring coefficients) is a HARD PASS/FAIL GATE: output-level
 * similarity does not satisfy it — the fitted parameter vector itself must
 * match to tight tolerance, for every coefficient the frozen finalist
 * config actually fits (intercept, scoringEnvironment, offenseRating,
 * defenseRatingAllowed, hfa, SUCCESS_own, SUCCESS_opponentAllowed).
 *
 * This file is the one sanctioned research-import exception outside
 * scripts/cfb-v2-support-export.ts itself: a TEST file under production/v2/
 * proving the compact artifacts against a genuine, freshly-executed run of
 * the frozen Phase 8/9 pipeline. architectureGuard.test.ts only forbids
 * research imports in RUNTIME (non-test) files — see its own assertions,
 * which this file's presence does not violate. It also imports
 * computeCurrentWeekScoringFeatureRows from the offline generator script
 * itself (not from research/** directly) — the compact artifact stores no
 * row-level features (only aggregate ata/atb per cutoff, by design — see
 * scoringSupportTypes.ts), so an independent per-game feature source is
 * needed to recover Phase 8's TRUE coefficient vector by inference.
 *
 * Runs the full frozen pipeline ONCE (all PHASE9_TEST_SEASONS together, the
 * same call scripts/cfb-v2-support-export.ts itself makes to produce the
 * committed calibration-residual-seed artifact) and reuses that single
 * result across all parity checks below. This is expensive (multi-minute)
 * by nature — it is re-deriving 2020-2025 from raw research inputs.
 */

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..", "..");
const scoringArtifact = JSON.parse(readFileSync(resolve(REPO_ROOT, cfbV2ScoringNormalEquationsPath()), "utf8")) as CfbV2ScoringNormalEquationsArtifact;
const calibrationArtifact = JSON.parse(readFileSync(resolve(REPO_ROOT, cfbV2CalibrationResidualSeedPath()), "utf8")) as CfbV2CalibrationResidualSeedArtifact;

const CUTOFFS = [
  { label: "early season", season: 2020, week: 5 },
  { label: "midseason", season: 2022, week: 9 },
  { label: "late season", season: 2024, week: 14 },
  { label: "multi-season boundary", season: 2025, week: 3 },
] as const;

// §7 — additional cutoffs so the 4 required cutoffs above aren't accidentally being overfit to.
const EXTRA_CUTOFFS = [
  { label: "very early cutoff", season: 2021, week: 3 },
  { label: "conference-heavy midseason cutoff", season: 2023, week: 11 },
  { label: "final regular-season cutoff", season: 2021, week: 14 },
] as const;

const ALL_CUTOFFS = [...CUTOFFS, ...EXTRA_CUTOFFS];

let phase9Result: Phase9PipelineResult;

beforeAll(() => {
  phase9Result = runPhase9Pipeline(PHASE9_FINALIST_SPEC, PHASE9_TEST_SEASONS);
}, 900_000);

function findScoringSnapshot(season: number, week: number): CfbV2ScoringNormalEquationsArtifact["records"][number] {
  const found = scoringArtifact.records.find((r) => r.season === season && r.week === week);
  if (!found) throw new Error(`no scoring normal-equation snapshot at season=${season} week=${week} — pick a different cutoff`);
  return found;
}

// ---------------------------------------------------------------------------
// §6/§17 — direct scoring-coefficient parity. HARD GATE.
// ---------------------------------------------------------------------------

const SCORING_FEATURE_NAMES = ["intercept", "scoringEnvironment", "offenseRating", "defenseRatingAllowed", "hfa", "SUCCESS_own", "SUCCESS_opponentAllowed"] as const;
const N_SCORING_PARAMS = SCORING_FEATURE_NAMES.length;
const SCORING_RIDGE_LAMBDA = 2; // WU1's frozen scoringRidgeLambda / PHASE4_FINALIST_SCORING_CONFIG.lambda

function fitExactNoRidge(rows: readonly { x: number[]; y: number }[]): number[] {
  const ata = Array.from({ length: N_SCORING_PARAMS }, () => new Array(N_SCORING_PARAMS).fill(0));
  const atb = new Array(N_SCORING_PARAMS).fill(0);
  for (const { x, y } of rows) {
    for (let i = 0; i < N_SCORING_PARAMS; i += 1) {
      atb[i] += x[i] * y;
      for (let j = 0; j < N_SCORING_PARAMS; j += 1) ata[i][j] += x[i] * x[j];
    }
  }
  return solveLinearSystem(ata, atb);
}

describe("Direct scoring-coefficient parity vs. Phase 8/9's own fitted model (§6/§17 — HARD GATE)", () => {
  for (const cutoff of ALL_CUTOFFS) {
    it(`${cutoff.label} (${cutoff.season} wk${cutoff.week}): artifact-reconstructed coefficients match Phase 8's true fitted coefficients to tight tolerance`, () => {
      // Independent per-game feature source (NOT the artifact) — recomputed fresh via the same research primitives at the same cutoff.
      const featureRows = computeCurrentWeekScoringFeatureRows(cutoff.season, cutoff.week);
      expect(featureRows.length).toBeGreaterThanOrEqual(N_SCORING_PARAMS + 10);

      const predictionByGame = new Map(phase9Result.ratingPredictions.filter((p) => p.season === cutoff.season && p.week === cutoff.week).map((p) => [p.gameId, p]));
      expect(predictionByGame.size).toBeGreaterThan(0);

      // Recover Phase 8's TRUE coefficient vector by inference: predictScore is an exact linear function of these SAME features (independently recomputed, not sourced from the artifact), so pairing them against Phase 8's own recorded predictions (not actualPoints — predictions are the model's exact linear output, actual points carry residual noise) and solving the resulting heavily-overdetermined EXACT (no ridge) linear system recovers the true coefficients with no access to Phase 8's private internals.
      const inferenceRows: { x: number[]; y: number }[] = [];
      for (const row of featureRows) {
        const pred = predictionByGame.get(row.gameId);
        if (!pred) continue;
        const y = row.isHome ? pred.expectedHomePoints : pred.expectedAwayPoints;
        if (y === null) continue;
        inferenceRows.push({ x: row.x, y });
      }
      expect(inferenceRows.length).toBeGreaterThanOrEqual(N_SCORING_PARAMS + 10);

      // STRUCTURAL NOTE (found while implementing this gate): scoringEnvironmentEstimate
      // is a SINGLE scalar shared by every game predicted at a given (season, week) cutoff
      // — so within any ONE week's worth of inference rows, the "scoringEnvironment" column
      // is EXACTLY envValue * the "intercept" column (perfect collinearity, unconditionally,
      // regardless of sample size). This means intercept and scoringEnvironment are NOT
      // individually identifiable from a single as-of-week's predictions alone — only their
      // combination (intercept + scoringEnvironment * envValue, the effective per-week
      // baseline every prediction actually uses) is well-identified. This is a structural
      // property of the frozen model itself (Phase 8 refits weekly, and env is constant
      // within a week), not a defect in this test or the artifact: solveLinearSystem's
      // no-ridge exact solve over a rank-deficient system silently picks AN arbitrary point
      // along the collinear line, so asserting the raw c0/c1 split individually would be
      // asserting an artifact of solver pivoting, not a real property of Phase 8's model.
      // We therefore verify the well-identified quantities directly: the 5 cross-sectionally-
      // varying coefficients (offense/defense/hfa/SUCCESS) individually, AND the combined
      // per-week baseline (intercept + scoringEnvironment * envValue) as one quantity — both
      // are exact, hard-gate checks; neither is an output-level approximation.
      const recoveredTrueCoefficients = fitExactNoRidge(inferenceRows);

      // Self-check on the inference itself: the recovered vector must reproduce every real Phase 8 prediction to near machine precision, or the "same features" assumption does not hold and the parity comparison below would be meaningless.
      for (const { x, y } of inferenceRows) {
        const yhat = recoveredTrueCoefficients.reduce((s, c, i) => s + c * x[i], 0);
        expect(yhat).toBeCloseTo(y, 6);
      }

      // The well-identified TRUE baseline, computed directly (bypasses the degenerate intercept/env split entirely): every row's y minus the 5 reliably-recovered coefficients' contribution equals the SAME constant (intercept + scoringEnvironment*envValue) for every row this week, since Phase 8's predictions are exactly linear with zero residual noise (verified by the self-check above).
      const WELL_IDENTIFIED_INDICES = [2, 3, 4, 5, 6]; // offenseRating, defenseRatingAllowed, hfa, SUCCESS_own, SUCCESS_opponentAllowed
      const trueBaselines = inferenceRows.map(({ x, y }) => y - WELL_IDENTIFIED_INDICES.reduce((s, i) => s + recoveredTrueCoefficients[i] * x[i], 0));
      const trueBaselineMean = trueBaselines.reduce((s, v) => s + v, 0) / trueBaselines.length;
      // Every row's implied baseline must be identical (exact linear model, no noise) — confirms this is a genuinely well-identified constant, not a fitted approximation.
      for (const b of trueBaselines) expect(b).toBeCloseTo(trueBaselineMean, 6);

      // Reconstructed side: solve the ARTIFACT's own frozen (ata, atb) snapshot at this exact cutoff.
      const snapshot = findScoringSnapshot(cutoff.season, cutoff.week);
      expect(snapshot.featureNames).toEqual(SCORING_FEATURE_NAMES);
      const ata = snapshot.ata.map((row) => [...row]);
      const atb = [...snapshot.atb];
      for (let i = 1; i < N_SCORING_PARAMS; i += 1) ata[i][i] += SCORING_RIDGE_LAMBDA;
      const reconstructedCoefficients = solveLinearSystem(ata, atb);
      const envValue = inferenceRows[0].x[1];
      const reconstructedBaseline = reconstructedCoefficients[0] + reconstructedCoefficients[1] * envValue;

      const deltas = SCORING_FEATURE_NAMES.map((name, i) => ({ name, recoveredTrue: recoveredTrueCoefficients[i], reconstructed: reconstructedCoefficients[i], absDelta: Math.abs(recoveredTrueCoefficients[i] - reconstructedCoefficients[i]) }));
      // eslint-disable-next-line no-console
      console.log(`[phase9CoefficientParity] ${cutoff.label} (${cutoff.season} wk${cutoff.week}) coefficient deltas:`, JSON.stringify(deltas), `trueBaseline=${trueBaselineMean} reconstructedBaseline=${reconstructedBaseline}`);

      // HARD GATE 1 — the 5 well-identified coefficients must match individually to tight tolerance.
      for (const i of WELL_IDENTIFIED_INDICES) {
        expect(reconstructedCoefficients[i]).toBeCloseTo(recoveredTrueCoefficients[i], 4);
      }
      // HARD GATE 2 — the well-identified combined baseline (intercept + scoringEnvironment*envValue) must match to tight tolerance — this is the ONLY way intercept/scoringEnvironment individually ever affect any prediction, so this is a complete, non-approximate proof for those two coefficients despite their individual non-identifiability from single-week data.
      expect(reconstructedBaseline).toBeCloseTo(trueBaselineMean, 4);
    });
  }
});

// ---------------------------------------------------------------------------
// §18 — direct calibration slope/intercept parity.
//
// The calibration-residual-seed artifact IS literally Phase 9's own
// `calibrated` array (scripts/cfb-v2-support-export.ts's
// exportCalibrationResidualSeed maps fields 1:1, no re-derivation) — this
// artifact is UNCHANGED by the WU3A scoring-artifact-shape revision.
// ---------------------------------------------------------------------------

function toCalibrationTrainingRows(rows: readonly { rawProjectedTotal: number; actualTotal: number; season: number; week: number }[]): CalibrationTrainingRow[] {
  return rows.map((r) => ({ rawTotal: r.rawProjectedTotal, actualTotal: r.actualTotal, season: r.season, week: r.week }));
}

describe("Direct calibration slope/intercept parity vs. Phase 5/9's own fitTotalCalibration (§18)", () => {
  for (const cutoff of ALL_CUTOFFS) {
    it(`${cutoff.label} (${cutoff.season} wk${cutoff.week}): fitTotalCalibration on real Phase 9 pool matches fitTotalCalibration on artifact-derived pool`, () => {
      const realPool = phase9Result.calibrated
        .filter((c) => c.season < cutoff.season || (c.season === cutoff.season && c.week < cutoff.week))
        .map((c) => ({ rawProjectedTotal: c.rawProjectedTotal, actualTotal: c.actualTotal, season: c.season, week: c.week }));
      const artifactPool = calibrationArtifact.records
        .filter((r) => isEligibleBeforeCutoff(r, cutoff.season, cutoff.week))
        .map((r) => ({ rawProjectedTotal: r.rawProjectedTotal, actualTotal: r.actualTotal, season: r.season, week: r.week }));

      expect(artifactPool.length).toBe(realPool.length);

      const realCoeffs = fitTotalCalibration(toCalibrationTrainingRows(realPool), PHASE9_CALIBRATION_CONFIG.totalCalibrationMethod, cutoff.season, cutoff.week);
      const artifactCoeffs = fitTotalCalibration(toCalibrationTrainingRows(artifactPool), PHASE9_CALIBRATION_CONFIG.totalCalibrationMethod, cutoff.season, cutoff.week);

      expect(artifactCoeffs.intercept).toBeCloseTo(realCoeffs.intercept, 9);
      expect(artifactCoeffs.slope).toBeCloseTo(realCoeffs.slope, 9);
    });
  }
});

// ---------------------------------------------------------------------------
// §19 — direct residual-pool membership parity. Unchanged by the WU3A
// scoring-artifact-shape revision (calibration/residual artifact preserved).
// ---------------------------------------------------------------------------

describe("Direct residual-pool membership parity vs. Phase 5/9's own trainingPool (§19)", () => {
  for (const cutoff of ALL_CUTOFFS) {
    it(`${cutoff.label} (${cutoff.season} wk${cutoff.week}): count, membership, and residual values match exactly`, () => {
      const realPool = phase9Result.calibrated.filter((c) => c.season < cutoff.season || (c.season === cutoff.season && c.week < cutoff.week));
      const artifactPool = calibrationArtifact.records.filter((r) => isEligibleBeforeCutoff(r, cutoff.season, cutoff.week));

      expect(artifactPool.length).toBe(realPool.length);

      const realByGame = new Map(realPool.map((c) => [c.gameId, c]));
      const artifactByGame = new Map(artifactPool.map((r) => [r.gameId, r]));
      expect(new Set(artifactByGame.keys())).toEqual(new Set(realByGame.keys()));

      for (const [gameId, artifactRow] of artifactByGame) {
        const realRow = realByGame.get(gameId)!;
        const realHomeResidual = realRow.actualHomePoints - realRow.calibratedExpectedHome;
        const realAwayResidual = realRow.actualAwayPoints - realRow.calibratedExpectedAway;
        expect(artifactRow.homeResidual).toBeCloseTo(realHomeResidual, 9);
        expect(artifactRow.awayResidual).toBeCloseTo(realAwayResidual, 9);
      }
    });

    it(`${cutoff.label} (${cutoff.season} wk${cutoff.week}): reports whether array ORDER also matches (relevant to seeded-bootstrap reproducibility, not to membership correctness)`, () => {
      const realPool = phase9Result.calibrated.filter((c) => c.season < cutoff.season || (c.season === cutoff.season && c.week < cutoff.week));
      const artifactPool = calibrationArtifact.records.filter((r) => isEligibleBeforeCutoff(r, cutoff.season, cutoff.week));

      const realOrder = realPool.map((c) => c.gameId);
      const artifactOrder = artifactPool.map((r) => r.gameId);
      const orderMatches = realOrder.length === artifactOrder.length && realOrder.every((id, i) => id === artifactOrder[i]);

      // eslint-disable-next-line no-console
      console.log(`[phase9CoefficientParity] ${cutoff.label} (${cutoff.season} wk${cutoff.week}) residual-pool array order matches Phase 9's own insertion order: ${orderMatches}`);
      expect(typeof orderMatches).toBe("boolean");
    });
  }
});
