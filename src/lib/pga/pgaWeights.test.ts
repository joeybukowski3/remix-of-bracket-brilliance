import { afterEach, describe, expect, it } from "vitest";
import type { PgaPresetDefinition } from "@/lib/pga/tournamentConfig";
import type { PgaWeights } from "@/lib/pga/pgaTypes";
import {
  PGA_CUSTOM_MODEL_KEY,
  PGA_TOP_20_PROFILE_KEY,
  PGA_TOP_20_PROFILE_WEIGHTS,
  PGA_WEIGHT_KEYS,
  getPgaCustomWeightsStorageKey,
  getStoredPgaActivePreset,
  getStoredPgaCustomWeights,
  getWeightsForPreset,
  normalizePgaWeightsToPercent,
  sanitizePgaWeights,
  storePgaActivePreset,
  storePgaCustomWeights,
  withPermanentPgaPresets,
} from "./pgaWeights";

const defaultWeights: PgaWeights = {
  sgApproach: 22,
  par4: 14,
  drivingAccuracy: 11,
  bogeyAvoidance: 11,
  sgAroundGreen: 9,
  trendRank: 11,
  birdie125150: 7,
  sgPutting: 6,
  birdieUnder125: 3,
  courseTrueSg: 6,
};

const existingPresets: PgaPresetDefinition[] = [{
  key: "balanced",
  label: "Balanced",
  description: "Existing default",
  weights: defaultWeights,
}];

afterEach(() => {
  window.localStorage.clear();
});

describe("PGA model presets and custom weights", () => {
  it("adds Top 20 Profile to the preset list", () => {
    const presets = withPermanentPgaPresets(existingPresets);
    expect(presets.map((preset) => preset.label)).toContain("Top 20 Profile");
    expect(presets.find((preset) => preset.key === PGA_TOP_20_PROFILE_KEY)?.description).toBe("High-floor placement profile");
  });

  it("keeps Top 20 Profile at exactly 100 percent", () => {
    expect(Object.values(PGA_TOP_20_PROFILE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it("uses only registered existing model categories", () => {
    expect(Object.keys(PGA_TOP_20_PROFILE_WEIGHTS).sort()).toEqual([...PGA_WEIGHT_KEYS].sort());
  });

  it("accepts finite non-negative custom weights and rejects invalid values", () => {
    expect(sanitizePgaWeights({ ...defaultWeights, trendRank: 20 }, defaultWeights)?.trendRank).toBe(20);
    expect(sanitizePgaWeights({ ...defaultWeights, trendRank: -1 }, defaultWeights)).toBeNull();
    expect(sanitizePgaWeights({ ...defaultWeights, trendRank: Number.NaN }, defaultWeights)).toBeNull();
    expect(sanitizePgaWeights({ ...defaultWeights, trendRank: "20" }, defaultWeights)).toBeNull();
  });

  it("normalizes valid custom weights to exactly 100 percent", () => {
    const normalized = normalizePgaWeightsToPercent({ ...defaultWeights, trendRank: 31 });
    expect(normalized).not.toBeNull();
    expect(Object.values(normalized!).reduce((sum, weight) => sum + weight, 0)).toBe(100);
    expect(normalizePgaWeightsToPercent(Object.fromEntries(PGA_WEIGHT_KEYS.map((key) => [key, 0])) as PgaWeights)).toBeNull();
  });

  it("does not mutate existing preset definitions or permanent preset weights", () => {
    const original = structuredClone(existingPresets);
    const presets = withPermanentPgaPresets(existingPresets);
    presets[0].weights.sgApproach = 1;
    presets.at(-1)!.weights.trendRank = 1;

    expect(existingPresets).toEqual(original);
    expect(PGA_TOP_20_PROFILE_WEIGHTS.trendRank).toBe(18);
  });

  it("loads Top 20 into an independent custom copy and resets from the unchanged default", () => {
    const presets = withPermanentPgaPresets(existingPresets);
    const loadedTop20 = getWeightsForPreset(presets, PGA_TOP_20_PROFILE_KEY);
    const resetWeights = getWeightsForPreset(presets, "balanced");

    expect(loadedTop20).toEqual(PGA_TOP_20_PROFILE_WEIGHTS);
    expect(resetWeights).toEqual(defaultWeights);
    loadedTop20.trendRank = 0;
    resetWeights.sgApproach = 0;
    expect(PGA_TOP_20_PROFILE_WEIGHTS.trendRank).toBe(18);
    expect(existingPresets[0].weights.sgApproach).toBe(22);
  });

  it("persists custom weights under a versioned tournament key", () => {
    expect(storePgaCustomWeights("the-open", defaultWeights)).toBe(true);
    expect(getPgaCustomWeightsStorageKey("the-open")).toContain(":v1");
    expect(getStoredPgaCustomWeights("the-open", PGA_TOP_20_PROFILE_WEIGHTS as PgaWeights)).toEqual(defaultWeights);
  });

  it("ignores unknown stored categories and fills newly registered categories from defaults", () => {
    window.localStorage.setItem(getPgaCustomWeightsStorageKey("the-open"), JSON.stringify({
      version: 1,
      weights: {
        sgApproach: 30,
        removedMetric: 999,
      },
    }));

    const restored = getStoredPgaCustomWeights("the-open", defaultWeights);
    expect(restored.sgApproach).toBe(30);
    expect(restored.trendRank).toBe(defaultWeights.trendRank);
    expect(restored).not.toHaveProperty("removedMetric");
  });

  it("falls back safely for corrupt, invalid, or different-version custom storage", () => {
    const key = getPgaCustomWeightsStorageKey("the-open");
    window.localStorage.setItem(key, "not-json");
    expect(getStoredPgaCustomWeights("the-open", defaultWeights)).toEqual(defaultWeights);

    window.localStorage.setItem(key, JSON.stringify({ version: 1, weights: { trendRank: -10 } }));
    expect(getStoredPgaCustomWeights("the-open", defaultWeights)).toEqual(defaultWeights);

    window.localStorage.setItem(key, JSON.stringify({ version: 2, weights: PGA_TOP_20_PROFILE_WEIGHTS }));
    expect(getStoredPgaCustomWeights("the-open", defaultWeights)).toEqual(defaultWeights);
  });

  it("restores Custom Model only when custom selection is explicitly allowed", () => {
    storePgaActivePreset("the-open", PGA_CUSTOM_MODEL_KEY);
    expect(getStoredPgaActivePreset("the-open", existingPresets)).toBeNull();
    expect(getStoredPgaActivePreset("the-open", existingPresets, true)).toBe(PGA_CUSTOM_MODEL_KEY);
  });
});
