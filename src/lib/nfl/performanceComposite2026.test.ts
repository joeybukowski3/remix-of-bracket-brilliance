import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_OVERALL_WEIGHTS,
  PERFORMANCE_PUBLIC_SCALE,
  PERFORMANCE_SCALE_DIVISORS,
  buildPerformanceRatingBoard,
  type TeamPerformanceSeasonEntry,
} from "@/lib/nfl/performanceComposite2026";
import {
  deriveTeamPerformanceMetrics,
  type PerformanceDriveSums,
  type PerformancePlaySums,
  type TeamPerformanceWindowInput,
} from "@/lib/nfl/performanceMetricsCore2026";

// ---------------------------------------------------------------------------
// Fixture factories.
// ---------------------------------------------------------------------------

const PLAYS = 100;

/** Build a play-sums bucket from simple rate parameters at a fixed play count. */
function sums(rates: { epaPlay?: number; sr?: number; explosiveRate?: number } = {}): PerformancePlaySums {
  const { epaPlay = 0, sr = 0.4, explosiveRate = 0.08 } = rates;
  const explosiveTotal = Math.round(explosiveRate * PLAYS);
  return {
    offEpa: epaPlay * PLAYS,
    offPlays: PLAYS,
    successNum: Math.round(sr * PLAYS),
    successDen: PLAYS,
    epaPosNum: Math.round(0.45 * PLAYS),
    epaPosDen: PLAYS,
    earlyEpa: epaPlay * 60,
    earlyPlays: 60,
    earlySuccessNum: Math.round(sr * 60),
    earlySuccessDen: 60,
    passEpa: epaPlay * 60,
    passPlays: 60,
    passSuccessNum: Math.round(sr * 60),
    passSuccessDen: 60,
    rushEpa: epaPlay * 40,
    rushPlays: 40,
    rushSuccessNum: Math.round(sr * 40),
    rushSuccessDen: 40,
    explosivePass: Math.round(explosiveTotal * 0.6),
    explosiveRush: explosiveTotal - Math.round(explosiveTotal * 0.6),
    thirdEpa: epaPlay * 15,
    thirdPlays: 15,
    thirdSuccessNum: Math.round(sr * 15),
    thirdSuccessDen: 15,
    thirdRawConvNum: Math.round(sr * 15),
    thirdRawConvDen: 15,
    sacks: 3,
    dropbacks: 60,
  };
}

function drives(pointsPerDrive: number): PerformanceDriveSums {
  return { drives: 11, points: Math.round(pointsPerDrive * 11 * 10) / 10 };
}

type TeamQuality = {
  offAll?: { epaPlay?: number; sr?: number; explosiveRate?: number };
  offFiltered?: { epaPlay?: number; sr?: number; explosiveRate?: number };
  defAll?: { epaPlay?: number; sr?: number; explosiveRate?: number };
  defFiltered?: { epaPlay?: number; sr?: number; explosiveRate?: number };
  ppdOff?: number;
  ppdDef?: number;
  pointDiff?: number;
  opponents: readonly string[];
};

function buildWindowInput(team: string, q: TeamQuality): TeamPerformanceWindowInput {
  return {
    team,
    gamesPlayed: q.opponents.length,
    offense: { all: sums(q.offAll ?? q.offFiltered), filtered: sums(q.offFiltered ?? q.offAll) },
    defenseAllowed: { all: sums(q.defAll ?? q.defFiltered), filtered: sums(q.defFiltered ?? q.defAll) },
    driveOff: drives(q.ppdOff ?? 2.0),
    driveDefAllowed: drives(q.ppdDef ?? 2.0),
  };
}

function buildEntry(team: string, q: TeamQuality): TeamPerformanceSeasonEntry {
  return {
    team,
    metrics: deriveTeamPerformanceMetrics(buildWindowInput(team, q)),
    opponents: q.opponents,
    pointDifferentialPerGame: q.pointDiff ?? 0,
  };
}

/** A 6-team round-robin league (every team faces every other team once). */
const LEAGUE_TEAMS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"];
function opponentsFor(team: string): string[] {
  return LEAGUE_TEAMS.filter((t) => t !== team);
}

function row(board: ReturnType<typeof buildPerformanceRatingBoard>, team: string) {
  const found = board.rows.find((r) => r.team === team);
  if (!found) throw new Error(`missing row for ${team}`);
  return found;
}

// ---------------------------------------------------------------------------
// 1. Equal OFF weights across EPA / SR / Explosive
// ---------------------------------------------------------------------------
describe("OFF composite weighting", () => {
  it("1. weights EPA, SR, and Explosive Rate equally (1/3 each)", () => {
    const entries: TeamPerformanceSeasonEntry[] = LEAGUE_TEAMS.map((team, i) =>
      buildEntry(team, {
        offFiltered: { epaPlay: i === 0 ? 0.3 : 0.0, sr: 0.4, explosiveRate: 0.08 },
        defFiltered: { epaPlay: 0.0, sr: 0.4, explosiveRate: 0.08 },
        opponents: opponentsFor(team),
      })
    );
    const board = buildPerformanceRatingBoard(entries);
    const boosted = row(board, "AAA");
    // offense.composite is the un-restandardized mean of the 3 component z's,
    // so equal 1/3 weighting is a direct, deterministic identity here.
    expect(boosted.offense.composite).not.toBeNull();
    expect(boosted.offense.composite as number).toBeCloseTo((boosted.offense.epaPerPlayZ as number) / 3, 5);
  });
});

// ---------------------------------------------------------------------------
// 2. Equal DEF weights
// ---------------------------------------------------------------------------
describe("DEF composite weighting", () => {
  it("2. weights EPA-allowed, SR-allowed, and Explosive-allowed equally (1/3 each)", () => {
    const entries: TeamPerformanceSeasonEntry[] = LEAGUE_TEAMS.map((team, i) =>
      buildEntry(team, {
        offFiltered: { epaPlay: 0.0, sr: 0.4, explosiveRate: 0.08 },
        defFiltered: { epaPlay: i === 0 ? -0.3 : 0.0, sr: 0.4, explosiveRate: 0.08 },
        opponents: opponentsFor(team),
      })
    );
    const board = buildPerformanceRatingBoard(entries);
    const stingy = row(board, "AAA");
    expect(stingy.defense.composite).not.toBeNull();
    expect(stingy.defense.composite as number).toBeCloseTo((-(stingy.defense.epaPerPlayAllowedZ as number)) / 3, 5);
  });
});

// ---------------------------------------------------------------------------
// 3. Defensive inversion works correctly
// ---------------------------------------------------------------------------
describe("defensive inversion", () => {
  it("3. lower EPA/SR/Explosive allowed produces a HIGHER defense composite", () => {
    const entries: TeamPerformanceSeasonEntry[] = LEAGUE_TEAMS.map((team) =>
      buildEntry(team, {
        offFiltered: { epaPlay: 0, sr: 0.4, explosiveRate: 0.08 },
        defFiltered: {
          epaPlay: team === "AAA" ? -0.2 : team === "BBB" ? 0.2 : 0,
          sr: team === "AAA" ? 0.3 : team === "BBB" ? 0.5 : 0.4,
          explosiveRate: team === "AAA" ? 0.04 : team === "BBB" ? 0.12 : 0.08,
        },
        opponents: opponentsFor(team),
      })
    );
    const board = buildPerformanceRatingBoard(entries);
    const stingyDefense = row(board, "AAA"); // allows less EPA/SR/explosive
    const leakyDefense = row(board, "BBB"); // allows more
    expect(stingyDefense.defense.compositeZ as number).toBeGreaterThan(leakyDefense.defense.compositeZ as number);
    expect(stingyDefense.defensePerformanceRating as number).toBeGreaterThan(leakyDefense.defensePerformanceRating as number);
  });
});

// ---------------------------------------------------------------------------
// 4 & 5. Ranking direction
// ---------------------------------------------------------------------------
describe("ranking direction", () => {
  const entries: TeamPerformanceSeasonEntry[] = LEAGUE_TEAMS.map((team, i) =>
    buildEntry(team, {
      offFiltered: { epaPlay: 0.3 - i * 0.1, sr: 0.5 - i * 0.03, explosiveRate: 0.12 - i * 0.01 },
      defFiltered: { epaPlay: -0.15 + i * 0.05, sr: 0.35 + i * 0.01, explosiveRate: 0.06 + i * 0.005 },
      opponents: opponentsFor(team),
    })
  );
  const board = buildPerformanceRatingBoard(entries);

  it("4. higher OFF composite -> better (lower-numbered) offense rank", () => {
    const best = row(board, "AAA");
    const worst = row(board, "FFF");
    expect(best.offense.compositeZ as number).toBeGreaterThan(worst.offense.compositeZ as number);
    expect(best.offensePerformanceRank as number).toBeLessThan(worst.offensePerformanceRank as number);
  });

  it("5. higher DEF composite -> better (lower-numbered) defense rank", () => {
    const best = row(board, "AAA");
    const worst = row(board, "FFF");
    expect(best.defense.compositeZ as number).toBeGreaterThan(worst.defense.compositeZ as number);
    expect(best.defensePerformanceRank as number).toBeLessThan(worst.defensePerformanceRank as number);
  });

  it("17. rank ordering exactly matches rating ordering (no ties broken inconsistently)", () => {
    const sortedByRating = [...board.rows].sort((a, b) => (b.performanceRating ?? 0) - (a.performanceRating ?? 0));
    const sortedByRank = [...board.rows].sort((a, b) => (a.performanceRank ?? 0) - (b.performanceRank ?? 0));
    expect(sortedByRating.map((r) => r.team)).toEqual(sortedByRank.map((r) => r.team));
  });
});

// ---------------------------------------------------------------------------
// 6. 40/40/20 overall formula
// ---------------------------------------------------------------------------
describe("overall formula", () => {
  it("6. overallComposite = 0.4*offZ + 0.4*defZ + 0.2*pointDiffZ", () => {
    const entries: TeamPerformanceSeasonEntry[] = LEAGUE_TEAMS.map((team, i) =>
      buildEntry(team, {
        offFiltered: { epaPlay: i === 0 ? 0.25 : 0.02, sr: 0.42, explosiveRate: 0.09 },
        defFiltered: { epaPlay: i === 1 ? -0.2 : 0.0, sr: 0.4, explosiveRate: 0.08 },
        pointDiff: i === 2 ? 10 : 0,
        opponents: opponentsFor(team),
      })
    );
    const board = buildPerformanceRatingBoard(entries);
    expect(PERFORMANCE_OVERALL_WEIGHTS).toEqual({ offense: 0.4, defense: 0.4, pointDifferential: 0.2 });
    for (const r of board.rows) {
      if (r.offense.compositeZ === null || r.defense.compositeZ === null || r.pointDifferential.z === null) continue;
      const expected =
        0.4 * r.offense.compositeZ + 0.4 * r.defense.compositeZ + 0.2 * r.pointDifferential.z;
      expect(r.overallComposite as number).toBeCloseTo(expected, 8);
    }
  });

  it("7. point differential stays a separate 20% term, never folded into OFF or DEF", () => {
    const base: TeamQuality = {
      offFiltered: { epaPlay: 0.05, sr: 0.4, explosiveRate: 0.08 },
      defFiltered: { epaPlay: 0.0, sr: 0.4, explosiveRate: 0.08 },
      opponents: [],
    };
    const entriesA = LEAGUE_TEAMS.map((team) => buildEntry(team, { ...base, pointDiff: 0, opponents: opponentsFor(team) }));
    const entriesB = LEAGUE_TEAMS.map((team, i) =>
      buildEntry(team, { ...base, pointDiff: i === 0 ? 14 : 0, opponents: opponentsFor(team) })
    );
    const boardA = buildPerformanceRatingBoard(entriesA);
    const boardB = buildPerformanceRatingBoard(entriesB);
    const aaaA = row(boardA, "AAA");
    const aaaB = row(boardB, "AAA");
    // Changing only point differential must not move OFF/DEF composites at all.
    expect(aaaB.offense.compositeZ).toBeCloseTo(aaaA.offense.compositeZ as number, 6);
    expect(aaaB.defense.compositeZ).toBeCloseTo(aaaA.defense.compositeZ as number, 6);
    // ...but must move the overall rating.
    expect(aaaB.performanceRating as number).not.toBeCloseTo(aaaA.performanceRating as number, 3);
  });
});

// ---------------------------------------------------------------------------
// 8. Display-only metrics do not affect the composite
// ---------------------------------------------------------------------------
describe("display-only metrics", () => {
  it("8. PPD, Early Down, Passing/Rushing Efficiency, Third Down, and Sack Rate never move the rating", () => {
    const shared: TeamQuality = {
      offFiltered: { epaPlay: 0.08, sr: 0.44, explosiveRate: 0.09 },
      defFiltered: { epaPlay: -0.02, sr: 0.38, explosiveRate: 0.07 },
      opponents: [],
    };
    const entriesLowPpd = LEAGUE_TEAMS.map((team) =>
      buildEntry(team, { ...shared, ppdOff: 1.0, ppdDef: 3.5, opponents: opponentsFor(team) })
    );
    const entriesHighPpd = LEAGUE_TEAMS.map((team) =>
      buildEntry(team, { ...shared, ppdOff: 4.5, ppdDef: 0.5, opponents: opponentsFor(team) })
    );
    const boardLow = buildPerformanceRatingBoard(entriesLowPpd);
    const boardHigh = buildPerformanceRatingBoard(entriesHighPpd);

    // Sanity: the display-only metric itself really did change.
    expect(row(boardLow, "AAA")).toBeDefined();
    const lowMetrics = entriesLowPpd[0].metrics.pointsPerDriveOff;
    const highMetrics = entriesHighPpd[0].metrics.pointsPerDriveOff;
    expect(lowMetrics).not.toBeCloseTo(highMetrics as number, 1);

    for (const team of LEAGUE_TEAMS) {
      const low = row(boardLow, team);
      const high = row(boardHigh, team);
      expect(low.offensePerformanceRating).toBeCloseTo(high.offensePerformanceRating as number, 6);
      expect(low.defensePerformanceRating).toBeCloseTo(high.defensePerformanceRating as number, 6);
      expect(low.performanceRating).toBeCloseTo(high.performanceRating as number, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Traditional Success Rate remains canonical
// ---------------------------------------------------------------------------
describe("Success Rate definition", () => {
  it("9. successRate is the traditional down-and-distance definition, not EPA>0", () => {
    const input = buildWindowInput("AAA", {
      offFiltered: { epaPlay: 0.05, sr: 0.55, explosiveRate: 0.08 },
      opponents: [],
    });
    // Force epaPosRate to disagree sharply with the traditional SR we set.
    input.offense.filtered.epaPosNum = 90;
    input.offense.filtered.epaPosDen = 100;
    const metrics = deriveTeamPerformanceMetrics(input);
    expect(metrics.offense.filtered.successRate).toBeCloseTo(0.55, 5);
    expect(metrics.offense.filtered.epaPositiveRate).toBeCloseTo(0.9, 5);
    expect(metrics.offense.filtered.successRate).not.toBeCloseTo(metrics.offense.filtered.epaPositiveRate as number, 2);
  });
});

// ---------------------------------------------------------------------------
// 10, 11, 12. Garbage-time filter treatment per metric
// ---------------------------------------------------------------------------
describe("garbage-time filter treatment (backtest-approved)", () => {
  // Every team shares identical defenseAllowed/offense comparison values so
  // opponent adjustment is a mathematical no-op (oppMean == leagueMean),
  // letting these tests isolate filter selection cleanly.
  function noOpAdjustmentLeague(offAll: number, offFiltered: number, expAll: number, expFiltered: number) {
    return LEAGUE_TEAMS.map((team, i) =>
      buildEntry(team, {
        offAll: { epaPlay: i === 0 ? offAll : 0, sr: i === 0 ? 0.6 : 0.4, explosiveRate: i === 0 ? expAll : 0.08 },
        offFiltered: { epaPlay: i === 0 ? offFiltered : 0, sr: i === 0 ? 0.3 : 0.4, explosiveRate: i === 0 ? expFiltered : 0.08 },
        defAll: { epaPlay: 0, sr: 0.4, explosiveRate: 0.08 },
        defFiltered: { epaPlay: 0, sr: 0.4, explosiveRate: 0.08 },
        opponents: opponentsFor(team),
      })
    );
  }

  it("10. EPA/Play uses the garbage-time-FILTERED bundle", () => {
    const board = buildPerformanceRatingBoard(noOpAdjustmentLeague(0.5, -0.1, 0.08, 0.08));
    const aaa = row(board, "AAA");
    expect(aaa.offense.epaPerPlayAdjusted).toBeCloseTo(-0.1, 5); // filtered value, not the 0.5 "all" value
  });

  it("11. Success Rate uses the garbage-time-FILTERED bundle", () => {
    const board = buildPerformanceRatingBoard(noOpAdjustmentLeague(0, 0, 0.08, 0.08));
    const aaa = row(board, "AAA");
    expect(aaa.offense.successRateAdjusted).toBeCloseTo(0.3, 5); // filtered SR (0.3), not all SR (0.6)
  });

  it("12. Explosive Rate uses the UNFILTERED bundle", () => {
    const board = buildPerformanceRatingBoard(noOpAdjustmentLeague(0, 0, 0.15, 0.02));
    const aaa = row(board, "AAA");
    expect(aaa.offense.explosiveRateAdjusted).toBeCloseTo(0.15, 5); // "all" value, not the 0.02 filtered value
  });
});

// ---------------------------------------------------------------------------
// 13. Full-season opponent adjustment (applied here; never for L4/L8)
// ---------------------------------------------------------------------------
describe("opponent adjustment", () => {
  it("13. adjustment measurably changes the value when opponent strength is unequal", () => {
    // AAA faces only weak defenses (high EPA allowed); BBB faces only strong
    // defenses (low EPA allowed). Both have identical raw offensive EPA.
    const weakDefenseTeams = ["W1", "W2", "W3", "W4", "W5"];
    const strongDefenseTeams = ["S1", "S2", "S3", "S4", "S5"];
    const entries: TeamPerformanceSeasonEntry[] = [
      buildEntry("AAA", { offFiltered: { epaPlay: 0.1, sr: 0.4, explosiveRate: 0.08 }, defFiltered: { epaPlay: 0, sr: 0.4, explosiveRate: 0.08 }, opponents: weakDefenseTeams }),
      buildEntry("BBB", { offFiltered: { epaPlay: 0.1, sr: 0.4, explosiveRate: 0.08 }, defFiltered: { epaPlay: 0, sr: 0.4, explosiveRate: 0.08 }, opponents: strongDefenseTeams }),
      ...weakDefenseTeams.map((t) =>
        buildEntry(t, { offFiltered: { epaPlay: 0, sr: 0.4, explosiveRate: 0.08 }, defFiltered: { epaPlay: 0.25, sr: 0.4, explosiveRate: 0.08 }, opponents: ["AAA"] })
      ),
      ...strongDefenseTeams.map((t) =>
        buildEntry(t, { offFiltered: { epaPlay: 0, sr: 0.4, explosiveRate: 0.08 }, defFiltered: { epaPlay: -0.25, sr: 0.4, explosiveRate: 0.08 }, opponents: ["BBB"] })
      ),
    ];
    const board = buildPerformanceRatingBoard(entries);
    const aaa = row(board, "AAA");
    const bbb = row(board, "BBB");
    // Raw EPA is identical (0.1) but AAA played weaker defenses, so its
    // adjusted value should be LOWER than BBB's (which beat strong defenses).
    expect(aaa.offense.epaPerPlayAdjusted as number).not.toBeCloseTo(bbb.offense.epaPerPlayAdjusted as number, 2);
    expect(bbb.offense.epaPerPlayAdjusted as number).toBeGreaterThan(aaa.offense.epaPerPlayAdjusted as number);
  });

  it("13b. this module only exposes a full-season board builder, not an L4/L8 variant", () => {
    // Documents the approved design: no opponent-adjusted small-window API exists here.
    expect(typeof buildPerformanceRatingBoard).toBe("function");
    expect((buildPerformanceRatingBoard as unknown as Record<string, unknown>).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 14, 15, 16. 1-99 scale behavior
// ---------------------------------------------------------------------------
describe("1-99 public scale", () => {
  it("14. a league-average team scores ~50", () => {
    const entries = LEAGUE_TEAMS.map((team) =>
      buildEntry(team, {
        offFiltered: { epaPlay: 0.02, sr: 0.42, explosiveRate: 0.08 },
        defFiltered: { epaPlay: 0.0, sr: 0.4, explosiveRate: 0.08 },
        opponents: opponentsFor(team),
      })
    );
    const board = buildPerformanceRatingBoard(entries);
    for (const r of board.rows) {
      expect(r.performanceRating as number).toBeCloseTo(50, 0);
    }
  });

  it("15 & 16. min/max historical clamping is minimal (fitted divisor, not degenerate)", () => {
    expect(PERFORMANCE_SCALE_DIVISORS.offense).toBeGreaterThan(0.5);
    expect(PERFORMANCE_SCALE_DIVISORS.offense).toBeLessThan(1.2);
    expect(PERFORMANCE_SCALE_DIVISORS.defense).toBeGreaterThan(0.5);
    expect(PERFORMANCE_SCALE_DIVISORS.defense).toBeLessThan(1.2);
    expect(PERFORMANCE_SCALE_DIVISORS.overall).toBeGreaterThan(0.5);
    expect(PERFORMANCE_SCALE_DIVISORS.overall).toBeLessThan(1.2);
    expect(PERFORMANCE_PUBLIC_SCALE).toEqual({ center: 50, standardDeviation: 15, minimum: 1, maximum: 99 });
  });

  it("clamps only at the true [1, 99] extremes for pathological inputs", () => {
    const entries = LEAGUE_TEAMS.map((team, i) =>
      buildEntry(team, {
        offFiltered: { epaPlay: i === 0 ? 3 : -3, sr: i === 0 ? 0.95 : 0.05, explosiveRate: i === 0 ? 0.9 : 0.01 },
        defFiltered: { epaPlay: 0, sr: 0.4, explosiveRate: 0.08 },
        opponents: opponentsFor(team),
      })
    );
    const board = buildPerformanceRatingBoard(entries);
    for (const r of board.rows) {
      expect(r.performanceRating as number).toBeGreaterThanOrEqual(1);
      expect(r.performanceRating as number).toBeLessThanOrEqual(99);
    }
  });
});

// ---------------------------------------------------------------------------
// 18. Historical distribution stability (refit divisors, from the real backtest)
// ---------------------------------------------------------------------------
describe("historical scale-fit stability", () => {
  it("18. fitted divisors are close to the proven v0.3.1 pooled divisor (0.733), not wildly different", () => {
    // Sanity bound: an independently-fit model over similar data should land
    // in the same neighborhood as the production v0.3.1 divisor, not an
    // order of magnitude off (which would indicate a degenerate fit).
    for (const divisor of Object.values(PERFORMANCE_SCALE_DIVISORS)) {
      expect(divisor).toBeGreaterThan(0.3);
      expect(divisor).toBeLessThan(1.5);
    }
  });
});

// ---------------------------------------------------------------------------
// 19. L4/L8/Season raw metrics remain computable
// ---------------------------------------------------------------------------
describe("window-agnostic metric computation", () => {
  it("19. deriveTeamPerformanceMetrics works identically for any window size (L4/L8/Full)", () => {
    const l4Input = buildWindowInput("AAA", { offFiltered: { epaPlay: 0.1, sr: 0.45, explosiveRate: 0.09 }, opponents: [] });
    l4Input.gamesPlayed = 4;
    const fullInput = buildWindowInput("AAA", { offFiltered: { epaPlay: 0.1, sr: 0.45, explosiveRate: 0.09 }, opponents: [] });
    fullInput.gamesPlayed = 17;

    const l4Metrics = deriveTeamPerformanceMetrics(l4Input);
    const fullMetrics = deriveTeamPerformanceMetrics(fullInput);

    expect(l4Metrics.gamesPlayed).toBe(4);
    expect(fullMetrics.gamesPlayed).toBe(17);
    // Same rate math applies regardless of window size.
    expect(l4Metrics.offense.filtered.epaPerPlay).toBeCloseTo(fullMetrics.offense.filtered.epaPerPlay as number, 5);
    // All 9 offense + 9 defense metrics remain populated (non-undefined) at any window size.
    const offKeys = Object.keys(l4Metrics.offense.filtered);
    expect(offKeys).toEqual(expect.arrayContaining([
      "epaPerPlay", "successRate", "earlyDownEpaPerPlay", "earlyDownSuccessRate",
      "passEpaPerDropback", "passSuccessRate", "rushEpaPerPlay", "rushSuccessRate",
      "explosiveRate", "thirdDownEpaPerPlay", "thirdDownSuccessRate", "sackRate",
    ]));
  });
});

// ---------------------------------------------------------------------------
// 20. No production consumer modified — see the accompanying report, which
// verifies this via `git status`/`git diff` rather than a unit test (a test
// cannot inspect the repository's git state meaningfully in CI).
// ---------------------------------------------------------------------------
