import test from "node:test";
import assert from "node:assert/strict";
import { expectedFinalTeamGames, validateTeamGameCoverage, requireTeamGameCoverage } from "./nfl-current-season-coverage.mjs";

const finals = [
  { gameId: "2026_01_GB_MIN", seasonType: "REG", final: true, awayAbbr: "gb", homeAbbr: "min" },
  { gameId: "2026_02_GB_NYJ", seasonType: "REG", final: true, awayAbbr: "gb", homeAbbr: "nyj" },
  { gameId: "2026_03_ATL_GB", seasonType: "REG", final: false, awayAbbr: "atl", homeAbbr: "gb" },
  { gameId: "2026_20_GB_MIN", seasonType: "POST", final: true, awayAbbr: "gb", homeAbbr: "min" },
];

test("uses final regular-season games only, including Green Bay Week 2", () => {
  const expected = expectedFinalTeamGames(finals, finals);
  assert.deepEqual(expected.map((row) => `${row.gameId}|${row.team}`).sort(), [
    "2026_01_GB_MIN|gb", "2026_01_GB_MIN|min", "2026_02_GB_NYJ|gb", "2026_02_GB_NYJ|nyj",
  ]);
  assert.equal(validateTeamGameCoverage(expected, expected, "complete").problems.length, 0);
});

test("reports a missing final game, unexpected game and sample mismatch", () => {
  const expected = expectedFinalTeamGames(finals);
  const included = expected.filter((row) => row.gameId !== "2026_02_GB_NYJ");
  included.push({ gameId: "2026_03_ATL_GB", team: "gb" });
  const { summary, problems } = validateTeamGameCoverage(expected, included, "stale");
  assert.deepEqual(summary.missingGameIds, ["2026_02_GB_NYJ"]);
  assert.deepEqual(summary.unexpectedGameIds, ["2026_03_ATL_GB"]);
  assert.deepEqual(summary.teamsWithSampleCountMismatches, [{ team: "nyj", expected: 1, included: 0 }]);
  assert.ok(problems.length > 0);
  assert.throws(() => requireTeamGameCoverage(expected, included, "stale"), /missing team-games/);
});

test("rejects a final result absent from the canonical schedule", () => {
  assert.throws(() => expectedFinalTeamGames(finals, finals.slice(1)), /absent from the schedule/);
});
