import { describe, expect, it } from "vitest";
import { computeBiasReport, evaluateBiasCorrection } from "./nfl-research-bias.mjs";

function row(overrides = {}) {
  return {
    projectionYards: 262.5,
    sportsbookLine: 250,
    rawEdgeYards: 12.5,
    actualYards: 250,
    outcome: "push",
    ...overrides,
  };
}

describe("computeBiasReport", () => {
  it("reproduces the documented ~+12.5-yard passing bias when projection consistently overshoots actual by 12.5", () => {
    const rows = [row({ actualYards: 240 }), row({ actualYards: 260 }), row({ actualYards: 250 })].map((r, i) => ({
      ...r,
      projectionYards: r.actualYards + 12.5,
    }));
    const report = computeBiasReport(rows, "passing");
    expect(report.overallBias).toBeCloseTo(12.5, 5);
  });

  it("computes positive-edge over-hit-rate and negative-edge under-hit-rate independently", () => {
    const rows = [
      row({ rawEdgeYards: 10, outcome: "over" }),
      row({ rawEdgeYards: 10, outcome: "under" }),
      row({ rawEdgeYards: -10, outcome: "under" }),
    ];
    const report = computeBiasReport(rows, "passing");
    expect(report.positiveEdgeOverPerformance.n).toBe(2);
    expect(report.positiveEdgeOverPerformance.overHitRate).toBeCloseTo(0.5, 5);
    expect(report.negativeEdgeUnderPerformance.n).toBe(1);
    expect(report.negativeEdgeUnderPerformance.underHitRate).toBe(1);
  });

  it("excludes ungraded rows (actualYards null) from the bias computation", () => {
    const rows = [row({ actualYards: null }), row({ actualYards: 250, projectionYards: 250 })];
    const report = computeBiasReport(rows, "passing");
    expect(report.n).toBe(1);
  });
});

describe("evaluateBiasCorrection", () => {
  it("fits the correction on development only and evaluates it only on validation", () => {
    // Development: projection is always actual+12.5 (fits the documented bias exactly).
    const development = [
      { actualYards: 200, projectionYards: 212.5 },
      { actualYards: 220, projectionYards: 232.5 },
      { actualYards: 240, projectionYards: 252.5 },
    ];
    // Validation: same +12.5 bias pattern, held out from fitting.
    const validation = [
      { actualYards: 210, projectionYards: 222.5 },
      { actualYards: 230, projectionYards: 242.5 },
    ];
    const result = evaluateBiasCorrection(development, validation);
    expect(result.evaluable).toBe(true);
    expect(result.correction).toBeCloseTo(12.5, 5);
    expect(result.developmentN).toBe(3);
    expect(result.validationN).toBe(2);
    // Correction removes the exact bias out-of-sample -> MAE should drop to ~0.
    expect(result.afterCorrection.mae).toBeCloseTo(0, 5);
    expect(result.afterCorrection.mae).toBeLessThan(result.beforeCorrection.mae);
  });

  it("reports not evaluable when either split has zero graded rows, rather than fabricating a result", () => {
    const result = evaluateBiasCorrection([], [{ actualYards: 200, projectionYards: 210 }]);
    expect(result.evaluable).toBe(false);
    expect(result.reason).toBe("insufficient_graded_rows");
  });

  it("does not improve validation error when the correction is not a real pattern (no fabricated benefit)", () => {
    const development = [
      { actualYards: 200, projectionYards: 205 },
      { actualYards: 220, projectionYards: 210 },
      { actualYards: 240, projectionYards: 260 },
    ];
    const validation = [{ actualYards: 210, projectionYards: 210 }]; // projection == actual, no bias here
    const result = evaluateBiasCorrection(development, validation);
    // Development bias is small/noisy; applying it to an already-unbiased validation row should not drive MAE to 0.
    expect(result.afterCorrection.mae).toBeGreaterThan(0);
  });
});
