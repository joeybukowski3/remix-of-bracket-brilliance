import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  extractScopeNames,
  resolveScopedPlayers,
  validatePublishedExpectedEvent,
  validateScopedRefresh,
} from "./lib/pga-player-history-refresh.mjs";

const args = parseArgs(process.argv.slice(2));
const before = readJson(requiredPath("before"));
const after = readJson(requiredPath("after"));
const scopeNames = extractScopeNames(readJson(requiredPath("scope-file")));
const scopedPlayers = resolveScopedPlayers(before, scopeNames);
const scopePlayerIds = scopedPlayers.map((player) => player.playerId);

validateScopedRefresh(before, after, {
  scopePlayerIds,
  refreshedByPlayerId: new Map(),
  expectedEvent: null,
});

const participantPayload = readJson(requiredPath("participant-file"));
const requiredParticipantIds = [...new Set((participantPayload.playerDetails ?? [])
  .map((player) => String(player?.id ?? ""))
  .filter((playerId) => scopePlayerIds.includes(playerId)))];
if (!requiredParticipantIds.length) throw new Error("Participant file has no canonical player IDs in the scoped pool.");

const participants = validatePublishedExpectedEvent(after, scopePlayerIds, {
  eventId: requiredArg("expected-event-id"),
  eventName: requiredArg("expected-event-name"),
  eventDate: requiredArg("expected-event-date"),
  season: Number(requiredArg("expected-season")),
}, requiredParticipantIds);

console.log(`[pga-history-validate] ${scopePlayerIds.length} scoped players; ${participants.length} expected-event participants; no duplicates or out-of-scope changes.`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const token = values[index];
    if (!token?.startsWith("--") || values[index + 1] == null) throw new Error(`Invalid argument near ${token ?? "end of command"}.`);
    parsed[token.slice(2)] = values[index + 1];
  }
  return parsed;
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
