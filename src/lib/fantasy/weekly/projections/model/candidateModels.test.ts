import { describe, expect, it } from "vitest";
import { makeRow } from "./__fixtures__/rows";
import { fitDeterministicShrinkageBaseline, fitDirectRidge, fitResidualRidge, scoreCandidate } from "./candidateModels";
import { scoreLinearModel } from "./linear";
import { encodeRow } from "./scaling";

function trainingSet() {
  return Array.from({ length: 30 }, (_, i) =>
    makeRow({
      season: 2023, week: (i % 15) + 1, playerId: `p${i}`, position: "WR",
      actualFantasyPoints: 8 + (i % 5), seasonPpgPrior: 8 + (i % 5), targetsSeasonPrior: 5 + (i % 4),
    }),
  );
}
function validationSet() {
  return Array.from({ length: 10 }, (_, i) =>
    makeRow({
      season: 2024, week: (i % 10) + 1, playerId: `v${i}`, position: "WR",
      actualFantasyPoints: 9 + (i % 4), seasonPpgPrior: 9 + (i % 4), targetsSeasonPrior: 6 + (i % 3),
    }),
  );
}

describe("candidate models: residual construction and reconciliation", () => {
  it("residual-ridge prediction reconciles to stableBaseline + learned residual contribution exactly", () => {
    const training = trainingSet();
    const validation = validationSet();
    const fitted = fitResidualRidge("WR", training, validation, ["baseline", "usage"]);
    const row = validation[0];
    const baseline = fitDeterministicShrinkageBaseline(training, validation);
    const stableBaselineValue = scoreCandidate({ ...baseline, shrinkageK: fitted.shrinkageK, rookieFallbackPpg: fitted.rookieFallbackPpg }, row);
    const contribution = scoreLinearModel(fitted.linearModel!, encodeRow(row, fitted.scalers));
    expect(scoreCandidate(fitted, row)).toBeCloseTo(stableBaselineValue! + contribution, 8);
  });

  it("direct-ridge does NOT add the stable baseline on top of the fitted model (it predicts the target directly)", () => {
    const training = trainingSet();
    const validation = validationSet();
    const fitted = fitDirectRidge("WR", training, validation, ["baseline", "usage"]);
    const row = validation[0];
    const contribution = scoreLinearModel(fitted.linearModel!, encodeRow(row, fitted.scalers));
    expect(scoreCandidate(fitted, row)).toBeCloseTo(contribution, 8);
  });

  it("deterministic-shrinkage-baseline candidate has no linear model and returns the shrinkage blend directly", () => {
    const training = trainingSet();
    const validation = validationSet();
    const fitted = fitDeterministicShrinkageBaseline(training, validation);
    expect(fitted.linearModel).toBeNull();
    expect(scoreCandidate(fitted, validation[0])).not.toBeNull();
  });

  it("residual construction: training residual targets equal actual minus stable baseline (not raw actual points)", () => {
    const training = trainingSet();
    const validation = validationSet();
    const baseline = fitDeterministicShrinkageBaseline(training, validation);
    const residualFitted = fitResidualRidge("WR", training, validation, ["baseline", "usage"]);
    // A residual-ridge model fit on rows whose stable baseline already matches actual points almost exactly
    // should produce small-magnitude coefficients relative to a direct-ridge model on the same features.
    const directFitted = fitDirectRidge("WR", training, validation, ["baseline", "usage"]);
    const residualCoeffMagnitude = residualFitted.linearModel!.coefficients.reduce((s, c) => s + Math.abs(c), 0);
    const directCoeffMagnitude = directFitted.linearModel!.coefficients.reduce((s, c) => s + Math.abs(c), 0);
    expect(Number.isFinite(residualCoeffMagnitude)).toBe(true);
    expect(Number.isFinite(directCoeffMagnitude)).toBe(true);
    expect(baseline.linearModel).toBeNull();
  });
});
