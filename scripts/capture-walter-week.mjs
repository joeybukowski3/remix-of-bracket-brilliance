#!/usr/bin/env node
/**
 * Captures one WalterFootball weekly-picks snapshot (Wednesday/Thursday/
 * Saturday/Sunday) for the current or a given NFL week, and writes one
 * private, immutable-per-slot artifact per game under
 * data/walter/{season}/week-{NN}/games/{AWAY}-{HOME}/{captureType}.json.
 *
 * Usage:
 *   node scripts/capture-walter-week.mjs --capture=wednesday
 *   node scripts/capture-walter-week.mjs --capture=thursday --week=3 --season=2026
 *   node scripts/capture-walter-week.mjs --capture=sunday --dry-run
 *
 * One failed game (parse error, missing pick, unresolved team) never aborts
 * the run -- it's recorded in the week manifest as a parse failure and the
 * run continues. A capture that would overwrite an existing "ok" capture for
 * the same slot with a worse result is skipped (see storage.shouldWriteCapture).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCurrentWeek } from "./lib/nfl-market-coverage.mjs";
import { buildWindowUrls } from "./lib/walter/discoverWeek.mjs";
import { fetchWalterPage } from "./lib/walter/fetchPage.mjs";
import { parseWalterWindowPage } from "./lib/walter/parseGamePage.mjs";
import { normalizeGame } from "./lib/walter/normalizeGame.mjs";
import { captureFilePath, readJsonIfExists, readManifest, shouldWriteCapture, writeJson, writeManifest } from "./lib/walter/storage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURE_TYPES = ["wednesday", "thursday", "saturday", "sunday"];

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--capture=")) args.capture = raw.slice("--capture=".length);
    else if (raw.startsWith("--week=")) args.week = Number(raw.slice("--week=".length));
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice("--season=".length));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!args.capture || !CAPTURE_TYPES.includes(args.capture)) {
    throw new Error(`--capture is required and must be one of: ${CAPTURE_TYPES.join(", ")}`);
  }
  return args;
}

function resolveSeasonWeek(args) {
  if (args.season && args.week) return { season: args.season, week: args.week };
  const season = args.season ?? 2026;
  const path = resolve(ROOT, "public", "data", "nfl", String(season), "games.json");
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  const games = Array.isArray(artifact.games) ? artifact.games : [];
  const week = args.week ?? resolveCurrentWeek(games);
  if (week == null) throw new Error(`could not resolve current NFL week for season ${season}`);
  return { season, week };
}

async function captureWindow({ window, url }, context, dryRun) {
  const result = { window, url, fetched: false, gamesDiscovered: 0, gamesWritten: 0, gamesSkippedWorse: 0, gamesFailed: 0, warnings: [] };

  const fetchResult = await fetchWalterPage(url);
  if (!fetchResult.ok) {
    result.warnings.push(`fetch failed: ${fetchResult.error}`);
    return result;
  }
  result.fetched = true;

  const { games, pageWarnings } = parseWalterWindowPage(fetchResult.html, { sourceUrl: url });
  result.warnings.push(...pageWarnings);
  result.gamesDiscovered = games.length;

  for (const rawGame of games) {
    try {
      const capture = normalizeGame(rawGame, { ...context, sourceUrl: url, window });
      if (!capture.game.gameId) {
        result.gamesFailed++;
        result.warnings.push(`unresolved gameId for "${rawGame.awayName}" at "${rawGame.homeName}" -- not written`);
        continue;
      }

      const filePath = captureFilePath(ROOT, context.season, context.week, capture.game.gameId, context.captureType);
      const existing = readJsonIfExists(filePath);

      if (!shouldWriteCapture(existing, capture)) {
        result.gamesSkippedWorse++;
        result.warnings.push(`${capture.game.gameId}: kept existing "ok" capture, new parse was "${capture.parseStatus}"`);
        continue;
      }

      if (!dryRun) writeJson(filePath, capture);
      result.gamesWritten++;
      if (capture.parseStatus !== "ok") result.gamesFailed++;
    } catch (err) {
      result.gamesFailed++;
      result.warnings.push(`unexpected error normalizing "${rawGame.awayName}" at "${rawGame.homeName}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const { season, week } = resolveSeasonWeek(args);
  const capturedAt = new Date().toISOString();
  const context = { season, week, captureType: args.capture, capturedAt };

  const windows = buildWindowUrls(season, week);
  const windowResults = [];
  for (const w of windows) {
    windowResults.push(await captureWindow(w, context, args.dryRun));
  }

  const totalDiscovered = windowResults.reduce((sum, r) => sum + r.gamesDiscovered, 0);
  const totalWritten = windowResults.reduce((sum, r) => sum + r.gamesWritten, 0);
  const totalFailed = windowResults.reduce((sum, r) => sum + r.gamesFailed, 0);

  if (!args.dryRun) {
    const manifest = readManifest(ROOT, season, week);
    manifest.captures[args.capture] = {
      capturedAt,
      windows: windowResults.map((r) => ({
        window: r.window,
        url: r.url,
        fetched: r.fetched,
        gamesDiscovered: r.gamesDiscovered,
        gamesWritten: r.gamesWritten,
        gamesSkippedWorse: r.gamesSkippedWorse,
        gamesFailed: r.gamesFailed,
        warnings: r.warnings,
      })),
      gamesDiscovered: totalDiscovered,
      gamesWritten: totalWritten,
      gamesFailed: totalFailed,
      status: totalFailed === 0 && totalWritten > 0 ? "ok" : totalWritten > 0 ? "partial" : "failed",
    };
    writeManifest(ROOT, season, week, manifest);
  }

  console.log(`[capture-walter-week] season=${season} week=${week} capture=${args.capture} discovered=${totalDiscovered} written=${totalWritten} failed=${totalFailed}${args.dryRun ? " (dry-run, nothing written)" : ""}`);
  for (const r of windowResults) {
    for (const w of r.warnings) console.warn(`[capture-walter-week] ${r.window}: ${w}`);
  }
}

main().catch((err) => {
  console.error(`[capture-walter-week] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
