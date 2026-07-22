/**
 * mlb-x-editions-workflow.test.mjs
 * Run via: node --test scripts/lib/mlb-x-editions-workflow.test.mjs
 *
 * Structural checks against the real workflow YAML -- guards against the
 * exact class of regression already found in this file's history: a
 * hardcoded X_ALLOW_LIVE_POST=true on the plan job defeats the
 * vars.X_ALLOW_LIVE_POST kill switch even though the four poster jobs read
 * it correctly. These assertions parse the actual file, not a copy.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const WORKFLOW_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".github", "workflows", "mlb-x-editions.yml",
);
const doc = load(readFileSync(WORKFLOW_PATH, "utf8"));

const POSTER_JOBS = ["post-k-morning", "post-hr-morning", "post-k-confirmed", "post-hr-confirmed"];
const VARS_EXPRESSION = "${{ vars.X_ALLOW_LIVE_POST }}";

function stepEnv(job, key) {
  return doc.jobs[job].steps.find((s) => s.env && key in s.env)?.env;
}

describe("13. planner no longer receives a hardcoded live authorization", () => {
  it("the plan job's X_ALLOW_LIVE_POST is the operator-controlled variable, never a literal \"true\"", () => {
    const env = stepEnv("plan", "X_ALLOW_LIVE_POST");
    assert.ok(env, "plan job must still read X_ALLOW_LIVE_POST (its own readiness/diagnostic genuinely consumes it)");
    assert.equal(env.X_ALLOW_LIVE_POST, VARS_EXPRESSION);
    assert.notEqual(env.X_ALLOW_LIVE_POST, "true");
    assert.notEqual(env.X_ALLOW_LIVE_POST, true);
  });

  for (const job of POSTER_JOBS) {
    it(`${job} still reads X_ALLOW_LIVE_POST from vars, never a hardcoded value`, () => {
      const env = stepEnv(job, "X_ALLOW_LIVE_POST");
      assert.equal(env.X_ALLOW_LIVE_POST, VARS_EXPRESSION);
    });
  }

  it("no job in the file sets X_ALLOW_LIVE_POST to a literal string at all", () => {
    const raw = readFileSync(WORKFLOW_PATH, "utf8");
    assert.doesNotMatch(raw, /X_ALLOW_LIVE_POST:\s*["']?true["']?\s*$/m);
  });
});

describe("simulation_now is wired end to end", () => {
  it("is declared as an optional workflow_dispatch input", () => {
    const inputs = doc.on.workflow_dispatch.inputs;
    assert.ok(inputs.simulation_now, "simulation_now input missing");
    assert.equal(inputs.simulation_now.required, false);
  });

  for (const job of ["plan", ...POSTER_JOBS, "diagnostic"]) {
    it(`${job} forwards simulation_now to the script as MLB_X_SIMULATION_NOW`, () => {
      const env = stepEnv(job, "MLB_X_SIMULATION_NOW");
      assert.ok(env, `${job} must forward simulation_now`);
      assert.equal(env.MLB_X_SIMULATION_NOW, "${{ github.event.inputs.simulation_now }}");
    });
  }
});
