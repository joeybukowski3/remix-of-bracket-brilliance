import { describe, expect, it } from "vitest";
import { MIN_GAMES_FOR_STRENGTH, defenseStrength, teamDefenseKey, type TeamDefenseEntry } from "../recentForm";
import type { ImportedPlayerGame } from "./playerGameImport";
import { buildTeamDefense, estimatedPossessions, restrictTeamDefense } from "./teamDefense";

interface Side {
  team: string;
  pts: number;
  fga: number;
  fta: number;
  oreb: number;
  tov: number;
}

const SEASON = "2026-27";

/** Five players of 48 minutes (a complete 240); the team's totals sit on the first player and the rest are zeros. */
function sideRows(gameId: string, date: string, side: Side, other: Side, isHome: boolean, over: Partial<ImportedPlayerGame> = {}): ImportedPlayerGame[] {
  return Array.from({ length: 5 }, (_, i) => ({
    season: SEASON, seasonType: "regular", gameId, gameDate: date, team: side.team, opponent: other.team, isHome,
    playerId: `${side.team}-${i}`, playerName: `${side.team} Player ${i}`, minutes: 48,
    pts: i === 0 ? side.pts : 0, reb: 0, ast: 0,
    fga: i === 0 ? side.fga : 0, fta: i === 0 ? side.fta : 0, oreb: i === 0 ? side.oreb : 0, tov: i === 0 ? side.tov : 0,
    ...over,
  }));
}

const side = (team: string, pts: number, over: Partial<Side> = {}): Side => ({ team, pts, fga: 90, fta: 25, oreb: 10, tov: 12, ...over });
/** 90 + 0.44 * 25 - 10 + 12 = 103 possessions for a default side. */
const BASE_POSSESSIONS = 90 + 0.44 * 25 - 10 + 12;

const game = (gameId: string, date: string, home: Side, away: Side, over: Partial<ImportedPlayerGame> = {}): ImportedPlayerGame[] => [
  ...sideRows(gameId, date, home, away, true, over),
  ...sideRows(gameId, date, away, home, false, over),
];

describe("estimatedPossessions", () => {
  it("is field-goal attempts plus 0.44 free-throw attempts, minus offensive rebounds, plus turnovers", () => {
    expect(estimatedPossessions({ fga: 90, fta: 25, oreb: 10, tov: 12 })).toBeCloseTo(BASE_POSSESSIONS, 9);
  });
});

describe("buildTeamDefense", () => {
  it("rates a team as 100 x points allowed / estimated possessions over its games before the date", () => {
    // AAA allowed 100 then 110 (both games share a possession estimate of 103): pooled rating = 100 * 210 / (2 * 103).
    const rows = [
      ...game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)),
      ...game("g2", "2026-10-22", side("AAA", 99), side("CCC", 110)),
      ...game("g3", "2026-10-25", side("AAA", 101), side("DDD", 95)),
    ];
    const table = buildTeamDefense(rows, SEASON);
    const entry = table.asOf[teamDefenseKey("AAA", "2026-10-25")];
    expect(entry.games).toBe(2);
    expect(entry.rating).toBeCloseTo((100 * 210) / (2 * BASE_POSSESSIONS), 1);
  });

  it("never looks at the game itself or anything after it", () => {
    const early = [...game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)), ...game("g2", "2026-10-22", side("AAA", 99), side("CCC", 110))];
    const withFuture = [...early, ...game("g3", "2026-10-22", side("EEE", 150), side("FFF", 150)), ...game("g4", "2026-10-30", side("AAA", 200), side("BBB", 200))];
    const key = teamDefenseKey("AAA", "2026-10-22");
    expect(buildTeamDefense(withFuture, SEASON).asOf[key]).toEqual(buildTeamDefense(early, SEASON).asOf[key]);
    // The same-day game is excluded too: the rating before g2 rests on g1 alone.
    expect(buildTeamDefense(early, SEASON).asOf[key].games).toBe(1);
  });

  it("gives no entry for a team's first game of the season", () => {
    const table = buildTeamDefense(game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)), SEASON);
    expect(table.asOf[teamDefenseKey("AAA", "2026-10-20")]).toBeUndefined();
    expect(table.asOf[teamDefenseKey("BBB", "2026-10-20")]).toBeUndefined();
  });

  it("ranks every team with a usable game by that date (1 = lowest rating), ties sharing a rank", () => {
    const rows = [
      ...game("g1", "2026-10-20", side("AAA", 100), side("BBB", 90)), // AAA allowed 90, BBB allowed 100
      ...game("g2", "2026-10-20", side("CCC", 100), side("DDD", 120)), // CCC allowed 120, DDD allowed 100
      ...game("g3", "2026-10-23", side("AAA", 100), side("CCC", 100)),
    ];
    const table = buildTeamDefense(rows, SEASON);
    const aaa = table.asOf[teamDefenseKey("AAA", "2026-10-23")];
    const ccc = table.asOf[teamDefenseKey("CCC", "2026-10-23")];
    expect([aaa.rank, aaa.rankedOf]).toEqual([1, 4]);
    expect([ccc.rank, ccc.rankedOf]).toEqual([4, 4]);
    // BBB and DDD each allowed 100: not playing on the 23rd, but they decide the ranks of those who are.
    expect(table.asOf[teamDefenseKey("BBB", "2026-10-23")]).toBeUndefined();
  });

  it("carries the league's pooled rating for the same cutoff", () => {
    const rows = [...game("g1", "2026-10-20", side("AAA", 100), side("BBB", 90)), ...game("g2", "2026-10-23", side("AAA", 100), side("BBB", 100))];
    const entry = buildTeamDefense(rows, SEASON).asOf[teamDefenseKey("AAA", "2026-10-23")];
    expect(entry.leagueRating).toBeCloseTo((100 * 190) / (2 * BASE_POSSESSIONS), 1);
  });

  it("leaves a game out of every rating when possession inputs are missing, and says so", () => {
    const missing = game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)).map((r) => {
      const { fga: _fga, fta: _fta, oreb: _oreb, tov: _tov, ...rest } = r;
      return rest;
    });
    const rows = [...missing, ...game("g2", "2026-10-22", side("AAA", 99), side("CCC", 110)), ...game("g3", "2026-10-25", side("AAA", 101), side("DDD", 95))];
    const table = buildTeamDefense(rows, SEASON);
    expect(table.unusableGames).toBe(1);
    expect(table.usableGames).toBe(2);
    expect(table.asOf[teamDefenseKey("AAA", "2026-10-25")].games).toBe(1);
  });

  it("keeps a roster whose minutes are 2 off (rounding) but not 3 off, which could hide a missing player row", () => {
    const off = (minutes: number) => game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)).map((r) => (r.playerId === "AAA-0" ? { ...r, minutes } : r));
    const later = game("g2", "2026-10-22", side("AAA", 99), side("CCC", 110));
    expect(buildTeamDefense([...off(50), ...later], SEASON).asOf[teamDefenseKey("AAA", "2026-10-22")].games).toBe(1);
    const tooFar = buildTeamDefense([...off(51), ...later], SEASON);
    expect(tooFar.unusableGames).toBe(1);
    expect(tooFar.asOf[teamDefenseKey("AAA", "2026-10-22")]).toBeUndefined();
  });

  it("leaves out a game whose box score is not a complete game, rather than rating a short roster", () => {
    const short = game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)).filter((r) => r.playerId !== "AAA-4");
    const table = buildTeamDefense([...short, ...game("g2", "2026-10-22", side("AAA", 99), side("CCC", 110))], SEASON);
    expect(table.unusableGames).toBe(1);
    expect(table.asOf[teamDefenseKey("AAA", "2026-10-22")]).toBeUndefined();
  });

  it("uses regular-season games of the requested season only", () => {
    const rows = [
      ...game("pre", "2026-10-05", side("AAA", 70), side("BBB", 70), { seasonType: "preseason" }),
      ...game("old", "2025-12-01", side("AAA", 150), side("BBB", 150), { season: "2025-26" }),
      ...game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)),
      ...game("g2", "2026-10-22", side("AAA", 99), side("CCC", 110)),
    ];
    const entry = buildTeamDefense(rows, SEASON).asOf[teamDefenseKey("AAA", "2026-10-22")];
    expect(entry.games).toBe(1);
    expect(entry.rating).toBeCloseTo((100 * 100) / BASE_POSSESSIONS, 1);
  });

  it("averages the two teams' possession estimates, since both sides share the game's possessions", () => {
    const rows = [...game("g1", "2026-10-20", side("AAA", 100, { tov: 20 }), side("BBB", 100, { tov: 10 })), ...game("g2", "2026-10-22", side("AAA", 100), side("CCC", 100))];
    const shared = (estimatedPossessions({ fga: 90, fta: 25, oreb: 10, tov: 20 }) + estimatedPossessions({ fga: 90, fta: 25, oreb: 10, tov: 10 })) / 2;
    expect(buildTeamDefense(rows, SEASON).asOf[teamDefenseKey("AAA", "2026-10-22")].rating).toBeCloseTo((100 * 100) / shared, 1);
  });

  it("returns an empty table for an import without possession inputs (older files)", () => {
    const rows = game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)).map(({ fga: _a, fta: _b, oreb: _c, tov: _d, ...rest }) => rest);
    const table = buildTeamDefense(rows, SEASON);
    expect(Object.keys(table.asOf)).toEqual([]);
    expect([table.usableGames, table.unusableGames]).toEqual([0, 1]);
  });
});

describe("restrictTeamDefense", () => {
  it("keeps only the requested team-dates and the table's own counts, without changing the input", () => {
    const rows = [...game("g1", "2026-10-20", side("AAA", 105), side("BBB", 100)), ...game("g2", "2026-10-22", side("AAA", 99), side("CCC", 110)), ...game("g3", "2026-10-25", side("AAA", 101), side("BBB", 95))];
    const full = buildTeamDefense(rows, SEASON);
    const before = JSON.stringify(full);
    const kept = restrictTeamDefense(full, new Set([teamDefenseKey("AAA", "2026-10-25"), teamDefenseKey("ZZZ", "2026-10-25")]));
    expect(Object.keys(kept.asOf)).toEqual([teamDefenseKey("AAA", "2026-10-25")]);
    expect(kept.asOf[teamDefenseKey("AAA", "2026-10-25")]).toEqual(full.asOf[teamDefenseKey("AAA", "2026-10-25")]);
    expect([kept.season, kept.usableGames, kept.unusableGames]).toEqual([full.season, full.usableGames, full.unusableGames]);
    expect(JSON.stringify(full)).toBe(before);
  });
});

describe("defenseStrength", () => {
  const entry = (rank: number, games = MIN_GAMES_FOR_STRENGTH, rankedOf = 30): TeamDefenseEntry => ({ rating: 110, leagueRating: 112, rank, rankedOf, games });

  it("calls the best third strong, the worst third weak and the rest average", () => {
    expect([1, 10].map((r) => defenseStrength(entry(r)))).toEqual(["strong", "strong"]);
    expect([11, 20].map((r) => defenseStrength(entry(r)))).toEqual(["average", "average"]);
    expect([21, 30].map((r) => defenseStrength(entry(r)))).toEqual(["weak", "weak"]);
  });

  it("gives no label under the minimum sample, however extreme the rank", () => {
    expect(defenseStrength(entry(1, MIN_GAMES_FOR_STRENGTH - 1))).toBeNull();
    expect(defenseStrength(entry(30, 1))).toBeNull();
  });

  it("gives no label when too few teams are ranked, or there is no entry", () => {
    expect(defenseStrength(entry(1, 8, 2))).toBeNull();
    expect(defenseStrength(undefined)).toBeNull();
  });
});
