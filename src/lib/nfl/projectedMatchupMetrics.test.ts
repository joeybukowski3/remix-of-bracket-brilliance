import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createProjectedMatchupMetricResolver, rankProjectedMetric, validateProjectedMatchupMetrics, type ProjectedMatchupMetricsArtifact } from "./projectedMatchupMetrics";
import { loadProjectedMatchupMetrics } from "@/hooks/useNflProjectedMatchupMetrics";
import { buildCurrentRatingBoard } from "./currentRating2026";
import { buildPublicProjectionBoard } from "./publicProjection2026";
import { createHeroModelRatingResolver } from "./heroModelRatings";
import { MATCHUP_CATEGORIES } from "./matchupCategoryAdvantage";
import { resolveCategoryMetrics, categoryResultFrom } from "@/components/nfl/matchups/matchupDisplayMetrics";
import { createEpaResolver, composeMetricResolvers } from "./epaData";
import { createMatchupMetricResolver } from "./matchupMetricsData";
import { createSuccessRateResolver } from "./successRateData";
import { createTrenchResolver } from "./trenchMetricsData";
import type { NflMatchup } from "./matchups";

const read = (path: string) => JSON.parse(readFileSync(`public/data/nfl/${path}`, "utf8"));
const teams = read("teams.json").teams;
// Synthetic contract fixture only; not a prediction or production artifact.
function fixture(): ProjectedMatchupMetricsArtifact {
  return {
    schemaVersion: "nfl-projected-matchup-metrics-v1", season: 2026, horizon: "regular-season",
    asOf: "2026-09-01T00:00:00Z", generatedAt: "2026-09-02T00:00:00Z", projectionVersion: "test-only-v1",
    metrics: Object.fromEntries(["off.epaPerPlay", "def.epaPerPlayAllowed"].map((key) => [key, {
      source: "Synthetic test fixture", producer: "test", modelVersion: "test-only",
      definition: "Test unrounded EPA per play", opponentAdjusted: false, dependsOnPowerRating: false as const,
    }])),
    teams: teams.map((team: { id: string; abbr: string }) => ({ teamId: team.id, abbr: team.abbr, metrics: {} })),
  };
}

describe("projected comparison contract", () => {
  it("ranks unrounded values with competition ties, missing values and both directions", () => {
    const values = new Map([["bal", .05001], ["ind", .05002], ["atl", .05002], ["no", -.1], ["kc", NaN]]);
    expect(Object.fromEntries(rankProjectedMetric(values, "higher-is-better"))).toEqual({ ind: 1, atl: 1, bal: 3, no: 4 });
    expect(Object.fromEntries(rankProjectedMetric(values, "lower-is-better"))).toEqual({ no: 1, bal: 2, atl: 3, ind: 3 });
    expect([...rankProjectedMetric(values, "context-only").values()]).toEqual([null, null, null, null]);
  });

  it("keeps rounded display ties separate from ranks and compares projected direction", () => {
    const artifact = fixture();
    artifact.teams.find((t) => t.abbr === "bal")!.metrics = { "off.epaPerPlay": { value: .05001, rank: 2 }, "def.epaPerPlayAllowed": { value: -.1, rank: 1 } };
    artifact.teams.find((t) => t.abbr === "ind")!.metrics = { "off.epaPerPlay": { value: .05002, rank: 1 }, "def.epaPerPlayAllowed": { value: .1, rank: 2 } };
    const projected = createProjectedMatchupMetricResolver(validateProjectedMatchupMetrics(artifact, teams));
    expect(projected("bal", "off.epaPerPlay")?.formattedValue).toBe("+0.050");
    expect(projected("ind", "off.epaPerPlay")?.rank).toBe(1);
    const rows = resolveCategoryMetrics(MATCHUP_CATEGORIES[0], matchup, { resolver: vi.fn(() => { throw new Error("Historical fallback"); }), projected });
    expect(rows.find((r) => r.key === "off.epaPerPlay")?.comparison).toBe("home");
    expect(rows.find((r) => r.key === "def.epaPerPlayAllowed")?.comparison).toBe("away");
    expect(categoryResultFrom("overall", rows)).toMatchObject({ eligible: 2, awayLeads: 1, homeLeads: 1 });
  });

  it.each([
    ["wrong season", (a: ProjectedMatchupMetricsArtifact) => Object.assign(a, { season: 2025 })],
    ["wrong horizon", (a: ProjectedMatchupMetricsArtifact) => Object.assign(a, { horizon: "week" })],
    ["missing team", (a: ProjectedMatchupMetricsArtifact) => a.teams.pop()],
    ["duplicate team", (a: ProjectedMatchupMetricsArtifact) => { a.teams[1] = a.teams[0]; }],
    ["wrong identity", (a: ProjectedMatchupMetricsArtifact) => { a.teams[0].teamId = "nfl-wrong"; }],
    ["rank disagreement", (a: ProjectedMatchupMetricsArtifact) => { a.teams[0].metrics["off.epaPerPlay"] = { value: .1, rank: 2 }; }],
    ["nonfinite value", (a: ProjectedMatchupMetricsArtifact) => { a.teams[0].metrics["off.epaPerPlay"] = { value: Infinity, rank: 1 }; }],
    ["missing provenance", (a: ProjectedMatchupMetricsArtifact) => { a.teams[0].metrics["off.yardsPerPlay"] = { value: 5, rank: 1 }; }],
    ["rating duplication", (a: ProjectedMatchupMetricsArtifact) => { a.teams[0].metrics["team.overallRating"] = { value: 55, rank: 1 }; }],
    ["circular source", (a: ProjectedMatchupMetricsArtifact) => Object.assign(a.metrics["off.epaPerPlay"], { dependsOnPowerRating: true })],
  ])("rejects %s", (_, mutate) => {
    const artifact = fixture(); mutate(artifact);
    expect(() => validateProjectedMatchupMetrics(artifact, teams)).toThrow();
  });

  it("reads only the dedicated artifact; a missing file is unavailable", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await loadProjectedMatchupMetrics(teams, fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/data/nfl/2026/projected-matchup-metrics.json");
    expect(fetcher.mock.calls[0][1].cache).toBe("no-store");
    fetcher.mockResolvedValue(new Response(JSON.stringify({ season: 2025 })));
    await expect(loadProjectedMatchupMetrics(teams, fetcher)).rejects.toThrow();
  });
});

const matchup = { away: { abbr: "bal", slug: "bal" }, home: { abbr: "ind", slug: "ind" } } as NflMatchup;
describe("BAL vs IND projection isolation", () => {
  it("preserves every historical category and the canonical rating with no invented projections", () => {
    const modelRatings = createHeroModelRatingResolver(buildCurrentRatingBoard({ season: 2026,
      v04Board: buildPublicProjectionBoard(read("2026/projected-power-ratings-v04.json")),
      preseasonV03: read("2026/preseason-power-ratings.json"), performanceAnalytics: read("2026/team-performance-analytics.json"),
    }));
    const settings = { window: "season" as const, includePriorSeason: true };
    const map = new Map([["bal", "bal"], ["ind", "ind"]]);
    const sources = { modelRatings,
      resolver: composeMetricResolvers(createEpaResolver(read("matchup-epa.json"), settings, map), createMatchupMetricResolver(read("matchup-metrics.json"), settings, map)),
      successRate: { periods: ["2025-last8" as const], resolve: createSuccessRateResolver(read("matchup-success-rates.json")) },
      trench: { periods: ["2025-season" as const], resolve: createTrenchResolver(read("matchup-trench-metrics.json")) },
    };
    const historical = MATCHUP_CATEGORIES.map((c) => resolveCategoryMetrics(c, matchup, sources));
    expect(historical.map((rows, i) => categoryResultFrom(MATCHUP_CATEGORIES[i].id, rows).awayLeads)).toEqual([4, 4, 6, 10, 9, 3]);
    const blocked = vi.fn(() => { throw new Error("Projection read historical data"); });
    const projectionSources = { modelRatings, resolver: blocked,
      successRate: { ...sources.successRate, resolve: blocked }, trench: { ...sources.trench, resolve: blocked },
      projected: createProjectedMatchupMetricResolver(null),
    };
    for (const category of MATCHUP_CATEGORIES) {
      const rows = resolveCategoryMetrics(category, matchup, projectionSources);
      expect(categoryResultFrom(category.id, rows).eligible).toBe(category.id === "overall" ? 1 : 0);
      for (const row of rows) {
        if (row.key === "team.overallRating") {
          expect([row.away.formatted, row.home.formatted]).toEqual(["54.9", "60.1"]);
        } else expect([row.away.formatted, row.home.formatted]).toEqual(["N/A", "N/A"]);
      }
    }
    expect(blocked).not.toHaveBeenCalled();
    expect(MATCHUP_CATEGORIES.map((c) => resolveCategoryMetrics(c, matchup, sources))).toEqual(historical);
  });
});
