/**
 * build-mlb-ml-archive.test.mjs
 * I/O tests for the ML archive-building script using temporary fixture
 * files. No live API calls, no writes to the real public/data/mlb
 * directory. Mirrors build-mlb-hr-archive.test.mjs's structure.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT_PATH = path.join(import.meta.dirname, "build-mlb-ml-archive.mjs");

function makeFixturePick(overrides = {}) {
  return {
    gameId: 555,
    gameKey: "NYY@BOS",
    pick: "away",
    pickAbbr: "NYY",
    confidence: 59,
    differential: 8,
    topFactor: "Pitcher Quality",
    factors: [{ label: "Pitcher Quality", awayScore: 66, homeScore: 55, weight: 0.3, weightedDifference: 3.3, description: "ERA, K/9, BB%, HR/9" }],
    priceAtPick: { american: "-135", implied: 0.574, capturedAt: "2026-06-30T13:00:00.000Z" },
    polymarketAtPick: { yesPrice: 0.56, capturedAt: "2026-06-30T05:00:00.000Z" },
    ...overrides,
  };
}

function runScript(cwd, args = []) {
  return execFileSync("node", [SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

describe("build-mlb-ml-archive.mjs I/O", () => {
  function writeRaw(dir, picks, overrides = {}) {
    const rawPath = path.join(dir, "public", "data", "mlb", "ml-picks-raw.json");
    const payload = { date: "2026-06-30", generatedAt: "2026-06-30T09:00:00.000Z", modelVersion: "test-v1", picks, ...overrides };
    writeFileSync(rawPath, JSON.stringify(payload, null, 2), "utf8");
  }

  function readArchive(dir) {
    const archivePath = path.join(dir, "public", "data", "mlb", "ml-prediction-history.json");
    if (!existsSync(archivePath)) return null;
    return JSON.parse(readFileSync(archivePath, "utf8"));
  }

  function freshDir(prefix) {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    return dir;
  }

  it("creates a new archive file with one record on first run", () => {
    const dir = freshDir("ml-archive-fresh-");
    writeRaw(dir, [makeFixturePick()]);
    runScript(dir);
    const archive = readArchive(dir);
    assert.ok(archive);
    assert.equal(archive.records.length, 1);
    assert.equal(archive.records[0].gameId, 555);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not duplicate on a second identical run (same-day rerun upserts)", () => {
    const dir = freshDir("ml-archive-rerun-");
    writeRaw(dir, [makeFixturePick()]);
    runScript(dir);
    runScript(dir);
    const archive = readArchive(dir);
    assert.equal(archive.records.length, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("updates the pregame confidence on a same-day rerun with a new score", () => {
    const dir = freshDir("ml-archive-update-");
    writeRaw(dir, [makeFixturePick({ confidence: 59 })]);
    runScript(dir);
    writeRaw(dir, [makeFixturePick({ confidence: 68 })]);
    runScript(dir);
    const archive = readArchive(dir);
    assert.equal(archive.records.length, 1);
    assert.equal(archive.records[0].confidence, 68);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not overwrite a graded record on a fresh-data rerun", () => {
    const dir = freshDir("ml-archive-graded-");
    writeRaw(dir, [makeFixturePick({ confidence: 59 })]);
    runScript(dir);

    const archivePath = path.join(dir, "public", "data", "mlb", "ml-prediction-history.json");
    const archive = JSON.parse(readFileSync(archivePath, "utf8"));
    archive.records[0].result = {
      status: "win", actualWinnerAbbr: "NYY", finalScore: { away: 5, home: 3 },
      gameFinalStatus: "Final", closingLine: null, clv: null, gradedAt: "2026-07-01T05:00:00Z",
    };
    writeFileSync(archivePath, JSON.stringify(archive, null, 2), "utf8");

    writeRaw(dir, [makeFixturePick({ confidence: 99 })]);
    runScript(dir);

    const finalArchive = readArchive(dir);
    assert.equal(finalArchive.records.length, 1);
    assert.equal(finalArchive.records[0].confidence, 59); // original preserved
    assert.equal(finalArchive.records[0].result.status, "win");
    rmSync(dir, { recursive: true, force: true });
  });

  it("dry-run does not write the archive file", () => {
    const dir = freshDir("ml-archive-dryrun-");
    writeRaw(dir, [makeFixturePick()]);
    runScript(dir, ["--dry-run"]);
    const archivePath = path.join(dir, "public", "data", "mlb", "ml-prediction-history.json");
    assert.equal(existsSync(archivePath), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("handles missing ml-picks-raw.json gracefully (no crash, no file written)", () => {
    const dir = freshDir("ml-archive-missing-");
    runScript(dir);
    const archivePath = path.join(dir, "public", "data", "mlb", "ml-prediction-history.json");
    assert.equal(existsSync(archivePath), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("archives multiple distinct games from one run without collision", () => {
    const dir = freshDir("ml-archive-multi-");
    writeRaw(dir, [
      makeFixturePick({ gameId: 1, gameKey: "NYY@BOS" }),
      makeFixturePick({ gameId: 2, gameKey: "LAD@SF" }),
    ]);
    runScript(dir);
    const archive = readArchive(dir);
    assert.equal(archive.records.length, 2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("no record ever contains a probability or fabricated value-edge field", () => {
    const dir = freshDir("ml-archive-honesty-");
    writeRaw(dir, [makeFixturePick()]);
    runScript(dir);
    const archive = readArchive(dir);
    for (const record of archive.records) {
      assert.equal(record.probability, undefined);
      assert.equal(record.valueEdge, undefined);
      assert.equal(record.modelProb, undefined);
    }
    rmSync(dir, { recursive: true, force: true });
  });
});
