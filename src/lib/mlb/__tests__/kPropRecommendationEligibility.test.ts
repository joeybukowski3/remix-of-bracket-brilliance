import { describe, expect, it } from "vitest";
import {
  evaluateKPropOverRecommendation,
  evaluateKPropUnderRecommendation,
  computeWorkloadReliability,
  MIN_STANDARD_K_PROP_IP,
  MIN_STANDARD_K_PROP_BF,
  MIN_STANDARD_K_PROP_PROJECTED_KS,
  MIN_EXCEPTIONAL_IP,
  MIN_EXCEPTIONAL_BF,
  MIN_EXCEPTIONAL_PROJECTED_KS,
  MIN_EXCEPTIONAL_EDGE,
  MIN_EXCEPTIONAL_CONFIDENCE,
  MIN_EXCEPTIONAL_TEAM_ADJUSTED_K_RATE,
  MIN_EXCEPTIONAL_OPPONENT_K_RATE,
  type KPropRecommendationInput,
} from "@/lib/mlb/kPropRecommendationEligibility";

function starterInput(overrides: Partial<KPropRecommendationInput> = {}): KPropRecommendationInput {
  return {
    workloadRole: "starter",
    expectedIP: 5.5,
    expectedBF: 22,
    projectedKs: 5.8,
    kLine: 5.5,
    publicRecommendationEligible: true,
    workloadConfidenceGrade: "A",
    workloadConfidenceScore: 0.9,
    teamAdjustedKRate: 0.25,
    workloadFlags: [],
    strikeoutMatchupScore: 65,
    opponentTeamKRate: 22,
    ...overrides,
  };
}

// Chris-Murphy-shaped: ~1 IP, ~4-6 BF, ~0.9 projected Ks, a low line.
function chrisMurphyShapedInput(overrides: Partial<KPropRecommendationInput> = {}): KPropRecommendationInput {
  return {
    workloadRole: "reliever",
    expectedIP: 1.0,
    expectedBF: 3.8,
    projectedKs: 0.9,
    kLine: 0.5,
    publicRecommendationEligible: true,
    workloadConfidenceGrade: "A",
    workloadConfidenceScore: 1,
    teamAdjustedKRate: 0.236,
    workloadFlags: ["RELIEVER_PROFILE", "RELIEVER_WORKLOAD_CAP", "LOW_PITCHER_SAMPLE"],
    strikeoutMatchupScore: 71,
    opponentTeamKRate: 22,
    ...overrides,
  };
}

describe("evaluateKPropOverRecommendation", () => {
  it("Chris-Murphy-shaped reliever/opener with a positive raw edge is excluded from Top Over", () => {
    const evaluation = evaluateKPropOverRecommendation(chrisMurphyShapedInput());
    expect(evaluation.rawEdge).toBeCloseTo(0.4, 5);
    expect(evaluation.rawEdge).toBeGreaterThan(0);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.tier).toBe("excluded");
    expect(evaluation.reason).toBe("INSUFFICIENT_WORKLOAD_FOR_TOP_OVER");
  });

  it("low-workload pitcher with only a 0.4 raw edge has its adjusted edge heavily reduced and is excluded", () => {
    const evaluation = evaluateKPropOverRecommendation(chrisMurphyShapedInput());
    expect(evaluation.adjustedRecommendationEdge).not.toBeNull();
    expect(Math.abs(evaluation.adjustedRecommendationEdge!)).toBeLessThan(Math.abs(evaluation.rawEdge!));
    expect(evaluation.eligible).toBe(false);
  });

  it("standard starter (5.5 IP, 22 BF, 5.8 projected Ks) qualifies through the standard tier", () => {
    const evaluation = evaluateKPropOverRecommendation(starterInput({ kLine: 5.0 })); // edge 0.8, clears MIN_STANDARD_EDGE
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.tier).toBe("standard");
    // Full reference workload (5.5 IP / 22 BF) clamps reliability to
    // exactly 1, so the adjusted edge equals the raw edge unchanged.
    expect(evaluation.workloadScore).toBe(1);
    expect(evaluation.adjustedRecommendationEdge).toBe(evaluation.rawEdge);
  });

  it("exceptional opener passing every exceptional threshold may qualify with the exceptional-low-workload tier", () => {
    const eliteOpener = chrisMurphyShapedInput({
      workloadRole: "opener",
      expectedIP: MIN_EXCEPTIONAL_IP + 0.2,
      expectedBF: MIN_EXCEPTIONAL_BF + 1,
      projectedKs: MIN_EXCEPTIONAL_PROJECTED_KS + 1.6, // pushes edge well past MIN_EXCEPTIONAL_EDGE
      kLine: MIN_EXCEPTIONAL_PROJECTED_KS,
      workloadConfidenceGrade: "A",
      workloadConfidenceScore: MIN_EXCEPTIONAL_CONFIDENCE + 0.05,
      teamAdjustedKRate: MIN_EXCEPTIONAL_TEAM_ADJUSTED_K_RATE + 0.05,
      workloadFlags: [],
      opponentTeamKRate: MIN_EXCEPTIONAL_OPPONENT_K_RATE + 1,
    });
    const evaluation = evaluateKPropOverRecommendation(eliteOpener);
    expect(evaluation.rawEdge).toBeGreaterThanOrEqual(MIN_EXCEPTIONAL_EDGE);
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.tier).toBe("exceptional-low-workload");
  });

  it("a pitcher around 1 IP / 4 BF / 0.9 Ks must not qualify through the exceptional override even with strong confidence", () => {
    const evaluation = evaluateKPropOverRecommendation(chrisMurphyShapedInput({
      // Even granting an elite matchup signal and clean flags, the sheer
      // workload (1 IP / 3.8 BF) and edge (0.4) fall short of the
      // exceptional bar (1.5 IP / 7 BF / 1.0 edge).
      workloadFlags: [],
      opponentTeamKRate: 30,
      strikeoutMatchupScore: 90,
    }));
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.tier).toBe("excluded");
  });

  it("missing expectedIP or expectedBF is excluded from Top Over with an explicit reason", () => {
    const missingIp = evaluateKPropOverRecommendation(starterInput({ expectedIP: null }));
    expect(missingIp.eligible).toBe(false);
    expect(missingIp.reason).toBe("MISSING_WORKLOAD_DATA_FOR_TOP_OVER");

    const missingBf = evaluateKPropOverRecommendation(starterInput({ expectedBF: null }));
    expect(missingBf.eligible).toBe(false);
    expect(missingBf.reason).toBe("MISSING_WORKLOAD_DATA_FOR_TOP_OVER");
  });

  it("a candidate-ineligible workload (publicRecommendationEligible: false) is excluded regardless of workload", () => {
    const evaluation = evaluateKPropOverRecommendation(starterInput({ publicRecommendationEligible: false }));
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("RECOMMENDATION_CANDIDATE_INELIGIBLE");
  });

  it("a standard starter without a sufficient edge is excluded (not merely 'not standard')", () => {
    const evaluation = evaluateKPropOverRecommendation(starterInput({ projectedKs: 5.7, kLine: 5.5 })); // edge 0.2
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INSUFFICIENT_EDGE_FOR_TOP_OVER");
  });
});

describe("evaluateKPropUnderRecommendation", () => {
  it("low-workload valid Under: 1.0 projected K, line 4.5, high-confidence workload may qualify", () => {
    const evaluation = evaluateKPropUnderRecommendation({
      workloadRole: "opener",
      expectedIP: 1.0,
      expectedBF: 4,
      projectedKs: 1.0,
      kLine: 4.5,
      publicRecommendationEligible: true,
      workloadConfidenceGrade: "A",
      workloadConfidenceScore: 0.9,
      teamAdjustedKRate: 0.25,
      workloadFlags: [],
    });
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.rawEdge).toBeCloseTo(-3.5, 5);
  });

  it("low-workload weak Under: a small negative edge is excluded", () => {
    // workloadFlags cleared so this isolates the edge-magnitude check itself,
    // not the (separately tested) blocking-workload-flag rejection path.
    const evaluation = evaluateKPropUnderRecommendation(chrisMurphyShapedInput({ kLine: 1.5, workloadFlags: [] })); // edge -0.6
    expect(evaluation.rawEdge).toBeCloseTo(-0.6, 5);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INSUFFICIENT_EDGE_FOR_TOP_UNDER");
  });

  it("excludes a low-workload Under with an unreliable/missing role classification", () => {
    const evaluation = evaluateKPropUnderRecommendation({
      workloadRole: null,
      expectedIP: 1,
      expectedBF: 4,
      projectedKs: 1,
      kLine: 4.5,
      publicRecommendationEligible: true,
      workloadConfidenceGrade: "A",
      workloadConfidenceScore: 0.9,
    });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("UNRELIABLE_ROLE_CLASSIFICATION_FOR_TOP_UNDER");
  });

  it("excludes a low-workload Under with stale/malformed workload flags", () => {
    const evaluation = evaluateKPropUnderRecommendation({
      workloadRole: "reliever",
      expectedIP: 1,
      expectedBF: 4,
      projectedKs: 1,
      kLine: 4.5,
      publicRecommendationEligible: true,
      workloadConfidenceGrade: "A",
      workloadConfidenceScore: 0.9,
      workloadFlags: ["RECENT_PITCH_COUNTS_MISSING"],
    });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("UNRELIABLE_WORKLOAD_DATA_FOR_TOP_UNDER");
  });

  it("excludes a low-workload Under with insufficient confidence", () => {
    const evaluation = evaluateKPropUnderRecommendation({
      workloadRole: "reliever",
      expectedIP: 1,
      expectedBF: 4,
      projectedKs: 1,
      kLine: 4.5,
      publicRecommendationEligible: true,
      workloadConfidenceGrade: "C",
      workloadConfidenceScore: 0.5,
      workloadFlags: [],
    });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("INSUFFICIENT_CONFIDENCE_FOR_TOP_UNDER");
  });

  it("standard-workload starter Under is unaffected by the low-workload-specific rules", () => {
    const evaluation = evaluateKPropUnderRecommendation(starterInput({ projectedKs: 5.0, kLine: 6.0 })); // edge -1.0
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.tier).toBe("standard");
  });

  it("missing expectedIP or expectedBF is excluded from Top Under with an explicit reason", () => {
    const evaluation = evaluateKPropUnderRecommendation(starterInput({ expectedBF: null }));
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("MISSING_WORKLOAD_DATA_FOR_TOP_UNDER");
  });

  it("a candidate-ineligible workload is excluded regardless of edge", () => {
    const evaluation = evaluateKPropUnderRecommendation({
      workloadRole: "reliever",
      expectedIP: 1,
      expectedBF: 4,
      projectedKs: 0.5,
      kLine: 4.5,
      publicRecommendationEligible: false,
    });
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reason).toBe("RECOMMENDATION_CANDIDATE_INELIGIBLE");
  });
});

describe("computeWorkloadReliability", () => {
  it("is deterministic and bounded to [0, 1]", () => {
    expect(computeWorkloadReliability(0, 0)).toBe(0);
    expect(computeWorkloadReliability(100, 100)).toBe(1);
    expect(computeWorkloadReliability(null, null)).toBe(0);
  });

  it("clamps to exactly 1 at or above the full-workload reference point", () => {
    expect(computeWorkloadReliability(5.5, 22)).toBe(1);
    expect(computeWorkloadReliability(7, 26)).toBe(1);
  });

  it("scales proportionally below the reference point", () => {
    const half = computeWorkloadReliability(2.75, 11); // exactly half of the reference on both axes
    expect(half).toBeCloseTo(0.5, 5);
  });
});

describe("threshold constants are named, not magic numbers", () => {
  it("standard thresholds match the documented values", () => {
    expect(MIN_STANDARD_K_PROP_IP).toBe(3.5);
    expect(MIN_STANDARD_K_PROP_BF).toBe(14);
    expect(MIN_STANDARD_K_PROP_PROJECTED_KS).toBe(2.5);
  });

  it("exceptional thresholds are strictly more conservative than the standard ones would suggest for a short outing", () => {
    expect(MIN_EXCEPTIONAL_IP).toBeLessThan(MIN_STANDARD_K_PROP_IP);
    expect(MIN_EXCEPTIONAL_BF).toBeLessThan(MIN_STANDARD_K_PROP_BF);
    expect(MIN_EXCEPTIONAL_EDGE).toBeGreaterThan(0.4); // stricter than the base edge threshold
  });
});
