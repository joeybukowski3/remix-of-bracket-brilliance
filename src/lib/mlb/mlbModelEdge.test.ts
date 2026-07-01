import { describe, expect, it } from "vitest";
import {
  computeModelEdge,
  getEdgeTierKey,
  getEdgeTierLabel,
  ML_EDGE_METHODOLOGY,
  type ModelEdgeResult,
} from "./mlbModelEdge";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";

describe("Moneyline Edge correctness fix (Phase 1 audit)", () => {
  it("ML_EDGE_METHODOLOGY explicitly states this is not a calibrated probability", () => {
    expect(ML_EDGE_METHODOLOGY.toLowerCase()).toContain("not a calibrated win probability");
  });

  it("ModelEdgeResult never carries a 'probability' field", () => {
    const result = computeModelEdge(DEV_MLB_MATCHUP_FIXTURE.detail);
    expect(result).not.toHaveProperty("probability");
    expect(result).not.toHaveProperty("modelProb");
    expect(result).not.toHaveProperty("valueEdge");
  });

  it("computeModelEdge output shape and weights are unchanged from the pre-fix formula", () => {
    const result = computeModelEdge(DEV_MLB_MATCHUP_FIXTURE.detail);
    expect(result.factors).toHaveLength(5);
    const weightsByLabel = Object.fromEntries(result.factors.map((f) => [f.label, f.weight]));
    expect(weightsByLabel["Pitcher Quality"]).toBe(0.30);
    expect(weightsByLabel["Matchup Edge"]).toBe(0.25);
    expect(weightsByLabel["Lineup Offense"]).toBe(0.20);
    expect(weightsByLabel["Recent Form"]).toBe(0.15);
    expect(weightsByLabel["Season Quality"]).toBe(0.10);
    const totalWeight = result.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it("confidence stays within the documented 50-82 bound", () => {
    const result = computeModelEdge(DEV_MLB_MATCHUP_FIXTURE.detail);
    expect(result.confidence).toBeGreaterThanOrEqual(50);
    expect(result.confidence).toBeLessThanOrEqual(82);
  });
});

describe("getEdgeTierKey / getEdgeTierLabel", () => {
  it("boundary: 71 is slight, 72 is strong (matches MlbModelPickBadge thresholds)", () => {
    expect(getEdgeTierKey(71)).toBe("moderate");
    expect(getEdgeTierKey(72)).toBe("strong");
  });

  it("boundary: 63 is slight, 64 is moderate", () => {
    expect(getEdgeTierKey(63)).toBe("slight");
    expect(getEdgeTierKey(64)).toBe("moderate");
  });

  it("boundary: 55 is coin-flip, 56 is slight", () => {
    expect(getEdgeTierKey(55)).toBe("coin-flip");
    expect(getEdgeTierKey(56)).toBe("slight");
  });

  it("50 (push floor) is coin-flip", () => {
    expect(getEdgeTierKey(50)).toBe("coin-flip");
  });

  it("82 (confidence ceiling) is strong", () => {
    expect(getEdgeTierKey(82)).toBe("strong");
  });

  it("labels are human-readable and match the tier", () => {
    expect(getEdgeTierLabel(75)).toBe("Strong lean");
    expect(getEdgeTierLabel(65)).toBe("Moderate lean");
    expect(getEdgeTierLabel(58)).toBe("Slight lean");
    expect(getEdgeTierLabel(52)).toBe("Coin flip");
  });
});

describe("differential is preserved for honest sorting (replaces fabricated valueEdge)", () => {
  it("differential is a non-negative number derived from the same formula", () => {
    const result: ModelEdgeResult = computeModelEdge(DEV_MLB_MATCHUP_FIXTURE.detail);
    expect(result.differential).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.differential)).toBe(true);
  });
});
