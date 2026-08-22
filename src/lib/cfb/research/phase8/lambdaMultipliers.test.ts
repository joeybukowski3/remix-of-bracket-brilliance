import { describe, expect, it } from "vitest";
import { connectivityLambdaMultiplier } from "./lambdaMultipliers";
import { MAX_CONNECTIVITY_MULTIPLIER } from "./config";
import type { TeamGraphMetrics } from "./types";

function metrics(overrides: Partial<TeamGraphMetrics>): TeamGraphMetrics {
  return { teamExternalId: "T", componentId: 0, componentSize: 50, uniqueOpponents: 5, weightedDegree: 5, crossConferenceOpponents: 2, ...overrides };
}

describe("connectivityLambdaMultiplier", () => {
  it("GLOBAL_BASELINE is always exactly 1 (Section 2 — this is what makes it equal to the frozen baseline)", () => {
    expect(connectivityLambdaMultiplier("GLOBAL_BASELINE", metrics({ weightedDegree: 0, componentSize: 1 }))).toBe(1);
  });

  it("GAMES_PLAYED never shrinks LESS than baseline (multiplier always >= 1)", () => {
    for (const games of [0, 1, 2, 5, 20]) {
      expect(connectivityLambdaMultiplier("GAMES_PLAYED", metrics({ weightedDegree: games }))).toBeGreaterThanOrEqual(1);
    }
  });

  it("GAMES_PLAYED increases shrinkage as games played decreases", () => {
    const few = connectivityLambdaMultiplier("GAMES_PLAYED", metrics({ weightedDegree: 1 }));
    const many = connectivityLambdaMultiplier("GAMES_PLAYED", metrics({ weightedDegree: 10 }));
    expect(few).toBeGreaterThan(many);
  });

  it("every candidate is capped at MAX_CONNECTIVITY_MULTIPLIER (Section 6 safety)", () => {
    const extreme = metrics({ weightedDegree: 0, componentSize: 1, crossConferenceOpponents: 0 });
    for (const id of ["GAMES_PLAYED", "COMPONENT_SIZE", "CROSS_CONFERENCE", "COMBINED_INFORMATION"] as const) {
      expect(connectivityLambdaMultiplier(id, extreme)).toBeLessThanOrEqual(MAX_CONNECTIVITY_MULTIPLIER);
    }
  });

  it("COMPONENT_SIZE increases shrinkage for small/disconnected components", () => {
    const small = connectivityLambdaMultiplier("COMPONENT_SIZE", metrics({ componentSize: 2 }));
    const large = connectivityLambdaMultiplier("COMPONENT_SIZE", metrics({ componentSize: 100 }));
    expect(small).toBeGreaterThan(large);
  });
});
