import { describe, expect, it } from "vitest";
import {
  DEFENSE_METRIC_RANK_DIRECTIONS,
  OFFENSE_METRIC_RANK_DIRECTIONS,
  TEAM_PERFORMANCE_ANALYTICS_SCHEMA_VERSION,
  TeamPerformanceAnalyticsValidationError,
  validateTeamPerformanceAnalyticsArtifact,
} from "@/lib/nfl/teamPerformanceAnalytics";

function rateBundle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    epaPerPlay: null, successRate: null, epaPositiveRate: null,
    earlyDownEpaPerPlay: null, earlyDownSuccessRate: null,
    passEpaPerDropback: null, passSuccessRate: null,
    rushEpaPerPlay: null, rushSuccessRate: null,
    explosiveRate: null, explosivePassCount: 0, explosiveRushCount: 0,
    thirdDownEpaPerPlay: null, thirdDownSuccessRate: null, thirdDownRawConversionRate: null,
    sackRate: null, offPlays: 0, dropbacks: 0,
    ...overrides,
  };
}

function window(sampleSize = 0) {
  return {
    sampleSize,
    offense: { all: rateBundle(), filtered: rateBundle() },
    defenseAllowed: { all: rateBundle(), filtered: rateBundle() },
    pointsPerDriveOff: null,
    pointsPerDriveAllowed: null,
  };
}

function teamRow(team: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    team,
    gamesPlayed: 0,
    windows: {
      last4: window(0),
      last8: window(0),
      fullSeason: {
        ...window(0),
        adjusted: {
          offense: { epaPerPlay: null, successRate: null, explosiveRate: null },
          defenseAllowed: { epaPerPlay: null, successRate: null, explosiveRate: null },
          pointDifferentialPerGame: { raw: null, adjusted: null },
        },
        metricRanks: { offense: {}, defenseAllowed: {} },
      },
    },
    performance: {
      offenseRating: null, offenseRank: null, defenseRating: null,
      defenseRank: null, performanceRating: null, performanceRank: null,
    },
    ...overrides,
  };
}

const TEAM_CODES = [
  "ari", "atl", "bal", "buf", "car", "chi", "cin", "cle", "dal", "den", "det",
  "gb", "hou", "ind", "jax", "kc", "lac", "lar", "lv", "mia", "min", "ne", "no",
  "nyg", "nyj", "phi", "pit", "sea", "sf", "tb", "ten", "was",
];

function artifact(rows = TEAM_CODES.map((t) => teamRow(t))) {
  return {
    schemaVersion: TEAM_PERFORMANCE_ANALYTICS_SCHEMA_VERSION,
    _meta: {
      season: 2026,
      generatedAt: "2026-08-18T00:00:00.000Z",
      source: "test",
      ratingFormula: "test formula",
      scaleDivisors: { offense: 0.9, defense: 0.86, overall: 0.72 },
    },
    teams: rows,
  };
}

describe("teamPerformanceAnalytics validator", () => {
  it("21. accepts a well-formed 32-team zero-game artifact", () => {
    expect(() => validateTeamPerformanceAnalyticsArtifact(artifact())).not.toThrow();
  });

  it("22. rejects a schema with the wrong version string", () => {
    const bad = { ...artifact(), schemaVersion: "nfl-performance-v0" };
    expect(() => validateTeamPerformanceAnalyticsArtifact(bad)).toThrow(TeamPerformanceAnalyticsValidationError);
  });

  it("23. requires exactly 32 unique team abbreviations", () => {
    const tooFew = artifact(TEAM_CODES.slice(0, 31).map((t) => teamRow(t)));
    expect(() => validateTeamPerformanceAnalyticsArtifact(tooFew)).toThrow(/32 teams/);

    const duplicated = artifact([...TEAM_CODES.slice(0, 31), TEAM_CODES[0]].map((t) => teamRow(t)));
    expect(() => validateTeamPerformanceAnalyticsArtifact(duplicated)).toThrow(/duplicate team abbr/);
  });

  it("24. rejects malformed/missing window shapes", () => {
    const rows = TEAM_CODES.map((t) => teamRow(t));
    const broken = { ...rows[0], windows: { last4: window(0) } }; // missing last8/fullSeason
    expect(() => validateTeamPerformanceAnalyticsArtifact(artifact([broken, ...rows.slice(1)]))).toThrow();
  });

  it("25. a window's sampleSize can never exceed gamesPlayed (no fabricated games)", () => {
    const rows = TEAM_CODES.map((t) => teamRow(t));
    const impossible = teamRow(TEAM_CODES[0], { gamesPlayed: 2 });
    (impossible.windows.fullSeason as { sampleSize: number }).sampleSize = 5;
    expect(() => validateTeamPerformanceAnalyticsArtifact(artifact([impossible, ...rows.slice(1)]))).toThrow(/cannot exceed gamesPlayed/);
  });

  it("26. zero-game teams must have null performance ratings/ranks (no v0.4/prior-season substitution)", () => {
    const rows = TEAM_CODES.map((t) => teamRow(t));
    const withFakeRating = teamRow(TEAM_CODES[0], {
      performance: { offenseRating: 62, offenseRank: 3, defenseRating: null, defenseRank: null, performanceRating: null, performanceRank: null },
    });
    expect(() => validateTeamPerformanceAnalyticsArtifact(artifact([withFakeRating, ...rows.slice(1)]))).toThrow(/must be null when gamesPlayed is 0/);
  });

  it("rank-direction metadata: offense Sack Rate inverts relative to every other offense metric", () => {
    expect(OFFENSE_METRIC_RANK_DIRECTIONS.sackRate).toBe("lower-is-better");
    expect(OFFENSE_METRIC_RANK_DIRECTIONS.epaPerPlay).toBe("higher-is-better");
    expect(OFFENSE_METRIC_RANK_DIRECTIONS.explosiveRate).toBe("higher-is-better");
  });

  it("rank-direction metadata: defense Sack Rate (generated) inverts relative to every other 'allowed' metric", () => {
    expect(DEFENSE_METRIC_RANK_DIRECTIONS.sackRate).toBe("higher-is-better");
    expect(DEFENSE_METRIC_RANK_DIRECTIONS.epaPerPlay).toBe("lower-is-better");
    expect(DEFENSE_METRIC_RANK_DIRECTIONS.explosiveRate).toBe("lower-is-better");
  });
});
