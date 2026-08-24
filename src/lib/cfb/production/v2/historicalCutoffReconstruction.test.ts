import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cfbV2CalibrationResidualSeedPath, cfbV2ScoringNormalEquationsPath, isEligibleBeforeCutoff, type CfbV2CalibrationResidualSeedArtifact, type CfbV2ScoringNormalEquationsArtifact } from "./scoringSupportTypes";
import { solveLinearSystem } from "./linearSolver";

/**
 * WU3A §22 — historical-cutoff reconstruction parity.
 *
 * Proves the two compact support artifacts are SUFFICIENT to reproduce
 * Phase 9's downstream semantics using only production-safe pure math
 * (production/v2/linearSolver.ts) and the frozen artifacts themselves — no
 * research import here.
 *
 * Total calibration is reconstructed EXACTLY (tight tolerance): the
 * calibration-residual-seed's own `calibrated` rows are genuinely one row
 * per game, appended once per game in season/week order inside Phase 5's
 * walk-forward (research/phase5/phase5WalkForwardCore.ts) — no
 * accumulation quirk — so refitting the same pooled-linear method locally
 * on the strictly-prior rows must reproduce the seed's own
 * `calibratedTotal` for the next game exactly.
 *
 * The scoring artifact is now (WU3A scoring-artifact-shape revision) a
 * per-(season, week) normal-equation SNAPSHOT — solveLinearSystem(ata +
 * lambda*I, atb) using ONLY the frozen snapshot's own ata/atb reproduces
 * research/phase4/scoringRegression.ts's fitScoringModel coefficient vector
 * EXACTLY at that cutoff (see scripts/cfb-v2-support-export.ts's file
 * header for why this is mathematically exact, not approximate — ridge
 * regression's normal equations are additive over rows, and the frozen
 * finalist config's fixed 7-column feature set means no accumulation
 * shortcuts are needed). This file proves that reconstruction is
 * self-consistent and production-safe using NO research import at all; the
 * companion phase9CoefficientParity.test.ts proves it is also bit-close to
 * a genuinely fresh Phase 8/9 run (the one sanctioned research-import
 * exception outside the offline generator itself).
 */

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..", "..");
const scoringArtifact = JSON.parse(readFileSync(resolve(REPO_ROOT, cfbV2ScoringNormalEquationsPath()), "utf8")) as CfbV2ScoringNormalEquationsArtifact;
const calibrationArtifact = JSON.parse(readFileSync(resolve(REPO_ROOT, cfbV2CalibrationResidualSeedPath()), "utf8")) as CfbV2CalibrationResidualSeedArtifact;
const SCORING_RIDGE_LAMBDA = 2; // WU1's frozen scoringRidgeLambda / PHASE4_FINALIST_SCORING_CONFIG.lambda — applied at reconstruction time, not baked into the frozen snapshot (see scoringSupportTypes.ts doc).

function findScoringSnapshot(season: number, week: number): CfbV2ScoringNormalEquationsArtifact["records"][number] {
  const found = scoringArtifact.records.find((r) => r.season === season && r.week === week);
  if (!found) throw new Error(`no scoring normal-equation snapshot at season=${season} week=${week} — pick a different cutoff`);
  return found;
}

function fitLinear(rows: readonly { x: number; y: number }[]): { intercept: number; slope: number } {
  const n = rows.length;
  if (n === 0) return { intercept: 0, slope: 1 };
  const meanX = rows.reduce((s, r) => s + r.x, 0) / n;
  const meanY = rows.reduce((s, r) => s + r.y, 0) / n;
  let cov = 0;
  let varX = 0;
  for (const r of rows) {
    cov += (r.x - meanX) * (r.y - meanY);
    varX += (r.x - meanX) ** 2;
  }
  if (varX < 1e-9) return { intercept: meanY, slope: 0 };
  const slope = cov / varX;
  return { intercept: meanY - slope * meanX, slope };
}

function applyCalibration(rawValue: number, coeffs: { intercept: number; slope: number }): number {
  return coeffs.intercept + coeffs.slope * rawValue;
}

/** Picks the first record at exactly (season, week) — records are chronologically sorted by the offline generator. */
function findGameAt(season: number, week: number): CfbV2CalibrationResidualSeedArtifact["records"][number] {
  const found = calibrationArtifact.records.find((r) => r.season === season && r.week === week);
  if (!found) throw new Error(`no calibration-residual-seed row at season=${season} week=${week} — pick a different cutoff`);
  return found;
}

const CUTOFFS = [
  { label: "early season", season: 2020, week: 5 },
  { label: "midseason", season: 2022, week: 9 },
  { label: "late season", season: 2024, week: 14 },
  { label: "multi-season boundary", season: 2025, week: 3 },
] as const;

describe("Total calibration — exact reconstruction from the compact artifact alone (§22)", () => {
  for (const cutoff of CUTOFFS) {
    it(`${cutoff.label} (${cutoff.season} wk${cutoff.week}): local pooled-linear refit reproduces the seed's own calibratedTotal`, () => {
      const target = findGameAt(cutoff.season, cutoff.week);
      const trainingPool = calibrationArtifact.records.filter((r) => isEligibleBeforeCutoff(r, cutoff.season, cutoff.week));

      let calibratedTotal: number;
      if (trainingPool.length === 0) {
        // Phase 5's own RAW-passthrough rule when the pool is empty (research/phase5/phase5WalkForwardCore.ts).
        calibratedTotal = target.rawProjectedTotal;
      } else {
        const coeffs = fitLinear(trainingPool.map((r) => ({ x: r.rawProjectedTotal, y: r.actualTotal })));
        calibratedTotal = applyCalibration(target.rawProjectedTotal, coeffs);
      }

      expect(calibratedTotal).toBeCloseTo(target.calibratedTotal, 6);
      // Margin-preservation identity must also hold for the reconstructed value.
      const reconstructedHome = (calibratedTotal + target.rawProjectedMargin) / 2;
      const reconstructedAway = (calibratedTotal - target.rawProjectedMargin) / 2;
      expect(reconstructedHome).toBeCloseTo(target.calibratedExpectedHomePoints, 6);
      expect(reconstructedAway).toBeCloseTo(target.calibratedExpectedAwayPoints, 6);
    });
  }
});

describe("Residual pool membership/count (§22)", () => {
  it("grows monotonically across increasing cutoffs", () => {
    const counts = CUTOFFS.map((c) => calibrationArtifact.records.filter((r) => isEligibleBeforeCutoff(r, c.season, c.week)).length);
    // 2020 wk5 < 2022 wk9 < 2024 wk14 < 2025 wk3? Not strictly guaranteed across a season
    // boundary reset within one season, but cumulative pool size (all seasons pooled) must
    // still be non-decreasing since the pool spans every prior season in full.
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it("has >= 10 eligible residual pairs at every tested cutoff except the very first game of the pool (Phase 5's own probability-eligibility threshold)", () => {
    for (const cutoff of CUTOFFS) {
      const count = calibrationArtifact.records.filter((r) => isEligibleBeforeCutoff(r, cutoff.season, cutoff.week)).length;
      expect(count).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("Scoring normal-equation snapshot — production-safe reconstruction, no research import (§22)", () => {
  for (const cutoff of CUTOFFS) {
    it(`${cutoff.label} (${cutoff.season} wk${cutoff.week}): solving the frozen snapshot's own (ata, atb) produces finite, stable coefficients`, () => {
      const snapshot = findScoringSnapshot(cutoff.season, cutoff.week);
      expect(snapshot.featureNames.length).toBe(7);
      expect(snapshot.usableRowCount).toBeGreaterThan(20);

      const ata = snapshot.ata.map((row) => [...row]);
      const atb = [...snapshot.atb];
      for (let i = 1; i < snapshot.featureNames.length; i += 1) ata[i][i] += SCORING_RIDGE_LAMBDA;
      const coefficients = solveLinearSystem(ata, atb);

      for (const c of coefficients) expect(Number.isFinite(c)).toBe(true);
      // Sanity bound — a points-scale regression on standardized ratings/environment/success should never explode to absurd magnitudes.
      for (const c of coefficients) expect(Math.abs(c)).toBeLessThan(200);
    });
  }

  it("usableRowCount grows monotonically across increasing cutoffs (the accumulator never resets — see file header)", () => {
    const counts = CUTOFFS.map((c) => findScoringSnapshot(c.season, c.week).usableRowCount);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it("snapshots are chronologically sorted with no duplicate/out-of-order weeks within a season", () => {
    let previous: { season: number; week: number } | null = null;
    for (const record of scoringArtifact.records) {
      if (previous && previous.season === record.season) {
        expect(record.week).toBeGreaterThan(previous.week);
      }
      previous = { season: record.season, week: record.week };
    }
  });
});
