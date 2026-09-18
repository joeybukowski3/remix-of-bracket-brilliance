/**
 * Generates public/data/nfl/fantasy-position-matchups.json -- the "Fantasy
 * Position Matchup Comparison" artifact: a team's own fantasy production by
 * position (QB/RB/WR/TE) vs. the opponent defense's fantasy points allowed
 * by that position, across four samples (2026 / 2025 / last5 / last8).
 *
 * WR here is aggregated directly from raw per-game "WR" player rows (see
 * src/lib/nfl/positionMatchups/aggregate.ts and buildRows.ts) -- unlike the
 * Fantasy Points Allowed page, there is no Wide WR / Slot WR split to worry
 * about, since both FOR and ALLOWED are built from the same per-game
 * player-week history.
 *
 * Reads only committed caches (never touches the network) via
 * scripts/lib/nflAllowedByPositionIo.ts (shared with the other "Allowed by
 * Position" generators):
 *   - data/nfl/nflverse/stats-player-week/stats_player_week_{season}.csv
 *   - public/data/nfl/teams.json
 *   - public/data/nfl/<season>/games.json
 *
 * Usage:
 *   npx tsx scripts/generate-nfl-fantasy-position-matchups.ts
 *   npx tsx scripts/generate-nfl-fantasy-position-matchups.ts --dry-run
 *   npx tsx scripts/generate-nfl-fantasy-position-matchups.ts --season=2026 --week=3
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FANTASY_SCORING_VERSION } from "../src/lib/fantasy/weekly/scoring.ts";
import { resolveNflWeekSelection } from "../src/lib/nfl/weekSelection.ts";
import { buildPositionMatchupRows } from "../src/lib/nfl/positionMatchups/buildRows.ts";
import { resolveCurrentOpponents } from "../src/lib/nfl/fantasyAllowed/currentOpponents.ts";
import type { PositionMatchupArtifact } from "../src/lib/nfl/positionMatchups/types.ts";
import { loadGames, loadPlayerWeekRows, loadTeamAbbrs, writeJsonAtomic } from "./lib/nflAllowedByPositionIo.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const OUT_FILE = join(DATA_DIR, "fantasy-position-matchups.json");

export const FANTASY_POSITION_MATCHUPS_SCHEMA_VERSION = "nfl-fantasy-position-matchups-v1" as const;

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

  const rows = buildPositionMatchupRows({
    historicalRows,
    teams,
    currentSeason,
    priorSeason,
    opponents,
  });

  const artifact: PositionMatchupArtifact = {
    schemaVersion: FANTASY_POSITION_MATCHUPS_SCHEMA_VERSION,
    generatedAt: args.generatedAt,
    season: currentSeason,
    week,
    scoringVersion: FANTASY_SCORING_VERSION,
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
