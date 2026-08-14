import { describe, it, expect } from "vitest";
import {
  buildOpponentRankSummaries,
  emptyOpponentRankSummary,
  opponentRankSummary,
  opponentsFaced,
} from "@/lib/nfl/opponentRankSummary";
import type { HeroModelRating, HeroModelRatingResolver } from "@/lib/nfl/heroModelRatings";
import type { NflResultRecord } from "@/lib/nfl/standings";

const SEASON = 2026;

/** Minimal completed regular-season result; override only what a test cares about. */
function makeResult(overrides: Partial<NflResultRecord>): NflResultRecord {
  return {
    gameId: "g1",
    season: SEASON,
    week: 1,
    seasonType: "REG",
    homeAbbr: "HOME",
    awayAbbr: "AWAY",
    homeScore: 24,
    awayScore: 17,
    winner: "HOME",
    final: true,
    ...overrides,
  };
}

/** Rating with all three ranks set to the same value, for single-axis tests. */
function flatRating(rank: number): HeroModelRating {
  return {
    rating: 50,
    rank,
    offenseRating: 50,
    offenseRank: rank,
    defenseRating: 50,
    defenseRank: rank,
  };
}

/** Resolver over an abbr -> rating map; unknown teams resolve to null, never a default. */
function resolverFor(ranks: Record<string, HeroModelRating>): HeroModelRatingResolver {
  return (teamAbbr: string) => ranks[teamAbbr] ?? null;
}

// ── Weighted averaging ─────────────────────────────────────────────────────────

describe("opponent rank averaging", () => {
  it("averages opponent ranks weighted by games played", () => {
    // Mirrors MLB case 22: two games vs one opponent, one vs another.
    const resolve = resolverFor({ OPPA: flatRating(8), OPPB: flatRating(20) });
    const results = [
      makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA" }),
      makeResult({ gameId: "g2", week: 2, homeAbbr: "OPPA", awayAbbr: "TEAM" }),
      makeResult({ gameId: "g3", week: 3, homeAbbr: "TEAM", awayAbbr: "OPPB" }),
    ];

    const summary = opponentRankSummary(results, SEASON, "TEAM", resolve);

    // (8 + 8 + 20) / 3 = 12.0 — not (8 + 20) / 2 = 14.0
    expect(summary.avgOpponentPowerRank).toBeCloseTo(12.0, 1);
    expect(summary.gamesPlayed).toBe(3);
    expect(summary.ratedGames).toBe(3);
  });

  it("averages power, offense and defense ranks independently", () => {
    const resolve = resolverFor({
      OPPA: { rating: 60, rank: 4, offenseRating: 60, offenseRank: 2, defenseRating: 55, defenseRank: 30 },
      OPPB: { rating: 40, rank: 28, offenseRating: 45, offenseRank: 20, defenseRating: 48, defenseRank: 10 },
    });
    const results = [
      makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA" }),
      makeResult({ gameId: "g2", week: 2, homeAbbr: "TEAM", awayAbbr: "OPPB" }),
    ];

    const summary = opponentRankSummary(results, SEASON, "TEAM", resolve);

    expect(summary.avgOpponentPowerRank).toBeCloseTo(16.0, 1); // (4 + 28) / 2
    expect(summary.avgOpponentOffenseRank).toBeCloseTo(11.0, 1); // (2 + 20) / 2
    expect(summary.avgOpponentDefenseRank).toBeCloseTo(20.0, 1); // (30 + 10) / 2
  });

  it("counts the opponent whether the team was home or away", () => {
    const resolve = resolverFor({ OPPA: flatRating(10) });
    const results = [
      makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA" }),
      makeResult({ gameId: "g2", week: 2, homeAbbr: "OPPA", awayAbbr: "TEAM" }),
    ];

    expect(opponentsFaced(results, SEASON, "TEAM")).toEqual(["OPPA", "OPPA"]);
  });
});

// ── Repeated opponents ─────────────────────────────────────────────────────────

describe("repeated opponent handling", () => {
  it("counts a division rival played twice as two games, not one", () => {
    // Mirrors MLB case 15: every game vs one opponent, so the average is that
    // opponent's rank exactly — proving repeats are not deduplicated.
    const resolve = resolverFor({ RIVAL: flatRating(6) });
    const results = Array.from({ length: 2 }, (_, index) =>
      makeResult({
        gameId: `g${index + 1}`,
        week: index + 1,
        homeAbbr: index === 0 ? "TEAM" : "RIVAL",
        awayAbbr: index === 0 ? "RIVAL" : "TEAM",
      })
    );

    const summary = opponentRankSummary(results, SEASON, "TEAM", resolve);

    expect(summary.gamesPlayed).toBe(2);
    expect(summary.avgOpponentPowerRank).toBe(6);
  });

  it("a repeated tough opponent pulls the average further than a single meeting", () => {
    const resolve = resolverFor({ TOUGH: flatRating(2), SOFT: flatRating(30) });
    const once = [
      makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "TOUGH" }),
      makeResult({ gameId: "g2", week: 2, homeAbbr: "TEAM", awayAbbr: "SOFT" }),
    ];
    const twice = [
      ...once,
      makeResult({ gameId: "g3", week: 3, homeAbbr: "TOUGH", awayAbbr: "TEAM" }),
    ];

    const onceSummary = opponentRankSummary(once, SEASON, "TEAM", resolve);
    const twiceSummary = opponentRankSummary(twice, SEASON, "TEAM", resolve);

    expect(onceSummary.avgOpponentPowerRank).toBeCloseTo(16.0, 1); // (2 + 30) / 2
    // Lower rank = tougher schedule, so the second meeting must lower the mean.
    expect(twiceSummary.avgOpponentPowerRank).toBeCloseTo(11.3, 1); // (2 + 30 + 2) / 3
    expect(twiceSummary.avgOpponentPowerRank!).toBeLessThan(onceSummary.avgOpponentPowerRank!);
  });
});

// ── No games played ────────────────────────────────────────────────────────────

describe("no games played", () => {
  it("returns null for all three figures pre-Week 1, never 0", () => {
    const resolve = resolverFor({ OPPA: flatRating(10) });

    const summary = opponentRankSummary([], SEASON, "TEAM", resolve);

    expect(summary.gamesPlayed).toBe(0);
    expect(summary.avgOpponentPowerRank).toBeNull();
    expect(summary.avgOpponentOffenseRank).toBeNull();
    expect(summary.avgOpponentDefenseRank).toBeNull();
    expect(summary).toEqual(emptyOpponentRankSummary("TEAM"));
  });

  it("returns nulls when the team's only games are scheduled but not final", () => {
    const resolve = resolverFor({ OPPA: flatRating(10) });
    const results = [
      makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA", final: false }),
    ];

    const summary = opponentRankSummary(results, SEASON, "TEAM", resolve);

    expect(summary.gamesPlayed).toBe(0);
    expect(summary.avgOpponentPowerRank).toBeNull();
  });

  it("returns nulls for a null or undefined results source", () => {
    const resolve = resolverFor({});

    expect(opponentRankSummary(null, SEASON, "TEAM", resolve).avgOpponentPowerRank).toBeNull();
    expect(opponentRankSummary(undefined, SEASON, "TEAM", resolve).avgOpponentPowerRank).toBeNull();
  });
});

// ── Sample boundaries ──────────────────────────────────────────────────────────

describe("which games count", () => {
  it("excludes postseason games", () => {
    const resolve = resolverFor({ OPPA: flatRating(10), OPPB: flatRating(30) });
    const results = [
      makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA" }),
      makeResult({ gameId: "g2", week: 19, seasonType: "WC", homeAbbr: "TEAM", awayAbbr: "OPPB" }),
    ];

    const summary = opponentRankSummary(results, SEASON, "TEAM", resolve);

    expect(summary.gamesPlayed).toBe(1);
    expect(summary.avgOpponentPowerRank).toBe(10);
  });

  it("excludes results from another season", () => {
    const resolve = resolverFor({ OPPA: flatRating(10), OPPB: flatRating(30) });
    const results = [
      makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA" }),
      makeResult({ gameId: "g2", week: 1, season: 2025, homeAbbr: "TEAM", awayAbbr: "OPPB" }),
    ];

    const summary = opponentRankSummary(results, SEASON, "TEAM", resolve);

    expect(summary.gamesPlayed).toBe(1);
    expect(summary.avgOpponentPowerRank).toBe(10);
  });

  it("grows as each week's results land", () => {
    const resolve = resolverFor({ OPPA: flatRating(4), OPPB: flatRating(16) });
    const afterWeek1 = [makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA" })];
    const afterWeek2 = [
      ...afterWeek1,
      makeResult({ gameId: "g2", week: 2, homeAbbr: "TEAM", awayAbbr: "OPPB" }),
    ];

    expect(opponentRankSummary(afterWeek1, SEASON, "TEAM", resolve).gamesPlayed).toBe(1);
    expect(opponentRankSummary(afterWeek1, SEASON, "TEAM", resolve).avgOpponentPowerRank).toBe(4);
    expect(opponentRankSummary(afterWeek2, SEASON, "TEAM", resolve).gamesPlayed).toBe(2);
    expect(opponentRankSummary(afterWeek2, SEASON, "TEAM", resolve).avgOpponentPowerRank).toBe(10);
  });
});

// ── Unrated opponents ──────────────────────────────────────────────────────────

describe("unresolvable opponent ratings", () => {
  it("excludes an unrated opponent instead of substituting a league-average rank", () => {
    const resolve = resolverFor({ OPPA: flatRating(8) });
    const results = [
      makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA" }),
      makeResult({ gameId: "g2", week: 2, homeAbbr: "TEAM", awayAbbr: "UNKNOWN" }),
    ];

    const summary = opponentRankSummary(results, SEASON, "TEAM", resolve);

    expect(summary.gamesPlayed).toBe(2);
    expect(summary.ratedGames).toBe(1);
    // 8, not (8 + 16.5) / 2 — no placeholder opponent is invented.
    expect(summary.avgOpponentPowerRank).toBe(8);
  });

  it("returns nulls when no opponent can be rated at all", () => {
    const resolve = resolverFor({});
    const results = [makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAM", awayAbbr: "OPPA" })];

    const summary = opponentRankSummary(results, SEASON, "TEAM", resolve);

    expect(summary.gamesPlayed).toBe(1);
    expect(summary.ratedGames).toBe(0);
    expect(summary.avgOpponentPowerRank).toBeNull();
    expect(summary.avgOpponentOffenseRank).toBeNull();
    expect(summary.avgOpponentDefenseRank).toBeNull();
  });
});

// ── League-wide build ──────────────────────────────────────────────────────────

describe("buildOpponentRankSummaries", () => {
  it("summarises every team appearing in the season's completed results", () => {
    const resolve = resolverFor({
      TEAMA: flatRating(1),
      TEAMB: flatRating(31),
    });
    const results = [makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAMA", awayAbbr: "TEAMB" })];

    const summaries = buildOpponentRankSummaries(results, SEASON, resolve);

    expect([...summaries.keys()].sort()).toEqual(["TEAMA", "TEAMB"]);
    expect(summaries.get("TEAMA")!.avgOpponentPowerRank).toBe(31);
    expect(summaries.get("TEAMB")!.avgOpponentPowerRank).toBe(1);
  });

  it("includes a requested team that has not played with a zero-game summary", () => {
    const resolve = resolverFor({ TEAMA: flatRating(1), TEAMB: flatRating(31) });
    const results = [makeResult({ gameId: "g1", week: 1, homeAbbr: "TEAMA", awayAbbr: "TEAMB" })];

    const summaries = buildOpponentRankSummaries(results, SEASON, resolve, ["TEAMC"]);

    expect(summaries.get("TEAMC")).toEqual(emptyOpponentRankSummary("TEAMC"));
  });

  it("returns a complete zero-game board before Week 1", () => {
    const resolve = resolverFor({});

    const summaries = buildOpponentRankSummaries([], SEASON, resolve, ["TEAMA", "TEAMB"]);

    expect(summaries.size).toBe(2);
    for (const summary of summaries.values()) {
      expect(summary.gamesPlayed).toBe(0);
      expect(summary.avgOpponentPowerRank).toBeNull();
    }
  });
});
