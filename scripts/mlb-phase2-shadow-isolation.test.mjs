/**
 * mlb-phase2-shadow-isolation.test.mjs
 * Run via: node --test scripts/mlb-phase2-shadow-isolation.test.mjs
 *
 * Proves, without modifying archive/grader/social/UI behavior, that
 * `phase2Shadow` never reaches a graded archive record, a grader, a
 * social-post script, or any src/ (public UI) file:
 *   1. Archive whitelist regression: buildArchiveRecord() ignores an
 *      injected phase2Shadow field on the input, because both archive
 *      builders construct their record with an explicit field-by-field
 *      whitelist rather than a spread.
 *   2. Static isolation: grep-equivalent source scan confirming no
 *      grader, performance-summary, social-post, or src/** file
 *      references phase2Shadow at all.
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

describe("Archive whitelist regression: phase2Shadow is never copied into a graded archive record", () => {
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

  it("mlb-hr-archive.mjs's buildArchiveRecord ignores an injected phase2Shadow field", () => {
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
      // Injected -- must NOT survive into the archive record.
      phase2Shadow: { combinedShadowScore: 99, enabledComponents: { bullpen: true, handSplit: true } },
    };
    const record = buildHrArchiveRecord({ player, date: "2026-07-03", generatedAt: new Date().toISOString(), modelVersion: "mlb-hr-quality-v1.1", confidence: {} });
    assert.equal("phase2Shadow" in record, false, "buildArchiveRecord must not copy phase2Shadow into the archive record");
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

describe("Static isolation: no grader/performance-summary/social-post file references phase2Shadow", () => {
  const guardedScripts = [
    "grade-mlb-hr-results.mjs",
    "grade-mlb-ml-results.mjs",
    "grade-polymarket-results.mjs",
    "build-mlb-hr-performance-summary.mjs",
    "build-mlb-ml-performance-summary.mjs",
    "post-mlb-hr-props-to-x.mjs",
    "post-mlb-ml-edges-to-x.mjs",
    "post-mlb-strikeout-props-to-x.mjs",
  ].map((name) => path.join(ROOT, "scripts", name));

  it("none of the grader/performance-summary/social-post scripts reference phase2Shadow", () => {
    const offenders = filesReferencing(guardedScripts, "phase2Shadow");
    assert.deepEqual(offenders, [], `unexpected phase2Shadow reference in: ${offenders.join(", ")}`);
  });

  it("mlb-ml-archive.mjs and mlb-hr-archive.mjs library modules do not reference phase2Shadow", () => {
    const archiveLibs = [path.join(ROOT, "scripts", "lib", "mlb-ml-archive.mjs"), path.join(ROOT, "scripts", "lib", "mlb-hr-archive.mjs")];
    const offenders = filesReferencing(archiveLibs, "phase2Shadow");
    assert.deepEqual(offenders, []);
  });
});

describe("Static isolation: no src/ (public UI) file references phase2Shadow", () => {
  it("zero references across the entire src/ tree", () => {
    const srcFiles = walkFiles(path.join(ROOT, "src"), [".ts", ".tsx", ".js", ".jsx"]);
    const offenders = filesReferencing(srcFiles, "phase2Shadow");
    assert.deepEqual(offenders, [], `unexpected phase2Shadow reference in: ${offenders.join(", ")}`);
  });
});

describe("Static isolation: no workflow references phase2Shadow (activation is a separate, later commit)", () => {
  it("zero references across .github/workflows/", () => {
    const workflowFiles = walkFiles(path.join(ROOT, ".github", "workflows"), [".yml", ".yaml"]);
    const offenders = filesReferencing(workflowFiles, "phase2Shadow");
    assert.deepEqual(offenders, []);
  });
});
