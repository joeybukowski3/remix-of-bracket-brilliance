import assert from "node:assert/strict";
import test from "node:test";
import { buildDetailedTournamentData, validateDetailedTournamentData } from "./pga-detailed-model.mjs";

const now = new Date().toISOString();

function fixture() {
  const players = Array.from({ length: 100 }, (_, index) => `Player ${index + 1}`);
  const stats = players.map((player, index) => ({
    player,
    sgApp: index,
    par4ScoringAverage: 4 + index / 100,
    drivingAccuracy: 70 - index / 10,
    bogeyAvoidance: 0.1 + index / 1000,
    sgAtG: index / 10,
    birdie125150: 20 - index / 20,
    sgPutt: index / 20,
    birdieUnder125: 30 - index / 20,
  }));
  return {
    field: { validated: true, tournamentId: "R2026100", tournamentSlug: "the-open-championship", fetchedAt: now, players },
    stats,
    statsMeta: { syncedAt: now },
    trend: {
      schemaVersion: "jkb-trend-rankings-v2",
      generatedAt: now,
      validation: { status: "valid" },
      players: players.map((player, index) => ({ player, rank: index + 1 })),
    },
    history: { schemaVersion: "pga-round-history-actual-strokes-v2", generatedAt: now, health: { status: "available" }, rounds: [] },
    config: {
      slug: "the-open-2026-picks",
      field: { tournamentId: "R2026100", tournamentSlug: "the-open-championship" },
      history: { eventName: "The Open Championship", courseName: "Royal Birkdale Golf Club" },
    },
    generatedAt: now,
  };
}

test("ranks lower raw Par 4 and bogey rates in the correct direction", () => {
  const result = buildDetailedTournamentData(fixture());
  assert.equal(result.rows[0]["Par 4 Scoring Average_rank"], 1);
  assert.equal(result.rows[0]["Bogey Avoidance_rank"], 1);
  assert.equal(result.rows[99]["Par 4 Scoring Average_rank"], 100);
  assert.equal(result.rows[99]["Bogey Avoidance_rank"], 100);
});

test("missing data remains null and never becomes zero", () => {
  const input = fixture();
  delete input.stats[0].sgApp;
  const result = buildDetailedTournamentData(input);
  assert.equal(result.rows[0]["SG: Approach the Green"], null);
  assert.equal(result.rows[0]["SG: Approach the Green_rank"], null);
});

test("invalid or empty output is rejected before replacement", () => {
  const input = fixture();
  assert.throws(() => validateDetailedTournamentData([], input), /row count/);
});

test("a pre-fix or invalid Trend artifact is rejected", () => {
  const input = fixture();
  input.trend.schemaVersion = "jkb-trend-rankings-v1";
  assert.throws(() => buildDetailedTournamentData(input), /corrected, validated v2/);
});
