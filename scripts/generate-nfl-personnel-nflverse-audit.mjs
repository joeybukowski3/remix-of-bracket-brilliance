/**
 * Build a non-production Phase 5C-2A nflverse four-team personnel audit.
 *
 * This command is read-only with respect to external sources. It may cache
 * downloaded public nflverse CSV files under data/nfl/personnel/raw/nflverse,
 * but refuses to write public/data/nfl/<season>/personnel-evidence.json.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import teamsJson from "../public/data/nfl/teams.json" with { type: "json" };
import { normalizePlayerName } from "./lib/nfl-personnel/identity.mjs";
import {
  assertNonProductionOutput,
  buildNflverseFourTeamAudit,
  writeNflverseManifest,
} from "./lib/nfl-personnel/providers/nflverse/audit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANUAL_OFFSEASON_PATH = join(ROOT, "src/data/nflOffseason2026.ts");

function parseArgs(argv) {
  const args = {
    season: null,
    priorSeason: null,
    generatedAt: null,
    sourceCutoff: null,
    roster: null,
    priorRoster: null,
    playerStats: null,
    snapCounts: null,
    rosterUrl: null,
    priorRosterUrl: null,
    playerStatsUrl: null,
    snapCountsUrl: null,
    fixtureDir: null,
    cacheDir: null,
    output: null,
    dryRun: false,
    validateOnly: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--validate-only") args.validateOnly = true;
    else if (arg.startsWith("--season=")) args.season = Number(arg.slice("--season=".length));
    else if (arg.startsWith("--prior-season=")) args.priorSeason = Number(arg.slice("--prior-season=".length));
    else if (arg.startsWith("--generated-at=")) args.generatedAt = arg.slice("--generated-at=".length);
    else if (arg.startsWith("--source-cutoff=")) args.sourceCutoff = arg.slice("--source-cutoff=".length);
    else if (arg.startsWith("--roster=")) args.roster = resolve(arg.slice("--roster=".length));
    else if (arg.startsWith("--prior-roster=")) args.priorRoster = resolve(arg.slice("--prior-roster=".length));
    else if (arg.startsWith("--player-stats=")) args.playerStats = resolve(arg.slice("--player-stats=".length));
    else if (arg.startsWith("--snap-counts=")) args.snapCounts = resolve(arg.slice("--snap-counts=".length));
    else if (arg.startsWith("--roster-url=")) args.rosterUrl = arg.slice("--roster-url=".length);
    else if (arg.startsWith("--prior-roster-url=")) args.priorRosterUrl = arg.slice("--prior-roster-url=".length);
    else if (arg.startsWith("--player-stats-url=")) args.playerStatsUrl = arg.slice("--player-stats-url=".length);
    else if (arg.startsWith("--snap-counts-url=")) args.snapCountsUrl = arg.slice("--snap-counts-url=".length);
    else if (arg.startsWith("--fixture-dir=")) args.fixtureDir = resolve(arg.slice("--fixture-dir=".length));
    else if (arg.startsWith("--cache-dir=")) args.cacheDir = resolve(arg.slice("--cache-dir=".length));
    else if (arg.startsWith("--output=")) args.output = resolve(arg.slice("--output=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.season || !args.priorSeason) throw new Error("--season and --prior-season are required");
  if (!args.generatedAt) throw new Error("--generated-at is required for deterministic output");
  if (!args.sourceCutoff) throw new Error("--source-cutoff is required");
  if (args.fixtureDir) {
    args.roster ??= join(args.fixtureDir, `roster_${args.season}.csv`);
    args.priorRoster ??= join(args.fixtureDir, `roster_${args.priorSeason}.csv`);
    args.playerStats ??= join(args.fixtureDir, `stats_player_reg_${args.priorSeason}.csv`);
    args.snapCounts ??= join(args.fixtureDir, `snap_counts_${args.priorSeason}.csv`);
  }
  if (!args.validateOnly && !args.dryRun && !args.output) throw new Error("--output is required unless --dry-run or --validate-only is used");
  if (args.output) assertNonProductionOutput(args.output, args.season);
  return args;
}

function loadManualOffseasonSnapshot() {
  const text = readFileSync(MANUAL_OFFSEASON_PATH, "utf8");
  const teams = new Map(teamsJson.teams.map((team) => [team.abbr, team]));
  const records = teamsJson.teams.map((team) => ({
    teamId: team.id,
    abbr: team.abbr,
    personnel: [],
  }));
  const byAbbr = new Map(records.map((record) => [record.abbr, record]));
  const movePattern = /\{\s*player:\s*"([^"]+)",\s*position:\s*"([^"]+)",\s*from:\s*"([^"]+)",\s*to:\s*"([^"]+)",\s*method:\s*"([^"]+)"/g;
  for (const match of text.matchAll(movePattern)) {
    const [, playerName, position, from, to, method] = match;
    const fromTeam = teams.get(from);
    const toTeam = teams.get(to);
    if (fromTeam && byAbbr.has(from)) {
      byAbbr.get(from).personnel.push({
        playerName,
        normalizedPlayerName: normalizePlayerName(playerName),
        position,
        kind: method === "Trade" ? "trade_departure" : "free_agent_departure",
      });
    }
    if (toTeam && byAbbr.has(to)) {
      byAbbr.get(to).personnel.push({
        playerName,
        normalizedPlayerName: normalizePlayerName(playerName),
        position,
        kind: method === "Trade" ? "trade_addition" : "free_agent_addition",
      });
    }
  }
  return { records };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manualDataset = loadManualOffseasonSnapshot();
  const result = await buildNflverseFourTeamAudit({
    season: args.season,
    priorSeason: args.priorSeason,
    generatedAt: args.generatedAt,
    sourceCutoff: args.sourceCutoff,
    rosterSourcePath: args.roster,
    priorRosterSourcePath: args.priorRoster,
    playerStatsSourcePath: args.playerStats,
    snapCountsSourcePath: args.snapCounts,
    rosterSourceUrl: args.rosterUrl,
    priorRosterSourceUrl: args.priorRosterUrl,
    playerStatsSourceUrl: args.playerStatsUrl,
    snapCountsSourceUrl: args.snapCountsUrl,
    cacheDir: args.cacheDir,
    teamsJson,
    manualDataset,
  });

  let manifest = null;
  if (args.cacheDir) {
    manifest = writeNflverseManifest({
      manifestPath: join(args.cacheDir, "manifest.json"),
      season: args.season,
      retrievedAt: args.generatedAt,
      datasets: result.sourceManifests,
    });
  }

  if (!result.validation.valid) {
    console.error(JSON.stringify({ valid: false, errors: result.validation.errors }, null, 2));
    process.exit(1);
  }

  if (!args.dryRun && !args.validateOnly && args.output) {
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, result.json);
  }

  console.log(
    JSON.stringify(
      {
        valid: result.validation.valid,
        warningCount: result.validation.warnings.length,
        teamCount: result.dataset.teams.length,
        teams: result.dataset.teams.map((team) => team.abbr),
        readyForScoring: result.dataset.completenessEvaluation.readyForScoring,
        output: args.output,
        wrote: Boolean(!args.dryRun && !args.validateOnly && args.output),
        dryRun: args.dryRun,
        validateOnly: args.validateOnly,
        manifestPath: manifest ? join(args.cacheDir, "manifest.json") : null,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1]).replace(/\\/g, "/")}`).href) {
  main().catch((error) => {
    console.error(`[nfl:personnel:nflverse:audit] FAILED: ${error.message}`);
    process.exit(1);
  });
}
