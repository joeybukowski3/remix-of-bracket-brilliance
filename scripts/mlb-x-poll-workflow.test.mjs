import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import yaml from "js-yaml";

const ROOT = process.cwd();
const WORKFLOWS = path.join(ROOT, ".github", "workflows");
const HR_FILE = path.join(WORKFLOWS, "post-mlb-hr-props-to-x.yml");
const K_FILE = path.join(WORKFLOWS, "post-mlb-strikeout-props-to-x.yml");
const POLL_FILE = path.join(WORKFLOWS, "poll-mlb-x-posts.yml");

function source(file) {
  return readFileSync(file, "utf8");
}

function workflow(file) {
  return yaml.load(source(file));
}

function trigger(doc) {
  return doc.on;
}

function stepByName(job, name) {
  return job.steps.find((step) => step.name === name);
}

test("exactly one automatic 15-minute cron owner exists for HR and K", () => {
  const owners = readdirSync(WORKFLOWS)
    .filter((name) => name.endsWith(".yml"))
    .filter((name) => {
      const text = source(path.join(WORKFLOWS, name));
      return text.includes('cron: "*/15 12-23 * * *"') || text.includes('cron: "*/15 0-2 * * *"');
    });
  assert.deepEqual(owners, ["poll-mlb-x-posts.yml"]);
});

test("HR and K workflows are manual-only and retain every manual input", () => {
  for (const file of [HR_FILE, K_FILE]) {
    const on = trigger(workflow(file));
    assert.ok(on.workflow_dispatch);
    assert.equal(on.schedule, undefined);
    assert.equal(on.workflow_run, undefined);
    assert.deepEqual(on.workflow_dispatch.inputs.mode.options, ["dry-run", "post", "post-text-only", "verify-account"]);
    assert.deepEqual(on.workflow_dispatch.inputs.data_source.options, ["production", "github", "local"]);
    assert.equal(on.workflow_dispatch.inputs.force_repost.type, "boolean");
  }
});

test("shared plan restores both receipts before the only poll gate", () => {
  const plan = workflow(POLL_FILE).jobs.plan;
  const names = plan.steps.map((step) => step.name);
  const hrReceipt = names.indexOf("Restore HR posting receipt");
  const kReceipt = names.indexOf("Restore K posting receipt");
  const gate = names.indexOf("Build shared poll plan");
  assert.ok(hrReceipt >= 0 && kReceipt >= 0 && gate > hrReceipt && gate > kReceipt);
  assert.match(stepByName(plan, "Build shared poll plan").run, /plan-mlb-x-posts\.mjs/);
});

test("lightweight plan has no dependency setup and heavy setup is conditional", () => {
  const jobs = workflow(POLL_FILE).jobs;
  assert.equal(jobs.plan.steps.some((step) => String(step.uses ?? "").startsWith("actions/setup-node")), false);
  assert.equal(jobs.plan.steps.some((step) => /npm ci|playwright|npm run build/.test(step.run ?? "")), false);
  for (const name of ["post-hr", "post-k"]) {
    const job = jobs[name];
    assert.match(job.if, /needs\.plan\.outputs\.(hr|k)_should_run == 'true'/);
    for (const stepName of ["Install dependencies", "Install Playwright", "Build site for local export render"]) {
      assert.match(stepByName(job, stepName).if, /steps\.already\.outputs\.posted != 'true'/);
    }
  }
});

test("HR and K consume the same snapshot artifact through independent jobs", () => {
  const jobs = workflow(POLL_FILE).jobs;
  assert.ok(jobs["post-hr"]);
  assert.ok(jobs["post-k"]);
  assert.notEqual(jobs["post-hr"].concurrency.group, jobs["post-k"].concurrency.group);
  for (const name of ["post-hr", "post-k"]) {
    const job = jobs[name];
    assert.equal(job.env.MLB_X_POLL_SNAPSHOT_PATH, "artifacts/mlb-x-poll-snapshot.json");
    assert.match(stepByName(job, "Validate shared snapshot handoff").run, /MLB_X_POLL_SNAPSHOT_PATH/);
  }
});

test("automatic waiting cannot save a receipt and force_repost is manual-only", () => {
  const pollSource = source(POLL_FILE);
  assert.doesNotMatch(pollSource, /inputs\.force_repost|savePostReceipt/);
  assert.match(pollSource, /HR_X_FORCE_REPOST: "false"/);
  assert.match(pollSource, /K_X_FORCE_REPOST: "false"/);
  for (const jobName of ["post-hr", "post-k"]) {
    const job = workflow(POLL_FILE).jobs[jobName];
    const persist = job.steps.find((step) => String(step.name).startsWith("Persist "));
    assert.match(persist.if, /steps\.receipt\.outputs\.exists == 'true'/);
  }
  assert.match(source(HR_FILE), /HR_X_FORCE_REPOST: \$\{\{ inputs\.force_repost/);
  assert.match(source(K_FILE), /K_X_FORCE_REPOST: \$\{\{ inputs\.force_repost/);
});

test("shared and manual concurrency groups prevent overlapping posts without cancellation", () => {
  const poll = workflow(POLL_FILE);
  assert.equal(poll.concurrency.group, "poll-mlb-x-posts");
  assert.equal(poll.concurrency["cancel-in-progress"], false);
  assert.equal(poll.jobs["post-hr"].concurrency.group, workflow(HR_FILE).concurrency.group);
  assert.equal(poll.jobs["post-k"].concurrency.group, workflow(K_FILE).concurrency.group);
  assert.equal(poll.jobs["post-hr"].concurrency["cancel-in-progress"], false);
  assert.equal(poll.jobs["post-k"].concurrency["cancel-in-progress"], false);
});

test("Numerology and paused ML workflows are byte-for-byte unchanged", () => {
  const expected = new Map([
    ["post-mlb-numerology-to-x.yml", "90cba9285ff9f1afc20b98e8852e0ce66f568db76a21053081405abacf2216a1"],
    ["post-mlb-ml-edges-to-x.yml", "e311714124a9d1bfcfa1989a18cd9b3ac079acb9e639696f248093d86d17f55b"],
  ]);
  for (const [name, hash] of expected) {
    const actual = createHash("sha256").update(readFileSync(path.join(WORKFLOWS, name))).digest("hex");
    assert.equal(actual, hash, `${name} changed unexpectedly`);
  }
});

test("every edited workflow parses as YAML", () => {
  for (const file of [HR_FILE, K_FILE, POLL_FILE]) assert.doesNotThrow(() => workflow(file));
});
