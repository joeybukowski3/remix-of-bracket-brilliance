import { describe, expect, it } from "vitest";
import {
  americanToImpliedProbability,
  buildPrimaryReason,
  compareMlSocialRows,
  computeCompleteness,
  formatEdgePoints,
  formatMarketPct,
  getComponentBand,
  getComponentEdges,
  getEdgeGrade,
  getFormEdge,
  noVigProbability,
  parseRecordWinPct,
  renormalizeWeights,
  type MlSocialRow,
} from "./mlbSocialEdge";
import { computeModelEdge, type ModelEdgeResult, type ModelFactor } from "./mlbModelEdge";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";

// --- helpers ---------------------------------------------------------------

function factor(label: string, weightedDifference: number): ModelFactor {
  return { label, awayScore: 50, homeScore: 50, weight: 0.2, weightedDifference, description: "" };
}

function makeEdge(
  pick: ModelEdgeResult["pick"],
  diffs: Partial<Record<string, number>>,
  confidence = 65,
): ModelEdgeResult {
  const factors: ModelFactor[] = [
    factor("Pitcher Quality", diffs["Pitcher Quality"] ?? 0),
    factor("Matchup Edge", diffs["Matchup Edge"] ?? 0),
    factor("Lineup Offense", diffs["Lineup Offense"] ?? 0),
    factor("Recent Form", diffs["Recent Form"] ?? 0),
    factor("Season Quality", diffs["Season Quality"] ?? 0),
  ];
  const differential = Math.abs(factors.reduce((s, f) => s + f.weightedDifference, 0));
  return {
    pick, awayAbbr: "AWY", homeAbbr: "HOM", confidence,
    differential: Math.round(differential), factors, topFactor: "Pitcher Quality", summary: "",
  };
}

// --- American odds → implied probability ----------------------------------

describe("americanToImpliedProbability", () => {
  it("converts favorite / underdog odds correctly", () => {
    expect(americanToImpliedProbability("-136")).toBeCloseTo(0.5763, 4);
    expect(americanToImpliedProbability("+120")).toBeCloseTo(0.4545, 4);
    expect(americanToImpliedProbability(-110)).toBeCloseTo(0.5238, 4);
  });
  it("returns null for missing/invalid odds (fails safe)", () => {
    for (const v of [null, undefined, "", "abc", 0]) {
      expect(americanToImpliedProbability(v as never)).toBeNull();
    }
  });
});

// --- two-sided no-vig probability -----------------------------------------

describe("noVigProbability", () => {
  it("normalizes the overround out of a two-sided market", () => {
    const pick = americanToImpliedProbability("-136")!;
    const opp = americanToImpliedProbability("+120")!;
    const noVig = noVigProbability(pick, opp)!;
    expect(noVig).toBeCloseTo(0.5590, 4);
    expect(noVig).toBeLessThan(pick);
  });
  it("is symmetric — pick and opponent no-vig sum to 1", () => {
    const pick = americanToImpliedProbability("-150")!;
    const opp = americanToImpliedProbability("+130")!;
    expect(noVigProbability(pick, opp)! + noVigProbability(opp, pick)!).toBeCloseTo(1, 10);
  });
  it("returns null when the opposite side is missing (fails safe)", () => {
    const pick = americanToImpliedProbability("-136")!;
    expect(noVigProbability(pick, null)).toBeNull();
    expect(noVigProbability(null, pick)).toBeNull();
  });
  it("does not double-scale — a fair 50/50 market stays 0.5", () => {
    const even = americanToImpliedProbability("+100")!;
    expect(noVigProbability(even, even)).toBeCloseTo(0.5, 10);
  });
});

// --- component edges: Pitching/Batting/Other, additivity -------------------

describe("getComponentEdges", () => {
  it("groups Pitching = Pitcher Quality, Batting = Matchup + Lineup Offense", () => {
    const edge = makeEdge("away", {
      "Pitcher Quality": 4, "Matchup Edge": 1.5, "Lineup Offense": 0.5,
      "Recent Form": -0.4, "Season Quality": -0.2,
    });
    const c = getComponentEdges(edge);
    expect(c.pitching).toBeCloseTo(4, 10);
    expect(c.batting).toBeCloseTo(2, 10);
  });

  it("Pitching + Batting + Other == Model Edge (additive identity)", () => {
    const edge = makeEdge("away", {
      "Pitcher Quality": 3.1, "Matchup Edge": 1.2, "Lineup Offense": -0.7,
      "Recent Form": 0.9, "Season Quality": 0.3,
    });
    const c = getComponentEdges(edge);
    expect((c.pitching ?? 0) + (c.batting ?? 0) + c.other).toBeCloseTo(c.overall, 10);
  });

  it("Other retains the model's internal recent-form + season quality (season not discarded)", () => {
    const edge = makeEdge("away", { "Recent Form": 1.1, "Season Quality": 0.4 });
    const c = getComponentEdges(edge);
    expect(c.other).toBeCloseTo(1.5, 10);
  });

  it("orients components toward the selected team for a home pick", () => {
    const away = makeEdge("away", { "Pitcher Quality": 5 });
    const home = makeEdge("home", { "Pitcher Quality": -5 });
    expect(getComponentEdges(away).pitching).toBeCloseTo(5, 10);
    expect(getComponentEdges(home).pitching).toBeCloseTo(5, 10);
  });

  it("selected favored vs opponent favored in pitching", () => {
    expect(getComponentEdges(makeEdge("away", { "Pitcher Quality": 6 })).pitching!).toBeGreaterThan(0);
    expect(getComponentEdges(makeEdge("away", { "Pitcher Quality": -6 })).pitching!).toBeLessThan(0);
  });

  it("returns null (not 0) for a component whose factors are entirely absent", () => {
    const edge = makeEdge("away", { "Pitcher Quality": 3 });
    edge.factors = edge.factors.filter((f) => f.label === "Pitcher Quality" || f.label === "Season Quality");
    const c = getComponentEdges(edge);
    expect(c.batting).toBeNull();
    expect(c.pitching).toBeCloseTo(3, 10);
    // Identity still closes using the model's real total.
    expect((c.pitching ?? 0) + (c.batting ?? 0) + c.other).toBeCloseTo(c.overall, 10);
  });

  it("real dev fixture: identity holds and matches model differential magnitude", () => {
    const edge = computeModelEdge(DEV_MLB_MATCHUP_FIXTURE.detail);
    const c = getComponentEdges(edge);
    expect((c.pitching ?? 0) + (c.batting ?? 0) + c.other).toBeCloseTo(c.overall, 6);
    expect(Math.abs(c.overall)).toBeCloseTo(edge.differential, 0);
  });
});

// --- Form Edge: recent-window only, season excluded ------------------------

describe("parseRecordWinPct", () => {
  it("parses a W-L record to a win fraction", () => {
    expect(parseRecordWinPct("10-4")).toBeCloseTo(10 / 14, 10);
    expect(parseRecordWinPct("3-2")).toBeCloseTo(0.6, 10);
  });
  it("returns null for missing / zero-game / invalid records", () => {
    for (const v of [null, undefined, "", "—", "0-0", "abc"]) {
      expect(parseRecordWinPct(v as never)).toBeNull();
    }
  });
});

describe("getFormEdge (recent-window record only)", () => {
  it("is positive when the pick has the better recent record", () => {
    // .714 vs .429 → (0.2857)*100*0.15 ≈ +4.29
    expect(getFormEdge("10-4", "6-8")).toBeCloseTo(4.29, 2);
  });
  it("is negative when the opponent is hotter", () => {
    expect(getFormEdge("4-10", "10-4")!).toBeLessThan(0);
  });
  it("uses ONLY the supplied recent record — no season input exists in this function", () => {
    // Same recent records but wildly different (hypothetical) season quality
    // cannot change the output: the function takes only recent records.
    expect(getFormEdge("7-7", "7-7")).toBeCloseTo(0, 10);
  });
  it("distinct windows produce distinct edges (2W last-5 vs 4W last-14)", () => {
    const twoW = getFormEdge("4-1", "1-4"); // last 5 games, hot
    const fourW = getFormEdge("8-6", "7-7"); // last 14 games, mild
    expect(twoW).not.toBeCloseTo(fourW!, 2);
    expect(twoW!).toBeGreaterThan(fourW!);
  });
  it("returns null when either side's window record is missing (renders N/A)", () => {
    expect(getFormEdge(null, "6-8")).toBeNull();
    expect(getFormEdge("10-4", null)).toBeNull();
    expect(getFormEdge("0-0", "6-8")).toBeNull();
  });
});

// --- N/A rendering (shared formatters) -------------------------------------

describe("null-safe formatters render N/A, never 0 / Even / Neutral", () => {
  it("formatEdgePoints", () => {
    expect(formatEdgePoints(6.84)).toBe("+6.8");
    expect(formatEdgePoints(-1.24)).toBe("-1.2");
    expect(formatEdgePoints(null)).toBe("N/A");
    expect(formatEdgePoints(undefined)).toBe("N/A");
    expect(formatEdgePoints(NaN)).toBe("N/A");
    expect(formatEdgePoints(-0.02)).toBe("0.0"); // no negative zero
  });
  it("consistent rounding at the .05 boundary", () => {
    expect(formatEdgePoints(2.049)).toBe("+2.0");
    expect(formatEdgePoints(2.05)).toBe("+2.1");
  });
  it("formatMarketPct", () => {
    expect(formatMarketPct(0.559)).toBe("56%");
    expect(formatMarketPct(null)).toBe("N/A");
    expect(formatMarketPct(NaN)).toBe("N/A");
  });
});

// --- component bands / grade ----------------------------------------------

describe("getComponentBand / getEdgeGrade", () => {
  it("bands span strong / edge / even / against with distinct colors", () => {
    expect(getComponentBand(5).key).toBe("strong");
    expect(getComponentBand(2).key).toBe("edge");
    expect(getComponentBand(0).key).toBe("even");
    expect(getComponentBand(-3).key).toBe("against");
    expect(new Set([5, 2, 0, -3].map((v) => getComponentBand(v).color)).size).toBe(4);
  });
  it("grade thresholds align with the shared confidence tiers", () => {
    expect(getEdgeGrade(75).label).toBe("Strong lean");
    expect(getEdgeGrade(65).label).toBe("Moderate lean");
    expect(getEdgeGrade(58).label).toBe("Slight lean");
    expect(getEdgeGrade(52).label).toBe("Coin flip");
  });
});

// --- missing-data policy: renormalization + completeness -------------------

describe("renormalizeWeights", () => {
  it("renormalizes present groups to sum to 1, preserving proportions", () => {
    const w = renormalizeWeights({ pitching: true, batting: true, form: true, season: true });
    const total = Object.values(w).reduce((s, v) => s + (v ?? 0), 0);
    expect(total).toBeCloseTo(1, 10);
    expect(w.pitching).toBeCloseTo(0.30, 10);
  });

  it("excludes a missing group (not treated as zero) and renormalizes the rest", () => {
    // Spec example: pitching .30, batting .45, form .15, season .10; Form missing
    // → valid total .85, renormalize.
    const w = renormalizeWeights({ pitching: true, batting: true, form: false, season: true });
    expect(w.form).toBeUndefined();
    const total = Object.values(w).reduce((s, v) => s + (v ?? 0), 0);
    expect(total).toBeCloseTo(1, 10);
    expect(w.pitching).toBeCloseTo(0.30 / 0.85, 10);
    expect(w.batting).toBeCloseTo(0.45 / 0.85, 10);
    expect(w.season).toBeCloseTo(0.10 / 0.85, 10);
  });

  it("returns an empty object when nothing is present", () => {
    expect(renormalizeWeights({})).toEqual({});
  });
});

describe("computeCompleteness", () => {
  const full = { hasIdentity: true, hasPitching: true, hasBatting: true, hasForm: true, hasSeason: true };

  it("passes with full data (weight 1.0)", () => {
    const c = computeCompleteness(full);
    expect(c.ok).toBe(true);
    expect(c.weightAvailable).toBeCloseTo(1, 10);
  });
  it("one missing primary component does not fail the gate (.85 ≥ .70)", () => {
    const c = computeCompleteness({ ...full, hasForm: false });
    expect(c.ok).toBe(true);
    expect(c.weightAvailable).toBeCloseTo(0.85, 10);
  });
  it("fails when below 70% weight available", () => {
    // Only batting + season = .55
    const c = computeCompleteness({ ...full, hasPitching: false, hasForm: false });
    expect(c.weightAvailable).toBeCloseTo(0.55, 10);
    expect(c.ok).toBe(false);
  });
  it("fails when fewer than 2 primary groups present", () => {
    // Pitching only (.30 primary weight) + season → 1 primary group, .40 weight
    const c = computeCompleteness({ ...full, hasBatting: false, hasForm: false });
    expect(c.primaryGroupsPresent).toBe(1);
    expect(c.ok).toBe(false);
  });
  it("fails without core identity regardless of components", () => {
    expect(computeCompleteness({ ...full, hasIdentity: false }).ok).toBe(false);
  });
});

// --- primary reason (window-aware, no season conflation) -------------------

describe("buildPrimaryReason", () => {
  const base = { formWindow: "2w" as const, pickTeam: "TEX", context: null as string | null };

  it("names starter / lineup drivers", () => {
    expect(buildPrimaryReason({ ...base, pitching: 5, batting: 1, form: 0.2 }))
      .toBe("Starter advantage drives the lean");
    expect(buildPrimaryReason({ ...base, pitching: 1, batting: 4, form: 0.2 }))
      .toBe("Lineup edge drives the lean");
  });
  it("labels a recent-form driver with the active window and team, not 'season'", () => {
    const r = buildPrimaryReason({ ...base, pitching: 0.5, batting: 0.5, form: 4, formWindow: "4w" });
    expect(r).toBe("Recent 4W form favors TEX");
    expect(r).not.toMatch(/season/i);
  });
  it("never generates form text when the form metric is N/A", () => {
    const r = buildPrimaryReason({ ...base, pitching: 0.2, batting: 0.1, form: null });
    expect(r).toBeNull(); // nothing strong, no context
    const r2 = buildPrimaryReason({ ...base, pitching: 4, batting: 0.1, form: null });
    expect(r2).toBe("Starter advantage drives the lean");
  });
  it("explains an offsetting positive when the strongest signal favors the opponent", () => {
    expect(buildPrimaryReason({ ...base, pitching: -6, batting: 5, form: 2 }))
      .toBe("Lineup edge offsets weaker starter");
  });
  it("falls back to caller context only when nothing meaningful drives the lean", () => {
    expect(buildPrimaryReason({ ...base, pitching: 0.2, batting: -0.1, form: 0.1, context: "TB starter overperforming" }))
      .toBe("TB starter overperforming");
  });
});

// --- sorting (N/A rows last, deterministic) --------------------------------

describe("compareMlSocialRows", () => {
  const base: MlSocialRow = {
    gamePk: 1, awayAbbr: "AWY", homeAbbr: "HOM", awayPitcher: null, homePitcher: null,
    gameTime: "", selectedTeam: "AWY", fadeTeam: "HOM", selectedAmerican: null,
    modelEdgePoints: 5, confidence: 65, completeness: 1,
    pitchingEdge: 0, battingEdge: 0, formEdge: 0, formWindow: "2w", otherEdge: 0,
    marketImpliedProbability: null, noVigMarketProbability: null,
    polymarketYes: null, polymarketNo: null, grade: "Moderate lean", primaryReason: null,
  };

  it("orders by model edge points descending", () => {
    const rows = [
      { ...base, gamePk: 1, modelEdgePoints: 3 },
      { ...base, gamePk: 2, modelEdgePoints: 8 },
      { ...base, gamePk: 3, modelEdgePoints: 5 },
    ];
    expect([...rows].sort(compareMlSocialRows).map((r) => r.gamePk)).toEqual([2, 3, 1]);
  });

  it("places N/A (null Model Edge) rows deterministically AFTER valid rows", () => {
    const rows = [
      { ...base, gamePk: 1, modelEdgePoints: null, grade: null },
      { ...base, gamePk: 2, modelEdgePoints: 4 },
      { ...base, gamePk: 3, modelEdgePoints: null, grade: null, selectedTeam: "BAL" },
    ];
    const sorted = [...rows].sort(compareMlSocialRows).map((r) => r.gamePk);
    expect(sorted[0]).toBe(2); // valid row first
    expect(sorted.slice(1)).toEqual([1, 3]); // N/A rows after; equal confidence → team asc (AWY<BAL)
  });

  it("breaks ties: confidence, then team, then gamePk", () => {
    const rows = [
      { ...base, gamePk: 30, modelEdgePoints: 5, confidence: 60, selectedTeam: "SEA" },
      { ...base, gamePk: 10, modelEdgePoints: 5, confidence: 70, selectedTeam: "TB" },
      { ...base, gamePk: 20, modelEdgePoints: 5, confidence: 70, selectedTeam: "NYY" },
    ];
    expect([...rows].sort(compareMlSocialRows).map((r) => r.gamePk)).toEqual([20, 10, 30]);
  });

  it("is a stable total order (idempotent under re-sort)", () => {
    const rows = [
      { ...base, gamePk: 3, modelEdgePoints: 5 },
      { ...base, gamePk: 1, modelEdgePoints: 5 },
      { ...base, gamePk: 2, modelEdgePoints: 5 },
    ];
    const once = [...rows].sort(compareMlSocialRows).map((r) => r.gamePk);
    expect(once).toEqual([1, 2, 3]);
    expect([...rows].sort(compareMlSocialRows).sort(compareMlSocialRows).map((r) => r.gamePk)).toEqual(once);
  });
});
