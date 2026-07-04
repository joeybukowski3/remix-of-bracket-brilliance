/**
 * build-mlb-phase2-shadow-comparison.test.mjs
 * I/O tests for the Phase 2 shadow comparison build script using
 * temporary fixture files. No live API calls, no writes to the real
 * public/data/mlb directory. Mirrors build-mlb-ml-archive.test.mjs's
 * structure (execFileSync against a scratch cwd).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = path.join(import.meta.dirname, "build-mlb-phase2-shadow-comparison.mjs");
const ENABLED_ENV = { ...process.env, ENABLE_PHASE2_SHADOW_COMPARISON: "true" };
const DISABLED_ENV = { ...process.env, ENABLE_PHASE2_SHADOW_COMPARISON: undefined };

function freshDir(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  mkdirSync(path.join(dir, "public", "data", "mlb"), { recursive: true });
  return dir;
}

function writeMlRaw(dir, picks = [], overrides = {}) {
  const rawPath = path.join(dir, "public", "data", "mlb", "ml-picks-raw.json");
  writeFileSync(rawPath, JSON.stringify({ date: "2026-07-03", generatedAt: "2026-07-03T10:00:00.000Z", modelVersion: "mlb-ml-edge-v1.0", picks, ...overrides }, null, 2), "utf8");
  return rawPath;
}

function writeHrRaw(dir, batters = [], overrides = {}) {
  const rawPath = path.join(dir, "public", "data", "mlb", "hr-props-raw.json");
  writeFileSync(rawPath, JSON.stringify({ date: "2026-07-03", generatedAt: "2026-07-03T10:30:00.000Z", modelVersion: "mlb-hr-quality-v1.1", batters, ...overrides }, null, 2), "utf8");
  return rawPath;
}

function runScript(dir, args = [], env = ENABLED_ENV) {
  // spawnSync (not execFileSync) so console.warn (stderr) is captured
  // alongside console.log (stdout) -- several assertions below match
  // against warning text.
  const result = spawnSync("node", [SCRIPT_PATH, ...args], { cwd: dir, encoding: "utf8", env });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function outputPath(dir) {
  return path.join(dir, "public", "data", "mlb", "ml-phase2-shadow-comparison.json");
}

describe("build-mlb-phase2-shadow-comparison.mjs: flag gate", () => {
  it("is a no-op when ENABLE_PHASE2_SHADOW_COMPARISON is not set", () => {
    const dir = freshDir("phase2-comparison-flagoff-");
    writeMlRaw(dir, []);
    writeHrRaw(dir, []);
    const output = runScript(dir, [], DISABLED_ENV);
    assert.match(output, /not "true"/);
    assert.equal(existsSync(outputPath(dir)), false);
  });
});

describe("build-mlb-phase2-shadow-comparison.mjs: tracked-write guard", () => {
  it("refuses to write to the default (tracked-path-shaped) output without the opt-in env var", () => {
    const dir = freshDir("phase2-comparison-guard-");
    writeMlRaw(dir, []);
    writeHrRaw(dir, []);
    const output = runScript(dir, [], ENABLED_ENV); // no MLB_PHASE2_COMPARISON_ALLOW_TRACKED_WRITE
    assert.match(output, /Refusing to write/);
    assert.equal(existsSync(outputPath(dir)), false);
  });

  it("writes when the opt-in env var is set", () => {
    const dir = freshDir("phase2-comparison-guard-allow-");
    writeMlRaw(dir, []);
    writeHrRaw(dir, []);
    runScript(dir, [], { ...ENABLED_ENV, MLB_PHASE2_COMPARISON_ALLOW_TRACKED_WRITE: "true" });
    assert.equal(existsSync(outputPath(dir)), true);
  });

  it("writes freely to an explicit --out path without the opt-in env var", () => {
    const dir = freshDir("phase2-comparison-out-");
    writeMlRaw(dir, []);
    writeHrRaw(dir, []);
    const altOut = path.join(dir, "alt-comparison.json");
    runScript(dir, [`--out=${altOut}`], ENABLED_ENV);
    assert.equal(existsSync(altOut), true);
    assert.equal(existsSync(outputPath(dir)), false);
  });
});

describe("build-mlb-phase2-shadow-comparison.mjs: --validate-only", () => {
  it("builds and logs a summary but writes nothing", () => {
    const dir = freshDir("phase2-comparison-validate-");
    writeMlRaw(dir, []);
    writeHrRaw(dir, []);
    const output = runScript(dir, ["--validate-only"], ENABLED_ENV);
    assert.match(output, /validate-only set, not writing/);
    assert.equal(existsSync(outputPath(dir)), false);
  });
});

describe("build-mlb-phase2-shadow-comparison.mjs: input handling", () => {
  it("supports explicit --ml-input / --hr-input overrides", () => {
    const dir = freshDir("phase2-comparison-inputs-");
    const mlPath = path.join(dir, "custom-ml.json");
    const hrPath = path.join(dir, "custom-hr.json");
    writeFileSync(mlPath, JSON.stringify({ date: "2026-07-03", generatedAt: "2026-07-03T10:00:00Z", picks: [] }), "utf8");
    writeFileSync(hrPath, JSON.stringify({ date: "2026-07-03", generatedAt: "2026-07-03T10:30:00Z", batters: [] }), "utf8");
    const altOut = path.join(dir, "out.json");
    runScript(dir, [`--ml-input=${mlPath}`, `--hr-input=${hrPath}`, `--out=${altOut}`], ENABLED_ENV);
    const artifact = JSON.parse(readFileSync(altOut, "utf8"));
    assert.equal(artifact.summary.moneylineSourceGeneratedAt, "2026-07-03T10:00:00Z");
    assert.equal(artifact.summary.hrSourceGeneratedAt, "2026-07-03T10:30:00Z");
  });

  it("handles a missing ML input file safely (empty moneyline section, no crash)", () => {
    const dir = freshDir("phase2-comparison-missing-ml-");
    writeHrRaw(dir, []);
    const altOut = path.join(dir, "out.json");
    const output = runScript(dir, [`--out=${altOut}`], ENABLED_ENV);
    assert.match(output, /ml-picks-raw\.json not found/);
    const artifact = JSON.parse(readFileSync(altOut, "utf8"));
    assert.equal(artifact.moneyline.records.length, 0);
  });

  it("handles a malformed HR input file safely (empty hr section, no crash)", () => {
    const dir = freshDir("phase2-comparison-malformed-hr-");
    writeMlRaw(dir, []);
    writeFileSync(path.join(dir, "public", "data", "mlb", "hr-props-raw.json"), "{not valid json", "utf8");
    const altOut = path.join(dir, "out.json");
    const output = runScript(dir, [`--out=${altOut}`], ENABLED_ENV);
    assert.match(output, /Failed to parse/);
    const artifact = JSON.parse(readFileSync(altOut, "utf8"));
    assert.equal(artifact.hr.records.length, 0);
  });

  it("never mutates the raw input files", () => {
    const dir = freshDir("phase2-comparison-no-mutate-");
    const mlPath = writeMlRaw(dir, [{ gameId: 1, gameKey: "A@B", pick: "away", confidence: 60, differential: 5 }]);
    const hrPath = writeHrRaw(dir, [{ playerId: 1, player: "X", gameId: 1, gameKey: "A@B", hrScore: 50, hrScoreRank: 1 }]);
    const before = { ml: readFileSync(mlPath, "utf8"), hr: readFileSync(hrPath, "utf8") };
    const altOut = path.join(dir, "out.json");
    runScript(dir, [`--out=${altOut}`], ENABLED_ENV);
    const after = { ml: readFileSync(mlPath, "utf8"), hr: readFileSync(hrPath, "utf8") };
    assert.equal(before.ml, after.ml);
    assert.equal(before.hr, after.hr);
  });
});

describe("build-mlb-phase2-shadow-comparison.mjs: real data build", () => {
  it("produces a well-formed artifact from realistic raw records with and without shadow data", () => {
    const dir = freshDir("phase2-comparison-real-");
    writeMlRaw(dir, [
      { gameId: 1, gameKey: "NYY@BOS", pick: "away", confidence: 62, differential: 6, phase2Shadow: {
        liveModelVersion: "mlb-ml-edge-v1.0", shadowExperimentVersion: "mlb-ml-phase2-shadow-v1",
        enabledComponents: { projectedIp: true, park: true, bullpen: true },
        live: { pick: "away", differential: 6, confidence: 62 },
        projectedIpShadow: { awayBullpenShadow: { available: true, dataQuality: "high", contribution: 1 }, homeBullpenShadow: { available: false, dataQuality: null, contribution: 0 } },
        parkShadow: { parkDataQuality: "known_venue" },
        combinedShadowPick: "away", combinedShadowDifferential: 7, combinedShadowTier: "slight", pickFlipped: false,
      } },
      { gameId: 2, gameKey: "TB@HOU", pick: "home", confidence: 58, differential: 4 }, // no shadow
    ]);
    writeHrRaw(dir, [
      { playerId: 1, player: "Player A", gameId: 1, gameKey: "NYY@BOS", hrScore: 70, hrScoreRank: 1, phase2Shadow: {
        liveModelVersion: "mlb-hr-quality-v1.1", shadowExperimentVersion: "mlb-hr-phase2-shadow-v1",
        enabledComponents: { bullpen: true, handSplit: true },
        live: { hrScore: 70 },
        bullpenShadow: { available: true, dataQuality: "high", contribution: 1 },
        handSplitShadow: { available: true, dataQuality: "high", contribution: 2 },
        componentAvailability: { bullpen: true, handSplit: true },
        componentDataQuality: { bullpen: "high", handSplit: "high" },
        componentContributions: { bullpen: 1, handSplit: 2 },
        combinedShadowScore: 73,
      } },
      { playerId: 2, player: "Player B", gameId: 1, gameKey: "NYY@BOS", hrScore: 55, hrScoreRank: 2 }, // no shadow
    ]);
    const altOut = path.join(dir, "out.json");
    const output = runScript(dir, [`--out=${altOut}`], ENABLED_ENV);
    assert.match(output, /ML: loaded=2 withShadow=1/);
    assert.match(output, /HR: loaded=2 withShadow=1/);

    const artifact = JSON.parse(readFileSync(altOut, "utf8"));
    assert.equal(artifact.moneyline.records.length, 2);
    assert.equal(artifact.hr.records.length, 2);
    assert.equal(artifact.moneyline.summary.recordsWithShadow, 1);
    assert.equal(artifact.hr.summary.recordsWithShadow, 1);
    assert.equal(artifact.hr.records.find((r) => r.playerId === 1).shadowRank, 1);
  });
});
