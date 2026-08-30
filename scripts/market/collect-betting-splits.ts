/**
 * WU6 collector CLI: discover a SportsDataIO NFL slate, fetch betting splits for
 * the games that plausibly belong to the canonical JKB slate, normalize/join
 * them, and persist change-based snapshots plus verified provider<->JKB
 * crosswalks under `data/market/betting-splits/`.
 *
 * This CLI never publishes public artifacts — run
 * `scripts/market/publish-betting-splits.ts` (npm run market:betting-splits:publish)
 * as a separate, explicit step.
 *
 * Usage:
 *   SPORTSDATAIO_API_KEY=... \
 *   npm run market:betting-splits:collect -- \
 *     --league nfl --season 2026 --week 1 \
 *     --schedule data/market/betting-splits/canonical/nfl-2026-week-1.json \
 *     [--teams public/data/nfl/teams.json] [--season-type REG] [--dry-run]
 *
 * `--schedule` is a JSON array of canonical NflGameRecord objects for the slate.
 * The betting-splits domain does not own an NFL schedule source; the caller
 * supplies the authoritative one so provider identity is never trusted to
 * define a canonical game.
 *
 * Only --league nfl is supported: the SportsDataIO CFB schedule and
 * betting-splits-by-game routes could not be verified and are not guessed.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSportsDataIoClient } from "../../src/lib/market/providers/sportsDataIoClient";
import { runBettingSplitsCollection } from "../../src/lib/market/collectBettingSplits";
import { createBettingSplitFileStore } from "../../src/lib/market/bettingSplitsFileStore";
import type { SportsDataIoSeasonType } from "../../src/lib/market/providers/sportsDataIoClient";
import type { NflGameRecord, CanonicalNflTeam } from "../../src/lib/nfl/standings";

const ROOT = process.env.MARKET_BETTING_SPLITS_ROOT?.trim() || resolve(import.meta.dirname, "..", "..");
const STORE_ROOT = resolve(ROOT, "data", "market", "betting-splits");

type CliArgs = {
  league: "nfl" | "cfb";
  season: number;
  week: number;
  seasonType: SportsDataIoSeasonType;
  schedulePath: string;
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
  if (league !== "nfl" && league !== "cfb") {
    throw new Error(`--league must be nfl or cfb; received ${league}`);
  }
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
  const schedulePath = map.get("schedule");
  if (!schedulePath) {
    throw new Error("--schedule <path to canonical NflGameRecord[] JSON> is required");
  }

  return {
    league,
    season,
    week,
    seasonType: seasonTypeRaw as SportsDataIoSeasonType,
    schedulePath,
    teamsPath: map.get("teams") ?? null,
    dryRun,
  };
}

async function readJsonArray<T>(path: string, label: string): Promise<T[]> {
  const absolute = resolve(ROOT, path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolute, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label} at ${absolute}: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} at ${absolute} must be a JSON array.`);
  }
  return parsed as T[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.league !== "nfl") {
    throw new Error(
      "Only --league nfl is supported. The SportsDataIO CFB schedule and " +
        "betting-splits-by-game routes are unverified and intentionally not implemented.",
    );
  }

  const apiKey = process.env.SPORTSDATAIO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "SPORTSDATAIO_API_KEY is required in the process environment. No request was made.",
    );
  }

  const canonicalGames = await readJsonArray<NflGameRecord>(args.schedulePath, "canonical schedule");
  const canonicalTeams = args.teamsPath
    ? await readJsonArray<CanonicalNflTeam>(args.teamsPath, "canonical teams")
    : undefined;

  const client = createSportsDataIoClient({ apiKey });
  const store = createBettingSplitFileStore({ rootDir: STORE_ROOT });

  const report = await runBettingSplitsCollection({
    league: args.league,
    season: args.season,
    seasonType: args.seasonType,
    week: args.week,
    dryRun: args.dryRun,
    client,
    canonicalGames,
    canonicalTeams,
    store,
    capturedAt: new Date().toISOString(),
    logger: {
      info: (message) => console.log(`[market:betting-splits:collect] ${message}`),
      warn: (message) => console.warn(`[market:betting-splits:collect] ${message}`),
    },
  });

  console.log(JSON.stringify(report, null, 2));
  if (args.dryRun) {
    console.log("[market:betting-splits:collect] dry-run: no snapshot, crosswalk or artifact was written.");
  }
}

main().catch((error) => {
  console.error(`[market:betting-splits:collect] FAILED: ${(error as Error).message}`);
  process.exitCode = 1;
});
