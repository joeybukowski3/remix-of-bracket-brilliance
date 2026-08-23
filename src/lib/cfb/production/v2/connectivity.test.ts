import { describe, expect, it } from "vitest";
import { componentSizeRegularizationMultiplier, effectiveConnectivityLambda } from "./connectivity";
import { CFB_V2_CONNECTIVITY_CONFIG } from "./config";
import { connectivityLambdaMultiplier } from "../../research/phase8/lambdaMultipliers";
import type { TeamGraphMetrics } from "../../research/phase8/types";

function metrics(componentSize: number): TeamGraphMetrics {
  return { teamExternalId: "T", componentId: 0, componentSize, uniqueOpponents: 5, weightedDegree: 5, crossConferenceOpponents: 2 };
}

describe("componentSizeRegularizationMultiplier — parity with Phase 8's COMPONENT_SIZE finalist", () => {
  it.each([1, 2, 5, 10, 19, 20, 21, 50, 100, 342])("matches research output for componentSize=%i", (componentSize) => {
    const production = componentSizeRegularizationMultiplier(componentSize);
    const research = connectivityLambdaMultiplier("COMPONENT_SIZE", metrics(componentSize));
    expect(production).toBeCloseTo(research, 12);
  });

  it("never falls below 1 (never less shrinkage than baseline)", () => {
    for (const size of [1, 20, 50, 1000]) {
      expect(componentSizeRegularizationMultiplier(size)).toBeGreaterThanOrEqual(1);
    }
  });

  it("is capped at maxPenaltyMultiplier for maximally disconnected teams", () => {
    expect(componentSizeRegularizationMultiplier(1)).toBe(CFB_V2_CONNECTIVITY_CONFIG.maxPenaltyMultiplier);
  });

  it("decreases as component size grows", () => {
    const small = componentSizeRegularizationMultiplier(2);
    const large = componentSizeRegularizationMultiplier(100);
    expect(small).toBeGreaterThan(large);
  });
});

describe("effectiveConnectivityLambda", () => {
  it("equals baseLambda * multiplier", () => {
    const componentSize = 10;
    const expected = CFB_V2_CONNECTIVITY_CONFIG.baseLambda * componentSizeRegularizationMultiplier(componentSize);
    expect(effectiveConnectivityLambda(componentSize)).toBe(expected);
  });
});
