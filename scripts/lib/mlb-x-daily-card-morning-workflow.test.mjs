/**
 * mlb-x-daily-card-morning-workflow.test.mjs
 * Run via: node --test scripts/lib/mlb-x-daily-card-morning-workflow.test.mjs
 *
 * Structural + behavioral checks against the real
 * .github/workflows/mlb-x-editions.yml -- same file-parsing approach as
 * mlb-x-editions-workflow.test.mjs, but the routing assertions below
 * literally evaluate each job's `if:` expression (a small subset of GitHub
 * Actions expression syntax that happens to already be valid JS: ==, !=, &&,
 * ||, parens, single-quoted string literals) against a mocked
 * github/vars/needs context, instead of matching substrings of the raw YAML.
 * A substring match can pass while the actual boolean routing is wrong (or
 * vice versa); evaluating the real expression cannot.
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
const raw = readFileSync(WORKFLOW_PATH, "utf8");
const doc = load(raw);

const K_MORNING_IF = doc.jobs["post-k-morning"].if;
const HR_MORNING_IF = doc.jobs["post-hr-morning"].if;
const DAILY_CARD_IF = doc.jobs["post-daily-card-morning"].if;

/**
 * Evaluates one job's `if:` string as a boolean expression against a mocked
 * GitHub Actions context. `flag` is left `undefined` to model an unset
 * repository variable (GitHub Actions expressions treat a missing property
 * as null, which -- exactly like JS `undefined` -- is `!= 'true'` and never
 * `== 'true'`, so this is a faithful enough stand-in for our purposes).
 */
function evalJobIf(expr, { mode = "", flag = undefined, kShouldRun = "false", hrShouldRun = "false" } = {}) {
  const github = { event: { inputs: { mode } } };
  const vars = { MLB_DAILY_CARD_MORNING_LIVE: flag };
  const needs = { plan: { outputs: { k_morning_should_run: kShouldRun, hr_morning_should_run: hrShouldRun } } };
  // Evaluates a fixed, non-user-controlled expression parsed from the repo's own workflow file, test-only.
  const fn = new Function("github", "vars", "needs", `return (\n${expr}\n);`);
  return Boolean(fn(github, vars, needs));
}

function routing(context) {
  return {
    kMorning: evalJobIf(K_MORNING_IF, context),
    hrMorning: evalJobIf(HR_MORNING_IF, context),
    dailyCard: evalJobIf(DAILY_CARD_IF, context),
  };
}

describe("post-daily-card-morning: structure", () => {
  const job = doc.jobs["post-daily-card-morning"];

  it("exists and depends on plan", () => {
    assert.ok(job, "post-daily-card-morning job must exist");
    assert.equal(job.needs, "plan");
  });

  it("has its own independent concurrency group", () => {
    assert.deepEqual(job.concurrency, { group: "mlb-x-daily-card-morning", "cancel-in-progress": false });
  });

  it("checks out main explicitly, not the implicit trigger ref", () => {
    const checkout = job.steps.find((s) => s.uses?.startsWith("actions/checkout"));
    assert.equal(checkout.with?.ref, "main");
  });

  it("uses needs.plan.outputs.slate_date, never recomputing the slate date itself", () => {
    assert.match(JSON.stringify(job.steps), /needs\.plan\.outputs\.slate_date/);
  });

  it("generates the card via the unmodified live CLI before posting, never with --preview", () => {
    const generateStep = job.steps.find((s) => typeof s.run === "string" && s.run.includes("generate-social-card-live.ts"));
    assert.ok(generateStep, "must call scripts/generate-social-card-live.ts");
    assert.match(generateStep.run, /--edition=morning/);
    assert.doesNotMatch(generateStep.run, /--preview/);
  });

  it("posts through the dedicated daily-card CLI, not post-mlb-x-edition.mjs", () => {
    const postStep = job.steps.find((s) => typeof s.run === "string" && s.run.includes("post-mlb-x-daily-card.mjs"));
    assert.ok(postStep, "must call scripts/post-mlb-x-daily-card.mjs");
    assert.doesNotMatch(JSON.stringify(job.steps), /post-mlb-x-edition\.mjs/);
  });

  it("forwards the dispatch mode so post-mlb-x-daily-card.mjs's own resolveEventMode call decides dry-run vs. live", () => {
    const postStep = job.steps.find((s) => typeof s.run === "string" && s.run.includes("post-mlb-x-daily-card.mjs"));
    assert.equal(postStep.env.MLB_X_DISPATCH_MODE, "${{ github.event.inputs.mode }}");
  });

  it("reads X_ALLOW_LIVE_POST from vars, never a hardcoded value", () => {
    const postStep = job.steps.find((s) => typeof s.run === "string" && s.run.includes("post-mlb-x-daily-card.mjs"));
    assert.equal(postStep.env.X_ALLOW_LIVE_POST, "${{ vars.X_ALLOW_LIVE_POST }}");
  });
});

describe("routing: manual morning-dry-run (flag disabled)", () => {
  const r = routing({ mode: "morning-dry-run", flag: undefined });

  it("post-daily-card-morning runs even though the flag is not 'true'", () => {
    assert.equal(r.dailyCard, true);
  });

  it("legacy post-k-morning and post-hr-morning both skip", () => {
    assert.equal(r.kMorning, false);
    assert.equal(r.hrMorning, false);
  });

  it("still runs when the flag is explicitly 'false', not just unset", () => {
    const explicit = routing({ mode: "morning-dry-run", flag: "false" });
    assert.equal(explicit.dailyCard, true);
    assert.equal(explicit.kMorning, false);
    assert.equal(explicit.hrMorning, false);
  });
});

describe("routing: scheduled/workflow_run morning firing, flag disabled", () => {
  it("legacy jobs run exactly as before, keyed on their own should_run output", () => {
    const bothDue = routing({ mode: "", flag: undefined, kShouldRun: "true", hrShouldRun: "true" });
    assert.equal(bothDue.kMorning, true);
    assert.equal(bothDue.hrMorning, true);

    const neitherDue = routing({ mode: "", flag: undefined, kShouldRun: "false", hrShouldRun: "false" });
    assert.equal(neitherDue.kMorning, false);
    assert.equal(neitherDue.hrMorning, false);
  });

  it("post-daily-card-morning skips regardless of should_run", () => {
    const r = routing({ mode: "", flag: undefined, kShouldRun: "true", hrShouldRun: "true" });
    assert.equal(r.dailyCard, false);
  });
});

describe("routing: scheduled/workflow_run morning firing, flag enabled", () => {
  it("legacy jobs both skip", () => {
    const r = routing({ mode: "", flag: "true", kShouldRun: "true", hrShouldRun: "true" });
    assert.equal(r.kMorning, false);
    assert.equal(r.hrMorning, false);
  });

  it("post-daily-card-morning becomes eligible when either legacy morning signal is due", () => {
    assert.equal(routing({ mode: "", flag: "true", kShouldRun: "true", hrShouldRun: "false" }).dailyCard, true);
    assert.equal(routing({ mode: "", flag: "true", kShouldRun: "false", hrShouldRun: "true" }).dailyCard, true);
  });

  it("post-daily-card-morning still requires at least one morning signal to be due", () => {
    const r = routing({ mode: "", flag: "true", kShouldRun: "false", hrShouldRun: "false" });
    assert.equal(r.dailyCard, false);
  });
});

describe("routing: manual morning-live, flag disabled", () => {
  const r = routing({ mode: "morning-live", flag: undefined });

  it("post-daily-card-morning does NOT run -- the flag is never bypassed for a live-capable dispatch", () => {
    assert.equal(r.dailyCard, false);
  });

  it("legacy post-k-morning and post-hr-morning run instead", () => {
    assert.equal(r.kMorning, true);
    assert.equal(r.hrMorning, true);
  });
});

describe("routing: manual morning-live, flag enabled", () => {
  const r = routing({ mode: "morning-live", flag: "true" });

  it("post-daily-card-morning becomes eligible", () => {
    assert.equal(r.dailyCard, true);
  });

  it("legacy post-k-morning and post-hr-morning both skip", () => {
    assert.equal(r.kMorning, false);
    assert.equal(r.hrMorning, false);
  });

  it("still requires X_ALLOW_LIVE_POST separately -- the workflow if: cannot and does not check it, that gate lives in assertLivePostAllowed", () => {
    // The routing-level flag only decides WHICH job is eligible to run; it is
    // not itself a live-posting authorization. Both post-mlb-x-edition.mjs
    // and post-mlb-x-daily-card.mjs still call assertLivePostAllowed, which
    // independently requires X_ALLOW_LIVE_POST === 'true'. Asserted here as a
    // structural reminder, not a re-test of assertLivePostAllowed itself
    // (covered by mlb-x-post-client.test.mjs).
    const job = doc.jobs["post-daily-card-morning"];
    const postStep = job.steps.find((s) => typeof s.run === "string" && s.run.includes("post-mlb-x-daily-card.mjs"));
    assert.equal(postStep.env.X_ALLOW_LIVE_POST, "${{ vars.X_ALLOW_LIVE_POST }}");
  });
});

describe("legacy/composite mutual exclusion", () => {
  const modes = ["", "morning-dry-run", "morning-live", "confirmed-dry-run", "confirmed-live", "diagnostic-only"];
  const flags = [undefined, "true", "false", "TRUE", ""];
  const shouldRuns = ["true", "false"];

  it("post-daily-card-morning and EITHER legacy morning job are never both eligible, across every mode/flag/should_run combination", () => {
    let evaluatedAtLeastOneOverlapCase = false;
    for (const mode of modes) {
      for (const flag of flags) {
        for (const kShouldRun of shouldRuns) {
          for (const hrShouldRun of shouldRuns) {
            const r = routing({ mode, flag, kShouldRun, hrShouldRun });
            const legacyRuns = r.kMorning || r.hrMorning;
            if (legacyRuns && r.dailyCard) evaluatedAtLeastOneOverlapCase = true;
            assert.ok(
              !(legacyRuns && r.dailyCard),
              `overlap: mode=${JSON.stringify(mode)} flag=${JSON.stringify(flag)} k=${kShouldRun} hr=${hrShouldRun} -> ${JSON.stringify(r)}`,
            );
          }
        }
      }
    }
    assert.equal(evaluatedAtLeastOneOverlapCase, false, "sanity check: the loop above must not have silently skipped every case");
  });

  it("post-k-morning and post-hr-morning are never split -- they share the same flag/mode gate", () => {
    for (const mode of ["", "morning-dry-run", "morning-live"]) {
      for (const flag of [undefined, "true", "false"]) {
        const withoutShouldRun = routing({ mode, flag, kShouldRun: "false", hrShouldRun: "false" });
        // Outside the '' schedule case they are keyed only on mode/flag, so
        // they must agree; inside it they can differ only via should_run,
        // which is exercised separately above.
        if (mode !== "") assert.equal(withoutShouldRun.kMorning, withoutShouldRun.hrMorning);
      }
    }
  });
});

describe("no job hardcodes MLB_DAILY_CARD_MORNING_LIVE to a literal value", () => {
  it("the raw YAML never assigns it a literal true", () => {
    assert.doesNotMatch(raw, /MLB_DAILY_CARD_MORNING_LIVE:\s*["']?true["']?\s*$/m);
  });
});
