/**
 * Generates public/data/nfl/fantasy-points-allowed.json -- defense rank
 * tables for fantasy points allowed by position (QB/RB/WR/wideWr/slotWr/TE),
 * across current season, prior season, last-5, and last-8 samples.
 *
 * QB/RB/WR/TE are aggregated here from per-game nflverse player stats using the
 * site's JKB Full PPR scoring (same scoring `HistoricalPlayerWeek` rows use).
 * wideWr/slotWr can only be populated for the "2026" sample, from the
 * defense-level Razzball slot/wide PPG-allowed snapshot
 * (public/data/nfl/<season>/slot-wide-defense-context.json) -- there is no
 * per-game historical slot/wide split in this repo's nflverse cache, so
 * 2025/last5/last8 are intentionally left null for those two columns. Combined
 * WR remains available from player-week rows in every sample.
 *
 * Reads only committed caches (never touches the network) via
 * scripts/lib/nflAllowedByPositionIo.ts (shared with
 * generate-nfl-tds-allowed-by-position.ts):
 *   - data/nfl/nflverse/stats-player-week/stats_player_week_{season}.csv
 *   - public/data/nfl/teams.json
 *   - public/data/nfl/<season>/games.json
 *   - public/data/nfl/<season>/slot-wide-defense-context.json
 *
 * Usage:
 *   npx tsx scripts/generate-nfl-fantasy-points-allowed.ts
 *   npx tsx scripts/generate-nfl-fantasy-points-allowed.ts --dry-run
 *   npx tsx scripts/generate-nfl-fantasy-points-allowed.ts --season=2026 --week=3
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeNflTeamAbbr } from "../src/lib/nfl/identity/identity.ts";
import { FANTASY_SCORING_VERSION } from "../src/lib/fantasy/weekly/scoring.ts";
import { resolveNflWeekSelection } from "../src/lib/nfl/weekSelection.ts";
import { buildFantasyAllowedRows } from "../src/lib/nfl/fantasyAllowed/buildRows.ts";
import { resolveCurrentOpponents } from "../src/lib/nfl/fantasyAllowed/currentOpponents.ts";
import type { FantasyAllowedArtifact } from "../src/lib/nfl/fantasyAllowed/types.ts";
import { loadGames, loadPlayerWeekRows, loadTeamAbbrs, readJson, writeJsonAtomic } from "./lib/nflAllowedByPositionIo.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "public", "data", "nfl");
const OUT_FILE = join(DATA_DIR, "fantasy-points-allowed.json");

export const FANTASY_POINTS_ALLOWED_SCHEMA_VERSION = "nfl-fantasy-points-allowed-v2" as const;

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

function loadSlotWideSnapshot(season: number): Map<string, { slotPpgAllowed: number; widePpgAllowed: number }> | null {
  const path = join(DATA_DIR, String(season), "slot-wide-defense-context.json");
  if (!existsSync(path)) return null;
  const artifact = readJson(path) as {
    teams: Array<{ team: string; slotPpgAllowed: number; widePpgAllowed: number }>;
  };
  const map = new Map<string, { slotPpgAllowed: number; widePpgAllowed: number }>();
  for (const team of artifact.teams) {
    const abbr = normalizeNflTeamAbbr(team.team);
    if (abbr) map.set(abbr, { slotPpgAllowed: team.slotPpgAllowed, widePpgAllowed: team.widePpgAllowed });
  }
  return map;
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
  const slotWideSnapshot = loadSlotWideSnapshot(currentSeason);

  const rows = buildFantasyAllowedRows({
    historicalRows,
    teams,
    currentSeason,
    priorSeason,
    opponents,
    slotWideSnapshot,
  });

  const artifact: FantasyAllowedArtifact = {
    schemaVersion: FANTASY_POINTS_ALLOWED_SCHEMA_VERSION,
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
