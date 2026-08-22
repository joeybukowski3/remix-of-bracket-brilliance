import { describe, expect, it } from "vitest";
import { computeQbContinuityFeatures } from "./qbContinuity";

describe("computeQbContinuityFeatures", () => {
  it("returns all-null when either season has no identifiable primary QB (never fabricated)", () => {
    const result = computeQbContinuityFeatures(null, { playerId: "1", name: "A", passShare: 0.8 });
    expect(result.returningPrimaryQb).toBeNull();
    expect(result.newPrimaryQb).toBeNull();
    expect(result.starterContinuity).toBeNull();
  });

  it("detects a returning starter by player id match", () => {
    const result = computeQbContinuityFeatures(
      { playerId: "42", name: "A", passShare: 0.9 },
      { playerId: "42", name: "A", passShare: 0.85 },
    );
    expect(result.returningPrimaryQb).toBe(true);
    expect(result.newPrimaryQb).toBe(false);
    expect(result.starterContinuity).toBe(true);
    expect(result.priorYearPassAttemptShare).toBe(0.9);
  });

  it("detects a new starter by differing player id", () => {
    const result = computeQbContinuityFeatures(
      { playerId: "42", name: "A", passShare: 0.9 },
      { playerId: "99", name: "B", passShare: 0.7 },
    );
    expect(result.returningPrimaryQb).toBe(false);
    expect(result.newPrimaryQb).toBe(true);
  });
});
