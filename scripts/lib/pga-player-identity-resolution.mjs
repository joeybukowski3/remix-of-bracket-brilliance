import {
  buildPgaPlayerLookup,
  normalizePgaPlayerName,
  resolvePgaPlayerMatch,
} from "../../src/lib/pga/playerIdentity.ts";

// Resolution order (see docs/pga-player-history-refresh.md):
//   1-3. exact / canonical / alias match against existing player-history.json records
//   4-6. exact / canonical / alias match against current-field.json.playerDetails
//   7.   unresolved
//
// A player already present in history is always preferred when the official
// field agrees. If the official field names the SAME scoped player but with a
// different canonical ID than the one already stored, that is treated as an
// explicit identity conflict rather than silently trusting either source.

export function buildHistoryLookup(historyPayload) {
  return buildPgaPlayerLookup(historyPayload?.players ?? []);
}

export function buildHistoryIndex(historyPayload) {
  return new Map((historyPayload?.players ?? []).map((player) => [String(player.playerId ?? ""), player]));
}

export function buildParticipantLookup(participantPayload) {
  const records = (participantPayload?.playerDetails ?? [])
    .map((detail) => ({ player: String(detail?.name ?? "").trim(), playerId: String(detail?.id ?? "").trim() }))
    .filter((record) => record.player && record.playerId);
  return buildPgaPlayerLookup(records);
}

export function buildParticipantIndex(participantPayload) {
  const index = new Map();
  for (const detail of participantPayload?.playerDetails ?? []) {
    const playerId = String(detail?.id ?? "").trim();
    const name = String(detail?.name ?? "").trim();
    if (playerId && name) index.set(playerId, name);
  }
  return index;
}

export function resolveUnifiedIdentity(scopeName, context) {
  const { historyLookup, historyIndex, participantLookup } = context;
  const historyMatch = resolvePgaPlayerMatch(scopeName, historyLookup);
  const participantMatch = resolvePgaPlayerMatch(scopeName, participantLookup);
  const historyId = historyMatch.matchedPlayer ? String(historyMatch.matchedPlayer.playerId ?? "").trim() : null;
  const participantId = participantMatch.matchedPlayer ? String(participantMatch.matchedPlayer.playerId ?? "").trim() : null;

  if (historyMatch.matchedPlayer) {
    if (!historyId) {
      return failed(scopeName, null, `history-${historyMatch.method}`, "MISSING_CANONICAL_ID", `${scopeName} matched an existing history record with no canonical player ID.`);
    }
    if (participantId && participantId !== historyId) {
      return failed(scopeName, historyId, `history-${historyMatch.method}`, "IDENTITY_CONFLICT", `${scopeName} resolves to conflicting IDs: history ${historyId} vs official field ${participantId}.`);
    }
    return resolved(scopeName, historyMatch.matchedPlayer.player, historyId, `history-${historyMatch.method}`, "history", false);
  }

  if (participantMatch.matchedPlayer) {
    if (!participantId) {
      return failed(scopeName, null, `participant-${participantMatch.method}`, "MISSING_CANONICAL_ID", `${scopeName} matched an official-field record with no canonical player ID.`);
    }
    const existingById = historyIndex.get(participantId);
    if (existingById) {
      return resolved(scopeName, existingById.player, participantId, `participant-${participantMatch.method}-id-match`, "history", false);
    }
    return resolved(scopeName, participantMatch.matchedPlayer.player, participantId, `participant-${participantMatch.method}`, "participant-field", true);
  }

  return failed(scopeName, null, null, "IDENTITY_UNRESOLVED", `Unable to resolve a canonical PGA Tour player ID for ${scopeName}.`);
}

export function resolveById(playerId, historyIndex, participantIndex) {
  const id = String(playerId ?? "").trim();
  const existing = historyIndex.get(id);
  if (existing) return resolved(id, existing.player, id, "id-history", "history", false);
  const participantName = participantIndex.get(id);
  if (participantName) return resolved(id, participantName, id, "id-participant", "participant-field", true);
  return failed(id, id, null, "IDENTITY_UNRESOLVED", `Player ID ${id} was not found in history or the official field.`);
}

export function dedupeResolved(results) {
  const claimedBy = new Map();
  return results.map((result) => {
    if (result.status !== "resolved") return result;
    const owner = claimedBy.get(result.playerId);
    if (owner) {
      return failed(result.scopeName, result.playerId, result.resolutionMethod, "DUPLICATE_RESOLVED_ID", `${result.scopeName} resolves to player ID ${result.playerId}, already claimed by ${owner} in this run.`);
    }
    claimedBy.set(result.playerId, result.scopeName);
    return result;
  });
}

export function resolveScopeUnified(scopeNames, historyPayload, participantPayload) {
  const context = {
    historyLookup: buildHistoryLookup(historyPayload),
    historyIndex: buildHistoryIndex(historyPayload),
    participantLookup: buildParticipantLookup(participantPayload),
  };
  return dedupeResolved(scopeNames.map((name) => resolveUnifiedIdentity(name, context)));
}

// Shared entry point used by both the refresh script and the offline
// validator so a targeted rerun (--player-id / --player) and a scope-file
// run resolve identities identically and reproducibly.
export function resolveRequestedScope({ targetedPlayerIds = [], targetedPlayerNames = [], scopeNames = null, historyPayload, participantPayload }) {
  if (targetedPlayerIds.length || targetedPlayerNames.length) {
    const historyIndex = buildHistoryIndex(historyPayload);
    const participantIndex = buildParticipantIndex(participantPayload);
    const context = {
      historyLookup: buildHistoryLookup(historyPayload),
      historyIndex,
      participantLookup: buildParticipantLookup(participantPayload),
    };
    const idResolutions = targetedPlayerIds.map((id) => resolveById(id, historyIndex, participantIndex));
    const nameResolutions = targetedPlayerNames.map((name) => resolveUnifiedIdentity(name, context));
    return dedupeResolved([...idResolutions, ...nameResolutions]);
  }

  if (!scopeNames) throw new Error("Either scopeNames or targeted player IDs/names must be supplied.");
  return resolveScopeUnified(scopeNames, historyPayload, participantPayload);
}

export function failureKey(failure) {
  return failure.playerId ? String(failure.playerId) : `name:${normalizePgaPlayerName(String(failure.player ?? failure.scopeName ?? ""))}`;
}

function resolved(scopeName, player, playerId, resolutionMethod, source, isNewPlayer) {
  return { status: "resolved", scopeName, player, playerId, resolutionMethod, source, isNewPlayer };
}

function failed(scopeName, playerId, resolutionMethod, errorCode, message) {
  return { status: "failed", scopeName, player: scopeName, playerId, resolutionMethod, stage: "identity-resolution", errorCode, message };
}
