import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { generateTeamPerformanceAnalytics } from "./generate-nfl-team-performance-analytics.mts";

const root = resolve(import.meta.dirname, "..");
const script = join(root, "scripts/generate-nfl-matchup-projections.mts");
const cache = join(root, "data/nfl/nflverse/performance-team-game/performance_team_game_2026.csv");
const manifest = join(root, "data/nfl/nflverse/performance-team-game/manifest.json");
const archiveRoot = join(root, "data/nfl/predictions");
const archiveListing = () => readdirSync(archiveRoot, { recursive: true }).sort();
const run = (args) => spawnSync(process.execPath, ["--import", "tsx", script, ...args], { cwd: root, encoding: "utf8" });

describe("spread publication boundary", () => {
  it("rejects a stale artifact and preserves an existing preview output", () => {
    const stage = mkdtempSync(join(tmpdir(), "jkb-spread-stale-"));
    try {
      const output = join(stage, "existing.json");
      writeFileSync(output, "known-good");
      const before = archiveListing();
      const result = run(["--preview-only", `--output=${output}`]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /lacks exact team-game coverage provenance/);
      assert.equal(readFileSync(output, "utf8"), "known-good");
      assert.deepEqual(archiveListing(), before);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  });

  it("writes a complete-coverage preview without touching prediction archives", async () => {
    const stage = mkdtempSync(join(tmpdir(), "jkb-spread-preview-"));
    try {
      const resultsPath = join(stage, "results.json");
      const performancePath = join(stage, "performance.json");
      const fixtureManifest = join(stage, "manifest.json");
      const output = join(stage, "spreads.json");
      const ids = new Set(readFileSync(cache, "utf8").trim().split(/\r?\n/).slice(1).map((line) => line.split(",")[0]));
      const current = JSON.parse(readFileSync(join(root, "public/data/nfl/2026/results.json"), "utf8"));
      writeFileSync(resultsPath, JSON.stringify({ ...current, results: current.results.filter((game) => ids.has(game.gameId)) }));
      const manifestFixture = JSON.parse(readFileSync(manifest, "utf8"));
      // The test fixture is re-ingested now; this is its fixture retrieval time.
      manifestFixture.files[0].sourceRetrievedAt = new Date().toISOString();
      manifestFixture.files[0].retrievedDateUtc = manifestFixture.files[0].sourceRetrievedAt.slice(0, 10);
      writeFileSync(fixtureManifest, JSON.stringify(manifestFixture));
      const performance = await generateTeamPerformanceAnalytics(2026, { resultsFile: resultsPath, manifestFile: fixtureManifest });
      writeFileSync(performancePath, JSON.stringify(performance));
      const before = archiveListing();
      const result = run(["--preview-only", `--output=${output}`, `--performance-input=${performancePath}`,
        `--results-file=${resultsPath}`, `--cache-file=${cache}`, `--manifest-file=${fixtureManifest}`]);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(JSON.parse(readFileSync(output, "utf8")).projections);
      const comparisonPath = join(stage, "comparison.json");
      const compare = spawnSync(process.execPath, ["--import", "tsx", join(root, "scripts/research/compare-nfl-week7-rating-spreads.mts"),
        `--old-performance=${join(root, "public/data/nfl/2026/team-performance-analytics.json")}`,
        `--new-performance=${performancePath}`,
        `--old-spreads=${join(root, "public/data/nfl/matchup-projections.json")}`,
        `--new-spreads=${output}`, "--week=7", `--output=${comparisonPath}`], { cwd: root, encoding: "utf8" });
      assert.equal(compare.status, 0, compare.stderr);
      const comparison = JSON.parse(readFileSync(comparisonPath, "utf8"));
      assert.equal(comparison.teams.length, 32);
      const committedWeek7 = Object.values(JSON.parse(readFileSync(join(root, "public/data/nfl/matchup-projections.json"), "utf8")).projections)
        .filter((game) => game.week === 7).length;
      assert.equal(comparison.spreads.length, committedWeek7);
      assert.deepEqual(archiveListing(), before);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  });
});
