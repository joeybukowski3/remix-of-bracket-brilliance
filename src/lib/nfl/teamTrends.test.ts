import { describe, expect, it } from "vitest";
import teamsArtifact from "../../../public/data/nfl/teams.json";
import fullSeason2025Artifact from "../../../public/data/nfl/2025/full-season-team-metrics.json";
import finalEight2025Artifact from "../../../public/data/nfl/2025/final-eight-team-metrics.json";
import {
  NFL_2025_TREND_DATASET,
  buildNflTrendDataset,
  calculateTrendThresholds,
  classifyNflTrend,
  getNflTrendRecord,
  toNflTrendComparableRating,
  type NflTrendThresholds,
} from "@/lib/nfl/teamTrends";

function clone<T>(value: T): T {
  return structuredClone(value);
}

const boundaryThresholds: NflTrendThresholds = {
  count: 32,
  q10: -10,
  q25: -5,
  median: 0,
  q75: 5,
  q90: 10,
  stabilityRatingDeltaMaximum: 3,
  stabilityRankDeltaMaximum: 2,
  algorithm: "R-7 linear interpolation",
};

describe("NFL 2025 team trend dataset", () => {
  it("builds exactly 32 deterministic records in canonical team order", () => {
    const first = buildNflTrendDataset();
    const second = buildNflTrendDataset();
    const canonicalIds = teamsArtifact.teams.map((team) => team.id);

    expect(first.records).toHaveLength(32);
    expect(first.records.map((record) => record.teamId)).toEqual(canonicalIds);
    expect(second.records.map((record) => record.teamId)).toEqual(canonicalIds);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("represents every canonical team once by team ID and abbreviation", () => {
    const teamIds = NFL_2025_TREND_DATASET.records.map((record) => record.teamId);
    const abbreviations = NFL_2025_TREND_DATASET.records.map((record) => record.abbr);

    expect(new Set(teamIds).size).toBe(32);
    expect(new Set(abbreviations).size).toBe(32);
    expect(teamIds.sort()).toEqual(teamsArtifact.teams.map((team) => team.id).sort());
    expect(abbreviations.sort()).toEqual(teamsArtifact.teams.map((team) => team.abbr).sort());
  });

  it("joins safely by canonical ID regardless of source row order", () => {
    const shuffledFull = clone(fullSeason2025Artifact);
    const shuffledFinal = clone(finalEight2025Artifact);
    shuffledFull.teams.reverse();
    shuffledFinal.teams = [...shuffledFinal.teams.slice(10), ...shuffledFinal.teams.slice(0, 10)];

    const dataset = buildNflTrendDataset({
      fullSeasonArtifact: shuffledFull,
      finalEightArtifact: shuffledFinal,
    });

    expect(getNflTrendRecord("jax", dataset)?.deltas.rating).toBe(
      getNflTrendRecord("jax")?.deltas.rating
    );
    expect(dataset.records.map((record) => record.teamId)).toEqual(
      teamsArtifact.teams.map((team) => team.id)
    );
  });

  it("hard-fails duplicate and orphan source rows", () => {
    const duplicate = clone(fullSeason2025Artifact);
    duplicate.teams[0].teamId = duplicate.teams[1].teamId;
    expect(() => buildNflTrendDataset({ fullSeasonArtifact: duplicate })).toThrow(/duplicate value/);

    const orphan = clone(finalEight2025Artifact);
    orphan.teams[0].teamId = "nfl-ghost";
    expect(() => buildNflTrendDataset({ finalEightArtifact: orphan })).toThrow(/orphan source row nfl-ghost/);
  });

  it("hard-fails identity mismatches instead of fuzzy matching names", () => {
    const mismatched = clone(fullSeason2025Artifact);
    mismatched.teams[0].abbr = "zzz";
    expect(() => buildNflTrendDataset({ fullSeasonArtifact: mismatched })).toThrow(/identity mismatch/);
  });

  it("uses the v0.3 public comparable-rating transform without min-max scaling", () => {
    expect(toNflTrendComparableRating(0)).toBe(50);
    expect(toNflTrendComparableRating(0.733)).toBe(65);
    expect(toNflTrendComparableRating(-0.733)).toBe(35);
  });

  it("uses positive deltas to mean final-eight improvement, including rank movement", () => {
    const cincinnati = getNflTrendRecord("cin")!;

    expect(cincinnati.finalEight.rank).toBeLessThan(cincinnati.fullSeason.rank!);
    expect(cincinnati.deltas.rank).toBeGreaterThan(0);
    expect(cincinnati.deltas.rating).toBeGreaterThan(0);
  });

  it("preserves the defensive sign convention as higher-is-better z-score movement", () => {
    const jacksonville = getNflTrendRecord("jax")!;

    expect(NFL_2025_TREND_DATASET.metadata.metricCompatibility.defenseSignConvention).toMatch(
      /higher is better/
    );
    expect(jacksonville.deltas.defense).toBeGreaterThan(0);
  });

  it("preserves source metadata and compatibility documentation", () => {
    expect(NFL_2025_TREND_DATASET.metadata).toMatchObject({
      season: 2025,
      sourceSeason: 2025,
      teamCount: 32,
      modelVersion: "nfl-power-v0.3.0",
      generatedAt: "2026-07-14T12:51:57.553Z",
      validationStatus: "stage-1",
    });
    expect(NFL_2025_TREND_DATASET.metadata.sourceArtifacts).toEqual({
      teams: "public/data/nfl/teams.json",
      fullSeason: "public/data/nfl/2025/full-season-team-metrics.json",
      finalEight: "public/data/nfl/2025/final-eight-team-metrics.json",
    });
    expect(NFL_2025_TREND_DATASET.metadata.validationWarnings).toEqual([]);
  });
});

describe("NFL trend thresholds and classification", () => {
  it("calculates R-7 interpolated quantiles from the 32-team rating-delta distribution", () => {
    const thresholds = calculateTrendThresholds(NFL_2025_TREND_DATASET.records);

    expect(thresholds).toMatchObject({
      count: 32,
      algorithm: "R-7 linear interpolation",
      q10: -12.479182,
      q25: -5.498922,
      median: 1.603547,
      q75: 7.378951,
      q90: 11.641338,
    });
  });

  it("classifies exact threshold boundaries consistently", () => {
    expect(classifyNflTrend(10, 4, boundaryThresholds)).toBe("strong_improvement");
    expect(classifyNflTrend(5, 4, boundaryThresholds)).toBe("moderate_improvement");
    expect(classifyNflTrend(0, 4, boundaryThresholds)).toBe("stable");
    expect(classifyNflTrend(-5, -4, boundaryThresholds)).toBe("moderate_decline");
    expect(classifyNflTrend(-10, -4, boundaryThresholds)).toBe("strong_decline");
  });

  it("applies the practical stability override only inside the approved boundaries", () => {
    const thresholds = { ...boundaryThresholds, q75: 2, q90: 2.5 };

    expect(classifyNflTrend(2.999999, 2, thresholds)).toBe("stable");
    expect(classifyNflTrend(3, 2, thresholds)).toBe("strong_improvement");
    expect(classifyNflTrend(2.999999, 3, thresholds)).toBe("strong_improvement");
  });

  it("returns insufficient_data for missing rating deltas or incomplete threshold distributions", () => {
    expect(classifyNflTrend(null, 0, boundaryThresholds)).toBe("insufficient_data");
    expect(classifyNflTrend(12, 4, { ...boundaryThresholds, count: 31 })).toBe(
      "insufficient_data"
    );
  });

  it("produces all five real 2025 classifications with the expected distribution", () => {
    const counts = NFL_2025_TREND_DATASET.records.reduce<Record<string, number>>((acc, record) => {
      acc[record.classification] = (acc[record.classification] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({
      strong_improvement: 4,
      moderate_improvement: 4,
      stable: 16,
      moderate_decline: 4,
      strong_decline: 4,
    });
  });
});

describe("NFL trend confidence and representative teams", () => {
  it("keeps missing secondary metrics as null and lowers confidence to medium", () => {
    const finalWithMissingNetEpa = clone(finalEight2025Artifact);
    const row = finalWithMissingNetEpa.teams.find((team) => team.abbr === "cin")!;
    row.metrics.netEpaPerPlay = {
      raw: null,
      adjusted: null,
      zScore: null,
      rank: null,
      missing: true,
    };

    const cincinnati = getNflTrendRecord(
      "cin",
      buildNflTrendDataset({ finalEightArtifact: finalWithMissingNetEpa })
    )!;

    expect(cincinnati.finalEight.netEpa).toBeNull();
    expect(cincinnati.deltas.netEpa).toBeNull();
    expect(cincinnati.confidence.level).toBe("medium");
    expect(cincinnati.confidence.missingReasons).toContain("missing final-eight netEpaPerPlay zScore");
    expect(cincinnati.classification).toBe("strong_improvement");
  });

  it("marks short final-eight windows as low confidence", () => {
    const finalWithShortWindow = clone(finalEight2025Artifact);
    const row = finalWithShortWindow.teams.find((team) => team.abbr === "sea")!;
    row.windowGames = row.windowGames.slice(0, 7);
    row.windowSize = 7;
    row.shortWindow = true;

    const seattle = getNflTrendRecord(
      "sea",
      buildNflTrendDataset({ finalEightArtifact: finalWithShortWindow })
    )!;

    expect(seattle.finalEight.windowSize).toBe(7);
    expect(seattle.confidence.level).toBe("low");
    expect(seattle.confidence.missingReasons).toContain(
      "final-eight window contains fewer than 8 games"
    );
  });

  it("locks representative real-team results without snapshotting every row", () => {
    const jacksonville = getNflTrendRecord("jax")!;
    const cincinnati = getNflTrendRecord("cin")!;
    const seattle = getNflTrendRecord("sea")!;
    const kansasCity = getNflTrendRecord("kc")!;

    expect(jacksonville.classification).toBe("strong_improvement");
    expect(jacksonville.deltas.rating).toBeGreaterThan(19);
    expect(jacksonville.finalEight.sourceTrajectoryLabel).toBe("Late Riser");

    expect(cincinnati.classification).toBe("strong_improvement");
    expect(cincinnati.deltas.rank).toBe(8);

    expect(seattle.classification).toBe("stable");
    expect(seattle.deltas.rank).toBe(0);

    expect(kansasCity.classification).toBe("strong_decline");
    expect(kansasCity.deltas.rating).toBeLessThan(-20);
    expect(kansasCity.finalEight.sourceTrajectoryLabel).toBe("Late Decline");
  });

  it("finds teams by team ID or abbreviation and returns null for unknown teams", () => {
    expect(getNflTrendRecord("nfl-jax")?.abbr).toBe("jax");
    expect(getNflTrendRecord("JAX")?.teamId).toBe("nfl-jax");
    expect(getNflTrendRecord("not-a-team")).toBeNull();
  });
});
