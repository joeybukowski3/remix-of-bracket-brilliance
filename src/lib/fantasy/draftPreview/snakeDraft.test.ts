import { describe, expect, it } from "vitest";
import {
  computeSnakeDraftSlotPicks,
  computeSnakeOverallPick,
  roundsToCoverRowCount,
} from "@/lib/fantasy/draftPreview/snakeDraft";

describe("computeSnakeOverallPick", () => {
  it("matches the approved slot-10 picks for rounds 1-10", () => {
    const expected = [10, 15, 34, 39, 58, 63, 82, 87, 106, 111];
    const actual = expected.map((_, index) => computeSnakeOverallPick(index + 1, 10));
    expect(actual).toEqual(expected);
  });

  it("slot 1 always picks first in odd rounds and last in even rounds", () => {
    expect(computeSnakeOverallPick(1, 1)).toBe(1);
    expect(computeSnakeOverallPick(2, 1)).toBe(24);
    expect(computeSnakeOverallPick(3, 1)).toBe(25);
    expect(computeSnakeOverallPick(4, 1)).toBe(48);
  });

  it("slot 12 always picks last in odd rounds and first in even rounds", () => {
    expect(computeSnakeOverallPick(1, 12)).toBe(12);
    expect(computeSnakeOverallPick(2, 12)).toBe(13);
    expect(computeSnakeOverallPick(3, 12)).toBe(36);
    expect(computeSnakeOverallPick(4, 12)).toBe(37);
  });

  it("rejects an out-of-range slot", () => {
    expect(() => computeSnakeOverallPick(1, 0)).toThrow();
    expect(() => computeSnakeOverallPick(1, 13)).toThrow();
  });

  it("rejects a non-positive round", () => {
    expect(() => computeSnakeOverallPick(0, 1)).toThrow();
  });
});

describe("computeSnakeDraftSlotPicks", () => {
  it("returns the round-ordered overall pick for every round through roundCount", () => {
    const picks = computeSnakeDraftSlotPicks(10, 10);
    expect(picks.map((pick) => pick.overallPick)).toEqual([10, 15, 34, 39, 58, 63, 82, 87, 106, 111]);
    expect(picks.map((pick) => pick.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("roundsToCoverRowCount", () => {
  it("covers the 267-row Draft Preview board with 23 rounds", () => {
    expect(roundsToCoverRowCount(267)).toBe(23);
    expect(23 * 12).toBeGreaterThanOrEqual(267);
    expect(22 * 12).toBeLessThan(267);
  });
});
