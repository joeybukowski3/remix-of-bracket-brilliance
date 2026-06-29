import { describe, it, expect } from "vitest";
import {
  toPercent,
  normalizeThreeWay,
  calcEdge,
  formatEdge,
  buildMatchupValue,
  bestValueOutcome,
  normalizeTeamName,
  teamsMatch,
  isMarketFresh,
  type RawThreeWayPrices,
} from "./wcThreeWayValue";

// ─── 1–2: probability format detection ───────────────────────────────────────

describe("toPercent", () => {
  it("1. handles decimal form (0–1)", () => {
    expect(toPercent(0.54)).toBeCloseTo(54, 1);
  });
  it("2. handles cent form (0–100)", () => {
    expect(toPercent(54)).toBeCloseTo(54, 1);
  });
  it("handles 1.0 exactly as 100%", () => {
    expect(toPercent(1)).toBeCloseTo(100, 1);
  });
});

// ─── 3–4: three-way normalization ────────────────────────────────────────────

describe("normalizeThreeWay", () => {
  it("3. normalizes when total > 100% (overround)", () => {
    // Raw: 0.52 + 0.25 + 0.26 = 1.03
    const r = normalizeThreeWay(0.52, 0.25, 0.26)!;
    expect(r).not.toBeNull();
    expect(r.p1 + r.pD + r.p2).toBeCloseTo(100, 0);
    expect(r.p1).toBeCloseTo(50.5, 0);
  });
  it("4. normalizes when total < 100% (underround)", () => {
    const r = normalizeThreeWay(0.48, 0.22, 0.24)!;
    expect(r).not.toBeNull();
    expect(r.p1 + r.pD + r.p2).toBeCloseTo(100, 0);
  });
  it("8. returns null when one outcome is missing/zero", () => {
    expect(normalizeThreeWay(0.54, 0, 0.26)).toBeNull();
  });
  it("9. returns null when draw is missing", () => {
    expect(normalizeThreeWay(0.54, 0, 0.46)).toBeNull();
  });
  it("rejects negative values", () => {
    expect(normalizeThreeWay(-0.1, 0.25, 0.65)).toBeNull();
  });
  it("rejects NaN", () => {
    expect(normalizeThreeWay(NaN, 0.25, 0.65)).toBeNull();
  });
});

// ─── 5–7: edge calculation ────────────────────────────────────────────────────

describe("calcEdge / formatEdge", () => {
  it("5. positive edge", () => {
    expect(calcEdge(60.0, 54.0)).toBeCloseTo(6.0, 1);
    expect(formatEdge(6.0)).toBe("+6.0%");
  });
  it("6. negative edge", () => {
    expect(calcEdge(18.0, 21.5)).toBeCloseTo(-3.5, 1);
    expect(formatEdge(-3.5)).toBe("-3.5%");
  });
  it("7. zero edge", () => {
    expect(calcEdge(60.0, 60.0)).toBe(0);
    expect(formatEdge(0)).toBe("0.0%");
  });
});

// ─── buildMatchupValue ────────────────────────────────────────────────────────

const modelProbs = { team1: 60.0, draw: 21.4, team2: 18.6 };

describe("buildMatchupValue", () => {
  const raw: RawThreeWayPrices = {
    team1: 0.54, draw: 0.24, team2: 0.22,
    source: "polymarket",
    marketId: "test-market",
    updatedAt: new Date().toISOString(),
  };

  it("16. model probabilities remain unchanged", () => {
    const v = buildMatchupValue(raw, modelProbs.team1, modelProbs.draw, modelProbs.team2)!;
    expect(v.team1.modelProbability).toBe(60.0);
    expect(v.draw.modelProbability).toBe(21.4);
    expect(v.team2.modelProbability).toBe(18.6);
  });

  it("18. renders all three model, market, and value numbers", () => {
    const v = buildMatchupValue(raw, modelProbs.team1, modelProbs.draw, modelProbs.team2)!;
    expect(v.team1.marketProbability).toBeGreaterThan(0);
    expect(v.draw.marketProbability).toBeGreaterThan(0);
    expect(v.team2.marketProbability).toBeGreaterThan(0);
    expect(Number.isFinite(v.team1.valueEdge)).toBe(true);
    expect(Number.isFinite(v.draw.valueEdge)).toBe(true);
    expect(Number.isFinite(v.team2.valueEdge)).toBe(true);
  });

  it("8. returns null when a price is zero", () => {
    const badRaw: RawThreeWayPrices = { ...raw, draw: 0 };
    expect(buildMatchupValue(badRaw, 60, 21.4, 18.6)).toBeNull();
  });

  it("19. returns null when input is invalid (missing market)", () => {
    expect(buildMatchupValue({ ...raw, team1: NaN }, 60, 21.4, 18.6)).toBeNull();
  });

  it("20. no NaN, undefined, or zero in output for valid input", () => {
    const v = buildMatchupValue(raw, 60.0, 21.4, 18.6)!;
    for (const key of ["team1", "draw", "team2"] as const) {
      expect(v[key].modelProbability).not.toBeNaN();
      expect(v[key].marketProbability).not.toBeNaN();
      expect(v[key].valueEdge).not.toBeNaN();
      expect(v[key].marketProbability).toBeGreaterThan(0);
    }
  });
});

// ─── 17: best value selection ────────────────────────────────────────────────

describe("bestValueOutcome", () => {
  it("17. selects the outcome with the largest positive edge", () => {
    const v = buildMatchupValue(
      { team1: 0.54, draw: 0.24, team2: 0.22, source: "espn" },
      60.0, 21.4, 18.6,
    )!;
    // team1 model=60, market~54% → edge~+6 — should be best
    expect(bestValueOutcome(v)).toBe("team1");
  });

  it("returns null when no edge exceeds threshold", () => {
    const v = buildMatchupValue(
      { team1: 0.60, draw: 0.214, team2: 0.186, source: "espn" },
      60.0, 21.4, 18.6,
    )!;
    // Model and market match exactly — edges ≈ 0
    expect(bestValueOutcome(v, 2)).toBeNull();
  });
});

// ─── 12–14: team name normalization ──────────────────────────────────────────

describe("normalizeTeamName / teamsMatch", () => {
  it("12. reversed team ordering maps correctly via normalization", () => {
    expect(teamsMatch("Brazil", "brazil")).toBe(true);
    expect(teamsMatch("Brazil", "Argentina")).toBe(false);
  });

  it("13. draw label maps correctly", () => {
    expect(normalizeTeamName("draw")).toBe("draw");
  });

  it("14. accented team names normalize correctly", () => {
    expect(teamsMatch("Côte d'Ivoire", "Ivory Coast")).toBe(true);
    expect(teamsMatch("Türkiye", "Turkey")).toBe(true);
    expect(teamsMatch("IR Iran", "Iran")).toBe(true);
    expect(teamsMatch("Cabo Verde", "Cape Verde")).toBe(true);
  });
});

// ─── 10–11: market freshness ─────────────────────────────────────────────────

describe("isMarketFresh", () => {
  it("10. stale market (>6h old) is rejected", () => {
    const old = new Date(Date.now() - 7 * 3_600_000).toISOString();
    expect(isMarketFresh(old, 6)).toBe(false);
  });

  it("11. fresh market (<6h) is accepted", () => {
    const fresh = new Date(Date.now() - 1 * 3_600_000).toISOString();
    expect(isMarketFresh(fresh, 6)).toBe(true);
  });

  it("15. wrong date market (8h old) is rejected", () => {
    const yesterday = new Date(Date.now() - 8 * 3_600_000).toISOString();
    expect(isMarketFresh(yesterday, 6)).toBe(false);
  });

  it("undefined timestamp is allowed (unknown age)", () => {
    expect(isMarketFresh(undefined)).toBe(true);
  });
});
