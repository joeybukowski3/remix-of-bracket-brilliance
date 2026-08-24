import { describe, expect, it } from "vitest";
import { computeGarbageTimeWeight } from "./garbageTimePolicy";

describe("NONE policy — control", () => {
  it("always weights 1 regardless of margin or quarter", () => {
    expect(computeGarbageTimeWeight({ offenseScore: 70, defenseScore: 0, period: 4 }, "NONE")).toBe(1);
    expect(computeGarbageTimeWeight({ offenseScore: 0, defenseScore: 0, period: 1 }, "NONE")).toBe(1);
  });
});

describe("SCORE_QUARTER policy", () => {
  it("never excludes Q1 regardless of margin", () => {
    expect(computeGarbageTimeWeight({ offenseScore: 60, defenseScore: 0, period: 1 }, "SCORE_QUARTER")).toBe(1);
  });

  it("excludes Q4 when margin exceeds 28", () => {
    expect(computeGarbageTimeWeight({ offenseScore: 40, defenseScore: 10, period: 4 }, "SCORE_QUARTER")).toBe(0);
  });

  it("includes Q4 when margin is within 28", () => {
    expect(computeGarbageTimeWeight({ offenseScore: 24, defenseScore: 0, period: 4 }, "SCORE_QUARTER")).toBe(1);
  });

  it("uses distinct thresholds for Q2 (45) and Q3 (35)", () => {
    expect(computeGarbageTimeWeight({ offenseScore: 40, defenseScore: 0, period: 2 }, "SCORE_QUARTER")).toBe(1);
    expect(computeGarbageTimeWeight({ offenseScore: 40, defenseScore: 0, period: 3 }, "SCORE_QUARTER")).toBe(0);
  });

  it("never excludes overtime (period >= 5)", () => {
    expect(computeGarbageTimeWeight({ offenseScore: 50, defenseScore: 0, period: 5 }, "SCORE_QUARTER")).toBe(1);
  });

  it("does not fabricate exclusion when score state is unknown", () => {
    expect(
      computeGarbageTimeWeight({ offenseScore: null, defenseScore: null, period: 4 }, "SCORE_QUARTER"),
    ).toBe(1);
  });
});

describe("SOFT_WEIGHT policy", () => {
  it("weights 1 below the ramp start margin (21)", () => {
    expect(computeGarbageTimeWeight({ offenseScore: 20, defenseScore: 0, period: 3 }, "SOFT_WEIGHT")).toBe(1);
  });

  it("weights the floor (0.1) at or above the ramp end margin (45)", () => {
    expect(computeGarbageTimeWeight({ offenseScore: 50, defenseScore: 0, period: 4 }, "SOFT_WEIGHT")).toBe(0.1);
  });

  it("interpolates linearly between the ramp bounds", () => {
    // margin 33 is exactly halfway between 21 and 45 -> weight halfway between 1 and 0.1
    const weight = computeGarbageTimeWeight({ offenseScore: 33, defenseScore: 0, period: 3 }, "SOFT_WEIGHT");
    expect(weight).toBeCloseTo(0.55, 5);
  });

  it("is not period-dependent (unlike SCORE_QUARTER)", () => {
    const q1 = computeGarbageTimeWeight({ offenseScore: 50, defenseScore: 0, period: 1 }, "SOFT_WEIGHT");
    const q4 = computeGarbageTimeWeight({ offenseScore: 50, defenseScore: 0, period: 4 }, "SOFT_WEIGHT");
    expect(q1).toBe(q4);
  });
});
