import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { WeeklyRankingRow } from "@/lib/fantasy/weeklyRankings";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import type { CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import type { MarketArtifact, MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection, ProjectionsArtifact } from "@/lib/nfl/projectionData";
import type { CanonicalNflTeam, NflGameRecord } from "@/lib/nfl/standings";
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

  it("degrades independently when market, projection, or ratings are missing", () => {
    const result = buildWeeklyDashboard({ season: 2026, week: 1, games: [games[0]], teams: TEAMS });
    expect(result.games[0]).toMatchObject({ market: null, projection: null, comparison: null, absoluteModelMarketGap: null });
    expect(result.games[0].away.rating).toBeNull();
    expect(result.diagnostics.missingMarketGameIds).toEqual(["home-fav"]);
    expect(result.diagnostics.missingProjectionGameIds).toEqual(["home-fav"]);
    expect(result.diagnostics.missingRatingTeamAbbrs).toEqual(["aaa", "bbb"]);
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
});
