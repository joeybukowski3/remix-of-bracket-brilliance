import { describe, expect, it } from "vitest";
import { classifyMiss } from "./missCategories";
import { MISS_ERROR_THRESHOLD_POINTS } from "./config";

describe("classifyMiss", () => {
  it("MODEL_GOOD_MARKET_GOOD when both errors are below threshold", () => {
    expect(classifyMiss(1, 2)).toBe("MODEL_GOOD_MARKET_GOOD");
  });
  it("MODEL_GOOD_MARKET_BAD when only market misses", () => {
    expect(classifyMiss(1, MISS_ERROR_THRESHOLD_POINTS + 5)).toBe("MODEL_GOOD_MARKET_BAD");
  });
  it("MODEL_BAD_MARKET_GOOD when only model misses", () => {
    expect(classifyMiss(MISS_ERROR_THRESHOLD_POINTS + 5, 1)).toBe("MODEL_BAD_MARKET_GOOD");
  });
  it("MODEL_BAD_MARKET_BAD when both miss", () => {
    expect(classifyMiss(MISS_ERROR_THRESHOLD_POINTS + 5, MISS_ERROR_THRESHOLD_POINTS + 5)).toBe("MODEL_BAD_MARKET_BAD");
  });
  it("is deterministic at the exact threshold boundary (boundary itself counts as NOT good)", () => {
    expect(classifyMiss(MISS_ERROR_THRESHOLD_POINTS, 0)).toBe("MODEL_BAD_MARKET_GOOD");
  });
});
