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
    week: null,
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
    teamPriorSeasonPlayoffStatus: null,
    teamPriorSeasonRecordRole: null,
    opponentPreviousResult: null,
    opponentPreviousTeamSpread: null,
    ...overrides,
  };
}

test("evaluates every locked Phase 1, Phase 2B, and Phase 2C broad trend", () => {
  assert.equal(CURRENT_TREND_IDS.length, 55);
  assert.equal(new Set(CURRENT_TREND_IDS).size, 55);
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
  assert.equal(evaluations.length, 110);
  const travel = evaluations.find((value) => value.team === "sea" && value.trendId === "west-to-east-early");
  assert.equal(travel?.status, QUALIFICATION_STATUS.confirmed);
});

test("Phase 2C gates every Week 1 definition to Week 1 games only", () => {
  assert.equal(evaluateCurrentTrend(row({ week: 2 }), "week1-home-favorites").status, QUALIFICATION_STATUS.notApplicable);
  assert.equal(evaluateCurrentTrend(row({ week: null }), "week1-home-favorites").status, QUALIFICATION_STATUS.notApplicable);
  const confirmedCase = evaluateCurrentTrend(row({ week: 1, venue: "home", teamSpread: -3 }), "week1-home-favorites");
  assert.equal(confirmedCase.status, QUALIFICATION_STATUS.confirmed);
});

test("Phase 2C never qualifies Week 3+ games for Week 1 or Week 2 definitions", () => {
  assert.equal(evaluateCurrentTrend(row({ week: 3, venue: "home", teamSpread: -3 }), "week1-home-favorites").status, QUALIFICATION_STATUS.notApplicable);
  assert.equal(evaluateCurrentTrend(row({
    week: 3,
    previousGame: { gameId: "previous", week: 2 },
    previousResult: { teamScore: 20, opponentScore: 10, pointMargin: 10, overtime: false },
  }), "week2-after-0-1-start").status, QUALIFICATION_STATUS.notApplicable);
});

test("Phase 2C classifies Week 1 favorite/underdog role and requires a current market spread", () => {
  assert.equal(evaluateCurrentTrend(row({ week: 1, venue: "home", teamSpread: null }), "week1-home-favorites").status, QUALIFICATION_STATUS.awaitingMarket);
  assert.equal(evaluateCurrentTrend(row({ week: 1, venue: "home", teamSpread: 3 }), "week1-home-favorites").status, QUALIFICATION_STATUS.notApplicable);
  const dog = evaluateCurrentTrend(row({ week: 1, venue: "home", teamSpread: 3 }), "week1-home-underdogs");
  assert.equal(dog.status, QUALIFICATION_STATUS.confirmed);
  assert.deepEqual(dog.variantIds, ["dog-0.5-to-3"]);
});

test("Phase 2C requires the prior Week 1 result before evaluating Week 2 bounce-back definitions", () => {
  const missingPrevious = evaluateCurrentTrend(row({ week: 2, previousGame: null }), "week2-after-0-1-start");
  assert.equal(missingPrevious.status, QUALIFICATION_STATUS.notApplicable);
  const awaitingResult = evaluateCurrentTrend(row({ week: 2, previousGame: { gameId: "previous", week: 1 }, previousResult: null }), "week2-after-0-1-start");
  assert.equal(awaitingResult.status, QUALIFICATION_STATUS.awaitingPriorResult);
});

test("Phase 2C classifies the Week 2 0-1/1-0 state from the Week 1 SU result", () => {
  const oneOh = evaluateCurrentTrend(row({
    week: 2,
    venue: "home",
    previousGame: { gameId: "previous", week: 1 },
    previousResult: { teamScore: 24, opponentScore: 17, pointMargin: 7, overtime: false },
  }), "week2-after-1-0-start");
  assert.equal(oneOh.status, QUALIFICATION_STATUS.confirmed);
  assert.deepEqual(oneOh.variantIds, ["current-home"]);

  const ohOne = evaluateCurrentTrend(row({
    week: 2,
    venue: "away",
    previousGame: { gameId: "previous", week: 1 },
    previousResult: { teamScore: 10, opponentScore: 24, pointMargin: -14, overtime: false },
  }), "week2-after-0-1-start");
  assert.equal(ohOne.status, QUALIFICATION_STATUS.confirmed);
  assert.deepEqual(ohOne.variantIds, ["current-road"]);
});

test("Phase 2C confirms the home team after an ATS loss as a Week 1 favorite, and never infers ATS without a valid spread", () => {
  const awaitingMarket = evaluateCurrentTrend(row({
    week: 2,
    venue: "home",
    previousGame: { gameId: "previous", week: 1 },
    previousTeamSpread: null,
    previousResult: { teamScore: 17, opponentScore: 20, pointMargin: -3, overtime: false },
  }), "week2-home-favorite-after-week1-ats-loss");
  assert.equal(awaitingMarket.status, QUALIFICATION_STATUS.awaitingMarket);

  const confirmedCase = evaluateCurrentTrend(row({
    week: 2,
    venue: "home",
    teamSpread: -2.5,
    previousGame: { gameId: "previous", week: 1 },
    previousTeamSpread: -7,
    previousResult: { teamScore: 17, opponentScore: 20, pointMargin: -3, overtime: false },
  }), "week2-home-favorite-after-week1-ats-loss");
  assert.equal(confirmedCase.status, QUALIFICATION_STATUS.confirmed);
  assert.deepEqual(confirmedCase.variantIds, ["current-favorite"]);

  const notFavorite = evaluateCurrentTrend(row({
    week: 2,
    venue: "home",
    previousGame: { gameId: "previous", week: 1 },
    previousTeamSpread: 3,
    previousResult: { teamScore: 17, opponentScore: 20, pointMargin: -3, overtime: false },
  }), "week2-home-favorite-after-week1-ats-loss");
  assert.equal(notFavorite.status, QUALIFICATION_STATUS.notApplicable);
});

test("Phase 2C reports Week 1 prior-season playoff/record status as unavailable rather than guessing", () => {
  assert.equal(evaluateCurrentTrend(row({ week: 1, teamPriorSeasonPlayoffStatus: null }), "week1-prior-season-playoff-team").status, QUALIFICATION_STATUS.unavailable);
  const confirmedPlayoff = evaluateCurrentTrend(row({ week: 1, venue: "home", teamSpread: -3, teamPriorSeasonPlayoffStatus: "playoff" }), "week1-prior-season-playoff-team");
  assert.equal(confirmedPlayoff.status, QUALIFICATION_STATUS.confirmed);
  assert.equal(evaluateCurrentTrend(row({ week: 1, teamPriorSeasonRecordRole: null }), "week1-prior-season-winning-vs-losing").status, QUALIFICATION_STATUS.unavailable);
  const losing = evaluateCurrentTrend(row({ week: 1, teamPriorSeasonRecordRole: "losing" }), "week1-prior-season-winning-vs-losing");
  assert.equal(losing.status, QUALIFICATION_STATUS.confirmed);
  assert.deepEqual(losing.variantIds, ["losing-team"]);
});

test("Phase 2C 0-1-vs-1-0 opponent matchups await the opponent's Week 1 result instead of guessing it", () => {
  const pending = evaluateCurrentTrend(row({
    week: 2,
    previousGame: { gameId: "previous", week: 1 },
    previousResult: { teamScore: 10, opponentScore: 24, pointMargin: -14, overtime: false },
    opponentPreviousResult: null,
  }), "week2-0-1-vs-1-0-opponent");
  assert.equal(pending.status, QUALIFICATION_STATUS.awaitingPriorResult);

  const confirmedMatchup = evaluateCurrentTrend(row({
    week: 2,
    venue: "away",
    previousGame: { gameId: "previous", week: 1 },
    previousResult: { teamScore: 10, opponentScore: 24, pointMargin: -14, overtime: false },
    opponentPreviousResult: { teamScore: 21, opponentScore: 14, pointMargin: 7, overtime: false },
  }), "week2-0-1-vs-1-0-opponent");
  assert.equal(confirmedMatchup.status, QUALIFICATION_STATUS.confirmed);
});
