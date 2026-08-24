import { describe, expect, it } from "vitest";
import { blendPriorAndCurrent } from "./decay";

describe("blendPriorAndCurrent", () => {
  it("NONE ignores the prior entirely", () => {
    expect(blendPriorAndCurrent(5, 2, 3, { method: "NONE" })).toBe(2);
    expect(blendPriorAndCurrent(5, null, 0, { method: "NONE" })).toBeNull();
  });

  it("falls back to the prior when there are 0 current-season games", () => {
    expect(blendPriorAndCurrent(5, null, 0, { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 })).toBe(5);
    expect(blendPriorAndCurrent(5, 10, 0, { method: "FIXED_GAME_COUNT", rampGames: 4 })).toBe(5);
  });

  it("falls back to the current value when there is no prior", () => {
    expect(blendPriorAndCurrent(null, 8, 3, { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 })).toBe(8);
  });

  it("PRECISION_WEIGHTED: posterior = (K*prior + n*current) / (K+n)", () => {
    const result = blendPriorAndCurrent(0, 10, 3, { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 });
    // (3*0 + 3*10) / 6 = 5
    expect(result).toBeCloseTo(5, 10);
  });

  it("PRECISION_WEIGHTED converges toward current as games played grows", () => {
    const early = blendPriorAndCurrent(0, 10, 1, { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 });
    const late = blendPriorAndCurrent(0, 10, 20, { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 });
    expect(late).toBeGreaterThan(early!);
    expect(late).toBeLessThan(10);
    expect(late).toBeGreaterThan(8);
  });

  it("FIXED_GAME_COUNT ramps prior weight to 0 linearly by rampGames", () => {
    const halfway = blendPriorAndCurrent(0, 10, 2, { method: "FIXED_GAME_COUNT", rampGames: 4 });
    expect(halfway).toBeCloseTo(5, 10); // 50% prior, 50% current
    const done = blendPriorAndCurrent(0, 10, 4, { method: "FIXED_GAME_COUNT", rampGames: 4 });
    expect(done).toBeCloseTo(10, 10); // fully ramped to current
  });

  it("returns null when both prior and current are null", () => {
    expect(blendPriorAndCurrent(null, null, 0, { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 })).toBeNull();
  });
});
