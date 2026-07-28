import { describe, expect, test } from "vitest";
import {
  buildFieldStrengthMap,
  computeFieldProbabilities,
  computeFinishProbabilities,
  deriveFieldStrength,
} from "./pga-probability-model.mjs";

function buildRows(count) {
  return Array.from({ length: count }, (_, i) => ({ playerKey: `player-${i + 1}`, rank: i + 1 }));
}

describe("deriveFieldStrength", () => {
  test("lower rank always yields strictly higher strength", () => {
    expect(deriveFieldStrength(1)).toBeGreaterThan(deriveFieldStrength(2));
    expect(deriveFieldStrength(2)).toBeGreaterThan(deriveFieldStrength(50));
  });

  test("rejects invalid rank", () => {
    expect(deriveFieldStrength(0)).toBeNull();
    expect(deriveFieldStrength(-1)).toBeNull();
    expect(deriveFieldStrength(NaN)).toBeNull();
    expect(deriveFieldStrength(undefined)).toBeNull();
  });

  test("always positive and finite for valid rank", () => {
    for (const rank of [1, 5, 50, 200]) {
      const strength = deriveFieldStrength(rank);
      expect(Number.isFinite(strength)).toBe(true);
      expect(strength).toBeGreaterThan(0);
    }
  });
});

describe("computeFieldProbabilities", () => {
  test("all probabilities in [0,1], no NaN or Infinity, across a realistic field size", () => {
    const rows = buildRows(150);
    const result = computeFieldProbabilities(rows);
    for (const key of Object.keys(result)) {
      for (const market of ["win", "top5", "top10", "top20"]) {
        const p = result[key][market];
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });

  test("monotonic finish probabilities: win <= top5 <= top10 <= top20 for every player", () => {
    const rows = buildRows(80);
    const result = computeFieldProbabilities(rows);
    for (const key of Object.keys(result)) {
      const { win, top5, top10, top20 } = result[key];
      expect(win).toBeLessThanOrEqual(top5 + 1e-9);
      expect(top5).toBeLessThanOrEqual(top10 + 1e-9);
      expect(top10).toBeLessThanOrEqual(top20 + 1e-9);
    }
  });

  test("stronger model rank cannot produce a lower probability than a weaker rank, all else equal", () => {
    const rows = buildRows(100);
    const result = computeFieldProbabilities(rows);
    for (let i = 1; i < 99; i++) {
      const better = result[`player-${i}`];
      const worse = result[`player-${i + 1}`];
      expect(better.win).toBeGreaterThanOrEqual(worse.win - 1e-9);
      expect(better.top20).toBeGreaterThanOrEqual(worse.top20 - 1e-9);
    }
  });

  test("field-size sensitivity: the same player's top20 probability is higher in a smaller field", () => {
    const smallField = buildRows(25);
    const largeField = buildRows(150);
    const smallResult = computeFieldProbabilities(smallField)["player-10"];
    const largeResult = computeFieldProbabilities(largeField)["player-10"];
    expect(smallResult.top20).toBeGreaterThan(largeResult.top20);
  });

  test("deterministic repeated execution: identical input produces byte-identical output", () => {
    const rows = buildRows(60);
    const a = JSON.stringify(computeFieldProbabilities(rows));
    const b = JSON.stringify(computeFieldProbabilities(rows));
    expect(a).toBe(b);
  });

  test("input shuffle invariance: row order does not change any player's probabilities beyond floating-point convolution-order noise", () => {
    const rows = buildRows(60);
    const shuffled = [...rows].reverse();
    const original = computeFieldProbabilities(rows);
    const reordered = computeFieldProbabilities(shuffled);
    for (const key of Object.keys(original)) {
      for (const market of ["win", "top5", "top10", "top20"]) {
        expect(reordered[key][market]).toBeCloseTo(original[key][market], 9);
      }
    }
  });

  test("drops rows with invalid rank rather than defaulting them into the field", () => {
    const rows = [...buildRows(5), { playerKey: "bad-rank", rank: null }, { playerKey: "no-key", rank: 6 }];
    const result = computeFieldProbabilities(rows);
    expect(result["bad-rank"]).toBeUndefined();
  });

  test("a player absent from the strength map returns all-zero probabilities rather than throwing", () => {
    const map = buildFieldStrengthMap(buildRows(10));
    const result = computeFinishProbabilities(map, "nonexistent-player");
    expect(result).toEqual({ win: 0, top5: 0, top10: 0, top20: 0 });
  });

  test("single-player field: certainty of finishing top of every market", () => {
    const result = computeFieldProbabilities([{ playerKey: "solo", rank: 1 }]);
    expect(result.solo.win).toBeCloseTo(1, 9);
    expect(result.solo.top20).toBeCloseTo(1, 9);
  });
});
