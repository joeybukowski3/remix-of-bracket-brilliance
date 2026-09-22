import { describe, it, expect } from "vitest";
import { PERCENTILE_TIERS } from "@/lib/shared/jkbHeat";
import { MATRIX_RANK_TIERS, getMatrixRankTier, matrixCellStyle, MATRIX_RANK_TIER_UNKNOWN } from "@/lib/nfl/matchupMatrixRankTier";

describe("matchupMatrixRankTier", () => {
  it("maps each of the 8 rank buckets to the exact canonical JKB tier style, in best-to-worst order", () => {
    expect(MATRIX_RANK_TIERS.map((t) => t.style)).toEqual(PERCENTILE_TIERS.map((t) => t.style));
  });

  it("keeps the matrix's own bucket bounds and labels, distinct from the JKB tier labels", () => {
    expect(MATRIX_RANK_TIERS.map((t) => [t.label, t.min, t.max])).toEqual([
      ["Elite", 1, 4],
      ["Excellent", 5, 8],
      ["Good", 9, 12],
      ["Above Average", 13, 16],
      ["Below Average", 17, 20],
      ["Weak", 21, 24],
      ["Poor", 25, 28],
      ["Very Poor", 29, 32],
    ]);
  });

  it("resolves rank 1 to the elite gold style and rank 32 to the poor style", () => {
    expect(matrixCellStyle(1)).toEqual(PERCENTILE_TIERS.find((t) => t.id === "elite")!.style);
    expect(matrixCellStyle(32)).toEqual(PERCENTILE_TIERS.find((t) => t.id === "poor")!.style);
  });

  it("resolves a missing or out-of-range rank to the neutral unknown style, never a fabricated tier", () => {
    expect(matrixCellStyle(null)).toEqual(MATRIX_RANK_TIER_UNKNOWN);
    expect(matrixCellStyle(undefined)).toEqual(MATRIX_RANK_TIER_UNKNOWN);
    expect(matrixCellStyle(0)).toEqual(MATRIX_RANK_TIER_UNKNOWN);
    expect(matrixCellStyle(33)).toEqual(MATRIX_RANK_TIER_UNKNOWN);
    expect(getMatrixRankTier(0)).toBeNull();
  });
});
