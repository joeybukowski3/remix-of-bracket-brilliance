import { describe, expect, it } from "vitest";
import { makeRow } from "./__fixtures__/rows";
import { runPositionResearch } from "./positionResearch";
import { runHoldoutEvaluation } from "./holdout";
import type { WeeklyFantasyProjectionTrainingRow } from "../contract";
import type { FantasyPosition } from "@/lib/fantasy/rankings";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticRows(position: FantasyPosition, season: number, count: number, seed: number): WeeklyFantasyProjectionTrainingRow[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const targets = 3 + Math.floor(random() * 10);
    const seasonPpg = 4 + random() * 10;
    const actual = Math.max(0, seasonPpg * 0.6 + targets * 0.9 + (random() - 0.5) * 2);
    return makeRow({
      season, week: (i % 17) + 1, playerId: `${position}-${season}-${i}`, position,
      actualFantasyPoints: actual, seasonPpgPrior: seasonPpg, last3PpgPrior: seasonPpg, last5PpgPrior: seasonPpg,
      priorSeasonPpg: seasonPpg, targetsSeasonPrior: targets, targetsLast3: targets, gamesPlayedPrior: 3 + (i % 5),
    });
  });
}

describe("holdout gate: 2025 unlocked only after every position is frozen", () => {
  it("refuses to run if a required position has no frozen spec", () => {
    const wrResult = runPositionResearch("WR", syntheticRows("WR", 2023, 60, 1), syntheticRows("WR", 2024, 40, 2));
    expect(() =>
      runHoldoutEvaluation([wrResult.frozenSpec], ["WR", "RB"], syntheticRows("WR", 2023, 60, 1), syntheticRows("WR", 2024, 40, 2), syntheticRows("WR", 2025, 40, 3)),
    ).toThrow(/missing frozen specs/i);
  });

  it("refuses a holdout row that is not season 2025", () => {
    const wrResult = runPositionResearch("WR", syntheticRows("WR", 2023, 60, 1), syntheticRows("WR", 2024, 40, 2));
    const notHoldout = syntheticRows("WR", 2024, 5, 9); // wrong season smuggled into the "holdout" argument
    expect(() =>
      runHoldoutEvaluation([wrResult.frozenSpec], ["WR"], syntheticRows("WR", 2023, 60, 1), syntheticRows("WR", 2024, 40, 2), notHoldout),
    ).toThrow(/non-2025 row/);
  });

  it("evaluates exactly once and produces finite, position-scoped metrics when every position is frozen", () => {
    const training = syntheticRows("WR", 2023, 60, 1);
    const validation = syntheticRows("WR", 2024, 40, 2);
    const holdoutRows = syntheticRows("WR", 2025, 40, 3);
    const wrResult = runPositionResearch("WR", training, validation);
    const results = runHoldoutEvaluation([wrResult.frozenSpec], ["WR"], training, validation, holdoutRows);
    expect(results).toHaveLength(1);
    expect(results[0].position).toBe("WR");
    expect(results[0].overall.rows).toBe(holdoutRows.length);
  });
});
