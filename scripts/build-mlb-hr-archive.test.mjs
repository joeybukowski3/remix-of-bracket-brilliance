/**
 * build-mlb-hr-archive.test.mjs
 * I/O tests for the archive-building script using temporary fixture files.
 * No live API calls, no writes to the real public/data/mlb directory.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT_PATH = path.join(import.meta.dirname, "build-mlb-hr-archive.mjs");

function makeFixtureBatter(overrides = {}) {
  return {
    gameKey: "NYY@BOS", player: "Test Player", playerId: 12345, gameId: 555,
    position: "OF", team: "NYY", opponent: "BOS",
    opposingPitcher: "Some Pitcher", opposingPitcherId: 999, opposingPitcherHrVs: 60,
    pitcherHand: "R", ballpark: "Fenway Park", parkFactor: 0.95,
    atBats: 200, barrelRate: 14, hardHitRate: 48, exitVelo: 91, iso: 0.21,
    hrFBRatio: 12, pullRate: 38, xba: 0.27, kRate: 22, bbRate: 9, whiffRate: 22,
    last7HR: 1, last30HR: 4, weatherBoost: 1, batterHand: "R",
    hrScore: 72.5, hrScoreRank: 3, angleTags: [],
    pitcherXera: 4.2, pitcherRegressionScore: 0.3, pitcherFlyBallRate: 40,
    hrOddsYes: "+320", hrOddsNo: null, hrOddsBook: "fanduel",
    marketImpliedProbability: 0.238, qualityRank: 3, marketRank: 5, rankDifference: 2,
    valueStatus: "uncalibrated", hrValueEdge: null, hrImplied: 0.238,
    modelVersion: "test-v1", confidenceLevel: "high", confidenceReasons: [],
    dataCompletenessPercent: 100, explanation: "Test explanation.",
    candidateHrQualityScore: 70.1, candidateRank: 4, candidateModelVersion: "test-candidate-v1",
    lineupStatus: "confirmed", battingOrder: 4, starterConfirmed: true,
    ...overrides,
  };
}

function runScript(cwd, args = []) {
  return execFileSync("node", [SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

describe("build-mlb-hr-archive.mjs I/O", () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "hr-archive-test-"));
    mkdirSync(path.join(tmpDir, "public", "data", "mlb"), { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeRaw(dir, batters, overrides = {}) {
    const rawPath = path.join(dir, "public", "data", "mlb", "hr-props-raw.json");
    const payload = {
      date: "2026-06-30", generatedAt: "2026-06-30T09:00:00.000Z", modelVersion: "test-v1",
      games: [], pitchers: [], batters, ...overrides,
    };
    writeFileSync(rawPath, JSON.stringify(payload, null, 2), "utf8");
  }

  function readArchive(dir) {
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    if (!existsSync(archivePath)) return null;
    return JSON.parse(readFileSync(archivePath, "utf8"));
  }

  it("creates a new archive file with one record on first run", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-archive-fresh-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    writeRaw(dir, [makeFixtureBatter()]);
    runScript(dir);
    const archive = readArchive(dir);
    assert.ok(archive);
    assert.equal(archive.records.length, 1);
    assert.equal(archive.records[0].playerId, 12345);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not duplicate on a second identical run (same-day rerun upserts)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-archive-rerun-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    writeRaw(dir, [makeFixtureBatter()]);
    runScript(dir);
    runScript(dir);
    const archive = readArchive(dir);
    assert.equal(archive.records.length, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("updates the pregame score on a same-day rerun with a new score", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-archive-update-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    writeRaw(dir, [makeFixtureBatter({ hrScore: 72.5 })]);
    runScript(dir);
    writeRaw(dir, [makeFixtureBatter({ hrScore: 78.0 })]);
    runScript(dir);
    const archive = readArchive(dir);
    assert.equal(archive.records.length, 1);
    assert.equal(archive.records[0].hrQualityScore, 78.0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not overwrite a graded record on a fresh-data rerun", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-archive-graded-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    writeRaw(dir, [makeFixtureBatter({ hrScore: 72.5 })]);
    runScript(dir);

    // Manually mark the record as graded, simulating the grading script having run
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    const archive = JSON.parse(readFileSync(archivePath, "utf8"));
    archive.records[0].result = { status: "hit", hrCount: 1, plateAppearances: 4, gameFinalStatus: "Final", gradedAt: "2026-07-01T05:00:00Z" };
    writeFileSync(archivePath, JSON.stringify(archive, null, 2), "utf8");

    // Rerun the generator with a different (bogus) score for the same key
    writeRaw(dir, [makeFixtureBatter({ hrScore: 99.9 })]);
    runScript(dir);

    const finalArchive = readArchive(dir);
    assert.equal(finalArchive.records.length, 1);
    assert.equal(finalArchive.records[0].hrQualityScore, 72.5); // original preserved
    assert.equal(finalArchive.records[0].result.status, "hit");
    rmSync(dir, { recursive: true, force: true });
  });

  it("dry-run does not write the archive file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-archive-dryrun-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    writeRaw(dir, [makeFixtureBatter()]);
    runScript(dir, ["--dry-run"]);
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    assert.equal(existsSync(archivePath), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("handles missing hr-props-raw.json gracefully (no crash, no file written)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-archive-missing-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    runScript(dir);
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    assert.equal(existsSync(archivePath), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("archives multiple distinct players from one run without collision", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-archive-multi-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    writeRaw(dir, [
      makeFixtureBatter({ playerId: 1, player: "Player One" }),
      makeFixtureBatter({ playerId: 2, player: "Player Two", gameId: 556 }),
    ]);
    runScript(dir);
    const archive = readArchive(dir);
    assert.equal(archive.records.length, 2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses date|playerId|gameId|modelVersion as the stable key, not player name", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-archive-stablekey-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    // Two different players sharing the same display name but different IDs
    writeRaw(dir, [
      makeFixtureBatter({ playerId: 100, player: "John Smith", gameId: 700 }),
      makeFixtureBatter({ playerId: 200, player: "John Smith", gameId: 700 }),
    ]);
    runScript(dir);
    const archive = readArchive(dir);
    assert.equal(archive.records.length, 2); // not deduplicated by name
    rmSync(dir, { recursive: true, force: true });
  });
});
