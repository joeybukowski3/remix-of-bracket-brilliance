/**
 * mlb-ml-grading.test.mjs
 * Deterministic tests for the pure Moneyline grading + CLV logic.
 * No live API calls. Run via: node --test scripts/lib/mlb-ml-grading.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RESULT_STATUSES,
  classifyGameState,
  extractFinalScore,
  computeSportsbookClv,
  findFinalPregameSnapshot,
  computePolymarketClv,
  gradePrediction,
  isGradeable,
  isRegradeIdempotent,
} from "./mlb-ml-grading.mjs";

function makeRecord(overrides = {}) {
  return {
    date: "2026-06-30",
    gameId: 555,
    gameKey: "NYY@BOS",
    pick: "away",
    pickAbbr: "NYY",
    priceAtPick: { american: "-135", implied: 0.574, capturedAt: "2026-06-30T09:00:00.000Z" },
    latestPriceSeen: { american: "-150", implied: 0.6, capturedAt: "2026-06-30T17:00:00.000Z" },
    polymarketAtPick: { yesPrice: 0.56, capturedAt: "2026-06-30T05:00:00.000Z" },
    result: { status: "pending", actualWinnerAbbr: null, finalScore: null, gameFinalStatus: null, closingLine: null, clv: null, gradedAt: null },
    ...overrides,
  };
}

function makeGame(overrides = {}) {
  return {
    gamePk: 555,
    gameDate: "2026-06-30T23:05:00Z",
    status: { abstractGameState: "Final", detailedState: "Final" },
    teams: {
      away: { team: { abbreviation: "NYY" }, score: 5 },
      home: { team: { abbreviation: "BOS" }, score: 3 },
    },
    ...overrides,
  };
}

function makePmGame(overrides = {}) {
  return {
    gameId: "10078575",
    awayAbbr: "NYY",
    homeAbbr: "BOS",
    gameTime: "2026-06-30T23:05:00Z",
    snapshots: [
      { time: "2026-06-30T05:00:00.000Z", awayPrice: 0.56, homePrice: 0.44 },
      { time: "2026-06-30T13:00:00.000Z", awayPrice: 0.58, homePrice: 0.42 },
      { time: "2026-06-30T22:00:00.000Z", awayPrice: 0.62, homePrice: 0.38 }, // last pregame
      { time: "2026-07-01T01:00:00.000Z", awayPrice: 0.99, homePrice: 0.01 }, // AFTER first pitch -- must be excluded
    ],
    ...overrides,
  };
}

// ── Result statuses ─────────────────────────────────────────────────────────

describe("RESULT_STATUSES", () => {
  it("includes exactly the documented statuses", () => {
    assert.deepEqual(RESULT_STATUSES, ["pending", "win", "loss", "push", "postponed", "cancelled", "unresolved"]);
  });
});

// ── classifyGameState ───────────────────────────────────────────────────────

describe("classifyGameState", () => {
  it("classifies Postponed", () => {
    assert.equal(classifyGameState({ status: { detailedState: "Postponed" } }), "postponed");
  });
  it("classifies Cancelled", () => {
    assert.equal(classifyGameState({ status: { detailedState: "Cancelled" } }), "cancelled");
  });
  it("classifies Final", () => {
    assert.equal(classifyGameState({ status: { abstractGameState: "Final" } }), "final");
  });
  it("classifies Live as in_progress", () => {
    assert.equal(classifyGameState({ status: { abstractGameState: "Live" } }), "in_progress");
  });
  it("defaults to scheduled", () => {
    assert.equal(classifyGameState({ status: { abstractGameState: "Preview" } }), "scheduled");
  });
  it("handles missing game gracefully", () => {
    assert.equal(classifyGameState(null), "scheduled");
  });
});

// ── extractFinalScore ───────────────────────────────────────────────────────

describe("extractFinalScore", () => {
  it("extracts a valid final score", () => {
    const score = extractFinalScore(makeGame());
    assert.deepEqual(score, { awayAbbr: "NYY", homeAbbr: "BOS", awayScore: 5, homeScore: 3 });
  });
  it("returns null when a score is missing", () => {
    const game = makeGame();
    delete game.teams.home.score;
    assert.equal(extractFinalScore(game), null);
  });
  it("returns null when a team abbreviation is missing", () => {
    const game = makeGame();
    delete game.teams.away.team.abbreviation;
    assert.equal(extractFinalScore(game), null);
  });
  it("returns null for a null game", () => {
    assert.equal(extractFinalScore(null), null);
  });
});

// ── computeSportsbookClv ────────────────────────────────────────────────────

describe("computeSportsbookClv", () => {
  it("computes a positive delta (beat close) when implied probability rose", () => {
    const clv = computeSportsbookClv({ implied: 0.55 }, { implied: 0.6 });
    assert.equal(clv.impliedProbabilityDelta, 0.05);
    assert.equal(clv.beatClose, true);
  });
  it("computes a negative delta (did not beat close) when implied probability fell", () => {
    const clv = computeSportsbookClv({ implied: 0.6 }, { implied: 0.55 });
    assert.equal(clv.impliedProbabilityDelta, -0.05);
    assert.equal(clv.beatClose, false);
  });
  it("documents the proxy limitation in methodNote", () => {
    const clv = computeSportsbookClv({ implied: 0.55 }, { implied: 0.6 });
    assert.ok(clv.methodNote.toLowerCase().includes("proxy"));
    assert.ok(clv.methodNote.toLowerCase().includes("not a verified"));
  });
  it("returns null when priceAtPick is missing", () => {
    assert.equal(computeSportsbookClv(null, { implied: 0.6 }), null);
  });
  it("returns null when latestPriceSeen is missing", () => {
    assert.equal(computeSportsbookClv({ implied: 0.55 }, null), null);
  });
  it("returns null when implied is null on either side", () => {
    assert.equal(computeSportsbookClv({ implied: null }, { implied: 0.6 }), null);
  });
});

// ── findFinalPregameSnapshot ─────────────────────────────────────────────────

describe("findFinalPregameSnapshot", () => {
  it("returns the latest snapshot at or before the cutoff, excluding postgame snapshots", () => {
    const pmGame = makePmGame();
    const snap = findFinalPregameSnapshot(pmGame, "2026-06-30T23:05:00Z");
    assert.equal(snap.time, "2026-06-30T22:00:00.000Z");
    assert.equal(snap.awayPrice, 0.62);
  });
  it("returns null when there is no eligible snapshot before the cutoff", () => {
    const pmGame = makePmGame({ snapshots: [{ time: "2026-07-01T01:00:00.000Z", awayPrice: 0.9, homePrice: 0.1 }] });
    assert.equal(findFinalPregameSnapshot(pmGame, "2026-06-30T23:05:00Z"), null);
  });
  it("returns null for a missing pmGame", () => {
    assert.equal(findFinalPregameSnapshot(null, "2026-06-30T23:05:00Z"), null);
  });
  it("returns null for a missing cutoff", () => {
    assert.equal(findFinalPregameSnapshot(makePmGame(), null), null);
  });
  it("ignores snapshot entries with unparseable timestamps", () => {
    const pmGame = makePmGame({ snapshots: [{ time: "not-a-date", awayPrice: 0.99, homePrice: 0.01 }, { time: "2026-06-30T05:00:00.000Z", awayPrice: 0.56, homePrice: 0.44 }] });
    const snap = findFinalPregameSnapshot(pmGame, "2026-06-30T23:05:00Z");
    assert.equal(snap.time, "2026-06-30T05:00:00.000Z");
  });
});

// ── computePolymarketClv ────────────────────────────────────────────────────

describe("computePolymarketClv", () => {
  it("computes CLV for the away side", () => {
    const finalSnap = { time: "2026-06-30T22:00:00.000Z", awayPrice: 0.62, homePrice: 0.38 };
    const clv = computePolymarketClv(true, { yesPrice: 0.56 }, finalSnap);
    assert.equal(clv.priceDelta, round4(0.62 - 0.56));
    assert.equal(clv.beatClose, true);
    assert.equal(clv.closeSnapshotTime, "2026-06-30T22:00:00.000Z");
  });
  it("computes CLV for the home side", () => {
    const finalSnap = { time: "2026-06-30T22:00:00.000Z", awayPrice: 0.62, homePrice: 0.38 };
    const clv = computePolymarketClv(false, { yesPrice: 0.44 }, finalSnap);
    assert.equal(clv.priceDelta, round4(0.38 - 0.44));
    assert.equal(clv.beatClose, false);
  });
  it("returns null when there is no final pregame snapshot", () => {
    assert.equal(computePolymarketClv(true, { yesPrice: 0.56 }, null), null);
  });
  it("returns null when polymarketAtPick is missing", () => {
    assert.equal(computePolymarketClv(true, null, { awayPrice: 0.6, homePrice: 0.4 }), null);
  });
  function round4(n) { return Math.round(n * 10000) / 10000; }
});

// ── gradePrediction ──────────────────────────────────────────────────────────

describe("gradePrediction", () => {
  it("grades pending for a scheduled game", () => {
    const result = gradePrediction(makeRecord(), { gameState: "scheduled", game: null, pmGame: null });
    assert.equal(result.status, "pending");
    assert.equal(result.gradedAt, null);
  });

  it("grades postponed", () => {
    const result = gradePrediction(makeRecord(), { gameState: "postponed", game: null, pmGame: null });
    assert.equal(result.status, "postponed");
    assert.equal(result.gameFinalStatus, "Postponed");
    assert.equal(result.clv, null);
  });

  it("grades cancelled", () => {
    const result = gradePrediction(makeRecord(), { gameState: "cancelled", game: null, pmGame: null });
    assert.equal(result.status, "cancelled");
    assert.equal(result.clv, null);
  });

  it("grades a win when the picked team's abbreviation matches the winner", () => {
    const record = makeRecord({ pick: "away", pickAbbr: "NYY" });
    const result = gradePrediction(record, { gameState: "final", game: makeGame(), pmGame: makePmGame() });
    assert.equal(result.status, "win");
    assert.equal(result.actualWinnerAbbr, "NYY");
    assert.deepEqual(result.finalScore, { awayAbbr: "NYY", homeAbbr: "BOS", awayScore: 5, homeScore: 3 });
  });

  it("grades a loss when the picked team did not win", () => {
    const record = makeRecord({ pick: "home", pickAbbr: "BOS" });
    const result = gradePrediction(record, { gameState: "final", game: makeGame(), pmGame: makePmGame() });
    assert.equal(result.status, "loss");
    assert.equal(result.actualWinnerAbbr, "NYY");
  });

  it("grades a push when the final score is level", () => {
    const game = makeGame({ teams: { away: { team: { abbreviation: "NYY" }, score: 4 }, home: { team: { abbreviation: "BOS" }, score: 4 } } });
    const result = gradePrediction(makeRecord(), { gameState: "final", game, pmGame: makePmGame() });
    assert.equal(result.status, "push");
    assert.equal(result.actualWinnerAbbr, null);
  });

  it("grades unresolved when final but score data is missing", () => {
    const game = makeGame();
    delete game.teams.home.score;
    const result = gradePrediction(makeRecord(), { gameState: "final", game, pmGame: makePmGame() });
    assert.equal(result.status, "unresolved");
    assert.equal(result.clv, null);
  });

  it("attaches sportsbook and Polymarket CLV on a graded (non-pending, non-postponed/cancelled) result", () => {
    const result = gradePrediction(makeRecord(), { gameState: "final", game: makeGame(), pmGame: makePmGame() });
    assert.ok(result.clv.sportsbook);
    assert.equal(result.clv.sportsbook.impliedProbabilityDelta, round4(0.6 - 0.574));
    assert.ok(result.clv.polymarket);
    assert.equal(result.clv.polymarket.priceAtClose, 0.62);
    assert.deepEqual(result.closingLine.sportsbook, makeRecord().latestPriceSeen);
    assert.equal(result.closingLine.polymarket.awayPrice, 0.62);
  });

  it("still grades win/loss correctly even when CLV inputs are entirely missing", () => {
    const record = makeRecord({ priceAtPick: null, latestPriceSeen: null, polymarketAtPick: null });
    const result = gradePrediction(record, { gameState: "final", game: makeGame(), pmGame: null });
    assert.equal(result.status, "win");
    assert.equal(result.clv.sportsbook, null);
    assert.equal(result.clv.polymarket, null);
  });

  function round4(n) { return Math.round(n * 10000) / 10000; }
});

// ── isGradeable / isRegradeIdempotent ───────────────────────────────────────

describe("isGradeable", () => {
  it("is true only for pending records", () => {
    assert.equal(isGradeable(makeRecord()), true);
    assert.equal(isGradeable(makeRecord({ result: { status: "win" } })), false);
    assert.equal(isGradeable(null), false);
  });
});

describe("isRegradeIdempotent", () => {
  it("regrading a completed game produces the same status and winner", () => {
    const gameSummary = { gameState: "final", game: makeGame(), pmGame: makePmGame() };
    const graded = { ...makeRecord(), result: gradePrediction(makeRecord(), gameSummary) };
    assert.equal(isRegradeIdempotent(graded, gameSummary), true);
  });

  it("a pending record is trivially idempotent", () => {
    assert.equal(isRegradeIdempotent(makeRecord(), { gameState: "scheduled", game: null, pmGame: null }), true);
  });
});
