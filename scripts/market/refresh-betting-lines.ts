/**
 * WU8 free daily NFL odds snapshot CLI.
 *
 * One deterministic command: build the canonical NFL slate from the repo's
 * existing schedule artifact, make ONE The Odds API league-wide request, decode
 * to per-book lines, join to canonical games, and (unless --dry-run) dedupe into
 * the private JSONL history and publish the browser artifacts.
 *
 * Usage:
 *   $env:THE_ODDS_API_KEY="..."
 *   npm run market:betting-lines:refresh -- `
 *     --season 2026 --week 1 --dry-run
 *
 * Canonical schedule source (no new schedule source is introduced):
 *   public/data/nfl/<season>/games.json   (override with --games <path>)
 *
 * The provider free plan is 500 credits/MONTH; the quota guard refuses to spend
 * when the previous run left < --quota-floor credits (default 50) unless
 * --allow-low-quota is passed.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createTheOddsApiClient } from "../../src/lib/market/providers/theOddsApiClient";
import { createBettingLineFileStore } from "../../src/lib/market/lines/bettingLineFileStore";
import { runBettingLineRefresh } from "../../src/lib/market/lines/refreshBettingLines";
import { loadCanonicalNflSlate } from "../../src/lib/market/lines/canonicalNflSlate";
import { resolveTheOddsApiNflTeamId } from "../../src/lib/market/lines/theOddsApiNflTeamIdentity";
import { normalizeNflTeamAbbr } from "../../src/lib/nfl/identity/identity";
import type { CanonicalBettingGame } from "../../src/lib/market/lines/canonicalBettingGame";
import type { NflGameRecord } from "../../src/lib/nfl/standings";

const ROOT =
  process.env.MARKET_BETTING_LINES_ROOT?.trim() || resolve(import.meta.dirname, "..", "..");
const STORE_ROOT = resolve(ROOT, "data", "market", "betting-lines");
const PUBLIC_MARKET_ROOT = resolve(ROOT, "public", "data", "market");

type CliArgs = {
  season: number;
  week: number;
  gamesPath: string;
  dryRun: boolean;
  quotaFloor: number | undefined;
  allowLowQuota: boolean;
};

function parseArgs(argv: readonly string[]): CliArgs {
  const map = new Map<string, string>();
  let dryRun = false;
  let allowLowQuota = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (token === "--allow-low-quota") {
      allowLowQuota = true;
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
  if (league !== "nfl") {
    throw new Error(`--league must be nfl; received ${league}`);
  }
  const season = Number(map.get("season"));
  if (!Number.isInteger(season) || season < 2000) {
    throw new Error(`--season must be a year >= 2000; received ${map.get("season")}`);
  }
  const week = Number(map.get("week"));
  if (!Number.isInteger(week) || week <= 0) {
    throw new Error(`--week must be a positive integer; received ${map.get("week")}`);
  }
  const quotaFloorRaw = map.get("quota-floor");
  const quotaFloor = quotaFloorRaw === undefined ? undefined : Number(quotaFloorRaw);
  if (quotaFloor !== undefined && (!Number.isFinite(quotaFloor) || quotaFloor < 0)) {
    throw new Error(`--quota-floor must be a non-negative number; received ${quotaFloorRaw}`);
  }

  return {
    season,
    week,
    gamesPath: map.get("games") ?? `public/data/nfl/${season}/games.json`,
    dryRun,
    quotaFloor,
    allowLowQuota,
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

function nflCanonicalGames(
  gamesDocument: unknown,
  season: number,
  week: number,
  source: string,
): CanonicalBettingGame[] {
  const slate = loadCanonicalNflSlate({
    season,
    week,
    seasonType: "REG",
    gamesDocument,
    source,
  });
  return slate.games.map((game: NflGameRecord) => ({
    league: "nfl" as const,
    season: game.season,
    week: game.week,
    jkbGameId: game.gameId,
    awayTeamId: normalizeNflTeamAbbr(game.awayAbbr) ?? game.awayAbbr,
    homeTeamId: normalizeNflTeamAbbr(game.homeAbbr) ?? game.homeAbbr,
    kickoffUtc: game.dateUtc,
    neutralSite: game.neutralSite,
  }));
}

function printReport(report: Awaited<ReturnType<typeof runBettingLineRefresh>>): void {
  const lines = [
    "",
    "=== betting-lines refresh report ===",
    `league               ${report.league}`,
    `season / week        ${report.season} / ${report.week}`,
    `dryRun               ${report.dryRun}`,
    "--- join ---",
    `canonicalGames       ${report.canonicalGames}`,
    `providerEvents       ${report.providerEvents}`,
    `bookmakerRows        ${report.bookmakerRows}`,
    `matchedGames         ${report.matchedGames}`,
    `unmatchedGames       ${report.unmatchedGames}`,
    `unmatchedRows        ${report.unmatchedRows}`,
    `ambiguousRows        ${report.ambiguousRows}`,
    `rejectedRows         ${report.rejectedRows}`,
    "--- persistence ---",
    `inserted             ${report.dryRun ? `${report.inserted} (skipped: dry-run)` : report.inserted}`,
    `extended             ${report.dryRun ? `${report.extended} (skipped: dry-run)` : report.extended}`,
    `unchanged            ${report.dryRun ? `${report.unchanged} (skipped: dry-run)` : report.unchanged}`,
    `rejected             ${report.rejected}`,
    "--- quota (The Odds API, 500 credits / MONTH) ---",
    `quotaLastCost        ${report.quotaLastCost ?? "?"}`,
    `quotaUsed            ${report.quotaUsed ?? "?"}`,
    `quotaRemaining       ${report.quotaRemaining ?? "?"}`,
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

  const apiKey = process.env.THE_ODDS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "THE_ODDS_API_KEY is required in the process environment. No request was made.",
    );
  }

  const gamesDocument = await readJson(args.gamesPath, "canonical NFL schedule");
  const canonicalGames = nflCanonicalGames(
    gamesDocument,
    args.season,
    args.week,
    args.gamesPath,
  );

  const client = createTheOddsApiClient({ apiKey });
  const store = createBettingLineFileStore({ rootDir: STORE_ROOT });

  const report = await runBettingLineRefresh({
    league: "nfl",
    season: args.season,
    week: args.week,
    dryRun: args.dryRun,
    client,
    store,
    canonicalGames,
    resolveTeam: resolveTheOddsApiNflTeamId,
    stateRoot: STORE_ROOT,
    publicRoot: PUBLIC_MARKET_ROOT,
    quotaFloor: args.quotaFloor,
    allowLowQuota: args.allowLowQuota,
    logger: {
      info: (message) => console.log(`[market:betting-lines:refresh] ${message}`),
      warn: (message) => console.warn(`[market:betting-lines:refresh] ${message}`),
    },
  });

  printReport(report);
  if (args.dryRun) {
    console.log(
      "[market:betting-lines:refresh] dry-run: no private history, quota-state or public artifact was written.",
    );
  }
}

main().catch((error) => {
  console.error(`[market:betting-lines:refresh] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
