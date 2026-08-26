import { describe, expect, it } from "vitest";
import {
  applyStatusTreatments,
  buildRefinedCandidates,
  buildShadowCandidates,
  capConfidenceForBaselineSource,
  computeFpaAdjustment,
  computeF2PromotedModelRanks,
  computeHistoricalBaselineOptions,
  computeMarketAdjustment,
  computeTeamAdjustment,
  computeUsageAdjustment,
  selectEffectiveBaseline,
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

describe("Phase 3B: applyStatusTreatments", () => {
  it("Treatment A caps confidence but never changes PPG or excludes from rank", () => {
    const result = applyStatusTreatments("released", "high", 20);
    expect(result.A.effectiveConfidence).toBe("low");
    expect(result.A.effectivePpg).toBe(20);
    expect(result.A.excludedFromRank).toBe(false);
  });

  it("Treatment B scales PPG by the bounded status modifier but leaves confidence and rank exclusion untouched", () => {
    const result = applyStatusTreatments("released", "high", 20);
    expect(result.B.effectivePpg).toBeCloseTo(14, 5); // 20 * 0.7
    expect(result.B.effectiveConfidence).toBe("high");
    expect(result.B.excludedFromRank).toBe(false);
  });

  it("Treatment C excludes released/suspended from rank without touching PPG or confidence", () => {
    const result = applyStatusTreatments("released", "high", 20);
    expect(result.C.excludedFromRank).toBe(true);
    expect(result.C.effectivePpg).toBe(20);
    expect(result.C.effectiveConfidence).toBe("high");
  });

  it("Treatment D combines the confidence ceiling and rank exclusion, with no PPG modifier", () => {
    const result = applyStatusTreatments("released", "high", 20);
    expect(result.D.effectiveConfidence).toBe("low");
    expect(result.D.excludedFromRank).toBe(true);
    expect(result.D.effectivePpg).toBe(20);
  });

  it("never lowers a category's rank-exclusion for ambiguous categories (reserve/unknown/otherUnavailable stay non-excluded)", () => {
    for (const category of ["active", "reserve", "unknown", "otherUnavailable"] as const) {
      const result = applyStatusTreatments(category, "high", 20);
      expect(result.C.excludedFromRank).toBe(false);
      expect(result.D.excludedFromRank).toBe(false);
    }
  });

  it("active status imposes no confidence ceiling", () => {
    const result = applyStatusTreatments("active", "high", 20);
    expect(result.A.effectiveConfidence).toBe("high");
    expect(result.D.effectiveConfidence).toBe("high");
  });

  it("a null PPG stays null through every treatment", () => {
    const result = applyStatusTreatments("released", "none", null);
    expect(result.A.effectivePpg).toBeNull();
    expect(result.B.effectivePpg).toBeNull();
  });
});

describe("Phase 3B: selectEffectiveBaseline / capConfidenceForBaselineSource", () => {
  it("prefers the historical baseline when present, even if a fallback value also exists", () => {
    expect(selectEffectiveBaseline(15, 10)).toEqual({ ppg: 15, source: "historical-model" });
  });

  it("uses the fallback only when the historical baseline is null", () => {
    expect(selectEffectiveBaseline(null, 10)).toEqual({ ppg: 10, source: "fallback-par-consensus" });
  });

  it("reports 'none' when neither is available -- never fabricates a number", () => {
    expect(selectEffectiveBaseline(null, null)).toEqual({ ppg: null, source: "none" });
  });

  it("caps confidence at medium for a fallback-sourced baseline, regardless of how many adjustments resolved", () => {
    expect(capConfidenceForBaselineSource("high", "fallback-par-consensus")).toBe("medium");
    expect(capConfidenceForBaselineSource("low", "fallback-par-consensus")).toBe("low");
  });

  it("does not alter confidence for a real historical-model baseline", () => {
    expect(capConfidenceForBaselineSource("high", "historical-model")).toBe("high");
  });
});

describe("Phase 3B: buildRefinedCandidates", () => {
  it("F1 and F2 both equal the plain baseline PPG (status is a metadata overlay, not a PPG change)", () => {
    const [f1, f2] = buildRefinedCandidates(20, { factor: 1, applied: false, reason: "x" });
    expect(f1.projectedPpg).toBe(20);
    expect(f2.projectedPpg).toBe(20);
  });

  it("F3 applies the bounded FPA factor on top of the baseline", () => {
    const [, , f3] = buildRefinedCandidates(20, { factor: 1.1, applied: true, reason: null });
    expect(f3.projectedPpg).toBeCloseTo(22, 5);
    expect(f3.availableInputs).toEqual(["fpa"]);
  });

  it("F3 is null when the baseline itself is null, never fabricated from the FPA factor alone", () => {
    const [, , f3] = buildRefinedCandidates(null, { factor: 1.1, applied: true, reason: null });
    expect(f3.projectedPpg).toBeNull();
  });

  it("never includes usage/team/market as a component -- only FPA and the baseline", () => {
    const candidates = buildRefinedCandidates(20, { factor: 1, applied: false, reason: "x" });
    expect(candidates.map((c) => c.candidate)).toEqual(["F1", "F2", "F3"]);
  });
});

describe("computeF2PromotedModelRanks", () => {
  const player = (
    canonicalPlayerId: string,
    position: "RB" | "WR",
    currentOverallRank: number,
    f2Ppg: number,
    f2ParPerGame: number,
    rankEligible = true,
    candidateEParPerGame = 0,
  ) => ({
    canonicalPlayerId,
    position,
    currentOverallRank,
    rankEligible,
    candidates: [{ candidate: "E", shadowParPerGame: candidateEParPerGame }],
    refinedCandidates: [
      { candidate: "F1" as const, projectedPpg: f2Ppg, shadowParPerGame: f2ParPerGame },
      { candidate: "F2" as const, projectedPpg: f2Ppg, shadowParPerGame: f2ParPerGame },
      { candidate: "F3" as const, projectedPpg: f2Ppg, shadowParPerGame: f2ParPerGame },
    ],
  });

  it("derives both promoted ranks from F2 PAR/G across and within positions", () => {
    const ranks = computeF2PromotedModelRanks([
      player("rb-high", "RB", 20, 20, 8, true, -100),
      player("wr-mid", "WR", 10, 18, 6, true, 100),
      player("rb-low", "RB", 5, 15, 3, true, 200),
    ]);
    expect(ranks).toEqual([
      { canonicalPlayerId: "rb-high", shadowPositionRank: 1, shadowModelRank: 1 },
      { canonicalPlayerId: "wr-mid", shadowPositionRank: 1, shadowModelRank: 2 },
      { canonicalPlayerId: "rb-low", shadowPositionRank: 2, shadowModelRank: 3 },
    ]);
  });

  it("cannot change promoted ranks when Candidate E changes", () => {
    const inputs = [
      player("rb-one", "RB", 1, 20, 8, true, -100),
      player("rb-two", "RB", 2, 19, 7, true, 100),
    ];
    const before = computeF2PromotedModelRanks(inputs);
    const after = computeF2PromotedModelRanks(
      inputs.map((input) => ({
        ...input,
        candidates: input.candidates.map((candidate) => ({
          ...candidate,
          shadowParPerGame: candidate.shadowParPerGame * -10,
        })),
      })),
    );
    expect(after).toEqual(before);
  });

  it("applies R2 eligibility only to rank inclusion and leaves F2 projections untouched", () => {
    const released = player("released", "WR", 1, 22, 10, false, 999);
    const beforeF2 = structuredClone(released.refinedCandidates.find((candidate) => candidate.candidate === "F2"));
    expect(computeF2PromotedModelRanks([released, player("active", "WR", 2, 12, 0)])).toEqual([
      { canonicalPlayerId: "active", shadowPositionRank: 1, shadowModelRank: 1 },
    ]);
    expect(released.refinedCandidates.find((candidate) => candidate.candidate === "F2")).toEqual(beforeF2);
  });

  it("breaks exact F2 PAR/G ties deterministically by live rank then canonical id", () => {
    const ranks = computeF2PromotedModelRanks([
      player("z", "RB", 2, 20, 8),
      player("a", "WR", 1, 20, 8),
    ]);
    expect(ranks.find((rank) => rank.canonicalPlayerId === "a")?.shadowModelRank).toBe(1);
    expect(ranks.find((rank) => rank.canonicalPlayerId === "z")?.shadowModelRank).toBe(2);
  });
});
