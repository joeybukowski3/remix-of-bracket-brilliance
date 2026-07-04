/**
 * mlb-phase2-workflow.test.mjs
 * Run via: node --test scripts/mlb-phase2-workflow.test.mjs
 *
 * Static validation of .github/workflows/generate-mlb-hr-props.yml's
 * Phase 2 activation wiring. Parses the real YAML (js-yaml) and asserts
 * structure/gating -- this cannot execute a real GitHub Actions run, so
 * it verifies the DEFINITION is correct rather than simulating runtime
 * expression evaluation on GitHub's own servers. A small local evaluator
 * (below) simulates the specific, limited expression syntax this
 * workflow actually uses (equality/inequality, `&&`, `always()`) against
 * synthetic per-scenario contexts, to prove exactly which steps would
 * run for each of the 5 documented input combinations.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const WORKFLOW_PATH = path.join(import.meta.dirname, "..", ".github", "workflows", "generate-mlb-hr-props.yml");
const RAW_TEXT = readFileSync(WORKFLOW_PATH, "utf8");
const WORKFLOW = yaml.load(RAW_TEXT);
// js-yaml parses the bare YAML key `on:` as boolean `true` (YAML 1.1 quirk) -- read it back either way.
const TRIGGERS = WORKFLOW.on ?? WORKFLOW[true];
const JOB = WORKFLOW.jobs["generate-mlb-data"];
const STEPS = JOB.steps;

function stepByName(name) {
  return STEPS.find((s) => s.name === name);
}
function stepIndex(name) {
  return STEPS.findIndex((s) => s.name === name);
}

// ---------------------------------------------------------------------------
// Minimal evaluator for this workflow's actual `if:` expression syntax.
// ---------------------------------------------------------------------------
function resolvePath(dotted, context) {
  return dotted.split(".").reduce((node, key) => (node == null ? undefined : node[key]), context);
}

function evaluateClause(clause, context) {
  const eq = clause.match(/^([\w.]+)\s*(==|!=)\s*'([^']*)'$/);
  if (!eq) throw new Error(`Unsupported test-evaluator clause: "${clause}"`);
  const [, dotted, op, literal] = eq;
  const actual = resolvePath(dotted, context);
  return op === "==" ? actual === literal : actual !== literal;
}

function evaluateIf(expr, context) {
  if (expr === undefined) return true; // no `if:` -> step always runs
  if (expr === "always()") return true;
  return expr.split("&&").map((c) => c.trim()).every((clause) => evaluateClause(clause, context));
}

function runningStepNames(context) {
  return STEPS.filter((s) => evaluateIf(s.if, context)).map((s) => s.name);
}

// ---------------------------------------------------------------------------
// Scenario contexts. `steps.phase2.outputs.*` values represent what the
// (separately tested) "Resolve Phase 2 flags" step would have already
// resolved for that combination -- see the "scheduled runs default to
// Phase 2 off" suite below for proof that resolution itself is correct.
// `count` outputs assume a non-empty real slate (nonzero player ids).
// ---------------------------------------------------------------------------
function context({ eventName, enableShadow, refreshCaches }) {
  return {
    github: { event_name: eventName },
    steps: {
      phase2: { outputs: { enable_shadow: enableShadow, refresh_caches: refreshCaches } },
      extract_ids_preliminary: { outputs: { count: enableShadow === "true" && refreshCaches === "true" ? "5" : "0" } },
      extract_ids_post_generation: { outputs: { count: refreshCaches === "true" && enableShadow !== "true" ? "5" : "0" } },
    },
  };
}

const SCHEDULED = context({ eventName: "schedule", enableShadow: "false", refreshCaches: "false" });
const MANUAL_FALSE_FALSE = context({ eventName: "workflow_dispatch", enableShadow: "false", refreshCaches: "false" });
const MANUAL_TRUE_FALSE = context({ eventName: "workflow_dispatch", enableShadow: "true", refreshCaches: "false" });
const MANUAL_FALSE_TRUE = context({ eventName: "workflow_dispatch", enableShadow: "false", refreshCaches: "true" });
const MANUAL_TRUE_TRUE = context({ eventName: "workflow_dispatch", enableShadow: "true", refreshCaches: "true" });

const PHASE2_GATED_STEPS = [
  "Refresh Phase 2 bullpen cache",
  "Preliminary HR generation for Phase 2 cache IDs",
  "Extract Phase 2 batter IDs (preliminary pass)",
  "Refresh batter hand-split cache",
  "Extract Phase 2 batter IDs (post-generation)",
  "Refresh batter hand-split cache (post-generation)",
  "Build Phase 2 shadow comparison",
];
const ALWAYS_RUNS = ["Generate final HR props and best bets", "Update HR prediction archive", "Generate Moneyline Edge picks", "Update Moneyline prediction archive"];

describe("valid YAML", () => {
  it("parses without error and has the expected top-level shape", () => {
    assert.ok(WORKFLOW);
    assert.equal(WORKFLOW.name, "Generate MLB Data");
    assert.ok(JOB, "generate-mlb-data job must exist");
    assert.ok(Array.isArray(STEPS) && STEPS.length > 0);
  });

  it("does not create a second competing MLB data writer workflow", () => {
    assert.equal(Object.keys(WORKFLOW.jobs).length, 1);
    assert.deepEqual(Object.keys(WORKFLOW.jobs), ["generate-mlb-data"]);
  });
});

describe("workflow_dispatch inputs", () => {
  it("defines enable_phase2_shadow as a required boolean defaulting to false", () => {
    const input = TRIGGERS.workflow_dispatch.inputs.enable_phase2_shadow;
    assert.ok(input);
    assert.equal(input.type, "boolean");
    assert.equal(input.required, true);
    assert.equal(input.default, false);
  });

  it("defines refresh_phase2_caches as a required boolean defaulting to false", () => {
    const input = TRIGGERS.workflow_dispatch.inputs.refresh_phase2_caches;
    assert.ok(input);
    assert.equal(input.type, "boolean");
    assert.equal(input.required, true);
    assert.equal(input.default, false);
  });

  it("leaves the schedule and push triggers untouched", () => {
    assert.ok(Array.isArray(TRIGGERS.schedule) && TRIGGERS.schedule.length === 4);
    assert.ok(TRIGGERS.push);
    assert.deepEqual(TRIGGERS.push.branches, ["main"]);
  });
});

describe("scheduled runs default to Phase 2 off (flag resolution itself)", () => {
  const flagsStep = stepByName("Resolve Phase 2 flags");

  it("exists with a stable id", () => {
    assert.ok(flagsStep);
    assert.equal(flagsStep.id, "phase2");
  });

  it("gates BOTH effective flags on github.event_name == 'workflow_dispatch' before honoring the input", () => {
    const eventGateCount = (flagsStep.run.match(/github\.event_name\s*\}\}"\s*=\s*"workflow_dispatch"/g) ?? []).length;
    assert.equal(eventGateCount, 2, "both enable_shadow and refresh_caches resolution must check event_name first");
    assert.match(flagsStep.run, /inputs\.enable_phase2_shadow/);
    assert.match(flagsStep.run, /inputs\.refresh_phase2_caches/);
  });

  it("writes both outputs unconditionally to GITHUB_OUTPUT (always resolves to a concrete true/false)", () => {
    assert.match(flagsStep.run, /enable_shadow=\$\{ENABLE_SHADOW\}.*>>\s*"\$GITHUB_OUTPUT"/);
    assert.match(flagsStep.run, /refresh_caches=\$\{REFRESH_CACHES\}.*>>\s*"\$GITHUB_OUTPUT"/);
  });
});

describe("scenario 1: scheduled run", () => {
  const running = runningStepNames(SCHEDULED);

  it("runs exactly one HR generation (the always-run final step)", () => {
    assert.ok(running.includes("Generate final HR props and best bets"));
    assert.ok(!running.includes("Preliminary HR generation for Phase 2 cache IDs"));
  });

  it("performs no cache refresh", () => {
    assert.ok(!running.includes("Refresh Phase 2 bullpen cache"));
    assert.ok(!running.includes("Refresh batter hand-split cache"));
    assert.ok(!running.includes("Refresh batter hand-split cache (post-generation)"));
  });

  it("runs with all Phase 2 flags false and no comparison", () => {
    assert.equal(SCHEDULED.steps.phase2.outputs.enable_shadow, "false");
    assert.ok(!running.includes("Build Phase 2 shadow comparison"));
  });
});

describe("scenario 2: manual false/false", () => {
  const running = runningStepNames(MANUAL_FALSE_FALSE);

  it("runs exactly one HR generation, no Phase 2 shadow", () => {
    assert.ok(running.includes("Generate final HR props and best bets"));
    assert.ok(!running.includes("Preliminary HR generation for Phase 2 cache IDs"));
    for (const name of PHASE2_GATED_STEPS) assert.ok(!running.includes(name), `"${name}" must not run`);
  });
});

describe("scenario 3: manual true/false", () => {
  const running = runningStepNames(MANUAL_TRUE_FALSE);

  it("runs exactly one HR generation with shadows enabled", () => {
    assert.ok(running.includes("Generate final HR props and best bets"));
    assert.ok(!running.includes("Preliminary HR generation for Phase 2 cache IDs"));
    assert.equal(MANUAL_TRUE_FALSE.steps.phase2.outputs.enable_shadow, "true");
  });

  it("performs no cache refresh", () => {
    assert.ok(!running.includes("Refresh Phase 2 bullpen cache"));
    assert.ok(!running.includes("Refresh batter hand-split cache"));
    assert.ok(!running.includes("Extract Phase 2 batter IDs (post-generation)"));
    assert.ok(!running.includes("Refresh batter hand-split cache (post-generation)"));
  });

  it("still runs the comparison step (shadow enabled)", () => {
    assert.ok(running.includes("Build Phase 2 shadow comparison"));
  });
});

describe("scenario 4: manual false/true", () => {
  const running = runningStepNames(MANUAL_FALSE_TRUE);

  it("allows cache refresh (bullpen, and hand-split post-generation)", () => {
    assert.ok(running.includes("Refresh Phase 2 bullpen cache"));
    assert.ok(running.includes("Extract Phase 2 batter IDs (post-generation)"));
    assert.ok(running.includes("Refresh batter hand-split cache (post-generation)"));
  });

  it("runs exactly one HR generation (no preliminary pass) with shadows disabled", () => {
    assert.ok(running.includes("Generate final HR props and best bets"));
    assert.ok(!running.includes("Preliminary HR generation for Phase 2 cache IDs"));
    assert.equal(MANUAL_FALSE_TRUE.steps.phase2.outputs.enable_shadow, "false");
  });

  it("does not run the preliminary-pass hand-split refresh or the comparison step", () => {
    assert.ok(!running.includes("Extract Phase 2 batter IDs (preliminary pass)"));
    assert.ok(!running.includes("Refresh batter hand-split cache"));
    assert.ok(!running.includes("Build Phase 2 shadow comparison"));
  });
});

describe("scenario 5: manual true/true (two-pass sequence)", () => {
  const running = runningStepNames(MANUAL_TRUE_TRUE);

  it("runs the preliminary HR generation, extraction, and pre-final hand-split refresh", () => {
    assert.ok(running.includes("Preliminary HR generation for Phase 2 cache IDs"));
    assert.ok(running.includes("Extract Phase 2 batter IDs (preliminary pass)"));
    assert.ok(running.includes("Refresh batter hand-split cache"));
  });

  it("does not run the post-generation refresh-only path (mutually exclusive with the two-pass path)", () => {
    assert.ok(!running.includes("Extract Phase 2 batter IDs (post-generation)"));
    assert.ok(!running.includes("Refresh batter hand-split cache (post-generation)"));
  });

  it("runs the final HR generation, and it is positioned after the preliminary pass and the hand-split refresh", () => {
    assert.ok(running.includes("Generate final HR props and best bets"));
    const preliminaryIdx = stepIndex("Preliminary HR generation for Phase 2 cache IDs");
    const extractIdx = stepIndex("Extract Phase 2 batter IDs (preliminary pass)");
    const refreshIdx = stepIndex("Refresh batter hand-split cache");
    const finalIdx = stepIndex("Generate final HR props and best bets");
    assert.ok(preliminaryIdx < extractIdx && extractIdx < refreshIdx && refreshIdx < finalIdx);
  });

  it("preliminary pass forces every shadow flag to the literal false (never inherited)", () => {
    const step = stepByName("Preliminary HR generation for Phase 2 cache IDs");
    const expectedFlags = [
      "ENABLE_ML_PROJECTED_IP_SHADOW", "ENABLE_ML_PARK_SHADOW", "ENABLE_BULLPEN_DATA_PIPELINE",
      "ENABLE_ML_BULLPEN_SHADOW", "ENABLE_HR_BULLPEN_SHADOW", "ENABLE_HR_HAND_SPLIT_SHADOW", "ENABLE_PHASE2_SHADOW_COMPARISON",
    ];
    for (const flag of expectedFlags) assert.equal(step.env[flag], "false", `${flag} must be forced false on the preliminary pass`);
  });

  it("archive update occurs only after the final HR generation (never after the preliminary pass)", () => {
    const finalIdx = stepIndex("Generate final HR props and best bets");
    const archiveIdx = stepIndex("Update HR prediction archive");
    const preliminaryIdx = stepIndex("Preliminary HR generation for Phase 2 cache IDs");
    assert.ok(archiveIdx > finalIdx && archiveIdx > preliminaryIdx);
    // And there is exactly one archive-update step -- the preliminary pass has no archive step of its own.
    assert.equal(STEPS.filter((s) => s.name === "Update HR prediction archive").length, 1);
  });

  it("comparison occurs only after both the final HR generation and ML generation", () => {
    const comparisonIdx = stepIndex("Build Phase 2 shadow comparison");
    assert.ok(comparisonIdx > stepIndex("Generate final HR props and best bets"));
    assert.ok(comparisonIdx > stepIndex("Generate Moneyline Edge picks"));
    assert.ok(running.includes("Build Phase 2 shadow comparison"));
  });
});

describe("the standard final HR generator step is never accidentally skipped", () => {
  it("has no `if:` condition at all, for every scenario", () => {
    const step = stepByName("Generate final HR props and best bets");
    assert.equal(step.if, undefined);
  });

  it("runs in all 5 documented scenarios", () => {
    for (const ctx of [SCHEDULED, MANUAL_FALSE_FALSE, MANUAL_TRUE_FALSE, MANUAL_FALSE_TRUE, MANUAL_TRUE_TRUE]) {
      assert.ok(runningStepNames(ctx).includes("Generate final HR props and best bets"));
    }
  });
});

describe("HR generation is never doubled except when both inputs are true", () => {
  it("preliminary pass only runs in the true/true scenario", () => {
    for (const [name, ctx] of [
      ["scheduled", SCHEDULED], ["false/false", MANUAL_FALSE_FALSE], ["true/false", MANUAL_TRUE_FALSE], ["false/true", MANUAL_FALSE_TRUE],
    ]) {
      assert.ok(!runningStepNames(ctx).includes("Preliminary HR generation for Phase 2 cache IDs"), `preliminary pass must not run for ${name}`);
    }
    assert.ok(runningStepNames(MANUAL_TRUE_TRUE).includes("Preliminary HR generation for Phase 2 cache IDs"));
  });
});

describe("correct env flag mapping on both generators (final HR + ML)", () => {
  const expectedFlags = [
    "ENABLE_ML_PROJECTED_IP_SHADOW", "ENABLE_ML_PARK_SHADOW", "ENABLE_BULLPEN_DATA_PIPELINE",
    "ENABLE_ML_BULLPEN_SHADOW", "ENABLE_HR_BULLPEN_SHADOW", "ENABLE_HR_HAND_SPLIT_SHADOW", "ENABLE_PHASE2_SHADOW_COMPARISON",
  ];

  it("final HR generation step carries all 7 flags, each mapped to the centralized enable_shadow output", () => {
    const step = stepByName("Generate final HR props and best bets");
    assert.equal(step.id, "generate_hr_props");
    for (const flag of expectedFlags) assert.equal(step.env[flag], "${{ steps.phase2.outputs.enable_shadow }}", flag);
  });

  it("ML generation step carries all 7 flags, each mapped to the centralized enable_shadow output", () => {
    const step = stepByName("Generate Moneyline Edge picks");
    assert.equal(step.id, "generate_ml_picks");
    for (const flag of expectedFlags) assert.equal(step.env[flag], "${{ steps.phase2.outputs.enable_shadow }}", flag);
  });
});

describe("cache steps gated correctly", () => {
  it("bullpen cache refresh is gated on workflow_dispatch AND refresh_caches only (independent of enable_shadow)", () => {
    const step = stepByName("Refresh Phase 2 bullpen cache");
    assert.match(step.if, /github\.event_name == 'workflow_dispatch'/);
    assert.match(step.if, /steps\.phase2\.outputs\.refresh_caches == 'true'/);
    assert.doesNotMatch(step.if, /enable_shadow/);
    assert.equal(step["continue-on-error"], true);
    assert.equal(step.env.ENABLE_BULLPEN_DATA_PIPELINE, "true");
    assert.equal(step.env.MLB_BULLPEN_ALLOW_TRACKED_WRITE, "true");
  });

  it("preliminary-pass hand-split refresh and post-generation hand-split refresh are mutually exclusive by construction", () => {
    const preliminary = stepByName("Refresh batter hand-split cache");
    const postGeneration = stepByName("Refresh batter hand-split cache (post-generation)");
    assert.match(preliminary.if, /steps\.phase2\.outputs\.enable_shadow == 'true'/);
    assert.match(postGeneration.if, /steps\.phase2\.outputs\.enable_shadow != 'true'/);
    for (const step of [preliminary, postGeneration]) {
      assert.equal(step["continue-on-error"], true);
      assert.equal(step.env.ENABLE_HAND_SPLIT_DATA_PIPELINE, "true");
      assert.equal(step.env.MLB_HAND_SPLIT_ALLOW_TRACKED_WRITE, "true");
    }
  });

  it("hand-split cache refresh never fetches every batter -- always an explicit --player= list", () => {
    for (const stepName of ["Refresh batter hand-split cache", "Refresh batter hand-split cache (post-generation)"]) {
      const step = stepByName(stepName);
      assert.match(step.run, /--player="\$\{\{ steps\.\w+\.outputs\.player_ids \}\}"/);
      assert.doesNotMatch(step.run, /--player=all/i);
    }
    for (const stepName of ["Extract Phase 2 batter IDs (preliminary pass)", "Extract Phase 2 batter IDs (post-generation)"]) {
      const step = stepByName(stepName);
      assert.match(step.run, /hr-props-raw\.json/);
      assert.doesNotMatch(step.run, /fetchAllTeams|fetch-all-batters|every.{0,10}batter/i);
    }
  });
});

describe("comparison step gated to manual shadow activation only", () => {
  it("is gated on workflow_dispatch AND enable_shadow, continue-on-error, correct env", () => {
    const step = stepByName("Build Phase 2 shadow comparison");
    assert.ok(step);
    assert.equal(step.id, "phase2_comparison");
    assert.match(step.if, /github\.event_name == 'workflow_dispatch'/);
    assert.match(step.if, /steps\.phase2\.outputs\.enable_shadow == 'true'/);
    assert.equal(step["continue-on-error"], true);
    assert.equal(step.env.ENABLE_PHASE2_SHADOW_COMPARISON, "true");
    assert.equal(step.env.MLB_PHASE2_COMPARISON_ALLOW_TRACKED_WRITE, "true");
  });
});

describe("tracked-write authorization vars appear only on their intended step", () => {
  it("MLB_BULLPEN_ALLOW_TRACKED_WRITE appears exactly once", () => {
    assert.equal((RAW_TEXT.match(/MLB_BULLPEN_ALLOW_TRACKED_WRITE/g) ?? []).length, 1);
  });

  it("MLB_HAND_SPLIT_ALLOW_TRACKED_WRITE appears exactly twice (once per hand-split refresh step)", () => {
    assert.equal((RAW_TEXT.match(/MLB_HAND_SPLIT_ALLOW_TRACKED_WRITE/g) ?? []).length, 2);
  });

  it("MLB_PHASE2_COMPARISON_ALLOW_TRACKED_WRITE appears exactly once", () => {
    assert.equal((RAW_TEXT.match(/MLB_PHASE2_COMPARISON_ALLOW_TRACKED_WRITE/g) ?? []).length, 1);
  });
});

describe("explicit, guarded Phase 2 staging paths", () => {
  const commitStep = stepByName("Commit and push updated MLB data");

  it("each of the 3 Phase 2 files is named explicitly (not relied on solely via directory recursion)", () => {
    assert.match(commitStep.run, /public\/data\/mlb\/team-bullpen-stats\.json/);
    assert.match(commitStep.run, /public\/data\/mlb\/batter-hand-splits-cache\.json/);
    assert.match(commitStep.run, /public\/data\/mlb\/ml-phase2-shadow-comparison\.json/);
    // Confirmed named literally inside the explicit staging loop's file list, not merely implied by the directory-level add.
    const loopBlockMatch = commitStep.run.match(/for f in[\s\S]*?done/);
    assert.ok(loopBlockMatch, "an explicit staging loop must exist");
    for (const file of ["team-bullpen-stats.json", "batter-hand-splits-cache.json", "ml-phase2-shadow-comparison.json"]) {
      assert.match(loopBlockMatch[0], new RegExp(file.replace(".", "\\.")));
    }
  });

  it("each explicit stage is existence-guarded before git add", () => {
    const guardedAddCount = (commitStep.run.match(/if \[ -f "\$f" \]; then\s*\n\s*git add "\$f"/g) ?? []).length;
    assert.equal(guardedAddCount, 1, "the guarded loop body should appear once (it iterates all 3 paths)");
    assert.match(commitStep.run, /for f in \\\s*\n\s*public\/data\/mlb\/team-bullpen-stats\.json/);
  });

  it("the broad directory-level add still exists and is documented as required for legacy files", () => {
    assert.match(commitStep.run, /git add public\/data\/mlb\/ public\/data\/betting-splits\/ public\/sitemap\.xml/);
    assert.match(commitStep.run, /Legacy generated files/);
  });

  it("no bare git add -A or git add . anywhere in the workflow", () => {
    assert.doesNotMatch(RAW_TEXT, /git add -A\b/);
    assert.doesNotMatch(RAW_TEXT, /git add \.\s*$/m);
  });
});

describe("reporting accuracy", () => {
  const summaryStep = stepByName("Report Phase 2 activation summary");

  it("always runs regardless of outcome", () => {
    assert.equal(summaryStep.if, "always()");
  });

  it("distinguishes preliminary, extraction, refresh, final, ML, and comparison outcomes", () => {
    assert.match(summaryStep.run, /preliminary HR generation:.*steps\.preliminary_hr_props\.outcome/);
    assert.match(summaryStep.run, /batter-id extraction \(preliminary pass\):.*steps\.extract_ids_preliminary\.outcome/);
    assert.match(summaryStep.run, /hand-split cache refresh \(pre-final\):.*steps\.refresh_handsplit_preliminary\.outcome/);
    assert.match(summaryStep.run, /final HR generation:.*steps\.generate_hr_props\.outcome/);
    assert.match(summaryStep.run, /batter-id extraction \(post-generation\):.*steps\.extract_ids_post_generation\.outcome/);
    assert.match(summaryStep.run, /hand-split cache refresh \(post-generation\):.*steps\.refresh_handsplit_post_generation\.outcome/);
    assert.match(summaryStep.run, /ML generation:.*steps\.generate_ml_picks\.outcome/);
    assert.match(summaryStep.run, /comparison:.*steps\.phase2_comparison\.outcome/);
  });

  it("reports extracted player-id counts for both extraction paths", () => {
    assert.match(summaryStep.run, /extract_ids_preliminary\.outputs\.count/);
    assert.match(summaryStep.run, /extract_ids_post_generation\.outputs\.count/);
  });

  it("reports whether final HR raw output contains phase2Shadow, and hand-split available/unavailable counts", () => {
    assert.match(summaryStep.run, /final HR raw contains phase2Shadow/);
    assert.match(summaryStep.run, /HR records with available hand-split shadow/);
    assert.match(summaryStep.run, /HR records with unavailable hand-split shadow/);
  });

  it("never dumps full JSON contents", () => {
    assert.doesNotMatch(summaryStep.run, /JSON\.stringify\([^)]*,\s*null,\s*2\)/);
    assert.doesNotMatch(summaryStep.run, /console\.log\(data\)/);
  });
});

describe("no UI/social workflow references", () => {
  it("does not reference any post-mlb-*-to-x.mjs social script", () => {
    assert.doesNotMatch(RAW_TEXT, /post-mlb-.*-to-x\.mjs/);
  });

  it("does not reference any src/ path", () => {
    assert.doesNotMatch(RAW_TEXT, /\bsrc\//);
  });
});

describe("no automatic scheduled activation was introduced", () => {
  it("no ENABLE_* Phase 2 flag is ever hardcoded to the literal string true outside a manual-dispatch-gated step's own env block", () => {
    const manualGatedSteps = new Set([
      "Refresh Phase 2 bullpen cache",
      "Refresh batter hand-split cache",
      "Refresh batter hand-split cache (post-generation)",
      "Build Phase 2 shadow comparison",
    ]);
    for (const step of STEPS) {
      if (!step.env) continue;
      const hasHardcodedEnableFlag = Object.entries(step.env).some(([key, value]) => key.startsWith("ENABLE_") && value === "true");
      if (hasHardcodedEnableFlag) {
        assert.ok(manualGatedSteps.has(step.name), `unexpected hardcoded ENABLE_* flag on step "${step.name}"`);
      }
    }
  });

  it("scheduled and manual-false/false scenarios produce identical running-step sets", () => {
    assert.deepEqual(runningStepNames(SCHEDULED), runningStepNames(MANUAL_FALSE_FALSE));
  });
});

// ---------------------------------------------------------------------------
// K-projection shadow integration (rebased onto main's e9b3d19, which added
// the K workload shadow pipeline and its wrapper entrypoint). These prove
// the two features share the workflow file without either regressing.
// ---------------------------------------------------------------------------
describe("K workload shadow steps are retained and unconditional", () => {
  it("both K-shadow steps exist with no `if:` gate, so they never depend on Phase 2 inputs", () => {
    const generate = stepByName("Generate K workload shadow");
    const validate = stepByName("Validate K workload shadow");
    assert.ok(generate);
    assert.ok(validate);
    assert.equal(generate.if, undefined);
    assert.equal(validate.if, undefined);
  });

  it("run in every one of the 5 documented scenarios", () => {
    for (const ctx of [SCHEDULED, MANUAL_FALSE_FALSE, MANUAL_TRUE_FALSE, MANUAL_FALSE_TRUE, MANUAL_TRUE_TRUE]) {
      const running = runningStepNames(ctx);
      assert.ok(running.includes("Generate K workload shadow"));
      assert.ok(running.includes("Validate K workload shadow"));
    }
  });

  it("the K-shadow-generation step appears exactly once (not duplicated across the two-pass HR sequence)", () => {
    assert.equal(STEPS.filter((s) => s.name === "Generate K workload shadow").length, 1);
  });

  it("K-shadow steps run before either HR generation pass", () => {
    const generateIdx = stepIndex("Generate K workload shadow");
    const validateIdx = stepIndex("Validate K workload shadow");
    const preliminaryIdx = stepIndex("Preliminary HR generation for Phase 2 cache IDs");
    const finalIdx = stepIndex("Generate final HR props and best bets");
    assert.ok(generateIdx < validateIdx);
    assert.ok(validateIdx < preliminaryIdx);
    assert.ok(validateIdx < finalIdx);
  });
});

describe("every HR generation path uses the K-shadow-aware wrapper", () => {
  it("the legacy generator is never invoked directly anywhere in the workflow", () => {
    assert.doesNotMatch(RAW_TEXT, /node scripts\/generate-mlb-hr-props\.mjs\b/);
  });

  it("preliminary and final HR generation both invoke generate-mlb-hr-props-with-k-shadow.mjs", () => {
    const preliminary = stepByName("Preliminary HR generation for Phase 2 cache IDs");
    const final = stepByName("Generate final HR props and best bets");
    assert.match(preliminary.run, /node scripts\/generate-mlb-hr-props-with-k-shadow\.mjs --force/);
    assert.match(final.run, /node scripts\/generate-mlb-hr-props-with-k-shadow\.mjs --force/);
  });

  it("the wrapper is invoked exactly twice (preliminary + final), matching the two HR passes", () => {
    const occurrences = (RAW_TEXT.match(/generate-mlb-hr-props-with-k-shadow\.mjs/g) ?? []).length;
    assert.equal(occurrences, 2);
  });
});

describe("every HR generation path sets MLB_K_PROJECTION_MODE=shadow", () => {
  it("preliminary HR generation sets MLB_K_PROJECTION_MODE: shadow", () => {
    const step = stepByName("Preliminary HR generation for Phase 2 cache IDs");
    assert.equal(step.env.MLB_K_PROJECTION_MODE, "shadow");
  });

  it("final HR generation sets MLB_K_PROJECTION_MODE: shadow", () => {
    const step = stepByName("Generate final HR props and best bets");
    assert.equal(step.env.MLB_K_PROJECTION_MODE, "shadow");
  });

  it("MLB_K_PROJECTION_MODE is never silently dropped or overridden to a non-shadow value on an HR-generating step", () => {
    for (const name of ["Preliminary HR generation for Phase 2 cache IDs", "Generate final HR props and best bets"]) {
      const step = stepByName(name);
      assert.equal(step.env.MLB_K_PROJECTION_MODE, "shadow", name);
    }
  });
});

describe("scheduled/push runs retain K-shadow mode alongside Phase 2 flags resolving false", () => {
  it("scheduled and push events still run the K wrapper with shadow mode, while every Phase 2 flag is false", () => {
    for (const ctx of [SCHEDULED, MANUAL_FALSE_FALSE]) {
      assert.equal(ctx.steps.phase2.outputs.enable_shadow, "false");
      assert.equal(ctx.steps.phase2.outputs.refresh_caches, "false");
      const running = runningStepNames(ctx);
      assert.ok(running.includes("Generate K workload shadow"));
      assert.ok(running.includes("Validate K workload shadow"));
      assert.ok(running.includes("Generate final HR props and best bets"));
    }
    const finalStep = stepByName("Generate final HR props and best bets");
    assert.equal(finalStep.env.MLB_K_PROJECTION_MODE, "shadow");
  });
});

describe("K-shadow step failure semantics are preserved from main, unchanged by this rebase", () => {
  it("Generate/Validate K workload shadow have no continue-on-error (same as main -- a failure still blocks the job)", () => {
    const generate = stepByName("Generate K workload shadow");
    const validate = stepByName("Validate K workload shadow");
    assert.equal(generate["continue-on-error"], undefined);
    assert.equal(validate["continue-on-error"], undefined);
  });
});
