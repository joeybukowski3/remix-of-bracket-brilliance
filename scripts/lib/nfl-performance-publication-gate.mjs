/** Fail before publishing a spread when the performance input is stale or unverifiable. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { expectedFinalTeamGames, requireTeamGameCoverage, teamGameCoverageFingerprint, validateTeamGameCoverage, finalResultFingerprint } from "./nfl-current-season-coverage.mjs";

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

export function verifyPerformancePublicationInput({ performance, results, cachePath, manifestPath, generatedAt }) {
  const expected = expectedFinalTeamGames(results.results ?? []);
  const coverage = performance._meta?.coverage;
  if (!coverage || !Array.isArray(coverage.teamGames)) {
    let detail = "";
    if (existsSync(cachePath)) {
      const lines = readFileSync(cachePath, "utf8").trim().split(/\r?\n/);
      const header = lines.shift()?.split(",") ?? [];
      const gameIndex = header.indexOf("game_id");
      const teamIndex = header.indexOf("team");
      if (gameIndex >= 0 && teamIndex >= 0) {
        const cacheRows = lines.map((line) => {
          const cells = line.split(",");
          return { gameId: cells[gameIndex], team: cells[teamIndex] };
        });
        const diagnostic = validateTeamGameCoverage(expected, cacheRows, "legacy performance cache");
        detail = `; cache missing team-games: ${diagnostic.summary.missingTeamGames.join(", ") || "none"}`;
      }
    }
    throw new Error(`performance artifact lacks exact team-game coverage provenance; regenerate it${detail}`);
  }
  const included = coverage.teamGames.map((key) => {
    if (typeof key !== "string" || !/^[^|]+\|[^|]+$/.test(key)) throw new Error(`malformed performance team-game key: ${key}`);
    const [gameId, team] = key.split("|");
    return { gameId, team };
  });
  requireTeamGameCoverage(expected, included, "spread performance input");
  const fingerprint = teamGameCoverageFingerprint(included);
  if (coverage.sha256 !== fingerprint) throw new Error(`performance coverage fingerprint mismatch: ${coverage.sha256} != ${fingerprint}`);
  const resultsFingerprint = finalResultFingerprint(results.results ?? []);
  if (coverage.resultsSha256 !== resultsFingerprint) throw new Error(`canonical final-result fingerprint mismatch: ${coverage.resultsSha256} != ${resultsFingerprint}`);
  const games = new Set(included.map((row) => row.gameId));
  if (performance._meta.includedGameCount !== games.size) throw new Error(`performance includedGameCount mismatch: ${performance._meta.includedGameCount} != ${games.size}`);
  for (const row of performance.teams) {
    const count = included.filter((game) => game.team === row.team).length;
    if (row.gamesPlayed !== count || row.windows.fullSeason.sampleSize !== count) {
      throw new Error(`performance ${row.team}: expected ${count} covered games, got gamesPlayed=${row.gamesPlayed}, fullSeason=${row.windows.fullSeason.sampleSize}`);
    }
  }
  const validTimestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && value.endsWith("Z");
  if (results._meta?.generatedAt && (!validTimestamp(results._meta.generatedAt) || Date.parse(results._meta.generatedAt) > Date.parse(generatedAt))) {
    throw new Error("canonical results snapshot is later than this spread timestamp");
  }
  if (!validTimestamp(performance._meta.generatedAt) || Date.parse(performance._meta.generatedAt) > Date.parse(generatedAt)) {
    throw new Error("performance artifact was generated after this spread timestamp");
  }
  if (expected.length === 0 && coverage.cacheSha256 === null) return { games: 0, teamGames: 0, fingerprint };
  if (!existsSync(cachePath) || !existsSync(manifestPath)) throw new Error("performance compact cache or manifest missing");
  const cacheSha256 = sha256(cachePath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entry = manifest.files?.find((file) => file.season === performance._meta.season && file.filename === basename(cachePath));
  if (!entry || cacheSha256 !== entry.sha256 || cacheSha256 !== coverage.cacheSha256 || entry.rowCount !== included.length) {
    throw new Error(`performance cache/manifest fingerprint mismatch: ${basename(cachePath)}`);
  }
  const retrievedAt = entry.sourceRetrievedAt ?? null;
  if (retrievedAt === null) {
    if (coverage.sourceRetrievedAt !== null || !/^\d{4}-\d{2}-\d{2}$/.test(entry.retrievedDateUtc ?? "")) {
      throw new Error("legacy performance source retrieval date mismatch");
    }
  } else if (!validTimestamp(retrievedAt) || entry.retrievedDateUtc !== retrievedAt.slice(0, 10) ||
             coverage.sourceRetrievedAt !== retrievedAt || Date.parse(retrievedAt) > Date.parse(performance._meta.generatedAt)) {
    throw new Error("performance source retrieval timestamp mismatch or later than generation");
  }
  if (coverage.gameDataCutoffAt && (!validTimestamp(coverage.gameDataCutoffAt) || Date.parse(coverage.gameDataCutoffAt) > Date.parse(performance._meta.generatedAt))) {
    throw new Error("performance game-data cutoff is invalid or later than generation");
  }
  return { games: games.size, teamGames: included.length, fingerprint };
}
