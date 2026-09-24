import { test } from "node:test";
import assert from "node:assert/strict";
import { validateYardageHistoryArtifact } from "./validate-nfl-yardage-history.mjs";

const games = [1, 2, 3].map((week) => ({ gameId: `2026_0${week}_GB_ATL`, season: 2026, week, homeAbbr: "atl", awayAbbr: "gb" }));
const results = games.filter((g) => g.week < 3).map((g) => ({ gameId: g.gameId }));
const row = (season, week, gameId) => ({ season, week, gameId });
const artifact = (defenseRows, overrides = {}) => ({
  season: 2026,
  week: 3,
  provenance: { statSeasons: [2025, 2026], epaSeasons: [2025, 2026] },
  players: {},
  teamDefense: { "atl:rushing:RB": { team: "atl", games: defenseRows } },
  ...overrides,
});
const fresh = [row(2026, 2, "2026_02_GB_ATL"), row(2026, 1, "2026_01_GB_ATL"), row(2025, 18, "2025_18_GB_ATL")];
const validate = (a) => validateYardageHistoryArtifact({ artifact: a, games, results, season: 2026, week: 3 });

test("accepts a fresh Week 3 artifact that leads with completed Weeks 2 and 1", () => {
  assert.deepEqual(validate(artifact(fresh)), []);
});

test("fails when completed current-season games are absent (stale, 2025-only artifact)", () => {
  const problems = validate(artifact([row(2025, 18, "2025_18_GB_ATL")], { provenance: { statSeasons: [2025], epaSeasons: [2025] } })).join("|");
  assert.match(problems, /statSeasons does not include 2026/);
  assert.match(problems, /omits completed game/);
});

test("fails when the artifact is for a different week", () => {
  assert.match(validate(artifact(fresh, { week: 1 }))[0], /expected 2026\/3/);
});

test("fails on current-week or future target-season rows (leakage)", () => {
  const leaked = [row(2026, 3, "2026_03_GB_ATL"), ...fresh];
  assert.match(validate(artifact(leaked)).join("|"), /week 3 \(>= 3\) -- leakage/);
});

test("fails when rows are not ordered newest to oldest", () => {
  assert.match(validate(artifact([...fresh].reverse())).join("|"), /not ordered newest -> oldest/);
});

test("late-season: requires the NEWEST ten completed games, not the oldest (Week 13 target)", () => {
  const lateGames = Array.from({ length: 13 }, (_, i) => ({ gameId: `2026_${i + 1}_GB_ATL`, season: 2026, week: i + 1, homeAbbr: "atl", awayAbbr: "gb" }));
  const lateResults = lateGames.filter((g) => g.week < 13).map((g) => ({ gameId: g.gameId }));
  const newestTen = lateGames.filter((g) => g.week >= 3 && g.week < 13).reverse().map((g) => row(2026, g.week, g.gameId));
  const run = (rows) => validateYardageHistoryArtifact({
    artifact: artifact(rows, { week: 13 }), games: lateGames, results: lateResults, season: 2026, week: 13,
  });
  assert.deepEqual(run(newestTen), []); // weeks 12..3 present; weeks 1-2 legitimately aged out of the 10-game window
  assert.match(run(newestTen.slice(1)).join("|"), /omits completed game\(s\) 2026_12_GB_ATL/);
});
