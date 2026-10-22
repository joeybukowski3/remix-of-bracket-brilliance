import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { REQUIRED_PERFORMANCE_PBP_COLUMNS } from "./lib/nfl-performance-metrics-core.mjs";

test("a no-op upstream source fails when canonical finals exist and preserves cache", () => {
  const stage = mkdtempSync(join(tmpdir(), "jkb-performance-refresh-"));
  try {
    const sourceFile = join(stage, "pbp.csv.gz");
    const resultsFile = join(stage, "results.json");
    const cacheDir = join(stage, "cache");
    writeFileSync(sourceFile, gzipSync(`${REQUIRED_PERFORMANCE_PBP_COLUMNS.join(",")}\n`));
    writeFileSync(resultsFile, JSON.stringify({ results: [{ gameId: "2026_01_A_B", seasonType: "REG", final: true, awayAbbr: "a", homeAbbr: "b" }] }));
    const run = spawnSync(process.execPath, [resolve("scripts/refresh-nfl-performance-source-cache.mjs"),
      "--seasons=2026", `--source-file=${sourceFile}`, `--cache-dir=${cacheDir}`, `--results-file=${resultsFile}`], { encoding: "utf8" });
    assert.notEqual(run.status, 0, run.stdout);
    assert.match(run.stderr, /upstream has no usable REG games/);
    assert.equal(existsSync(join(cacheDir, "manifest.json")), false);
    assert.equal(existsSync(join(cacheDir, "performance_team_game_2026.csv")), false);
    writeFileSync(resultsFile, JSON.stringify({ results: [] }));
    const preseason = spawnSync(process.execPath, [resolve("scripts/refresh-nfl-performance-source-cache.mjs"),
      "--seasons=2026", `--source-file=${sourceFile}`, `--cache-dir=${cacheDir}`, `--results-file=${resultsFile}`], { encoding: "utf8" });
    assert.equal(preseason.status, 0, preseason.stderr);
  } finally { rmSync(stage, { recursive: true, force: true }); }
});
