import { describe, expect, it } from "vitest";
import { buildPerformanceRatingBoard, type TeamPerformanceSeasonEntry } from "@/lib/nfl/performanceComposite2026";
import { NFL_OPPONENT_ADJUSTMENT_METHOD } from "@/lib/nfl/currentOvrModelVersion";
import { entriesFromGames, rowOf, sums, type GameSpec, type Rates } from "@/lib/nfl/performanceLeagueFixtures";

/**
 * nfl-current-ovr-v1.1.0 leave-one-out (LOO) opponent adjustment.
 *
 * The rule under test: when Team A's game against Team B is adjusted, the comparison value used for
 * Team B must be computed from B's OTHER games. The game being evaluated must not partially grade itself.
 */

const r = (epaPlay: number, sr: number, explosiveRate: number): Rates => ({ epaPlay, sr, explosiveRate });
const mean = (values: readonly number[]) => values.reduce((s, v) => s + v, 0) / values.length;

// ---------------------------------------------------------------------------
// Independent brute-force expectation, written straight from the game list (NOT from the library's
// totals-and-subtract approach): for each game, literally re-aggregate the opponent's other games.
// ---------------------------------------------------------------------------
type Metric = "oEpa" | "oSr" | "oEx" | "dEpa" | "dSr" | "dEx" | "pd";
const METRICS: readonly Metric[] = ["oEpa", "oSr", "oEx", "dEpa", "dSr", "dEx", "pd"];
type Side = { own: Rates; ownAll: Rates; opp: Rates; oppAll: Rates; margin: number; opponent: string };

function sidesByTeam(games: readonly GameSpec[]): Map<string, Side[]> {
  const out = new Map<string, Side[]>();
  const add = (team: string, side: Side) => out.set(team, [...(out.get(team) ?? []), side]);
  for (const g of games) {
    add(g.a, { own: g.aOff, ownAll: g.aOffAll ?? g.aOff, opp: g.bOff, oppAll: g.bOffAll ?? g.bOff, margin: g.aMargin, opponent: g.b });
    add(g.b, { own: g.bOff, ownAll: g.bOffAll ?? g.bOff, opp: g.aOff, oppAll: g.aOffAll ?? g.aOff, margin: -g.aMargin, opponent: g.a });
  }
  return out;
}

/** Rate of one metric over a list of (filtered, unfiltered) rate buckets, computed the way the engine's rate math does. */
function rate(kind: "epa" | "sr" | "ex", buckets: readonly { filtered: Rates; all: Rates }[]): number {
  const pairs = buckets.map((b) => {
    const f = sums(b.filtered);
    const a = sums(b.all);
    if (kind === "epa") return [f.offEpa, f.offPlays];
    if (kind === "sr") return [f.successNum, f.successDen];
    return [a.explosivePass + a.explosiveRush, a.offPlays];
  });
  return pairs.reduce((s, p) => s + p[0], 0) / pairs.reduce((s, p) => s + p[1], 0);
}

function expectedAdjusted(games: readonly GameSpec[], present: ReadonlySet<string>): Map<string, Record<Metric, number>> {
  const sides = sidesByTeam(games);
  const teams = [...present];
  const own = (s: Side) => ({ filtered: s.own, all: s.ownAll });
  const allowed = (s: Side) => ({ filtered: s.opp, all: s.oppAll });
  const kinds: Record<Exclude<Metric, "pd">, ["epa" | "sr" | "ex", "own" | "allowed"]> = {
    oEpa: ["epa", "own"], oSr: ["sr", "own"], oEx: ["ex", "own"], dEpa: ["epa", "allowed"], dSr: ["sr", "allowed"], dEx: ["ex", "allowed"],
  };
  const value = (team: string, metric: Exclude<Metric, "pd">, use: readonly Side[] = sides.get(team) ?? []) => {
    const [kind, which] = kinds[metric];
    return rate(kind, use.map(which === "own" ? own : allowed));
  };
  const rawPd = (team: string) => mean((sides.get(team) ?? []).map((s) => s.margin));
  const comparisonOf = (metric: Metric): Metric => ({ oEpa: "dEpa", oSr: "dSr", oEx: "dEx", dEpa: "oEpa", dSr: "oSr", dEx: "oEx", pd: "pd" } as const)[metric];

  const raw = (team: string, metric: Metric) => (metric === "pd" ? rawPd(team) : value(team, metric));
  const result = new Map<string, Record<Metric, number>>();
  for (const team of teams) result.set(team, {} as Record<Metric, number>);
  for (const metric of METRICS) {
    const cmp = comparisonOf(metric);
    const leagueMean = mean(teams.map((t) => raw(t, cmp)));
    for (const team of teams) {
      const comps = (sides.get(team) ?? []).map((game, index) => {
        const opponent = game.opponent;
        if (!present.has(opponent)) return leagueMean; // no evidence for an absent opponent => no adjustment
        // Literally the opponent's games EXCLUDING the one against this team: drop exactly the matching side by index.
        const theirs = (sides.get(opponent) ?? []).slice();
        // The k-th game between the two teams (rematches pair up in game order) is the one being evaluated.
        const k = countBefore(sides.get(team)!, index, opponent);
        let seen = -1;
        const matchIndex = theirs.findIndex((s) => s.opponent === team && ++seen === k);
        const others = theirs.filter((_, i) => i !== matchIndex);
        if (others.length === 0) return leagueMean; // opponent has no other games => no adjustment
        return metric === "pd" ? mean(others.map((s) => s.margin)) : value(opponent, cmp as Exclude<Metric, "pd">, others);
      });
      result.get(team)![metric] = raw(team, metric) - (mean(comps) - leagueMean);
    }
  }
  return result;
}

/** How many of `list`'s entries before position `index` are against `opponent` (pairs rematches up in order). */
function countBefore(list: readonly Side[], index: number, opponent: string): number {
  return list.slice(0, index).filter((s) => s.opponent === opponent).length;
}

function boardValues(board: ReturnType<typeof buildPerformanceRatingBoard>, team: string): Record<Metric, number | null> {
  const row = rowOf(board, team);
  return {
    oEpa: row.offense.epaPerPlayAdjusted, oSr: row.offense.successRateAdjusted, oEx: row.offense.explosiveRateAdjusted,
    dEpa: row.defense.epaPerPlayAllowedAdjusted, dSr: row.defense.successRateAllowedAdjusted, dEx: row.defense.explosiveRateAllowedAdjusted,
    pd: row.pointDifferential.adjusted,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Eight teams, four disjoint one-game pairs: exactly the league shape after NFL Week 1. */
const WEEK1_GAMES: GameSpec[] = [
  { a: "T1", b: "T2", aOff: r(0.31, 0.52, 0.12), bOff: r(-0.12, 0.38, 0.06), aMargin: 14 },
  { a: "T3", b: "T4", aOff: r(0.05, 0.44, 0.1), bOff: r(0.18, 0.48, 0.13), aMargin: -6 },
  { a: "T5", b: "T6", aOff: r(-0.2, 0.36, 0.05), bOff: r(0.02, 0.41, 0.08), aMargin: -3 },
  { a: "T7", b: "T8", aOff: r(0.11, 0.46, 0.09), bOff: r(0.09, 0.45, 0.11), aMargin: 1 },
];
const WEEK1_TEAMS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];

/** The RETIRED pre-v1.1.0 formula, reproduced here only to demonstrate the bug it had (season-to-date opponent aggregate INCLUDING the game). */
function legacyOnePassOffenseEpa(entries: readonly TeamPerformanceSeasonEntry[]): Map<string, number> {
  const byTeam = new Map(entries.map((e) => [e.team, e]));
  const comparison = (e: TeamPerformanceSeasonEntry) => e.metrics.defenseAllowed.filtered.epaPerPlay as number;
  const leagueMean = mean(entries.map(comparison));
  return new Map(
    entries.map((e) => {
      const opponentMean = mean(e.games.map((g) => comparison(byTeam.get(g.opponent)!)));
      return [e.team, (e.metrics.offense.filtered.epaPerPlay as number) - (opponentMean - leagueMean)];
    })
  );
}

// ---------------------------------------------------------------------------
describe("Week 1 / one-game samples: leave-one-out is exactly no opponent adjustment", () => {
  const entries = entriesFromGames(WEEK1_GAMES);
  const board = buildPerformanceRatingBoard(entries);

  it("every adjusted metric equals its raw value (nothing is subtracted from itself)", () => {
    for (const entry of entries) {
      const adjusted = boardValues(board, entry.team);
      const m = entry.metrics;
      expect(adjusted.oEpa).toBeCloseTo(m.offense.filtered.epaPerPlay as number, 12);
      expect(adjusted.oSr).toBeCloseTo(m.offense.filtered.successRate as number, 12);
      expect(adjusted.oEx).toBeCloseTo(m.offense.all.explosiveRate as number, 12);
      expect(adjusted.dEpa).toBeCloseTo(m.defenseAllowed.filtered.epaPerPlay as number, 12);
      expect(adjusted.dSr).toBeCloseTo(m.defenseAllowed.filtered.successRate as number, 12);
      expect(adjusted.dEx).toBeCloseTo(m.defenseAllowed.all.explosiveRate as number, 12);
      expect(adjusted.pd).toBeCloseTo(entry.games[0].margin, 12);
    }
  });

  it("REGRESSION: the retired one-pass formula collapsed every team to the league mean after Week 1", () => {
    const legacy = legacyOnePassOffenseEpa(entries);
    const leagueMean = mean(entries.map((e) => e.metrics.defenseAllowed.filtered.epaPerPlay as number));
    // Each team's opponent's "defense allowed" IS that team's own offense, so old adjusted == league mean for everyone.
    for (const value of legacy.values()) expect(value).toBeCloseTo(leagueMean, 12);
    const legacySpread = Math.max(...legacy.values()) - Math.min(...legacy.values());
    expect(legacySpread).toBeLessThan(1e-12);
  });

  it("REGRESSION FIXED: the same league keeps its real spread and rank order under leave-one-out", () => {
    const adjusted = entries.map((e) => rowOf(board, e.team).offense.epaPerPlayAdjusted as number);
    expect(Math.max(...adjusted) - Math.min(...adjusted)).toBeGreaterThan(0.3); // raw EPA range is 0.51
    const rawOrder = [...entries].sort((a, b) => (b.metrics.offense.filtered.epaPerPlay as number) - (a.metrics.offense.filtered.epaPerPlay as number)).map((e) => e.team);
    const adjustedOrder = [...WEEK1_TEAMS].sort((a, b) => (rowOf(board, b).offense.epaPerPlayAdjusted as number) - (rowOf(board, a).offense.epaPerPlayAdjusted as number));
    expect(adjustedOrder).toEqual(rawOrder);
  });

  it("REGRESSION FIXED: Week 1 ratings are not degenerate (all eight teams get distinct OFF, DEF and overall ratings)", () => {
    for (const pick of ["offensePerformanceRating", "defensePerformanceRating", "performanceRating"] as const) {
      const values = board.rows.map((row) => Number((row[pick] as number).toFixed(6)));
      expect(new Set(values).size).toBe(8);
    }
  });

  it("no team is pinned at the 1 or 99 clamp by a single blowout's filtered sample", () => {
    for (const row of board.rows) {
      expect(row.performanceRating as number).toBeGreaterThan(1);
      expect(row.performanceRating as number).toBeLessThan(99);
    }
  });
});

// ---------------------------------------------------------------------------
describe("multi-game leagues: matches an independent brute-force leave-one-out", () => {
  /**
   * Irregular on purpose: unequal games played (A: 4 incl. a rematch, C: 3, B/D/E: 2-3, F: ONE game),
   * so some opponents have plenty of other evidence, some have exactly one other game, one has none.
   */
  const GAMES: GameSpec[] = [
    { a: "A", b: "B", aOff: r(0.22, 0.5, 0.12), bOff: r(0.03, 0.42, 0.07), aMargin: 9 },
    { a: "B", b: "C", aOff: r(-0.05, 0.4, 0.06), bOff: r(0.14, 0.47, 0.1), aMargin: -4 },
    { a: "C", b: "D", aOff: r(0.08, 0.45, 0.09), bOff: r(0.01, 0.41, 0.08), aMargin: 6 },
    { a: "D", b: "E", aOff: r(-0.15, 0.37, 0.05), bOff: r(0.19, 0.49, 0.13), aMargin: -11 },
    { a: "E", b: "A", aOff: r(0.06, 0.43, 0.09), bOff: r(0.1, 0.46, 0.1), aMargin: -2 },
    { a: "A", b: "C", aOff: r(0.17, 0.48, 0.11), bOff: r(0.04, 0.41, 0.08), aMargin: 5 },
    { a: "A", b: "B", aOff: r(0.12, 0.47, 0.1), bOff: r(0.09, 0.44, 0.09), aMargin: 1 }, // rematch
    { a: "F", b: "A", aOff: r(-0.09, 0.39, 0.06), bOff: r(0.2, 0.5, 0.12), aMargin: -13 }, // F has exactly one game
  ];
  const TEAMS = ["A", "B", "C", "D", "E", "F"];

  it("all seven adjusted quantities match for every team", () => {
    const board = buildPerformanceRatingBoard(entriesFromGames(GAMES));
    const expected = expectedAdjusted(GAMES, new Set(TEAMS));
    for (const team of TEAMS) {
      const actual = boardValues(board, team);
      for (const metric of METRICS) expect(actual[metric] as number, `${team} ${metric}`).toBeCloseTo(expected.get(team)![metric], 10);
    }
  });

  it("an opponent with no other games contributes NO adjustment (F's only game vs A, seen from A's side)", () => {
    const entries = entriesFromGames(GAMES);
    const a = entries.find((e) => e.team === "A")!;
    // Build the same league but WITHOUT the F game: A's other four games' comparisons are unchanged, so the
    // only difference for A is one game moving from "no adjustment" to absent. Assert via the brute force.
    const expected = expectedAdjusted(GAMES, new Set(TEAMS)).get("A")!;
    const board = buildPerformanceRatingBoard(entries);
    expect(boardValues(board, "A").oEpa as number).toBeCloseTo(expected.oEpa, 10);
    expect(a.games).toHaveLength(5);
  });

  it("is deterministic: game order and home/away labelling do not change any adjusted value", () => {
    const flipped = [...GAMES].reverse().map((g): GameSpec => ({ a: g.b, b: g.a, aOff: g.bOff, bOff: g.aOff, aOffAll: g.bOffAll, bOffAll: g.aOffAll, aMargin: -g.aMargin }));
    const base = buildPerformanceRatingBoard(entriesFromGames(GAMES));
    const swapped = buildPerformanceRatingBoard(entriesFromGames(flipped));
    for (const team of TEAMS) {
      const x = boardValues(base, team);
      const y = boardValues(swapped, team);
      for (const metric of METRICS) expect(y[metric] as number).toBeCloseTo(x[metric] as number, 10);
    }
  });

  it("neutral-site games need no special handling: evidence carries no venue, so a neutral game equals any other game", () => {
    // TeamPerformanceGameEvidence deliberately has no home/away/neutral field; assert the type stays venue-free.
    const evidenceKeys = Object.keys(entriesFromGames(GAMES)[0].games[0]).sort();
    expect(evidenceKeys).toEqual(["defenseAllowed", "margin", "offense", "opponent"]);
  });
});

// ---------------------------------------------------------------------------
describe("missing and null data", () => {
  const GAMES: GameSpec[] = [
    { a: "A", b: "B", aOff: r(0.2, 0.5, 0.12), bOff: r(0.03, 0.42, 0.07), aMargin: 9 },
    { a: "B", b: "C", aOff: r(-0.05, 0.4, 0.06), bOff: r(0.14, 0.47, 0.1), aMargin: -4 },
    { a: "C", b: "A", aOff: r(0.08, 0.45, 0.09), bOff: r(0.01, 0.41, 0.08), aMargin: 6 },
    { a: "A", b: "D", aOff: r(0.13, 0.46, 0.1), bOff: r(-0.1, 0.38, 0.06), aMargin: 8 },
    { a: "B", b: "D", aOff: r(0.04, 0.43, 0.08), bOff: r(0.0, 0.4, 0.07), aMargin: 2 },
    { a: "C", b: "D", aOff: r(0.1, 0.46, 0.1), bOff: r(0.06, 0.44, 0.09), aMargin: 3 },
  ];

  it("an opponent absent from the board contributes no adjustment (it is not silently dropped from the mean)", () => {
    const entries = entriesFromGames(GAMES).filter((e) => e.team !== "D"); // D played A, B and C but has no entry
    const board = buildPerformanceRatingBoard(entries);
    const expected = expectedAdjusted(GAMES, new Set(["A", "B", "C"]));
    for (const team of ["A", "B", "C"]) {
      const actual = boardValues(board, team);
      for (const metric of METRICS) expect(actual[metric] as number, `${team} ${metric}`).toBeCloseTo(expected.get(team)![metric], 10);
    }
  });

  it("a team with an unavailable raw metric gets null adjusted/composite/rating without disturbing other teams", () => {
    const entries = entriesFromGames(GAMES);
    const broken = entries.map((e) =>
      e.team === "B"
        ? { ...e, metrics: { ...e.metrics, offense: { ...e.metrics.offense, filtered: { ...e.metrics.offense.filtered, epaPerPlay: null } } } }
        : e
    );
    const board = buildPerformanceRatingBoard(broken);
    const b = rowOf(board, "B");
    expect(b.offense.epaPerPlayAdjusted).toBeNull();
    expect(b.offense.compositeZ).toBeNull();
    expect(b.performanceRating).toBeNull();
    expect(rowOf(board, "A").performanceRating).not.toBeNull();
    expect(rowOf(board, "C").performanceRating).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("current garbage-time filtering rules are preserved inside the adjustment", () => {
  const base: GameSpec[] = [
    { a: "A", b: "B", aOff: r(0.2, 0.5, 0.12), bOff: r(0.03, 0.42, 0.07), aMargin: 9 },
    { a: "B", b: "C", aOff: r(-0.05, 0.4, 0.06), bOff: r(0.14, 0.47, 0.1), aMargin: -4 },
    { a: "C", b: "A", aOff: r(0.08, 0.45, 0.09), bOff: r(0.01, 0.41, 0.08), aMargin: 6 },
    { a: "A", b: "B", aOff: r(0.1, 0.46, 0.1), bOff: r(0.06, 0.44, 0.09), aMargin: 2 },
  ];
  const adjustedAll = (games: GameSpec[]) => {
    const board = buildPerformanceRatingBoard(entriesFromGames(games));
    return ["A", "B", "C"].map((t) => boardValues(board, t));
  };

  it("changing ONLY unfiltered EPA/SR (which the composite ignores) changes no adjusted EPA or SR", () => {
    const perturbed = base.map((g) => ({ ...g, aOffAll: r(g.aOff.epaPlay + 0.4, g.aOff.sr + 0.2, g.aOff.explosiveRate), bOffAll: r(g.bOff.epaPlay - 0.3, g.bOff.sr - 0.15, g.bOff.explosiveRate) }));
    const before = adjustedAll(base);
    const after = adjustedAll(perturbed);
    before.forEach((values, i) => {
      for (const metric of ["oEpa", "oSr", "dEpa", "dSr"] as const) expect(after[i][metric] as number).toBeCloseTo(values[metric] as number, 12);
    });
  });

  it("changing ONLY filtered explosive rate (which the composite ignores) changes no adjusted explosive value", () => {
    const perturbed = base.map((g) => ({ ...g, aOffAll: g.aOff, bOffAll: g.bOff, aOff: { ...g.aOff, explosiveRate: g.aOff.explosiveRate + 0.05 }, bOff: { ...g.bOff, explosiveRate: g.bOff.explosiveRate + 0.05 } }));
    const before = adjustedAll(base);
    const after = adjustedAll(perturbed);
    before.forEach((values, i) => {
      for (const metric of ["oEx", "dEx"] as const) expect(after[i][metric] as number).toBeCloseTo(values[metric] as number, 12);
    });
  });
});

describe("integrity", () => {
  it("is labelled leave-one-out-v1", () => expect(NFL_OPPONENT_ADJUSTMENT_METHOD).toBe("leave-one-out-v1"));
});
