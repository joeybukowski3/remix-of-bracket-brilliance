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
import { reportPlayerWeekCoverage } from "./lib/nfl-allowed-by-position-coverage.mjs";
import { currentSeasonGamesByTeam } from "./lib/nfl-fantasy-allowed-coverage.mjs";
import type { NflGameRecord } from "../src/lib/nfl/standings.ts";
import type { HistoricalPlayerWeek } from "../src/lib/fantasy/weekly/history.ts";

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

const LOG = "[nfl:fantasy-points-allowed]";

type ResultRecord = { week: number; seasonType: string; final: boolean };

/** Distribution of per-team current-season games, e.g. {"2":2,"3":30}. */
function gamesDistribution(byTeam: Map<string, number>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const games of byTeam.values()) counts[games] = (counts[games] ?? 0) + 1;
  return counts;
}

function readPreviousArtifact(): FantasyAllowedArtifact | null {
  if (!existsSync(OUT_FILE)) return null;
  try {
    return readJson(OUT_FILE) as FantasyAllowedArtifact;
  } catch (error) {
    console.warn(`${LOG} previous artifact unreadable (${error instanceof Error ? error.message : error}); treating as absent`);
    return null;
  }
}

/** Schedule state plus cache coverage (lag is a warning, never a failure). */
function logRefreshContext(season: number, week: number, games: NflGameRecord[], currentRows: HistoricalPlayerWeek[]) {
  const resultsFile = join(DATA_DIR, String(season), "results.json");
  const results: ResultRecord[] = existsSync(resultsFile) ? (readJson(resultsFile).results ?? []) : [];
  const scheduledInWeek = games.filter((game) => game.seasonType === "REG" && game.week === week).length;
  const finalInWeek = results.filter((result) => result.seasonType === "REG" && result.week === week && result.final).length;
  const finalInSeason = results.filter((result) => result.seasonType === "REG" && result.final).length;
  console.log(`${LOG} season=${season} week=${week} scheduledGamesInWeek=${scheduledInWeek} finalGamesInWeek=${finalInWeek} finalGamesSeason=${finalInSeason}`);
  reportPlayerWeekCoverage({ season, results, games, playerWeekRows: currentRows }, `Fantasy Points Allowed ${season} player-week cache`);
}

/** What this rebuild changes versus the previously published artifact. */
function logArtifactChange(previous: FantasyAllowedArtifact | null, next: FantasyAllowedArtifact) {
  const after = currentSeasonGamesByTeam(next);
  const before = previous?.season === next.season ? currentSeasonGamesByTeam(previous) : new Map<string, number>();
  if (previous) {
    console.log(`${LOG} previous artifact: season=${previous.season} week=${previous.week} generatedAt=${previous.generatedAt} gamesPerTeam=${JSON.stringify(gamesDistribution(before))}`);
  } else {
    console.log(`${LOG} previous artifact: none`);
  }
  let newTeamGames = 0;
  const changedTeams: string[] = [];
  for (const [team, games] of after) {
    const delta = games - (before.get(team) ?? 0);
    if (delta !== 0) changedTeams.push(`${team}${delta > 0 ? "+" : ""}${delta}`);
    newTeamGames += delta;
  }
  console.log(`${LOG} rebuilt artifact: week=${next.week} gamesPerTeam=${JSON.stringify(gamesDistribution(after))} newlyIncorporatedTeamGames=${newTeamGames} (${changedTeams.join(" ") || "no change"})`);
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

  const currentRows = loadPlayerWeekRows(ROOT, currentSeason);
  const historicalRows = [...loadPlayerWeekRows(ROOT, priorSeason), ...currentRows];
  logRefreshContext(currentSeason, week, currentSeasonGames, currentRows);
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

  logArtifactChange(readPreviousArtifact(), artifact);

  if (args.dryRun) {
    console.log(JSON.stringify(artifact, null, 2).slice(0, 2000));
    console.log(`\n(dry run) ${rows.length} rows, would write to ${OUT_FILE}`);
    return;
  }

  writeJsonAtomic(OUT_FILE, artifact);
  console.log(`${LOG} wrote ${rows.length} rows to ${OUT_FILE}`);
}

main();
