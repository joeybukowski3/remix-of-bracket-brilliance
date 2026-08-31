/**
 * WU9 — daily NFL-only "refresh the current week's betting lines" wrapper.
 *
 * Resolves the nearest upcoming NFL REG / postseason week from the canonical
 * nflverse schedule and runs the existing WU8 betting-lines refresh for it.
 * NFL only — never CFB, SportsDataIO, or betting splits.
 *
 * Usage (local test):
 *   $env:THE_ODDS_API_KEY="..."
 *   npm run market:betting-lines:refresh-current            # live NFL refresh
 *   npm run market:betting-lines:refresh-current -- --dry-run
 *
 * Offseason (no future REG/postseason game in the schedule): prints
 * "no active/upcoming NFL slate", makes NO provider request, exits 0.
 *
 * Canonical schedule source (no new schedule source is introduced):
 *   public/data/nfl/<season>/games.json   (current + previous season loaded)
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createTheOddsApiClient } from "../../src/lib/market/providers/theOddsApiClient";
import { createBettingLineFileStore } from "../../src/lib/market/lines/bettingLineFileStore";
import { refreshCurrentNflBettingLines } from "../../src/lib/market/lines/refreshCurrentNflBettingLines";

const ROOT =
  process.env.MARKET_BETTING_LINES_ROOT?.trim() || resolve(import.meta.dirname, "..", "..");
const STORE_ROOT = resolve(ROOT, "data", "market", "betting-lines");
const PUBLIC_MARKET_ROOT = resolve(ROOT, "public", "data", "market");

async function readGamesDocument(season: number): Promise<unknown | null> {
  const absolute = resolve(ROOT, "public", "data", "nfl", String(season), "games.json");
  try {
    return JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.slice(2).includes("--dry-run");

  const nowUtc = new Date().toISOString();
  const currentYear = new Date(nowUtc).getUTCFullYear();

  const documents = (
    await Promise.all([
      readGamesDocument(currentYear),
      readGamesDocument(currentYear - 1),
    ])
  ).filter((document): document is unknown => document !== null);

  if (documents.length === 0) {
    throw new Error(
      `No canonical NFL schedule found at public/data/nfl/${currentYear}/games.json ` +
        `or public/data/nfl/${currentYear - 1}/games.json.`,
    );
  }

  const logger = {
    info: (message: string) => console.log(`[market:betting-lines:refresh-current] ${message}`),
    warn: (message: string) => console.warn(`[market:betting-lines:refresh-current] ${message}`),
  };

  const result = await refreshCurrentNflBettingLines({
    gamesDocuments: documents,
    scheduleSource: `public/data/nfl/{${currentYear},${currentYear - 1}}/games.json`,
    createClient: () => {
      const apiKey = process.env.THE_ODDS_API_KEY?.trim();
      if (!apiKey) {
        throw new Error(
          "THE_ODDS_API_KEY is required in the process environment. No request was made.",
        );
      }
      return createTheOddsApiClient({ apiKey });
    },
    store: createBettingLineFileStore({ rootDir: STORE_ROOT }),
    stateRoot: STORE_ROOT,
    publicRoot: PUBLIC_MARKET_ROOT,
    dryRun,
    nowUtc,
    logger,
  });

  if (result.status === "no-slate") {
    console.log(
      "[market:betting-lines:refresh-current] no active/upcoming NFL slate — " +
        "no provider request made, nothing written.",
    );
    return;
  }

  console.log(JSON.stringify({ slate: result.slate, report: result.report }, null, 2));
  if (dryRun) {
    console.log(
      "[market:betting-lines:refresh-current] dry-run: no private history, quota-state or public artifact was written.",
    );
  }
}

main().catch((error) => {
  console.error(
    `[market:betting-lines:refresh-current] FAILED: ${(error as Error).message}`,
  );
  process.exitCode = 1;
});
