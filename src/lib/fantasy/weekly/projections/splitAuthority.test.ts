import { describe, expect, it } from "vitest";
import {
  assertNotModelSelectionSeason,
  FINAL_HOLDOUT_SEASON,
  FINAL_HOLDOUT_SEASONS,
  isFinalHoldoutSeason,
  MODEL_SELECTION_ALLOWED_SEASONS,
  MODEL_SELECTION_SEASON,
  TRAINING_SEASON,
} from "./splitAuthority";

describe("split authority", () => {
  it("freezes 2023 training and 2024 model-selection as the only model-selection-allowed seasons", () => {
    expect(TRAINING_SEASON).toBe(2023);
    expect(MODEL_SELECTION_SEASON).toBe(2024);
    expect(MODEL_SELECTION_ALLOWED_SEASONS).toEqual([2023, 2024]);
  });

  it("excludes 2025 from the model-selection-allowed set", () => {
    expect(FINAL_HOLDOUT_SEASON).toBe(2025);
    expect(MODEL_SELECTION_ALLOWED_SEASONS).not.toContain(2025);
    expect(FINAL_HOLDOUT_SEASONS).toEqual([2025]);
  });

  it("does not throw for 2023 or 2024", () => {
    expect(() => assertNotModelSelectionSeason(2023)).not.toThrow();
    expect(() => assertNotModelSelectionSeason(2024)).not.toThrow();
  });

  it("throws for 2025 specifically, with a message naming it as the frozen holdout", () => {
    expect(() => assertNotModelSelectionSeason(2025)).toThrow(/final holdout/i);
  });

  it("throws for any other unrecognized season", () => {
    expect(() => assertNotModelSelectionSeason(2022)).toThrow();
    expect(() => assertNotModelSelectionSeason(2026)).toThrow();
  });

  it("isFinalHoldoutSeason is true only for 2025", () => {
    expect(isFinalHoldoutSeason(2025)).toBe(true);
    expect(isFinalHoldoutSeason(2023)).toBe(false);
    expect(isFinalHoldoutSeason(2024)).toBe(false);
  });
});
