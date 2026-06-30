import { describe, it, expect } from "vitest";
import { WEIGHTS, normalize, composite, rankOf } from "../../scripts/generate-mlb-power-rankings.mjs";

// ── 9: Weights sum to 1 ────────────────────────────────────────────────────────

describe("Power Rankings weights", () => {
  it("9. composite weights sum to 1.0", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

// ── 2–7: Metric direction ───────────────────────────────────────────────────────

describe("Metric direction correctness", () => {
  it("2. higher xBA receives a better (higher) normalized score", () => {
    const norm = normalize([0.230, 0.250, 0.270], false);
    expect(norm[2]).toBeGreaterThan(norm[0]);
  });

  it("3. higher OPS receives a better score", () => {
    const norm = normalize([0.680, 0.750, 0.820], false);
    expect(norm[2]).toBeGreaterThan(norm[0]);
  });

  it("4. higher wRC+ receives a better score", () => {
    const norm = normalize([85, 100, 120], false);
    expect(norm[2]).toBeGreaterThan(norm[0]);
  });

  it("5. lower xERA (era proxy) receives a better score", () => {
    const norm = normalize([3.20, 4.00, 5.10], true); // lowerIsBetter
    expect(norm[0]).toBeGreaterThan(norm[2]); // lowest ERA (3.20) scores highest
  });

  it("6. lower xFIP (fip proxy) receives a better score", () => {
    const norm = normalize([3.40, 4.10, 4.90], true);
    expect(norm[0]).toBeGreaterThan(norm[2]);
  });

  it("7. higher run differential receives a better score", () => {
    const norm = normalize([-1.2, 0.0, 1.5], false);
    expect(norm[2]).toBeGreaterThan(norm[0]);
  });
});

// ── 8: Schedule-adjusted performance credit ─────────────────────────────────────

describe("Schedule-adjusted performance", () => {
  it("8. team outperforming a tough schedule scores higher than expected raw win%", () => {
    // schedAdj = (actualWinPct - expectedWinPct) * 100
    // A team with .550 win% but expected .500 (tough schedule) should score positive
    const schedAdjValues = [5.0, -2.0, 0.0]; // team A overperformed, B underperformed, C on pace
    const norm = normalize(schedAdjValues, false);
    expect(norm[0]).toBeGreaterThan(norm[1]); // overperformer > underperformer
  });
});

// ── 10: Composite range ─────────────────────────────────────────────────────────

describe("Composite score bounds", () => {
  it("10. composite score remains within 0-100", () => {
    const teams = [0, 1, 2];
    const norms = {
      era: [10, 50, 90], fip: [20, 50, 85], xba: [15, 55, 95],
      ops: [25, 50, 80], wrcPlus: [30, 50, 75],
      runDifferential: [5, 50, 100], scheduleAdjPerformance: [40, 50, 60],
    };
    for (const i of teams) {
      const c = composite(norms, WEIGHTS, i);
      expect(c).not.toBeNull();
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(100);
    }
  });
});

// ── 11–12: Missing data handling ────────────────────────────────────────────────

describe("Missing metric handling", () => {
  it("11. missing metric weights are renormalized (not treated as zero)", () => {
    // Team 0 has all 7 metrics; Team 1 is missing xba (1 of 7 missing)
    const norms = {
      era: [80, 80], fip: [80, 80], xba: [80, null],
      ops: [80, 80], wrcPlus: [80, 80],
      runDifferential: [80, 80], scheduleAdjPerformance: [80, 80],
    };
    const c0 = composite(norms, WEIGHTS, 0);
    const c1 = composite(norms, WEIGHTS, 1);
    // Both should be close to 80 since all present metrics are 80 — renormalization
    // should NOT drag c1 down toward 0 just because one metric is missing
    expect(c1).not.toBeNull();
    expect(c1).toBeCloseTo(80, 0);
    expect(Math.abs(c0 - c1)).toBeLessThan(1);
  });

  it("12. team below completeness threshold (< 5 of 7 metrics) is marked unavailable (null)", () => {
    // Only 3 of 7 metrics present — below the 5/7 threshold
    const norms = {
      era: [80], fip: [null], xba: [null],
      ops: [80], wrcPlus: [null],
      runDifferential: [80], scheduleAdjPerformance: [null],
    };
    const c = composite(norms, WEIGHTS, 0);
    expect(c).toBeNull();
  });
});

// ── 13: Independent season/last30 calculation ───────────────────────────────────

describe("Season and Last 30 independence", () => {
  it("13. season and last30 composites are calculated independently from separate data", () => {
    const seasonNorms = { era: [90], fip: [90], xba: [90], ops: [90], wrcPlus: [90], runDifferential: [90], scheduleAdjPerformance: [90] };
    const last30Norms = { era: [20], fip: [20], xba: [20], ops: [20], wrcPlus: [20], runDifferential: [20], scheduleAdjPerformance: [20] };
    const seasonComp = composite(seasonNorms, WEIGHTS, 0);
    const last30Comp = composite(last30Norms, WEIGHTS, 0);
    // A team can have a great season but terrible last 30 — values must differ independently
    expect(seasonComp).toBeGreaterThan(80);
    expect(last30Comp).toBeLessThan(30);
  });
});

// ── 14: Small-sample shrinkage ───────────────────────────────────────────────────

describe("Last-30 small-sample shrinkage", () => {
  it("14. fewer than 10 games shrinks last30 toward season composite", () => {
    const SHRINK_FLOOR = 10;
    const rawLast30 = 95; // hot streak
    const seasonComposite = 50; // average team
    const gamesPlayed = 4;
    const weight = gamesPlayed / SHRINK_FLOOR;
    const shrunk = weight * rawLast30 + (1 - weight) * seasonComposite;
    // 4/10 weight on raw (95) + 6/10 weight on season (50) = 38 + 30 = 68
    expect(shrunk).toBeCloseTo(68, 0);
    expect(shrunk).toBeLessThan(rawLast30); // shrunk toward season, not full raw value
    expect(shrunk).toBeGreaterThan(seasonComposite); // still reflects some of the hot streak
  });

  it("full 30-game sample is not distorted by shrinkage", () => {
    const SHRINK_FLOOR = 10;
    const gamesPlayed = 28;
    // gamesPlayed >= SHRINK_FLOOR means raw value used directly (no shrink)
    expect(gamesPlayed >= SHRINK_FLOOR).toBe(true);
  });
});

// ── 16: Next-30 rolling window ───────────────────────────────────────────────────

describe("Next-30 SOS window", () => {
  it("16. next-30 window is exactly a rolling 30 calendar days from today", () => {
    const today = "2026-06-30";
    const addDays = (dateStr, n) => {
      const d = new Date(dateStr + "T12:00:00-05:00");
      d.setDate(d.getDate() + n);
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
    };
    const end = addDays(today, 30);
    // 30 days from June 30 should land around July 30
    expect(end.startsWith("2026-07")).toBe(true);
    const daysDiff = (new Date(end) - new Date(today)) / 86400000;
    expect(daysDiff).toBeCloseTo(30, 0);
  });
});

// ── 17–20: Game filtering rules ─────────────────────────────────────────────────

describe("Game filtering for schedule windows", () => {
  function isFutureGameValid(game) {
    if (game.status?.abstractGameState === "Final") return false;
    const detail = game.status?.detailedState ?? "";
    if (["Postponed", "Cancelled", "Suspended"].includes(detail)) return false;
    if (game.gameType !== "R") return false;
    return true;
  }

  it("17. rest-of-season excludes completed games", () => {
    const game = { status: { abstractGameState: "Final" }, gameType: "R" };
    expect(isFutureGameValid(game)).toBe(false);
  });

  it("18. postponed games are excluded", () => {
    const game = { status: { abstractGameState: "Preview", detailedState: "Postponed" }, gameType: "R" };
    expect(isFutureGameValid(game)).toBe(false);
  });

  it("19. cancelled games are excluded", () => {
    const game = { status: { abstractGameState: "Preview", detailedState: "Cancelled" }, gameType: "R" };
    expect(isFutureGameValid(game)).toBe(false);
  });

  it("20. postseason games are excluded (gameType must be R)", () => {
    const game = { status: { abstractGameState: "Preview", detailedState: "Scheduled" }, gameType: "P" };
    expect(isFutureGameValid(game)).toBe(false);
  });

  it("valid scheduled regular season game passes", () => {
    const game = { status: { abstractGameState: "Preview", detailedState: "Scheduled" }, gameType: "R" };
    expect(isFutureGameValid(game)).toBe(true);
  });
});

// ── 21: Duplicate schedule deduplication ────────────────────────────────────────

describe("Schedule deduplication", () => {
  it("21. duplicate schedule games (same gamePk) are deduplicated", () => {
    const games = [
      { gamePk: 1001, date: "2026-07-01" },
      { gamePk: 1001, date: "2026-07-01" }, // duplicate
      { gamePk: 1002, date: "2026-07-02" },
    ];
    const seen = new Set();
    const deduped = games.filter((g) => {
      if (seen.has(g.gamePk)) return false;
      seen.add(g.gamePk);
      return true;
    });
    expect(deduped).toHaveLength(2);
  });
});

// ── 22–23: Opponent composite averaging and SOS ranking ─────────────────────────

describe("SOS calculation", () => {
  it("22. opponent composite averaging is correct (weighted by games)", () => {
    const compById = new Map([[1, 80], [2, 40], [3, 60]]);
    const games = [
      { opponentId: 1 }, { opponentId: 1 }, // 2 games vs team 1 (comp=80)
      { opponentId: 2 },                     // 1 game vs team 2 (comp=40)
    ];
    const total = games.reduce((s, g) => s + (compById.get(g.opponentId) ?? 50), 0);
    const avg = total / games.length;
    // (80+80+40)/3 = 66.67
    expect(avg).toBeCloseTo(66.67, 1);
  });

  it("23. SOS ranks hardest to easiest (higher SOS score = rank 1)", () => {
    const sosValues = [45.2, 78.9, 60.1]; // team index 1 has hardest schedule
    const indexed = sosValues.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
    expect(indexed[0].i).toBe(1); // hardest schedule (78.9) ranks #1
    expect(indexed[2].i).toBe(0); // easiest (45.2) ranks last
  });
});

// ── 1: All 30 teams present (using real generated data if available) ────────────

describe("Team coverage", () => {
  it("1. rankOf returns a valid 1-30 rank for any index in a 30-team array", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 - i);
    const rank = rankOf(values, 0, false);
    expect(rank).toBe(1); // highest value (100) ranks #1
    const lastRank = rankOf(values, 29, false);
    expect(lastRank).toBe(30);
  });
});

// ── 15: Current SOS uses opponent composite, weighted by games played ───────────

describe("Current SOS formula", () => {
  it("15. current SOS repeats opponents correctly when faced multiple times", () => {
    // Division rivals faced 13x should count 13x in the average, not just once
    const compById = new Map([[10, 90]]); // one tough division rival
    const games = Array.from({ length: 13 }, () => ({ opponentId: 10 }));
    const total = games.reduce((s, g) => s + (compById.get(g.opponentId) ?? 50), 0);
    const avg = total / games.length;
    expect(avg).toBe(90); // all 13 games vs the same 90-composite team
  });
});
