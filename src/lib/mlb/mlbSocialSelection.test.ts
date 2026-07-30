import { describe, expect, it } from "vitest";
import { buildPitcherStrikeoutRows, buildTbdGameKeySet } from "./mlbSocialSelection";
import type { HrDashboardBatter, HrDashboardGame, HrDashboardPitcher } from "@/pages/MlbHrProps";

function game(overrides: Partial<HrDashboardGame> & { gameKey: string }): HrDashboardGame {
  return {
    matchup: "TOR @ WSH",
    awayTeam: "TOR",
    homeTeam: "WSH",
    stadium: "Nationals Park",
    roofType: "Open",
    temperature: 75,
    precipitation: 0,
    windSpeed: 5,
    windDirection: "N",
    conditions: "Clear",
    parkFactor: 0.98,
    ...overrides,
  };
}

function pitcher(overrides: Partial<HrDashboardPitcher> & { pitcher: string; gameKey: string; team: string; opponent: string }): HrDashboardPitcher {
  return {
    gameId: null,
    pitcherId: null,
    hand: "R",
    ballpark: "Nationals Park",
    parkFactor: 0.98,
    xera: 4,
    hardHitRate: 35,
    flyBallRate: 30,
    barrelRate: 8,
    kRate: 25,
    bbRate: 8,
    whiffRate: 27,
    last7HR: 1,
    hrPerStart: 1,
    hrVs: 50,
    hitsVs: 50,
    kVs: 60,
    ...overrides,
  };
}

function batter(overrides: Partial<HrDashboardBatter> & { player: string; gameKey: string; team: string; opponent: string; opposingPitcher: string }): HrDashboardBatter {
  return {
    playerId: null,
    gameId: null,
    lineupStatus: "projected",
    battingOrder: null,
    starterConfirmed: null,
    position: null,
    opposingPitcherId: null,
    pitcherHand: "R",
    ballpark: "Nationals Park",
    parkFactor: 0.98,
    atBats: 200,
    barrelRate: 10,
    hardHitRate: 40,
    exitVelo: 90,
    iso: 0.2,
    hrFBRatio: 12,
    pullRate: 40,
    xba: 0.25,
    kRate: 22,
    bbRate: 9,
    whiffRate: 25,
    last7HR: 1,
    last30HR: 4,
    opposingPitcherHrVs: 50,
    opposingPitcherHitsVs: 50,
    opposingPitcherKVs: 50,
    weatherBoost: 0,
    hrScore: 70,
    hrScoreRank: 1,
    angleTags: [],
    ...overrides,
  } as HrDashboardBatter;
}

describe("buildTbdGameKeySet", () => {
  it("flags games with a TBD probable pitcher", () => {
    const pitchers = [pitcher({ pitcher: "TBD", gameKey: "TOR@WSH", team: "WSH", opponent: "TOR" })];
    const batters = [batter({ player: "Some Batter", gameKey: "NYM@ATL", team: "ATL", opponent: "NYM", opposingPitcher: "Real Pitcher" })];
    const keys = buildTbdGameKeySet(pitchers, batters);
    expect(keys.has("TOR@WSH")).toBe(true);
    expect(keys.has("NYM@ATL")).toBe(false);
  });

  it("flags games where a batter's opposing pitcher is TBD", () => {
    const batters = [batter({ player: "Some Batter", gameKey: "NYM@ATL", team: "ATL", opponent: "NYM", opposingPitcher: "TBA" })];
    const keys = buildTbdGameKeySet([], batters);
    expect(keys.has("NYM@ATL")).toBe(true);
  });
});

describe("buildPitcherStrikeoutRows", () => {
  it("produces one row per pitcher, ranked by strikeoutMatchupScore descending", () => {
    const games = [game({ gameKey: "PIT@CIN" }), game({ gameKey: "DET@KCR" })];
    const pitchers = [
      pitcher({ pitcher: "Weak K", gameKey: "PIT@CIN", team: "PIT", opponent: "CIN", kVs: 30, kRate: 15, whiffRate: 15 }),
      pitcher({ pitcher: "Strong K", gameKey: "DET@KCR", team: "DET", opponent: "KCR", kVs: 90, kRate: 32, whiffRate: 34 }),
    ];
    const rows = buildPitcherStrikeoutRows([], games, pitchers);

    expect(rows).toHaveLength(2);
    expect(rows[0].pitcher).toBe("Strong K");
    expect(rows[0].rank).toBe(1);
    expect(rows[1].pitcher).toBe("Weak K");
    expect(rows[1].rank).toBe(2);
  });

  it("attaches a resolved kProjectionStatus per row", () => {
    const games = [game({ gameKey: "PIT@CIN" })];
    const pitchers = [pitcher({ pitcher: "No Market", gameKey: "PIT@CIN", team: "PIT", opponent: "CIN" })];
    const rows = buildPitcherStrikeoutRows([], games, pitchers);
    expect(rows[0].kProjectionStatus).toBe("NO_MARKET");
  });
});
