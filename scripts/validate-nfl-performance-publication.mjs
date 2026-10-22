/** Revalidate committed NFL inputs after a workflow rebase, before pushing. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyPerformancePublicationInput } from "./lib/nfl-performance-publication-gate.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const performance = read("public/data/nfl/2026/team-performance-analytics.json");
const results = read("public/data/nfl/2026/results.json");
const coverage = verifyPerformancePublicationInput({ performance, results,
  cachePath: resolve(root, "data/nfl/nflverse/performance-team-game/performance_team_game_2026.csv"),
  manifestPath: resolve(root, "data/nfl/nflverse/performance-team-game/manifest.json"),
  generatedAt: new Date().toISOString() });
if (process.argv.includes("--spread")) {
  const spread = read("public/data/nfl/matchup-projections.json");
  const input = spread.provenance?.inputFingerprints;
  const actual = performance._meta.coverage;
  if (!input || input.performanceCoverageSha256 !== actual.sha256 || input.performanceCacheSha256 !== actual.cacheSha256 ||
      input.finalResultsSha256 !== actual.resultsSha256) {
    throw new Error("spread input fingerprints are stale after rebase; refusing push");
  }
}
console.log(`[nfl:publication] verified ${coverage.games} final games and ${coverage.teamGames} team-games`);
