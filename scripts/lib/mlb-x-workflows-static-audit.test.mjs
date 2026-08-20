/**
 * mlb-x-workflows-static-audit.test.mjs
 * Run via: node --test scripts/lib/mlb-x-workflows-static-audit.test.mjs
 *
 * Phase 7 cutover regression guard. Scans the REAL workflow YAML files in
 * .github/workflows/ (not copies) and fails if any of the following ever
 * reappears:
 *   - a hardcoded X_ALLOW_LIVE_POST: "true" / true anywhere in any workflow
 *   - more than one MLB X workflow with a `schedule` trigger
 *   - a deprecated MLB X poster script referenced from a schedule-triggered
 *     workflow
 *   - mlb-x-editions.yml regaining a live-capable workflow_dispatch mode or
 *     its retired schedule/workflow_run triggers
 *   - poll-mlb-x-posts.yml regaining a schedule trigger
 *   - the canonical workflow losing its production-only sourcing
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const WORKFLOWS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".github", "workflows");

const DEPRECATED_MLB_X_SCRIPTS = [
  "post-mlb-x-edition.mjs",
  "post-mlb-hr-props-to-x.mjs",
  "post-mlb-strikeout-props-to-x.mjs",
];

function loadWorkflow(filename) {
  const filePath = path.join(WORKFLOWS_DIR, filename);
  return { filePath, raw: readFileSync(filePath, "utf8"), doc: load(readFileSync(filePath, "utf8")) };
}

function allRunCommands(doc) {
  const commands = [];
  for (const job of Object.values(doc.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (typeof step.run === "string") commands.push(step.run);
    }
  }
  return commands.join("\n");
}

function hasScheduleTrigger(doc) {
  return Boolean(doc.on?.schedule);
}

const allWorkflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

// Scoped to the HR/K ("mlb-hr-props"/"mlb-k-props") canonical identity this
// cutover governs -- see the task's own "CUTOVER INVARIANT" section.
// Unrelated MLB X products (Numerology, ML edges) have their own separate
// posting workflows/receipts and are out of scope for this audit.
const workflowFiles = [
  "mlb-x-canonical.yml",
  "mlb-x-editions.yml",
  "poll-mlb-x-posts.yml",
  "post-mlb-hr-props-to-x.yml",
  "post-mlb-strikeout-props-to-x.yml",
].filter((f) => allWorkflowFiles.includes(f));

describe("static workflow audit -- no hardcoded live-post authorization in any HR/K MLB X workflow", () => {
  it("every expected HR/K workflow file exists", () => {
    assert.deepEqual(workflowFiles.sort(), [
      "mlb-x-canonical.yml", "mlb-x-editions.yml", "poll-mlb-x-posts.yml",
      "post-mlb-hr-props-to-x.yml", "post-mlb-strikeout-props-to-x.yml",
    ].sort());
  });

  for (const filename of workflowFiles) {
    it(`${filename} never sets X_ALLOW_LIVE_POST to a literal "true"`, () => {
      const { raw } = loadWorkflow(filename);
      assert.doesNotMatch(raw, /X_ALLOW_LIVE_POST:\s*["']?true["']?\s*$/m);
    });
  }
});

describe("static workflow audit -- exactly one scheduled MLB X publisher", () => {
  it("mlb-x-canonical.yml is the only workflow with BOTH a schedule trigger and a reference to post-mlb-social-canonical.mjs", () => {
    const scheduledCanonicalPublishers = workflowFiles.filter((filename) => {
      const { doc } = loadWorkflow(filename);
      return hasScheduleTrigger(doc) && allRunCommands(doc).includes("post-mlb-social-canonical.mjs");
    });
    assert.deepEqual(scheduledCanonicalPublishers, ["mlb-x-canonical.yml"]);
  });

  it("no schedule-triggered workflow references a deprecated MLB X poster script", () => {
    for (const filename of workflowFiles) {
      const { doc } = loadWorkflow(filename);
      if (!hasScheduleTrigger(doc)) continue;
      const commands = allRunCommands(doc);
      for (const deprecated of DEPRECATED_MLB_X_SCRIPTS) {
        assert.ok(!commands.includes(deprecated), `${filename} has a schedule trigger and must not reference deprecated script "${deprecated}"`);
      }
    }
  });

  it("mlb-x-editions.yml no longer has schedule or workflow_run triggers", () => {
    const { doc } = loadWorkflow("mlb-x-editions.yml");
    assert.equal(doc.on.schedule, undefined);
    assert.equal(doc.on.workflow_run, undefined);
  });

  it("mlb-x-editions.yml's workflow_dispatch mode no longer offers a live-capable option", () => {
    const { doc } = loadWorkflow("mlb-x-editions.yml");
    const options = doc.on.workflow_dispatch.inputs.mode.options;
    assert.ok(!options.includes("morning-live"), "morning-live must not be selectable");
    assert.ok(!options.includes("confirmed-live"), "confirmed-live must not be selectable");
  });

  it("poll-mlb-x-posts.yml no longer has a schedule trigger", () => {
    const { doc } = loadWorkflow("poll-mlb-x-posts.yml");
    assert.equal(doc.on.schedule, undefined);
  });

  it("poll-mlb-x-posts.yml has NO post-hr/post-k jobs -- no code path can submit a real post, no override exists", () => {
    const { doc } = loadWorkflow("poll-mlb-x-posts.yml");
    assert.deepEqual(Object.keys(doc.jobs), ["plan"]);
  });

  it("poll-mlb-x-posts.yml never references X_ALLOW_LIVE_POST or an unsafe-override input anywhere", () => {
    const { raw } = loadWorkflow("poll-mlb-x-posts.yml");
    assert.doesNotMatch(raw, /X_ALLOW_LIVE_POST/);
    assert.doesNotMatch(raw, /confirm_unsafe/i);
  });

  it("poll-mlb-x-posts.yml never invokes the legacy HR/K posting scripts at all (its one job is a read-only diagnostic)", () => {
    const { doc } = loadWorkflow("poll-mlb-x-posts.yml");
    const commands = allRunCommands(doc);
    for (const deprecated of DEPRECATED_MLB_X_SCRIPTS) {
      assert.ok(!commands.includes(deprecated), `poll-mlb-x-posts.yml must not invoke "${deprecated}"`);
    }
  });

  it("the standalone manual HR/K rescue workflows offer only dry-run/verify-account modes -- no 'post' or 'post-text-only' option exists", () => {
    for (const filename of ["post-mlb-hr-props-to-x.yml", "post-mlb-strikeout-props-to-x.yml"]) {
      const { doc } = loadWorkflow(filename);
      const options = doc.on.workflow_dispatch.inputs.mode.options;
      assert.deepEqual(options, ["dry-run", "verify-account"]);
      assert.equal(doc.on.workflow_dispatch.inputs.mode.default, "dry-run");
    }
  });

  it("the standalone manual HR/K rescue workflows never reference X_ALLOW_LIVE_POST or an unsafe-override input anywhere", () => {
    for (const filename of ["post-mlb-hr-props-to-x.yml", "post-mlb-strikeout-props-to-x.yml"]) {
      const { raw } = loadWorkflow(filename);
      assert.doesNotMatch(raw, /X_ALLOW_LIVE_POST:/, `${filename} must never set X_ALLOW_LIVE_POST as an env key`);
      assert.doesNotMatch(raw, /confirm_unsafe/i, `${filename} must not contain an "unsafe override" mechanism (Phase 7 correction)`);
    }
  });

  it("post-mlb-strikeout-props-to-x.yml no longer has a push-triggered rescue path", () => {
    const { doc } = loadWorkflow("post-mlb-strikeout-props-to-x.yml");
    assert.equal(doc.on.push, undefined);
    assert.deepEqual(Object.keys(doc.on), ["workflow_dispatch"]);
  });

  it("neither standalone rescue workflow's job `if:` references a mode other than dry-run/verify-account", () => {
    for (const [filename, jobName] of [
      ["post-mlb-hr-props-to-x.yml", "post-hr-props-to-x"],
      ["post-mlb-strikeout-props-to-x.yml", "post-strikeout-props-to-x"],
    ]) {
      const { doc } = loadWorkflow(filename);
      assert.equal(doc.jobs[jobName].if, "github.event_name == 'workflow_dispatch'");
    }
  });
});

describe("static workflow audit -- mlb-x-canonical.yml sources only production data, never fixture", () => {
  it("publish-hr and publish-k both pass --source=production and --live", () => {
    const { doc } = loadWorkflow("mlb-x-canonical.yml");
    for (const job of ["publish-hr", "publish-k"]) {
      const commands = doc.jobs[job].steps.map((s) => s.run).filter(Boolean).join("\n");
      assert.match(commands, /--source=production/);
      assert.match(commands, /--live/);
      assert.doesNotMatch(commands, /--source=fixture/);
    }
  });

  it("publish-hr and publish-k have independent concurrency groups", () => {
    const { doc } = loadWorkflow("mlb-x-canonical.yml");
    assert.notEqual(doc.jobs["publish-hr"].concurrency.group, doc.jobs["publish-k"].concurrency.group);
  });

  it("X_ALLOW_LIVE_POST is read from the repo variable, never hardcoded", () => {
    const { doc } = loadWorkflow("mlb-x-canonical.yml");
    for (const job of ["publish-hr", "publish-k"]) {
      const env = doc.jobs[job].steps.find((s) => s.env && "X_ALLOW_LIVE_POST" in s.env).env;
      assert.equal(env.X_ALLOW_LIVE_POST, "${{ vars.X_ALLOW_LIVE_POST }}");
    }
  });

  it("derives the slate date from America/New_York, never the runner's raw UTC date", () => {
    const { doc } = loadWorkflow("mlb-x-canonical.yml");
    for (const job of ["publish-hr", "publish-k"]) {
      const step = doc.jobs[job].steps.find((s) => s.id === "et_date");
      assert.match(step.run, /TZ=America\/New_York date \+%Y-%m-%d/);
    }
  });
});
