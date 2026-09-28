/**
 * Generates public/data/nfl/yards-vs-average-by-position.json -- the "Yards
 * vs Avg" view of /nfl/fantasy-points-allowed: per defense, how far opponents'
 * PASS / RUSH / QB RUSH / RB RUSH / RB REC / WR REC / TE REC yardage sat above
 * or below each opponent's own leave-one-out baseline (blended with its prior
 * season early on via nfl-comparison-blend-v1). See
 * src/lib/nfl/yardsVsAverage/ and docs/features/nfl-fantasy-points-allowed.md.
 *
 * Reads only committed caches (never touches the network) via
 * scripts/lib/nflAllowedByPositionIo.ts:
 *   - data/nfl/nflverse/stats-player-week/stats_player_week_{S-2,S-1,S}.csv
 *   - public/data/nfl/teams.json
 *   - public/data/nfl/<season>/games.json
 *
 * Usage:
 *   npx tsx scripts/generate-nfl-yards-vs-average.ts --season=2026
 *   npx tsx scripts/generate-nfl-yards-vs-average.ts --season=2026 --week=3 --dry-run
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNflWeekSelection } from "../src/lib/nfl/weekSelection.ts";
import { resolveCurrentOpponents } from "../src/lib/nfl/fantasyAllowed/currentOpponents.ts";
import { buildYardsVsAverageArtifact } from "../src/lib/nfl/yardsVsAverage/buildArtifact.ts";
import { loadGames, loadTeamAbbrs, writeTextAtomic } from "./lib/nflAllowedByPositionIo.ts";
import { loadYardsVsAverageRows, serializeCompactJson, YARDS_VS_AVERAGE_OUT_FILE } from "./lib/nflYardsVsAverageIo.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, YARDS_VS_AVERAGE_OUT_FILE);
const LOG = "[nfl:yards-vs-average]";

function parseArgs(argv: string[]) {
  const args = { dryRun: false, season: 2026, week: null as number | null, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice(9));
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice(7));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!Number.isInteger(args.season)) throw new Error(`Invalid --season ${args.season}`);
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const games = loadGames(ROOT, args.season);
  const week = args.week ?? resolveNflWeekSelection(games).week;
  if (week == null) throw new Error(`Could not resolve a current week for season ${args.season}.`);

  const teams = loadTeamAbbrs(ROOT);
  if (teams.length !== 32) throw new Error(`Expected 32 canonical teams, found ${teams.length}.`);

  const artifact = buildYardsVsAverageArtifact({
    rows: loadYardsVsAverageRows(ROOT, args.season),
    teams,
    season: args.season,
    week,
    opponents: resolveCurrentOpponents(games, week),
    generatedAt: args.generatedAt,
  });

  const current = artifact.games.filter((game) => game.season === args.season);
  const perTeam: Record<string, number> = {};
  for (const game of current) perTeam[game.defense] = (perTeam[game.defense] ?? 0) + 1;
  const distribution: Record<string, number> = {};
  for (const team of teams) distribution[perTeam[team] ?? 0] = (distribution[perTeam[team] ?? 0] ?? 0) + 1;
  const noBaseline = artifact.games.filter((game) => game.baseline == null).map((game) => game.key);
  console.log(`${LOG} season=${args.season} week=${week} games=${artifact.games.length} currentSeasonGames=${current.length} gamesPerDefense=${JSON.stringify(distribution)} withoutBaseline=${noBaseline.length ? noBaseline.join(",") : 0}`);

  if (args.dryRun) {
    console.log(`(dry run) ${artifact.rows.length} rows, would write to ${OUT_FILE}`);
    return;
  }
  writeTextAtomic(OUT_FILE, `${serializeCompactJson(artifact)}\n`);
  console.log(`${LOG} wrote ${artifact.rows.length} rows to ${OUT_FILE}`);
}

main();
