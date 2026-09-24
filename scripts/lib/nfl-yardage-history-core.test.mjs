import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGameLookup,
  buildHistoryRollingIndexes,
  buildOpponentLast10,
  buildPlayerLast10,
  epaSeasonsThrough,
  excludeTargetWeekOnward,
  findMissingCompletedTeamGames,
  statSeasonsThrough,
} from "./nfl-yardage-history-core.mjs";
import { indexArchiveByTarget } from "./nfl-yardage-historical-line-core.mjs";

const TARGET_SEASON = 2026;
const TARGET_WEEK = 3;
const CANONICAL_TO_NFLVERSE = new Map([["atl", "ATL"], ["gb", "GB"]]);
const DAY_MS = 86_400_000;
const BASE_DATE = Date.parse("2025-09-07T17:00:00.000Z");

// Every week: ATL (home) vs GB. 2025 has 18 weeks, 2026 has weeks 1..5 (5 = future).
const SEASON_WEEKS = [{ season: 2025, weeks: 18 }, { season: 2026, weeks: 5 }];
const games = SEASON_WEEKS.flatMap(({ season, weeks }) =>
  Array.from({ length: weeks }, (_, i) => ({
    gameId: `${season}_${String(i + 1).padStart(2, "0")}_GB_ATL`,
    season,
    week: i + 1,
    dateUtc: new Date(BASE_DATE + ((season - 2025) * 365 + i * 7) * DAY_MS).toISOString(),
    homeAbbr: "atl",
    awayAbbr: "gb",
  })),
);
const results = games
  .filter((g) => g.season < TARGET_SEASON || g.week < TARGET_WEEK)
  .map((g) => ({ gameId: g.gameId, homeAbbr: "atl", awayAbbr: "gb", homeScore: 20 + g.week, awayScore: 17, winner: "atl" }));

const base = { completions: 0, attempts: 0, passingYards: 0, passingTds: 0, interceptions: 0, carries: 0, rushingYards: 0, rushingTds: 0, receptions: 0, targets: 0, receivingYards: 0, receivingTds: 0, fantasyPointsPpr: null };
const OFFENSE = [
  { playerId: "qb1", position: "QB", attempts: 30, passingYards: 250 },
  { playerId: "rb1", position: "RB", carries: 15, rushingYards: 70 },
  { playerId: "wr1", position: "WR", targets: 8, receptions: 5, receivingYards: 80 },
  { playerId: "te1", position: "TE", targets: 6, receptions: 4, receivingYards: 50 },
];
// ATL players (ids as-is) face GB; GB players (ids prefixed "gb-") face ATL, so both defenses have opposing leaders.
const statRows = games.flatMap((g) => [
  ...OFFENSE.map((p) => ({ ...base, ...p, season: g.season, week: g.week, playerName: p.playerId, team: "ATL", opponentTeam: "GB" })),
  ...OFFENSE.map((p) => ({ ...base, ...p, playerId: `gb-${p.playerId}`, season: g.season, week: g.week, playerName: `gb-${p.playerId}`, team: "GB", opponentTeam: "ATL" })),
]);

const gameLookup = buildGameLookup(games, results, CANONICAL_TO_NFLVERSE);
const archiveIndex = indexArchiveByTarget([]);
const cutRows = excludeTargetWeekOnward(statRows, TARGET_SEASON, TARGET_WEEK);
const rollingIndexes = buildHistoryRollingIndexes(cutRows, []);

const playerLog = (playerId, market, position, rowsIn = cutRows) =>
  buildPlayerLast10({ playerId, market, playerPosition: position, playerStatRows: rowsIn, gameLookup, rollingIndexes, archiveIndex, canonicalMarketKey: `${market}Yards` });
const opponentLog = (market, position, rowsIn = cutRows) =>
  buildOpponentLast10({ defenseTeamNflverseAbbr: "ATL", market, position, allStatRows: rowsIn, gameLookup, rollingIndexes, archiveIndex, canonicalMarketKey: `${market}Yards` });
const keys = (log) => log.map((g) => `${g.season}w${g.week}`);

test("season coverage is derived from the target season, not a fixed list", () => {
  assert.deepEqual(statSeasonsThrough(2026), [2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(statSeasonsThrough(2027).at(-1), 2027);
  assert.deepEqual(epaSeasonsThrough(2026), [2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(epaSeasonsThrough(2027).at(-1), 2027);
});

test("Player Last 10 leads with completed Week 2 then Week 1 of the target season", () => {
  const log = playerLog("rb1", "rushing", "RB");
  assert.deepEqual(keys(log).slice(0, 3), ["2026w2", "2026w1", "2025w18"]);
});

test("current Week 3 game and the future Week 4/5 games never enter a log", () => {
  for (const log of [playerLog("rb1", "rushing", "RB"), opponentLog("rushing", "RB")]) {
    assert.ok(!keys(log).some((k) => ["2026w3", "2026w4", "2026w5"].includes(k)));
  }
  // Without the cutoff the leak WOULD occur -- proves the guard is what prevents it.
  assert.ok(keys(playerLog("rb1", "rushing", "RB", statRows)).includes("2026w5"));
});

test("Player and Opponent Last 10 are ordered newest to oldest", () => {
  for (const log of [playerLog("qb1", "passing", "QB"), opponentLog("passing", "QB")]) {
    const ordered = log.map((g) => g.season * 100 + g.week);
    assert.deepEqual(ordered, [...ordered].sort((a, b) => b - a));
  }
});

test("crossing the season boundary still fills to 10 with 2025 games after 2026 games", () => {
  for (const log of [playerLog("wr1", "receiving", "WR"), opponentLog("receiving", "WR")]) {
    assert.equal(log.length, 10);
    assert.deepEqual(keys(log).slice(0, 4), ["2026w2", "2026w1", "2025w18", "2025w17"]);
    assert.equal(log.at(-1).week, 11);
  }
});

test("QB/RB/WR/TE opponent histories all include current-season rows and are unique per game", () => {
  const cases = [["passing", "QB"], ["rushing", "RB"], ["receiving", "WR"], ["receiving", "TE"]];
  for (const [market, position] of cases) {
    const log = opponentLog(market, position);
    assert.deepEqual(keys(log).slice(0, 2), ["2026w2", "2026w1"], `${market}/${position}`);
    assert.equal(new Set(log.map((g) => g.gameId)).size, log.length, `${market}/${position} duplicate games`);
    assert.equal(log[0].homeAway, "home"); // ATL defended at home
  }
});

test("Week 1 target has no current-season games and is not degraded", () => {
  const weekOneRows = excludeTargetWeekOnward(statRows, TARGET_SEASON, 1);
  assert.ok(weekOneRows.every((r) => r.season === 2025));
});

test("freshness helper flags a completed team-game missing from the stat rows", () => {
  const completed = [{ season: 2026, week: 1, team: "ATL" }, { season: 2026, week: 2, team: "ATL" }, { season: 2026, week: 2, team: "GB" }];
  assert.deepEqual(findMissingCompletedTeamGames(completed, cutRows), []);
  const staleRows = cutRows.filter((r) => !(r.season === 2026 && r.week === 2));
  assert.deepEqual(findMissingCompletedTeamGames(completed, staleRows), ["ATL|2026|2", "GB|2026|2"]);
});
