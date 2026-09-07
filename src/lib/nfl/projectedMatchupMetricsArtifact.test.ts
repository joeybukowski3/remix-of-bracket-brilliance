/**
 * Contract tests for the published 2026 projected comparison artifact.
 *
 * These read the real file rather than a fixture: the point is to prove that
 * what ships validates, covers all 32 teams, ranks the twelve EPA and
 * success-rate metrics correctly, feeds both consuming lenses, and does not
 * quietly borrow a 2025 observed value or the Power Rating.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBlendedMatchupMetrics } from "@/lib/nfl/blendedMatchupMetrics";
import { createProjectedMatchupMetricResolver, validateProjectedMatchupMetrics } from "@/lib/nfl/projectedMatchupMetrics";
import type { ObservedComparisonResolver } from "@/lib/nfl/observedComparisonMetrics";
import type { ComparisonCompletedGames } from "@/lib/nfl/comparisonCompletedGames";

const ROOT = process.cwd();
const TEAMS = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/teams.json"), "utf-8")).teams as
  { id: string; abbr: string }[];
const RAW = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/2026/projected-matchup-metrics.json"), "utf-8"));

const PROJECTED_KEYS = [
  "off.epaPerPlay", "def.epaPerPlayAllowed",
  "off.epaPerPass", "def.epaPerPassAllowed",
  "off.epaPerRush", "def.epaPerRushAllowed",
  "off.successRate", "def.successRateAllowed",
  "off.passSuccessRate", "def.passSuccessRateAllowed",
  "off.rushSuccessRate", "def.rushSuccessRateAllowed",
];

const artifact = validateProjectedMatchupMetrics(RAW, TEAMS);

describe("published 2026 projected matchup metrics", () => {
  it("validates against the shipped contract, including its rank cross-check", () => {
    expect(artifact.season).toBe(2026);
    expect(artifact.horizon).toBe("regular-season");
    expect(artifact.projectionVersion).toBe("nfl-projected-comparison-v1.0");
    expect(Date.parse(artifact.asOf)).toBeLessThanOrEqual(Date.parse(artifact.generatedAt));
  });

  it("publishes exactly the twelve EPA and success-rate metrics for all 32 teams", () => {
    expect(Object.keys(artifact.metrics).sort()).toEqual([...PROJECTED_KEYS].sort());
    expect(artifact.teams).toHaveLength(32);
    for (const team of artifact.teams) {
      expect(Object.keys(team.metrics).sort()).toEqual([...PROJECTED_KEYS].sort());
      for (const key of PROJECTED_KEYS) {
        const metric = team.metrics[key];
        expect(Number.isFinite(metric?.value)).toBe(true);
        expect(metric?.rank).toBeGreaterThanOrEqual(1);
        expect(metric?.rank).toBeLessThanOrEqual(32);
      }
    }
  });

  it("assigns each metric a complete 1..32 rank permutation", () => {
    for (const key of PROJECTED_KEYS) {
      const ranks = artifact.teams.map((team) => team.metrics[key]!.rank).sort((a, b) => a! - b!);
      expect(ranks).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
    }
  });

  it("declares provenance that is neither opponent-adjusted nor Power-Rating derived", () => {
    for (const key of PROJECTED_KEYS) {
      const provenance = artifact.metrics[key];
      expect(provenance.opponentAdjusted).toBe(false);
      expect(provenance.dependsOnPowerRating).toBe(false);
      expect(provenance.producer).toBe("scripts/generate-nfl-projected-matchup-metrics.mjs");
      expect(provenance.source).toMatch(/nflverse/);
    }
  });

  it("keeps success rates on the observed percent scale and EPA on the per-play scale", () => {
    for (const team of artifact.teams) {
      for (const key of PROJECTED_KEYS) {
        const { value } = team.metrics[key]!;
        if (key.toLowerCase().includes("success")) expect(value).toBeGreaterThan(20);
        else expect(Math.abs(value)).toBeLessThan(1);
      }
    }
  });

  it("differs from the 2025 observed values it was built from, so no lens falls back to last season", () => {
    const epa = JSON.parse(readFileSync(join(ROOT, "public/data/nfl/matchup-epa.json"), "utf-8"));
    const priorSeason = epa.windows["prior-season-full"].teams;
    const identical = artifact.teams.filter((team) => {
      const totals = priorSeason[team.abbr].totals;
      return totals.offense.offEpa / totals.offense.offPlays === team.metrics["off.epaPerPlay"]!.value;
    });
    expect(identical).toHaveLength(0);
  });
});

describe("projection and blended resolvers consume the artifact", () => {
  it("resolves every projected metric through the Projection lens resolver", () => {
    const resolve = createProjectedMatchupMetricResolver(artifact);
    for (const key of PROJECTED_KEYS) {
      const metric = resolve("bal", key);
      expect(metric?.value).toBe(artifact.teams.find((team) => team.abbr === "bal")!.metrics[key]!.value);
      expect(metric?.formattedValue).not.toBe("N/A");
      expect(metric?.source).toMatch(/nflverse/);
    }
    expect(resolve("bal", "off.yardsPerPlay")).toBeNull();
    expect(resolve("bal", "team.overallRating")).toBeNull();
  });

  it("uses the projection at full weight before any 2026 game is played", () => {
    const completed: ComparisonCompletedGames = {
      source: "test", version: "test", generatedAt: "2026-09-01T00:00:00.000Z",
      byTeam: new Map(TEAMS.map((team) => [team.abbr, []])),
    } as ComparisonCompletedGames;
    const observed: ObservedComparisonResolver = () => null;
    const { resolve, provenance } = createBlendedMatchupMetrics({
      teams: TEAMS, projected: artifact, observed, completed, currentRating: null,
    });
    for (const key of PROJECTED_KEYS) {
      const record = provenance("bal", key)!;
      expect(record.weights).toEqual({ projectionWeight: 1, observedWeight: 0 });
      expect(record.issue).toBeNull();
      expect(resolve("bal", key)?.value).toBe(record.projectedValue);
    }
  });

  it("does not blend the Power Rating a second time", () => {
    const completed: ComparisonCompletedGames = {
      source: "test", version: "test", generatedAt: "2026-09-01T00:00:00.000Z",
      byTeam: new Map(TEAMS.map((team) => [team.abbr, []])),
    } as ComparisonCompletedGames;
    const { provenance } = createBlendedMatchupMetrics({
      teams: TEAMS, projected: artifact, observed: () => null, completed, currentRating: null,
    });
    const rating = provenance("bal", "team.overallRating")!;
    expect(rating.mode).toBe("modelManaged");
    expect(rating.policyVersion).toBeNull();
    expect(artifact.metrics["team.overallRating"]).toBeUndefined();
  });
});
