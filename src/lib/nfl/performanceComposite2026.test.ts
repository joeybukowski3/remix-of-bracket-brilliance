import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_OVERALL_WEIGHTS,
  PERFORMANCE_PUBLIC_SCALE,
  PERFORMANCE_SCALE_DIVISORS,
  buildPerformanceRatingBoard,
} from "@/lib/nfl/performanceComposite2026";
import { deriveTeamPerformanceMetrics } from "@/lib/nfl/performanceMetricsCore2026";
import {
  BASE_RATES,
  NEUTRAL_QUALITY,
  entriesFromGames,
  roundRobin,
  rowOf,
  sums,
  windowInputFrom,
  type GameSpec,
  type Quality,
  type Rates,
} from "@/lib/nfl/performanceLeagueFixtures";

/**
 * Model C composite, nfl-current-ovr-v1.1.0: 40% OFF / 20% DEF / 40% PD, leave-one-out opponent adjustment.
 * (Leave-one-out behaviour itself is proven in performanceCompositeLeaveOneOut2026.test.ts.)
 *
 * Leagues here are 6-team round robins built from internally consistent games, with small deliberate
 * variation in every metric so no league-wide standard deviation is (numerically) zero.
 */

const TEAMS = ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"];
const r = (epaPlay: number, sr: number, explosiveRate: number): Rates => ({ epaPlay, sr, explosiveRate });
const q = (off: Rates, def: Rates, pd = 0): Quality => ({ off, def, pd });

/** Deterministic small variation per team so every league-wide SD is comfortably non-zero. */
function jitter(i: number): Quality {
  return q(r(0.004 * ((i * 3) % 6), 0.01 * ((i * 5) % 4), 0.01 * ((i * 7) % 3)), r(0.003 * ((i * 5) % 6), 0.01 * ((i * 3) % 4), 0.01 * ((i * 2) % 3)), ((i * 4) % 7) - 3);
}
function league(overrides: Record<string, Partial<Quality>> = {}): Record<string, Quality> {
  return Object.fromEntries(TEAMS.map((t, i) => [t, { ...jitter(i), ...(overrides[t] ?? {}) }]));
}
const boardFor = (quality: Record<string, Quality>) => buildPerformanceRatingBoard(entriesFromGames(roundRobin(TEAMS, quality)));

// ---------------------------------------------------------------------------
describe("OFF / DEF composite weighting (unchanged in v1.1.0)", () => {
  it("1. OFF weights EPA, SR and Explosive Rate equally (1/3 each)", () => {
    const board = boardFor(league({ AAA: { off: r(0.25, 0.05, 0.03) } }));
    for (const row of board.rows) {
      const { epaPerPlayZ, successRateZ, explosiveRateZ, composite } = row.offense;
      expect(composite as number).toBeCloseTo(((epaPerPlayZ as number) + (successRateZ as number) + (explosiveRateZ as number)) / 3, 10);
    }
  });

  it("2. DEF weights EPA-allowed, SR-allowed and Explosive-allowed equally, inverted (1/3 each)", () => {
    const board = boardFor(league({ AAA: { def: r(-0.2, -0.05, -0.03) } }));
    for (const row of board.rows) {
      const { epaPerPlayAllowedZ, successRateAllowedZ, explosiveRateAllowedZ, composite } = row.defense;
      expect(composite as number).toBeCloseTo((-((epaPerPlayAllowedZ as number) + (successRateAllowedZ as number) + (explosiveRateAllowedZ as number))) / 3, 10);
    }
  });

  it("3. allowing LESS EPA/SR/Explosive produces a HIGHER defense composite and rating", () => {
    const board = boardFor(league({ AAA: { def: r(-0.2, -0.1, -0.04) }, BBB: { def: r(0.2, 0.1, 0.04) } }));
    const stingy = rowOf(board, "AAA");
    const leaky = rowOf(board, "BBB");
    expect(stingy.defense.compositeZ as number).toBeGreaterThan(leaky.defense.compositeZ as number);
    expect(stingy.defensePerformanceRating as number).toBeGreaterThan(leaky.defensePerformanceRating as number);
  });
});

describe("ranking direction", () => {
  const quality = Object.fromEntries(
    TEAMS.map((t, i) => [t, q(r(0.3 - i * 0.1, 0.06 - i * 0.02, 0.03 - i * 0.01), r(-0.15 + i * 0.05, -0.03 + i * 0.01, -0.02 + i * 0.008), 8 - i * 3)])
  );
  const board = boardFor(quality);

  it("4. better OFF composite -> lower-numbered offense rank", () => {
    const best = rowOf(board, "AAA");
    const worst = rowOf(board, "FFF");
    expect(best.offense.compositeZ as number).toBeGreaterThan(worst.offense.compositeZ as number);
    expect(best.offensePerformanceRank as number).toBeLessThan(worst.offensePerformanceRank as number);
  });

  it("5. better DEF composite -> lower-numbered defense rank", () => {
    const best = rowOf(board, "AAA");
    const worst = rowOf(board, "FFF");
    expect(best.defense.compositeZ as number).toBeGreaterThan(worst.defense.compositeZ as number);
    expect(best.defensePerformanceRank as number).toBeLessThan(worst.defensePerformanceRank as number);
  });

  it("17. rank ordering exactly matches rating ordering", () => {
    const byRating = [...board.rows].sort((a, b) => (b.performanceRating ?? 0) - (a.performanceRating ?? 0));
    const byRank = [...board.rows].sort((a, b) => (a.performanceRank ?? 0) - (b.performanceRank ?? 0));
    expect(byRating.map((row) => row.team)).toEqual(byRank.map((row) => row.team));
  });
});

// ---------------------------------------------------------------------------
describe("overall composite: 40% OFF / 20% DEF / 40% PD", () => {
  it("6a. the committed weights are exactly 0.4 / 0.2 / 0.4 (was 0.4 / 0.4 / 0.2)", () => {
    expect(PERFORMANCE_OVERALL_WEIGHTS).toEqual({ offense: 0.4, defense: 0.2, pointDifferential: 0.4 });
    expect(PERFORMANCE_OVERALL_WEIGHTS.offense + PERFORMANCE_OVERALL_WEIGHTS.defense + PERFORMANCE_OVERALL_WEIGHTS.pointDifferential).toBeCloseTo(1, 12);
  });

  it("6b. overallComposite = 0.4*offZ + 0.2*defZ + 0.4*pointDiffZ on every row", () => {
    const board = boardFor(league({ AAA: { off: r(0.2, 0.05, 0.02), pd: 9 }, BBB: { def: r(-0.15, -0.04, -0.02) } }));
    for (const row of board.rows) {
      const expected = 0.4 * (row.offense.compositeZ as number) + 0.2 * (row.defense.compositeZ as number) + 0.4 * (row.pointDifferential.z as number);
      expect(row.overallComposite as number).toBeCloseTo(expected, 10);
    }
  });

  it("6c. the composite is NOT the retired 40/40/20 weighting (defence is down-weighted, point differential up)", () => {
    const board = boardFor(league({ AAA: { off: r(0.2, 0.05, 0.02), pd: 9 }, BBB: { def: r(0.2, 0.06, 0.03), pd: -9 } }));
    let maxGap = 0;
    for (const row of board.rows) {
      const off = row.offense.compositeZ as number;
      const def = row.defense.compositeZ as number;
      const pd = row.pointDifferential.z as number;
      expect(row.overallComposite as number).toBeCloseTo(0.4 * off + 0.2 * def + 0.4 * pd, 12);
      maxGap = Math.max(maxGap, Math.abs((row.overallComposite as number) - (0.4 * off + 0.4 * def + 0.2 * pd)));
    }
    expect(maxGap).toBeGreaterThan(0.05);
  });

  it("6d. a shift in point differential moves the overall composite exactly 0.4 x its own z shift (ratings via the refit divisor)", () => {
    const base = boardFor(league());
    const shifted = boardFor(league({ AAA: { pd: jitter(0).pd + 6 } }));
    const dOverall = (rowOf(shifted, "AAA").overallComposite as number) - (rowOf(base, "AAA").overallComposite as number);
    const dPdZ = (rowOf(shifted, "AAA").pointDifferential.z as number) - (rowOf(base, "AAA").pointDifferential.z as number);
    // OFF/DEF are untouched by margins (margins are not play data), so the whole move comes through the 0.4 PD weight.
    expect(dOverall / dPdZ).toBeCloseTo(0.4, 9);
    const dRating = (rowOf(shifted, "AAA").performanceRating as number) - (rowOf(base, "AAA").performanceRating as number);
    expect(dRating).toBeCloseTo((15 * dOverall) / PERFORMANCE_SCALE_DIVISORS.overall, 9);
  });

  it("7. point differential is a separate term, never folded into OFF or DEF", () => {
    const base = boardFor(league());
    const shifted = boardFor(league({ AAA: { pd: jitter(0).pd + 8 } }));
    const a0 = rowOf(base, "AAA");
    const a1 = rowOf(shifted, "AAA");
    expect(a1.offense.compositeZ).toBeCloseTo(a0.offense.compositeZ as number, 9);
    expect(a1.defense.compositeZ).toBeCloseTo(a0.defense.compositeZ as number, 9);
    expect(a1.performanceRating as number).toBeGreaterThan(a0.performanceRating as number);
  });
});

// ---------------------------------------------------------------------------
describe("display-only metrics", () => {
  it("8. Points/Drive never moves any rating", () => {
    const quality = league();
    const games = roundRobin(TEAMS, quality);
    const low = games.map((g) => ({ ...g, aPointsPerDrive: 1.0 }));
    const high = games.map((g) => ({ ...g, aPointsPerDrive: 4.5 }));
    const lowEntries = entriesFromGames(low);
    const highEntries = entriesFromGames(high);
    expect(lowEntries[0].metrics.pointsPerDriveOff).not.toBeCloseTo(highEntries[0].metrics.pointsPerDriveOff as number, 1);
    const lowBoard = buildPerformanceRatingBoard(lowEntries);
    const highBoard = buildPerformanceRatingBoard(highEntries);
    for (const team of TEAMS) {
      expect(rowOf(lowBoard, team).performanceRating).toBeCloseTo(rowOf(highBoard, team).performanceRating as number, 9);
    }
  });

  it("9. Success Rate is the traditional down-and-distance definition, not EPA>0", () => {
    const evidence = entriesFromGames([{ a: "A", b: "B", aOff: r(0.05, 0.55, 0.08), bOff: r(0, 0.4, 0.08), aMargin: 3 }])[0];
    const input = windowInputFrom("A", evidence.games);
    input.offense.filtered.epaPosNum = 90;
    input.offense.filtered.epaPosDen = 100;
    const metrics = deriveTeamPerformanceMetrics(input);
    expect(metrics.offense.filtered.successRate).toBeCloseTo(0.55, 5);
    expect(metrics.offense.filtered.epaPositiveRate).toBeCloseTo(0.9, 5);
  });
});

// ---------------------------------------------------------------------------
describe("garbage-time filter treatment (unchanged): EPA & SR filtered, Explosive unfiltered", () => {
  // Two teams, one game each: leave-one-out has no other evidence, so adjusted == raw and the
  // adjusted value reveals exactly which bundle the engine read.
  const game: GameSpec = {
    a: "A",
    b: "B",
    aOff: r(-0.1, 0.3, 0.02),
    aOffAll: r(0.5, 0.6, 0.15),
    bOff: r(0, 0.4, 0.08),
    aMargin: 3,
  };
  const board = buildPerformanceRatingBoard(entriesFromGames([game]));
  const a = rowOf(board, "A");

  it("10. EPA/Play uses the garbage-time-FILTERED bundle", () => expect(a.offense.epaPerPlayAdjusted).toBeCloseTo(-0.1, 9));
  it("11. Success Rate uses the garbage-time-FILTERED bundle", () => expect(a.offense.successRateAdjusted).toBeCloseTo(0.3, 9));
  it("12. Explosive Rate uses the UNFILTERED bundle", () => expect(a.offense.explosiveRateAdjusted).toBeCloseTo(0.15, 9));
});

// ---------------------------------------------------------------------------
describe("1-99 public scale", () => {
  it("14. a symmetric league averages exactly 50 (no clamping)", () => {
    const board = boardFor(league());
    const ratings = board.rows.map((row) => row.performanceRating as number);
    expect(ratings.every((v) => v > 1 && v < 99)).toBe(true);
    expect(ratings.reduce((s, v) => s + v, 0) / ratings.length).toBeCloseTo(50, 9);
  });

  it("15. the OFF and DEF divisors are unchanged and the OVERALL divisor is the committed v1.1.0 refit", () => {
    expect(PERFORMANCE_SCALE_DIVISORS.offense).toBe(0.9248507883569935);
    expect(PERFORMANCE_SCALE_DIVISORS.defense).toBe(0.8648390483639914);
    expect(PERFORMANCE_SCALE_DIVISORS.overall).toBe(0.8015993487311668);
    expect(PERFORMANCE_PUBLIC_SCALE).toEqual({ center: 50, standardDeviation: 15, minimum: 1, maximum: 99 });
  });

  it("16. every divisor is in a sane neighbourhood of the proven v0.3.1 pooled divisor (0.733)", () => {
    for (const divisor of Object.values(PERFORMANCE_SCALE_DIVISORS)) {
      expect(divisor).toBeGreaterThan(0.5);
      expect(divisor).toBeLessThan(1.2);
    }
  });

  it("clamps only at the true [1, 99] extremes for pathological inputs", () => {
    const board = boardFor(league({ AAA: { off: r(3, 0.5, 0.8), pd: 60 } }));
    for (const row of board.rows) {
      expect(row.performanceRating as number).toBeGreaterThanOrEqual(1);
      expect(row.performanceRating as number).toBeLessThanOrEqual(99);
    }
  });
});

// ---------------------------------------------------------------------------
describe("structure and integrity", () => {
  it("13b. only a full-season board builder exists (no L4/L8 opponent-adjusted variant)", () => {
    expect(typeof buildPerformanceRatingBoard).toBe("function");
    expect((buildPerformanceRatingBoard as unknown as Record<string, unknown>).length).toBe(1);
  });

  it("19. deriveTeamPerformanceMetrics is window-size agnostic", () => {
    const [entry] = entriesFromGames([{ a: "A", b: "B", aOff: r(0.1, 0.45, 0.09), bOff: r(0, 0.4, 0.08), aMargin: 3 }]);
    const l4 = windowInputFrom("A", entry.games);
    l4.gamesPlayed = 4;
    const full = windowInputFrom("A", entry.games);
    full.gamesPlayed = 17;
    expect(deriveTeamPerformanceMetrics(l4).offense.filtered.epaPerPlay).toBeCloseTo(deriveTeamPerformanceMetrics(full).offense.filtered.epaPerPlay as number, 9);
    expect(Object.keys(deriveTeamPerformanceMetrics(l4).offense.filtered)).toEqual(
      expect.arrayContaining(["epaPerPlay", "successRate", "explosiveRate", "sackRate", "passEpaPerDropback"])
    );
  });

  it("refuses to build when the per-game evidence does not match the season metrics' game count", () => {
    const [first, ...rest] = entriesFromGames(roundRobin(TEAMS, league()));
    const broken = { ...first, games: first.games.slice(1) };
    expect(() => buildPerformanceRatingBoard([broken, ...rest])).toThrow(/game\(s\) of evidence but metrics\.gamesPlayed/);
  });

  it("exposes the opponent-adjustment method the board was built with", () => {
    expect(buildPerformanceRatingBoard(entriesFromGames(roundRobin(TEAMS, league()))).opponentAdjustment).toBe("leave-one-out-v1");
  });

  it("uses only the shared fixtures' neutral quality as a no-op reference", () => {
    // sanity: an all-neutral league is well-formed input (ratings may be degenerate, but building must not throw)
    const neutral = Object.fromEntries(TEAMS.map((t) => [t, NEUTRAL_QUALITY]));
    expect(() => buildPerformanceRatingBoard(entriesFromGames(roundRobin(TEAMS, neutral, BASE_RATES)))).not.toThrow();
    expect(sums(BASE_RATES).offPlays).toBe(100);
  });
});
