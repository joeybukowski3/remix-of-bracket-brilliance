import { randomUUID } from "node:crypto";
import { buildBettingLineContentHash } from "./bettingLineContentHash";
import type {
  BettingLineSeriesKey,
  BettingLineSnapshot,
  StoredBettingLineSnapshot,
} from "./bettingLineTypes";

/**
 * WU8 persistence boundary + dedup decision.
 *
 * Dedup semantics (series = league / jkbGameId / provider / sportsbook):
 *   - first observation of a series            -> insert
 *   - line state changed vs the latest row     -> append a new row (A -> B)
 *   - line state unchanged                      -> extend the latest row's
 *                                                 lastObservedAt / providerUpdatedAt
 *   - A -> B -> A returns to an earlier state   -> still appends (the latest row
 *                                                 is B, whose hash differs)
 */

export interface BettingLinePersistenceAdapter {
  findLatestSnapshot(
    key: BettingLineSeriesKey,
  ): Promise<StoredBettingLineSnapshot | null>;
  insertSnapshot(record: StoredBettingLineSnapshot): Promise<void>;
  extendSnapshotObservation(
    id: string,
    observation: { lastObservedAt: string; providerUpdatedAt: string | null },
  ): Promise<void>;
}

export type StoreBettingLineOutcome = "inserted" | "extended" | "unchanged";

export type StoreBettingLineResult = {
  outcome: StoreBettingLineOutcome;
  id: string;
  contentHash: string;
};

function seriesKey(snapshot: BettingLineSnapshot): BettingLineSeriesKey {
  return {
    league: snapshot.league,
    jkbGameId: snapshot.jkbGameId,
    provider: snapshot.provider,
    sportsbook: snapshot.sportsbook,
  };
}

export async function storeBettingLineSnapshot(input: {
  adapter: BettingLinePersistenceAdapter;
  snapshot: BettingLineSnapshot;
  /** Injected for deterministic tests. Defaults to `crypto.randomUUID`. */
  idFactory?: () => string;
}): Promise<StoreBettingLineResult> {
  const { adapter, snapshot } = input;
  const idFactory = input.idFactory ?? randomUUID;
  const contentHash = buildBettingLineContentHash(snapshot);

  const latest = await adapter.findLatestSnapshot(seriesKey(snapshot));

  if (latest !== null && latest.contentHash === contentHash) {
    const providerChanged = latest.providerUpdatedAt !== snapshot.providerUpdatedAt;
    const observationChanged = latest.lastObservedAt !== snapshot.lastObservedAt;
    if (!providerChanged && !observationChanged) {
      return { outcome: "unchanged", id: latest.id, contentHash };
    }
    await adapter.extendSnapshotObservation(latest.id, {
      lastObservedAt: snapshot.lastObservedAt,
      providerUpdatedAt: snapshot.providerUpdatedAt,
    });
    return { outcome: "extended", id: latest.id, contentHash };
  }

  const id = idFactory();
  const record: StoredBettingLineSnapshot = { ...snapshot, id, contentHash };
  await adapter.insertSnapshot(record);
  return { outcome: "inserted", id, contentHash };
}

export type InMemoryBettingLinePersistence = BettingLinePersistenceAdapter & {
  readonly snapshots: readonly StoredBettingLineSnapshot[];
};

/** Deterministic in-memory adapter for tests. Insertion order defines "latest". */
export function createInMemoryBettingLinePersistence(): InMemoryBettingLinePersistence {
  const snapshots: StoredBettingLineSnapshot[] = [];
  return {
    get snapshots() {
      return snapshots;
    },
    async findLatestSnapshot(key) {
      for (let index = snapshots.length - 1; index >= 0; index -= 1) {
        const row = snapshots[index];
        if (
          row.league === key.league &&
          row.jkbGameId === key.jkbGameId &&
          row.provider === key.provider &&
          row.sportsbook === key.sportsbook
        ) {
          return row;
        }
      }
      return null;
    },
    async insertSnapshot(record) {
      snapshots.push({ ...record });
    },
    async extendSnapshotObservation(id, observation) {
      const target = snapshots.find((row) => row.id === id);
      if (!target) throw new Error(`Unknown betting-line snapshot id: ${id}`);
      target.lastObservedAt = observation.lastObservedAt;
      target.providerUpdatedAt = observation.providerUpdatedAt;
    },
  };
}
