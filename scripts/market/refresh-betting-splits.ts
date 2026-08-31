/**
 * WU7 operational refresh CLI: one deterministic command that builds the
 * canonical NFL slate from the existing nflverse schedule artifact, runs the
 * WU6 collector, and (unless --dry-run) runs the WU5 public artifact publisher.
 *
 * It orchestrates the existing modules — it does not reimplement discovery,
 * normalization, joining, persistence or publication.
 *
 * Usage:
 *   $env:SPORTSDATAIO_API_KEY="..."
 *   npm run market:betting-splits:refresh -- `
 *     --league nfl --season 2026 --week 1 [--season-type REG] [--dry-run]
 *
 * Canonical schedule source (no second NFL schedule source is introduced):
 *   public/data/nfl/<season>/games.json   (override with --games <path>)
 * Canonical teams (optional, improves joins):
 *   public/data/nfl/teams.json            (override with --teams <path>)
 *
 * Only --league nfl is supported. CFB is rejected before any request.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSportsDataIoClient } from "../../src/lib/market/providers/sportsDataIoClient";
import { createBettingSplitFileStore } from "../../src/lib/market/bettingSplitsFileStore";
import { runBettingSplitsRefresh } from "../../src/lib/market/refreshBettingSplits";
import type { SportsDataIoSeasonType } from "../../src/lib/market/providers/sportsDataIoClient";
import type { CanonicalNflTeam } from "../../src/lib/nfl/standings";

const ROOT =
  process.env.MARKET_BETTING_SPLITS_ROOT?.trim() || resolve(import.meta.dirname, "..", "..");
const STORE_ROOT = resolve(ROOT, "data", "market", "betting-splits");
const PUBLIC_MARKET_ROOT = resolve(ROOT, "public", "data", "market");

type CliArgs = {
  league: string;
  season: number;
  week: number;
  seasonType: SportsDataIoSeasonType;
  gamesPath: string;
  teamsPath: string | null;
  dryRun: boolean;
};

function parseArgs(argv: readonly string[]): CliArgs {
  const map = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      map.set(key, value);
      i += 1;
    }
  }

  const league = (map.get("league") ?? "nfl").toLowerCase();
  const season = Number(map.get("season"));
  if (!Number.isInteger(season) || season < 2000) {
    throw new Error(`--season must be a year >= 2000; received ${map.get("season")}`);
  }
  const week = Number(map.get("week"));
  if (!Number.isInteger(week) || week <= 0) {
    throw new Error(`--week must be a positive integer; received ${map.get("week")}`);
  }
  const seasonTypeRaw = (map.get("season-type") ?? "REG").toUpperCase();
  if (seasonTypeRaw !== "REG" && seasonTypeRaw !== "PRE" && seasonTypeRaw !== "POST") {
    throw new Error(`--season-type must be REG, PRE or POST; received ${seasonTypeRaw}`);
  }

  return {
    league,
    season,
    week,
    seasonType: seasonTypeRaw as SportsDataIoSeasonType,
    gamesPath: map.get("games") ?? `public/data/nfl/${season}/games.json`,
    teamsPath: map.get("teams") ?? "public/data/nfl/teams.json",
    dryRun,
  };
}

async function readJson(path: string, label: string): Promise<unknown> {
  const absolute = resolve(ROOT, path);
  try {
    return JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label} at ${absolute}: ${(error as Error).message}`);
  }
}

function printReport(report: Awaited<ReturnType<typeof runBettingSplitsRefresh>>): void {
  const c = report.collection;
  const lines = [
    "",
    "=== betting-splits refresh report ===",
    `league               ${report.league}`,
    `season / week / type  ${report.season} / ${report.week} / ${report.seasonType}`,
    `dryRun               ${report.dryRun}`,
    `scheduleSource       ${report.scheduleSource}`,
    "--- discovery / normalization ---",
    `canonicalGames       ${report.canonicalGames}`,
    `discoveredGames      ${c.discoveredGames}`,
    `candidateGames       ${c.candidateGames}`,
    `providerDiscoveryMissing ${c.providerDiscoveryMissing} (canonical game, no provider game)`,
    `providerDiscoveredUnmatched ${c.providerDiscoveredUnmatched} (provider game, no canonical match)`,
    `splitRequests        ${c.splitRequests}`,
    `providerRows         ${c.providerRows}`,
    `normalizedEvents     ${c.normalizedEvents}`,
    "--- join / persistence ---",
    `matched              ${c.matched}`,
    `inserted             ${report.dryRun ? `${c.inserted} (skipped: dry-run)` : c.inserted}`,
    `extended             ${report.dryRun ? `${c.extended} (skipped: dry-run)` : c.extended}`,
    `unmatched            ${c.unmatched}`,
    `ambiguous            ${c.ambiguous}`,
    `rejected             ${c.rejected}`,
    "--- crosswalks ---",
    `crosswalkInserted    ${report.dryRun ? `${c.crosswalkInserted} (skipped: dry-run)` : c.crosswalkInserted}`,
    `crosswalkVerified    ${report.dryRun ? `${c.crosswalkVerified} (skipped: dry-run)` : c.crosswalkVerified}`,
    `crosswalkConflicts   ${c.crosswalkConflicts}`,
    "--- publication ---",
    `publishedGames       ${report.publishSkipped ? "0 (skipped: dry-run)" : report.publishedGames}`,
    `publishedHistoryFiles ${report.publishSkipped ? "0 (skipped: dry-run)" : report.publishedHistoryFiles}`,
    "",
  ];
  console.log(lines.join("\n"));
  console.log(JSON.stringify(report, null, 2));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.league !== "nfl") {
    throw new Error(
      "Only --league nfl is supported. CFB SportsDataIO discovery and split " +
        "routes are unverified and intentionally not implemented.",
    );
  }

  const apiKey = process.env.SPORTSDATAIO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "SPORTSDATAIO_API_KEY is required in the process environment. No request was made.",
    );
  }

  const gamesDocument = await readJson(args.gamesPath, "canonical NFL schedule");
  let canonicalTeams: CanonicalNflTeam[] | undefined;
  if (args.teamsPath) {
    try {
      const teamsDoc = (await readJson(args.teamsPath, "canonical NFL teams")) as {
        teams?: CanonicalNflTeam[];
      };
      canonicalTeams = Array.isArray(teamsDoc?.teams) ? teamsDoc.teams : undefined;
    } catch {
      canonicalTeams = undefined;
    }
  }

  const client = createSportsDataIoClient({ apiKey });
  const store = createBettingSplitFileStore({ rootDir: STORE_ROOT });

  const report = await runBettingSplitsRefresh({
    league: "nfl",
    season: args.season,
    week: args.week,
    seasonType: args.seasonType,
    dryRun: args.dryRun,
    client,
    store,
    gamesDocument,
    scheduleSource: args.gamesPath,
    canonicalTeams,
    publicRoot: PUBLIC_MARKET_ROOT,
    logger: {
      info: (message) => console.log(`[market:betting-splits:refresh] ${message}`),
      warn: (message) => console.warn(`[market:betting-splits:refresh] ${message}`),
    },
  });

  printReport(report);
  if (args.dryRun) {
    console.log(
      "[market:betting-splits:refresh] dry-run: no private history, crosswalk or public artifact was written.",
    );
  }
}

main().catch((error) => {
  console.error(`[market:betting-splits:refresh] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
