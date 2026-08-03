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
  type SuccessRatesArtifact,
} from "@/lib/nfl/successRateData";

const ROOT = resolve(__dirname, "../../..");
const ARTIFACT: SuccessRatesArtifact = JSON.parse(
  readFileSync(join(ROOT, "public/data/nfl/matchup-success-rates.json"), "utf-8")
);

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

describe("generated artifact", () => {
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

  it("omits 2026 periods while no 2026 games are completed", () => {
    expect(ARTIFACT.periods["2026-season"]).toBeUndefined();
    expect(ARTIFACT.periods["2026-last5"]).toBeUndefined();
  });

  it("stores unrounded source fractions alongside display percentages", () => {
    const ne = ARTIFACT.periods["2025-last8"]!.ne.metrics["off.successRate"];
    expect(ne.raw).toBeGreaterThan(0);
    expect(ne.raw).toBeLessThan(1);
    expect(ne.pct).toBeCloseTo(ne.raw * 100, 1);
  });

  it("ranks every team 1-32 within the period for each metric", () => {
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

  it("reports zero completed 2026 games for every team", () => {
    for (const abbr of ["ne", "sea", "kc", "phi"]) {
      expect(completedGamesFor(ARTIFACT, 2026, abbr), abbr).toBe(0);
    }
  });
});

describe("resolver", () => {
  const resolve0 = createSuccessRateResolver(ARTIFACT);

  it("resolves a published value with its rank", () => {
    const value = resolve0("ne", "off.successRate", "2025-last8")!;
    expect(value.pct).toBeCloseTo(50.5, 1);
    expect(value.rank).toBeGreaterThanOrEqual(1);
  });

  it("returns null for an absent period rather than falling back to another", () => {
    expect(resolve0("ne", "off.successRate", "2026-season")).toBeNull();
    expect(resolve0("ne", "off.successRate", "2026-last5")).toBeNull();
  });

  it("returns null for unknown teams and non-RBSDM metrics", () => {
    expect(resolve0("zzz", "off.successRate", "2025-last8")).toBeNull();
    expect(resolve0("ne", "off.yardsPerPlay", "2025-last8")).toBeNull();
  });

  it("degrades to all-null without an artifact", () => {
    const none = createSuccessRateResolver(null);
    expect(none("ne", "off.successRate", "2025-last8")).toBeNull();
  });

  it("collects one value per visible period, leaving missing periods null", () => {
    const values = collectPeriodValues(resolve0, "ne", "off.successRate", ["2025-last8", "2026-season"]);
    expect(values["2025-last8"]).not.toBeNull();
    expect(values["2026-season"]).toBeNull();
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
