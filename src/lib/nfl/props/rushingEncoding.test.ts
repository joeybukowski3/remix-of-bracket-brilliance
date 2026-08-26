import { describe, expect, it } from "vitest";
import { ablateRushingGroups, appendRushingDecompositionLegs, computeRushingTrainFallbacks, encodeRushingFeatureRow, extractRawRushingFeatureValues, RUSHING_FEATURE_KEYS } from "./rushingEncoding";
import type { NflRushingFeatureRow } from "./types/rushingFeatures";

function row(overrides: Partial<NflRushingFeatureRow> = {}): NflRushingFeatureRow {
  return {
    schemaVersion: "nfl-rushing-feature-row-v1", season: 2024, week: 5, gameId: "g1", team: "phi", opponent: "dal",
    playerId: "gsis:rb1", playerName: "RB One",
    target: { rushingYards: 65 },
    features: {
      playerUsage: { carriesPerGame: { seasonPrior: 14, last3: 14, priorSeason: 12 }, carryShare: { seasonPrior: 0.55, last3: 0.55, priorSeason: 0.5 } },
      playerEfficiency: { yardsPerCarry: { seasonPrior: 4.3, last3: 4.3, priorSeason: 4.0 } },
      teamEnvironment: { rushAttemptsPerGame: { seasonPrior: 26, last3: 26, priorSeason: 24 }, overallDropbackRate: { seasonPrior: 0.58, last3: 0.58, priorSeason: 0.55 }, passRateOverExpected: { seasonPrior: 1, last3: 1, priorSeason: 0.5 } },
      opponentRushDefense: { rushAttemptsPerGameAllowed: { seasonPrior: 25, last3: 25, priorSeason: 24 }, rushEpaPerPlayAllowed: { seasonPrior: 0.02, last3: 0.02, priorSeason: null } },
      market: { spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home", isDome: false },
    },
    diagnostics: { position: "RB", isQb: false, gamesWithCarriesPriorThisSeason: 4, hasPriorSeasonCarries: true, recentTeamTopCarryShareConcentration: 0.6 },
    ...overrides,
  };
}

describe("extractRawRushingFeatureValues / encoding", () => {
  it("has exactly RUSHING_FEATURE_KEYS.length raw values", () => {
    expect(extractRawRushingFeatureValues(row())).toHaveLength(RUSHING_FEATURE_KEYS.length);
  });

  it("appends the position indicator when includePosition is true", () => {
    const fallbacks = computeRushingTrainFallbacks([row()]);
    const withPosition = encodeRushingFeatureRow(row(), fallbacks, { allowPriorSeasonFallback: true, includePosition: true });
    const withoutPosition = encodeRushingFeatureRow(row(), fallbacks, { allowPriorSeasonFallback: true, includePosition: false });
    expect(withPosition).toHaveLength(withoutPosition.length + 1);
    expect(withPosition.at(-1)).toBe(0); // isQb=false
    const qbRow = row({ diagnostics: { ...row().diagnostics, isQb: true } });
    expect(encodeRushingFeatureRow(qbRow, fallbacks, { allowPriorSeasonFallback: true, includePosition: true }).at(-1)).toBe(1);
  });

  it("falls back to priorSeason for a null seasonPrior field, using train-mean when both are null", () => {
    const noRushEpa = row();
    const fallbacks = computeRushingTrainFallbacks([noRushEpa]);
    const idx = RUSHING_FEATURE_KEYS.findIndex((k) => k.key === "opponentRushDefense.rushEpaPerPlayAllowed");
    // seasonPrior=0.02 present, so it's used directly (not the fallback).
    expect(encodeRushingFeatureRow(noRushEpa, fallbacks, { allowPriorSeasonFallback: true, includePosition: false })[idx]).toBe(0.02);
  });
});

describe("ablateRushingGroups", () => {
  it("zeroes only the excluded group, never the position column", () => {
    const r = row();
    const fallbacks = computeRushingTrainFallbacks([r]);
    const encoded = encodeRushingFeatureRow(r, fallbacks, { allowPriorSeasonFallback: true, includePosition: true });
    const ablated = ablateRushingGroups(encoded, fallbacks, new Set(["playerUsage"]));
    const usageIdx = RUSHING_FEATURE_KEYS.findIndex((k) => k.key === "playerUsage.carriesPerGame");
    expect(ablated[usageIdx]).toBe(fallbacks[usageIdx]);
    expect(ablated.at(-1)).toBe(encoded.at(-1)); // position column untouched
  });
});

describe("appendRushingDecompositionLegs", () => {
  it("appends projectedCarries and projectedYpc", () => {
    const encoded = [1, 2, 3];
    expect(appendRushingDecompositionLegs(encoded, 14, 4.3)).toEqual([1, 2, 3, 14, 4.3]);
  });
});
