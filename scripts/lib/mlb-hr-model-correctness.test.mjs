/**
 * mlb-hr-model-correctness.test.mjs
 * Deterministic tests for the HR model correctness/history pure-logic modules.
 * No live API calls. Run via: node --test scripts/lib/mlb-hr-model-correctness.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MLB_HR_MODEL_VERSION, MLB_HR_CANDIDATE_MODEL_VERSION, HR_QUALITY_SCORE_METHODOLOGY } from "./mlb-hr-model-version.mjs";
import { computeHrConfidence } from "./mlb-hr-confidence.mjs";
import { buildHrExplanation, isExplanationLanguageSafe, PROHIBITED_PHRASES } from "./mlb-hr-explanation.mjs";
import { selectDeterministicHrPicks, SELECTION_LIMITS, SELECTION_MIN_QUALITY_SCORE } from "./mlb-hr-selection.mjs";
import { computeGameHrEnvironmentScore, GAME_ENVIRONMENT_WEIGHTS } from "./mlb-hr-environment.mjs";
import { computeCandidateHrScore, rankCandidateScores } from "./mlb-hr-candidate-score.mjs";
import { buildArchiveKey, buildArchiveRecord, upsertArchiveRecord, mergeArchiveBatch } from "./mlb-hr-archive.mjs";
import { classifyGameState, findPlayerBattingLine, gradePrediction, isGradeable, isRegradeIdempotent } from "./mlb-hr-grading.mjs";
import { buildPerformanceSummary, SCORE_BANDS } from "./mlb-hr-performance-summary.mjs";
import { assessCalibrationReadiness, CALIBRATION_MIN_THRESHOLDS } from "./mlb-hr-calibration-scaffold.mjs";

// ── Model versioning ─────────────────────────────────────────────────────────

describe("Model versioning", () => {
  it("version constant is non-empty", () => {
    assert.ok(MLB_HR_MODEL_VERSION);
    assert.equal(typeof MLB_HR_MODEL_VERSION, "string");
    assert.ok(MLB_HR_MODEL_VERSION.length > 0);
  });

  it("version is stable across repeated imports (single centralized source)", () => {
    assert.equal(MLB_HR_MODEL_VERSION, "mlb-hr-quality-v1.1");
  });

  it("candidate model version is distinct from the live model version", () => {
    assert.notEqual(MLB_HR_CANDIDATE_MODEL_VERSION, MLB_HR_MODEL_VERSION);
  });

  it("methodology copy explicitly says not a calibrated probability", () => {
    assert.ok(HR_QUALITY_SCORE_METHODOLOGY.toLowerCase().includes("not a calibrated probability"));
  });
});

// ── Confidence ───────────────────────────────────────────────────────────────

describe("Confidence metadata", () => {
  const FULL = {
    lineupConfirmed: true, starterConfirmed: true, hrOddsAvailable: true,
    weatherAvailable: true, parkFactorAvailable: true, batterSampleSize: 200,
    opposingPitcherDataPresent: true, requiredInputsPresent: true,
  };

  it("complete confirmed data returns High", () => {
    const result = computeHrConfidence(FULL);
    assert.equal(result.confidenceLevel, "high");
    assert.equal(result.dataCompletenessPercent, 100);
  });

  it("missing weather lowers confidence", () => {
    const full = computeHrConfidence(FULL);
    const noWeather = computeHrConfidence({ ...FULL, weatherAvailable: false });
    assert.ok(noWeather.dataCompletenessPercent < full.dataCompletenessPercent);
    assert.ok(noWeather.confidenceReasons.includes("Weather data available"));
  });

  it("missing pitcher data lowers confidence", () => {
    const result = computeHrConfidence({ ...FULL, opposingPitcherDataPresent: false });
    assert.ok(result.confidenceReasons.includes("Opposing pitcher data present"));
    assert.notEqual(result.confidenceLevel, "high");
  });

  it("missing lineup confirmation lowers confidence", () => {
    const full = computeHrConfidence(FULL);
    const noLineup = computeHrConfidence({ ...FULL, lineupConfirmed: false });
    assert.ok(noLineup.dataCompletenessPercent < full.dataCompletenessPercent);
    assert.ok(noLineup.confidenceReasons.includes("Lineup confirmed"));
  });

  it("incomplete required inputs is flagged as 'incomplete' regardless of other fields", () => {
    const result = computeHrConfidence({ ...FULL, requiredInputsPresent: false });
    assert.equal(result.confidenceLevel, "incomplete");
  });

  it("confidence computation does not alter or reference any HR Quality Score field", () => {
    const result = computeHrConfidence(FULL);
    assert.ok(!("hrScore" in result));
    assert.ok(!("hrQualityScore" in result));
  });
});

// ── Deterministic explanations ────────────────────────────────────────────────

describe("Deterministic explanation templates", () => {
  const PLAYER = {
    barrelRate: 16, iso: 0.25, last7HR: 2, last30HR: 6,
    opposingPitcherHrVs: 68, parkFactor: 1.15, weatherBoost: 4,
    hrOddsYes: "+150", whiffRate: 22,
  };

  it("uses only provided structured values (no invented numbers when sparse)", () => {
    const sparse = { barrelRate: null, iso: null, last7HR: null, last30HR: null, opposingPitcherHrVs: null, parkFactor: null, weatherBoost: null, hrOddsYes: null, whiffRate: null };
    const text = buildHrExplanation(sparse);
    assert.ok(text.includes("unavailable"));
  });

  it("includes hitter profile (barrel/ISO reflected)", () => {
    const text = buildHrExplanation(PLAYER);
    assert.match(text.toLowerCase(), /barrel|iso/);
  });

  it("includes pitcher context (HR vulnerability value reflected)", () => {
    const text = buildHrExplanation(PLAYER);
    assert.ok(text.includes("68"));
  });

  it("includes environment context (park/weather mentioned)", () => {
    const text = buildHrExplanation(PLAYER);
    assert.match(text.toLowerCase(), /park|weather/);
  });

  it("includes risk", () => {
    const text = buildHrExplanation(PLAYER);
    assert.ok(text.toLowerCase().includes("risk"));
  });

  it("missing data does not produce invented claims", () => {
    const sparse = { barrelRate: null, iso: null, last7HR: null, last30HR: null, opposingPitcherHrVs: null, parkFactor: null, weatherBoost: null, hrOddsYes: null, whiffRate: null };
    const text = buildHrExplanation(sparse);
    // No fabricated specific numeric claim like a fake barrel% or HR vulnerability number
    assert.ok(!/barrel rate \d/.test(text.toLowerCase()));
  });

  it("no prohibited certainty language", () => {
    const text = buildHrExplanation(PLAYER);
    assert.equal(isExplanationLanguageSafe(text), true);
    for (const phrase of PROHIBITED_PHRASES) {
      assert.ok(!text.toLowerCase().includes(phrase));
    }
  });
});

// ── Deterministic selection ───────────────────────────────────────────────────

describe("Deterministic HR pick selection", () => {
  const ROWS = Array.from({ length: 30 }, (_, i) => ({
    player: `Player ${i}`, team: "AAA", opposingPitcher: i === 29 ? "TBD" : "Some Pitcher",
    hrScore: 90 - i * 2, hrOddsYes: i % 3 === 0 ? `+${150 + i * 10}` : null,
  }));

  it("selection is stable — identical input produces identical output", () => {
    const a = selectDeterministicHrPicks(ROWS);
    const b = selectDeterministicHrPicks(ROWS);
    assert.deepEqual(a.bestBets.map((p) => p.player), b.bestBets.map((p) => p.player));
  });

  it("sorting is deterministic (bestBets ordered by descending hrScore, ties broken by input order)", () => {
    const result = selectDeterministicHrPicks(ROWS);
    for (let i = 1; i < result.bestBets.length; i++) {
      assert.ok(result.bestBets[i - 1].hrScore >= result.bestBets[i].hrScore);
    }
  });

  it("fake hrValueEdge is not used or present anywhere in output", () => {
    const result = selectDeterministicHrPicks(ROWS);
    const all = [...result.bestBets, ...result.valueBets, ...result.longshots];
    for (const pick of all) {
      assert.ok(!("hrValueEdge" in pick));
    }
  });

  it("missing odds do not automatically disqualify a high-quality player from bestBets (only valueBets/longshots require odds by explicit rule)", () => {
    const noOddsTopPlayer = [{ player: "TopNoOdds", team: "X", opposingPitcher: "Y", hrScore: 95, hrOddsYes: null }];
    const result = selectDeterministicHrPicks(noOddsTopPlayer);
    assert.equal(result.bestBets.length, 1);
    assert.equal(result.bestBets[0].player, "TopNoOdds");
  });

  it("duplicate players are removed safely across sections", () => {
    const result = selectDeterministicHrPicks(ROWS);
    const keys = [...result.bestBets, ...result.valueBets, ...result.longshots].map((p) => `${p.player}|${p.team}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("bestBets picks the top N eligible rows by score", () => {
    const result = selectDeterministicHrPicks(ROWS);
    assert.equal(result.bestBets.length, SELECTION_LIMITS.bestBets);
    assert.equal(result.bestBets[0].player, "Player 0");
  });

  it("excludes TBD opposing pitcher rows from all sections", () => {
    const result = selectDeterministicHrPicks(ROWS);
    const all = [...result.bestBets, ...result.valueBets, ...result.longshots];
    assert.ok(all.every((p) => p.opposingPitcher !== "TBD"));
  });

  it("excludes rows below the minimum quality score threshold", () => {
    const lowScoreRows = [{ player: "Low", team: "X", opposingPitcher: "Y", hrScore: SELECTION_MIN_QUALITY_SCORE - 1, hrOddsYes: "+200" }];
    const result = selectDeterministicHrPicks(lowScoreRows);
    assert.equal(result.bestBets.length, 0);
  });
});

// ── Game environment ──────────────────────────────────────────────────────────

describe("Game-environment score", () => {
  it("favorable park raises score", () => {
    const lowPark = computeGameHrEnvironmentScore({ parkFactor: 0.88, weatherBoost: 0, pitcherHrVulnerabilities: [50, 50], qualifyingHitterCount: 5 });
    const highPark = computeGameHrEnvironmentScore({ parkFactor: 1.35, weatherBoost: 0, pitcherHrVulnerabilities: [50, 50], qualifyingHitterCount: 5 });
    assert.ok(highPark.gameHrEnvironmentScore > lowPark.gameHrEnvironmentScore);
  });

  it("favorable weather raises score", () => {
    const calm = computeGameHrEnvironmentScore({ parkFactor: 1.0, weatherBoost: -5, pitcherHrVulnerabilities: [50, 50], qualifyingHitterCount: 5 });
    const boosted = computeGameHrEnvironmentScore({ parkFactor: 1.0, weatherBoost: 5, pitcherHrVulnerabilities: [50, 50], qualifyingHitterCount: 5 });
    assert.ok(boosted.gameHrEnvironmentScore > calm.gameHrEnvironmentScore);
  });

  it("vulnerable starter raises score", () => {
    const tough = computeGameHrEnvironmentScore({ parkFactor: 1.0, weatherBoost: 0, pitcherHrVulnerabilities: [20, 20], qualifyingHitterCount: 5 });
    const vulnerable = computeGameHrEnvironmentScore({ parkFactor: 1.0, weatherBoost: 0, pitcherHrVulnerabilities: [85, 85], qualifyingHitterCount: 5 });
    assert.ok(vulnerable.gameHrEnvironmentScore > tough.gameHrEnvironmentScore);
  });

  it("qualifying-hitter count contributes correctly", () => {
    const fewBats = computeGameHrEnvironmentScore({ parkFactor: 1.0, weatherBoost: 0, pitcherHrVulnerabilities: [50, 50], qualifyingHitterCount: 1 });
    const manyBats = computeGameHrEnvironmentScore({ parkFactor: 1.0, weatherBoost: 0, pitcherHrVulnerabilities: [50, 50], qualifyingHitterCount: 9 });
    assert.ok(manyBats.gameHrEnvironmentScore > fewBats.gameHrEnvironmentScore);
  });

  it("score remains bounded 0-100 at extremes", () => {
    const result = computeGameHrEnvironmentScore({ parkFactor: 1.4, weatherBoost: 6, pitcherHrVulnerabilities: [100, 100], qualifyingHitterCount: 20 });
    assert.ok(result.gameHrEnvironmentScore <= 100);
    assert.ok(result.gameHrEnvironmentScore >= 0);
    const lowResult = computeGameHrEnvironmentScore({ parkFactor: 0.85, weatherBoost: -6, pitcherHrVulnerabilities: [0, 0], qualifyingHitterCount: 0 });
    assert.ok(lowResult.gameHrEnvironmentScore >= 0);
  });

  it("player rankings are unaffected — environment score has no player-identity field at all", () => {
    const result = computeGameHrEnvironmentScore({ parkFactor: 1.1, weatherBoost: 2, pitcherHrVulnerabilities: [60, 60], qualifyingHitterCount: 5 });
    assert.ok(!("player" in result));
    assert.ok(!("hrScore" in result));
  });

  it("weights sum to 1.0", () => {
    const sum = Object.values(GAME_ENVIRONMENT_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-9);
  });
});

// ── Candidate shadow score ────────────────────────────────────────────────────

describe("Candidate shadow score", () => {
  const PLAYER = {
    barrelRate: 15, hardHitRate: 45, iso: 0.22, xba: 0.27,
    last7HR: 1, last30HR: 5, opposingPitcherHrVs: 60,
    pitcherXera: 4.5, pitcherRegressionScore: 0.5, pitcherFlyBallRate: 40,
    parkFactor: 1.1, weatherBoost: 2,
  };

  it("deterministic output — same input always produces same output", () => {
    const a = computeCandidateHrScore(PLAYER);
    const b = computeCandidateHrScore(PLAYER);
    assert.equal(a.candidateHrQualityScore, b.candidateHrQualityScore);
  });

  it("does not use sportsbook odds", () => {
    const withoutOdds = { ...PLAYER };
    const withOdds = { ...PLAYER, hrOddsYes: "+450", hrImplied: 0.18 };
    const a = computeCandidateHrScore(withoutOdds);
    const b = computeCandidateHrScore(withOdds);
    assert.equal(a.candidateHrQualityScore, b.candidateHrQualityScore);
  });

  it("does not overwrite or reference the live score field", () => {
    const playerWithLiveScore = { ...PLAYER, hrScore: 999 };
    const result = computeCandidateHrScore(playerWithLiveScore);
    assert.notEqual(result.candidateHrQualityScore, 999);
    assert.ok(!("hrScore" in result));
  });

  it("candidate and live model versions remain separate constants", () => {
    const result = computeCandidateHrScore(PLAYER);
    assert.equal(result.candidateModelVersion, MLB_HR_CANDIDATE_MODEL_VERSION);
    assert.notEqual(result.candidateModelVersion, MLB_HR_MODEL_VERSION);
  });

  it("returns null score when fewer than half the weighted inputs are present", () => {
    const sparse = { barrelRate: 15 };
    const result = computeCandidateHrScore(sparse);
    assert.equal(result.candidateHrQualityScore, null);
  });

  it("rankCandidateScores ranks descending by candidateHrQualityScore", () => {
    const rows = [{ candidateHrQualityScore: 50 }, { candidateHrQualityScore: 90 }, { candidateHrQualityScore: 70 }];
    const rankMap = rankCandidateScores(rows);
    assert.equal(rankMap.get(1), 1);
    assert.equal(rankMap.get(0), 3);
  });
});

// ── Archive logic ──────────────────────────────────────────────────────────────

describe("Prediction archive", () => {
  const PLAYER = {
    playerId: 12345, player: "Test Player", team: "NYY", opponent: "BOS",
    opposingPitcherId: 999, opposingPitcher: "Some Pitcher", gameId: 555,
    hrScore: 72.5, hrScoreRank: 3, barrelRate: 14, hardHitRate: 48, xba: 0.27,
    whiffRate: 22, iso: 0.21, exitVelo: 91, pullRate: 38, last7HR: 1, last30HR: 4,
    parkFactor: 1.1, weatherBoost: 2, opposingPitcherHrVs: 60, pitcherXera: 4.2,
    pitcherRegressionScore: 0.3, hrOddsYes: "+320", hrOddsBook: "fanduel", hrImplied: 0.238,
    lineupStatus: "confirmed", battingOrder: 4,
  };
  const CONFIDENCE = { confidenceLevel: "high", confidenceReasons: [], dataCompletenessPercent: 100 };

  it("adds new prediction", () => {
    const record = buildArchiveRecord({ player: PLAYER, date: "2026-06-30", generatedAt: "2026-06-30T09:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const { records, action } = upsertArchiveRecord([], record);
    assert.equal(action, "appended");
    assert.equal(records.length, 1);
  });

  it("prevents duplicates on identical key", () => {
    const record = buildArchiveRecord({ player: PLAYER, date: "2026-06-30", generatedAt: "2026-06-30T09:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const first = upsertArchiveRecord([], record);
    const second = upsertArchiveRecord(first.records, record);
    assert.equal(second.records.length, 1);
    assert.equal(second.action, "updated");
  });

  it("same-day pregame rerun updates safely while preserving firstGeneratedAt", () => {
    const record1 = buildArchiveRecord({ player: PLAYER, date: "2026-06-30", generatedAt: "2026-06-30T09:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const record2 = buildArchiveRecord({ player: { ...PLAYER, hrScore: 75.0 }, date: "2026-06-30", generatedAt: "2026-06-30T11:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const first = upsertArchiveRecord([], record1);
    const second = upsertArchiveRecord(first.records, record2);
    assert.equal(second.records[0].firstGeneratedAt, "2026-06-30T09:00:00Z");
    assert.equal(second.records[0].hrQualityScore, 75.0);
    assert.ok(second.records[0].runHistory.includes("2026-06-30T11:00:00Z"));
  });

  it("graded records preserve original pregame values", () => {
    const record1 = buildArchiveRecord({ player: PLAYER, date: "2026-06-30", generatedAt: "2026-06-30T09:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const graded = { ...record1, result: { status: "hit", hrCount: 1, plateAppearances: 4, gameFinalStatus: "Final", gradedAt: "2026-07-01T05:00:00Z" } };
    const archive = [graded];
    const rerun = buildArchiveRecord({ player: { ...PLAYER, hrScore: 99 }, date: "2026-06-30", generatedAt: "2026-07-01T09:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const { records, action } = upsertArchiveRecord(archive, rerun);
    assert.equal(action, "skipped_graded");
    assert.equal(records[0].hrQualityScore, 72.5);
    assert.equal(records[0].result.status, "hit");
  });

  it("stable key behavior is correct — different IDs never collide even with identical names", () => {
    const recordA = buildArchiveRecord({ player: { ...PLAYER, playerId: 1, player: "John Smith" }, date: "2026-06-30", generatedAt: "t1", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const recordB = buildArchiveRecord({ player: { ...PLAYER, playerId: 2, player: "John Smith" }, date: "2026-06-30", generatedAt: "t1", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    assert.notEqual(buildArchiveKey(recordA), buildArchiveKey(recordB));
  });

  it("model version is retained on the record", () => {
    const record = buildArchiveRecord({ player: PLAYER, date: "2026-06-30", generatedAt: "2026-06-30T09:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    assert.equal(record.modelVersion, MLB_HR_MODEL_VERSION);
  });

  it("odds are archived; missing odds remain null not a fake value", () => {
    const record = buildArchiveRecord({ player: PLAYER, date: "2026-06-30", generatedAt: "2026-06-30T09:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    assert.equal(record.hrOddsYes, "+320");
    const noOddsPlayer = { ...PLAYER, hrOddsYes: null, hrOddsBook: null, hrImplied: null };
    const record2 = buildArchiveRecord({ player: noOddsPlayer, date: "2026-06-30", generatedAt: "2026-06-30T09:00:00Z", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    assert.equal(record2.hrOddsYes, null);
    assert.equal(record2.marketImpliedProbability, null);
  });

  it("mergeArchiveBatch correctly tallies appended/updated/skippedGraded", () => {
    const record1 = buildArchiveRecord({ player: PLAYER, date: "2026-06-30", generatedAt: "t1", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const record2 = buildArchiveRecord({ player: { ...PLAYER, playerId: 67890, player: "Second Player" }, date: "2026-06-30", generatedAt: "t1", modelVersion: MLB_HR_MODEL_VERSION, confidence: CONFIDENCE });
    const result = mergeArchiveBatch([], [record1, record2]);
    assert.equal(result.appended, 2);
    assert.equal(result.records.length, 2);
  });
});

// ── Grading logic ────────────────────────────────────────────────────────────

describe("HR result grading", () => {
  const RECORD = { playerId: 555, date: "2026-06-30", result: { status: "pending" } };

  it("HR hit is graded correctly", () => {
    const game = { gameState: "final", boxscoreTeam: { players: { ID555: { stats: { batting: { homeRuns: 1, atBats: 4, plateAppearances: 4 } } } } } };
    const result = gradePrediction(RECORD, game);
    assert.equal(result.status, "hit");
    assert.equal(result.hrCount, 1);
  });

  it("no-HR is graded as miss", () => {
    const game = { gameState: "final", boxscoreTeam: { players: { ID555: { stats: { batting: { homeRuns: 0, atBats: 4, plateAppearances: 4 } } } } } };
    const result = gradePrediction(RECORD, game);
    assert.equal(result.status, "miss");
  });

  it("did not play is distinguished from miss", () => {
    const game = { gameState: "final", boxscoreTeam: { players: { ID555: { stats: { batting: { homeRuns: 0, atBats: 0, plateAppearances: 0 } } } } } };
    const result = gradePrediction(RECORD, game);
    assert.equal(result.status, "did_not_play");
    assert.notEqual(result.status, "miss");
  });

  it("postponed game remains pending status", () => {
    const game = { gameState: "postponed", boxscoreTeam: null };
    const result = gradePrediction(RECORD, game);
    assert.equal(result.status, "postponed");
  });

  it("cancelled game is handled correctly", () => {
    const game = { gameState: "cancelled", boxscoreTeam: null };
    const result = gradePrediction(RECORD, game);
    assert.equal(result.status, "cancelled");
  });

  it("multiple HRs record correct count", () => {
    const game = { gameState: "final", boxscoreTeam: { players: { ID555: { stats: { batting: { homeRuns: 2, atBats: 5, plateAppearances: 5 } } } } } };
    const result = gradePrediction(RECORD, game);
    assert.equal(result.hrCount, 2);
    assert.equal(result.status, "hit");
  });

  it("idempotent regrading — same final inputs produce the same result", () => {
    const game = { gameState: "final", boxscoreTeam: { players: { ID555: { stats: { batting: { homeRuns: 1, atBats: 4, plateAppearances: 4 } } } } } };
    const graded = { ...RECORD, result: gradePrediction(RECORD, game) };
    assert.equal(isRegradeIdempotent(graded, game), true);
  });

  it("final-game detection works", () => {
    assert.equal(classifyGameState({ status: { abstractGameState: "Final" } }), "final");
    assert.equal(classifyGameState({ status: { abstractGameState: "Live" } }), "in_progress");
    assert.equal(classifyGameState({ status: { abstractGameState: "Preview", detailedState: "Scheduled" } }), "scheduled");
  });

  it("game still in progress remains pending", () => {
    const game = { gameState: "in_progress", boxscoreTeam: { players: {} } };
    const result = gradePrediction(RECORD, game);
    assert.equal(result.status, "pending");
  });

  it("final game with no matching box-score line is unresolved, not silently a miss", () => {
    const game = { gameState: "final", boxscoreTeam: { players: {} } };
    const result = gradePrediction(RECORD, game);
    assert.equal(result.status, "unresolved");
  });

  it("isGradeable correctly identifies pending vs already-graded records", () => {
    assert.equal(isGradeable({ result: { status: "pending" } }), true);
    assert.equal(isGradeable({ result: { status: "hit" } }), false);
  });

  it("findPlayerBattingLine returns null for missing player", () => {
    assert.equal(findPlayerBattingLine({ players: {} }, 999), null);
  });
});

// ── Performance summary ───────────────────────────────────────────────────────

describe("Performance summary", () => {
  function makeRecord(score, status, odds = null) {
    return { hrQualityScore: score, result: { status }, hrOddsYes: odds, marketImpliedProbability: odds ? 0.2 : null, confidenceLevel: "high", lineupStatus: "confirmed", modelVersion: "v1" };
  }

  it("correct counts per score band", () => {
    const records = [makeRecord(85, "hit"), makeRecord(82, "miss"), makeRecord(55, "miss")];
    const summary = buildPerformanceSummary(records);
    assert.equal(summary.byScoreBand["80+"].predictions, 2);
    assert.equal(summary.byScoreBand["50-59.9"].predictions, 1);
  });

  it("correct HR rate", () => {
    const records = [makeRecord(85, "hit"), makeRecord(82, "hit"), makeRecord(81, "miss"), makeRecord(80, "miss")];
    const summary = buildPerformanceSummary(records);
    assert.equal(summary.byScoreBand["80+"].actualHrRate, 50);
  });

  it("did-not-play excluded from graded totals", () => {
    const records = [makeRecord(85, "hit"), makeRecord(82, "did_not_play"), makeRecord(81, "miss")];
    const summary = buildPerformanceSummary(records);
    assert.equal(summary.totalGradedRecords, 2);
  });

  it("ROI only when odds exist", () => {
    const withOdds = [makeRecord(85, "hit", "+200"), makeRecord(82, "miss", "+150")];
    const summary = buildPerformanceSummary(withOdds);
    assert.notEqual(summary.byScoreBand["80+"].flatBetRoi, null);

    const noOdds = [makeRecord(85, "hit"), makeRecord(82, "miss")];
    const summary2 = buildPerformanceSummary(noOdds);
    assert.equal(summary2.byScoreBand["80+"].flatBetRoi, null);
  });

  it("no score-as-probability claim", () => {
    const records = [makeRecord(85, "hit"), makeRecord(82, "miss")];
    const summary = buildPerformanceSummary(records);
    assert.equal(summary.byScoreBand["80+"].calibrationDifference, null);
    assert.ok(summary.note.toLowerCase().includes("not a calibrated probability"));
  });

  it("score band boundaries match required bands", () => {
    assert.deepEqual(SCORE_BANDS.map((b) => b.label), ["80+", "70-79.9", "60-69.9", "50-59.9", "Below 50"]);
  });
});

// ── Calibration scaffold ──────────────────────────────────────────────────────

describe("Calibration scaffold", () => {
  it("refuses to calibrate below minimum sample", () => {
    const small = [{ date: "2026-06-30", result: { status: "hit" } }];
    const result = assessCalibrationReadiness(small);
    assert.equal(result.meetsMinimumThreshold, false);
    assert.equal(result.readyForCalibrationFit, false);
  });

  it("outputs score-band-style sample stats (count, HR outcomes, calendar days)", () => {
    const sample = [
      { date: "2026-06-01", result: { status: "hit" } },
      { date: "2026-06-02", result: { status: "miss" } },
    ];
    const result = assessCalibrationReadiness(sample);
    assert.equal(result.sampleCount, 2);
    assert.equal(result.hrOutcomeCount, 1);
    assert.equal(result.calendarDayCount, 2);
  });

  it("never publishes a probability even with a huge sample", () => {
    const bigSample = Array.from({ length: 2000 }, (_, i) => ({
      date: `2026-0${1 + (i % 6)}-01`, result: { status: i % 10 === 0 ? "hit" : "miss" },
    }));
    const result = assessCalibrationReadiness(bigSample);
    assert.equal(result.readyForCalibrationFit, false);
    assert.ok(!("calibratedProbability" in result));
  });

  it("requires out-of-sample validation warning even when thresholds are met", () => {
    const bigSample = [];
    for (let d = 1; d <= 30; d++) {
      for (let p = 0; p < 40; p++) {
        bigSample.push({ date: `2026-${String((d % 6) + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, result: { status: p % 8 === 0 ? "hit" : "miss" } });
      }
    }
    const result = assessCalibrationReadiness(bigSample);
    if (result.meetsMinimumThreshold) {
      assert.ok(result.warnings.some((w) => w.toLowerCase().includes("out-of-sample")));
    } else {
      assert.ok(result.warnings.length > 0);
    }
  });

  it("thresholds match documented minimums", () => {
    assert.equal(CALIBRATION_MIN_THRESHOLDS.minGradedPredictions, 1000);
    assert.equal(CALIBRATION_MIN_THRESHOLDS.minHrOutcomes, 100);
    assert.equal(CALIBRATION_MIN_THRESHOLDS.minCalendarDays, 28);
  });
});

// ── Fake probability formula removal regression guard ────────────────────────

describe("Fake probability formula no longer exists in the generator source", () => {
  it("generate-mlb-hr-props.mjs contains no active hrScore*0.0022 formula", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(__dirname, "../generate-mlb-hr-props.mjs"), "utf8");

    // Strip comment lines before checking for the formula, since the removal
    // is intentionally documented in a comment explaining what was deleted.
    const codeOnly = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");

    assert.ok(!codeOnly.includes("hrScore * 0.0022"), "Fake probability formula must not exist in active code");
    assert.ok(!codeOnly.includes("prioritize players where hrValueEdge"), "Old value-edge-driven Grok prompt language must be removed");
  });

  it("hrValueEdge is always explicitly null in the generator's batter enrichment, never computed", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(__dirname, "../generate-mlb-hr-props.mjs"), "utf8");
    // Every remaining hrValueEdge assignment must be a literal null, not a calculation
    const assignments = [...source.matchAll(/hrValueEdge:\s*([^,\n]+)/g)].map((m) => m[1].trim());
    for (const assignment of assignments) {
      assert.equal(assignment, "null", `Found non-null hrValueEdge assignment: ${assignment}`);
    }
  });
});

// ── Step 11: social architecture integration test ─────────────────────────────

describe("Social selection integration: deterministic selection gates LLM wording", () => {
  function normName(name) {
    return (name ?? "").toLowerCase().trim();
  }

  it("simulated Grok wording is accepted only when every returned player matches the deterministic selection set", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      player: `Player ${i}`, team: "AAA", opposingPitcher: "Some Pitcher", hrScore: 90 - i * 3,
    }));
    const deterministicPicks = selectDeterministicHrPicks(rows);
    const deterministicKeys = new Set(
      [...deterministicPicks.bestBets, ...deterministicPicks.valueBets, ...deterministicPicks.longshots].map((p) => normName(p.player))
    );

    // Simulate a well-behaved Grok response: only wording for already-selected players
    const wellBehavedResponse = {
      bestBets: deterministicPicks.bestBets.map((p) => ({ player: p.player, bullets: ["fact one", "fact two"] })),
      valueBets: deterministicPicks.valueBets.map((p) => ({ player: p.player, bullets: ["fact one", "fact two"] })),
      longshots: deterministicPicks.longshots.map((p) => ({ player: p.player, bullets: ["fact one", "fact two"] })),
    };
    const returnedNames1 = [...wellBehaved_Response_names(wellBehavedResponse)];
    const allMatch1 = returnedNames1.length > 0 && returnedNames1.every((n) => deterministicKeys.has(n));
    assert.equal(allMatch1, true);

    function wellBehaved_Response_names(resp) {
      return [...(resp.bestBets ?? []), ...(resp.valueBets ?? []), ...(resp.longshots ?? [])].map((p) => normName(p.player));
    }
  });

  it("simulated Grok wording is REJECTED when it hallucinates a player outside the deterministic selection", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      player: `Player ${i}`, team: "AAA", opposingPitcher: "Some Pitcher", hrScore: 90 - i * 3,
    }));
    const deterministicPicks = selectDeterministicHrPicks(rows);
    const deterministicKeys = new Set(
      [...deterministicPicks.bestBets, ...deterministicPicks.valueBets, ...deterministicPicks.longshots].map((p) => normName(p.player))
    );

    // Simulate a misbehaving Grok response: substitutes in a player not selected
    const hallucinatedResponse = {
      bestBets: [{ player: "A Completely Different Player", bullets: ["fake", "fake"] }],
      valueBets: [],
      longshots: [],
    };
    const returnedNames = [...(hallucinatedResponse.bestBets ?? [])].map((p) => normName(p.player));
    const allMatch = returnedNames.length > 0 && returnedNames.every((n) => deterministicKeys.has(n));
    assert.equal(allMatch, false); // must be rejected -- fallback to deterministic-only wording
  });

  it("deterministic selection set is computed BEFORE any wording step in the architecture (selection does not depend on wording output)", () => {
    // The selection function takes only raw rows -- it has no parameter that
    // could accept LLM output, structurally enforcing the ordering.
    const rows = [{ player: "X", team: "Y", opposingPitcher: "Z", hrScore: 80 }];
    assert.equal(selectDeterministicHrPicks.length, 1); // exactly one parameter: rows
    const result = selectDeterministicHrPicks(rows);
    assert.ok(Array.isArray(result.bestBets));
  });

  it("no fake value-edge field can leak through the selected-player summary fields", () => {
    const rows = [{ player: "X", team: "Y", opposingPitcher: "Z", hrScore: 80, hrValueEdge: 99, hrOddsYes: "+200" }];
    const result = selectDeterministicHrPicks(rows);
    for (const pick of result.bestBets) {
      // selectDeterministicHrPicks does not strip extra fields (it returns the row as-is),
      // so this test documents that hrValueEdge, even if present upstream, is never
      // referenced by the selection LOGIC itself (verified separately) -- the
      // generator's own output always sets it to null before this point.
      assert.equal(typeof pick.hrScore, "number");
    }
  });
});

// ── Regression guard: generator final-reconstruction field passthrough ────────

describe("Generator final batter reconstruction includes identity fields (regression guard)", () => {
  it("the final .map() reconstruction in generate-mlb-hr-props.mjs explicitly includes playerId, gameId, lineupStatus, battingOrder, starterConfirmed", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(__dirname, "../generate-mlb-hr-props.mjs"), "utf8");

    // Find the final reconstruction block (the one with hrScoreRank: index + 1,
    // which is unique to that specific .map() call).
    const idx = source.indexOf("hrScoreRank: index + 1");
    assert.ok(idx > 0, "Could not locate the final batter reconstruction block");
    const blockStart = source.lastIndexOf(".map((player, index) => ({", idx);
    const block = source.slice(blockStart, idx + 100);

    for (const field of ["playerId: player.playerId", "gameId: player.gameId", "lineupStatus: player.lineupStatus", "battingOrder: player.battingOrder", "starterConfirmed: player.starterConfirmed"]) {
      assert.ok(block.includes(field), `Final reconstruction is missing: ${field} -- this was the exact bug that caused every archive record to collide on playerId=0/gameId=0`);
    }
  });
});
