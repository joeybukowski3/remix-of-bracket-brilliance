import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_TREND_IDS,
  QUALIFICATION_STATUS,
  buildCurrentTrendEvaluations,
  evaluateCurrentTrend,
} from "./nfl-situational-trend-current-core.mjs";

function row(overrides = {}) {
  return {
    season: 2026,
    team: "sea",
    opponent: "nyg",
    venue: "away",
    kickoffUtc: "2026-10-04T17:00:00.000Z",
    teamSpread: null,
    previousTeamSpread: null,
    game: { gameId: "2026_05_SEA_NYG", kickoffUtc: "2026-10-04T17:00:00.000Z" },
    previousGame: null,
    nextGame: null,
    previousResult: null,
    firstMeetingResult: null,
    currentMajorOpponent: false,
    previousMajorOpponent: false,
    nextMajorOpponent: false,
    previousPrimeTime: false,
    divisional: false,
    restDays: null,
    opponentRestDays: null,
    restDifferential: null,
    postBye: false,
    preBye: false,
    roadSequence: 1,
    divisionalMeetingNumber: null,
    ...overrides,
  };
}

test("evaluates every locked Phase 1 and Phase 2B broad trend", () => {
  assert.equal(CURRENT_TREND_IDS.length, 24);
  assert.equal(new Set(CURRENT_TREND_IDS).size, 24);
});

test("confirms schedule-only travel and bye qualifiers before a market exists", () => {
  const travel = evaluateCurrentTrend(row(), "west-to-east-early");
  assert.equal(travel.status, QUALIFICATION_STATUS.confirmed);
  assert.match(travel.reason, /Pacific-origin team/);

  const preBye = evaluateCurrentTrend(row({
    nextGame: { gameId: "next", kickoffUtc: "2026-10-18T17:00:00.000Z" },
    preBye: true,
  }), "pre-bye");
  assert.equal(preBye.status, QUALIFICATION_STATUS.confirmed);
});

test("attributes market qualifiers and predefined variants to the qualifying team", () => {
  const result = evaluateCurrentTrend(row({ teamSpread: -4.5 }), "road-favorites");
  assert.deepEqual(result, {
    status: QUALIFICATION_STATUS.confirmed,
    reason: "Road team listed at -4.5.",
    variantIds: ["favorite-3.5-to-6.5"],
  });

  const blowout = evaluateCurrentTrend(row({
    previousGame: { gameId: "previous", kickoffUtc: "2026-09-27T17:00:00.000Z" },
    previousResult: { teamScore: 31, opponentScore: 10, pointMargin: 21, overtime: false },
  }), "after-blowout-win");
  assert.deepEqual(blowout.variantIds, ["after-win-14-plus", "after-win-17-plus", "after-win-20-plus"]);

  const upset = evaluateCurrentTrend(row({
    previousGame: { gameId: "previous" },
    previousTeamSpread: 4.5,
    previousResult: { teamScore: 24, opponentScore: 20, pointMargin: 4, overtime: false },
  }), "after-outright-upset-win");
  assert.deepEqual(upset.variantIds, ["prior-dog-3.5-to-6.5"]);
});

test("returns explicit pending and unavailable states instead of guessing", () => {
  assert.equal(evaluateCurrentTrend(row(), "home-underdogs").status, QUALIFICATION_STATUS.notApplicable);
  assert.equal(evaluateCurrentTrend(row({ venue: "home" }), "home-underdogs").status, QUALIFICATION_STATUS.awaitingMarket);
  assert.equal(evaluateCurrentTrend(row({ previousGame: { gameId: "previous" } }), "after-scoring-40-plus").status, QUALIFICATION_STATUS.awaitingPriorResult);
  assert.equal(evaluateCurrentTrend(row({
    previousGame: { gameId: "previous" },
    previousResult: { teamScore: 24, opponentScore: 21, pointMargin: 3, overtime: null },
  }), "coming-off-overtime").status, QUALIFICATION_STATUS.unavailable);
  assert.equal(evaluateCurrentTrend(row(), "not-a-trend").status, QUALIFICATION_STATUS.unavailable);
});

test("builds both team attributions for a game while preserving schedule-known qualifiers", () => {
  const games = [{
    season: 2026,
    seasonType: "REG",
    gameId: "2026_01_SEA_NYG",
    homeAbbr: "nyg",
    awayAbbr: "sea",
    dateUtc: "2026-09-13T17:00:00.000Z",
    neutralSite: false,
  }];
  const evaluations = buildCurrentTrendEvaluations({
    season: 2026,
    games,
    results: [],
    teams: [
      { abbr: "sea", division: "NFC West" },
      { abbr: "nyg", division: "NFC East" },
    ],
    currentMarket: {},
  });
  assert.deepEqual(new Set(evaluations.map((value) => value.team)), new Set(["sea", "nyg"]));
  assert.equal(evaluations.length, 48);
  const travel = evaluations.find((value) => value.team === "sea" && value.trendId === "west-to-east-early");
  assert.equal(travel?.status, QUALIFICATION_STATUS.confirmed);
});
