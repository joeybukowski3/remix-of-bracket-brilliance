import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  extractScopeNames,
  mergePartialScopedHistory,
  refreshScopedPlayer,
  validateScopedRefresh,
} from "./lib/pga-player-history-refresh.mjs";
import { failureKey, resolveRequestedScope } from "./lib/pga-player-identity-resolution.mjs";
import { mergeRefreshMetadata, resolveMetadataForWrite, toPublicFailure } from "./lib/pga-player-history-metadata.mjs";

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
const scopePath = args["scope-file"] ? path.resolve(root, args["scope-file"]) : null;
const participantPath = args["participant-file"] ? path.resolve(root, args["participant-file"]) : null;
const outputPath = args.output ? path.resolve(root, args.output) : null;
const cacheDir = args["cache-dir"] ? path.resolve(root, args["cache-dir"]) : null;
const startYear = numberArg("start-year", 2016);
const delayMs = numberArg("request-delay-ms", 125);
const retries = numberArg("retries", 3);
const asOfDate = args["as-of-date"] ?? new Date().toISOString().slice(0, 10);
const targetedPlayerIds = collectListArg("player-id");
const targetedPlayerNames = collectListArg("player");
const isTargetedRun = targetedPlayerIds.length > 0 || targetedPlayerNames.length > 0;

async function main() {
  if (!args["dry-run"] && !outputPath) throw new Error("--output is required unless --dry-run is used.");
  const before = readJson(inputPath);
  const participantPayload = participantPath ? readJson(participantPath) : { playerDetails: [] };

  const resolvedList = [];
  const identityFailures = [];
  for (const entry of resolveScope(before, participantPayload)) {
    (entry.status === "resolved" ? resolvedList : identityFailures).push(entry);
  }

  console.log(`[pga-history-scoped] ${resolvedList.length} resolved, ${identityFailures.length} unresolved from ${isTargetedRun ? "targeted rerun arguments" : scopePath}`);
  for (const failure of identityFailures) {
    console.error(`[pga-history-scoped] ${failure.player} failed at identity-resolution: ${failure.message}`);
    console.log(`::warning title=PGA player history not refreshed::${failure.player} — unable to resolve or fetch current history`);
  }

  const successResults = [];
  const fetchFailures = [];
  let requestCount = 0;
  let cacheHits = 0;

  async function fetchProfile(playerId) {
    const cached = readCache(playerId);
    if (cached) {
      cacheHits += 1;
      return { data: cached, requestSource: "cache" };
    }
    const data = await postGraphqlWithRetry(playerId, retries);
    requestCount += 1;
    writeCache(playerId, data);
    if (delayMs > 0) await wait(delayMs);
    return { data, requestSource: "api" };
  }

  for (let index = 0; index < resolvedList.length; index += 1) {
    const player = resolvedList[index];
    const result = await refreshScopedPlayer(player, { fetchProfile, startYear });
    if (result.status === "success") {
      successResults.push(result);
      console.log(`[pga-history-scoped] ${index + 1}/${resolvedList.length} ${result.player}: ${result.results.length} starts (${result.requestSource})`);
    } else {
      fetchFailures.push(result);
      console.error(`[pga-history-scoped] ${result.player} (${result.playerId}) failed at ${result.stage}: ${result.message}`);
      console.log(`::warning title=PGA player history not refreshed::${result.player} — unable to resolve or fetch current history`);
    }
  }

  if (successResults.length === 0) {
    throw new Error(`PGA Tour history refresh failed for every scoped player (${resolvedList.length} resolved, ${identityFailures.length + fetchFailures.length} failed); aborting without writing output.`);
  }

  const requiredParticipantIds = computeRequiredParticipantIds(participantPayload, resolvedList);
  const expectedEvent = buildExpectedEvent(asOfDate, requiredParticipantIds);
  const allowedEventIdentities = expectedEvent
    ? [`${expectedEvent.season}:${expectedEvent.eventId}`]
    : null;

  const merged = mergePartialScopedHistory(before, successResults, { asOfDate, allowedEventIdentities });
  const refreshedByPlayerId = new Map(successResults.map((result) => [String(result.playerId), result.results]));
  validateScopedRefresh(before, merged.payload, { scopePlayerIds: merged.successPlayerIds, refreshedByPlayerId, expectedEvent });

  const failedThisRun = [...identityFailures, ...fetchFailures];
  const scopeKeysThisRun = [...merged.successPlayerIds, ...failedThisRun.map((failure) => failureKey(failure))];
  const candidateMetadata = mergeRefreshMetadata(before.lastRefresh ?? null, {
    attemptedAt: new Date().toISOString(),
    asOfDate,
    scopeKeys: scopeKeysThisRun,
    failedPlayers: failedThisRun.map(toPublicFailure),
    cacheHitCount: cacheHits,
    requestCount,
  });
  const metadata = resolveMetadataForWrite(before.lastRefresh ?? null, candidateMetadata);
  const finalPayload = merged.changed || metadata !== (before.lastRefresh ?? null)
    ? { ...merged.payload, lastRefresh: metadata }
    : before;

  const summary = {
    tourCode: TOUR_CODE,
    operation: "PlayerTournamentHistory",
    field: "playerProfileTournamentResults",
    scopePlayers: resolvedList.length,
    requestCount,
    cacheHits,
    successCount: successResults.length,
    failureCount: failedThisRun.length,
    changedPlayers: merged.changedPlayers.length,
    addedResults: merged.addedResults.length,
    expectedEvent,
    metadataStatus: metadata.status,
  };
  console.log(`[pga-history-scoped] ${JSON.stringify(summary)}`);

  if (args["dry-run"]) return;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(finalPayload, null, 2)}\n`);
  console.log(`[pga-history-scoped] Wrote validated output to ${outputPath}`);
}

function resolveScope(before, participantPayload) {
  if (!isTargetedRun && !scopePath) throw new Error("--scope-file is required unless --player-id or --player is supplied.");
  const scopeNames = isTargetedRun ? null : extractScopeNames(readJson(scopePath));
  return resolveRequestedScope({
    targetedPlayerIds,
    targetedPlayerNames,
    scopeNames,
    historyPayload: before,
    participantPayload,
  });
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

function buildExpectedEvent(expectedAsOfDate, requiredParticipantIds) {
  const eventId = args["expected-event-id"];
  if (!eventId) return null;
  if (!requiredParticipantIds.length) throw new Error("Participant file has no canonical player IDs in the scoped pool.");
  return {
    eventId,
    eventName: requiredArg("expected-event-name"),
    eventDate: requiredArg("expected-event-date"),
    season: Number(requiredArg("expected-season")),
    asOfDate: expectedAsOfDate,
    maxAgeDays: numberArg("max-event-age-days", 14),
    requiredParticipantIds,
  };
}

function computeRequiredParticipantIds(participantPayload, resolvedList) {
  const resolvedIds = new Set(resolvedList.map((player) => String(player.playerId)));
  const ids = (participantPayload.playerDetails ?? [])
    .map((player) => String(player?.id ?? "").trim())
    .filter((playerId) => resolvedIds.has(playerId));
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
    if (key === "dry-run") {
      parsed[key] = true;
      continue;
    }
    const value = values[++index];
    if (parsed[key] === undefined) parsed[key] = value;
    else if (Array.isArray(parsed[key])) parsed[key].push(value);
    else parsed[key] = [parsed[key], value];
  }
  return parsed;
}

function collectListArg(name) {
  const raw = args[name];
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return [...new Set(values.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean))];
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
