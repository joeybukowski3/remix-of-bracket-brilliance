// CFBD-derived season-stats normalization (scripts/cfb-build-season-stats.ts):
// builds data/generated/cfb/<season>-season-stats-v1.json purely from the raw
// /games + /games/teams caches (no network call), and preserves the
// previously-committed artifact on any failure (missing/malformed raw cache,
// season mismatch).
//
// Runs the real script as a child process against an isolated temp "repo
// root" via the CFB_TEST_ROOT env var seam, matching
// scripts/cfb-update-market-odds.test.ts.

import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { CfbSeasonStatsArtifact } from "../src/lib/cfb/seasonStats/buildSeasonStatsArtifact";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const VITE_NODE_CLI = resolve(REPO_ROOT, "node_modules", "vite-node", "dist", "cli.mjs");
const SCRIPT = resolve(REPO_ROOT, "scripts", "cfb-build-season-stats.ts");
const SEASON = 2025;

const OHIO_TEAM_ROW = {
  teamId: 195,
  team: "Ohio",
  homeAway: "home",
  points: 17,
  stats: [
    { category: "totalYards", stat: "350" },
    { category: "rushingYards", stat: "207" },
    { category: "rushingAttempts", stat: "43" },
    { category: "netPassingYards", stat: "143" },
    { category: "completionAttempts", stat: "11-15" },
    { category: "thirdDownEff", stat: "4-11" },
    { category: "turnovers", stat: "3" },
  ],
};

const UNLV_TEAM_ROW = {
  teamId: 2439,
  team: "UNLV",
  homeAway: "away",
  points: 10,
  stats: [
    { category: "totalYards", stat: "280" },
    { category: "rushingYards", stat: "120" },
    { category: "rushingAttempts", stat: "30" },
    { category: "netPassingYards", stat: "160" },
    { category: "completionAttempts", stat: "14-25" },
    { category: "thirdDownEff", stat: "3-12" },
    { category: "turnovers", stat: "1" },
  ],
};

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function setupRoot(options: {
  games?: unknown;
  gameTeamStats?: unknown;
  previousArtifact?: CfbSeasonStatsArtifact;
}): string {
  const root = mkdtempSync(join(tmpdir(), "cfb-build-season-stats-"));
  if (options.games !== undefined) {
    writeJson(resolve(root, "data", "cfb", "cfbd", "raw", `games-${SEASON}.json`), options.games);
  }
  if (options.gameTeamStats !== undefined) {
    writeJson(
      resolve(root, "data", "cfb", "cfbd", "raw", `game-team-stats-${SEASON}.json`),
      options.gameTeamStats,
    );
  }
  if (options.previousArtifact !== undefined) {
    writeJson(
      resolve(root, "data", "generated", "cfb", `${SEASON}-season-stats-v1.json`),
      options.previousArtifact,
    );
  }
  return root;
}

function run(root: string): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [VITE_NODE_CLI, SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, CFB_TEST_ROOT: root, CFB_SEASON: String(SEASON) },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function artifactPath(root: string): string {
  return resolve(root, "data", "generated", "cfb", `${SEASON}-season-stats-v1.json`);
}

describe("cfb-build-season-stats.ts", () => {
  let tempRoot: string | null = null;
  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("builds a valid 138-team artifact from raw caches", () => {
    tempRoot = setupRoot({
      games: [
        {
          id: 1,
          season: SEASON,
          completed: true,
          homeId: 195,
          homeTeam: "Ohio",
          homeClassification: "fbs",
          awayId: 2439,
          awayTeam: "UNLV",
          awayClassification: "fbs",
        },
      ],
      gameTeamStats: [{ id: 1, teams: [OHIO_TEAM_ROW, UNLV_TEAM_ROW] }],
    });

    const result = run(tempRoot);
    expect(result.status).toBe(0);

    const artifact = readJson<CfbSeasonStatsArtifact>(artifactPath(tempRoot));
    expect(artifact.schemaVersion).toBe("jkb-cfb-season-stats-v1");
    expect(artifact.teams).toHaveLength(138);
    const ohio = artifact.teams.find((t) => t.teamId === "ohio");
    expect(ohio?.stats.pointsPerGame).toBe(17);
  }, 30000);

  it("missing raw cache: keeps the previously committed artifact and exits non-zero", () => {
    const previous: CfbSeasonStatsArtifact = {
      schemaVersion: "jkb-cfb-season-stats-v1",
      season: SEASON,
      source: "cfbd:/games/teams",
      generatedAt: "2026-01-01T00:00:00.000Z",
      gamesPlayed: 5,
      teams: [],
      diagnostics: { totalRawGames: 5, completedGames: 5, skippedGames: [], teamsWithGames: 0, teamsWithZeroGames: 0 },
    };
    tempRoot = setupRoot({ previousArtifact: previous }); // no raw caches written at all

    const result = run(tempRoot);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/keeping last-known-good artifact untouched/);

    const artifact = readJson<CfbSeasonStatsArtifact>(artifactPath(tempRoot));
    expect(artifact).toEqual(previous);
  }, 30000);

  it("malformed raw cache (not an array): keeps last-known-good and exits non-zero", () => {
    const previous: CfbSeasonStatsArtifact = {
      schemaVersion: "jkb-cfb-season-stats-v1",
      season: SEASON,
      source: "cfbd:/games/teams",
      generatedAt: "2026-01-01T00:00:00.000Z",
      gamesPlayed: 1,
      teams: [],
      diagnostics: { totalRawGames: 1, completedGames: 1, skippedGames: [], teamsWithGames: 0, teamsWithZeroGames: 0 },
    };
    tempRoot = setupRoot({
      games: { not: "an array" },
      gameTeamStats: [],
      previousArtifact: previous,
    });

    const result = run(tempRoot);
    expect(result.status).toBe(1);

    const artifact = readJson<CfbSeasonStatsArtifact>(artifactPath(tempRoot));
    expect(artifact).toEqual(previous);
  }, 30000);

  it("season mismatch in raw games cache: fails closed, keeps last-known-good", () => {
    const previous: CfbSeasonStatsArtifact = {
      schemaVersion: "jkb-cfb-season-stats-v1",
      season: SEASON,
      source: "cfbd:/games/teams",
      generatedAt: "2026-01-01T00:00:00.000Z",
      gamesPlayed: 1,
      teams: [],
      diagnostics: { totalRawGames: 1, completedGames: 1, skippedGames: [], teamsWithGames: 0, teamsWithZeroGames: 0 },
    };
    tempRoot = setupRoot({
      games: [
        {
          id: 1,
          season: 1999,
          completed: true,
          homeId: 195,
          homeTeam: "Ohio",
          awayId: 2439,
          awayTeam: "UNLV",
        },
      ],
      gameTeamStats: [{ id: 1, teams: [OHIO_TEAM_ROW, UNLV_TEAM_ROW] }],
      previousArtifact: previous,
    });

    const result = run(tempRoot);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/season mismatch/i);

    const artifact = readJson<CfbSeasonStatsArtifact>(artifactPath(tempRoot));
    expect(artifact).toEqual(previous);
  }, 30000);

  it("is deterministic: running twice against the same inputs produces the same stats content", () => {
    tempRoot = setupRoot({
      games: [
        {
          id: 1,
          season: SEASON,
          completed: true,
          homeId: 195,
          homeTeam: "Ohio",
          homeClassification: "fbs",
          awayId: 2439,
          awayTeam: "UNLV",
          awayClassification: "fbs",
        },
      ],
      gameTeamStats: [{ id: 1, teams: [OHIO_TEAM_ROW, UNLV_TEAM_ROW] }],
    });

    expect(run(tempRoot).status).toBe(0);
    const first = readJson<CfbSeasonStatsArtifact>(artifactPath(tempRoot));

    expect(run(tempRoot).status).toBe(0);
    const second = readJson<CfbSeasonStatsArtifact>(artifactPath(tempRoot));

    expect(second.teams).toEqual(first.teams);
    expect(second.diagnostics).toEqual(first.diagnostics);
  }, 30000);
});
