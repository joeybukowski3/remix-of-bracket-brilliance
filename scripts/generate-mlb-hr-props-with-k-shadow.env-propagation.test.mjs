/**
 * generate-mlb-hr-props-with-k-shadow.env-propagation.test.mjs
 * Run via: node --test scripts/generate-mlb-hr-props-with-k-shadow.env-propagation.test.mjs
 *
 * Proves the K-shadow wrapper (scripts/generate-mlb-hr-props-with-k-shadow.mjs)
 * correctly propagates the 7 Phase 2 environment variables and
 * MLB_K_PROJECTION_MODE to the legacy HR generator it spawns as a child
 * process, and that exit codes propagate correctly. The wrapper's own
 * `main()` hardcodes the real generator as its child target (which makes
 * live API calls), so this file does NOT invoke `main()` directly.
 * Instead it:
 *   1. Statically confirms the exact spawnSync call passes `env: process.env`
 *      verbatim (no allowlist/destructuring that could drop a var).
 *   2. Proves the general spawnSync({ env: process.env }) mechanism the
 *      wrapper uses genuinely forwards arbitrary env vars unchanged, and
 *      that a non-zero child exit code surfaces in `result.status`, using
 *      a disposable dummy child script -- not the real generator.
 *   3. Exercises the wrapper's own exported, pure functions
 *      (getKProjectionMode, applyKProjectionMode) directly, which is safe
 *      because they perform no I/O and are the actual logic under test.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getKProjectionMode, applyKProjectionMode } from "./generate-mlb-hr-props-with-k-shadow.mjs";

const WRAPPER_PATH = path.join(import.meta.dirname, "generate-mlb-hr-props-with-k-shadow.mjs");
const WRAPPER_SOURCE = readFileSync(WRAPPER_PATH, "utf8");

describe("wrapper source: spawnSync call shape", () => {
  it("spawns the legacy generator via spawnSync with env: process.env passed verbatim", () => {
    assert.match(WRAPPER_SOURCE, /spawnSync\(process\.execPath,\s*\[LEGACY_SCRIPT,\s*\.\.\.argv\],\s*\{/);
    assert.match(WRAPPER_SOURCE, /env:\s*process\.env/);
  });

  it("does not filter, allowlist, or reconstruct the environment before spawning", () => {
    // A filtered/reconstructed env would look like `env: { ...someSubset }` or
    // explicit per-key assignment; the wrapper must pass the whole object.
    assert.doesNotMatch(WRAPPER_SOURCE, /env:\s*\{\s*[A-Z_]+:/);
  });

  it("propagates the child's exit code without swallowing failure", () => {
    assert.match(WRAPPER_SOURCE, /result\.status !== 0/);
    assert.match(WRAPPER_SOURCE, /process\.exitCode = result\.status/);
    assert.match(WRAPPER_SOURCE, /if \(result\.error\) throw result\.error;/);
  });

  it("post-processing only touches pitchers[], never batters[] (Phase 2 batter-id extraction is unaffected)", () => {
    assert.match(WRAPPER_SOURCE, /payload\?\.pitchers/);
    assert.doesNotMatch(WRAPPER_SOURCE, /payload\.batters|data\.batters/);
  });
});

describe("mechanism proof: spawnSync({ env: process.env }) forwards arbitrary env vars unchanged", () => {
  const PHASE2_VARS = [
    "ENABLE_ML_PROJECTED_IP_SHADOW",
    "ENABLE_ML_PARK_SHADOW",
    "ENABLE_BULLPEN_DATA_PIPELINE",
    "ENABLE_ML_BULLPEN_SHADOW",
    "ENABLE_HR_BULLPEN_SHADOW",
    "ENABLE_HR_HAND_SPLIT_SHADOW",
    "ENABLE_PHASE2_SHADOW_COMPARISON",
  ];

  function freshDir() {
    return mkdtempSync(path.join(tmpdir(), "k-shadow-env-propagation-"));
  }

  it("all 7 Phase 2 vars plus MLB_K_PROJECTION_MODE reach a spawned child unchanged", () => {
    const dir = freshDir();
    const dumpScript = path.join(dir, "dump-env.mjs");
    const outPath = path.join(dir, "env-dump.json");
    writeFileSync(
      dumpScript,
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(outPath)}, JSON.stringify(process.env), "utf8");\n`,
      "utf8"
    );

    const markedEnv = {
      ...process.env,
      MLB_K_PROJECTION_MODE: "shadow",
      ENABLE_ML_PROJECTED_IP_SHADOW: "true",
      ENABLE_ML_PARK_SHADOW: "true",
      ENABLE_BULLPEN_DATA_PIPELINE: "true",
      ENABLE_ML_BULLPEN_SHADOW: "true",
      ENABLE_HR_BULLPEN_SHADOW: "true",
      ENABLE_HR_HAND_SPLIT_SHADOW: "true",
      ENABLE_PHASE2_SHADOW_COMPARISON: "true",
    };

    // Same call shape the wrapper itself uses: spawnSync(execPath, [script, ...argv], { cwd, env: process.env, stdio: "inherit" }).
    const result = spawnSync(process.execPath, [dumpScript], { cwd: dir, env: markedEnv, stdio: "inherit" });
    assert.equal(result.status, 0);

    const forwarded = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(forwarded.MLB_K_PROJECTION_MODE, "shadow");
    for (const key of PHASE2_VARS) {
      assert.equal(forwarded[key], "true", `${key} must reach the child unchanged`);
    }
  });

  it("a non-zero child exit code surfaces in result.status (proves the wrapper's failure-propagation branch is reachable)", () => {
    const dir = freshDir();
    const failScript = path.join(dir, "fail.mjs");
    writeFileSync(failScript, `process.exitCode = 7;\n`, "utf8");
    const result = spawnSync(process.execPath, [failScript], { cwd: dir, env: process.env, stdio: "inherit" });
    assert.equal(result.status, 7);
  });
});

describe("getKProjectionMode (exported, pure): mode resolution", () => {
  it("reads MLB_K_PROJECTION_MODE=shadow from a passed-in env object", () => {
    assert.equal(getKProjectionMode({ MLB_K_PROJECTION_MODE: "shadow" }), "shadow");
  });

  it("falls back to legacy for an unset or invalid mode", () => {
    assert.equal(getKProjectionMode({}), "legacy");
    assert.equal(getKProjectionMode({ MLB_K_PROJECTION_MODE: "not-a-real-mode" }), "legacy");
  });

  it("accepts official as a valid mode", () => {
    assert.equal(getKProjectionMode({ MLB_K_PROJECTION_MODE: "official" }), "official");
  });
});

describe("applyKProjectionMode in shadow mode: live output is never overridden by the candidate", () => {
  it("shadow mode always keeps the legacy projection as the live value, regardless of candidate eligibility", () => {
    const payload = { pitchers: [{ pitcherId: 1, gameKey: "AAA@BBB", team: "AAA", projectedIP: 5.2, projectedK9: 9, projectedKs: 5.2, kLine: 5.5 }] };
    const row = {
      pitcherId: 1,
      gameKey: "AAA@BBB",
      team: "AAA",
      workloadFetchOk: true,
      confidence: { grade: "A", publicEligible: true, score: 0.9 },
      projection: { expectedBF: 22, expectedInnings: 6, workloadOnlyProjectedKs: 5.5, teamAdjustedKRate: 0.27, fullShadowProjectedKs: 5.94 },
      flags: [],
    };
    const shadow = { available: true, reason: null, byPitcherId: new Map([["1", row]]), byGameTeam: new Map() };
    const result = applyKProjectionMode(payload, shadow, "shadow").pitchers[0];
    assert.equal(result.projectedKs, 5.2, "shadow mode must not swap in the candidate for the live field");
    assert.equal(result.projectionSource, "legacy");
    assert.equal(result.candidateProjectedKs, 5.9, "the candidate is still computed and exposed for comparison");
  });
});
