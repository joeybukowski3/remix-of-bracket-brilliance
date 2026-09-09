#!/usr/bin/env node
/**
 * Projects the private data/walter/{season}/week-{NN} captures into a single
 * public/data/walter/{season}/week-{NN}.json artifact for the /walter page
 * to fetch, plus updates public/data/walter/{season}/index.json with the
 * list of weeks that have any capture data. Pure projection -- never
 * re-fetches or re-parses WalterFootball; run capture-walter-week.mjs first.
 *
 * Usage:
 *   node scripts/publish-walter-week.mjs --week=1 --season=2026
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diffCapture, previousCaptureType } from "./lib/walter/diffCapture.mjs";
import { gameDir, readJsonIfExists, readManifest, weekDir } from "./lib/walter/storage.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURE_TYPES = ["wednesday", "thursday", "saturday", "sunday"];

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--week=")) args.week = Number(raw.slice("--week=".length));
    else if (raw.startsWith("--season=")) args.season = Number(raw.slice("--season=".length));
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!args.week || !args.season) throw new Error("--week and --season are required");
  return args;
}

function listGameIds(root, season, week) {
  const gamesRoot = resolve(weekDir(root, season, week), "games");
  if (!existsSync(gamesRoot)) return [];
  return readdirSync(gamesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name); // "AWAY-HOME"
}

function loadGameCaptures(root, season, week, gameDirName) {
  const captures = {};
  for (const captureType of CAPTURE_TYPES) {
    const [away, home] = gameDirName.split("-");
    const gameId = `${season}_${String(week).padStart(2, "0")}_${away}_${home}`;
    const filePath = `${gameDir(root, season, week, gameId)}/${captureType}.json`;
    captures[captureType] = readJsonIfExists(filePath);
  }
  return captures;
}

function buildDeltas(captures) {
  const deltas = {};
  for (const captureType of CAPTURE_TYPES) {
    const prevType = previousCaptureType(captureType);
    if (!prevType || !captures[captureType] || !captures[prevType]) {
      deltas[captureType] = null;
      continue;
    }
    deltas[captureType] = diffCapture(captures[prevType], captures[captureType]);
  }
  return deltas;
}

function writeJsonFile(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function main() {
  const { season, week } = parseArgs(process.argv);

  const manifest = readManifest(ROOT, season, week);
  const gameDirNames = listGameIds(ROOT, season, week);

  const games = gameDirNames
    .map((dirName) => {
      const captures = loadGameCaptures(ROOT, season, week, dirName);
      const anyCapture = CAPTURE_TYPES.map((t) => captures[t]).find(Boolean);
      if (!anyCapture) return null;
      return {
        gameId: anyCapture.game.gameId,
        away: anyCapture.game.away,
        home: anyCapture.game.home,
        kickoffEt: anyCapture.game.kickoffEt,
        window: anyCapture.game.window,
        captures,
        deltas: buildDeltas(captures),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.gameId.localeCompare(b.gameId));

  const ingestion = {};
  for (const captureType of CAPTURE_TYPES) {
    const entry = manifest.captures?.[captureType];
    ingestion[captureType] = entry
      ? {
          status: entry.status,
          capturedAt: entry.capturedAt,
          gamesDiscovered: entry.gamesDiscovered,
          gamesWritten: entry.gamesWritten,
          gamesFailed: entry.gamesFailed,
        }
      : { status: "pending", capturedAt: null, gamesDiscovered: 0, gamesWritten: 0, gamesFailed: 0 };
  }

  const publicArtifact = {
    schemaVersion: "walter-public-v0.1",
    season,
    week,
    publishedAt: new Date().toISOString(),
    ingestion,
    games,
  };

  const weekFilePath = resolve(ROOT, "public", "data", "walter", String(season), `week-${String(week).padStart(2, "0")}.json`);
  writeJsonFile(weekFilePath, publicArtifact);

  const indexFilePath = resolve(ROOT, "public", "data", "walter", String(season), "index.json");
  const existingIndex = readJsonIfExists(indexFilePath) ?? { schemaVersion: "walter-index-v0.1", season, weeks: [] };
  const weeks = Array.from(new Set([...existingIndex.weeks, week])).sort((a, b) => a - b);
  writeJsonFile(indexFilePath, { schemaVersion: "walter-index-v0.1", season, weeks });

  console.log(`[publish-walter-week] season=${season} week=${week} games=${games.length} -> ${weekFilePath}`);
}

main();
