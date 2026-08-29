import { randomUUID } from "node:crypto";
import { buildBettingSplitContentHash } from "./bettingSplitsContentHash";
import { safeParseBettingSplitSnapshot } from "./bettingSplitsSchema";
import type { BettingSplitSnapshot } from "./bettingSplitsTypes";
import type { BettingProviderGameCrosswalk } from "./gameJoinTypes";
import type {
  BettingProviderGameCrosswalkRecord,
  BettingSplitPersistenceAdapter,
  StoredBettingSplitSnapshot,
} from "./bettingSplitsPersistence";

/**
 * WU4 store: an idempotent persistence boundary for schema-valid
 * {@link BettingSplitSnapshot} records and verified provider→JKB crosswalks.
 *
 * Pure orchestration — all IO goes through {@link BettingSplitPersistenceAdapter}.
 */

export type StoreBettingSplitSnapshotResult = {
  action: "inserted" | "extended";
  snapshotId: string;
  contentHash: string;
};

export class BettingSplitValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid BettingSplitSnapshot: ${issues.join("; ")}`);
    this.name = "BettingSplitValidationError";
    this.issues = issues;
  }
}

/**
 * Persist one observation of a betting split market.
 *
 * - The snapshot is re-validated against the WU1 schema; invalid input throws
 *   {@link BettingSplitValidationError} before any write.
 * - `contentHash` is always recomputed from canonical market state. A caller-supplied
 *   hash is never trusted.
 * - If the latest stored observation for `(league, jkbGameId, provider, sportsbook)`
 *   has the same content hash, its `lastObservedAt` is extended. Otherwise a new
 *   historical row is inserted. This yields change-based time series, not one row
 *   per poll.
 */
export async function storeBettingSplitSnapshot(
  adapter: BettingSplitPersistenceAdapter,
  input: BettingSplitSnapshot,
): Promise<StoreBettingSplitSnapshotResult> {
  const validation = safeParseBettingSplitSnapshot(input);
  if (!validation.success) {
    throw new BettingSplitValidationError(
      validation.error.issues.map(
        (issue) => `${issue.path.join(".") || "snapshot"}: ${issue.message}`,
      ),
    );
  }
  const snapshot = validation.data;
  const contentHash = buildBettingSplitContentHash(snapshot);
  const observedAt = snapshot.capturedAt;

  const latest = await adapter.findLatestSnapshot({
    league: snapshot.league,
    jkbGameId: snapshot.jkbGameId,
    provider: snapshot.provider,
    sportsbook: snapshot.sportsbook,
  });

  if (latest && latest.contentHash === contentHash) {
    const lastObservedAt =
      Date.parse(observedAt) > Date.parse(latest.lastObservedAt)
        ? observedAt
        : latest.lastObservedAt;
    await adapter.extendSnapshotObservation(latest.id, {
      lastObservedAt,
      providerLastSeenAt: snapshot.providerLastSeenAt ?? latest.providerLastSeenAt,
    });
    return { action: "extended", snapshotId: latest.id, contentHash };
  }

  const record: StoredBettingSplitSnapshot = {
    ...snapshot,
    id: randomUUID(),
    contentHash,
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
  };
  await adapter.insertSnapshot(record);
  return { action: "inserted", snapshotId: record.id, contentHash };
}

export type VerifiedBettingProviderGameCrosswalk = BettingProviderGameCrosswalk & {
  providerHomeTeamId?: string | null;
  providerAwayTeamId?: string | null;
  canonicalHomeTeamId?: string | null;
  canonicalAwayTeamId?: string | null;
  /** Defaults to now (UTC ISO) when omitted. */
  verifiedAt?: string;
};

export type UpsertBettingProviderGameCrosswalkResult = {
  action: "inserted" | "verified" | "conflict";
  crosswalkId: string | null;
  existingJkbGameId?: string;
};

/**
 * Persist a verified provider-event → canonical-JKB-game mapping.
 *
 * - No existing mapping → insert.
 * - Existing mapping to the *same* JKB game → refresh verification metadata (idempotent).
 * - Existing mapping to a *different* JKB game → fail closed: return `"conflict"`
 *   and write nothing. Automatic remapping is intentionally not implemented.
 */
export async function upsertBettingProviderGameCrosswalk(
  adapter: BettingSplitPersistenceAdapter,
  input: VerifiedBettingProviderGameCrosswalk,
): Promise<UpsertBettingProviderGameCrosswalkResult> {
  const key = {
    league: input.league,
    provider: input.provider,
    providerGameId: input.providerGameId,
  };
  const verifiedAt = input.verifiedAt ?? new Date().toISOString();
  const providerHomeTeamId = input.providerHomeTeamId ?? null;
  const providerAwayTeamId = input.providerAwayTeamId ?? null;
  const canonicalHomeTeamId = input.canonicalHomeTeamId ?? null;
  const canonicalAwayTeamId = input.canonicalAwayTeamId ?? null;

  const existing = await adapter.findCrosswalk(key);

  if (!existing) {
    const record: BettingProviderGameCrosswalkRecord = {
      ...key,
      id: randomUUID(),
      jkbGameId: input.jkbGameId,
      providerHomeTeamId,
      providerAwayTeamId,
      canonicalHomeTeamId,
      canonicalAwayTeamId,
      firstVerifiedAt: verifiedAt,
      lastVerifiedAt: verifiedAt,
    };
    await adapter.insertCrosswalk(record);
    return { action: "inserted", crosswalkId: record.id };
  }

  if (existing.jkbGameId !== input.jkbGameId) {
    return {
      action: "conflict",
      crosswalkId: existing.id,
      existingJkbGameId: existing.jkbGameId,
    };
  }

  await adapter.updateCrosswalkVerification(existing.id, {
    lastVerifiedAt: verifiedAt,
    providerHomeTeamId: providerHomeTeamId ?? existing.providerHomeTeamId,
    providerAwayTeamId: providerAwayTeamId ?? existing.providerAwayTeamId,
    canonicalHomeTeamId: canonicalHomeTeamId ?? existing.canonicalHomeTeamId,
    canonicalAwayTeamId: canonicalAwayTeamId ?? existing.canonicalAwayTeamId,
  });
  return { action: "verified", crosswalkId: existing.id };
}
