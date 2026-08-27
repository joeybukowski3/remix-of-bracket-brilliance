import { describe, expect, it } from "vitest";
import { EXPECTED_SCHEMA_VERSION, validateCurrentWeekProjectionArtifact } from "./validate-nfl-current-week-yardage-projections.mjs";

function baseArtifact(overrides = {}) {
  return {
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    season: 2026,
    week: 3,
    generatedAt: "2026-09-20T12:00:00.000Z",
    qa: {
      gamesExpected: 1,
      gamesResolved: 1,
      unresolvedIdentityRows: 0,
      excludedByEligibility: { passing: 0, rushing: 0, receiving: 0 },
    },
    rows: [
      { market: "passing", playerId: "gsis:qb1", gameId: "2026_03_NE_SEA", status: "projected", projectedYards: 245.5 },
      { market: "passing", playerId: "gsis:qb2", gameId: "2026_03_NE_SEA", status: "projected", projectedYards: 210.1 },
    ],
    ...overrides,
  };
}

const expectedGameIds = new Set(["2026_03_NE_SEA"]);
const expectations = { expectedSeason: 2026, expectedWeek: 3, expectedGameIds };

describe("validateCurrentWeekProjectionArtifact", () => {
  it("passes a well-formed artifact", () => {
    expect(validateCurrentWeekProjectionArtifact(baseArtifact(), expectations)).toEqual([]);
  });

  it("flags an unexpected schemaVersion", () => {
    const problems = validateCurrentWeekProjectionArtifact(baseArtifact({ schemaVersion: "wrong-v0" }), expectations);
    expect(problems.some((p) => p.includes("schemaVersion"))).toBe(true);
  });

  it("flags a season mismatch", () => {
    const problems = validateCurrentWeekProjectionArtifact(baseArtifact({ season: 2025 }), expectations);
    expect(problems.some((p) => p.includes("season mismatch"))).toBe(true);
  });

  it("flags a week mismatch", () => {
    const problems = validateCurrentWeekProjectionArtifact(baseArtifact({ week: 4 }), expectations);
    expect(problems.some((p) => p.includes("week mismatch"))).toBe(true);
  });

  it("flags a missing generatedAt", () => {
    const problems = validateCurrentWeekProjectionArtifact(baseArtifact({ generatedAt: undefined }), expectations);
    expect(problems.some((p) => p.includes("generatedAt"))).toBe(true);
  });

  it("flags duplicate market/player/game rows", () => {
    const artifact = baseArtifact();
    artifact.rows.push({ ...artifact.rows[0] });
    const problems = validateCurrentWeekProjectionArtifact(artifact, expectations);
    expect(problems.some((p) => p.includes("duplicate row"))).toBe(true);
  });

  it("flags non-zero unresolvedIdentityRows", () => {
    const artifact = baseArtifact();
    artifact.qa.unresolvedIdentityRows = 2;
    const problems = validateCurrentWeekProjectionArtifact(artifact, expectations);
    expect(problems.some((p) => p.includes("unresolvedIdentityRows"))).toBe(true);
  });

  it("flags a row referencing a gameId outside this week's schedule", () => {
    const artifact = baseArtifact();
    artifact.rows.push({ market: "rushing", playerId: "gsis:rb1", gameId: "2026_04_BUF_MIA", status: "projected", projectedYards: 60 });
    const problems = validateCurrentWeekProjectionArtifact(artifact, expectations);
    expect(problems.some((p) => p.includes("not in this week's schedule"))).toBe(true);
  });

  it("flags an expected game with zero rows", () => {
    const problems = validateCurrentWeekProjectionArtifact(
      baseArtifact(),
      { ...expectations, expectedGameIds: new Set(["2026_03_NE_SEA", "2026_03_BUF_MIA"]) },
    );
    expect(problems.some((p) => p.includes("zero rows"))).toBe(true);
  });

  it("flags qa.gamesExpected disagreeing with the independently-computed schedule count", () => {
    const artifact = baseArtifact();
    artifact.qa.gamesExpected = 2;
    artifact.qa.gamesResolved = 2;
    const problems = validateCurrentWeekProjectionArtifact(artifact, expectations);
    expect(problems.some((p) => p.includes("does not match the independently-computed schedule count"))).toBe(true);
  });

  it("flags qa.gamesResolved disagreeing with qa.gamesExpected", () => {
    const artifact = baseArtifact();
    artifact.qa.gamesResolved = 0;
    const problems = validateCurrentWeekProjectionArtifact(artifact, expectations);
    expect(problems.some((p) => p.includes("gamesResolved"))).toBe(true);
  });

  it("passes when passing-row shortfall is fully explained by a documented eligibility exclusion", () => {
    const artifact = baseArtifact();
    artifact.rows = [{ market: "passing", playerId: "gsis:qb1", gameId: "2026_03_NE_SEA", status: "projected", projectedYards: 245.5 }];
    artifact.qa.excludedByEligibility.passing = 1;
    expect(validateCurrentWeekProjectionArtifact(artifact, expectations)).toEqual([]);
  });

  it("flags an undocumented passing-row shortfall", () => {
    const artifact = baseArtifact();
    artifact.rows = [{ market: "passing", playerId: "gsis:qb1", gameId: "2026_03_NE_SEA", status: "projected", projectedYards: 245.5 }];
    const problems = validateCurrentWeekProjectionArtifact(artifact, expectations);
    expect(problems.some((p) => p.includes("passing coverage does not reconcile"))).toBe(true);
  });

  it("flags a non-finite projectedYards on a projected row", () => {
    const artifact = baseArtifact();
    artifact.rows[0].projectedYards = Number.NaN;
    const problems = validateCurrentWeekProjectionArtifact(artifact, expectations);
    expect(problems.some((p) => p.includes("non-finite projectedYards"))).toBe(true);
  });

  it("does not flag a non-finite projectedYards on a non-projected row", () => {
    const artifact = baseArtifact();
    artifact.rows[0].status = "eligibleInsufficientHistory";
    artifact.rows[0].projectedYards = null;
    artifact.qa.excludedByEligibility.passing = 0;
    const problems = validateCurrentWeekProjectionArtifact(artifact, expectations);
    expect(problems.some((p) => p.includes("non-finite projectedYards"))).toBe(false);
  });
});
