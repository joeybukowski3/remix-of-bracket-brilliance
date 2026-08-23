import { describe, expect, it } from "vitest";
import type { CfbV2GameProjection, CfbV2TeamRating } from "./types";
import { CFB_V2_IPR_MODEL_VERSION, CFB_V2_CALIBRATION_VERSION, CFB_V2_PROBABILITY_VERSION, CFB_V2_SCORING_VERSION } from "./versions";
import { CFB_V2_CONFIG_VERSION } from "./config";
import { cfbV2ManifestPath, cfbV2PreseasonRatingsPath, cfbV2WeekProjectionsPath, cfbV2WeekRatingsPath, type CfbV2ArtifactEnvelope } from "./artifactContracts";

function fixtureRating(overrides: Partial<CfbV2TeamRating> = {}): CfbV2TeamRating {
  return {
    teamId: "alabama",
    season: 2026,
    asOfWeek: 4,
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    offenseRating: 0.42,
    defenseRating: 0.38,
    overallRating: 0.4,
    preseasonPriorOffense: 0.5,
    preseasonPriorDefense: 0.45,
    priorTier: "PRIOR_D",
    gamesPlayed: 3,
    classification: "fbs",
    connectivity: { componentSize: 130, regularizationMultiplier: 1.2 },
    ratingStatus: "computed",
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-09-20T12:00:00.000Z",
    dataAsOf: "2026-09-20T06:00:00.000Z",
    ...overrides,
  };
}

function fixtureProjection(overrides: Partial<CfbV2GameProjection> = {}): CfbV2GameProjection {
  return {
    gameId: "g1",
    season: 2026,
    week: 4,
    homeTeamId: "alabama",
    awayTeamId: "georgia",
    expectedHomePoints: 24,
    expectedAwayPoints: 27,
    projectedMargin: -3,
    projectedTotal: 51,
    homeWinProbability: 0.45,
    awayWinProbability: 0.55,
    marginInterval80: [-15, 9],
    totalInterval80: [42, 60],
    matchupPopulation: "fbs_vs_fbs",
    projectionStatus: "computed",
    modelVersion: CFB_V2_IPR_MODEL_VERSION,
    scoringVersion: CFB_V2_SCORING_VERSION,
    calibrationVersion: CFB_V2_CALIBRATION_VERSION,
    probabilityVersion: CFB_V2_PROBABILITY_VERSION,
    configVersion: CFB_V2_CONFIG_VERSION,
    generatedAt: "2026-09-20T12:00:00.000Z",
    dataAsOf: "2026-09-20T06:00:00.000Z",
    ...overrides,
  };
}

describe("CfbV2TeamRating fixture", () => {
  it("constructs with every provenance field present", () => {
    const rating = fixtureRating();
    expect(rating.modelVersion).toBe(CFB_V2_IPR_MODEL_VERSION);
    expect(rating.configVersion).toBe(CFB_V2_CONFIG_VERSION);
    expect(rating.generatedAt).toBeTruthy();
    expect(rating.dataAsOf).toBeTruthy();
  });

  it("supports the insufficient-data status for a transition team with no prior", () => {
    const rating = fixtureRating({
      ratingStatus: "insufficient-data",
      priorTier: "LEAGUE_MEAN",
      preseasonPriorOffense: null,
      preseasonPriorDefense: null,
      gamesPlayed: 0,
    });
    expect(rating.ratingStatus).toBe("insufficient-data");
    expect(rating.preseasonPriorOffense).toBeNull();
  });
});

describe("CfbV2GameProjection fixture", () => {
  it("constructs with every version field present", () => {
    const projection = fixtureProjection();
    expect(projection.scoringVersion).toBe(CFB_V2_SCORING_VERSION);
    expect(projection.calibrationVersion).toBe(CFB_V2_CALIBRATION_VERSION);
    expect(projection.probabilityVersion).toBe(CFB_V2_PROBABILITY_VERSION);
  });

  it("never carries an edge/EV/recommendation field (§10 — analytics-only)", () => {
    const projection = fixtureProjection();
    const bannedKeys = ["edge", "ev", "recommendedSide", "confidenceBet", "units"];
    for (const key of bannedKeys) {
      expect(Object.prototype.hasOwnProperty.call(projection, key)).toBe(false);
    }
  });

  it("represents an unavailable FCS matchup with null model output, not a fabricated value", () => {
    const projection = fixtureProjection({
      matchupPopulation: "fbs_vs_fcs",
      projectionStatus: "unavailable",
      expectedHomePoints: null,
      expectedAwayPoints: null,
      projectedMargin: null,
      projectedTotal: null,
      homeWinProbability: null,
      awayWinProbability: null,
      marginInterval80: null,
      totalInterval80: null,
    });
    expect(projection.projectedMargin).toBeNull();
    expect(projection.projectionStatus).toBe("unavailable");
  });
});

describe("artifact envelope + path constants (§13/§14)", () => {
  it("builds a well-formed envelope", () => {
    const envelope: CfbV2ArtifactEnvelope<CfbV2TeamRating> = {
      schemaVersion: "cfb-v2-artifact-schema-1",
      modelVersion: "cfb-v2.0",
      versions: { ipr: CFB_V2_IPR_MODEL_VERSION, scoring: CFB_V2_SCORING_VERSION, calibration: CFB_V2_CALIBRATION_VERSION, probability: CFB_V2_PROBABILITY_VERSION },
      configVersion: CFB_V2_CONFIG_VERSION,
      generatedAt: "2026-09-20T12:00:00.000Z",
      dataAsOf: "2026-09-20T06:00:00.000Z",
      season: 2026,
      asOfWeek: 4,
      records: [fixtureRating()],
    };
    expect(envelope.records).toHaveLength(1);
  });

  it("produces the documented path family, never under data/cfb/research/**", () => {
    expect(cfbV2PreseasonRatingsPath()).toBe("data/generated/cfb/v2/preseason-ratings.json");
    expect(cfbV2WeekRatingsPath(4)).toBe("data/generated/cfb/v2/week-04-ratings.json");
    expect(cfbV2WeekProjectionsPath(12)).toBe("data/generated/cfb/v2/week-12-projections.json");
    expect(cfbV2ManifestPath()).toBe("data/generated/cfb/v2/manifest.json");
    for (const path of [cfbV2PreseasonRatingsPath(), cfbV2WeekRatingsPath(1), cfbV2WeekProjectionsPath(1), cfbV2ManifestPath()]) {
      expect(path).not.toMatch(/research/);
    }
  });
});
