/**
 * mlb-phase2-shadow-isolation.test.mjs
 * Run via: node --test scripts/mlb-phase2-shadow-isolation.test.mjs
 *
 * Proves Phase 2 remains isolated from live scoring and public consumers
 * while the HR archive now intentionally persists its evaluation fields:
 *   1. The ML archive still ignores an injected HR shadow.
 *   2. The HR archive serializes only the documented shadow fields.
 *   3. Social-post, live grading logic, and src/** files do not consume
 *      the shadow score for production decisions.
 *
 * As of the Phase 2 workflow-activation commit, the shared "Generate MLB
 * Data" workflow (.github/workflows/generate-mlb-hr-props.yml) is an
 * intentional, explicitly gated consumer of the comparison BUILD SCRIPT
 * (not the `phase2Shadow` field itself, and not the artifact's contents)
 * -- see the dedicated assertions below and the fuller gating coverage
 * in scripts/mlb-phase2-workflow.test.mjs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArchiveRecord as buildMlArchiveRecord } from "./lib/mlb-ml-archive.mjs";
import { buildArchiveRecord as buildHrArchiveRecord } from "./lib/mlb-hr-archive.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

describe("Archive whitelist regression: Phase 2 persistence is scoped to HR tracking", () => {
  it("mlb-ml-archive.mjs's buildArchiveRecord ignores an injected phase2Shadow field", () => {
    const pick = {
      gameId: 12345,
      gameKey: "NYY@BOS",
      pick: "away",
      pickAbbr: "NYY",
      confidence: 62,
      differential: 5,
      topFactor: "Pitcher Quality",
      factors: [],
      priceAtPick: null,
      polymarketAtPick: null,
      // Injected -- must NOT survive into the archive record.
      phase2Shadow: { combinedShadowScore: 99, enabledComponents: { projectedIp: true } },
    };
    const record = buildMlArchiveRecord({ pick, date: "2026-07-03", generatedAt: new Date().toISOString(), modelVersion: "mlb-ml-edge-v1.0" });
    assert.equal("phase2Shadow" in record, false, "buildArchiveRecord must not copy phase2Shadow into the archive record");
  });

  it("mlb-hr-archive.mjs persists the documented Phase 2 evaluation fields", () => {
    const player = {
      playerId: 592450,
      player: "Aaron Judge",
      team: "NYY",
      opponent: "BOS",
      opposingPitcherId: 1,
      opposingPitcher: "Chris Sale",
      lineupStatus: "confirmed",
      battingOrder: 3,
      gameId: 12345,
      hrScore: 62.4,
      hrScoreRank: 1,
      starterConfirmed: true,
      phase2Rank: 1,
      phase2Shadow: {
        combinedShadowScore: 99,
        shadowExperimentVersion: "phase2-test-v1",
        enabledComponents: { bullpen: true, handSplit: true },
        componentContributions: { bullpen: 1, handSplit: 2 },
        componentAvailability: { bullpen: true, handSplit: true },
      },
    };
    const record = buildHrArchiveRecord({ player, date: "2026-07-03", generatedAt: new Date().toISOString(), modelVersion: "mlb-hr-quality-v1.1", confidence: {} });
    assert.deepEqual(record.phase2Shadow, {
      enabled: true,
      combinedShadowScore: 99,
      rank: 1,
      version: "phase2-test-v1",
      bullpenContribution: 1,
      handSplitContribution: 2,
      bullpenAvailable: true,
      handSplitAvailable: true,
      bullpenFreshness: null,
      handSplitFreshness: null,
    });
  });
});

function walkFiles(dir, extensions) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkFiles(full, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function filesReferencing(files, needle) {
  return files.filter((file) => {
    try {
      return readFileSync(file, "utf8").includes(needle);
    } catch {
      return false;
    }
  });
}

describe("Static isolation: public consumers and live grading logic do not use phase2Shadow", () => {
  const guardedScripts = [
    "grade-mlb-ml-results.mjs",
    "grade-polymarket-results.mjs",
    "build-mlb-hr-performance-summary.mjs",
    "build-mlb-ml-performance-summary.mjs",
    "post-mlb-hr-props-to-x.mjs",
    "post-mlb-ml-edges-to-x.mjs",
    "post-mlb-strikeout-props-to-x.mjs",
  ].map((name) => path.join(ROOT, "scripts", name));

  it("none of the public consumer or unrelated grading scripts reference phase2Shadow", () => {
    const offenders = filesReferencing(guardedScripts, "phase2Shadow");
    assert.deepEqual(offenders, [], `unexpected phase2Shadow reference in: ${offenders.join(", ")}`);
  });

  it("live HR grading rules do not reference phase2Shadow", () => {
    const gradingLogic = [path.join(ROOT, "scripts", "lib", "mlb-hr-grading.mjs")];
    const offenders = filesReferencing(gradingLogic, "phase2Shadow");
    assert.deepEqual(offenders, [], "outcome grading must not depend on the shadow score");
  });

  it("the ML archive remains isolated from HR phase2Shadow", () => {
    const mlArchive = [path.join(ROOT, "scripts", "lib", "mlb-ml-archive.mjs")];
    assert.deepEqual(filesReferencing(mlArchive, "phase2Shadow"), []);
  });
});

describe("Static isolation: no src/ (public UI) file references phase2Shadow", () => {
  it("zero references across the entire src/ tree", () => {
    const srcFiles = walkFiles(path.join(ROOT, "src"), [".ts", ".tsx", ".js", ".jsx"]);
    const offenders = filesReferencing(srcFiles, "phase2Shadow");
    assert.deepEqual(offenders, [], `unexpected phase2Shadow reference in: ${offenders.join(", ")}`);
  });
});

// As of the Phase 2 workflow-activation commit, the "Generate MLB Data"
// workflow's final reporting step DOES intentionally read the
// phase2Shadow field name -- but only to report a boolean/count (whether
// it's present, and how many records have it) for observability, never
// to expose its contents, feed it to another consumer, or use it in any
// gating/business logic. This is a legitimate, narrow, explicitly
// requested reference, not a leak.
describe("Static isolation: the workflow's only phase2Shadow reference is a read-only presence/count check in its own reporting step", () => {
  it("every workflow OTHER than the shared MLB writer has zero references", () => {
    const otherWorkflowFiles = walkFiles(path.join(ROOT, ".github", "workflows"), [".yml", ".yaml"]).filter(
      (f) => path.basename(f) !== "generate-mlb-hr-props.yml"
    );
    const offenders = filesReferencing(otherWorkflowFiles, "phase2Shadow");
    assert.deepEqual(offenders, []);
  });

  it("the shared MLB writer references phase2Shadow only inside its own reporting step's read-only count/boolean check", () => {
    const generateMlbDataWorkflow = path.join(ROOT, ".github", "workflows", "generate-mlb-hr-props.yml");
    const text = readFileSync(generateMlbDataWorkflow, "utf8");
    const occurrences = (text.match(/phase2Shadow/g) ?? []).length;
    // b.phase2Shadow !== undefined, b.phase2Shadow?.handSplitShadow?.available (x2), and the
    // log label "contains phase2Shadow" -- presence/count checks and their log text only.
    assert.equal(occurrences, 4, "phase2Shadow should appear only in the reporting step's boolean/count checks");
    assert.doesNotMatch(text, /JSON\.stringify\(.*phase2Shadow/);
  });
});

describe("Static isolation: the comparison artifact (ml-phase2-shadow-comparison.json) has no public/production consumers", () => {
  const needles = ["ml-phase2-shadow-comparison.json", "mlb-phase2-shadow-comparison"];
  const guardedScripts = [
    "grade-mlb-hr-results.mjs",
    "grade-mlb-ml-results.mjs",
    "grade-polymarket-results.mjs",
    "build-mlb-hr-performance-summary.mjs",
    "build-mlb-ml-performance-summary.mjs",
    "post-mlb-hr-props-to-x.mjs",
    "post-mlb-ml-edges-to-x.mjs",
    "post-mlb-strikeout-props-to-x.mjs",
    "build-mlb-hr-archive.mjs",
    "build-mlb-ml-archive.mjs",
  ].map((name) => path.join(ROOT, "scripts", name));
  const archiveLibs = [path.join(ROOT, "scripts", "lib", "mlb-ml-archive.mjs"), path.join(ROOT, "scripts", "lib", "mlb-hr-archive.mjs")];

  it("no grader, performance-summary, social-post, or archive-builder script references the comparison artifact or its build module", () => {
    for (const needle of needles) {
      const offenders = filesReferencing([...guardedScripts, ...archiveLibs], needle);
      assert.deepEqual(offenders, [], `unexpected "${needle}" reference in: ${offenders.join(", ")}`);
    }
  });

  it("zero src/ (public UI) references to the comparison artifact or its build module", () => {
    const srcFiles = walkFiles(path.join(ROOT, "src"), [".ts", ".tsx", ".js", ".jsx"]);
    for (const needle of needles) {
      const offenders = filesReferencing(srcFiles, needle);
      assert.deepEqual(offenders, [], `unexpected "${needle}" reference in: ${offenders.join(", ")}`);
    }
  });

  // As of the Phase 2 workflow-activation commit, the shared "Generate MLB
  // Data" workflow IS an intentional, explicitly gated consumer of the
  // comparison build module (node scripts/build-mlb-phase2-shadow-
  // comparison.mjs), invoked only on workflow_dispatch with
  // enable_phase2_shadow=true. That gating (manual-dispatch-only, correct
  // env vars, tracked-write guard, ordering after both raw generators) is
  // covered by scripts/mlb-phase2-workflow.test.mjs, not here. This file
  // still confirms the workflow references NOTHING beyond the one
  // intended build-script invocation -- e.g. it must never read the
  // comparison JSON's contents back in, and no OTHER workflow may
  // reference it at all.
  it("the workflow's only reference to the comparison module is invoking its own build script, gated behind workflow_dispatch + enable_phase2_shadow", () => {
    const generateMlbDataWorkflow = path.join(ROOT, ".github", "workflows", "generate-mlb-hr-props.yml");
    const text = readFileSync(generateMlbDataWorkflow, "utf8");
    const occurrences = (text.match(/build-mlb-phase2-shadow-comparison\.mjs/g) ?? []).length;
    assert.equal(occurrences, 1, "the build script should be invoked exactly once");
    assert.doesNotMatch(text, /ml-phase2-shadow-comparison\.json['"`]?\s*,?\s*['"`]?utf8|readFileSync.*ml-phase2-shadow-comparison/, "the workflow must never read the comparison artifact's contents back in");
  });

  it("no OTHER workflow file references the comparison artifact or its build module", () => {
    const otherWorkflowFiles = walkFiles(path.join(ROOT, ".github", "workflows"), [".yml", ".yaml"]).filter(
      (f) => path.basename(f) !== "generate-mlb-hr-props.yml"
    );
    for (const needle of needles) {
      const offenders = filesReferencing(otherWorkflowFiles, needle);
      assert.deepEqual(offenders, [], `unexpected "${needle}" reference in: ${offenders.join(", ")}`);
    }
  });

  it("neither generator reads the comparison artifact or invokes its build script", () => {
    const generatorFiles = [path.join(ROOT, "scripts", "generate-mlb-ml-picks.mjs"), path.join(ROOT, "scripts", "generate-mlb-hr-props.mjs")];
    for (const needle of ["ml-phase2-shadow-comparison.json", "build-mlb-phase2-shadow-comparison.mjs"]) {
      const offenders = filesReferencing(generatorFiles, needle);
      assert.deepEqual(offenders, [], `unexpected "${needle}" reference in: ${offenders.join(", ")}`);
    }
  });
});
