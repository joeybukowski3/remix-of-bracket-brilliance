/**
 * build-mlb-ml-performance-summary.test.mjs
 * I/O tests for the ML performance summary build script using temporary
 * fixture files. No live API calls, no writes to the real public/data/mlb
 * directory. Mirrors build-mlb-hr-performance-summary.test.mjs's structure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT_PATH = path.join(import.meta.dirname, "build-mlb-ml-performance-summary.mjs");

function runScript(cwd, args = []) {
  return execFileSync("node", [SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

function freshDir(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
  return dir;
}

function writeArchive(dir, records) {
  const archivePath = path.join(dir, "public", "data", "mlb", "ml-prediction-history.json");
  writeFileSync(archivePath, JSON.stringify({ schemaVersion: 1, lastUpdatedAt: "t", recordCount: records.length, records }, null, 2), "utf8");
}

function readSummary(dir) {
  const summaryPath = path.join(dir, "public", "data", "mlb", "ml-model-performance.json");
  if (!existsSync(summaryPath)) return null;
  return JSON.parse(readFileSync(summaryPath, "utf8"));
}

function makeRecord(overrides = {}) {
  return {
    date: "2026-06-30", confidence: 65,
    result: { status: "win", clv: { sportsbook: { impliedProbabilityDelta: 0.02, beatClose: true }, polymarket: null } },
    ...overrides,
  };
}

describe("build-mlb-ml-performance-summary.mjs I/O", () => {
  it("writes a performance summary from a graded archive", () => {
    const dir = freshDir("ml-perf-basic-");
    writeArchive(dir, [makeRecord(), makeRecord({ result: { status: "loss", clv: null } })]);
    runScript(dir);
    const summary = readSummary(dir);
    assert.ok(summary);
    assert.equal(summary.totalArchivedPicks, 2);
    assert.equal(summary.totalGradedPicks, 2);
    assert.equal(summary.overall.wins, 1);
    assert.equal(summary.overall.losses, 1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("always includes the Edge Strength calibration note", () => {
    const dir = freshDir("ml-perf-note-");
    writeArchive(dir, [makeRecord()]);
    runScript(dir);
    const summary = readSummary(dir);
    assert.ok(summary.note.toLowerCase().includes("not been calibrated"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("adds a sample-size warning when a group has fewer than 20 graded picks", () => {
    const dir = freshDir("ml-perf-warn-");
    writeArchive(dir, [makeRecord()]); // only 1 graded record
    runScript(dir);
    const summary = readSummary(dir);
    assert.ok(summary.sampleSizeWarnings);
    assert.ok(summary.sampleSizeWarnings.overall.includes("below the 20-record"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("omits sample-size warnings once overall sample size clears the threshold", () => {
    const dir = freshDir("ml-perf-nowarn-");
    const records = Array.from({ length: 25 }, (_, i) => makeRecord({ date: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`, result: { status: i % 2 === 0 ? "win" : "loss", clv: null } }));
    writeArchive(dir, records);
    runScript(dir);
    const summary = readSummary(dir);
    assert.equal(summary.sampleSizeWarnings?.overall, undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  it("dry-run does not write the summary file", () => {
    const dir = freshDir("ml-perf-dryrun-");
    writeArchive(dir, [makeRecord()]);
    runScript(dir, ["--dry-run"]);
    const summaryPath = path.join(dir, "public", "data", "mlb", "ml-model-performance.json");
    assert.equal(existsSync(summaryPath), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("handles a missing archive gracefully (no crash, no file written)", () => {
    const dir = freshDir("ml-perf-missing-");
    runScript(dir);
    const summaryPath = path.join(dir, "public", "data", "mlb", "ml-model-performance.json");
    assert.equal(existsSync(summaryPath), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("a malformed archive (missing records array) exits non-zero without writing", () => {
    const dir = freshDir("ml-perf-malformed-");
    const archivePath = path.join(dir, "public", "data", "mlb", "ml-prediction-history.json");
    writeFileSync(archivePath, JSON.stringify({ notRecords: [] }), "utf8");
    let threw = false;
    try {
      runScript(dir);
    } catch (err) {
      threw = true;
      assert.ok(err.status !== 0);
    }
    assert.equal(threw, true);
    rmSync(dir, { recursive: true, force: true });
  });
});
