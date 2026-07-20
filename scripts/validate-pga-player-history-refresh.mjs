import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  extractScopeNames,
  validatePublishedExpectedEvent,
  validateScopedRefresh,
} from "./lib/pga-player-history-refresh.mjs";
import { failureKey, resolveRequestedScope } from "./lib/pga-player-identity-resolution.mjs";

const args = parseArgs(process.argv.slice(2));
const before = readJson(requiredPath("before"));
const after = readJson(requiredPath("after"));
const participantPayload = args["participant-file"] ? readJson(requiredPath("participant-file")) : { playerDetails: [] };
const targetedPlayerIds = collectListArg("player-id");
const targetedPlayerNames = collectListArg("player");
const isTargetedRun = targetedPlayerIds.length > 0 || targetedPlayerNames.length > 0;

if (!isTargetedRun && !args["scope-file"]) throw new Error("--scope-file is required unless --player-id or --player is supplied.");
const scopeNames = isTargetedRun ? null : extractScopeNames(readJson(requiredPath("scope-file")));

const resolvedScope = resolveRequestedScope({
  targetedPlayerIds,
  targetedPlayerNames,
  scopeNames,
  historyPayload: before,
  participantPayload,
});
const resolved = resolvedScope.filter((entry) => entry.status === "resolved");
const identityFailedKeys = new Set(resolvedScope.filter((entry) => entry.status === "failed").map(failureKey));

const lastRefresh = after.lastRefresh;
if (!lastRefresh) throw new Error("Published output is missing the lastRefresh metadata block.");
validateMetadataConsistency(lastRefresh);

const scopeKeys = new Set(resolvedScope.map(failureKey));
const failedKeysInScope = new Set(
  (lastRefresh.failedPlayers ?? []).map(failureKey).filter((key) => scopeKeys.has(key)),
);
if (identityFailedKeys.size && [...identityFailedKeys].some((key) => !failedKeysInScope.has(key))) {
  throw new Error("An identity-resolution failure recomputed from before/scope inputs is missing from lastRefresh.failedPlayers.");
}

const beforeById = new Map(before.players.map((player) => [String(player.playerId ?? ""), player]));
const afterById = new Map(after.players.map((player) => [String(player.playerId ?? ""), player]));

const successIds = resolved
  .map((player) => String(player.playerId))
  .filter((playerId) => !failedKeysInScope.has(playerId));

for (const playerId of successIds) {
  if (!afterById.has(playerId)) throw new Error(`Reported successful player ID ${playerId} is missing from the published output.`);
}

for (const failure of lastRefresh.failedPlayers ?? []) {
  if (!failureKey(failure) || !failedKeysInScope.has(failureKey(failure))) continue;
  if (failure.message && /api[-_]?key/i.test(failure.message)) {
    throw new Error(`Failure message for ${failure.player} appears to leak a provider credential.`);
  }
  const playerId = failure.playerId ? String(failure.playerId) : null;
  if (!playerId) continue;
  const existedBefore = beforeById.get(playerId);
  if (existedBefore) {
    if (JSON.stringify(existedBefore) !== JSON.stringify(afterById.get(playerId))) {
      throw new Error(`Reported failed player ${failure.player} was changed despite the refresh failing.`);
    }
  } else if (afterById.has(playerId)) {
    throw new Error(`Reported failed new player ${failure.player} was written to the output despite the refresh failing.`);
  }
}

validateScopedRefresh(before, after, {
  scopePlayerIds: successIds,
  refreshedByPlayerId: new Map(),
  expectedEvent: null,
});

let participants = [];
if (args["expected-event-id"]) {
  const requiredParticipantIds = [...new Set((participantPayload.playerDetails ?? [])
    .map((player) => String(player?.id ?? ""))
    .filter((playerId) => resolved.some((entry) => String(entry.playerId) === playerId)))];
  if (!requiredParticipantIds.length) throw new Error("Participant file has no canonical player IDs in the scoped pool.");

  participants = validatePublishedExpectedEvent(after, successIds, {
    eventId: requiredArg("expected-event-id"),
    eventName: requiredArg("expected-event-name"),
    eventDate: requiredArg("expected-event-date"),
    season: Number(requiredArg("expected-season")),
  }, requiredParticipantIds);
}

console.log(`[pga-history-validate] ${successIds.length} successful of ${resolvedScope.length} scoped players; ${participants.length} expected-event participants; lastRefresh status ${lastRefresh.status}.`);

function validateMetadataConsistency(metadata) {
  const failureCount = (metadata.failedPlayers ?? []).length;
  if (metadata.failureCount !== failureCount) throw new Error("lastRefresh.failureCount does not match failedPlayers.length.");
  if (metadata.successCount + metadata.failureCount !== metadata.scopeCount) throw new Error("lastRefresh successCount + failureCount does not equal scopeCount.");
  const expectedStatus = failureCount === 0 ? "complete" : metadata.successCount === 0 ? "failed" : "partial";
  if (metadata.status !== expectedStatus) throw new Error(`lastRefresh.status "${metadata.status}" does not match counts (expected "${expectedStatus}").`);
  const ids = (metadata.failedPlayers ?? []).map((failure) => failureKey(failure));
  if (new Set(ids).size !== ids.length) throw new Error("lastRefresh.failedPlayers contains duplicate players.");
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const token = values[index];
    if (!token?.startsWith("--") || values[index + 1] == null) throw new Error(`Invalid argument near ${token ?? "end of command"}.`);
    parsed[token.slice(2)] = values[index + 1];
  }
  return parsed;
}

function collectListArg(name) {
  const raw = args[name];
  if (raw == null) return [];
  return [...new Set(String(raw).split(",").map((value) => value.trim()).filter(Boolean))];
}

function requiredArg(name) {
  if (!args[name]) throw new Error(`--${name} is required.`);
  return args[name];
}

function requiredPath(name) {
  return path.resolve(process.cwd(), requiredArg(name));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}
