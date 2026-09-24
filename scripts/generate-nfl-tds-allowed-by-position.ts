/**
 * Generates public/data/nfl/tds-allowed-by-position.json -- defense rank
 * tables for touchdowns allowed by scoring method (QB PASS / QB RUSH /
 * RB RUSH / RB REC / WR REC / TE REC), across four samples: current season to
 * date ("2026"), full prior season ("2025"), and each team's rolling last-5
 * and last-8 completed REG games. Sibling of
 * generate-nfl-fantasy-points-allowed.ts -- see that script's doc comment for
 * the shared loading pipeline.
 *
 * Categories are aggregated from per-game nflverse player stats (passing_tds /
 * rushing_tds / receiving_tds by the scorer's position -- see
 * src/lib/nfl/tdsAllowed/aggregate.ts TDS_ALLOWED_CATEGORIES). There is no
 * trustworthy per-game alignment-split (wide/slot) touchdown source in this
 * repo, so WR REC is one combined column.
 *
 * Reads only committed caches (never touches the network) via
 * scripts/lib/nflAllowedByPositionIo.ts (shared with
 * generate-nfl-fantasy-points-allowed.ts):
 *   - data/nfl/nflverse/stats-player-week/stats_player_week_{season}.csv
 *   - public/data/nfl/teams.json
 *   - public/data/nfl/<season>/games.json
 *
 * Usage:
 *   npx tsx scripts/generate-nfl-tds-allowed-by-position.ts
 *   npx tsx scripts/generate-nfl-tds-allowed-by-position.ts --dry-run
 *   npx tsx scripts/generate-nfl-tds-allowed-by-position.ts --season=2026 --week=3
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNflWeekSelection } from "../src/lib/nfl/weekSelection.ts";
import { buildTdsAllowedRows } from "../src/lib/nfl/tdsAllowed/buildRows.ts";
import { resolveCurrentOpponents } from "../src/lib/nfl/fantasyAllowed/currentOpponents.ts";
import type { TdsAllowedArtifact } from "../src/lib/nfl/tdsAllowed/types.ts";
import { loadGames, loadPlayerWeekRows, loadTeamAbbrs, writeJsonAtomic } from "./lib/nflAllowedByPositionIo.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const OUT_FILE = join(DATA_DIR, "tds-allowed-by-position.json");

export const TDS_ALLOWED_BY_POSITION_SCHEMA_VERSION = "nfl-tds-allowed-by-position-v2" as const;

function parseArgs(argv: string[]) {
  const args = { dryRun: false, season: 2026, week: null as number | null, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const currentSeason = args.season;
  const priorSeason = currentSeason - 1;

  const currentSeasonGames = loadGames(ROOT, currentSeason);
  const week = args.week ?? resolveNflWeekSelection(currentSeasonGames).week;
  if (week == null) throw new Error(`Could not resolve a current week for season ${currentSeason}.`);

  const teams = loadTeamAbbrs(ROOT);
  if (teams.length !== 32) throw new Error(`Expected 32 canonical teams, found ${teams.length}.`);

  const historicalRows = [...loadPlayerWeekRows(ROOT, priorSeason), ...loadPlayerWeekRows(ROOT, currentSeason)];
  const opponents = resolveCurrentOpponents(currentSeasonGames, week);

  const rows = buildTdsAllowedRows({
    historicalRows,
    teams,
    currentSeason,
    priorSeason,
    opponents,
  });

  const artifact: TdsAllowedArtifact = {
    schemaVersion: TDS_ALLOWED_BY_POSITION_SCHEMA_VERSION,
    generatedAt: args.generatedAt,
    season: currentSeason,
    week,
    rows,
  };

  if (args.dryRun) {
    console.log(JSON.stringify(artifact, null, 2).slice(0, 2000));
    console.log(`\n(dry run) ${rows.length} rows, would write to ${OUT_FILE}`);
    return;
  }

  writeJsonAtomic(OUT_FILE, artifact);
  console.log(`Wrote ${rows.length} rows to ${OUT_FILE}`);
}

main();
