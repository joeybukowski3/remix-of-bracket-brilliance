import { failureKey } from "./pga-player-identity-resolution.mjs";

// lastRefresh.trackedKeys is an internal (but schema-compatible/additive) field
// that lets a targeted one-player rerun tell the difference between "this
// player's own scope is complete" and "the wider field this player belongs to
// is complete." Without it, refreshing a single player would recompute
// scopeCount/successCount from that player's tiny scope alone and could
// falsely report status: "complete" for the whole tracked field. Carrying the
// tracked-key set forward keeps scopeCount/successCount honest across runs of
// different sizes, and failedPlayers outside the current run's scope survive
// unless that run explicitly clears them.
//
// current.clearingKeys (see computeClearingKeys) carries extra identity keys
// — typically a stale name-only key from before a player had a canonical ID
// — that this run's successes have proven refer to the same player as a key
// already in current.scopeKeys. Those extra keys both clear the matching
// carried failure AND get retired from trackedKeys, so one logical player
// never inflates scopeCount by being tracked under two keys at once.
export function mergeRefreshMetadata(previous, current) {
  const previousTrackedKeys = new Set(previous?.trackedKeys ?? []);
  const previousFailedByKey = new Map((previous?.failedPlayers ?? []).map((failure) => [failureKey(failure), failure]));
  const scopeKeySet = new Set(current.scopeKeys);
  const clearingKeySet = new Set([...current.scopeKeys, ...(current.clearingKeys ?? [])]);

  const trackedKeys = new Set([...previousTrackedKeys, ...current.scopeKeys]);
  for (const key of clearingKeySet) {
    if (!scopeKeySet.has(key)) trackedKeys.delete(key);
  }

  const carriedFailures = [...previousFailedByKey.entries()]
    .filter(([key]) => !clearingKeySet.has(key))
    .map(([, failure]) => failure);
  const failedPlayers = [...carriedFailures, ...current.failedPlayers]
    .slice()
    .sort((left, right) => String(left.player ?? "").localeCompare(String(right.player ?? "")));

  const failureCount = failedPlayers.length;
  const scopeCount = trackedKeys.size;
  const successCount = scopeCount - failureCount;
  const status = failureCount === 0 ? "complete" : successCount === 0 ? "failed" : "partial";

  return {
    attemptedAt: current.attemptedAt,
    asOfDate: current.asOfDate,
    scopeCount,
    successCount,
    failureCount,
    cacheHitCount: current.cacheHitCount,
    requestCount: current.requestCount,
    status,
    failedPlayers,
    trackedKeys: [...trackedKeys].sort(),
  };
}

// Skips a rewrite (and therefore a commit) when the meaningful parts of the
// metadata are unchanged from the previous run, ignoring attemptedAt which
// always differs. Mirrors the existing "no-op when nothing changed" behavior
// the history-content merge already has.
export function resolveMetadataForWrite(previous, candidate) {
  if (!previous) return candidate;
  const unchanged = previous.asOfDate === candidate.asOfDate
    && previous.scopeCount === candidate.scopeCount
    && previous.successCount === candidate.successCount
    && previous.failureCount === candidate.failureCount
    && previous.status === candidate.status
    && JSON.stringify(previous.failedPlayers) === JSON.stringify(candidate.failedPlayers)
    && JSON.stringify(previous.trackedKeys ?? []) === JSON.stringify(candidate.trackedKeys ?? []);
  return unchanged ? previous : candidate;
}

const PUBLIC_ERROR_MESSAGES = {
  IDENTITY_UNRESOLVED: "Unable to resolve a canonical PGA Tour player ID.",
  IDENTITY_CONFLICT: "Player identity conflicts between stored history and the official field.",
  MISSING_CANONICAL_ID: "Matched player record is missing a canonical PGA Tour player ID.",
  DUPLICATE_RESOLVED_ID: "Player resolves to a PGA Tour player ID already claimed by another scoped player in this run.",
  PGA_HISTORY_FETCH_FAILED: "Recent player history could not be refreshed.",
  PGA_MALFORMED_RESPONSE: "PGA Tour returned an unexpected response shape.",
  PGA_MERGE_VALIDATION_FAILED: "Refreshed history failed validation and was not applied.",
};

export function publicFailureMessage(errorCode) {
  return PUBLIC_ERROR_MESSAGES[errorCode] ?? "Recent player history could not be refreshed.";
}

export function toPublicFailure(failure) {
  return {
    player: failure.player ?? failure.scopeName,
    playerId: failure.playerId ?? null,
    stage: failure.stage,
    errorCode: failure.errorCode,
    message: publicFailureMessage(failure.errorCode),
  };
}
