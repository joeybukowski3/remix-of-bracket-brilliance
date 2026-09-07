import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { WeeklyRankingRow } from "@/lib/fantasy/weeklyRankings";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import type { MarketArtifact, MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection, ProjectionsArtifact } from "@/lib/nfl/projectionData";
import type { CanonicalNflTeam, NflGameRecord } from "@/lib/nfl/standings";
import type { TeamTotalProjection, TeamTotalsArtifact } from "@/lib/nfl/totalsProjectionData";
import { buildWeeklyDashboard } from "@/lib/nfl/weeklyDashboard";

function team(abbr: string, name: string): CanonicalNflTeam {
  return {
    id: `nfl-${abbr}`,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    abbr,
    nflverseAbbr: abbr.toUpperCase(),
    name,
    fullName: name,
    shortName: name.split(" ").at(-1)!,
    conference: "AFC",
    division: "AFC Test",
    primaryColor: "#123456",
    logoUrl: `/logos/${abbr}.png`,
    isDome: false,
    latitude: 0,
    longitude: 0,
  };
}

function game(
  gameId: string,
  awayAbbr: string,
  homeAbbr: string,
  dateUtc: string | null,
  overrides: Partial<NflGameRecord> = {},
): NflGameRecord {
  return {
    gameId,
    season: 2026,
    week: 1,
    seasonType: "REG",
    dateUtc,
    homeTeam: homeAbbr,
    awayTeam: awayAbbr,
    homeAbbr,
    awayAbbr,
    status: "scheduled",
    stadium: "Test Field",
    neutralSite: false,
    ...overrides,
  };
}

function rating(abbr: string, rank: number, value = 70 - rank): CurrentRatingRow {
  return {
    abbr,
    team: abbr.toUpperCase(),
    division: "AFC Test",
    rating: value,
    rank,
    offenseRating: value - 1,
    offenseRank: rank,
    defenseRating: value - 2,
    defenseRank: rank,
    performanceRating: null,
    performanceRank: null,
    gamesPlayed: 0,
    preseasonWeight: 1,
    performanceWeight: 0,
    state: "preseason",
    preseasonV04Rating: value,
    preseasonOffenseRating: value - 1,
    preseasonDefenseRating: value - 2,
  };
}

function market(gameId: string, awayAbbr: string, homeAbbr: string, homeSpread: number | null, total: number | null = 44.5): MarketCurrentGame {
  return {
    gameId,
    season: 2026,
    week: 1,
    seasonType: "REG",
    homeAbbr,
    awayAbbr,
    neutralSite: false,
    spread: { home: homeSpread, away: homeSpread == null ? null : -homeSpread },
    moneyline: { home: null, away: null },
    total,
    rawSpreadLine: homeSpread == null ? null : Math.abs(homeSpread),
  };
}

function projection(gameId: string, awayAbbr: string, homeAbbr: string, projectedHomeMargin: number): GameProjection {
  return {
    gameId,
    week: 1,
    kickoff: null,
    homeTeam: homeAbbr,
    awayTeam: awayAbbr,
    homeCurrentOVR: 60,
    awayCurrentOVR: 55,
    leagueAverageOVR: 50,
    homePowerNumber: 2,
    awayPowerNumber: 1,
    neutralSite: false,
    homeFieldAdvantage: 2,
    neutralProjectedMargin: projectedHomeMargin - 2,
    projectedHomeMargin,
    formattedJkbSpread:
      projectedHomeMargin === 0
        ? "PK"
        : `${projectedHomeMargin > 0 ? homeAbbr : awayAbbr} −${Math.abs(projectedHomeMargin).toFixed(1)}`.toUpperCase(),
  };
}

function marketArtifact(rows: MarketCurrentGame[]): MarketArtifact {
  return { currentMarket: Object.fromEntries(rows.map((row) => [row.gameId, row])) } as MarketArtifact;
}

function projectionsArtifact(rows: GameProjection[]): ProjectionsArtifact {
  return { projections: Object.fromEntries(rows.map((row) => [row.gameId, row])) } as ProjectionsArtifact;
}

function totalProjection(gameId: string, awayAbbr: string, homeAbbr: string, projectedGameTotal: number): TeamTotalProjection {
  return {
    gameId,
    season: 2026,
    week: 1,
    kickoffUtc: "2026-09-10T17:00:00Z",
    homeTeam: homeAbbr,
    awayTeam: awayAbbr,
    homeExpectedPoints: projectedGameTotal / 2,
    awayExpectedPoints: projectedGameTotal / 2,
    projectedGameTotal,
    modelVersion: "jkb-nfl-total-ridge-v1.0.0",
    predictionTimestamp: "2026-09-04T17:58:46.030Z",
    status: "projected",
  };
}

function totalsArtifact(rows: TeamTotalProjection[]): TeamTotalsArtifact {
  return { projections: Object.fromEntries(rows.map((row) => [row.gameId, row])) } as TeamTotalsArtifact;
}

function fantasyRow(position: FantasyPosition, rank: number, player: string, ppg: number): WeeklyRankingRow {
  return {
    key: `${position}-${rank}`,
    rank,
    player,
    position,
    teamAbbr: "aaa",
    projectedPpg: ppg,
    opponent: null,
    opponentLabel: "—",
    fpa: null,
    grade: null,
    stats: [],
  };
}

const TEAMS = [team("aaa", "Alpha Aces"), team("bbb", "Beta Bears"), team("ccc", "City Cats")];
const RATINGS = [rating("aaa", 1), rating("bbb", 2), rating("ccc", 3)];

describe("buildWeeklyDashboard game assembly", () => {
  it("filters the selected week, covers the full canonical Week 1 slate, and orders chronologically", () => {
    const realGames = JSON.parse(readFileSync(join(process.cwd(), "public/data/nfl/2026/games.json"), "utf8")).games as NflGameRecord[];
    const realTeams = JSON.parse(readFileSync(join(process.cwd(), "public/data/nfl/teams.json"), "utf8")).teams as CanonicalNflTeam[];
    const result = buildWeeklyDashboard({ season: 2026, week: 1, games: realGames, teams: realTeams });
    expect(result.games).toHaveLength(16);
    expect(result.games.every((row) => row.week === 1)).toBe(true);
    expect(result.games.map((row) => Date.parse(row.kickoffUtc!))).toEqual(
      [...result.games].map((row) => Date.parse(row.kickoffUtc!)).sort((a, b) => a - b),
    );
  });

  it("uses gameId as a deterministic tie-break and puts invalid/TBD kickoffs last", () => {
    const games = [
      game("z", "aaa", "bbb", "2026-09-10T17:00:00Z"),
      game("a", "bbb", "ccc", "2026-09-10T17:00:00Z"),
      game("bad", "aaa", "ccc", "not-a-date"),
      game("tbd", "ccc", "bbb", null),
    ];
    const result = buildWeeklyDashboard({ season: 2026, week: 1, games, teams: TEAMS });
    expect(result.games.map((row) => row.gameId)).toEqual(["a", "z", "bad", "tbd"]);
  });

  it("deduplicates game IDs, skips unresolved teams, and reports malformed rows", () => {
    const games = [
      game("one", "aaa", "bbb", null),
      game("one", "bbb", "aaa", null),
      game("unknown", "xxx", "bbb", null),
      game("", "aaa", "bbb", null),
    ];
    const result = buildWeeklyDashboard({ season: 2026, week: 1, games, teams: TEAMS });
    expect(result.games.map((row) => row.gameId)).toEqual(["one"]);
    expect(result.diagnostics.duplicateGameIds).toEqual(["one"]);
    expect(result.diagnostics.unresolvedTeamGameIds).toEqual(["unknown"]);
    expect(result.diagnostics.malformedGameCount).toBe(1);
  });

  it("builds neutral-site matchup links with canonical team slugs", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game("neutral", "aaa", "bbb", null, { neutralSite: true })],
      teams: TEAMS,
    });
    expect(result.games[0].neutralSite).toBe(true);
    expect(result.games[0].matchupHref).toBe("/nfl/matchups/alpha-aces-vs-beta-bears");
  });
});

describe("buildWeeklyDashboard Model vs Market", () => {
  const games = [
    game("home-fav", "aaa", "bbb", "2026-09-10T17:00:00Z"),
    game("away-fav", "bbb", "ccc", "2026-09-11T17:00:00Z"),
    game("pickem", "ccc", "aaa", "2026-09-12T17:00:00Z"),
  ];
  const markets = marketArtifact([
    market("home-fav", "aaa", "bbb", -3),
    market("away-fav", "bbb", "ccc", 3),
    market("pickem", "ccc", "aaa", 0),
  ]);

  it("preserves canonical home-favorite, away-favorite, pick'em and exact-agreement orientation", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games,
      teams: TEAMS,
      marketArtifact: markets,
      projectionsArtifact: projectionsArtifact([
        projection("home-fav", "aaa", "bbb", 5),
        projection("away-fav", "bbb", "ccc", -5),
        projection("pickem", "ccc", "aaa", 0),
      ]),
    });
    const byId = new Map(result.games.map((row) => [row.gameId, row]));
    expect(byId.get("home-fav")).toMatchObject({ formattedComparison: "BBB +2.0", absoluteModelMarketGap: 2 });
    expect(byId.get("away-fav")).toMatchObject({ formattedComparison: "BBB +2.0", absoluteModelMarketGap: 2 });
    expect(byId.get("pickem")).toMatchObject({ formattedComparison: "Even", modelLeanTeam: null, absoluteModelMarketGap: 0 });
  });

  it("sorts finite absolute gaps descending with a deterministic tie-break", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games,
      teams: TEAMS,
      marketArtifact: markets,
      projectionsArtifact: projectionsArtifact([
        projection("home-fav", "aaa", "bbb", 5),
        projection("away-fav", "bbb", "ccc", -5),
        projection("pickem", "ccc", "aaa", 0),
      ]),
    });
    expect(result.largestModelMarketGaps.map((row) => row.gameId)).toEqual(["away-fav", "home-fav", "pickem"]);
  });

  it("degrades independently when market, projection, ratings, or totals are missing", () => {
    const result = buildWeeklyDashboard({ season: 2026, week: 1, games: [games[0]], teams: TEAMS });
    expect(result.games[0]).toMatchObject({
      market: null,
      projection: null,
      comparison: null,
      absoluteModelMarketGap: null,
      total: null,
    });
    expect(result.games[0].away.rating).toBeNull();
    expect(result.diagnostics.missingMarketGameIds).toEqual(["home-fav"]);
    expect(result.diagnostics.missingProjectionGameIds).toEqual(["home-fav"]);
    expect(result.diagnostics.missingRatingTeamAbbrs).toEqual(["aaa", "bbb"]);
    expect(result.diagnostics.missingTotalsGameIds).toEqual(["home-fav"]);
  });

  it("does not fabricate projected-total or over/under fields", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [games[0]],
      teams: TEAMS,
      marketArtifact: markets,
    });
    expect(result.games[0].market?.total).toBe(44.5);
    expect(result.games[0]).not.toHaveProperty("projectedTotal");
    expect(result.games[0]).not.toHaveProperty("totalAdvantage");
    expect(result.games[0]).not.toHaveProperty("overUnderLean");
  });

  it("selects the highest canonical market total with a deterministic gameId tie-break", () => {
    const tiedGames = [
      game("z-total", "aaa", "bbb", "2026-09-10T17:00:00Z"),
      game("a-total", "bbb", "ccc", "2026-09-11T17:00:00Z"),
      game("lower-total", "ccc", "aaa", "2026-09-12T17:00:00Z"),
    ];
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: tiedGames,
      teams: TEAMS,
      marketArtifact: marketArtifact([
        market("z-total", "aaa", "bbb", -3, 47.5),
        market("a-total", "bbb", "ccc", -2, 47.5),
        market("lower-total", "ccc", "aaa", -1, 44),
      ]),
    });
    expect(result.highlights.highestMarketTotal?.gameId).toBe("a-total");
  });

  it("exposes an unavailable highest-total state when no market total exists", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game("one", "aaa", "bbb", null)],
      teams: TEAMS,
      marketArtifact: marketArtifact([market("one", "aaa", "bbb", -3, null)]),
    });
    expect(result.highlights.highestMarketTotal).toBeNull();
  });
});

describe("buildWeeklyDashboard JKB Total vs Market", () => {
  const game1 = game("total-game", "aaa", "bbb", "2026-09-10T17:00:00Z");

  it("computes Strong Lean Over: JKB 51.2 vs market 48.5 => Strong Lean Over +2.7", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game1],
      teams: TEAMS,
      marketArtifact: marketArtifact([market("total-game", "aaa", "bbb", -3, 48.5)]),
      totalsArtifact: totalsArtifact([totalProjection("total-game", "aaa", "bbb", 51.2)]),
    });
    const total = result.games[0].total!;
    expect(total.jkbTotal).toBeCloseTo(51.2, 10);
    expect(total.vegasTotal).toBe(48.5);
    expect(total.difference).toBeCloseTo(2.7, 10);
    expect(total.indicator).toBe("STRONG_OVER");
  });

  it("computes Strong Lean Under: JKB 45.9 vs market 48.5 => Strong Lean Under -2.6", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game1],
      teams: TEAMS,
      marketArtifact: marketArtifact([market("total-game", "aaa", "bbb", -3, 48.5)]),
      totalsArtifact: totalsArtifact([totalProjection("total-game", "aaa", "bbb", 45.9)]),
    });
    const total = result.games[0].total!;
    expect(total.difference).toBeCloseTo(-2.6, 10);
    expect(total.indicator).toBe("STRONG_UNDER");
  });

  it("classifies boundary magnitudes correctly: +0.9 slight, +1.0 moderate, +2.5 moderate, +2.6 strong (and negative equivalents)", () => {
    const cases: Array<[number, string]> = [
      [48.5 + 0.9, "SLIGHT_OVER"],
      [48.5 + 1.0, "MODERATE_OVER"],
      [48.5 + 2.5, "MODERATE_OVER"],
      [48.5 + 2.6, "STRONG_OVER"],
      [48.5 - 0.9, "SLIGHT_UNDER"],
      [48.5 - 1.0, "MODERATE_UNDER"],
      [48.5 - 2.5, "MODERATE_UNDER"],
      [48.5 - 2.6, "STRONG_UNDER"],
    ];
    for (const [jkbTotal, expected] of cases) {
      const result = buildWeeklyDashboard({
        season: 2026,
        week: 1,
        games: [game1],
        teams: TEAMS,
        marketArtifact: marketArtifact([market("total-game", "aaa", "bbb", -3, 48.5)]),
        totalsArtifact: totalsArtifact([totalProjection("total-game", "aaa", "bbb", jkbTotal)]),
      });
      expect(result.games[0].total!.indicator).toBe(expected);
    }
  });

  it("computes EVEN: JKB 48.5 vs market 48.5 => EVEN", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game1],
      teams: TEAMS,
      marketArtifact: marketArtifact([market("total-game", "aaa", "bbb", -3, 48.5)]),
      totalsArtifact: totalsArtifact([totalProjection("total-game", "aaa", "bbb", 48.5)]),
    });
    const total = result.games[0].total!;
    expect(total.difference).toBeCloseTo(0, 10);
    expect(total.indicator).toBe("EVEN");
  });

  it("shows the JKB total with vegasTotal/difference/indicator N/A when the market total is missing, without hiding it", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game1],
      teams: TEAMS,
      marketArtifact: marketArtifact([market("total-game", "aaa", "bbb", -3, null)]),
      totalsArtifact: totalsArtifact([totalProjection("total-game", "aaa", "bbb", 48.5)]),
    });
    const total = result.games[0].total!;
    expect(total.jkbTotal).toBeCloseTo(48.5, 10);
    expect(total.vegasTotal).toBeNull();
    expect(total.difference).toBeNull();
    expect(total.indicator).toBeNull();
  });

  it("is null (not fabricated) when there is no JKB total projection", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game1],
      teams: TEAMS,
      marketArtifact: marketArtifact([market("total-game", "aaa", "bbb", -3, 48.5)]),
    });
    expect(result.games[0].total).toBeNull();
    expect(result.diagnostics.missingTotalsGameIds).toEqual(["total-game"]);
  });
});

describe("buildWeeklyDashboard fantasy and ratings", () => {
  it("preserves canonical order, keeps deterministic ties, slices Top 5, and exposes QB/RB/WR/TE only", () => {
    const rows = [
      fantasyRow("QB", 1, "First", 20),
      fantasyRow("QB", 2, "Second", 20),
      fantasyRow("QB", 3, "Third", 19),
      fantasyRow("QB", 4, "Fourth", 18),
      fantasyRow("QB", 5, "Fifth", 17),
      fantasyRow("QB", 6, "Sixth", 16),
    ];
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game("one", "aaa", "bbb", null)],
      teams: TEAMS,
      currentRatings: RATINGS,
      fantasyRows: {
        QB: rows,
        RB: [fantasyRow("RB", 1, "Runner", 18)],
        WR: [fantasyRow("WR", 1, "Receiver", 17)],
        TE: [fantasyRow("TE", 1, "Tight End", 15)],
      },
    });
    expect(Object.keys(result.fantasyLeaders)).toEqual(["QB", "RB", "WR", "TE"]);
    expect(result.fantasyLeaders.QB.map((row) => row.player)).toEqual(["First", "Second", "Third", "Fourth", "Fifth"]);
    expect(result.fantasyLeaders).not.toHaveProperty("K");
    expect(result.fantasyLeaders).not.toHaveProperty("DST");
    expect(result.powerWatch.map((row) => row.abbr)).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("computes ppgPercentile against the full position population, not just the Top 5 slice", () => {
    // 10 rows: the Top 5 slice alone would make row #5 look like the worst of
    // its (tiny) sample. Against the full 10-row population it should read as
    // solidly above the middle, and the #1 row should read as elite (>=95).
    const rows = Array.from({ length: 10 }, (_, i) =>
      fantasyRow("QB", i + 1, `Player ${i + 1}`, 30 - i),
    );
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game("one", "aaa", "bbb", null)],
      teams: TEAMS,
      fantasyRows: { QB: rows },
    });
    const [first, , , , fifth] = result.fantasyLeaders.QB;
    expect(first.ppgPercentile).toBe(100);
    expect(fifth.ppgPercentile).toBeGreaterThan(50);
    expect(fifth.ppgPercentile).toBeLessThan(first.ppgPercentile!);
  });

  it("keeps QB and TE percentiles independent even when their PPG scales differ", () => {
    // TE's best value (14) is far below QB's worst value (17) in raw PPG, but
    // each position's top row must still read as the top of ITS OWN population.
    const qbRows = [
      fantasyRow("QB", 1, "QB One", 25),
      fantasyRow("QB", 2, "QB Two", 20),
      fantasyRow("QB", 3, "QB Three", 17),
    ];
    const teRows = [
      fantasyRow("TE", 1, "TE One", 14),
      fantasyRow("TE", 2, "TE Two", 9),
      fantasyRow("TE", 3, "TE Three", 6),
    ];
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game("one", "aaa", "bbb", null)],
      teams: TEAMS,
      fantasyRows: { QB: qbRows, TE: teRows },
    });
    expect(result.fantasyLeaders.QB[0].ppgPercentile).toBe(100);
    expect(result.fantasyLeaders.TE[0].ppgPercentile).toBe(100);
  });

  it("derives Power Watch Top 5 and Bottom 5 from the same canonical OVR ordering with correct ordering", () => {
    const teams = Array.from({ length: 8 }, (_, i) => team(`t${i}`, `Team ${i}`));
    const ratings = teams.map((t, i) => rating(t.abbr, i + 1));
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game("one", "t0", "t1", null)],
      teams,
      currentRatings: ratings,
    });
    expect(result.powerWatch.map((t) => t.abbr)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(result.powerWatchBottom.map((t) => t.abbr)).toEqual(["t3", "t4", "t5", "t6", "t7"]);
    expect(result.powerWatchBottom.map((t) => t.rating?.ovrRank)).toEqual([4, 5, 6, 7, 8]);
  });

  it("returns an empty Power Watch Bottom 5 rather than overlapping Top 5 for small rated populations", () => {
    const result = buildWeeklyDashboard({
      season: 2026,
      week: 1,
      games: [game("one", "aaa", "bbb", null)],
      teams: TEAMS,
      currentRatings: RATINGS,
    });
    expect(result.powerWatch.map((t) => t.abbr)).toEqual(["aaa", "bbb", "ccc"]);
    expect(result.powerWatchBottom).toEqual([]);
  });
});
