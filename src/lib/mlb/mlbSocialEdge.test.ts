import { describe, expect, it } from "vitest";
import {
  americanToImpliedProbability,
  buildPrimaryReason,
  compareMlSocialRows,
  computeDisplayedEdge,
  confidenceForEdgePoints,
  DEFAULT_FORM_WINDOW,
  FORM_WINDOW_LABELS,
  FORM_WINDOW_LONG,
  FORM_WINDOW_SOURCES,
  formatEdgePoints,
  formatMarketPct,
  getComponentBand,
  getComponentEdges,
  getFactorAvailability,
  getFormEdge,
  noVigProbability,
  parseRecordWinPct,
  renormalizeWeights,
  type CanonicalGroup,
  type GroupAvailability,
  type MlSocialRow,
} from "./mlbSocialEdge";
import { computeModelEdge, type ModelEdgeResult, type ModelFactor } from "./mlbModelEdge";
import { DEV_MLB_MATCHUP_FIXTURE } from "@/data/mlb/devMatchupFixture";
import type { MlbGameDetail } from "@/lib/mlb/mlbTypes";

// --- helpers ---------------------------------------------------------------

function factor(label: string, weightedDifference: number, weight: number): ModelFactor {
  return { label, awayScore: 50, homeScore: 50, weight, weightedDifference, description: "" };
}

/**
 * Build a model result from RAW group differentials (away − home, unweighted),
 * matching the canonical factor representation weightedDifference = raw × weight.
 */
function makeEdge(
  pick: ModelEdgeResult["pick"],
  raw: { pitching?: number; matchup?: number; lineup?: number; recentForm?: number; season?: number },
  confidence = 65,
): ModelEdgeResult {
  const factors: ModelFactor[] = [
    factor("Pitcher Quality", (raw.pitching ?? 0) * 0.30, 0.30),
    factor("Matchup Edge", (raw.matchup ?? 0) * 0.25, 0.25),
    factor("Lineup Offense", (raw.lineup ?? 0) * 0.20, 0.20),
    factor("Recent Form", (raw.recentForm ?? 0) * 0.15, 0.15),
    factor("Season Quality", (raw.season ?? 0) * 0.10, 0.10),
  ];
  const differential = Math.abs(factors.reduce((s, f) => s + f.weightedDifference, 0));
  return {
    pick, awayAbbr: "AWY", homeAbbr: "HOM", confidence,
    differential: Math.round(differential), factors, topFactor: "Pitcher Quality", summary: "",
  };
}

const ALL_AVAILABLE: GroupAvailability = {
  pitching: { available: true, sourceFieldsPresent: true, usedFallback: false },
  batting: { available: true, sourceFieldsPresent: true, usedFallback: false },
  modelForm: { available: true, sourceFieldsPresent: true, usedFallback: false },
  season: { available: true, sourceFieldsPresent: true, usedFallback: false },
};
function availWithout(...missing: CanonicalGroup[]): GroupAvailability {
  const a: GroupAvailability = JSON.parse(JSON.stringify(ALL_AVAILABLE));
  for (const g of missing) a[g] = { available: false, sourceFieldsPresent: false, usedFallback: false };
  return a;
}

// --- Part 1: L5 / L14 labels ----------------------------------------------

describe("recent-record window labels (L5 / L14, not weeks)", () => {
  it("default window is L5", () => {
    expect(DEFAULT_FORM_WINDOW).toBe("l5");
  });
  it("labels are L5 / L14", () => {
    expect(FORM_WINDOW_LABELS.l5).toBe("L5");
    expect(FORM_WINDOW_LABELS.l14).toBe("L14");
  });
  it("source phrases describe completed games, not calendar weeks", () => {
    expect(FORM_WINDOW_SOURCES.l5).toBe("last 5 completed games");
    expect(FORM_WINDOW_SOURCES.l14).toBe("last 14 completed games");
    expect(FORM_WINDOW_LONG.l5).toBe("Last 5 completed games");
    for (const v of [...Object.values(FORM_WINDOW_SOURCES), ...Object.values(FORM_WINDOW_LONG)]) {
      expect(v).not.toMatch(/week/i);
      expect(v).not.toMatch(/\b[24]W\b/);
    }
  });
});

// --- market math -----------------------------------------------------------

describe("americanToImpliedProbability / noVigProbability", () => {
  it("converts and de-vigs a two-sided market", () => {
    const pick = americanToImpliedProbability("-136")!;
    const opp = americanToImpliedProbability("+120")!;
    expect(pick).toBeCloseTo(0.5763, 4);
    expect(noVigProbability(pick, opp)).toBeCloseTo(0.5590, 4);
  });
  it("fails safe to null on missing side or invalid odds", () => {
    expect(americanToImpliedProbability(null)).toBeNull();
    expect(noVigProbability(0.57, null)).toBeNull();
  });
  it("does not double-scale a fair market", () => {
    const even = americanToImpliedProbability("+100")!;
    expect(noVigProbability(even, even)).toBeCloseTo(0.5, 10);
  });
});

// --- Part 2: canonical decomposition + additivity --------------------------

describe("getComponentEdges (four canonical additive drivers)", () => {
  it("groups Pitching / Batting / Model Form / Season", () => {
    const edge = makeEdge("away", { pitching: 10, matchup: 4, lineup: 2, recentForm: 3, season: 5 });
    const c = getComponentEdges(edge);
    expect(c.pitching).toBeCloseTo(3.0, 10);   // 10 * .30
    expect(c.batting).toBeCloseTo(1.4, 10);    // 4*.25 + 2*.20 = 1.0 + 0.4
    expect(c.modelForm).toBeCloseTo(0.45, 10); // 3 * .15
    expect(c.season).toBeCloseTo(0.5, 10);     // 5 * .10
  });
  it("Pitching + Batting + Model Form + Season == canonical Model Edge", () => {
    const edge = makeEdge("away", { pitching: 8, matchup: 3, lineup: -1, recentForm: 2, season: 1 });
    const c = getComponentEdges(edge);
    expect(c.pitching + c.batting + c.modelForm + c.season).toBeCloseTo(c.overall, 10);
  });
  it("orients to the selected team for a home pick", () => {
    const away = makeEdge("away", { pitching: 5 });
    const home = makeEdge("home", { pitching: -5 });
    expect(getComponentEdges(away).pitching).toBeCloseTo(getComponentEdges(home).pitching, 10);
  });
  it("real dev fixture: identity holds and matches model differential", () => {
    const edge = computeModelEdge(DEV_MLB_MATCHUP_FIXTURE.detail);
    const c = getComponentEdges(edge);
    expect(c.pitching + c.batting + c.modelForm + c.season).toBeCloseTo(c.overall, 6);
    expect(Math.abs(c.overall)).toBeCloseTo(edge.differential, 0);
  });
});

// --- Part 2: factor availability (real zero vs missing vs fallback) --------

describe("getFactorAvailability (source provenance)", () => {
  const base = DEV_MLB_MATCHUP_FIXTURE.detail;

  it("all groups available for the complete dev fixture", () => {
    const a = getFactorAvailability(base);
    expect(a.pitching.available).toBe(true);
    expect(a.batting.available).toBe(true);
    expect(a.modelForm.available).toBe(true);
    expect(a.season.available).toBe(true);
  });

  it("a real measured zero differential is NOT flagged missing", () => {
    // Records that produce a genuine tie still have present source fields.
    const detail: MlbGameDetail = JSON.parse(JSON.stringify(base));
    detail.awayContext.lastFiveRecord = "3-3"; // real .500
    detail.homeContext.lastFiveRecord = "3-3";
    const a = getFactorAvailability(detail);
    expect(a.modelForm.available).toBe(true);
    expect(a.modelForm.sourceFieldsPresent).toBe(true);
  });

  it("explicitly missing starter stats → pitching unavailable", () => {
    const detail: MlbGameDetail = JSON.parse(JSON.stringify(base));
    detail.starters.away = { ...detail.starters.away, era: null, strikeOuts: null, inningsPitched: null };
    expect(getFactorAvailability(detail).pitching.available).toBe(false);
  });

  it("missing lineup summaries → batting unavailable", () => {
    const detail: MlbGameDetail = JSON.parse(JSON.stringify(base));
    detail.lineupSummaries.away = { ...detail.lineupSummaries.away, ops: null };
    expect(getFactorAvailability(detail).batting.available).toBe(false);
  });

  it("missing recent / season records → those groups unavailable", () => {
    const detail: MlbGameDetail = JSON.parse(JSON.stringify(base));
    detail.awayContext.lastFiveRecord = "—";
    detail.game.away = { ...detail.game.away, record: "" };
    const a = getFactorAvailability(detail);
    expect(a.modelForm.available).toBe(false);
    expect(a.season.available).toBe(false);
  });

  it("fallback-filled is distinguishable from unavailable (ERA missing but K present)", () => {
    const detail: MlbGameDetail = JSON.parse(JSON.stringify(base));
    detail.starters.away = { ...detail.starters.away, era: null }; // still has strikeOuts/IP
    const a = getFactorAvailability(detail);
    expect(a.pitching.available).toBe(true);
    expect(a.pitching.usedFallback).toBe(true);
  });
});

// --- Part 3: displayed edge (canonical / adjusted / N/A) -------------------

describe("computeDisplayedEdge", () => {
  it("complete row → displayed edge equals canonical exactly (no recompute)", () => {
    const edge = makeEdge("away", { pitching: 8, matchup: 3, lineup: 1, recentForm: 2, season: 1 });
    const d = computeDisplayedEdge(edge, ALL_AVAILABLE);
    expect(d.adjusted).toBe(false);
    expect(d.displayed).toBe(d.canonical);
    expect(d.ok).toBe(true);
    expect(d.weightAvailable).toBeCloseTo(1, 10);
  });

  it("worked example: Model Form unavailable → adjusted edge renormalizes valid weights", () => {
    // Raw diffs: pitching +10 (.30), batting +4 combined (.45), season +2 (.10);
    // model form unavailable (.15). Available weight = .85.
    // Adjusted = 10*(.30/.85) + 4*(.45/.85) + 2*(.10/.85) = (3.0+1.8+0.2)/.85.
    const edge = makeEdge("away", { pitching: 10, matchup: 4, lineup: 4, recentForm: 999, season: 2 });
    // batting raw must be +4 combined: matchup .25 + lineup .20; to get combined
    // weightedDifference 1.8 with raw 4 we need matchup=4, lineup=4 → 4*.25+4*.20=1.8. ✓
    const d = computeDisplayedEdge(edge, availWithout("modelForm"));
    expect(d.adjusted).toBe(true);
    expect(d.weightAvailable).toBeCloseTo(0.85, 10);
    expect(d.displayed).toBeCloseTo((3.0 + 1.8 + 0.2) / 0.85, 6); // ≈ 5.882
    // Model Form component renders null (excluded, not zeroed).
    expect(d.components.modelForm).toBeNull();
    expect(d.components.pitching).toBeCloseTo(3.0, 6);
  });

  it("a missing factor does NOT behave as a neutral zero", () => {
    // With season genuinely +8 but UNAVAILABLE, excluding it changes the result
    // vs. treating it as measured 0.
    const edge = makeEdge("away", { pitching: 6, matchup: 4, lineup: 4, recentForm: 2, season: 8 });
    const excluded = computeDisplayedEdge(edge, availWithout("season")).displayed!;
    const asZero = computeDisplayedEdge(makeEdge("away", { pitching: 6, matchup: 4, lineup: 4, recentForm: 2, season: 0 }), ALL_AVAILABLE).displayed!;
    expect(excluded).not.toBeCloseTo(asZero, 3);
  });

  it("below minimum completeness → displayed N/A (null)", () => {
    // Only batting + season available: primary groups = 1, weight = .55.
    const edge = makeEdge("away", { pitching: 5, matchup: 3, lineup: 3, recentForm: 1, season: 1 });
    const d = computeDisplayedEdge(edge, availWithout("pitching", "modelForm"));
    expect(d.ok).toBe(false);
    expect(d.displayed).toBeNull();
  });

  it("no divide-by-zero / NaN when nothing is available", () => {
    const edge = makeEdge("away", { pitching: 5 });
    const d = computeDisplayedEdge(edge, availWithout("pitching", "batting", "modelForm", "season"));
    expect(d.displayed).toBeNull();
    expect(Number.isNaN(d.weightAvailable)).toBe(false);
  });

  it("one primary missing but 70% weight present still passes (adjusted)", () => {
    const edge = makeEdge("away", { pitching: 6, matchup: 4, lineup: 4, recentForm: 2, season: 2 });
    const d = computeDisplayedEdge(edge, availWithout("modelForm")); // .85 weight, 2 primaries
    expect(d.ok).toBe(true);
    expect(d.adjusted).toBe(true);
  });
});

describe("renormalizeWeights", () => {
  it("renormalizes present groups to 1, excluding (not zeroing) the missing one", () => {
    const w = renormalizeWeights({ pitching: true, batting: true, modelForm: false, season: true });
    expect(w.modelForm).toBeUndefined();
    expect(Object.values(w).reduce((s, v) => s + (v ?? 0), 0)).toBeCloseTo(1, 10);
    expect(w.pitching).toBeCloseTo(0.30 / 0.85, 10);
  });
  it("returns {} when nothing present", () => {
    expect(renormalizeWeights({})).toEqual({});
  });
});

// --- Part 4: N/A formatting; real zero stays 0.0 ---------------------------

describe("null-safe formatters", () => {
  it("formatEdgePoints renders N/A for null/NaN, 0.0 for real zero, no -0", () => {
    expect(formatEdgePoints(6.84)).toBe("+6.8");
    expect(formatEdgePoints(-1.24)).toBe("-1.2");
    expect(formatEdgePoints(0)).toBe("0.0");       // measured zero is real
    expect(formatEdgePoints(-0.02)).toBe("0.0");   // no negative zero
    expect(formatEdgePoints(null)).toBe("N/A");
    expect(formatEdgePoints(NaN)).toBe("N/A");
  });
  it("consistent rounding at the .05 boundary", () => {
    expect(formatEdgePoints(2.049)).toBe("+2.0");
    expect(formatEdgePoints(2.05)).toBe("+2.1");
  });
  it("formatMarketPct renders N/A for missing", () => {
    expect(formatMarketPct(0.559)).toBe("56%");
    expect(formatMarketPct(null)).toBe("N/A");
  });
});

describe("getComponentBand / grade helpers", () => {
  it("bands span the range with distinct colors", () => {
    expect(getComponentBand(5).key).toBe("strong");
    expect(getComponentBand(0).key).toBe("even");
    expect(getComponentBand(-3).key).toBe("against");
    expect(new Set([5, 2, 0, -3].map((v) => getComponentBand(v).color)).size).toBe(4);
  });
  it("confidenceForEdgePoints mirrors the canonical model mapping", () => {
    // model: round(min(82, 52 + (abs/5)*4))
    expect(confidenceForEdgePoints(0)).toBe(52);
    expect(confidenceForEdgePoints(10)).toBe(60);
    expect(confidenceForEdgePoints(100)).toBe(82); // capped
    expect(confidenceForEdgePoints(-10)).toBe(60); // magnitude
  });
});

// --- Form Edge diagnostic --------------------------------------------------

describe("parseRecordWinPct / getFormEdge (recent-record diagnostic)", () => {
  it("parses records and rejects empty/zero-game", () => {
    expect(parseRecordWinPct("10-4")).toBeCloseTo(10 / 14, 10);
    for (const v of [null, "—", "0-0", "abc"]) expect(parseRecordWinPct(v as never)).toBeNull();
  });
  it("is season-free: depends only on the supplied window records", () => {
    expect(getFormEdge("10-4", "6-8")).toBeCloseTo(4.29, 2);
    expect(getFormEdge("7-7", "7-7")).toBeCloseTo(0, 10);
  });
  it("L5 vs L14 windows produce distinct diagnostics", () => {
    const l5 = getFormEdge("4-1", "1-4");
    const l14 = getFormEdge("8-6", "7-7");
    expect(l5).not.toBeCloseTo(l14!, 2);
  });
  it("returns null (N/A) when a side's record is missing", () => {
    expect(getFormEdge(null, "6-8")).toBeNull();
    expect(getFormEdge("0-0", "6-8")).toBeNull();
  });
});

// --- Part 7: primary reason (window-aware; distinct from model drivers) ----

describe("buildPrimaryReason", () => {
  const base = { formWindow: "l5" as const, pickTeam: "TEX", context: null as string | null };

  it("uses the strongest available canonical driver", () => {
    expect(buildPrimaryReason({ ...base, pitching: 5, batting: 1, modelForm: 0.2, season: 0.1, formEdge: 0.2 }))
      .toBe("Starting pitching drives the model edge");
    expect(buildPrimaryReason({ ...base, pitching: 1, batting: 4, modelForm: 0.2, season: 0.1, formEdge: 0.2 }))
      .toBe("Lineup matchup favors TEX");
    expect(buildPrimaryReason({ ...base, pitching: 0.2, batting: 0.3, modelForm: 3, season: 0.1, formEdge: 0.2 }))
      .toBe("Internal model form favors TEX");
    expect(buildPrimaryReason({ ...base, pitching: 0.2, batting: 0.3, modelForm: 0.1, season: 4, formEdge: 0.2 }))
      .toBe("Season quality supports TEX");
  });

  it("uses the recent-record diagnostic (L5/L14) only when no canonical driver is strong; kept distinct", () => {
    const r = buildPrimaryReason({ ...base, formWindow: "l14", pitching: 0.2, batting: 0.1, modelForm: 0.1, season: 0.1, formEdge: 4 });
    expect(r).toBe("Recent L14 record favors TEX");
    expect(r).not.toMatch(/model edge|season/i);
  });

  it("never generates text from a missing (null) metric", () => {
    expect(buildPrimaryReason({ ...base, pitching: null, batting: null, modelForm: null, season: null, formEdge: null }))
      .toBeNull();
    expect(buildPrimaryReason({ ...base, pitching: 5, batting: null, modelForm: null, season: null, formEdge: null }))
      .toBe("Starting pitching drives the model edge");
  });

  it("falls back to caller context when nothing is strong", () => {
    expect(buildPrimaryReason({ ...base, pitching: 0.2, batting: 0.1, modelForm: 0.1, season: 0.1, formEdge: 0.1, context: "BAL starter overperforming" }))
      .toBe("BAL starter overperforming");
  });
});

// --- Part 7: sorting -------------------------------------------------------

describe("compareMlSocialRows", () => {
  const base: MlSocialRow = {
    gamePk: 1, awayAbbr: "AWY", homeAbbr: "HOM", awayPitcher: null, homePitcher: null,
    gameTime: "", selectedTeam: "AWY", fadeTeam: "HOM", selectedAmerican: null,
    modelEdgePoints: 5, canonicalEdgePoints: 5, isAdjusted: false, confidence: 65, completeness: 1,
    pitchingEdge: 0, battingEdge: 0, modelFormEdge: 0, seasonEdge: 0,
    formEdge: 0, formWindow: "l5",
    marketImpliedProbability: null, noVigMarketProbability: null,
    polymarketYes: null, polymarketNo: null, grade: "Moderate lean", primaryReason: null,
  };

  it("orders by displayed edge desc; adjusted rows sort by their adjusted edge", () => {
    const rows = [
      { ...base, gamePk: 1, modelEdgePoints: 3, isAdjusted: true },
      { ...base, gamePk: 2, modelEdgePoints: 8 },
      { ...base, gamePk: 3, modelEdgePoints: 5, isAdjusted: true },
    ];
    expect([...rows].sort(compareMlSocialRows).map((r) => r.gamePk)).toEqual([2, 3, 1]);
  });

  it("N/A rows sort after all valid rows, deterministically", () => {
    const rows = [
      { ...base, gamePk: 1, modelEdgePoints: null, grade: null },
      { ...base, gamePk: 2, modelEdgePoints: 4 },
      { ...base, gamePk: 3, modelEdgePoints: null, grade: null, selectedTeam: "BAL" },
    ];
    const sorted = [...rows].sort(compareMlSocialRows).map((r) => r.gamePk);
    expect(sorted[0]).toBe(2);
    expect(sorted.slice(1)).toEqual([1, 3]); // equal conf → team asc AWY<BAL
  });

  it("is idempotent under re-sort", () => {
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
