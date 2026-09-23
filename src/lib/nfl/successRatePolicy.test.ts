import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  SUCCESS_RATE_METRIC_KEYS,
  SUCCESS_TRANSITION_GAME_COUNT,
  collectPeriodValues,
  completedGamesFor,
  createSuccessRateResolver,
  describeSuccessPeriods,
  formatSuccessRate,
  isSuccessRateMetric,
  resolveSuccessPeriods,
  type SuccessMetricValue,
  type SuccessRatesArtifact,
} from "@/lib/nfl/successRateData";

describe("period policy", () => {
  it("shows only 2025 Last 8 before either team plays a 2026 game", () => {
    expect(resolveSuccessPeriods(0, 0)).toEqual(["2025-last8"]);
  });

  it("adds 2026 Season once any completed 2026 game exists", () => {
    expect(resolveSuccessPeriods(1, 0)).toEqual(["2025-last8", "2026-season"]);
    expect(resolveSuccessPeriods(0, 1)).toEqual(["2025-last8", "2026-season"]);
    expect(resolveSuccessPeriods(1, 1)).toEqual(["2025-last8", "2026-season"]);
  });

  it("stays on 2025 Last 8 + 2026 Season through five completed games", () => {
    for (let n = 1; n <= 5; n += 1) {
      expect(resolveSuccessPeriods(n, n), `${n} games`).toEqual(["2025-last8", "2026-season"]);
    }
  });

  it("does not transition when only one team has reached six games", () => {
    // The whole matchup must move together or the comparison is not comparable.
    expect(resolveSuccessPeriods(6, 5)).toEqual(["2025-last8", "2026-season"]);
    expect(resolveSuccessPeriods(5, 6)).toEqual(["2025-last8", "2026-season"]);
    expect(resolveSuccessPeriods(12, 3)).toEqual(["2025-last8", "2026-season"]);
  });

  it("transitions to 2026 Season + Last 5 once both teams reach six", () => {
    expect(resolveSuccessPeriods(6, 6)).toEqual(["2026-season", "2026-last5"]);
    expect(resolveSuccessPeriods(7, 6)).toEqual(["2026-season", "2026-last5"]);
  });

  it("stays on the 2026 pair deeper into the season", () => {
    expect(resolveSuccessPeriods(10, 10)).toEqual(["2026-season", "2026-last5"]);
    expect(resolveSuccessPeriods(17, 17)).toEqual(["2026-season", "2026-last5"]);
  });

  it("hides 2025 entirely after the transition", () => {
    expect(resolveSuccessPeriods(6, 6)).not.toContain("2025-last8");
  });

  it("uses the documented six-game threshold", () => {
    expect(SUCCESS_TRANSITION_GAME_COUNT).toBe(6);
    expect(resolveSuccessPeriods(SUCCESS_TRANSITION_GAME_COUNT - 1, 9)).toContain("2025-last8");
    expect(resolveSuccessPeriods(SUCCESS_TRANSITION_GAME_COUNT, 9)).not.toContain("2025-last8");
  });

  it("counts completed games, so a bye cannot trigger an early transition", () => {
    // A team in week 7 with a bye has 6 completed games; its opponent has 5.
    // Week numbers would say "both past week 6"; completed counts say otherwise.
    expect(resolveSuccessPeriods(6, 5)).toEqual(["2025-last8", "2026-season"]);
    // And a team on bye in week 7 still has only 5 completed games.
    expect(resolveSuccessPeriods(5, 5)).toEqual(["2025-last8", "2026-season"]);
  });

  it("treats negative or non-finite counts as zero", () => {
    expect(resolveSuccessPeriods(Number.NaN, Number.NaN)).toEqual(["2025-last8"]);
    expect(resolveSuccessPeriods(-3, -1)).toEqual(["2025-last8"]);
  });
});

describe("period explanation", () => {
  it("describes each state without repeating per row", () => {
    expect(describeSuccessPeriods(["2025-last8"])).toMatch(/final eight completed 2025/i);
    expect(describeSuccessPeriods(["2025-last8", "2026-season"])).toMatch(
      /2025 Last 8 alongside the developing 2026 season/i
    );
    expect(describeSuccessPeriods(["2026-season", "2026-last5"])).toMatch(
      /2026 season performance and each team's most recent five games/i
    );
  });
});

describe("metric identification", () => {
  it("recognises exactly the six RBSDM metrics", () => {
    expect(SUCCESS_RATE_METRIC_KEYS).toHaveLength(6);
    for (const key of SUCCESS_RATE_METRIC_KEYS) expect(isSuccessRateMetric(key)).toBe(true);
  });

  it("does not claim conventional or EPA metrics", () => {
    for (const key of ["off.yardsPerPlay", "off.epaPerPlay", "def.epaPerPlayAllowed", "off.passPlayRate"]) {
      expect(isSuccessRateMetric(key), key).toBe(false);
    }
  });
});

/**
 * Fixture-driven artifact/resolver coverage.
 *
 * These fixtures are hand-built, not read from the live
 * public/data/nfl/matchup-success-rates.json artifact, so the policy is
 * exercised at every stage of the season regardless of what the pipeline
 * has actually published this week. See the "live artifact" describe block
 * below for shape/provenance checks against the real, current-data file.
 */
function metric(pct: number, rank: number | null): SuccessMetricValue {
  return { pct, raw: pct / 100, rank };
}

function fixtureArtifact(
  periods: SuccessRatesArtifact["periods"],
  completedGameCounts: Record<string, Record<string, number>> = {}
): SuccessRatesArtifact {
  return {
    _meta: {
      schemaVersion: "test-fixture-v1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: "fixture",
      attribution: "fixture",
      endpoint: "fixture",
      currentSeason: 2026,
      priorSeason: 2025,
      completedGameCounts,
      notes: [],
    },
    periods,
  };
}

const PRESEASON_FIXTURE = fixtureArtifact(
  {
    "2025-last8": {
      ne: { gamesIncluded: 8, gameIds: ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8"], metrics: { "off.successRate": metric(50.5, 3) } },
    },
  },
  { "2026": { ne: 0 } }
);

const EARLY_SEASON_FIXTURE = fixtureArtifact(
  {
    "2025-last8": {
      ne: { gamesIncluded: 8, gameIds: [], metrics: { "off.successRate": metric(50.5, 3) } },
    },
    "2026-season": {
      ne: { gamesIncluded: 2, gameIds: ["2026_01_X_NE", "2026_02_NE_Y"], metrics: { "off.successRate": metric(41.9, 22) } },
    },
  },
  { "2026": { ne: 2 } }
);

const MATURE_SEASON_FIXTURE = fixtureArtifact(
  {
    "2026-season": {
      ne: { gamesIncluded: 8, gameIds: [], metrics: { "off.successRate": metric(44.1, 12) } },
    },
    "2026-last5": {
      ne: { gamesIncluded: 5, gameIds: [], metrics: { "off.successRate": metric(46.2, 9) } },
    },
  },
  { "2026": { ne: 8 } }
);

const MISSING_CURRENT_TEAM_FIXTURE = fixtureArtifact(
  {
    "2025-last8": {
      ne: { gamesIncluded: 8, gameIds: [], metrics: { "off.successRate": metric(50.5, 3) } },
    },
    "2026-season": {
      // "kc" has published 2026 data; "ne" has not reached the pipeline yet
      // even though the period itself exists for the league.
      kc: { gamesIncluded: 2, gameIds: [], metrics: { "off.successRate": metric(38.0, 25) } },
    },
  },
  { "2026": { kc: 2, ne: 0 } }
);

describe("fixture: preseason / zero completed 2026 games", () => {
  it("has no 2026-season entry at all", () => {
    expect(PRESEASON_FIXTURE.periods["2026-season"]).toBeUndefined();
  });

  it("reports zero completed 2026 games for the team", () => {
    expect(completedGamesFor(PRESEASON_FIXTURE, 2026, "ne")).toBe(0);
  });

  it("policy shows only 2025 Last 8 given zero completed games", () => {
    const periods = resolveSuccessPeriods(
      completedGamesFor(PRESEASON_FIXTURE, 2026, "ne"),
      completedGamesFor(PRESEASON_FIXTURE, 2026, "ne")
    );
    expect(periods).toEqual(["2025-last8"]);
  });

  it("resolver serves 2025 Last 8 and returns null for 2026 periods that don't exist yet", () => {
    const resolve = createSuccessRateResolver(PRESEASON_FIXTURE);
    expect(resolve("ne", "off.successRate", "2025-last8")).toEqual(metric(50.5, 3));
    expect(resolve("ne", "off.successRate", "2026-season")).toBeNull();
    expect(resolve("ne", "off.successRate", "2026-last5")).toBeNull();
  });
});

describe("fixture: early season (2026-season exists, team under six games)", () => {
  it("reports the team's actual completed-game count", () => {
    expect(completedGamesFor(EARLY_SEASON_FIXTURE, 2026, "ne")).toBe(2);
  });

  it("policy exposes both the prior and current periods together", () => {
    const completed = completedGamesFor(EARLY_SEASON_FIXTURE, 2026, "ne");
    expect(resolveSuccessPeriods(completed, completed)).toEqual(["2025-last8", "2026-season"]);
  });

  it("resolver serves both periods, never substituting one for the other", () => {
    const resolve = createSuccessRateResolver(EARLY_SEASON_FIXTURE);
    expect(resolve("ne", "off.successRate", "2025-last8")).toEqual(metric(50.5, 3));
    expect(resolve("ne", "off.successRate", "2026-season")).toEqual(metric(41.9, 22));
  });

  it("collects one value per visible period for the matchup-detail row", () => {
    const resolve = createSuccessRateResolver(EARLY_SEASON_FIXTURE);
    const values = collectPeriodValues(resolve, "ne", "off.successRate", ["2025-last8", "2026-season"]);
    expect(values["2025-last8"]).not.toBeNull();
    expect(values["2026-season"]).not.toBeNull();
  });
});

describe("fixture: mature season (6+ completed 2026 games)", () => {
  it("policy transitions to 2026 Season + Last 5 and hides 2025 entirely", () => {
    const completed = completedGamesFor(MATURE_SEASON_FIXTURE, 2026, "ne");
    expect(completed).toBe(8);
    const periods = resolveSuccessPeriods(completed, completed);
    expect(periods).toEqual(["2026-season", "2026-last5"]);
    expect(periods).not.toContain("2025-last8");
  });

  it("resolver serves both post-transition periods", () => {
    const resolve = createSuccessRateResolver(MATURE_SEASON_FIXTURE);
    expect(resolve("ne", "off.successRate", "2026-season")).toEqual(metric(44.1, 12));
    expect(resolve("ne", "off.successRate", "2026-last5")).toEqual(metric(46.2, 9));
  });

  it("returns null for 2025-last8 once the fixture no longer carries it", () => {
    const resolve = createSuccessRateResolver(MATURE_SEASON_FIXTURE);
    expect(resolve("ne", "off.successRate", "2025-last8")).toBeNull();
  });
});

describe("fixture: 2026-season period exists but the specific team is missing", () => {
  it("completedGamesFor falls back to zero for the missing team", () => {
    expect(completedGamesFor(MISSING_CURRENT_TEAM_FIXTURE, 2026, "ne")).toBe(0);
    expect(completedGamesFor(MISSING_CURRENT_TEAM_FIXTURE, 2026, "kc")).toBe(2);
  });

  it("resolver returns null for the missing team's 2026-season value rather than borrowing another team's", () => {
    const resolve = createSuccessRateResolver(MISSING_CURRENT_TEAM_FIXTURE);
    expect(resolve("ne", "off.successRate", "2026-season")).toBeNull();
    expect(resolve("kc", "off.successRate", "2026-season")).toEqual(metric(38.0, 25));
  });

  it("resolver still serves the missing team's 2025 Last 8 value", () => {
    const resolve = createSuccessRateResolver(MISSING_CURRENT_TEAM_FIXTURE);
    expect(resolve("ne", "off.successRate", "2025-last8")).toEqual(metric(50.5, 3));
  });
});

describe("resolver: general behavior", () => {
  it("returns null for unknown teams and non-RBSDM metrics", () => {
    const resolve = createSuccessRateResolver(EARLY_SEASON_FIXTURE);
    expect(resolve("zzz", "off.successRate", "2025-last8")).toBeNull();
    expect(resolve("ne", "off.yardsPerPlay", "2025-last8")).toBeNull();
  });

  it("degrades to all-null without an artifact", () => {
    const none = createSuccessRateResolver(null);
    expect(none("ne", "off.successRate", "2025-last8")).toBeNull();
  });
});

describe("display formatting", () => {
  it("formats to one decimal with a percent sign", () => {
    expect(formatSuccessRate({ pct: 50.5, raw: 0.505, rank: 2 })).toBe("50.5%");
    expect(formatSuccessRate({ pct: 34, raw: 0.34, rank: 1 })).toBe("34.0%");
  });

  it("shows N/A for a missing value rather than zero", () => {
    expect(formatSuccessRate(null)).toBe("N/A");
  });
});

/**
 * Live-artifact integration coverage: shape and provenance checks against
 * the real, currently-committed artifact. These assertions are
 * current-data-aware — they don't assume any particular week or how many
 * teams have started their 2026 season — so they stay valid as the pipeline
 * advances. Pure policy behavior (the resolver, the period transition rule)
 * is covered above with fixtures instead, independent of this file.
 */
describe("live artifact: shape and provenance", () => {
  const ROOT = resolve(__dirname, "../../..");
  const ARTIFACT: SuccessRatesArtifact = JSON.parse(
    readFileSync(join(ROOT, "public/data/nfl/matchup-success-rates.json"), "utf-8")
  );

  it("carries RBSDM provenance and attribution", () => {
    expect(ARTIFACT._meta.source).toMatch(/rbsdm/i);
    expect(ARTIFACT._meta.attribution).toMatch(/Ben Baldwin/i);
    expect(ARTIFACT._meta.endpoint).toBe("https://rbsdm.com/api/team-tiers");
  });

  it("contains the 2025 Last 8 period for all 32 teams", () => {
    const period = ARTIFACT.periods["2025-last8"]!;
    expect(Object.keys(period)).toHaveLength(32);
    for (const [abbr, team] of Object.entries(period)) {
      expect(team.gamesIncluded, abbr).toBe(8);
      expect(team.gameIds, abbr).toHaveLength(8);
      expect(Object.keys(team.metrics).sort(), abbr).toEqual([...SUCCESS_RATE_METRIC_KEYS].sort());
    }
  });

  it("stores unrounded source fractions alongside display percentages", () => {
    const ne = ARTIFACT.periods["2025-last8"]!.ne.metrics["off.successRate"];
    expect(ne.raw).toBeGreaterThan(0);
    expect(ne.raw).toBeLessThan(1);
    expect(ne.pct).toBeCloseTo(ne.raw * 100, 1);
  });

  it("ranks every team 1-32 within the 2025 Last 8 period for each metric", () => {
    const period = ARTIFACT.periods["2025-last8"]!;
    for (const key of SUCCESS_RATE_METRIC_KEYS) {
      const ranks = Object.values(period).map((t) => t.metrics[key]?.rank).filter((r): r is number => r != null);
      expect(ranks, key).toHaveLength(32);
      expect(Math.min(...ranks), key).toBe(1);
      expect(Math.max(...ranks), key).toBeLessThanOrEqual(32);
    }
  });

  it("ranks defensive success rate allowed lowest-first", () => {
    const period = ARTIFACT.periods["2025-last8"]!;
    const entries = Object.values(period)
      .map((t) => t.metrics["def.successRateAllowed"])
      .filter(Boolean);
    const best = entries.reduce((a, b) => (a.rank! < b.rank! ? a : b));
    const worst = entries.reduce((a, b) => (a.rank! > b.rank! ? a : b));
    expect(best.raw).toBeLessThan(worst.raw);
  });

  it("if a 2026 period is published, every team listed there has a positive completed-game count and a consistent shape", () => {
    for (const periodKey of ["2026-season", "2026-last5"] as const) {
      const period = ARTIFACT.periods[periodKey];
      if (!period) continue;
      for (const [abbr, team] of Object.entries(period)) {
        expect(completedGamesFor(ARTIFACT, 2026, abbr), abbr).toBeGreaterThan(0);
        expect(team.gamesIncluded, abbr).not.toBeNull();
        expect(team.gamesIncluded, abbr).toBeGreaterThan(0);
        expect(Object.keys(team.metrics).sort(), abbr).toEqual([...SUCCESS_RATE_METRIC_KEYS].sort());
      }
    }
  });

  it("keeps completed-game counts non-negative for every team the pipeline has recorded", () => {
    const counts2026 = ARTIFACT._meta.completedGameCounts["2026"] ?? {};
    for (const [abbr, count] of Object.entries(counts2026)) {
      expect(count, abbr).toBeGreaterThanOrEqual(0);
    }
  });
});
