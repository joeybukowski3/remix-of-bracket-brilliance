import { describe, expect, it } from "vitest";
import { validateThresholdWalkForward } from "./thresholdValidation";
import { THRESHOLD_HOLDOUT_SEASONS, THRESHOLD_TUNING_SEASONS } from "./config";

type Row = { season: number; edge: number; hit: boolean };

function makeRows(): Row[] {
  const rows: Row[] = [];
  // Tuning seasons: edge >= 3 hits 70% of the time (a real, strong pattern).
  for (const season of THRESHOLD_TUNING_SEASONS) {
    for (let i = 0; i < 50; i += 1) {
      rows.push({ season, edge: 3 + (i % 5), hit: i % 10 < 7 });
    }
  }
  // Holdout seasons: same pattern persists (so we can check it's correctly picked up, not leaked).
  for (const season of THRESHOLD_HOLDOUT_SEASONS) {
    for (let i = 0; i < 50; i += 1) {
      rows.push({ season, edge: 3 + (i % 5), hit: i % 10 < 7 });
    }
  }
  return rows;
}

describe("validateThresholdWalkForward", () => {
  it("selects a threshold using ONLY tuning-season rows", () => {
    const rows = makeRows();
    // Corrupt holdout-season data with the opposite pattern — if threshold selection leaked
    // into holdout, this would change which threshold gets selected.
    const corruptedHoldout = rows.map((r) =>
      (THRESHOLD_HOLDOUT_SEASONS as readonly number[]).includes(r.season) ? { ...r, hit: false } : r,
    );
    const clean = validateThresholdWalkForward(rows, [1, 2, 3, 4, 5], (r) => r.edge, (r) => r.hit);
    const corrupted = validateThresholdWalkForward(corruptedHoldout, [1, 2, 3, 4, 5], (r) => r.edge, (r) => r.hit);
    expect(clean.selectedThreshold).toBe(corrupted.selectedThreshold); // holdout corruption must not change tuning-based selection
  });

  it("evaluates the selected threshold on holdout rows only", () => {
    const rows = makeRows();
    const result = validateThresholdWalkForward(rows, [1, 2, 3, 4, 5], (r) => r.edge, (r) => r.hit);
    expect(result.selectedThreshold).not.toBeNull();
    expect(result.holdout.n).toBeGreaterThan(0);
    expect(result.holdout.hitRate).toBeCloseTo(0.7, 1);
  });

  it("returns a null selection when no candidate threshold clears the minimum sample size", () => {
    const sparseRows: Row[] = THRESHOLD_TUNING_SEASONS.flatMap((season) => [{ season, edge: 10, hit: true }]);
    const result = validateThresholdWalkForward(sparseRows, [10], (r) => r.edge, (r) => r.hit);
    expect(result.selectedThreshold).toBeNull();
  });
});
