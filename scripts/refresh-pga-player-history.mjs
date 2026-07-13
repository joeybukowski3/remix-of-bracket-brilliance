import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  extractScopeNames,
  mergeScopedHistory,
  normalizePlayerTournamentResults,
  resolveScopedPlayers,
  validateScopedRefresh,
} from "./lib/pga-player-history-refresh.mjs";

const GRAPHQL_URL = "https://orchestrator.pgatour.com/graphql";
const TOUR_CODE = "R";
const DEFAULT_API_KEY = "da2-gsrx5bibzbb4njvhI7t37wqyl4";
const API_KEY = process.env.PGA_API_KEY || process.env.PGA_TOUR_GQL_API_KEY || DEFAULT_API_KEY;
const PLAYER_HISTORY_QUERY = `
query PlayerTournamentHistory($playerId: ID!, $tourCode: TourCode) {
  playerProfileTournamentResults(playerId: $playerId, tourCode: $tourCode) {
    tournaments {
      tournamentNum
      tournaments {
        tournamentId
        tournamentName
        courseName
        date
        year
        position
        roundScores { roundNum roundScore }
        total
        toPar
      }
    }
  }
}`;

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const inputPath = path.resolve(root, args.input ?? "public/data/pga/player-history.json");
const scopePath = path.resolve(root, args["scope-file"] ?? "public/data/pga/next-tournament.json");
const outputPath = args.output ? path.resolve(root, args.output) : null;
const cacheDir = args["cache-dir"] ? path.resolve(root, args["cache-dir"]) : null;
const startYear = numberArg("start-year", 2016);
const delayMs = numberArg("request-delay-ms", 125);
const retries = numberArg("retries", 3);
const asOfDate = args["as-of-date"] ?? new Date().toISOString().slice(0, 10);

async function main() {
  if (!args["dry-run"] && !outputPath) throw new Error("--output is required unless --dry-run is used.");
  const before = readJson(inputPath);
  const scopeNames = extractScopeNames(readJson(scopePath));
  const scopedPlayers = resolveScopedPlayers(before, scopeNames);
  const refreshedByPlayerId = new Map();
  let requestCount = 0;
  let cacheHits = 0;

  console.log(`[pga-history-scoped] ${scopedPlayers.length} players from ${scopePath}`);
  for (let index = 0; index < scopedPlayers.length; index += 1) {
    const player = scopedPlayers[index];
    const cached = readCache(player.playerId);
    let data;
    if (cached) {
      data = cached;
      cacheHits += 1;
    } else {
      data = await postGraphqlWithRetry(player.playerId, retries);
      requestCount += 1;
      writeCache(player.playerId, data);
      if (delayMs > 0 && index < scopedPlayers.length - 1) await wait(delayMs);
    }
    refreshedByPlayerId.set(player.playerId, normalizePlayerTournamentResults(data, startYear));
    console.log(`[pga-history-scoped] ${index + 1}/${scopedPlayers.length} ${player.player}: ${refreshedByPlayerId.get(player.playerId).length} starts`);
  }

  const scopePlayerIds = scopedPlayers.map((player) => player.playerId);
  const expectedEvent = buildExpectedEvent(asOfDate, scopePlayerIds);
  const allowedEventIdentities = expectedEvent
    ? [`${expectedEvent.season}:${expectedEvent.eventId}`]
    : null;
  const merged = mergeScopedHistory(before, refreshedByPlayerId, {
    scopePlayerIds,
    asOfDate,
    allowedEventIdentities,
  });
  validateScopedRefresh(before, merged.payload, { scopePlayerIds, refreshedByPlayerId, expectedEvent });

  const summary = {
    tourCode: TOUR_CODE,
    operation: "PlayerTournamentHistory",
    field: "playerProfileTournamentResults",
    scopePlayers: scopedPlayers.length,
    requestCount,
    cacheHits,
    changedPlayers: merged.changedPlayers.length,
    addedResults: merged.addedResults.length,
    expectedEvent,
  };
  console.log(`[pga-history-scoped] ${JSON.stringify(summary)}`);

  if (args["dry-run"]) return;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(merged.payload, null, 2)}\n`);
  console.log(`[pga-history-scoped] Wrote validated output to ${outputPath}`);
}

async function postGraphqlWithRetry(playerId, maxAttempts) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "x-pgat-platform": "web",
          Referer: "https://www.pgatour.com/",
          Origin: "https://www.pgatour.com",
        },
        body: JSON.stringify({ query: PLAYER_HISTORY_QUERY, variables: { playerId, tourCode: TOUR_CODE } }),
      });
      if (!response.ok) throw new Error(`PGA Tour GraphQL HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
      return payload.data ?? {};
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await wait(500 * attempt);
    }
  }
  throw new Error(`PGA Tour profile ${playerId} failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function buildExpectedEvent(expectedAsOfDate, scopePlayerIds) {
  const eventId = args["expected-event-id"];
  if (!eventId) return null;
  return {
    eventId,
    eventName: requiredArg("expected-event-name"),
    eventDate: requiredArg("expected-event-date"),
    season: Number(requiredArg("expected-season")),
    asOfDate: expectedAsOfDate,
    maxAgeDays: numberArg("max-event-age-days", 14),
    requiredParticipantIds: readRequiredParticipantIds(scopePlayerIds),
  };
}

function readRequiredParticipantIds(scopePlayerIds) {
  if (!args["participant-file"]) return [];
  const payload = readJson(path.resolve(root, args["participant-file"]));
  const scopeIds = new Set(scopePlayerIds.map(String));
  const ids = (payload.playerDetails ?? [])
    .map((player) => String(player?.id ?? ""))
    .filter((playerId) => scopeIds.has(playerId));
  if (!ids.length) throw new Error("Participant file has no canonical player IDs in the scoped pool.");
  return [...new Set(ids)];
}

function readCache(playerId) {
  if (!cacheDir) return null;
  const cachePath = path.join(cacheDir, `${playerId}.json`);
  return existsSync(cachePath) ? readJson(cachePath) : null;
}

function writeCache(playerId, data) {
  if (!cacheDir) return;
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path.join(cacheDir, `${playerId}.json`), `${JSON.stringify(data)}\n`);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "dry-run") parsed[key] = true;
    else parsed[key] = values[++index];
  }
  return parsed;
}

function requiredArg(name) {
  if (!args[name]) throw new Error(`--${name} is required when --expected-event-id is supplied.`);
  return args[name];
}

function numberArg(name, fallback) {
  const value = args[name] == null ? fallback : Number(args[name]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number.`);
  return value;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  console.error(`[pga-history-scoped] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
