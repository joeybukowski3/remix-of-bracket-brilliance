/**
 * build-mlb-hr-performance-summary.test.mjs
 * I/O tests for the performance summary builder script.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT_PATH = path.join(import.meta.dirname, "build-mlb-hr-performance-summary.mjs");

function runScript(cwd, args = []) {
  return execFileSync("node", [SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

function makeRecord(score, status, odds = null) {
  return {
    hrQualityScore: score,
    result: { status, hrCount: status === "hit" ? 1 : 0 },
    hrOddsYes: odds,
    marketImpliedProbability: odds ? 0.22 : null,
    confidenceLevel: "high",
    lineupStatus: "confirmed",
    modelVersion: "test-v1",
    date: "2026-06-30",
  };
}

describe("build-mlb-hr-performance-summary.mjs I/O", () => {
  it("writes a summary file with correct totals from a fixture archive", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-perf-basic-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    writeFileSync(archivePath, JSON.stringify({ records: [
      makeRecord(85, "hit", "+200"),
      makeRecord(82, "miss", "+150"),
      makeRecord(55, "did_not_play"),
    ] }), "utf8");

    runScript(dir);

    const summaryPath = path.join(dir, "public", "data", "mlb", "hr-model-performance.json");
    assert.ok(existsSync(summaryPath));
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    assert.equal(summary.totalGradedRecords, 2); // did_not_play excluded
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes a sample-size warning for small samples", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-perf-small-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    writeFileSync(archivePath, JSON.stringify({ records: [makeRecord(85, "hit", "+200")] }), "utf8");

    runScript(dir);

    const summaryPath = path.join(dir, "public", "data", "mlb", "hr-model-performance.json");
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    assert.ok(summary.sampleSizeWarning);
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes calibrationReadiness and never a calibrated probability", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-perf-calib-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    writeFileSync(archivePath, JSON.stringify({ records: [makeRecord(85, "hit", "+200")] }), "utf8");

    runScript(dir);

    const summaryPath = path.join(dir, "public", "data", "mlb", "hr-model-performance.json");
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    assert.ok("calibrationReadiness" in summary);
    assert.equal(summary.calibrationReadiness.readyForCalibrationFit, false);
    assert.ok(!("calibratedProbability" in summary));
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not label empirical HR rate as a model probability", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-perf-label-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    writeFileSync(archivePath, JSON.stringify({ records: [makeRecord(85, "hit", "+200"), makeRecord(82, "miss", "+150")] }), "utf8");

    runScript(dir);

    const summaryPath = path.join(dir, "public", "data", "mlb", "hr-model-performance.json");
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    assert.ok(summary.note.toLowerCase().includes("not a calibrated probability"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("missing archive file does not crash and writes nothing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-perf-missing-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    runScript(dir);
    const summaryPath = path.join(dir, "public", "data", "mlb", "hr-model-performance.json");
    assert.equal(existsSync(summaryPath), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("dry-run does not write the summary file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-perf-dryrun-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    writeFileSync(archivePath, JSON.stringify({ records: [makeRecord(85, "hit", "+200")] }), "utf8");
    runScript(dir, ["--dry-run"]);
    const summaryPath = path.join(dir, "public", "data", "mlb", "hr-model-performance.json");
    assert.equal(existsSync(summaryPath), false);
    rmSync(dir, { recursive: true, force: true });
  });
});
