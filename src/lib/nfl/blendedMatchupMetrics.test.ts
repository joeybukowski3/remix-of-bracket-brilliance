import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createBlendedMatchupMetrics, createSeasonComparisonMetrics } from "./blendedMatchupMetrics";
import { comparisonCompletedGames, type ComparisonCompletedGames } from "./comparisonCompletedGames";
import { getProjectionBlendWeights } from "./projectionBlendPolicy";
import { createObservedComparisonResolver, type ObservedComparisonValue } from "./observedComparisonMetrics";
import { rankProjectedMetric, type ProjectedMatchupMetricsArtifact } from "./projectedMatchupMetrics";
import { MATCHUP_CATEGORIES } from "./matchupCategoryAdvantage";
import { resolveCategoryMetrics, categoryResultFrom } from "@/components/nfl/matchups/matchupDisplayMetrics";
import { buildCurrentRatingBoard } from "./currentRating2026";
import { buildPublicProjectionBoard } from "./publicProjection2026";
import type { NflSeasonData } from "@/hooks/useNflSeasonData";
import type { NflMatchup } from "./matchups";
import type { EpaArtifact } from "./epaData";
import type { MatchupMetricsArtifact } from "./matchupMetricsData";
import type { SuccessRatesArtifact } from "./successRateData";

const read = (path: string) => JSON.parse(readFileSync(`public/data/nfl/${path}`, "utf8"));
const teams = read("teams.json").teams;
const stamp = "2026-09-20T00:00:00Z";
const key = "off.epaPerPlay";
function games(counts: Record<string, number>): ComparisonCompletedGames {
  return { generatedAt: stamp, version: "test", source: "test results",
    byTeam: new Map(teams.map(({ abbr }: { abbr: string }) => [abbr, Array.from({ length: counts[abbr] ?? 0 }, (_, i) => `${abbr}-${i}`)])) };
}
function projected(values: Record<string, number>, metricKey = key): ProjectedMatchupMetricsArtifact {
  const ranks = rankProjectedMetric(new Map(Object.entries(values)), metricKey.startsWith("def.") ? "lower-is-better" : "higher-is-better");
  return { schemaVersion: "nfl-projected-matchup-metrics-v1", season: 2026, horizon: "regular-season", generatedAt: stamp,
    asOf: "2026-09-01T00:00:00Z", projectionVersion: "synthetic", metrics: { [metricKey]: { source: "test prior", modelVersion: "test", producer: "test", definition: "test EPA", opponentAdjusted: false, dependsOnPowerRating: false } },
    teams: teams.map((t: { id: string; abbr: string }) => ({ teamId: t.id, abbr: t.abbr,
      metrics: values[t.abbr] == null ? {} : { [metricKey]: { value: values[t.abbr], rank: ranks.get(t.abbr)! } } })) };
}
function observed(value: number | null, ids: readonly string[]): ObservedComparisonValue {
  return { value, source: "test observed", version: "test", generatedAt: stamp, cutoff: stamp, gameIds: ids, precision: "raw" };
}
function make(counts: Record<string, number>, priors: Record<string, number>, actuals: Record<string, number>, metricKey = key) {
  const completed = games(counts);
  return createBlendedMatchupMetrics({ teams, completed, projected: projected(priors, metricKey), currentRating: null,
    observed: (abbr) => actuals[abbr] == null ? null : observed(actuals[abbr], completed.byTeam.get(abbr)!) });
}

describe("projection blend policy", () => {
  it.each([[0, 1, 0], [1, .8, .2], [2, .6, .4], [3, .4, .6], [4, .2, .8], [5, 0, 1], [17, 0, 1]])("%i completed games", (n, p, o) => {
    expect(getProjectionBlendWeights(n)).toEqual({ projectionWeight: p, observedWeight: o });
  });
  it.each([-1, .5, NaN, Infinity])("rejects invalid count %s", (count) => expect(() => getProjectionBlendWeights(count)).toThrow());
  it("allows explicit future family policies without changing the default", () => {
    expect(getProjectionBlendWeights(1, "epa", { version: "test", projectionWeights: [1, 0], families: { epa: [1, .9, 0] } }).projectionWeight).toBe(.9);
    expect(getProjectionBlendWeights(1, "epa").projectionWeight).toBe(.8);
  });
});

describe("generic raw blends", () => {
  it("uses unequal team samples then re-ranks raw values in both directions", () => {
    for (const metricKey of [key, "def.epaPerPlayAllowed"]) {
      const result = make({ bal: 2, ind: 1 }, { bal: .1, ind: .2 }, { bal: .8, ind: .1 }, metricKey);
      expect(result.resolve("bal", metricKey)?.value).toBeCloseTo(.38);
      expect(result.resolve("ind", metricKey)?.value).toBeCloseTo(.18);
      expect(result.resolve("bal", metricKey)?.rank).toBe(metricKey === key ? 1 : 2);
      expect(result.provenance("bal", metricKey)).toMatchObject({ completedGames: 2, weights: { projectionWeight: .6, observedWeight: .4 }, availableTeams: 2 });
      expect(result.provenance("bal", metricKey)?.excludedTeams).toHaveLength(30);
    }
  });
  it("ranks exact ties competitively, including display ties with unequal raw values", () => {
    const result = make({}, { bal: .05001, ind: .05002, atl: .05002, no: .01 }, {});
    expect(["ind", "atl", "bal", "no"].map((abbr) => result.resolve(abbr, key)?.rank)).toEqual([1, 1, 3, 4]);
    expect(result.resolve("bal", key)?.formattedValue).toBe(result.resolve("ind", key)?.formattedValue);
  });
  it("handles every missing-side state without renormalizing weights", () => {
    expect(make({}, { bal: .1 }, {}).resolve("bal", key)?.value).toBe(.1);
    expect(make({ bal: 1 }, { bal: .1 }, {}).resolve("bal", key)).toBeNull();
    expect(make({ bal: 1 }, {}, { bal: .2 }).resolve("bal", key)).toBeNull();
    expect(make({}, {}, {}).resolve("bal", key)).toBeNull();
    expect(make({ bal: 5 }, {}, { bal: .2 }).resolve("bal", key)?.value).toBe(.2);
    expect(make({ bal: 5 }, { bal: NaN }, { bal: .2 }).resolve("bal", key)?.value).toBe(.2);
    expect(make({}, { bal: .1 }, { bal: NaN }).resolve("bal", key)?.value).toBe(.1);
  });
  it("fails closed for unknown counts and stale/partial observed game samples", () => {
    const input = { teams, projected: projected({ bal: .1 }), currentRating: null, observed: () => observed(.3, []) };
    expect(createBlendedMatchupMetrics({ ...input, completed: null }).resolve("bal", key)).toBeNull();
    const result = createBlendedMatchupMetrics({ ...input, completed: games({ bal: 1 }) });
    expect(result.resolve("bal", key)).toBeNull();
    expect(result.provenance("bal", key)?.issue).toMatch(/sample differs/);
  });
  it("does not mix opponent-adjusted forecasts with raw observed definitions", () => {
    const prior = projected({ bal: .1 });
    prior.metrics[key].opponentAdjusted = true;
    const completed = games({ bal: 1 });
    const result = createBlendedMatchupMetrics({ teams, completed, projected: prior, currentRating: null,
      observed: () => observed(.2, completed.byTeam.get("bal")!) });
    expect(result.resolve("bal", key)).toBeNull();
    expect(result.provenance("bal", key)?.issue).toMatch(/adjusted observed counterpart/);
  });
});

describe("canonical results sample", () => {
  function data(): NflSeasonData {
    return { teams, games: [], results: [], gamesMeta: null,
      resultsMeta: { season: 2026, schemaVersion: "test", generatedAt: stamp, source: "test", week: 10, modelVersion: null, notes: [] } };
  }
  it("counts only unique final 2026 REG games; nominal week and byes do not advance a team", () => {
    const source = data();
    const game = { gameId: "a", season: 2026, week: 10, seasonType: "REG", homeAbbr: "bal", awayAbbr: "ind", homeScore: 0, awayScore: 0, final: true, winner: "TIE" };
    source.results = [game, { ...game, gameId: "b", awayAbbr: "atl" }, { ...game, gameId: "c", final: false },
      { ...game, gameId: "d", season: 2025 }, { ...game, gameId: "e", seasonType: "PRE" }, { ...game, gameId: "f", seasonType: "WC" }];
    const result = comparisonCompletedGames(source)!;
    expect(result.byTeam.get("bal")).toHaveLength(2);
    expect(result.byTeam.get("ind")).toHaveLength(1);
    source.results.push(game);
    expect(comparisonCompletedGames(source)).toBeNull();
  });
  it("does not turn a missing results artifact into zero games and rejects unresolved aliases", () => {
    expect(comparisonCompletedGames(null)).toBeNull();
    expect(comparisonCompletedGames({ ...data(), resultsMeta: null })).toBeNull();
    const source = data();
    source.results = [{ gameId: "a", season: 2026, week: 1, seasonType: "REG", homeAbbr: "LA", awayAbbr: "ind", homeScore: 1, awayScore: 0, final: true, winner: "LA" }];
    expect(comparisonCompletedGames(source)).toBeNull();
  });
});

describe("2026 observed adapter", () => {
  const empty = { conventional: null, epa: null, success: null, trench: null };
  it("treats partial observed metadata and missing window fields as unavailable", () => {
    const partial = { windows: { "season-current": { teams: { bal: { metrics: {} } } } } };
    const resolve = createObservedComparisonResolver({ ...empty, conventional: partial as unknown as MatchupMetricsArtifact }, 2026);
    expect(resolve("bal", "off.yardsPerPlay")).toBeNull();
    Object.assign(partial, { _meta: { currentSeason: 2026 } });
    expect(resolve("bal", "off.yardsPerPlay")).toBeNull();
  });
  it("never takes populated 2025 or historical blended windows", () => {
    const resolve = createObservedComparisonResolver({ conventional: read("matchup-metrics.json"), epa: read("matchup-epa.json"), success: read("matchup-success-rates.json"), trench: read("matchup-trench-metrics.json") }, 2026);
    expect(resolve("bal", key)?.value ?? null).toBeNull();
    const result = createBlendedMatchupMetrics({ teams, completed: games({ bal: 5 }), projected: null, currentRating: null, observed: resolve });
    expect(result.resolve("bal", key)).toBeNull();
  });
  it("prefers EPA totals, conventional raw values and raw success fractions", () => {
    const team = { gamesIncluded: 1, gameIds: ["bal-0"], seasons: [2026], through: { season: 2026, week: 1, dateUtc: stamp }, metrics: { [key]: [.05, 32], "off.yardsPerPlay": [5.1, 32] }, rawMetrics: { "off.yardsPerPlay": 5.123456 }, totals: { offense: { offEpa: 5.000123, offPlays: 100 } } };
    const meta = { currentSeason: 2026, schemaVersion: "test", generatedAt: stamp };
    const windows = { "season-current": { mode: "season", includePriorSeason: false, teams: { bal: team } } };
    const resolve = createObservedComparisonResolver({ ...empty,
      conventional: { _meta: meta, windows } as unknown as MatchupMetricsArtifact,
      epa: { _meta: meta, currentSeason: 2026, windows } as unknown as EpaArtifact,
      success: { _meta: meta, periods: { "2026-season": { bal: { gamesIncluded: 1, gameIds: ["bal-0"], metrics: { "off.successRate": { pct: 50, raw: .500123, rank: 32 } } } } } } as unknown as SuccessRatesArtifact,
    }, 2026);
    expect(resolve("bal", key)?.value).toBeCloseTo(.05000123, 10);
    expect(resolve("bal", "off.yardsPerPlay")?.value).toBe(5.123456);
    expect(resolve("bal", "off.successRate")?.value).toBeCloseTo(50.0123);
  });
  it("explicit full-2025 lens uses the full season instead of Last 8", () => {
    const artifact = read("matchup-metrics.json");
    const resolve = createSeasonComparisonMetrics(teams, createObservedComparisonResolver({ ...empty, conventional: artifact }, 2025));
    expect(resolve("bal", "off.yardsPerPlay")?.value).toBe(artifact.windows["prior-season-full"].teams.bal.metrics["off.yardsPerPlay"][0]);
  });
  it("observed-only trench presentation retains official finer-precision ranks", () => {
    const trench = read("matchup-trench-metrics.json");
    const resolve = createSeasonComparisonMetrics(teams, createObservedComparisonResolver({ ...empty, trench }, 2025));
    expect(resolve("bal", "off.passBlockWinRate")?.rank).toBe(trench.seasons["2025"].teams.bal.metrics["off.passBlockWinRate"].espnRank);
  });
});

it("passes canonical live Power Rating through exactly, without a second blend; excludes N/A categories", () => {
  const performance = read("2026/team-performance-analytics.json");
  const row = performance.teams.find((t: { team: string }) => t.team === "bal");
  row.gamesPlayed = 4;
  row.performance = { performanceRating: 80, offenseRating: 80, defenseRating: 80, performanceRank: 1, offenseRank: 1, defenseRank: 1 };
  const currentRating = buildCurrentRatingBoard({ season: 2026, v04Board: buildPublicProjectionBoard(read("2026/projected-power-ratings-v04.json")), preseasonV03: read("2026/preseason-power-ratings.json"), performanceAnalytics: performance });
  const blended = createBlendedMatchupMetrics({ teams, completed: games({ bal: 4 }), projected: null, observed: () => null, currentRating });
  expect(blended.resolve("bal", "team.overallRating")?.value).toBe(currentRating.teams.find((t) => t.abbr === "bal")!.rating);
  expect(blended.provenance("bal", "team.overallRating")?.weights?.projectionWeight).toBe(.25);
  const matchup = { away: { abbr: "bal", slug: "baltimore-ravens" }, home: { abbr: "ind", slug: "indianapolis-colts" } } as NflMatchup;
  const fallback = vi.fn(() => { throw new Error("Forbidden historical fallback"); });
  for (const category of MATCHUP_CATEGORIES) {
    const rows = resolveCategoryMetrics(category, matchup, { resolver: fallback, dedicated: { resolve: blended.resolve, label: "2026 Blended" } });
    expect(categoryResultFrom(category.id, rows).eligible).toBe(category.id === "overall" ? 1 : 0);
  }
  expect(fallback).not.toHaveBeenCalled();
});
