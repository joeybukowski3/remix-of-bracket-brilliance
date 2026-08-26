import { describe, expect, it } from "vitest";
import { ablateGroups, coalesceWindow, computeTrainFallbacks, encodeFeatureRow, extractRawFeatureValues, FEATURE_KEYS } from "./qbOpportunityEncoding";
import type { NflQbOpportunityFeatureRow } from "./types/qbOpportunityFeatures";

describe("coalesceWindow", () => {
  it("prefers seasonPrior, then priorSeason, then null", () => {
    expect(coalesceWindow({ seasonPrior: 5, priorSeason: 10 })).toBe(5);
    expect(coalesceWindow({ seasonPrior: null, priorSeason: 10 })).toBe(10);
    expect(coalesceWindow({ seasonPrior: null, priorSeason: null })).toBeNull();
    expect(coalesceWindow(null)).toBeNull();
  });
});

function row(overrides: Partial<NflQbOpportunityFeatureRow> = {}): NflQbOpportunityFeatureRow {
  return {
    schemaVersion: "nfl-qb-opportunity-feature-row-v1",
    season: 2025, week: 3, gameId: "g1", team: "phi", opponent: "dal",
    primaryQbPlayerId: "gsis:qb1", primaryQbPlayerName: "QB One",
    target: { primaryQbAttempts: 30 },
    features: {
      teamVolume: {
        offensivePlaysPerGame: { seasonPrior: 62, last3: 62, priorSeason: 60 },
        passAttemptsPerGame: { seasonPrior: 34, last3: 34, priorSeason: 32 },
        rushAttemptsPerGame: { seasonPrior: 28, last3: 28, priorSeason: 28 },
      },
      passTendency: {
        overallDropbackRate: { seasonPrior: 0.55, last3: 0.55, priorSeason: 0.52 },
        earlyDownNeutralPassRate: { seasonPrior: 0.5, last3: 0.5, priorSeason: 0.48 },
        passRateOverExpected: { seasonPrior: 2.1, last3: 2.1, priorSeason: 1.5 },
      },
      opponent: {
        offensivePlaysPerGameAllowed: { seasonPrior: 63, last3: 63, priorSeason: 61 },
        passAttemptsPerGameAllowed: { seasonPrior: 33, last3: 33, priorSeason: 31 },
        overallDropbackRateAllowed: { seasonPrior: 0.53, last3: 0.53, priorSeason: 0.5 },
      },
      market: { spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home" },
      qbRole: {
        attemptsPerGameSeasonPrior: 29, attemptsPerGameLast3: 29, attemptsPerGamePriorSeason: 27,
        gamesStartedPriorThisSeason: 2, hasPriorSeasonStarts: true, isFirstStartForTeamThisSeason: false,
      },
    },
    diagnostics: { instabilityCategory: "singleQbGame", primaryQbAttemptShare: 1 },
    split: "train",
    ...overrides,
  };
}

describe("extractRawFeatureValues", () => {
  it("produces exactly FEATURE_KEYS.length values in the declared order", () => {
    const values = extractRawFeatureValues(row());
    expect(values).toHaveLength(FEATURE_KEYS.length);
    expect(values[9]).toBe(-3); // market.spread
    expect(values[12]).toBe(1); // market.homeAwayIsHome (home -> 1)
  });

  it("encodes away as 0 for the home/away indicator", () => {
    const values = extractRawFeatureValues(row({ features: { ...row().features, market: { spread: 3, total: 44, impliedTeamTotal: 20, homeAway: "away" } } }));
    expect(values[12]).toBe(0);
  });

  it("returns null for a week-1 row with no seasonPrior/priorSeason data (not zero)", () => {
    const week1 = row({
      week: 1,
      features: {
        ...row().features,
        teamVolume: { offensivePlaysPerGame: { seasonPrior: null, last3: null, priorSeason: null }, passAttemptsPerGame: { seasonPrior: null, last3: null, priorSeason: null }, rushAttemptsPerGame: { seasonPrior: null, last3: null, priorSeason: null } },
      },
    });
    const values = extractRawFeatureValues(week1);
    expect(values[0]).toBeNull();
  });
});

describe("computeTrainFallbacks / encodeFeatureRow", () => {
  it("imputes a null feature with the train-only mean of that column", () => {
    const withData = row();
    const withoutData = row({
      features: {
        ...row().features,
        teamVolume: { offensivePlaysPerGame: { seasonPrior: null, last3: null, priorSeason: null }, passAttemptsPerGame: { seasonPrior: null, last3: null, priorSeason: null }, rushAttemptsPerGame: { seasonPrior: null, last3: null, priorSeason: null } },
      },
    });
    const fallbacks = computeTrainFallbacks([withData, withoutData]);
    // teamVolume.offensivePlaysPerGame column: only `withData`'s value (62) contributes -> fallback is 62.
    expect(fallbacks[0]).toBe(62);
    const encoded = encodeFeatureRow(withoutData, fallbacks);
    expect(encoded[0]).toBe(62);
  });
});

describe("ablateGroups", () => {
  it("replaces every column in an excluded group with its train fallback, leaving other groups untouched", () => {
    const r = row();
    const fallbacks = computeTrainFallbacks([r]);
    const encoded = encodeFeatureRow(r, fallbacks);
    const ablated = ablateGroups(encoded, fallbacks, new Set(["market"]));
    // market columns become exactly the fallback (== the row's own value here, since it's the only train row)
    const marketIndices = FEATURE_KEYS.map((k, i) => (k.group === "market" ? i : -1)).filter((i) => i >= 0);
    for (const i of marketIndices) expect(ablated[i]).toBe(fallbacks[i]);
    // a non-market column is untouched
    const teamVolumeIndex = FEATURE_KEYS.findIndex((k) => k.key === "teamVolume.offensivePlaysPerGame");
    expect(ablated[teamVolumeIndex]).toBe(encoded[teamVolumeIndex]);
  });
});
