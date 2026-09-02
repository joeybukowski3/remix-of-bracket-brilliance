import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLAYER_WEEK_PROJECTED_COLUMNS,
  runPlayerWeekCacheRefresh,
  validatePlayerWeekRows,
} from "../../../scripts/refresh-fantasy-player-week-source-cache.mjs";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "jkb-player-week-"));
  tempDirs.push(root);
  return root;
}

const upstreamColumns = PLAYER_WEEK_PROJECTED_COLUMNS
  .filter((column) => column !== "recent_team" && column !== "interceptions")
  .concat("passing_interceptions");

function upstreamCsv(overrides: Record<string, string> = {}): string {
  const rows = ["QB", "RB", "WR", "TE"].map((position, index) => {
    const values: Record<string, string> = Object.fromEntries(upstreamColumns.map((column) => [column, "0"]));
    Object.assign(values, {
      player_id: `00-2026-${index}`,
      player_name: `Player ${index}`,
      player_display_name: `Player ${index}`,
      position,
      position_group: position,
      game_id: "2026_01_BUF_MIA",
      team: "BUF",
      season: "2026",
      week: "1",
      season_type: "REG",
      opponent_team: "MIA",
      ...overrides,
    });
    return upstreamColumns.map((column) => values[column]).join(",");
  });
  return `${upstreamColumns.join(",")}\n${rows.join("\n")}\n`;
}

describe("2026 canonical player-week stats refresh", () => {
  it("writes the canonical 2026 path atomically with identity, game, teams, zeros, and provenance", async () => {
    const root = tempRoot();
    const localDir = join(root, "upstream");
    const outputDir = join(root, "data", "nfl", "nflverse", "player-week-stats");
    mkdirSync(localDir, { recursive: true });
    writeFileSync(join(localDir, "stats_player_week_2026.csv"), upstreamCsv(), "utf8");

    await runPlayerWeekCacheRefresh([
      "node", "refresh", "--seasons=2026", "--partial-season=2026",
      `--local-dir=${localDir}`, `--output-dir=${outputDir}`,
    ]);

    const cachePath = join(outputDir, "stats_player_week_2026.csv");
    const cache = readFileSync(cachePath, "utf8");
    expect(cache).toContain("player_id,player_name,player_display_name,position,position_group,game_id,team,recent_team");
    expect(cache).toContain("00-2026-0");
    expect(cache).toContain("2026_01_BUF_MIA");
    expect(cache).toContain(",BUF,BUF,");
    expect(cache).toContain(",0,0,0,");
    const manifest = JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf8"));
    expect(manifest.source).toBe("nflverse/nflverse-data stats_player release");
    expect(manifest.files[0]).toMatchObject({
      season: 2026,
      filename: "stats_player_week_2026.csv",
      sourceUrl: "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
    });
    expect(manifest.files[0].retrievedAtUtc).toMatch(/Z$/);
    expect(manifest.files[0].coverage.gameIds).toEqual(["2026_01_BUF_MIA"]);

    const firstManifest = readFileSync(join(outputDir, "manifest.json"), "utf8");
    await runPlayerWeekCacheRefresh([
      "node", "refresh", "--seasons=2026", "--partial-season=2026",
      `--local-dir=${localDir}`, `--output-dir=${outputDir}`,
    ]);
    expect(readFileSync(join(outputDir, "manifest.json"), "utf8")).toBe(firstManifest);
    expect(readFileSync(cachePath, "utf8")).toBe(cache);
  });

  it("rejects malformed rows before replacing an existing cache", async () => {
    const root = tempRoot();
    const localDir = join(root, "upstream");
    const outputDir = join(root, "output");
    mkdirSync(localDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    const cachePath = join(outputDir, "stats_player_week_2026.csv");
    writeFileSync(cachePath, "existing\n", "utf8");
    writeFileSync(join(localDir, "stats_player_week_2026.csv"), upstreamCsv({ game_id: "" }), "utf8");

    await expect(runPlayerWeekCacheRefresh([
      "node", "refresh", "--seasons=2026", "--partial-season=2026",
      `--local-dir=${localDir}`, `--output-dir=${outputDir}`,
    ])).rejects.toThrow(/missing game_id/);
    expect(readFileSync(cachePath, "utf8")).toBe("existing\n");
  });

  it("rejects duplicate player/game rows", () => {
    const row = { player_id: "00-1", game_id: "2026_01_BUF_MIA", team: "BUF", opponent_team: "MIA", season: "2026", week: "1", completions: "0", attempts: "0", passing_yards: "0", carries: "0", rushing_yards: "0", receptions: "0", targets: "0", receiving_yards: "0" };
    expect(() => validatePlayerWeekRows([row, row], 2026, "stats_player_week_2026.csv")).toThrow(/duplicate player\/game/);
  });

  it("keeps the production npm command pinned to the canonical cache namespace", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["nfl:player-week-stats-cache"]).toContain("--output-dir=data/nfl/nflverse/player-week-stats");
  });
});
