import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Confirms the deprecated legacy X-posting workflow (see the top-of-file
// comment in .github/workflows/post-mlb-daily-picks.yml) can never make a
// live X API call, by asserting directly on the workflow file's content --
// the safest way to prove a *removed* capability stays removed, since a
// script-level unit test can't prove a workflow step doesn't exist.
const workflowSource = readFileSync(".github/workflows/post-mlb-daily-picks.yml", "utf8");

test("legacy workflow: the third-party tweet-posting action is not wired up as an active step (the deprecation comment above may still name it for documentation)", () => {
  assert.doesNotMatch(workflowSource, /uses:\s*snow-actions\/post-tweet/);
  assert.doesNotMatch(workflowSource, /^\s*-\s*name:\s*Post to X\s*$/m);
});

test("legacy workflow: the old X_API_KEY-style secret names are not referenced (confirms the removed step, not just a renamed one)", () => {
  assert.doesNotMatch(workflowSource, /secrets\.X_API_KEY/);
  assert.doesNotMatch(workflowSource, /secrets\.X_API_SECRET/);
  assert.doesNotMatch(workflowSource, /secrets\.X_ACCESS_TOKEN/);
  assert.doesNotMatch(workflowSource, /secrets\.X_ACCESS_SECRET/);
});

test("legacy workflow: workflow_dispatch is the only trigger (no schedule/workflow_run automatic path)", () => {
  assert.match(workflowSource, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflowSource, /^\s*schedule:/m);
  assert.doesNotMatch(workflowSource, /^\s*workflow_run:/m);
});

test("legacy workflow: still generates preview text (generation capability intentionally preserved)", () => {
  assert.match(workflowSource, /node scripts\/generate-mlb-daily-picks\.mjs/);
});

test("legacy script: never calls an X posting client directly (it only ever built tweet text; posting happened in the now-removed workflow step)", () => {
  const scriptSource = readFileSync("scripts/generate-mlb-daily-picks.mjs", "utf8");
  assert.doesNotMatch(scriptSource, /twitter-api-v2/);
  assert.doesNotMatch(scriptSource, /TwitterApi/);
});
