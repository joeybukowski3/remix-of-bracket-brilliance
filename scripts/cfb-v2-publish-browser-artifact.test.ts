// WU7A §19 / checkpoint §4 — coverage for
// scripts/cfb-v2-publish-browser-artifact.ts.
//
// PRESEASON PUBLICATION POLICY (checkpoint §4 decision, recorded here):
// publish every structurally valid DEGRADED or HEALTHY state; refuse only
// on INVALID. Rejected the alternative ("publish only once HEALTHY")
// because during preseason (or any week the model is legitimately
// degraded) it would leave main with either no artifact at all — making a
// broken pipeline indistinguishable from a correctly-quiet one — or,
// worse, a stale artifact from a much earlier point in the season sitting
// untouched indefinitely while every subsequent DEGRADED week silently
// fails to refresh it. Publishing the honest DEGRADED state every
// successful run keeps `generatedAt`/`dataAsOf`/`degradedFlags` always as
// fresh as the last real refresh, and matches WU6's whole audit
// philosophy: degraded is not failure and must stay visible, not hidden.
// INVALID must never publish, tested below.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const BUILD_SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-v2-build-shadow.ts");
const PUBLISH_SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-v2-publish-browser-artifact.ts");

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

describe("cfb-v2-publish-browser-artifact.ts (WU7A §19)", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("refuses to publish (nonzero exit, no file written) when no shadow state has ever been promoted", () => {
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-publish-empty-"));
    const result = run(PUBLISH_SCRIPT, tempRoot);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/FAILED to load promoted shadow state/);
    expect(existsSync(resolve(tempRoot, "public", "data", "cfb", "v2", "shadow-projections.json"))).toBe(false);
  }, 30000);

  it("publishes a compact, correctly-shaped artifact from a real (DEGRADED) promoted preseason state", async () => {
    const { CFB_EXTERNAL_TEAM_MAPPINGS } = await import("../src/data/cfb/externalTeamMapping");
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-publish-degraded-"));
    const teams = CFB_EXTERNAL_TEAM_MAPPINGS.map((m, i) => ({ id: 1000 + i, school: m.cfbdName, classification: "fbs" }));
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "teams-2026.json"), teams);
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "games-2026.json"), []);
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "games-2025.json"), [
      { id: 8001, season: 2025, week: 15, seasonType: "regular", startDate: "2025-12-06T20:00:00.000Z", startTimeTBD: false, completed: true, neutralSite: false, homeId: 1000, homeTeam: teams[0].school, homeClassification: "fbs", homePoints: 24, awayId: 1001, awayTeam: teams[1].school, awayClassification: "fbs", awayPoints: 17 },
    ]);
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "game-team-stats-2025.json"), []);
    writeJson(resolve(tempRoot, "data", "generated", "cfb", "2026-schedule-v1.json"), [
      { id: "g1", season: 2026, week: 1, date: "2026-08-30", homeTeamId: CFB_EXTERNAL_TEAM_MAPPINGS[0].jkbTeamId, awayTeamId: CFB_EXTERNAL_TEAM_MAPPINGS[1].jkbTeamId, neutralSite: false, homeClassification: "fbs", awayClassification: "fbs" },
    ]);
    const scoringDest = resolve(tempRoot, "data", "cfb", "v2-support", "scoring-normal-equations-2020-2025.json");
    mkdirSync(resolve(scoringDest, ".."), { recursive: true });
    writeFileSync(scoringDest, readFileSync(resolve(REPO_ROOT, "data", "cfb", "v2-support", "scoring-normal-equations-2020-2025.json")));
    writeFileSync(resolve(tempRoot, "data", "cfb", "v2-support", "calibration-residual-seed-2020-2025.json"), readFileSync(resolve(REPO_ROOT, "data", "cfb", "v2-support", "calibration-residual-seed-2020-2025.json")));

    const buildResult = run(BUILD_SCRIPT, tempRoot, ["--season=2026", "--as-of=0"]);
    expect(buildResult.status).toBe(0);

    const publishResult = run(PUBLISH_SCRIPT, tempRoot);
    expect(publishResult.status).toBe(0);
    expect(publishResult.stdout).toMatch(/healthState=DEGRADED/);

    const outPath = resolve(tempRoot, "public", "data", "cfb", "v2", "shadow-projections.json");
    expect(existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(outPath, "utf8"));
    expect(parsed.schemaVersion).toBe("cfb-v2-public-projections-1");
    expect(parsed.healthState).toBe("DEGRADED");
    expect(parsed.season).toBe(2026);
    expect(Array.isArray(parsed.records)).toBe(true);
    expect(parsed.records.length).toBeGreaterThan(0);
    // Compact rows only -- no interval fields leaked through.
    expect(parsed.records[0]).not.toHaveProperty("marginInterval50");
    expect(parsed.records[0]).toHaveProperty("gameId");
    expect(parsed.records[0]).toHaveProperty("projectionStatus");
  }, 30000);

  it("refuses to publish an INVALID promoted state (checkpoint §4: INVALID must never publish), previous artifact left untouched", async () => {
    const { CFB_EXTERNAL_TEAM_MAPPINGS } = await import("../src/data/cfb/externalTeamMapping");
    tempRoot = mkdtempSync(join(tmpdir(), "cfb-v2-publish-invalid-"));
    const teams = CFB_EXTERNAL_TEAM_MAPPINGS.map((m, i) => ({ id: 1000 + i, school: m.cfbdName, classification: "fbs" }));
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "teams-2026.json"), teams);
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "games-2026.json"), []);
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "games-2025.json"), [
      { id: 8001, season: 2025, week: 15, seasonType: "regular", startDate: "2025-12-06T20:00:00.000Z", startTimeTBD: false, completed: true, neutralSite: false, homeId: 1000, homeTeam: teams[0].school, homeClassification: "fbs", homePoints: 24, awayId: 1001, awayTeam: teams[1].school, awayClassification: "fbs", awayPoints: 17 },
    ]);
    writeJson(resolve(tempRoot, "data", "cfb", "cfbd", "raw", "game-team-stats-2025.json"), []);
    writeJson(resolve(tempRoot, "data", "generated", "cfb", "2026-schedule-v1.json"), []);
    const scoringDest = resolve(tempRoot, "data", "cfb", "v2-support", "scoring-normal-equations-2020-2025.json");
    mkdirSync(resolve(scoringDest, ".."), { recursive: true });
    writeFileSync(scoringDest, readFileSync(resolve(REPO_ROOT, "data", "cfb", "v2-support", "scoring-normal-equations-2020-2025.json")));
    writeFileSync(resolve(tempRoot, "data", "cfb", "v2-support", "calibration-residual-seed-2020-2025.json"), readFileSync(resolve(REPO_ROOT, "data", "cfb", "v2-support", "calibration-residual-seed-2020-2025.json")));

    expect(run(BUILD_SCRIPT, tempRoot, ["--season=2026", "--as-of=0"]).status).toBe(0);

    // Publish once successfully first, to prove a PREVIOUS artifact exists...
    expect(run(PUBLISH_SCRIPT, tempRoot).status).toBe(0);
    const outPath = resolve(tempRoot, "public", "data", "cfb", "v2", "shadow-projections.json");
    const previousBytes = readFileSync(outPath);

    // ...then corrupt the promoted manifest (stale record-count pointer) so
    // the publish script's own re-audit classifies it INVALID.
    const manifestPath = resolve(tempRoot, "data", "generated", "cfb", "v2", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.ratingRecordCount = 999999;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const invalidResult = run(PUBLISH_SCRIPT, tempRoot);
    expect(invalidResult.status).not.toBe(0);
    expect(invalidResult.stderr).toMatch(/refusing to publish.*INVALID/);
    expect(invalidResult.stderr).toMatch(/MANIFEST_RATING_COUNT_MISMATCH/);

    // The previously-published (valid, DEGRADED) browser artifact must remain byte-identical — no partial/corrupt overwrite.
    expect(readFileSync(outPath).equals(previousBytes)).toBe(true);
  }, 30000);
});
