import { describe, expect, it } from "vitest";
import {
  buildShadowCandidates,
  computeFpaAdjustment,
  computeHistoricalBaselineOptions,
  computeMarketAdjustment,
  computeTeamAdjustment,
  computeUsageAdjustment,
  shadowConfidence,
} from "@/lib/fantasy/rosResearch/shadowProjection";
import type { PlayerSeasonBaseline } from "@/lib/fantasy/rosResearch/historicalBaseline";
import type { SeasonUsageAverage } from "@/lib/fantasy/rosResearch/usageRoleContext";

function season(season: number, gamesPlayed: number, ppg: number): PlayerSeasonBaseline {
  return { season, gamesPlayed, totalFantasyPoints: ppg * gamesPlayed, ppg };
}

function usageSeason(season: number, targetShare: number | null, gamesWithStats = 17): SeasonUsageAverage {
  return {
    season,
    gamesWithStats,
    offensiveSnaps: { average: null, sampleSize: 0 },
    snapShare: { average: null, sampleSize: 0 },
    targets: { average: null, sampleSize: 0 },
    receptions: { average: null, sampleSize: 0 },
    rushAttempts: { average: null, sampleSize: 0 },
    targetShare: { average: targetShare, sampleSize: targetShare == null ? 0 : gamesWithStats },
    airYardsShare: { average: null, sampleSize: 0 },
  };
}

describe("computeHistoricalBaselineOptions", () => {
  it("latest-season option is exactly the most recent season's PPG", () => {
    const options = computeHistoricalBaselineOptions([season(2023, 10, 10), season(2024, 17, 20), season(2025, 17, 30)]);
    expect(options["latest-season"]).toEqual({ ppg: 30, seasonsUsed: [2025], weights: { 2025: 1 } });
  });

  it("recency-weighted option renormalizes weights over only the seasons present", () => {
    const options = computeHistoricalBaselineOptions([season(2024, 17, 20), season(2025, 17, 30)]);
    // weights 2025:0.5, 2024:0.3 renormalized over {2024,2025} -> 2025: 0.5/0.8=0.625, 2024: 0.3/0.8=0.375
    expect(options["recency-weighted"].weights!["2024"]).toBeCloseTo(0.375, 10);
    expect(options["recency-weighted"].weights!["2025"]).toBeCloseTo(0.625, 10);
    expect(options["recency-weighted"].ppg).toBeCloseTo(20 * 0.375 + 30 * 0.625, 10);
  });

  it("recency-weighted-min-sample excludes a season below the minimum-sample threshold", () => {
    const options = computeHistoricalBaselineOptions([season(2024, 17, 20), season(2025, 2, 99)]);
    // 2025 has only 2 games (< MIN_SAMPLE_GAMES=4), so it is excluded; only 2024 remains.
    expect(options["recency-weighted-min-sample"].seasonsUsed).toEqual([2024]);
    expect(options["recency-weighted-min-sample"].ppg).toBe(20);
    expect(options["recency-weighted-min-sample"].minSampleFallbackApplied).toBeFalsy();
  });

  it("falls back to an unweighted average of all available seasons when none meet the minimum-sample threshold, and flags the fallback", () => {
    const options = computeHistoricalBaselineOptions([season(2024, 2, 10), season(2025, 1, 40)]);
    expect(options["recency-weighted-min-sample"].minSampleFallbackApplied).toBe(true);
    expect(options["recency-weighted-min-sample"].ppg).toBeCloseTo(25, 10);
  });

  it("returns null across all options for a player with no history", () => {
    const options = computeHistoricalBaselineOptions([]);
    expect(options["latest-season"].ppg).toBeNull();
    expect(options["recency-weighted"].ppg).toBeNull();
    expect(options["recency-weighted-min-sample"].ppg).toBeNull();
  });

  it("does not mutate its input", () => {
    const seasons = [season(2024, 17, 20), season(2025, 17, 30)];
    const before = structuredClone(seasons);
    computeHistoricalBaselineOptions(seasons);
    expect(seasons).toEqual(before);
  });
});

describe("computeUsageAdjustment", () => {
  it("is neutral and flagged unavailable for QB (no reliable usage signal in the source)", () => {
    const result = computeUsageAdjustment("QB", [usageSeason(2024, 0.3), usageSeason(2025, 0.5)]);
    expect(result).toEqual({ factor: 1, applied: false, reason: expect.stringContaining("no reliable usage signal") });
  });

  it("is neutral when fewer than two seasons have a usable sample", () => {
    const result = computeUsageAdjustment("WR", [usageSeason(2025, 0.3)]);
    expect(result.applied).toBe(false);
    expect(result.factor).toBe(1);
  });

  it("is bounded by the usage cap even for an extreme target-share swing", () => {
    const result = computeUsageAdjustment("WR", [usageSeason(2024, 0.1), usageSeason(2025, 0.5)]); // 5x raw ratio
    expect(result.applied).toBe(true);
    expect(result.factor).toBeCloseTo(1.15, 10); // clamped to the configured +15% cap
  });

  it("reflects a real, bounded downward trend", () => {
    const result = computeUsageAdjustment("WR", [usageSeason(2024, 0.3), usageSeason(2025, 0.27)]);
    expect(result.applied).toBe(true);
    expect(result.factor).toBeCloseTo(0.9, 5);
  });

  it("never guesses a null usage sample as zero", () => {
    const result = computeUsageAdjustment("WR", [usageSeason(2024, null), usageSeason(2025, 0.3)]);
    expect(result.applied).toBe(false);
  });
});

describe("computeTeamAdjustment / computeMarketAdjustment", () => {
  const games = [
    { gameId: "1", week: 1, opponent: "gb", homeAway: "home" as const, impliedTeamTotal: 25 },
    { gameId: "2", week: 2, opponent: "chi", homeAway: "away" as const, impliedTeamTotal: 23 },
  ];

  it("is bounded and reflects a stronger-than-average team environment", () => {
    const result = computeTeamAdjustment(games, 20); // team avg 24 vs league avg 20 -> raw ratio 1.2, capped at 1.10
    expect(result.applied).toBe(true);
    expect(result.factor).toBeCloseTo(1.1, 10);
  });

  it("is neutral when a team has no rows at all", () => {
    const result = computeTeamAdjustment(undefined, 20);
    expect(result).toEqual({ factor: 1, applied: false, reason: expect.any(String) });
  });

  it("is neutral when a team has fewer games with market data than the configured minimum", () => {
    const result = computeTeamAdjustment([games[0]], 20);
    expect(result.applied).toBe(false);
  });

  it("market adjustment never fabricates a value when remaining-schedule coverage is thin", () => {
    const result = computeMarketAdjustment([], 20);
    expect(result.applied).toBe(false);
    expect(result.factor).toBe(1);
  });
});

describe("computeFpaAdjustment", () => {
  it("a favourable (higher points-allowed) remaining schedule produces a factor above 1", () => {
    const result = computeFpaAdjustment({ team: "min", position: "WR", remainingGames: 17, opponentsWithFpaData: 17, averagePointsAllowed: 26, games: [] }, 22);
    expect(result.applied).toBe(true);
    expect(result.factor).toBeGreaterThan(1);
  });

  it("a tougher (lower points-allowed) remaining schedule produces a factor below 1", () => {
    const result = computeFpaAdjustment({ team: "sf", position: "WR", remainingGames: 17, opponentsWithFpaData: 17, averagePointsAllowed: 18, games: [] }, 22);
    expect(result.applied).toBe(true);
    expect(result.factor).toBeLessThan(1);
  });

  it("is bounded by the FPA cap", () => {
    const result = computeFpaAdjustment({ team: "x", position: "TE", remainingGames: 1, opponentsWithFpaData: 1, averagePointsAllowed: 100, games: [] }, 10);
    expect(result.factor).toBeCloseTo(1.1, 10);
  });

  it("is neutral when there is no FPA row for the team/position", () => {
    const result = computeFpaAdjustment(undefined, 22);
    expect(result.applied).toBe(false);
  });
});

describe("buildShadowCandidates", () => {
  const neutralAdjustments = {
    usage: { factor: 1, applied: false, reason: "x" },
    team: { factor: 1, applied: false, reason: "x" },
    fpa: { factor: 1, applied: false, reason: "x" },
    market: { factor: 1, applied: false, reason: "x" },
  };

  it("candidate A ignores every adjustment and equals the baseline exactly", () => {
    const candidates = buildShadowCandidates(20, {
      usage: { factor: 1.15, applied: true, reason: null },
      team: { factor: 1.1, applied: true, reason: null },
      fpa: { factor: 0.9, applied: true, reason: null },
      market: { factor: 1.08, applied: true, reason: null },
    });
    const a = candidates.find((c) => c.candidate === "A")!;
    expect(a.projectedPpg).toBe(20);
    expect(a.adjustmentBreakdown).toEqual([]);
  });

  it("candidate E multiplies every applied factor together and clamps to the combined cap", () => {
    const candidates = buildShadowCandidates(20, {
      usage: { factor: 1.15, applied: true, reason: null },
      team: { factor: 1.1, applied: true, reason: null },
      fpa: { factor: 1.1, applied: true, reason: null },
      market: { factor: 1.08, applied: true, reason: null },
    });
    const e = candidates.find((c) => c.candidate === "E")!;
    const rawCombined = 1.15 * 1.1 * 1.1 * 1.08;
    expect(rawCombined).toBeGreaterThan(1.3); // confirms this scenario actually exercises the combined cap
    expect(e.combinedFactor).toBeCloseTo(1.3, 10);
    expect(e.combinedFactorClamped).toBe(true);
    expect(e.projectedPpg).toBeCloseTo(20 * 1.3, 10);
  });

  it("every candidate is null and explicitly missing the baseline when there is no historical PPG", () => {
    const candidates = buildShadowCandidates(null, neutralAdjustments);
    for (const candidate of candidates) {
      expect(candidate.projectedPpg).toBeNull();
      expect(candidate.missingInputs).toContain("historical-baseline");
    }
  });

  it("reports missing vs available inputs per candidate rather than silently defaulting", () => {
    const candidates = buildShadowCandidates(20, {
      usage: { factor: 1.05, applied: true, reason: null },
      team: { factor: 1, applied: false, reason: "no data" },
      fpa: { factor: 1.05, applied: true, reason: null },
      market: { factor: 1, applied: false, reason: "no data" },
    });
    const d = candidates.find((c) => c.candidate === "D")!;
    expect(d.availableInputs).toEqual(["usage", "fpa"]);
    expect(d.missingInputs).toEqual([]);
    const e = candidates.find((c) => c.candidate === "E")!;
    expect(e.availableInputs).toEqual(["usage", "fpa"]);
    expect(e.missingInputs).toEqual(["team", "market"]);
  });
});

describe("shadowConfidence", () => {
  it("is none when there is no baseline", () => {
    const [a] = buildShadowCandidates(null, {
      usage: { factor: 1, applied: false, reason: "x" },
      team: { factor: 1, applied: false, reason: "x" },
      fpa: { factor: 1, applied: false, reason: "x" },
      market: { factor: 1, applied: false, reason: "x" },
    });
    expect(shadowConfidence(a)).toBe("none");
  });

  it("is high for candidate A (baseline-only, nothing requested)", () => {
    const [a] = buildShadowCandidates(20, {
      usage: { factor: 1, applied: false, reason: "x" },
      team: { factor: 1, applied: false, reason: "x" },
      fpa: { factor: 1, applied: false, reason: "x" },
      market: { factor: 1, applied: false, reason: "x" },
    });
    expect(shadowConfidence(a)).toBe("high");
  });

  it("is low when every requested input for a candidate is missing", () => {
    const candidates = buildShadowCandidates(20, {
      usage: { factor: 1, applied: false, reason: "x" },
      team: { factor: 1, applied: false, reason: "x" },
      fpa: { factor: 1, applied: false, reason: "x" },
      market: { factor: 1, applied: false, reason: "x" },
    });
    const e = candidates.find((c) => c.candidate === "E")!;
    expect(shadowConfidence(e)).toBe("low");
  });
});
