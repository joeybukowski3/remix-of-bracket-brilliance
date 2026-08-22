import { describe, expect, it } from "vitest";
import { makeRow } from "../model/__fixtures__/rows";
import { fitPositionDeploymentBundle } from "../model/deploymentFit";
import { computeShadowProjection } from "./inference";

function trainingRows(position: "RB" | "WR" | "TE", count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeRow({
      season: 2023, week: 1, playerId: `gsis:${position}-${index}`, position,
      actualFantasyPoints: 4 + (index % 9), priorSeasonPpg: 3 + (index % 5),
      targetsSeasonPrior: 2 + (index % 4), targetsLast3: 2 + (index % 4),
    }));
}

const GENERATED_AT = "2026-08-22T00:00:00.000Z";
const FINGERPRINT = "0".repeat(64);

describe("computeShadowProjection QB governance", () => {
  it("QB projectedFantasyPoints exactly equals baselineFantasyPoints with all learned adjustments zero", () => {
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:qb-1", position: "QB", gamesPlayedPrior: 0, seasonPpgPrior: null, last3PpgPrior: null, last5PpgPrior: null });
    const result = computeShadowProjection(row, 22.5, null);
    expect(result.modelAuthority.state).toBe("BASELINE_ONLY");
    expect(result.projectedFantasyPoints).toBe(result.baselineFantasyPoints);
    expect(result.components.usageAdjustment).toBe(0);
    expect(result.components.teamContextAdjustment).toBe(0);
    expect(result.components.opponentAdjustment).toBe(0);
    expect(result.components.otherAdjustment).toBe(0);
    expect(result.baselineFantasyPoints).toBe(22.5); // ROS baseline used when available
    expect(result.residualActivated).toBe(false);
    expect(result.residualActivationReason).toBe("model-state-baseline-only");
  });

  it("QB falls back to the frozen shrinkage-blend baseline when rosProjectedPpg is unavailable", () => {
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:qb-2", position: "QB", gamesPlayedPrior: 0, seasonPpgPrior: null, priorSeasonPpg: 18 });
    const result = computeShadowProjection(row, null, null);
    expect(result.projectedFantasyPoints).toBe(18);
    expect(result.confidence.reasons.some((r) => r.includes("shrinkage-blend-fallback"))).toBe(true);
  });

  it("throws if a learned bundle is ever passed for a QB row", () => {
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:qb-3", position: "QB" });
    const fakeBundle = fitPositionDeploymentBundle("WR", trainingRows("WR", 6), { generatedAt: GENERATED_AT, inputFingerprint: FINGERPRINT });
    // @ts-expect-error deliberately passing a WR bundle for a QB row to prove the guard fires
    expect(() => computeShadowProjection(row, 20, fakeBundle)).toThrow();
  });
});

describe("computeShadowProjection RB/WR/TE reconciliation (activated: at least one selected feature observed)", () => {
  it("components sum exactly to projectedFantasyPoints for RB (usage + teamContext blocks) and residualActivated is true", () => {
    const bundle = fitPositionDeploymentBundle("RB", trainingRows("RB", 8), { generatedAt: GENERATED_AT, inputFingerprint: FINGERPRINT });
    const row = makeRow({ season: 2026, week: 2, playerId: "gsis:rb-1", position: "RB", gamesPlayedPrior: 1, seasonPpgPrior: 10, priorSeasonPpg: 9, targetsSeasonPrior: 3, targetsLast3: 3 });
    const result = computeShadowProjection(row, 11.2, bundle);
    const sum = result.components.baseline + result.components.usageAdjustment + result.components.teamContextAdjustment + result.components.opponentAdjustment + result.components.otherAdjustment;
    expect(sum).toBeCloseTo(result.projectedFantasyPoints, 9);
    expect(result.baselineFantasyPoints).toBe(11.2);
    expect(result.modelAuthority.state).toBe("READY_FOR_2026_SHADOW");
    expect(Number.isFinite(result.projectedFantasyPoints)).toBe(true);
    expect(result.residualActivated).toBe(true);
    expect(result.residualActivationReason).toBe("selected-current-season-feature-observed");
  });

  it("components sum exactly to projectedFantasyPoints for WR (usage block only, teamContextAdjustment stays 0) and residualActivated is true", () => {
    const bundle = fitPositionDeploymentBundle("WR", trainingRows("WR", 8), { generatedAt: GENERATED_AT, inputFingerprint: FINGERPRINT });
    const row = makeRow({ season: 2026, week: 2, playerId: "gsis:wr-1", position: "WR", gamesPlayedPrior: 1, seasonPpgPrior: 8, priorSeasonPpg: 7, targetsSeasonPrior: 4, targetsLast3: 4 });
    const result = computeShadowProjection(row, null, bundle);
    expect(result.components.teamContextAdjustment).toBe(0);
    expect(result.components.opponentAdjustment).toBe(0);
    const sum = result.components.baseline + result.components.usageAdjustment + result.components.otherAdjustment;
    expect(sum).toBeCloseTo(result.projectedFantasyPoints, 9);
    expect(result.residualActivated).toBe(true);
  });

  it("throws if a READY_FOR_2026_SHADOW position is scored without a deployment bundle", () => {
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:te-1", position: "TE" });
    expect(() => computeShadowProjection(row, 5, null)).toThrow();
  });
});

describe("computeShadowProjection Week 1 residual gating (no selected current-season feature observed)", () => {
  const week1Nulls = {
    gamesPlayedPrior: 0, seasonPpgPrior: null, last3PpgPrior: null, last5PpgPrior: null,
    carriesSeasonPrior: null, carriesLast3: null, targetsSeasonPrior: null, targetsLast3: null,
    receptionsSeasonPrior: null, rushYardsSeasonPrior: null, receivingYardsSeasonPrior: null,
    targetShareSeasonPrior: null, receivingAirYardsSeasonPrior: null, airYardsShareSeasonPrior: null,
    teamRushEpaPrior: null, teamOffensivePlaysPrior: null, teamPassEpaPrior: null,
  } as const;

  it("RB: residual gated off, projectedFantasyPoints === baselineFantasyPoints, all components zero, no arbitrary clamp", () => {
    const bundle = fitPositionDeploymentBundle("RB", trainingRows("RB", 8), { generatedAt: GENERATED_AT, inputFingerprint: FINGERPRINT });
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:rb-wk1", position: "RB", priorSeasonPpg: 0.5, ...week1Nulls });
    const result = computeShadowProjection(row, null, bundle);
    expect(result.residualActivated).toBe(false);
    expect(result.residualActivationReason).toBe("no-selected-current-season-features-observed");
    expect(result.projectedFantasyPoints).toBe(result.baselineFantasyPoints);
    expect(result.components).toEqual({ baseline: result.baselineFantasyPoints, usageAdjustment: 0, teamContextAdjustment: 0, opponentAdjustment: 0, otherAdjustment: 0 });
    expect(result.projectedFantasyPoints).toBe(0.5); // never clamped even though it's near zero
  });

  it("WR: residual gated off, projectedFantasyPoints === baselineFantasyPoints", () => {
    const bundle = fitPositionDeploymentBundle("WR", trainingRows("WR", 8), { generatedAt: GENERATED_AT, inputFingerprint: FINGERPRINT });
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:wr-wk1", position: "WR", ...week1Nulls });
    const result = computeShadowProjection(row, 9.4, bundle);
    expect(result.residualActivated).toBe(false);
    expect(result.projectedFantasyPoints).toBe(9.4);
    expect(result.components.usageAdjustment).toBe(0);
  });

  it("TE: residual gated off, projectedFantasyPoints === baselineFantasyPoints", () => {
    const bundle = fitPositionDeploymentBundle("TE", trainingRows("TE", 8), { generatedAt: GENERATED_AT, inputFingerprint: FINGERPRINT });
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:te-wk1", position: "TE", ...week1Nulls });
    const result = computeShadowProjection(row, 3.1, bundle);
    expect(result.residualActivated).toBe(false);
    expect(result.projectedFantasyPoints).toBe(3.1);
  });

  it("every gated-off row still carries the tracked inference-policy version", () => {
    const bundle = fitPositionDeploymentBundle("RB", trainingRows("RB", 8), { generatedAt: GENERATED_AT, inputFingerprint: FINGERPRINT });
    const row = makeRow({ season: 2026, week: 1, playerId: "gsis:rb-wk1b", position: "RB", ...week1Nulls });
    const result = computeShadowProjection(row, 6, bundle);
    expect(result.inferencePolicyVersion).toBe("weekly-fantasy-projection-inference-v1");
  });
});
