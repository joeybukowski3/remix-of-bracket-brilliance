import { describe, expect, it } from "vitest";
import type { CurrentRatingBoard, CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import {
  buildSosBoard,
  computeSosMetric,
  futureSosFor,
  opponentAbbrsFromCompletedGames,
  opponentAbbrsFromRemainingGames,
  sosToDateFor,
} from "@/lib/nfl/sosMetrics2026";
import type { NflGameRecord, NflResultRecord } from "@/lib/nfl/standings";

const SEASON = 2026;

function row(abbr: string, rating: number): CurrentRatingRow {
  return {
    abbr,
    team: abbr,
    division: "AFC East",
    rating,
    rank: 1,
    evidenceWeight: 0,
    performanceDelta: null,
    gamesPlayed: 0,
    preseasonV04Rating: rating,
    preseasonV03Rating: rating,
    currentV03Rating: null,
    state: "preseason",
  };
}

function board(rows: CurrentRatingRow[]): CurrentRatingBoard {
  return { season: SEASON, state: "preseason", teams: rows };
}

function result(overrides: Partial<NflResultRecord> = {}): NflResultRecord {
  return {
    gameId: "g1",
    season: SEASON,
    week: 1,
    seasonType: "REG",
    homeAbbr: "buf",
    awayAbbr: "mia",
    homeScore: 24,
    awayScore: 17,
    winner: "buf",
    final: true,
    ...overrides,
  };
}

function game(overrides: Partial<NflGameRecord> = {}): NflGameRecord {
  return {
    gameId: "g1",
    season: SEASON,
    week: 1,
    seasonType: "REG",
    dateUtc: "2026-09-10T00:00:00.000Z",
    homeTeam: "Buffalo Bills",
    awayTeam: "Miami Dolphins",
    homeAbbr: "buf",
    awayAbbr: "mia",
    status: "scheduled",
    stadium: null,
    ...overrides,
  };
}

describe("opponentAbbrsFromCompletedGames", () => {
  it("returns [] with zero completed games", () => {
    expect(opponentAbbrsFromCompletedGames([], SEASON, "buf")).toEqual([]);
    expect(opponentAbbrsFromCompletedGames(null, SEASON, "buf")).toEqual([]);
  });

  it("excludes postseason results", () => {
    const results = [result({ gameId: "sb", seasonType: "SB", homeAbbr: "buf", awayAbbr: "sf" })];
    expect(opponentAbbrsFromCompletedGames(results, SEASON, "buf")).toEqual([]);
  });

  it("excludes non-final results", () => {
    const results = [result({ final: false })];
    expect(opponentAbbrsFromCompletedGames(results, SEASON, "buf")).toEqual([]);
  });

  it("counts each doubleheader game against the same opponent separately", () => {
    const results = [
      result({ gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia" }),
      result({ gameId: "g14", week: 14, homeAbbr: "mia", awayAbbr: "buf" }),
    ];
    expect(opponentAbbrsFromCompletedGames(results, SEASON, "buf")).toEqual(["mia", "mia"]);
  });
});

describe("opponentAbbrsFromRemainingGames", () => {
  it("excludes games already completed (per results.json final presence)", () => {
    const games = [game({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    const results = [result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    expect(opponentAbbrsFromRemainingGames(games, results, SEASON, "buf")).toEqual([]);
  });

  it("excludes postseason games", () => {
    const games = [game({ gameId: "sb", seasonType: "SB", homeAbbr: "buf", awayAbbr: "sf" })];
    expect(opponentAbbrsFromRemainingGames(games, [], SEASON, "buf")).toEqual([]);
  });

  it("counts each doubleheader game separately and leaves completed games out", () => {
    const games = [
      game({ gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia" }),
      game({ gameId: "g14", week: 14, homeAbbr: "mia", awayAbbr: "buf" }),
    ];
    const results = [result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    expect(opponentAbbrsFromRemainingGames(games, results, SEASON, "buf")).toEqual(["mia"]);
  });

  it("[] once the season is fully complete", () => {
    const games = [game({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    const results = [result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    expect(opponentAbbrsFromRemainingGames(games, results, SEASON, "buf")).toEqual([]);
  });
});

describe("computeSosMetric", () => {
  it("N/A for an empty opponent list", () => {
    expect(computeSosMetric([], board([row("mia", 50)]))).toBeNull();
  });

  it("computes the correct mean over resolvable opponents", () => {
    const b = board([row("mia", 40), row("nyj", 60)]);
    const metric = computeSosMetric(["mia", "nyj"], b);
    expect(metric).toEqual({ value: 50, sampleSize: 2, missingOpponents: 0 });
  });

  it("excludes an opponent missing from the current-rating board rather than zero-filling", () => {
    const b = board([row("mia", 40)]);
    const metric = computeSosMetric(["mia", "zzz"], b);
    expect(metric).toEqual({ value: 40, sampleSize: 1, missingOpponents: 1 });
  });

  it("returns N/A (not zero) when every opponent in the sample is unresolvable", () => {
    const b = board([row("mia", 40)]);
    const metric = computeSosMetric(["zzz", "yyy"], b);
    expect(metric).toBeNull();
  });

  it("weights doubleheader repeats as separate samples in the mean", () => {
    const b = board([row("mia", 40), row("nyj", 100)]);
    const metric = computeSosMetric(["mia", "mia", "nyj"], b);
    expect(metric?.value).toBeCloseTo((40 + 40 + 100) / 3, 5);
    expect(metric?.sampleSize).toBe(3);
  });
});

describe("sosToDateFor / futureSosFor", () => {
  it("SOS To Date is N/A with zero completed games", () => {
    expect(sosToDateFor([], SEASON, "buf", board([]))).toBeNull();
  });

  it("SOS To Date mean is correct midseason", () => {
    const results = [
      result({ gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia" }),
      result({ gameId: "g2", week: 2, homeAbbr: "nyj", awayAbbr: "buf" }),
    ];
    const b = board([row("mia", 40), row("nyj", 60)]);
    expect(sosToDateFor(results, SEASON, "buf", b)).toEqual({ value: 50, sampleSize: 2, missingOpponents: 0 });
  });

  it("Future SOS mean is correct and excludes completed games", () => {
    const games = [
      game({ gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia" }),
      game({ gameId: "g2", week: 2, homeAbbr: "nyj", awayAbbr: "buf" }),
      game({ gameId: "g3", week: 3, homeAbbr: "buf", awayAbbr: "ne" }),
    ];
    const results = [result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    const b = board([row("mia", 40), row("nyj", 60), row("ne", 80)]);
    const metric = futureSosFor(games, results, SEASON, "buf", b);
    expect(metric).toEqual({ value: 70, sampleSize: 2, missingOpponents: 0 });
  });

  it("Future SOS is N/A once the season is fully complete", () => {
    const games = [game({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    const results = [result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    expect(futureSosFor(games, results, SEASON, "buf", board([row("mia", 40)]))).toBeNull();
  });

  it("bye-week teams (no game a given week) still compute correctly from their actual games", () => {
    // BUF has no week-2 game; only weeks 1 and 3 involve BUF.
    const games = [
      game({ gameId: "g1", week: 1, homeAbbr: "buf", awayAbbr: "mia" }),
      game({ gameId: "gX", week: 2, homeAbbr: "sf", awayAbbr: "lar" }),
      game({ gameId: "g3", week: 3, homeAbbr: "buf", awayAbbr: "ne" }),
    ];
    const b = board([row("mia", 40), row("ne", 80)]);
    const metric = futureSosFor(games, [], SEASON, "buf", b);
    expect(metric).toEqual({ value: 60, sampleSize: 2, missingOpponents: 0 });
  });

  it("current-rating changes alone move SOS values with no schedule-data change", () => {
    const results = [result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    const before = sosToDateFor(results, SEASON, "buf", board([row("mia", 40)]));
    const after = sosToDateFor(results, SEASON, "buf", board([row("mia", 70)]));
    expect(before?.value).toBe(40);
    expect(after?.value).toBe(70);
  });
});

describe("buildSosBoard", () => {
  it("ranks #1 as the hardest schedule (highest mean opponent OVR)", () => {
    const results = [
      result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" }),
      result({ gameId: "g2", homeAbbr: "ne", awayAbbr: "nyj" }),
    ];
    const b = board([row("mia", 90), row("nyj", 10), row("buf", 50), row("ne", 50)]);
    const sos = buildSosBoard(["buf", "ne"], [], results, SEASON, b);
    expect(sos.get("buf")!.sosToDateRank).toBe(1);
    expect(sos.get("ne")!.sosToDateRank).toBe(2);
  });

  it("teams with N/A SOS receive no rank (null, never a fabricated 32)", () => {
    const results = [result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    const b = board([row("mia", 50), row("buf", 50), row("ne", 50)]);
    const sos = buildSosBoard(["buf", "ne"], [], results, SEASON, b);
    expect(sos.get("buf")!.sosToDateRank).toBe(1);
    expect(sos.get("ne")!.sosToDate).toBeNull();
    expect(sos.get("ne")!.sosToDateRank).toBeNull();
  });

  it("ranks futureSos independently of sosToDate", () => {
    const games = [game({ gameId: "g2", week: 5, homeAbbr: "ne", awayAbbr: "nyj" })];
    const results = [result({ gameId: "g1", homeAbbr: "buf", awayAbbr: "mia" })];
    const b = board([row("mia", 10), row("nyj", 90), row("buf", 50), row("ne", 50)]);
    const sos = buildSosBoard(["buf", "ne"], games, results, SEASON, b);
    expect(sos.get("buf")!.futureSos).toBeNull();
    expect(sos.get("ne")!.futureSosRank).toBe(1);
  });
});

describe("SOS never feeds back into rating inputs", () => {
  it("buildSosBoard's output type carries no rating-affecting field, only descriptive metrics", () => {
    const sos = buildSosBoard(["buf"], [], [], SEASON, board([]));
    const row_ = sos.get("buf")!;
    expect(Object.keys(row_).sort()).toEqual(
      ["futureSos", "futureSosRank", "sosToDate", "sosToDateRank", "teamAbbr"].sort()
    );
  });
});
