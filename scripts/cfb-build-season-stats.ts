import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSeasonStatsArtifact,
  type CfbdRawGame,
  type CfbdRawGameTeamStats,
  type CfbSeasonStatsArtifact,
} from "../src/lib/cfb/seasonStats/buildSeasonStatsArtifact";
import { writeAtomic } from "./lib/cfb-cfbd-client";

const ROOT = process.env.CFB_TEST_ROOT?.trim() || resolve(import.meta.dirname, "..");
const RAW = resolve(ROOT, "data", "cfb", "cfbd", "raw");
const OUTPUT_DIR = resolve(ROOT, "data", "generated", "cfb");
const SEASON = Number(process.env.CFB_SEASON ?? 2026);

const read = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/**
 * CFBD-derived production season-stats normalization (WU: cfb-matchup-stats).
 *
 * Reads the already-cached raw /games and /games/teams caches (fetched by
 * `npm run cfb:fetch-data`, no network call in this script) and produces
 * data/generated/cfb/<season>-season-stats-v1.json. Deliberately decoupled
 * from V1/V1.1 rating math and V2 — this script imports only
 * src/lib/cfb/seasonStats/**, never src/lib/cfb/pipeline/normalizeCfbd.ts or
 * anything under src/lib/cfb/production/v2/.
 *
 * Last-known-good policy: any failure (missing/unreadable/malformed raw
 * cache, season mismatch, coverage/validation failure) leaves the previously
 * committed artifact untouched and exits non-zero. A successful build is the
 * only way this script writes.
 */
function readPreviousArtifact(outputPath: string): CfbSeasonStatsArtifact | null {
  try {
    return read<CfbSeasonStatsArtifact>(outputPath);
  } catch {
    return null;
  }
}

function main() {
  const outputPath = resolve(OUTPUT_DIR, `${SEASON}-season-stats-v1.json`);
  const previous = readPreviousArtifact(outputPath);

  let games: CfbdRawGame[];
  let gameTeamStats: CfbdRawGameTeamStats[];
  try {
    games = read<CfbdRawGame[]>(resolve(RAW, `games-${SEASON}.json`));
    gameTeamStats = read<CfbdRawGameTeamStats[]>(resolve(RAW, `game-team-stats-${SEASON}.json`));
    if (!Array.isArray(games)) throw new Error("games cache is not a JSON array");
    if (!Array.isArray(gameTeamStats)) throw new Error("game-team-stats cache is not a JSON array");
  } catch (error) {
    console.error(
      `[cfb:build-season-stats] raw cache unavailable for season ${SEASON} — keeping last-known-good artifact untouched: ${(error as Error).message}`,
    );
    process.exitCode = 1;
    return;
  }

  const result = buildSeasonStatsArtifact({
    season: SEASON,
    games,
    gameTeamStats,
    generatedAt: new Date().toISOString(),
  });

  if (!result.ok) {
    console.error(
      `[cfb:build-season-stats] build failed for season ${SEASON} — keeping last-known-good artifact untouched: ${result.errors.join("; ")}`,
    );
    process.exitCode = 1;
    return;
  }

  const { artifact } = result;
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const unchanged =
    previous !== null &&
    JSON.stringify({ ...previous, generatedAt: null }) === JSON.stringify({ ...artifact, generatedAt: null });

  if (unchanged) {
    console.log(`[cfb:build-season-stats] season ${SEASON}: no stat changes; artifact left untouched.`);
  } else {
    writeAtomic(outputPath, serialized);
  }

  console.log(
    `[cfb:build-season-stats] season ${SEASON}: ${artifact.diagnostics.completedGames} completed games ` +
      `(${artifact.diagnostics.totalRawGames} total in raw cache); ` +
      `${artifact.diagnostics.teamsWithGames} teams with stats, ${artifact.diagnostics.teamsWithZeroGames} with none; ` +
      `${artifact.diagnostics.skippedGames.length} skipped rows.`,
  );
  if (artifact.diagnostics.skippedGames.length > 0) {
    console.warn(
      `[cfb:build-season-stats] skipped rows: ${artifact.diagnostics.skippedGames
        .map((row) => `${row.gameId} (${row.reason})`)
        .join("; ")}`,
    );
  }
}

main();
