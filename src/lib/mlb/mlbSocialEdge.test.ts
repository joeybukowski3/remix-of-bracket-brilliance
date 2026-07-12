import { describe, expect, it } from "vitest";
import {
  americanToImpliedProbability,
  buildPrimaryReason,
  compareMlSocialRows,
  formatEdgePoints,
  getComponentBand,
  getComponentEdges,
  getEdgeGrade,
  noVigProbability,
  type MlSocialRow,
} from "./mlbSocialEdge";
import { computeModelEdge, type ModelEdgeResult, type ModelFactor } from "./mlbModelEdge";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";

// --- helpers ---------------------------------------------------------------

function factor(label: string, weightedDifference: number): ModelFactor {
  return { label, awayScore: 50, homeScore: 50, weight: 0.2, weightedDifference, description: "" };
}

/** Build a synthetic model result with controllable factor differences. */
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
    pick,
    awayAbbr: "AWY",
    homeAbbr: "HOM",
    confidence,
    differential: Math.round(differential),
    factors,
    topFactor: "Pitcher Quality",
    summary: "",
  };
}

// --- American odds → implied probability (item 12) -------------------------

describe("americanToImpliedProbability", () => {
  it("converts negative (favorite) odds correctly", () => {
    // -136 → 136 / 236 = 0.5763
    expect(americanToImpliedProbability("-136")).toBeCloseTo(0.5763, 4);
  });

  it("converts positive (underdog) odds correctly", () => {
    // +120 → 100 / 220 = 0.4545
    expect(americanToImpliedProbability("+120")).toBeCloseTo(0.4545, 4);
  });

  it("accepts numeric input", () => {
    expect(americanToImpliedProbability(-110)).toBeCloseTo(0.5238, 4);
  });

  it("returns null for missing or invalid odds (fails safe)", () => {
    expect(americanToImpliedProbability(null)).toBeNull();
    expect(americanToImpliedProbability(undefined)).toBeNull();
    expect(americanToImpliedProbability("")).toBeNull();
    expect(americanToImpliedProbability("abc")).toBeNull();
    expect(americanToImpliedProbability(0)).toBeNull();
  });
});

// --- two-sided no-vig probability (item 12) --------------------------------

describe("noVigProbability", () => {
  it("normalizes the overround out of a two-sided market", () => {
    // -136 pick vs +120 opp → implied 0.5763 / 0.4545, sum 1.0308 (3.08% vig)
    const pick = americanToImpliedProbability("-136")!;
    const opp = americanToImpliedProbability("+120")!;
    const noVig = noVigProbability(pick, opp)!;
    expect(noVig).toBeCloseTo(0.5590, 4);
    // No-vig must be lower than the raw vig-loaded favorite probability.
    expect(noVig).toBeLessThan(pick);
  });

  it("is symmetric — pick and opponent no-vig sum to 1", () => {
    const pick = americanToImpliedProbability("-150")!;
    const opp = americanToImpliedProbability("+130")!;
    const a = noVigProbability(pick, opp)!;
    const b = noVigProbability(opp, pick)!;
    expect(a + b).toBeCloseTo(1, 10);
  });

  it("returns null when the opposite side is missing (fails safe)", () => {
    const pick = americanToImpliedProbability("-136")!;
    expect(noVigProbability(pick, null)).toBeNull();
    expect(noVigProbability(null, pick)).toBeNull();
  });

  it("returns null for a non-positive denominator", () => {
    expect(noVigProbability(0, 0)).toBeNull();
  });

  it("does not double-scale — a fair 50/50 market stays 0.5", () => {
    const even = americanToImpliedProbability("+100")!; // 0.5
    expect(noVigProbability(even, even)).toBeCloseTo(0.5, 10);
  });
});

// --- component edges (item 13) ---------------------------------------------

describe("getComponentEdges", () => {
  it("groups the five factors into pitching / batting / form", () => {
    const edge = makeEdge("away", {
      "Pitcher Quality": 4,
      "Matchup Edge": 1.5,
      "Lineup Offense": 0.5,
      "Recent Form": -0.4,
      "Season Quality": -0.2,
    });
    const c = getComponentEdges(edge);
    expect(c.pitching).toBeCloseTo(4, 10);
    expect(c.batting).toBeCloseTo(2, 10); // 1.5 + 0.5
    expect(c.form).toBeCloseTo(-0.6, 10); // -0.4 + -0.2
  });

  it("components are additive — they sum to the overall model edge", () => {
    const edge = makeEdge("away", {
      "Pitcher Quality": 3.1,
      "Matchup Edge": 1.2,
      "Lineup Offense": -0.7,
      "Recent Form": 0.9,
      "Season Quality": 0.3,
    });
    const c = getComponentEdges(edge);
    expect(c.overall).toBeCloseTo(c.pitching + c.batting + c.form, 10);
    expect(c.overall).toBeCloseTo(4.8, 10);
  });

  it("orients components toward the selected team when the pick is home", () => {
    // weightedDifference is away−home; a home pick flips the sign so a
    // positive value favors the pick.
    const away = makeEdge("away", { "Pitcher Quality": 5 });
    const home = makeEdge("home", { "Pitcher Quality": -5 });
    expect(getComponentEdges(away).pitching).toBeCloseTo(5, 10);
    expect(getComponentEdges(home).pitching).toBeCloseTo(5, 10);
  });

  it("selected team favored vs opponent favored in pitching", () => {
    const favored = makeEdge("away", { "Pitcher Quality": 6 });
    const against = makeEdge("away", { "Pitcher Quality": -6 });
    expect(getComponentEdges(favored).pitching).toBeGreaterThan(0);
    expect(getComponentEdges(against).pitching).toBeLessThan(0);
  });

  it("treats a missing factor label as a 0 contribution (no crash)", () => {
    const edge = makeEdge("away", { "Pitcher Quality": 3 });
    edge.factors = edge.factors.filter((f) => f.label !== "Recent Form" && f.label !== "Season Quality");
    const c = getComponentEdges(edge);
    expect(c.form).toBe(0);
    expect(c.pitching).toBeCloseTo(3, 10);
  });

  it("derives real additive components from the dev fixture", () => {
    const edge = computeModelEdge(DEV_MLB_MATCHUP_FIXTURE.detail);
    const c = getComponentEdges(edge);
    // Overall equals the sum of the pieces, and (up to rounding) the model's
    // own reported differential magnitude.
    expect(c.overall).toBeCloseTo(c.pitching + c.batting + c.form, 6);
    expect(Math.abs(c.overall)).toBeCloseTo(edge.differential, 0);
  });
});

// --- component bands / colors (item 13) ------------------------------------

describe("getComponentBand", () => {
  it("labels a strong advantage, slight edge, even, and opponent edge", () => {
    expect(getComponentBand(5).key).toBe("strong");
    expect(getComponentBand(2).key).toBe("edge");
    expect(getComponentBand(0).key).toBe("even");
    expect(getComponentBand(-3).key).toBe("against");
  });

  it("assigns a distinct color per band", () => {
    const keys = [5, 2, 0, -3].map((v) => getComponentBand(v).color);
    expect(new Set(keys).size).toBe(4);
  });
});

// --- grade alignment (item 13) ---------------------------------------------

describe("getEdgeGrade", () => {
  it("aligns grade thresholds with the shared confidence tiers", () => {
    expect(getEdgeGrade(75).label).toBe("Strong lean");
    expect(getEdgeGrade(65).label).toBe("Moderate lean");
    expect(getEdgeGrade(58).label).toBe("Slight lean");
    expect(getEdgeGrade(52).label).toBe("Coin flip");
  });

  it("never lets a high-confidence grade render with the muted coin-flip color", () => {
    expect(getEdgeGrade(80).bg).not.toBe(getEdgeGrade(51).bg);
  });
});

// --- formatting (item 12: signed, consistent rounding) ---------------------

describe("formatEdgePoints", () => {
  it("shows a leading + for positive and - for negative, one decimal", () => {
    expect(formatEdgePoints(6.84)).toBe("+6.8");
    expect(formatEdgePoints(3.11)).toBe("+3.1");
    expect(formatEdgePoints(-1.24)).toBe("-1.2");
  });

  it("renders a dash for missing values (no fabricated zero)", () => {
    expect(formatEdgePoints(null)).toBe("—");
  });

  it("never prints a negative zero", () => {
    expect(formatEdgePoints(-0.02)).toBe("0.0");
  });

  it("rounds consistently at the .05 boundary", () => {
    expect(formatEdgePoints(2.049)).toBe("+2.0");
    expect(formatEdgePoints(2.05)).toBe("+2.1");
  });
});

// --- primary reason (item 7) -----------------------------------------------

describe("buildPrimaryReason", () => {
  it("names the strongest positive component as the driver", () => {
    expect(buildPrimaryReason({ pitching: 5, batting: 1, form: 0.2, overall: 6.2 }))
      .toBe("Starter advantage drives the lean");
    expect(buildPrimaryReason({ pitching: 1, batting: 4, form: 0.2, overall: 5.2 }))
      .toBe("Lineup edge drives the lean");
  });

  it("explains when a positive lean is carried despite a weak top component", () => {
    // Pitching is the largest magnitude but favors the opponent; batting carries it.
    expect(buildPrimaryReason({ pitching: -6, batting: 5, form: 2, overall: 1 }))
      .toBe("Lineup edge offsets weaker starter");
  });

  it("falls back to caller context when nothing is driving the lean", () => {
    expect(buildPrimaryReason({ pitching: 0.2, batting: -0.1, form: 0.1, overall: 0.2 }, "TB pitcher overperforming"))
      .toBe("TB pitcher overperforming");
  });

  it("returns null when there is neither a driver nor context", () => {
    expect(buildPrimaryReason({ pitching: 0.1, batting: 0, form: -0.1, overall: 0 })).toBeNull();
  });
});

// --- sorting (items 9 + 13: deterministic ordering) ------------------------

describe("compareMlSocialRows", () => {
  const base: MlSocialRow = {
    gamePk: 1,
    awayAbbr: "AWY",
    homeAbbr: "HOM",
    awayPitcher: null,
    homePitcher: null,
    gameTime: "",
    selectedTeam: "AWY",
    fadeTeam: "HOM",
    selectedAmerican: null,
    modelEdgePoints: 5,
    confidence: 65,
    pitchingEdge: 0,
    battingEdge: 0,
    formEdge: 0,
    marketImpliedProbability: null,
    noVigMarketProbability: null,
    polymarketYes: null,
    polymarketNo: null,
    grade: "Moderate lean",
    primaryReason: null,
  };

  it("orders by model edge points descending", () => {
    const rows = [
      { ...base, gamePk: 1, modelEdgePoints: 3 },
      { ...base, gamePk: 2, modelEdgePoints: 8 },
      { ...base, gamePk: 3, modelEdgePoints: 5 },
    ];
    const sorted = [...rows].sort(compareMlSocialRows).map((r) => r.gamePk);
    expect(sorted).toEqual([2, 3, 1]);
  });

  it("breaks ties deterministically: confidence, then team, then gamePk", () => {
    const rows = [
      { ...base, gamePk: 30, modelEdgePoints: 5, confidence: 60, selectedTeam: "SEA" },
      { ...base, gamePk: 10, modelEdgePoints: 5, confidence: 70, selectedTeam: "TB" },
      { ...base, gamePk: 20, modelEdgePoints: 5, confidence: 70, selectedTeam: "NYY" },
    ];
    const sorted = [...rows].sort(compareMlSocialRows).map((r) => r.gamePk);
    // Highest confidence first (10 & 20 tie at 70) → team NYY < TB → then 30.
    expect(sorted).toEqual([20, 10, 30]);
  });

  it("is a stable total order (idempotent under re-sort)", () => {
    const rows = [
      { ...base, gamePk: 3, modelEdgePoints: 5 },
      { ...base, gamePk: 1, modelEdgePoints: 5 },
      { ...base, gamePk: 2, modelEdgePoints: 5 },
    ];
    const once = [...rows].sort(compareMlSocialRows).map((r) => r.gamePk);
    const twice = [...rows].sort(compareMlSocialRows).sort(compareMlSocialRows).map((r) => r.gamePk);
    expect(once).toEqual(twice);
    expect(once).toEqual([1, 2, 3]);
  });
});
