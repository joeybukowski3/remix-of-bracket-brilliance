import { describe, expect, it } from "vitest";
import { generateTeamPerformanceAnalytics } from "./generate-nfl-team-performance-analytics.mts";
import { validateTeamPerformanceAnalyticsArtifact } from "../src/lib/nfl/teamPerformanceAnalytics";
import { PERFORMANCE_SCALE_DIVISORS, PERFORMANCE_OVERALL_WEIGHTS } from "../src/lib/nfl/performanceComposite2026";

// These exercise the REAL production pipeline against the REAL 2026 season
// (zero completed games at the time this was written) and, where a season
// has no cache/results.json at all, a nonexistent season number to prove the
// generator degrades gracefully rather than fabricating anything.

describe("generateTeamPerformanceAnalytics — 2026 (real, zero completed games)", () => {
  it("1. produces exactly 32 teams with unique abbreviations", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    expect(artifact.teams).toHaveLength(32);
    expect(new Set(artifact.teams.map((t) => t.team)).size).toBe(32);
  });

  it("2. every team exposes all 9 offense + 9 defense metrics (both filter variants) in every window", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    const row = artifact.teams[0];
    for (const windowKey of ["last4", "last8", "fullSeason"] as const) {
      const w = row.windows[windowKey];
      for (const side of [w.offense.all, w.offense.filtered, w.defenseAllowed.all, w.defenseAllowed.filtered]) {
        for (const field of [
          "epaPerPlay", "successRate", "earlyDownEpaPerPlay", "earlyDownSuccessRate",
          "passEpaPerDropback", "passSuccessRate", "rushEpaPerPlay", "rushSuccessRate",
          "explosiveRate", "thirdDownEpaPerPlay", "thirdDownSuccessRate", "sackRate",
        ]) {
          expect(field in side).toBe(true);
        }
      }
    }
  });

  it("3. last4/last8/fullSeason windows all exist for every team", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    for (const row of artifact.teams) {
      expect(row.windows.last4).toBeDefined();
      expect(row.windows.last8).toBeDefined();
      expect(row.windows.fullSeason).toBeDefined();
    }
  });

  it("4. sample sizes are correct: 0 games played -> every window sampleSize is 0", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    for (const row of artifact.teams) {
      expect(row.gamesPlayed).toBe(0);
      expect(row.windows.last4.sampleSize).toBe(0);
      expect(row.windows.last8.sampleSize).toBe(0);
      expect(row.windows.fullSeason.sampleSize).toBe(0);
    }
  });

  it("5. never fabricates games: window sampleSize never exceeds gamesPlayed", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    for (const row of artifact.teams) {
      expect(row.windows.last4.sampleSize).toBeLessThanOrEqual(row.gamesPlayed);
      expect(row.windows.last8.sampleSize).toBeLessThanOrEqual(row.gamesPlayed);
      expect(row.windows.fullSeason.sampleSize).toBeLessThanOrEqual(row.gamesPlayed);
    }
  });

  it("6. zero-game season yields null performance ratings/ranks for every team", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    for (const row of artifact.teams) {
      expect(row.performance.offenseRating).toBeNull();
      expect(row.performance.offenseRank).toBeNull();
      expect(row.performance.defenseRating).toBeNull();
      expect(row.performance.defenseRank).toBeNull();
      expect(row.performance.performanceRating).toBeNull();
      expect(row.performance.performanceRank).toBeNull();
    }
  });

  it("7. zero-game season yields null raw metrics (not zero, not fabricated)", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    const row = artifact.teams[0];
    expect(row.windows.fullSeason.offense.filtered.epaPerPlay).toBeNull();
    expect(row.windows.fullSeason.offense.filtered.successRate).toBeNull();
    expect(row.windows.fullSeason.offense.all.explosiveRate).toBeNull();
  });

  it("8. artifact passes its own validator", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    expect(() => validateTeamPerformanceAnalyticsArtifact(artifact)).not.toThrow();
  });

  it("9. divisors in the artifact exactly match the approved Phase 5 constants (no re-fit)", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    expect(artifact._meta.scaleDivisors).toEqual(PERFORMANCE_SCALE_DIVISORS);
    expect(PERFORMANCE_SCALE_DIVISORS.offense).toBeCloseTo(0.92485, 5);
    expect(PERFORMANCE_SCALE_DIVISORS.defense).toBeCloseTo(0.86484, 5);
    expect(PERFORMANCE_SCALE_DIVISORS.overall).toBeCloseTo(0.72242, 5);
  });

  it("10. Overall weights are exactly 40/40/20", async () => {
    expect(PERFORMANCE_OVERALL_WEIGHTS).toEqual({ offense: 0.4, defense: 0.4, pointDifferential: 0.2 });
  });

  it("11. the generator is deterministic for the same input (ignoring generatedAt)", async () => {
    const a = await generateTeamPerformanceAnalytics(2026);
    const b = await generateTeamPerformanceAnalytics(2026);
    const strip = (x: typeof a) => ({ ...x, _meta: { ...x._meta, generatedAt: "STRIPPED" } });
    expect(strip(a)).toEqual(strip(b));
  });

  it("12. contains no preseason v0.4 or prior-season substitution for a zero-game season", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    // Every numeric performance/rating field must be null, never a plausible
    // prior-season/v0.4-scale number (which would typically land in [1,99]).
    for (const row of artifact.teams) {
      expect(Object.values(row.performance).every((v) => v === null)).toBe(true);
    }
    expect(artifact._meta.source).not.toMatch(/v0\.4|preseason/i);
  });

  it("13. fullSeason window carries opponent-adjusted fields; last4/last8 do not expose an adjusted block", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    const row = artifact.teams[0];
    expect(row.windows.fullSeason.adjusted).toBeDefined();
    expect("adjusted" in row.windows.last4).toBe(false);
    expect("adjusted" in row.windows.last8).toBe(false);
  });

  it("14. metric ranks exist for all 9 offense + 9 defense metrics on fullSeason with correct key set", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    const ranks = artifact.teams[0].windows.fullSeason.metricRanks;
    expect(Object.keys(ranks.offense).sort()).toEqual([
      "earlyDownEpaPerPlay", "earlyDownSuccessRate", "epaPerPlay", "explosiveRate",
      "passEpaPerDropback", "passSuccessRate", "rushEpaPerPlay", "rushSuccessRate", "sackRate", "successRate",
    ].sort());
    expect(Object.keys(ranks.defenseAllowed).sort()).toEqual(Object.keys(ranks.offense).sort());
  });

  it("15. schemaVersion is nfl-performance-v1", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    expect(artifact.schemaVersion).toBe("nfl-performance-v1");
  });

  it("16. _meta.season matches the requested season", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    expect(artifact._meta.season).toBe(2026);
  });

  it("17. teams are ordered by canonical abbreviation, not by rating (stable regardless of ties)", async () => {
    const artifact = await generateTeamPerformanceAnalytics(2026);
    const abbrs = artifact.teams.map((t) => t.team);
    expect(abbrs).toEqual([...abbrs].sort());
  });
});

describe("generateTeamPerformanceAnalytics — nonexistent season (no cache, no results.json)", () => {
  it("18. still produces exactly 32 teams, all zero-game, all null performance, without throwing", async () => {
    const artifact = await generateTeamPerformanceAnalytics(1899);
    expect(artifact.teams).toHaveLength(32);
    expect(artifact.teams.every((t) => t.gamesPlayed === 0)).toBe(true);
    expect(artifact.teams.every((t) => t.performance.performanceRating === null)).toBe(true);
  });

  it("19. does not throw when the compact cache and results.json are both absent", async () => {
    await expect(generateTeamPerformanceAnalytics(1899)).resolves.toBeDefined();
  });
});
