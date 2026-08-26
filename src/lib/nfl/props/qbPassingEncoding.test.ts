import { describe, expect, it } from "vitest";
import {
  ablatePassingGroups, appendDecompositionLegs, computePassingTrainFallbacks, encodePassingFeatureRow,
  extractRawPassingFeatureValues, PASSING_FEATURE_KEYS,
} from "./qbPassingEncoding";
import type { NflQbPassingFeatureRow } from "./types/qbPassingFeatures";

function row(overrides: Partial<NflQbPassingFeatureRow> = {}): NflQbPassingFeatureRow {
  return {
    schemaVersion: "nfl-qb-passing-feature-row-v1", season: 2024, week: 4, gameId: "g1", team: "phi", opponent: "dal",
    primaryQbPlayerId: "gsis:qb1", primaryQbPlayerName: "QB One",
    target: { primaryQbPassingYards: 260 },
    features: {
      opportunity: {
        offensivePlaysPerGame: { seasonPrior: 62, last3: 62, priorSeason: 60 },
        passAttemptsPerGame: { seasonPrior: 34, last3: 34, priorSeason: 32 },
        qbAttemptsPerGame: { seasonPrior: 33, last3: 33, priorSeason: 30 },
      },
      qbEfficiency: { yardsPerAttempt: { seasonPrior: 7.5, last3: 7.5, priorSeason: 7.0 }, completionPct: { seasonPrior: 0.65, last3: 0.65, priorSeason: 0.63 } },
      qbRollingPassingYardsPerGame: { seasonPrior: 250, last3: 250, priorSeason: 220 },
      opponentPassDefense: { passAttemptsPerGameAllowed: { seasonPrior: 33, last3: 33, priorSeason: 31 }, overallDropbackRateAllowed: { seasonPrior: 0.55, last3: 0.55, priorSeason: 0.53 }, passEpaPerPlayAllowed: { seasonPrior: 0.05, last3: 0.05, priorSeason: null } },
      proePassTendency: { overallDropbackRate: { seasonPrior: 0.58, last3: 0.58, priorSeason: 0.55 }, earlyDownNeutralPassRate: { seasonPrior: 0.5, last3: 0.5, priorSeason: 0.48 }, passRateOverExpected: { seasonPrior: 1.5, last3: 1.5, priorSeason: 1.0 } },
      market: { spread: -3, total: 45, impliedTeamTotal: 24, homeAway: "home", isDome: false },
    },
    diagnostics: { instabilityCategory: "singleQbGame", primaryQbAttemptShare: 1, hasPriorSeasonStarts: true, gamesStartedPriorThisSeason: 3 },
    ...overrides,
  };
}

describe("extractRawPassingFeatureValues", () => {
  it("has exactly PASSING_FEATURE_KEYS.length values, homeAway/isDome encoded as 0/1", () => {
    const values = extractRawPassingFeatureValues(row());
    expect(values).toHaveLength(PASSING_FEATURE_KEYS.length);
    const homeIdx = PASSING_FEATURE_KEYS.findIndex((k) => k.key === "market.homeAwayIsHome");
    const domeIdx = PASSING_FEATURE_KEYS.findIndex((k) => k.key === "market.isDome");
    expect(values[homeIdx]).toBe(1);
    expect(values[domeIdx]).toBe(0);
  });

  it("uses priorSeason when seasonPrior is null and allowPriorSeasonFallback is true (default)", () => {
    const week1 = row();
    week1.features.opponentPassDefense.passEpaPerPlayAllowed = { seasonPrior: null, last3: null, priorSeason: 0.02 };
    const values = extractRawPassingFeatureValues(week1);
    const idx = PASSING_FEATURE_KEYS.findIndex((k) => k.key === "opponentPassDefense.passEpaPerPlayAllowed");
    expect(values[idx]).toBe(0.02);
  });

  it("ignores priorSeason entirely when allowPriorSeasonFallback is false", () => {
    const week1 = row();
    week1.features.opponentPassDefense.passEpaPerPlayAllowed = { seasonPrior: null, last3: null, priorSeason: 0.02 };
    const values = extractRawPassingFeatureValues(week1, { allowPriorSeasonFallback: false });
    const idx = PASSING_FEATURE_KEYS.findIndex((k) => k.key === "opponentPassDefense.passEpaPerPlayAllowed");
    expect(values[idx]).toBeNull();
  });
});

describe("computePassingTrainFallbacks / encodePassingFeatureRow", () => {
  it("imputes with the train-only mean, ignoring nulls", () => {
    const withData = row();
    const withoutData = row();
    withoutData.features.qbEfficiency.yardsPerAttempt = { seasonPrior: null, last3: null, priorSeason: null };
    const fallbacks = computePassingTrainFallbacks([withData, withoutData]);
    const idx = PASSING_FEATURE_KEYS.findIndex((k) => k.key === "qbEfficiency.yardsPerAttempt");
    expect(fallbacks[idx]).toBe(7.5); // only withData contributes
    expect(encodePassingFeatureRow(withoutData, fallbacks)[idx]).toBe(7.5);
  });
});

describe("ablatePassingGroups", () => {
  it("zeroes only the excluded group's columns, replacing them with the train fallback", () => {
    const r = row();
    const fallbacks = computePassingTrainFallbacks([r]);
    const encoded = encodePassingFeatureRow(r, fallbacks);
    const ablated = ablatePassingGroups(encoded, fallbacks, new Set(["market"]));
    const marketIndices = PASSING_FEATURE_KEYS.map((k, i) => (k.group === "market" ? i : -1)).filter((i) => i >= 0);
    for (const i of marketIndices) expect(ablated[i]).toBe(fallbacks[i]);
    const opportunityIdx = PASSING_FEATURE_KEYS.findIndex((k) => k.key === "opportunity.offensivePlaysPerGame");
    expect(ablated[opportunityIdx]).toBe(encoded[opportunityIdx]);
  });
});

describe("appendDecompositionLegs", () => {
  it("appends projectedAttempts and projectedYpa after the standard features", () => {
    const r = row();
    const fallbacks = computePassingTrainFallbacks([r]);
    const encoded = encodePassingFeatureRow(r, fallbacks);
    const withLegs = appendDecompositionLegs(encoded, 32, 7.2);
    expect(withLegs).toHaveLength(encoded.length + 2);
    expect(withLegs.at(-2)).toBe(32);
    expect(withLegs.at(-1)).toBe(7.2);
  });
});
