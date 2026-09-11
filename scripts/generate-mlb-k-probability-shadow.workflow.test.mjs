/**
 * generate-mlb-k-probability-shadow.workflow.test.mjs
 * Run via: node --test scripts/generate-mlb-k-probability-shadow.workflow.test.mjs
 *
 * Static ordering contract for the K probability/value SHADOW step in the
 * "Generate MLB Data" workflow -- mirrors the style of
 * scripts/lib/mlb-slate-workflow.test.mjs (plain string-offset assertions
 * against the real committed YAML, not a parsed/mocked copy, so a step
 * reorder in the actual workflow file fails this test).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/generate-mlb-hr-props.yml", "utf8");

function indexOfOrThrow(haystack, needle, label) {
  const index = haystack.indexOf(needle);
  assert.ok(index !== -1, `expected to find ${label} in the workflow file`);
  return index;
}

test("K probability shadow generation runs after odds injection, V4 shadow diagnostics, and projection resolution", () => {
  const injectOdds = indexOfOrThrow(workflow, "run: node scripts/inject-k-odds.mjs", "inject-k-odds step");
  const generateV2Shadow = indexOfOrThrow(workflow, "run: npm run mlb:k-props-v2-shadow", "K props V2 shadow generation step");
  const validateV2Shadow = indexOfOrThrow(workflow, "run: npm run mlb:k-props-v2-shadow:validate", "K props V2 shadow validation step");
  const resolveProjection = indexOfOrThrow(workflow, "run: npm run mlb:k-production-projection", "production projection resolution step");
  const generateProbabilityShadow = indexOfOrThrow(
    workflow,
    "run: node scripts/generate-mlb-k-probability-shadow.mjs",
    "K probability shadow generation step",
  );

  assert.ok(injectOdds < generateV2Shadow, "K odds must be injected before the V2/V4 shadow artifact is generated");
  assert.ok(generateV2Shadow < validateV2Shadow, "V2/V4 shadow generation must run before its own validation");
  assert.ok(validateV2Shadow < resolveProjection, "V2/V4 shadow validation must run before production projection resolution");
  assert.ok(resolveProjection < generateProbabilityShadow, "production projection resolution (authoritative projectedKs) must run before the probability shadow layer reads it");
});

test("K probability shadow generation is fail-soft (never blocks the authoritative MLB pipeline)", () => {
  const stepStart = workflow.indexOf("- name: Generate K probability/value shadow artifact");
  assert.ok(stepStart !== -1, "expected the K probability shadow step to exist");
  const stepEnd = workflow.indexOf("\n      - name:", stepStart + 1);
  const step = workflow.slice(stepStart, stepEnd === -1 ? undefined : stepEnd);
  assert.match(step, /continue-on-error:\s*true/, "the shadow step must be continue-on-error so a probability-layer failure never blocks the authoritative pipeline");
  assert.match(step, /run: node scripts\/generate-mlb-k-probability-shadow\.mjs/);
});

test("the resolve production K projection step is NOT continue-on-error (authoritative, must remain a hard gate)", () => {
  const stepStart = workflow.indexOf("- name: Resolve production K projection");
  const stepEnd = workflow.indexOf("\n      - name:", stepStart + 1);
  // Strip comment lines before matching: the NEXT step's own leading comment
  // block (describing itself, including the word "continue-on-error") sits
  // between this step's real body and the next "- name:" line, and is not
  // part of this step's own YAML keys.
  const step = workflow
    .slice(stepStart, stepEnd)
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(step, /continue-on-error/, "the probability shadow work must never weaken the authoritative projection step's own failure behavior");
});

test("published MLB data commit step covers the whole public/data/mlb directory, so the new artifact needs no separate git add", () => {
  assert.match(workflow, /git add public\/data\/mlb\/ /);
});
