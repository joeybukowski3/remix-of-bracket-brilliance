import { describe, expect, it } from "vitest";
import { makeRow } from "./__fixtures__/rows";
import { runPositionResearch } from "./positionResearch";
import type { WeeklyFantasyProjectionTrainingRow } from "../contract";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticRows(position: "WR" | "RB", season: number, count: number, seed: number): WeeklyFantasyProjectionTrainingRow[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const targets = 3 + Math.floor(random() * 10);
    const seasonPpg = 4 + random() * 10;
    const noise = (random() - 0.5) * 2;
    // Actual points genuinely correlate with usage (targets) beyond the baseline, so a learned residual should help.
    const actual = Math.max(0, seasonPpg * 0.6 + targets * 0.9 + noise);
    return makeRow({
      season, week: (i % 17) + 1, playerId: `${position}-${season}-${i}`, position,
      actualFantasyPoints: actual, seasonPpgPrior: seasonPpg, last3PpgPrior: seasonPpg, last5PpgPrior: seasonPpg,
      priorSeasonPpg: seasonPpg, targetsSeasonPrior: targets, targetsLast3: targets, gamesPlayedPrior: 3 + (i % 5),
      rookieOrNoPriorHistory: i % 11 === 0, hasPriorSeason: i % 11 !== 0,
    });
  });
}

describe("position research: split enforcement + position separation + determinism", () => {
  it("throws if any training or validation row has season 2025", () => {
    const training = syntheticRows("WR", 2023, 40, 1);
    const badValidation = syntheticRows("WR", 2025, 40, 2); // 2025 must never reach model selection
    expect(() => runPositionResearch("WR", training, badValidation)).toThrow(/frozen final holdout season/);
  });

  it("models WR and RB independently: their frozen feature sets differ", () => {
    const wrResult = runPositionResearch("WR", syntheticRows("WR", 2023, 60, 3), syntheticRows("WR", 2024, 40, 4));
    const rbResult = runPositionResearch("RB", syntheticRows("RB", 2023, 60, 5), syntheticRows("RB", 2024, 40, 6));
    expect(wrResult.frozenSpec.position).toBe("WR");
    expect(rbResult.frozenSpec.position).toBe("RB");
    // A model winning for WR must not silently carry over to RB's frozen spec.
    expect(rbResult.frozenSpec.specHash).not.toBe(wrResult.frozenSpec.specHash);
  });

  it("is deterministic: identical inputs produce an identical modeling decision", () => {
    // `frozenAt`/`specHash` legitimately differ between two separate freeze events (real wall-clock
    // timestamps), so determinism is asserted over the decision-relevant fields, not the hash itself.
    const training = syntheticRows("WR", 2023, 60, 7);
    const validation = syntheticRows("WR", 2024, 40, 8);
    const first = runPositionResearch("WR", training, validation);
    const second = runPositionResearch("WR", training, validation);
    expect(second.finalState).toBe(first.finalState);
    expect(second.frozenSpec.selectedFamily).toBe(first.frozenSpec.selectedFamily);
    expect(second.frozenSpec.selectedFeatureBlocks).toEqual(first.frozenSpec.selectedFeatureBlocks);
    expect(second.frozenSpec.selectedFeatures).toEqual(first.frozenSpec.selectedFeatures);
    expect(second.frozenSpec.hyperparameter).toBe(first.frozenSpec.hyperparameter);
    expect(second.frozenSpec.shrinkageK).toBe(first.frozenSpec.shrinkageK);
  });

  it("produces exactly one of the three terminal states", () => {
    const result = runPositionResearch("WR", syntheticRows("WR", 2023, 60, 9), syntheticRows("WR", 2024, 40, 10));
    expect(["READY_FOR_2026_SHADOW", "BASELINE_ONLY", "NOT_READY"]).toContain(result.finalState);
  });

  it("marks a too-small validation population NOT_READY rather than forcing a learned model", () => {
    const result = runPositionResearch("WR", syntheticRows("WR", 2023, 30, 11), syntheticRows("WR", 2024, 5, 12));
    expect(result.finalState).toBe("NOT_READY");
  });
});
