// CFB Model V2 WU5 checkpoint — automated coverage for the orchestrator's
// required-vs-optional current-season input branch (scripts/cfb-v2-build-
// shadow.ts): once a completed game is eligible under the requested
// as-of cutoff, missing game-team-stats/plays for that season must fail
// the whole build closed, leave the previous manifest/artifacts byte-
// identical, and write failure diagnostics to a separate file. Before any
// completed game is eligible, the same missing files must NOT fail the
// build (the honest, already-approved preseason degraded state).
//
// Runs the real script as a child process (its module executes main() at
// import time, so it cannot be imported directly in-process) against an
// isolated temp "repo root" via the CFB_V2_TEST_ROOT env var seam.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cfbV2TeamRatingArtifactPath } from "../src/lib/cfb/production/v2/artifactWriter";
import { cfbV2GameProjectionArtifactPath } from "../src/lib/cfb/production/v2/projectionArtifactWriter";
import { cfbV2ManifestPath } from "../src/lib/cfb/production/v2/artifactContracts";
import { cfbV2ShadowFailureDiagnosticsPath } from "../src/lib/cfb/production/v2/shadowPublish";
import { CFB_EXTERNAL_TEAM_MAPPINGS } from "../src/data/cfb/externalTeamMapping";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-v2-build-shadow.ts");

// buildCfbV2TeamRatings requires the FULL FBS roster to be present (fails
// closed on an incomplete team mapping) — a 2-team fixture is not enough
// to reach ratings at all, so this reuses the same full-roster pattern
// buildTeamRatings.test.ts already establishes.
const TEAMS = CFB_EXTERNAL_TEAM_MAPPINGS.map((m, i) => ({ id: 1000 + i, school: m.cfbdName, classification: "fbs" }));

const COMPLETED_WEEK1_GAME = {
  id: 9001,
  season: 2026,
  week: 1,
  seasonType: "regular",
  startDate: "2026-08-20T16:00:00.000Z",
  startTimeTBD: false,
  completed: true,
  neutralSite: false,
  homeId: TEAMS[0].id,
  homeTeam: TEAMS[0].school,
  homeClassification: "fbs",
  homePoints: 30,
  awayId: TEAMS[1].id,
  awayTeam: TEAMS[1].school,
  awayClassification: "fbs",
  awayPoints: 17,
};

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

/** Builds an isolated temp "repo root": real support artifacts (copied), a synthetic raw CFBD cache (one completed week-1 game, matching a genuine post-Week-1 scenario), and an empty schedule. `rawFiles` lets each test control exactly which current-season files exist. */
function setupTempRoot(rawFiles: { gameTeamStats2026?: unknown; plays2026?: unknown }): string {
  const root = mkdtempSync(join(tmpdir(), "cfb-v2-shadow-fail-closed-"));

  copyFileSync(
    resolve(REPO_ROOT, "data", "cfb", "v2-support", "scoring-normal-equations-2020-2025.json"),
    (() => {
      const dest = resolve(root, "data", "cfb", "v2-support", "scoring-normal-equations-2020-2025.json");
      mkdirSync(resolve(dest, ".."), { recursive: true });
      return dest;
    })(),
  );
  copyFileSync(
    resolve(REPO_ROOT, "data", "cfb", "v2-support", "calibration-residual-seed-2020-2025.json"),
    resolve(root, "data", "cfb", "v2-support", "calibration-residual-seed-2020-2025.json"),
  );

  writeJson(resolve(root, "data", "cfb", "cfbd", "raw", "teams-2026.json"), TEAMS);
  writeJson(resolve(root, "data", "cfb", "cfbd", "raw", "games-2026.json"), [COMPLETED_WEEK1_GAME]);
  writeJson(resolve(root, "data", "cfb", "cfbd", "raw", "games-2025.json"), []);
  writeJson(resolve(root, "data", "cfb", "cfbd", "raw", "game-team-stats-2025.json"), []);
  if (rawFiles.gameTeamStats2026 !== undefined) {
    writeJson(resolve(root, "data", "cfb", "cfbd", "raw", "game-team-stats-2026.json"), rawFiles.gameTeamStats2026);
  }
  if (rawFiles.plays2026 !== undefined) {
    writeJson(resolve(root, "data", "cfb", "cfbd", "raw", "plays-2026.json"), rawFiles.plays2026);
  }
  writeJson(resolve(root, "data", "generated", "cfb", "2026-schedule-v1.json"), []);

  return root;
}

/** Pre-seeds a "previous last-known-good" manifest/ratings/projections triple at the paths this asOfWeek would actually use, and returns their bytes for later byte-identical comparison. */
function seedPreviousLkg(root: string, asOfWeek: number): { ratingsPath: string; projectionsPath: string; manifestPath: string; before: { ratings: Buffer; projections: Buffer; manifest: Buffer } } {
  const ratingsPath = resolve(root, cfbV2TeamRatingArtifactPath(asOfWeek));
  const projectionsPath = resolve(root, cfbV2GameProjectionArtifactPath(asOfWeek));
  const manifestPath = resolve(root, cfbV2ManifestPath());
  writeJson(ratingsPath, { records: [{ teamId: "previous-lkg" }] });
  writeJson(projectionsPath, { records: [{ gameId: "previous-lkg" }] });
  writeJson(manifestPath, { pipelineStatus: "published", generatedAt: "2026-01-01T00:00:00.000Z", marker: "previous-lkg" });
  return {
    ratingsPath,
    projectionsPath,
    manifestPath,
    before: { ratings: readFileSync(ratingsPath), projections: readFileSync(projectionsPath), manifest: readFileSync(manifestPath) },
  };
}

function runOrchestrator(root: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [VITE_NODE_CLI, SCRIPT, ...args], {
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

describe("cfb-v2-build-shadow.ts — required-input fail-closed behavior (WU5 checkpoint §1)", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("A. completed game eligible + missing plays-2026.json -> fails closed, diagnostics written, previous manifest/artifacts byte-identical", () => {
    tempRoot = setupTempRoot({ gameTeamStats2026: [] }); // plays2026 intentionally omitted
    const lkg = seedPreviousLkg(tempRoot, 2);

    const result = runOrchestrator(tempRoot, ["--season=2026", "--as-of=2"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/load-required-current-season-inputs/);
    expect(result.stderr).toMatch(/completed game\(s\) exist before asOfWeek=2/);

    const diagnosticsPath = resolve(tempRoot, cfbV2ShadowFailureDiagnosticsPath());
    expect(existsSync(diagnosticsPath)).toBe(true);
    const diagnostics = JSON.parse(readFileSync(diagnosticsPath, "utf8"));
    expect(diagnostics.failedStage).toBe("load-required-current-season-inputs");
    expect(diagnostics.artifactPromoted).toBe(false);

    expect(readFileSync(lkg.manifestPath).equals(lkg.before.manifest)).toBe(true);
    expect(readFileSync(lkg.ratingsPath).equals(lkg.before.ratings)).toBe(true);
    expect(readFileSync(lkg.projectionsPath).equals(lkg.before.projections)).toBe(true);
  }, 30000);

  it("B. completed game eligible + missing game-team-stats-2026.json -> fails closed, diagnostics written, previous manifest/artifacts byte-identical", () => {
    tempRoot = setupTempRoot({ plays2026: [] }); // gameTeamStats2026 intentionally omitted
    const lkg = seedPreviousLkg(tempRoot, 2);

    const result = runOrchestrator(tempRoot, ["--season=2026", "--as-of=2"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/load-required-current-season-inputs/);
    expect(result.stderr).toMatch(/completed game\(s\) exist before asOfWeek=2/);

    const diagnosticsPath = resolve(tempRoot, cfbV2ShadowFailureDiagnosticsPath());
    expect(existsSync(diagnosticsPath)).toBe(true);

    expect(readFileSync(lkg.manifestPath).equals(lkg.before.manifest)).toBe(true);
    expect(readFileSync(lkg.ratingsPath).equals(lkg.before.ratings)).toBe(true);
    expect(readFileSync(lkg.projectionsPath).equals(lkg.before.projections)).toBe(true);
  }, 30000);

  it("C. zero ELIGIBLE completed games + both files missing -> honest degraded state still publishes (no false failure)", () => {
    // The same completed week-1 game exists in games-2026.json (it really
    // happened), but --as-of=0 means "games strictly before week 0" -> it
    // is not yet ELIGIBLE under this specific cutoff. Required-input
    // status must follow eligibility, not raw completed-game presence, so
    // both current-season files must remain optional here even though a
    // completed game exists elsewhere in the season's data.
    tempRoot = setupTempRoot({}); // both gameTeamStats2026 and plays2026 omitted

    const result = runOrchestrator(tempRoot, ["--season=2026", "--as-of=0"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/promoted: ratings=/);
    expect(result.stdout).toMatch(/derived 0 SUCCESS observations from 0 eligible plays \(0 eligible completed games\)/);

    const manifestPath = resolve(tempRoot, cfbV2ManifestPath());
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.pipelineStatus).toBe("published");
    expect(manifest.degradedFlags).toContain("NO_CURRENT_SUCCESS_DATA");
  }, 30000);
});
