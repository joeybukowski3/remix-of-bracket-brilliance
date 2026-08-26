import { describe, expect, it } from "vitest";
import { TEMPORAL_FOLDS, FROZEN_BENCHMARK_SEASON, FINAL_TRAIN_SEASONS, splitByFold, average } from "./temporalValidation";

describe("temporal validation folds", () => {
  it("no fold ever trains on or validates against the frozen benchmark season (2025)", () => {
    for (const fold of TEMPORAL_FOLDS) {
      expect(fold.trainSeasons).not.toContain(FROZEN_BENCHMARK_SEASON);
      expect(fold.validateSeason).not.toBe(FROZEN_BENCHMARK_SEASON);
    }
  });

  it("every fold's validate season is strictly after every one of its train seasons (rolling-origin, not shuffled)", () => {
    for (const fold of TEMPORAL_FOLDS) {
      for (const trainSeason of fold.trainSeasons) {
        expect(trainSeason).toBeLessThan(fold.validateSeason);
      }
    }
  });

  it("FINAL_TRAIN_SEASONS excludes the frozen benchmark season", () => {
    expect(FINAL_TRAIN_SEASONS).not.toContain(FROZEN_BENCHMARK_SEASON);
    expect(FINAL_TRAIN_SEASONS).toEqual([2022, 2023, 2024]);
  });

  it("splitByFold puts each row in exactly train, validate, or neither -- never both", () => {
    const rows = [{ season: 2022, id: "a" }, { season: 2023, id: "b" }, { season: 2024, id: "c" }, { season: 2025, id: "d" }];
    const fold = TEMPORAL_FOLDS[1]; // train [2022,2023], validate 2024
    const { train, validate } = splitByFold(rows, fold);
    expect(train.map((r) => r.id)).toEqual(["a", "b"]);
    expect(validate.map((r) => r.id)).toEqual(["c"]);
    // 2025 row is in neither.
    expect([...train, ...validate].some((r) => r.season === 2025)).toBe(false);
  });
});

describe("average", () => {
  it("ignores non-finite values", () => {
    expect(average([1, 2, 3])).toBe(2);
    expect(average([1, Infinity, 3])).toBe(2);
    expect(average([])).toBeNull();
  });
});
