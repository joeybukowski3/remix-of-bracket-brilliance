// CFB Model V2 WU6 §8/§17 — CLI-level coverage for scripts/cfb-v2-audit-
// shadow.ts: corrupt manifest handling (item C) and exit-code behavior
// against a real promoted HEALTHY state. Runs the real script as a child
// process against an isolated temp root via the same CFB_V2_TEST_ROOT
// seam scripts/cfb-v2-build-shadow.ts already established.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const BUILD_SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-v2-build-shadow.ts");
const AUDIT_SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-v2-audit-shadow.ts");

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function run(script: string, root: string, args: readonly string[] = []): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [VITE_NODE_CLI, script, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, CFB_V2_TEST_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("cfb-v2-audit-shadow.ts — CLI behavior (WU6 §8 item C, §17 exit codes)", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("C. corrupt (unparseable) manifest.json -> audit fails closed with a clear error, nonzero exit, no crash trace", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-audit-corrupt-"));
    writeJson(resolve(tempRoot, "data", "generated", "cfb", "v2", "preseason-ratings.json"), { records: [] });
    writeJson(resolve(tempRoot, "data", "generated", "cfb", "v2", "preseason-projections.json"), { records: [] });
    // Deliberately corrupt: not valid JSON.
    const manifestPath = resolve(tempRoot, "data", "generated", "cfb", "v2", "manifest.json");
    mkdirSync(resolve(manifestPath, ".."), { recursive: true });
    writeFileSync(manifestPath, "{ this is not valid json");
    const manifestBefore = readFileSync(manifestPath);

    const result = run(AUDIT_SCRIPT, tempRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/FAILED to load promoted shadow state/);
    // The corrupt file itself is never "fixed" or overwritten by the audit — read-only.
    expect(readFileSync(manifestPath).equals(manifestBefore)).toBe(true);
  }, 30000);

  it("audit of a nonexistent shadow state (nothing ever promoted) -> fails closed, nonzero exit", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-audit-empty-"));
    const auditResult = run(AUDIT_SCRIPT, tempRoot);
    expect(auditResult.status).not.toBe(0);
    expect(auditResult.stderr).toMatch(/FAILED to load promoted shadow state/);
  }, 30000);

  it("a real successfully-built (honest preseason) shadow state -> audit exits 0, DEGRADED, and writes a read-only summary without touching the promoted artifacts", async () => {
    const { CFB_EXTERNAL_TEAM_MAPPINGS } = await import("../src/data/cfb/externalTeamMapping");
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-audit-degraded-"));
    const teams = CFB_EXTERNAL_TEAM_MAPPINGS.map((m, i) => ({ id: 1000 + i, school: m.cfbdName, classification: "fbs" }));
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "teams-2026.json"), teams);
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "games-2026.json"), []);
    // A completed prior-season (2025) game is required so dataAsOf's
    // fallback chain (no 2026 games completed yet -> fall back to the
    // last completed 2025 game) has something real to resolve to — matches
    // what the real production raw cache always has (a full completed 2025
    // season) and avoids an undefined dataAsOf breaking rating provenance.
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "games-2025.json"), [
      { id: 8001, season: 2025, week: 15, seasonType: "regular", startDate: "2025-12-06T20:00:00.000Z", startTimeTBD: false, completed: true, neutralSite: false, homeId: 1000, homeTeam: teams[0].school, homeClassification: "fbs", homePoints: 24, awayId: 1001, awayTeam: teams[1].school, awayClassification: "fbs", awayPoints: 17 },
    ]);
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "game-team-stats-2025.json"), []);
    writeJson(resolve(tempRoot, "data", "generated", "cfb", "2026-schedule-v1.json"), []);
    const scoringSrc = resolve(REPO_ROOT, "data", "cfb", "v2-support", "scoring-normal-equations-2020-2025.json");
    const calibrationSrc = resolve(REPO_ROOT, "data", "cfb", "v2-support", "calibration-residual-seed-2020-2025.json");
    const scoringDest = resolve(tempRoot, "data", "cfb", "v2-support", "scoring-normal-equations-2020-2025.json");
    const calibrationDest = resolve(tempRoot, "data", "cfb", "v2-support", "calibration-residual-seed-2020-2025.json");
    mkdirSync(resolve(scoringDest, ".."), { recursive: true });
    writeFileSync(scoringDest, readFileSync(scoringSrc));
    writeFileSync(calibrationDest, readFileSync(calibrationSrc));

    const buildResult = run(BUILD_SCRIPT, tempRoot, ["--season=2026", "--as-of=0"]);
    expect(buildResult.status).toBe(0);

    const manifestPath = resolve(tempRoot, "data", "generated", "cfb", "v2", "manifest.json");
    const ratingsPath = resolve(tempRoot, "data", "generated", "cfb", "v2", "preseason-ratings.json");
    const projectionsPath = resolve(tempRoot, "data", "generated", "cfb", "v2", "preseason-projections.json");
    const manifestBefore = readFileSync(manifestPath);
    const ratingsBefore = readFileSync(ratingsPath);
    const projectionsBefore = readFileSync(projectionsPath);

    const auditResult = run(AUDIT_SCRIPT, tempRoot);
    expect(auditResult.status).toBe(0);
    expect(auditResult.stdout).toMatch(/healthState=DEGRADED/);
    expect(auditResult.stdout).toMatch(/wrote audit summary to/);

    // Read-only: the promoted state is byte-identical before and after auditing.
    expect(readFileSync(manifestPath).equals(manifestBefore)).toBe(true);
    expect(readFileSync(ratingsPath).equals(ratingsBefore)).toBe(true);
    expect(readFileSync(projectionsPath).equals(projectionsBefore)).toBe(true);

    const summaryPath = resolve(tempRoot, "data", "generated", "cfb", "v2", "audit-summary.json");
    expect(existsSync(summaryPath)).toBe(true);
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    expect(summary.result.healthState).toBe("DEGRADED");

    // --previous= diff mode (WU6 §5): comparing the state against a copy
    // of itself must report zero movement everywhere — a cheap, exact way
    // to prove the diff wiring reads real artifacts correctly.
    const previousDir = resolve(tempRoot, "previous-snapshot");
    writeJson(resolve(previousDir, "manifest.json"), JSON.parse(readFileSync(manifestPath, "utf8")));
    const diffResult = run(AUDIT_SCRIPT, tempRoot, [`--previous=${previousDir}`]);
    expect(diffResult.status).toBe(0);
    expect(diffResult.stdout).toMatch(/diff: comparedTeams=138 medianAbsMovement=0\.0000/);
    expect(diffResult.stdout).toMatch(/availabilityTransitions=0/);
    const diffSummary = JSON.parse(readFileSync(summaryPath, "utf8"));
    expect(diffSummary.diff.ratings.medianAbsoluteMovement).toBe(0);
  }, 30000);
});
