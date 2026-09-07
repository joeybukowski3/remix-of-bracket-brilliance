import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndividualYardageHistory, normalizeIndividualHistoryStatRows } from "./nfl-individual-yardage-history.mjs";
import { buildGameLookup, buildOpponentLast10, buildHistoryRollingIndexes } from "./nfl-yardage-history-core.mjs";
import { indexArchiveByTarget } from "./nfl-yardage-historical-line-core.mjs";
import { buildTrailingPregameAverage } from "./nfl-yardage-rolling-core.mjs";

const teams = new Map([["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]]);
const raw = (week, player, yards, overrides = {}) => ({ season: "2025", season_type: "REG", week: String(week), player_id: player,
  player_display_name: player, position: "WR", recent_team: "A", opponent_team: "B", targets: "2", receptions: "1",
  attempts: "0", carries: "0", passing_yards: "0", rushing_yards: "0", receiving_yards: String(yards), ...overrides });
const game = (week, dateUtc, overrides = {}) => ({ gameId: `g${week}`, season: 2025, week, dateUtc, homeAbbr: "b", awayAbbr: "a", ...overrides });
const games = [game(1, "2025-09-01T17:00:00Z"), game(2, "2025-09-08T17:00:00Z"), game(3, "2025-09-15T17:00:00Z")];
const request = { playerId: "gsis:p", market: "receiving", position: "WR", opponent: "b" };
function fixture(rows = [raw(1, "p", 40), raw(1, "q", 20), raw(2, "p", 80), raw(2, "q", 0)], changes = {}) {
  const schedule = changes.games ?? games;
  return { season: 2025, week: 3, asOf: "2025-09-15T17:00:00Z", targetGameIds: ["g3"], requests: [request],
    statRows: normalizeIndividualHistoryStatRows(rows, 2025),
    gameLookup: buildGameLookup(schedule, schedule.map((g) => ({ ...g, homeScore: 10, awayScore: 20, winner: g.awayAbbr })), teams),
    canonicalToNflverseAbbr: teams, archiveIndex: new Map(), ...changes };
}
const playerRows = (result) => result.players["gsis:p:receiving"];
const defenseRows = (result) => result.defenseMatchups["b:receiving:WR"];

test("player allowance is the whole position group's pregame per-game total", () => {
  const result = buildIndividualYardageHistory(fixture());
  assert.equal(playerRows(result)[0].opponentPregamePositionalAllowance, 60);
  assert.equal(playerRows(result)[0].actualMinusOpponentAllowance, 20);
  assert.equal(playerRows(result)[0].opponentPregamePositionalAllowanceSampleSize, 1);
  assert.equal(playerRows(result)[0].allowanceScope, "entire-position-group-per-defense-game");
  assert.equal(playerRows(result)[1].actualMinusOpponentAllowance, null);
  assert.equal(playerRows(result)[1].opponentPregamePositionalAllowanceSampleSize, 0);
});

test("individual cohort includes multiple players per game and recorded zero yards", () => {
  const rows = defenseRows(buildIndividualYardageHistory(fixture()));
  assert.deepEqual(rows.map((r) => [r.gameId, r.playerId]), [["g2", "gsis:p"], ["g2", "gsis:q"], ["g1", "gsis:p"], ["g1", "gsis:q"]]);
  assert.equal(rows[0].playerPregameTrailing10Average, 40);
  assert.equal(rows[0].actualMinusPlayerAverage, 40);
  assert.equal(rows[0].playerReferenceSampleSize, 1);
  assert.equal(rows[1].actualYards, 0);
  assert.equal(rows[1].actualMinusPlayerAverage, -20);
});

test("cutoff excludes target, future, later same-week game; earlier game allowed", () => {
  const schedule = [...games, game(3, "2025-09-15T20:00:00Z", { gameId: "late", homeAbbr: "d", awayAbbr: "c" }), game(4, "2025-09-22T17:00:00Z")];
  const rows = [raw(1, "p", 40), raw(3, "p", 999), raw(3, "late", 999, { recent_team: "C", opponent_team: "D" }), raw(4, "p", 999)];
  const result = buildIndividualYardageHistory(fixture(rows, { games: schedule }));
  assert.deepEqual(playerRows(result).map((r) => r.gameId), ["g1"]);
  assert.equal(result.diagnostics.excludedCutoff, 3);
  const rescheduled = buildIndividualYardageHistory(fixture(rows, { games: schedule, targetGameIds: ["g1", "g3"] }));
  assert.equal(playerRows(rescheduled).length, 0);
});

test("references use kickoff order, including earlier same-week games and rescheduled weeks", () => {
  const values = new Map([["p|2025|2", 20], ["p|2025|1", 10], ["p|2025|3", 999]]);
  const dates = new Map([["p|2025|2", "2025-09-01T17:00:00Z"], ["p|2025|1", "2025-09-08T17:00:00Z"], ["p|2025|3", "2025-09-08T17:00:00Z"]]);
  const index = buildTrailingPregameAverage(values, 10, dates);
  assert.deepEqual(index.get("p|2025|1"), { avg: 20, gamesIncluded: 1 });
  assert.deepEqual(index.get("p|2025|3"), { avg: 20, gamesIncluded: 1 });
  dates.delete("p|2025|2");
  assert.equal(buildTrailingPregameAverage(values, 10, dates).get("p|2025|1").avg, null);
});

test("cross-season trailing reference uses only ten preceding recorded games", () => {
  const previous = Array.from({ length: 11 }, (_, i) => ({ ...raw(i + 1, "p", i + 1), season: "2024" }));
  const oldGames = previous.map((r, i) => game(i + 1, `2024-09-${String(i + 1).padStart(2, "0")}T17:00:00Z`, { season: 2024, gameId: `old${i}` }));
  const input = fixture([], { games: [...oldGames, ...games], statRows: [...normalizeIndividualHistoryStatRows(previous, 2024), ...normalizeIndividualHistoryStatRows([raw(1, "p", 500)], 2025)] });
  const row = defenseRows(buildIndividualYardageHistory(input))[0];
  assert.equal(row.playerReferenceSampleSize, 10);
  assert.equal(row.playerPregameTrailing10Average, 6.5);
  assert.equal(row.actualMinusPlayerAverage, 493.5);
});

test("unknown/DNP, missing stats, missing dates and conflicting identities are not zero appearances", () => {
  const rows = [raw(1, "p", 0, { targets: "0", receptions: "0" }), raw(2, "p", ""), raw(2, "q", 5), raw(2, "q", 9), raw(8, "missing", 4)];
  const result = buildIndividualYardageHistory(fixture(rows));
  assert.equal(playerRows(result).length, 0);
  assert.equal(defenseRows(result).length, 0);
  assert.equal(result.diagnostics.noRecordedAppearance, 1);
  assert.equal(result.diagnostics.missingYardage, 1);
  assert.equal(result.diagnostics.duplicateIdentity, 2);
  assert.equal(result.diagnostics.missingGame, 1);
});

test("incomplete positional game is excluded from allowance rather than partially summed", () => {
  const result = buildIndividualYardageHistory(fixture([raw(1, "p", 40), raw(1, "q", ""), raw(2, "p", 80)]));
  assert.equal(playerRows(result)[0].opponentPregamePositionalAllowance, null);
  assert.equal(defenseRows(result)[0].playerPregameTrailing10Average, 40);
});

test("conflicting player identities invalidate the positional total, not just that player", () => {
  const result = buildIndividualYardageHistory(fixture([raw(1, "p", 40), raw(1, "q", 20), raw(1, "q", 30), raw(2, "p", 80)]));
  assert.equal(playerRows(result)[0].opponentPregamePositionalAllowance, null);
  assert.equal(defenseRows(result)[0].playerPregameTrailing10Average, 40);
});

test("last N and tied-date ordering are deterministic under reordered inputs", () => {
  const input = fixture(undefined, { lastN: 2 });
  const a = buildIndividualYardageHistory(input);
  const b = buildIndividualYardageHistory({ ...input, statRows: [...input.statRows].reverse() });
  assert.deepEqual(a, b);
  assert.equal(defenseRows(a).length, 2);
  assert.deepEqual(defenseRows(a).map((r) => r.playerId), ["gsis:p", "gsis:q"]);
});

for (const [point, expected] of [[70, "over"], [90, "under"], [80, "push"]]) {
  test(`historical line ${expected}: exact game, before kickoff, provenance preserved`, () => {
    const base = { playerId: "gsis:p", canonicalMarket: "receivingYards", gameId: "g2", bookmaker: "draftkings", point, observedAt: "2025-09-08T16:00:00Z" };
    const archiveIndex = indexArchiveByTarget([base, { ...base, point: 999, observedAt: "2025-09-08T17:00:00Z" }, { ...base, point: 999, gameId: "g3", observedAt: "2025-09-15T12:00:00Z" }]);
    const row = playerRows(buildIndividualYardageHistory(fixture(undefined, { archiveIndex })))[0];
    assert.equal(row.lineResult, expected);
    assert.deepEqual(row.historicalSportsbookLine, { point, bookmaker: "draftkings", observedAt: base.observedAt, selectionPolicyVersion: "approved-final-pre-kickoff-v1" });
  });
}

test("missing historical line remains unavailable", () => {
  const row = playerRows(buildIndividualYardageHistory(fixture()))[0];
  assert.equal(row.historicalSportsbookLine, null);
  assert.equal(row.lineResult, "unavailable");
});

test("legacy opponent helper still selects one volume leader per game", () => {
  const input = fixture();
  const before = JSON.stringify(input.statRows);
  buildIndividualYardageHistory(input);
  const old = buildOpponentLast10({ defenseTeamNflverseAbbr: "B", market: "receiving", position: "WR", allStatRows: input.statRows, gameLookup: input.gameLookup,
    rollingIndexes: buildHistoryRollingIndexes(input.statRows, []), archiveIndex: input.archiveIndex, canonicalMarketKey: "receivingYards" });
  assert.equal(old.length, 2);
  assert.deepEqual(old.map((r) => r.opponentPlayerId), ["p", "p"]);
  assert.equal(JSON.stringify(input.statRows), before);
});

test("cutoff and window are required valid inputs", () => {
  assert.throws(() => buildIndividualYardageHistory(fixture(undefined, { asOf: undefined })), /UTC/);
  assert.throws(() => buildIndividualYardageHistory(fixture(undefined, { lastN: 0 })), /lastN/);
});
