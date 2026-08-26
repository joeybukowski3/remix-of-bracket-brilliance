import { describe, expect, it } from "vitest";
import { splitByTime } from "./nfl-research-time-split.mjs";

describe("splitByTime", () => {
  it("routes rows to development or validation strictly by season", () => {
    const rows = [{ id: 1, season: 2023 }, { id: 2, season: 2024 }, { id: 3, season: 2025 }];
    const { development, validation } = splitByTime(rows, { developmentSeasons: [2023, 2024], validationSeasons: [2025] });
    expect(development.map((r) => r.id)).toEqual([1, 2]);
    expect(validation.map((r) => r.id)).toEqual([3]);
  });

  it("counts rows outside both season sets as excluded, never silently dropped or misclassified", () => {
    const rows = [{ id: 1, season: 2022 }, { id: 2, season: 2025 }];
    const { validation, excludedCount } = splitByTime(rows, { developmentSeasons: [2023, 2024], validationSeasons: [2025] });
    expect(validation.map((r) => r.id)).toEqual([2]);
    expect(excludedCount).toBe(1);
  });
});
