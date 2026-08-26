import { describe, expect, it } from "vitest";
import {
  buildDimensionReference,
  buildGroupedDimensionReferences,
  combineDimensionScores,
  empiricalPercentile,
  enumerateSimpleWeights,
  scoreDimension,
  assertSelectionExcludesSeason,
} from "./matchupScore";

type Row = { pregame: number | null; actualYards: number };
const indicator = [{ key: "pregame", direction: "higherIsBetter" as const, value: (row: Row) => row.pregame }];

describe("matchup score normalization", () => {
  it("is deterministic, bounded, and centered on the historical reference", () => {
    const rows: Row[] = [10, 20, 30, 40].map((pregame) => ({ pregame, actualYards: pregame * 2 }));
    const reference = buildDimensionReference("environment", rows, indicator);
    const first = scoreDimension({ pregame: 25, actualYards: 999 }, indicator, reference);
    const second = scoreDimension({ pregame: 25, actualYards: -999 }, indicator, reference);
    expect(first).toEqual(second);
    expect(first.score).toBe(50);
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(100);
  });

  it("uses only the supplied historical reference distribution", () => {
    const training: Row[] = [1, 2, 3].map((pregame) => ({ pregame, actualYards: 0 }));
    const future: Row = { pregame: 1000, actualYards: 0 };
    const before = buildDimensionReference("environment", training, indicator);
    scoreDimension(future, indicator, before);
    const after = buildDimensionReference("environment", training, indicator);
    expect(after).toEqual(before);
  });

  it("rejects the frozen 2025 season from weight-selection inputs", () => {
    expect(() => assertSelectionExcludesSeason([{ season: 2022 }, { season: 2024 }], 2025)).not.toThrow();
    expect(() => assertSelectionExcludesSeason([{ season: 2024 }, { season: 2025 }], 2025)).toThrow(/exclude frozen season 2025/);
  });

  it("does not read a target game's actual yards", () => {
    const training: Row[] = [1, 2, 3].map((pregame) => ({ pregame, actualYards: pregame }));
    const reference = buildDimensionReference("environment", training, indicator);
    expect(scoreDimension({ pregame: 2, actualYards: 0 }, indicator, reference))
      .toEqual(scoreDimension({ pregame: 2, actualYards: 500 }, indicator, reference));
  });

  it("handles lower-is-better direction and missing values", () => {
    const reference = { key: "difficulty", direction: "lowerIsBetter" as const, sortedValues: [1, 2, 3, 4] };
    expect(empiricalPercentile(1, reference)).toBeGreaterThan(empiricalPercentile(4, reference));
    expect(empiricalPercentile(null, reference)).toBe(50);
  });

  it("combines market-specific dimensions without accepting projection fields", () => {
    expect(combineDimensionScores({ workload: 90, opponent: 50 }, { workload: 0.4, opponent: 0.6 }).score).toBe(66);
  });

  it("enumerates transparent weights with an opportunity cap", () => {
    const weights = enumerateSimpleWeights(["opportunity", "opponent", "game"], 0.1, {
      maxByKey: { opportunity: 0.5 }, minWeight: 0.1,
    });
    expect(weights.length).toBeGreaterThan(0);
    expect(weights.every((row) => row.opportunity <= 0.5 && Math.abs(Object.values(row).reduce((a, b) => a + b, 0) - 1) < 1e-9)).toBe(true);
  });

  it("supports position-relative receiving normalization on one common percentile scale", () => {
    type PositionRow = Row & { position: "RB" | "WR" };
    const rows: PositionRow[] = [
      { position: "RB", pregame: 2, actualYards: 0 }, { position: "RB", pregame: 4, actualYards: 0 },
      { position: "WR", pregame: 20, actualYards: 0 }, { position: "WR", pregame: 40, actualYards: 0 },
    ];
    const definitions = [{ key: "pregame", direction: "higherIsBetter" as const, value: (row: PositionRow) => row.pregame }];
    const references = buildGroupedDimensionReferences("receivingOpportunity", rows, definitions, (row) => row.position);
    expect(scoreDimension(rows[1], definitions, references.RB).score).toBe(75);
    expect(scoreDimension(rows[3], definitions, references.WR).score).toBe(75);
  });
});
