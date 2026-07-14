import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGameSummaryLoader, validateRegradedArchive } from "../grade-mlb-hr-results.mjs";
import { buildCompleteGameSummary, gradePrediction, isGradeable } from "./mlb-hr-grading.mjs";

const GAME = {
  gamePk: 700001,
  officialDate: "2026-07-14",
  gameDate: "2026-07-14T23:05:00Z",
  doubleHeader: "Y",
  gameNumber: 2,
  status: { abstractGameState: "Final", detailedState: "Final" },
  teams: { home: { team: { id: 10 } }, away: { team: { id: 20 } } },
};

const BOXSCORE = {
  teams: {
    home: {
      team: { id: 10 },
      players: {
        ID101: { stats: { batting: { homeRuns: 1, atBats: 4, plateAppearances: 4 } } },
        ID102: { stats: { batting: { homeRuns: 0, atBats: 0, plateAppearances: 0 } } },
      },
    },
    away: {
      team: { id: 20 },
      players: {
        ID201: { stats: { batting: { homeRuns: 0, atBats: 3, plateAppearances: 4 } } },
      },
    },
  },
};

function record(playerId, teamId) {
  return { playerId, teamId, gameId: GAME.gamePk, result: { status: "pending", attemptCount: 0 } };
}

describe("complete game cache and stable team grading", () => {
  it("caches one complete game object containing both teams", async () => {
    const calls = [];
    const fetchJsonImpl = async (url) => {
      calls.push(url);
      return url.includes("/boxscore") ? BOXSCORE : { dates: [{ games: [GAME] }] };
    };
    const { getGameSummary, cache } = createGameSummaryLoader({ fetchJsonImpl });
    const first = await getGameSummary(GAME.gamePk);
    const second = await getGameSummary(GAME.gamePk);

    assert.equal(first, second);
    assert.equal(cache.size, 1);
    assert.equal(calls.length, 2);
    assert.equal(first.homeTeamId, 10);
    assert.equal(first.awayTeamId, 20);
    assert.ok(first.homeBattingLines.ID101);
    assert.ok(first.awayBattingLines.ID201);
  });

  it("grades home and away batters correctly from the same summary", () => {
    const summary = buildCompleteGameSummary(GAME, BOXSCORE);
    assert.equal(gradePrediction(record(101, 10), summary).status, "hit");
    assert.equal(gradePrediction(record(201, 20), summary).status, "miss");
  });

  it("classifies zero-appearance and absent known-team players as DNP", () => {
    const summary = buildCompleteGameSummary(GAME, BOXSCORE);
    assert.equal(gradePrediction(record(102, 10), summary).status, "did_not_play");
    assert.equal(gradePrediction(record(999, 10), summary).status, "did_not_play");
  });

  it("does not grade a mismatched stable team ID by name or abbreviation", () => {
    const summary = buildCompleteGameSummary(GAME, BOXSCORE);
    const result = gradePrediction(record(101, 999), summary);
    assert.equal(result.status, "unresolved_retryable");
    assert.equal(result.resolutionReason, "team_id_not_in_game");
  });
});

describe("retryable grading state machine", () => {
  it("keeps scheduled games pending", () => {
    assert.equal(gradePrediction(record(101, 10), { gameState: "scheduled" }).status, "pending");
  });

  it("keeps suspended games retryable", () => {
    const result = gradePrediction(record(101, 10), { gameState: "suspended", detailedState: "Suspended" });
    assert.equal(result.status, "suspended");
    assert.equal(isGradeable({ result }, {}), true);
  });

  it("retries legacy unresolved only in explicit regrade mode", () => {
    const legacy = { result: { status: "unresolved" } };
    assert.equal(isGradeable(legacy), false);
    assert.equal(isGradeable(legacy, { regradeUnresolved: true }), true);
  });

  it("treats unresolved_retryable as retryable and unresolved_terminal as terminal", () => {
    assert.equal(isGradeable({ result: { status: "unresolved_retryable" } }), true);
    assert.equal(isGradeable({ result: { status: "unresolved_terminal" } }), false);
  });

  it("preserves postponed and cancelled classifications", () => {
    assert.equal(gradePrediction(record(101, 10), { gameState: "postponed" }).status, "postponed");
    assert.equal(gradePrediction(record(101, 10), { gameState: "cancelled" }).status, "cancelled");
  });

  it("turns provider resolution failures into retryable outcomes", () => {
    const result = gradePrediction(record(101, 10), {
      gameState: "unresolved_retryable",
      resolutionError: "game_summary_fetch_failed:timeout",
    });
    assert.equal(result.status, "unresolved_retryable");
  });
});

describe("historical regrade validation", () => {
  const validRecord = {
    date: "2026-07-14",
    officialGameDate: "2026-07-14",
    playerId: 101,
    gameId: 700001,
    teamId: 10,
    opponentId: 20,
    modelVersion: "live-v1",
    hrQualityScore: 55,
    result: { status: "miss" },
  };

  it("rejects duplicate archive keys before replacement", () => {
    const validation = validateRegradedArchive([validRecord, { ...validRecord }]);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("duplicate_archive_keys"));
  });

  it("rejects missing stable IDs and official-date mismatches", () => {
    const validation = validateRegradedArchive([
      { ...validRecord, playerId: null },
      { ...validRecord, playerId: 102, officialGameDate: "2026-07-15" },
    ]);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("missing_player_or_game_id"));
    assert.ok(validation.errors.includes("official_date_mismatch:1"));
  });

  it("rejects a suspiciously unresolved provider result instead of replacing the archive", () => {
    const beforeRecords = Array.from({ length: 100 }, (_, index) => ({
      ...validRecord,
      playerId: index + 1,
      gameId: 800000 + index,
      result: { status: "unresolved" },
    }));
    const afterRecords = beforeRecords.map((record) => ({
      ...record,
      result: {
        status: "unresolved_retryable",
        resolutionReason: "game_summary_fetch_failed:HTTP 429",
      },
    }));
    const validation = validateRegradedArchive(afterRecords, { beforeRecords });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.includes("provider_resolution_failures:100"));
    assert.ok(validation.errors.some((error) => error.startsWith("insufficient_terminal_coverage:")));
  });

  it("accepts a well-covered candidate while proving model scores were preserved", () => {
    const beforeRecords = Array.from({ length: 100 }, (_, index) => ({
      ...validRecord,
      playerId: index + 1,
      gameId: 900000 + index,
      result: { status: "unresolved" },
    }));
    const afterRecords = beforeRecords.map((record, index) => ({
      ...record,
      result: { status: index < 5 ? "hit" : "miss" },
    }));
    const validation = validateRegradedArchive(afterRecords, { beforeRecords });
    assert.equal(validation.valid, true);
    assert.equal(validation.resolvedRetryableCount, 100);
    assert.equal(validation.modelMutationCount, 0);

    afterRecords[0].hrQualityScore = 99;
    const mutated = validateRegradedArchive(afterRecords, { beforeRecords });
    assert.ok(mutated.errors.includes("model_score_mutations:1"));
  });
});
