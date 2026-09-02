import { describe, expect, it } from "vitest";
import {
  assertTeamOpportunityCoherent,
  coalesceScalar,
  computeTeamOpportunityConstants,
  DROPBACK_RATE_CLAMP,
  fitTeamOpportunityModel,
  PLAYS_CLAMP,
  predictTeamOpportunity,
} from "./teamOpportunityModel";
import {
  NFL_TEAM_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION,
  NFL_TEAM_OPPORTUNITY_MODEL_VERSION,
  type NflTeamOpportunityFeatureRow,
} from "./types/teamOpportunity";

function scalar(value: number | null) {
  return { seasonPrior: null, last3: null, priorSeason: value };
}

function row(overrides: Partial<NflTeamOpportunityFeatureRow> = {}): NflTeamOpportunityFeatureRow {
  return {
    schemaVersion: NFL_TEAM_OPPORTUNITY_FEATURE_ROW_SCHEMA_VERSION,
    season: 2025,
    week: 1,
    gameId: "2025_01_AAA_BBB",
    team: "bbb",
    opponent: "aaa",
    homeAway: "home",
    neutralSite: false,
    gameDateUtc: "2025-09-07T17:00:00.000Z",
    features: {
      teamOffense: {
        offensivePlaysPerGame: scalar(64),
        dropbackRate: scalar(0.58),
        rushAttemptsPerGame: scalar(27),
        passAttemptsPerGame: scalar(37),
        earlyDownNeutralPassRate: scalar(0.5),
        passRateOverExpected: scalar(0),
      },
      opponentDefense: {
        offensivePlaysPerGameAllowed: scalar(63),
        dropbackRateAllowed: scalar(0.58),
      },
      market: { spread: -3, total: 45, impliedTeamTotal: 24, isHome: 1, isNeutralSite: 0 },
    },
    diagnostics: { gamesPlayedPriorThisSeason: 0, hasPriorSeason: true, opponentGamesPriorThisSeason: 0, opponentHasPriorSeason: true },
    ...overrides,
  };
}

function trainRows(n: number): NflTeamOpportunityFeatureRow[] {
  return Array.from({ length: n }, (_, i) => {
    const plays = 58 + (i % 12);
    const dropbacks = Math.round(plays * (0.5 + (i % 7) * 0.03));
    return {
      ...row({ season: 2024, week: 1 + (i % 17), gameId: `2024_${i}` }),
      features: {
        ...row().features,
        teamOffense: {
          ...row().features.teamOffense,
          offensivePlaysPerGame: scalar(plays - 1),
          dropbackRate: scalar(dropbacks / plays),
        },
        market: { spread: (i % 11) - 5, total: 40 + (i % 12), impliedTeamTotal: 18 + (i % 10), isHome: (i % 2) as 0 | 1, isNeutralSite: 0 },
      },
      target: { offensivePlays: plays, dropbackRate: dropbacks / plays, passAttempts: dropbacks, rushAttempts: plays - dropbacks },
    };
  });
}

describe("coalesceScalar", () => {
  it("prefers seasonPrior, then priorSeason, then null", () => {
    expect(coalesceScalar({ seasonPrior: 1, last3: 2, priorSeason: 3 })).toBe(1);
    expect(coalesceScalar({ seasonPrior: null, last3: 2, priorSeason: 3 })).toBe(3);
    expect(coalesceScalar({ seasonPrior: null, last3: 2, priorSeason: null })).toBeNull();
    expect(coalesceScalar(null)).toBeNull();
  });
});

describe("team opportunity model fit", () => {
  it("is deterministic for identical training input", () => {
    const a = fitTeamOpportunityModel(trainRows(80), NFL_TEAM_OPPORTUNITY_MODEL_VERSION);
    const b = fitTeamOpportunityModel(trainRows(80), NFL_TEAM_OPPORTUNITY_MODEL_VERSION);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("computes league-mean constants from rows that carry a target", () => {
    const constants = computeTeamOpportunityConstants(trainRows(50));
    expect(constants.leagueMeanPlays).toBeGreaterThan(55);
    expect(constants.leagueMeanPlays).toBeLessThan(72);
    expect(constants.leagueMeanDropbackRate).toBeGreaterThan(0.4);
    expect(constants.leagueMeanDropbackRate).toBeLessThan(0.8);
  });
});

describe("predictTeamOpportunity coherence", () => {
  const fitted = fitTeamOpportunityModel(trainRows(120), NFL_TEAM_OPPORTUNITY_MODEL_VERSION);

  it("splits the pool exactly (pass + rush == plays)", () => {
    const p = predictTeamOpportunity(fitted, row());
    expect(p.projectedPassAttempts + p.projectedRushAttempts).toBeCloseTo(p.projectedTeamPlays, 9);
    assertTeamOpportunityCoherent(p);
  });

  it("produces football-plausible ranges on ordinary input", () => {
    const p = predictTeamOpportunity(fitted, row());
    expect(p.projectedTeamPlays).toBeGreaterThan(50);
    expect(p.projectedTeamPlays).toBeLessThan(80);
    expect(p.projectedDropbackRate).toBeGreaterThan(0.4);
    expect(p.projectedDropbackRate).toBeLessThan(0.8);
  });

  it("clamps implausible plays and records the pre-clamp value", () => {
    const extreme = row({
      features: {
        ...row().features,
        teamOffense: { ...row().features.teamOffense, offensivePlaysPerGame: scalar(300) },
      },
    });
    const p = predictTeamOpportunity(fitted, extreme);
    expect(p.projectedTeamPlays).toBeLessThanOrEqual(PLAYS_CLAMP.max);
    expect(p.projectedTeamPlays).toBeGreaterThanOrEqual(PLAYS_CLAMP.min);
    if (p.playsBeforeClamp > PLAYS_CLAMP.max) expect(p.playsClampApplied).toBe(true);
    assertTeamOpportunityCoherent(p);
  });

  it("clamps dropback rate into (0,1) plausible band", () => {
    const extreme = row({
      features: {
        ...row().features,
        teamOffense: { ...row().features.teamOffense, dropbackRate: scalar(5) },
      },
    });
    const p = predictTeamOpportunity(fitted, extreme);
    expect(p.projectedDropbackRate).toBeLessThanOrEqual(DROPBACK_RATE_CLAMP.max);
    expect(p.projectedDropbackRate).toBeGreaterThanOrEqual(DROPBACK_RATE_CLAMP.min);
  });

  it("still projects when every prior window is missing (train-mean fallback)", () => {
    const noHistory = row({
      features: {
        ...row().features,
        teamOffense: {
          offensivePlaysPerGame: scalar(null),
          dropbackRate: scalar(null),
          rushAttemptsPerGame: scalar(null),
          passAttemptsPerGame: scalar(null),
          earlyDownNeutralPassRate: scalar(null),
          passRateOverExpected: scalar(null),
        },
        opponentDefense: { offensivePlaysPerGameAllowed: scalar(null), dropbackRateAllowed: scalar(null) },
        market: { spread: null, total: null, impliedTeamTotal: null, isHome: 1, isNeutralSite: 0 },
      },
    });
    const p = predictTeamOpportunity(fitted, noHistory);
    expect(Number.isFinite(p.projectedTeamPlays)).toBe(true);
    assertTeamOpportunityCoherent(p);
  });
});

describe("assertTeamOpportunityCoherent", () => {
  it("rejects a negative or non-reconstituting split", () => {
    expect(() =>
      assertTeamOpportunityCoherent({
        projectedTeamPlays: 60, projectedDropbackRate: 0.6, projectedPassAttempts: 30, projectedRushAttempts: 20,
        playsBeforeClamp: 60, dropbackRateBeforeClamp: 0.6, playsClampApplied: false, dropbackRateClampApplied: false,
      }),
    ).toThrow(/reconstitute/);
    expect(() =>
      assertTeamOpportunityCoherent({
        projectedTeamPlays: 60, projectedDropbackRate: 1.4, projectedPassAttempts: 84, projectedRushAttempts: -24,
        playsBeforeClamp: 60, dropbackRateBeforeClamp: 1.4, playsClampApplied: false, dropbackRateClampApplied: false,
      }),
    ).toThrow();
  });
});
