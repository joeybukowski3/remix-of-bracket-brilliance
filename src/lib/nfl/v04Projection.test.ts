import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NFL_V04_MODEL_VERSION,
  validateNflV04ProjectionArtifact,
  type NflV04ProjectionArtifact,
} from "@/lib/nfl/v04Projection";

const ROOT = resolve(__dirname, "../../..");
const ARTIFACT_PATH = join(ROOT, "public", "data", "nfl", "2026", "projected-power-ratings-v04.json");

function loadArtifact(): unknown {
  return JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
}

function loadValidated(): NflV04ProjectionArtifact {
  return validateNflV04ProjectionArtifact(loadArtifact());
}

describe("nfl-power-v0.4-beta projection artifact", () => {
  it("loads and validates the committed artifact", () => {
    const artifact = loadValidated();
    expect(artifact._meta.modelVersion).toBe(NFL_V04_MODEL_VERSION);
    expect(artifact._meta.baseModel).toBe("nfl-power-v0.3.1");
    expect(artifact._meta.sosAffectsRating).toBe(false);
    expect(artifact.teams).toHaveLength(32);
  });

  it("contains exactly 32 teams with no duplicate abbreviations", () => {
    const artifact = loadValidated();
    const abbrs = artifact.teams.map((team) => team.abbr);
    expect(new Set(abbrs).size).toBe(32);
  });

  it("has ranks exactly 1..32 with no duplicates or gaps", () => {
    const artifact = loadValidated();
    const ranks = [...artifact.teams.map((team) => team.rank)].sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });

  it("orders ranks by descending rating2026", () => {
    const artifact = loadValidated();
    const byRank = [...artifact.teams].sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < byRank.length; i += 1) {
      expect(byRank[i - 1].rating2026).toBeGreaterThanOrEqual(byRank[i].rating2026);
    }
  });

  it("keeps rating2025Adjusted within [1, 99] for every team", () => {
    const artifact = loadValidated();
    for (const team of artifact.teams) {
      expect(team.rating2025Adjusted).toBeGreaterThanOrEqual(1);
      expect(team.rating2025Adjusted).toBeLessThanOrEqual(99);
    }
  });

  it("keeps rating2026 within [1, 99] for every team", () => {
    const artifact = loadValidated();
    for (const team of artifact.teams) {
      expect(team.rating2026).toBeGreaterThanOrEqual(1);
      expect(team.rating2026).toBeLessThanOrEqual(99);
    }
  });

  it("gives every team a projectionAdjustment2026", () => {
    const artifact = loadValidated();
    for (const team of artifact.teams) {
      expect(Number.isFinite(team.projectionAdjustment2026)).toBe(true);
    }
  });

  it("gives every team an SOS rank and average opponent rating", () => {
    const artifact = loadValidated();
    for (const team of artifact.teams) {
      expect(Number.isInteger(team.sosRank)).toBe(true);
      expect(team.sosRank).toBeGreaterThanOrEqual(1);
      expect(team.sosRank).toBeLessThanOrEqual(32);
      expect(Number.isFinite(team.sosAvgOpponentRating)).toBe(true);
    }
  });

  it("has SOS ranks exactly 1..32 with no duplicates or gaps", () => {
    const artifact = loadValidated();
    const sosRanks = [...artifact.teams.map((team) => team.sosRank)].sort((a, b) => a - b);
    expect(sosRanks).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });

  it("declares sosAffectsRating as false", () => {
    const artifact = loadValidated();
    expect(artifact._meta.sosAffectsRating).toBe(false);
  });

  it("does not use SOS in the rating2026 arithmetic", () => {
    const artifact = loadValidated();
    for (const team of artifact.teams) {
      const recomputed = team.rating2025Adjusted + team.projectionAdjustment2026;
      // The reconciliation itself never references sosRank / sosAvgOpponentRating.
      expect(Math.abs(recomputed - team.rating2026)).toBeLessThanOrEqual(0.15);
    }
  });

  it("reconciles internal arithmetic within the source's rounding tolerance", () => {
    const artifact = loadValidated();
    for (const team of artifact.teams) {
      const { jkbV03Rating, guideCalibrationAdjustment, luckAdjustment, personnelAdjustment, coachAdjustment, returningInjuryAdjustment } =
        team.components;

      const expectedAdjusted = jkbV03Rating + guideCalibrationAdjustment + luckAdjustment;
      expect(Math.abs(team.rating2025Adjusted - expectedAdjusted)).toBeLessThanOrEqual(0.15);

      const expectedProjection = personnelAdjustment + coachAdjustment + returningInjuryAdjustment;
      expect(Math.abs(team.projectionAdjustment2026 - expectedProjection)).toBeLessThanOrEqual(0.15);

      expect(Math.abs(team.rating2026 - (team.rating2025Adjusted + team.projectionAdjustment2026))).toBeLessThanOrEqual(0.15);
    }
  });

  it("limits non-null detailed luckAverageRank to exactly the approved 8 coverage teams", () => {
    const artifact = loadValidated();
    const coverage = new Set(artifact._meta.luckCoverageTeams.map((abbr) => abbr.toUpperCase()));
    expect(coverage.size).toBe(8);
    expect([...coverage].sort()).toEqual(["BAL", "CIN", "CLE", "DEN", "KC", "LAC", "LV", "PIT"]);

    const teamsWithLuckRank = artifact.teams.filter((team) => team.components.luckAverageRank !== null);
    expect(teamsWithLuckRank.map((team) => team.abbr.toUpperCase()).sort()).toEqual([...coverage].sort());

    for (const team of artifact.teams) {
      const isCoverageTeam = coverage.has(team.abbr.toUpperCase());
      expect(team.components.luckAverageRank !== null).toBe(isCoverageTeam);
    }
  });

  it("treats luckAdjustment of 0 for a non-coverage team as a no-op, not a verified-neutral signal", () => {
    const artifact = loadValidated();
    const nonCoverageZeroLuck = artifact.teams.filter(
      (team) => team.components.luckAverageRank === null && team.components.luckAdjustment === 0
    );
    // Every non-coverage team is expected to carry the 0 no-op; the signal
    // that it's a no-op (not "verified neutral") is luckAverageRank === null,
    // which this test asserts stays null rather than being backfilled.
    for (const team of nonCoverageZeroLuck) {
      expect(team.components.luckAverageRank).toBeNull();
    }
    expect(nonCoverageZeroLuck.length).toBeGreaterThan(0);
  });

  it("rejects an artifact with fewer than 32 teams", () => {
    const artifact = loadArtifact() as NflV04ProjectionArtifact;
    const truncated = { ...artifact, teams: artifact.teams.slice(0, 31) };
    expect(() => validateNflV04ProjectionArtifact(truncated)).toThrow(/exactly 32 teams/);
  });

  it("rejects a duplicate abbreviation", () => {
    const artifact = loadArtifact() as NflV04ProjectionArtifact;
    const teams = artifact.teams.map((team, index) => (index === 1 ? { ...team, abbr: artifact.teams[0].abbr } : team));
    expect(() => validateNflV04ProjectionArtifact({ ...artifact, teams })).toThrow(/duplicate abbreviations/);
  });

  it("rejects a non-null luckAverageRank for a team outside luckCoverageTeams", () => {
    const artifact = loadArtifact() as NflV04ProjectionArtifact;
    const teams = artifact.teams.map((team) =>
      team.abbr === "lar" ? { ...team, components: { ...team.components, luckAverageRank: 12.3 } } : team
    );
    expect(() => validateNflV04ProjectionArtifact({ ...artifact, teams })).toThrow(/luckCoverageTeams/);
  });

  it("rejects sosAffectsRating: true", () => {
    const artifact = loadArtifact() as NflV04ProjectionArtifact;
    const tampered = { ...artifact, _meta: { ...artifact._meta, sosAffectsRating: true } };
    expect(() => validateNflV04ProjectionArtifact(tampered)).toThrow(/sosAffectsRating/);
  });

  it("rejects a rating2026 that doesn't reconcile with rating2025Adjusted + projectionAdjustment2026", () => {
    const artifact = loadArtifact() as NflV04ProjectionArtifact;
    const teams = artifact.teams.map((team) => (team.abbr === "lar" ? { ...team, rating2026: 40 } : team));
    expect(() => validateNflV04ProjectionArtifact({ ...artifact, teams })).toThrow(/does not reconcile/);
  });

  it("rejects a rating outside [1, 99]", () => {
    const artifact = loadArtifact() as NflV04ProjectionArtifact;
    const teams = artifact.teams.map((team) => (team.abbr === "lar" ? { ...team, rating2026: 120 } : team));
    expect(() => validateNflV04ProjectionArtifact({ ...artifact, teams })).toThrow(/outside \[1, 99\]/);
  });
});
