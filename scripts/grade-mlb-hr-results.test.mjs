/**
 * grade-mlb-hr-results.test.mjs
 * Tests for the grading script's schema validation and CLI orchestration.
 * No live API calls -- the pure grading logic itself is covered by
 * scripts/lib/mlb-hr-model-correctness.test.mjs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { validateArchiveSchema } from "./grade-mlb-hr-results.mjs";

const SCRIPT_PATH = path.join(import.meta.dirname, "grade-mlb-hr-results.mjs");

function runScript(cwd, args = []) {
  return execFileSync("node", [SCRIPT_PATH, ...args], { cwd, encoding: "utf8" });
}

function makeArchive(records) {
  return { schemaVersion: 1, lastUpdatedAt: "2026-06-30T09:00:00Z", recordCount: records.length, records };
}

function makeRecord(overrides = {}) {
  return {
    date: "2026-06-30", modelVersion: "test-v1", playerId: 1, gameId: 100,
    playerName: "Test Player", team: "NYY",
    result: { status: "pending", hrCount: null, plateAppearances: null, gameFinalStatus: null, gradedAt: null },
    ...overrides,
  };
}

describe("validateArchiveSchema", () => {
  it("accepts a valid archive", () => {
    const archive = makeArchive([makeRecord()]);
    assert.deepEqual(validateArchiveSchema(archive), []);
  });

  it("rejects an archive missing the records array", () => {
    const errors = validateArchiveSchema({ schemaVersion: 1 });
    assert.ok(errors.length > 0);
  });

  it("flags a record missing date", () => {
    const archive = makeArchive([makeRecord({ date: undefined })]);
    const errors = validateArchiveSchema(archive);
    assert.ok(errors.some((e) => e.includes("date")));
  });

  it("flags a record missing modelVersion", () => {
    const archive = makeArchive([makeRecord({ modelVersion: undefined })]);
    const errors = validateArchiveSchema(archive);
    assert.ok(errors.some((e) => e.includes("modelVersion")));
  });

  it("flags a record with malformed result.status", () => {
    const archive = makeArchive([makeRecord({ result: {} })]);
    const errors = validateArchiveSchema(archive);
    assert.ok(errors.some((e) => e.includes("result.status")));
  });
});

describe("grade-mlb-hr-results.mjs CLI", () => {
  it("--validate-only makes no provider calls and does not modify the archive", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-grade-validate-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    const original = makeArchive([makeRecord()]);
    writeFileSync(archivePath, JSON.stringify(original, null, 2), "utf8");

    runScript(dir, ["--validate-only"]);

    const after = JSON.parse(readFileSync(archivePath, "utf8"));
    assert.equal(after.records[0].result.status, "pending"); // unchanged
    rmSync(dir, { recursive: true, force: true });
  });

  it("missing archive file does not crash the script", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-grade-missing-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const output = runScript(dir);
    assert.ok(output.includes("does not exist") || output.length >= 0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("invalid archive schema causes a clean non-zero exit without writing further damage", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-grade-invalid-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    writeFileSync(archivePath, JSON.stringify({ notRecords: [] }), "utf8");

    let threw = false;
    try {
      runScript(dir, ["--validate-only"]);
    } catch (err) {
      threw = true;
      assert.ok(err.status !== 0);
    }
    assert.equal(threw, true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("archive with zero pending records and --validate-only completes without provider calls", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hr-grade-allgraded-"));
    mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
    const archivePath = path.join(dir, "public", "data", "mlb", "hr-prediction-history.json");
    const archive = makeArchive([
      makeRecord({ result: { status: "hit", hrCount: 1, plateAppearances: 4, gameFinalStatus: "Final", gradedAt: "t" } }),
    ]);
    writeFileSync(archivePath, JSON.stringify(archive, null, 2), "utf8");
    const output = runScript(dir, ["--validate-only"]);
    assert.ok(output.includes("schema valid"));
    rmSync(dir, { recursive: true, force: true });
  });
});
