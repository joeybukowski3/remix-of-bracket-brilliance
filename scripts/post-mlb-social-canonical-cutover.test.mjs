/**
 * post-mlb-social-canonical-cutover.test.mjs
 * Run via: node --test scripts/post-mlb-social-canonical-cutover.test.mjs
 *
 * Proves the Phase 7 cutover guard is wired into the real CLI entrypoint
 * (post-mlb-social-canonical.mjs), not just the pure readiness helper --
 * runs the actual script as a subprocess for a pre-cutover slate date and
 * confirms it short-circuits to NO_POST_FOR_SLATE before touching state,
 * plan build, or X.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_CUTOVER_FIRST_SLATE_DATE } from "./lib/mlb-x-canonical-readiness.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = path.join(ROOT, "scripts", "post-mlb-social-canonical.mjs");

function run(args) {
  return execFileSync("node", [SCRIPT_PATH, ...args], { cwd: ROOT, encoding: "utf8" });
}

describe("post-mlb-social-canonical.mjs -- Phase 7 cutover short-circuit", () => {
  it("a pre-cutover slate date resolves NO_POST_FOR_SLATE without building a plan or calling X", () => {
    const preCutoverDate = "2026-08-19";
    assert.ok(preCutoverDate < CANONICAL_CUTOVER_FIRST_SLATE_DATE);
    const stdout = run(["--product=hr", `--slate-date=${preCutoverDate}`, "--source=fixture", "--dry-run"]);
    assert.match(stdout, /"readinessStatus":\s*"NO_POST_FOR_SLATE"/);
    assert.match(stdout, /"reason":\s*"BEFORE_CANONICAL_CUTOVER"/);
    assert.match(stdout, /"planBuilt":\s*false/);
    assert.match(stdout, /"wouldCallX":\s*false/);
    assert.match(stdout, /finalOutcome=NO_POST_FOR_SLATE/);
  });

  it("2026-08-20 is the cutover constant's value -- the first eligible canonical live slate", () => {
    assert.equal(CANONICAL_CUTOVER_FIRST_SLATE_DATE, "2026-08-20");
  });

  it("the cutover date itself is NOT blocked (first valid canonical live slate)", () => {
    const stdout = run(["--product=hr", `--slate-date=${CANONICAL_CUTOVER_FIRST_SLATE_DATE}`, "--source=fixture", "--dry-run"]);
    assert.doesNotMatch(stdout, /BEFORE_CANONICAL_CUTOVER/);
  });
});
