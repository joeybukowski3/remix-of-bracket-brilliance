import { describe, expect, it } from "vitest";
import { gradeKPropOutcome, inningsPitchedToDecimal, mergeTopKRecords } from "./mlb-top-k-tracking.mjs";

describe("gradeKPropOutcome", () => {
  it("OVER: actual > line is a WIN", () => {
    expect(gradeKPropOutcome("over", 3.5, 5)).toBe("WIN");
  });
  it("OVER: actual < line is a LOSS", () => {
    expect(gradeKPropOutcome("over", 3.5, 2)).toBe("LOSS");
  });
  it("OVER: actual == integer line is a PUSH", () => {
    expect(gradeKPropOutcome("over", 4, 4)).toBe("PUSH");
  });
  it("UNDER: actual < line is a WIN", () => {
    expect(gradeKPropOutcome("under", 3.5, 2)).toBe("WIN");
  });
  it("UNDER: actual > line is a LOSS", () => {
    expect(gradeKPropOutcome("under", 3.5, 6)).toBe("LOSS");
  });
  it("UNDER: actual == integer line is a PUSH", () => {
    expect(gradeKPropOutcome("under", 5, 5)).toBe("PUSH");
  });
  it("a half-integer line never produces a PUSH against a real (integer) strikeout count", () => {
    expect(gradeKPropOutcome("over", 3.5, 3)).toBe("LOSS");
    expect(gradeKPropOutcome("over", 3.5, 4)).toBe("WIN");
  });
});

describe("inningsPitchedToDecimal", () => {
  it("converts a third-inning fraction correctly", () => {
    expect(inningsPitchedToDecimal("6.1")).toBeCloseTo(6.33, 2);
    expect(inningsPitchedToDecimal("6.2")).toBeCloseTo(6.67, 2);
  });
  it("handles a whole-inning value", () => {
    expect(inningsPitchedToDecimal("7.0")).toBe(7);
  });
  it("returns null for missing input", () => {
    expect(inningsPitchedToDecimal(null)).toBeNull();
    expect(inningsPitchedToDecimal(undefined)).toBeNull();
  });
});

describe("mergeTopKRecords", () => {
  const baseRecord = (overrides = {}) => ({
    date: "2026-08-12", pitcherId: 1, gameId: 100, side: "over", slot: 1, resultStatus: "pending",
    ...overrides,
  });

  it("adds new records that don't exist yet", () => {
    const result = mergeTopKRecords({ records: [] }, [baseRecord()]);
    expect(result.records).toHaveLength(1);
  });

  it("does not duplicate a record with the same date+pitcherId+gameId+side on rerun", () => {
    const existing = { records: [baseRecord()] };
    const result = mergeTopKRecords(existing, [baseRecord({ slot: 2 })]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].slot).toBe(2); // still-pending record gets refreshed, not duplicated
  });

  it("never overwrites an already-graded record", () => {
    const existing = { records: [baseRecord({ resultStatus: "final", result: "WIN" })] };
    const result = mergeTopKRecords(existing, [baseRecord({ resultStatus: "pending", result: null })]);
    expect(result.records[0].resultStatus).toBe("final");
    expect(result.records[0].result).toBe("WIN");
  });
});
