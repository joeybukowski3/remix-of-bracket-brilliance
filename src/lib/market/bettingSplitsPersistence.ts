import type { BettingLeague, BettingSplitSnapshot } from "./bettingSplitsTypes";

/**
 * WU4 persistence boundary.
 *
 * The store logic ({@link ./bettingSplitsStore}) is pure and talks only to this
 * narrow adapter. The production adapter is a thin Supabase service-role wrapper
 * (added in WU5 alongside the collector); tests use
 * {@link createInMemoryBettingSplitPersistence}.
 */

/** Identity that partitions one market observation series from another. */
export type BettingSplitSeriesKey = {
  league: BettingLeague;
  jkbGameId: string;
  provider: string;
  /** `null` means provider-consensus, never the string "null". */
  sportsbook: string | null;
};

export type StoredBettingSplitSnapshot = BettingSplitSnapshot & {
  id: string;
  contentHash: string;
};

export type BettingProviderGameCrosswalkKey = {
  league: BettingLeague;
  provider: string;
  providerGameId: string;
};

export type BettingProviderGameCrosswalkRecord = BettingProviderGameCrosswalkKey & {
  id: string;
  jkbGameId: string;
  providerHomeTeamId: string | null;
  providerAwayTeamId: string | null;
  canonicalHomeTeamId: string | null;
  canonicalAwayTeamId: string | null;
  firstVerifiedAt: string;
  lastVerifiedAt: string;
};

export interface BettingSplitPersistenceAdapter {
  /** Latest observation for a series, or `null` if the series has never been seen. */
  findLatestSnapshot(
    key: BettingSplitSeriesKey,
  ): Promise<StoredBettingSplitSnapshot | null>;

  insertSnapshot(record: StoredBettingSplitSnapshot): Promise<void>;

  /** Bump `lastObservedAt` (and provider freshness) on an existing row. */
  extendSnapshotObservation(
    id: string,
    observation: { lastObservedAt: string; providerLastSeenAt: string | null },
  ): Promise<void>;

  findCrosswalk(
    key: BettingProviderGameCrosswalkKey,
  ): Promise<BettingProviderGameCrosswalkRecord | null>;

  insertCrosswalk(record: BettingProviderGameCrosswalkRecord): Promise<void>;

  updateCrosswalkVerification(
    id: string,
    verification: {
      lastVerifiedAt: string;
      providerHomeTeamId: string | null;
      providerAwayTeamId: string | null;
      canonicalHomeTeamId: string | null;
      canonicalAwayTeamId: string | null;
    },
  ): Promise<void>;
}

function seriesMatches(
  snapshot: StoredBettingSplitSnapshot,
  key: BettingSplitSeriesKey,
): boolean {
  return (
    snapshot.league === key.league &&
    snapshot.jkbGameId === key.jkbGameId &&
    snapshot.provider === key.provider &&
    snapshot.sportsbook === key.sportsbook
  );
}

export type InMemoryBettingSplitPersistence = BettingSplitPersistenceAdapter & {
  readonly snapshots: readonly StoredBettingSplitSnapshot[];
  readonly crosswalks: readonly BettingProviderGameCrosswalkRecord[];
};

/**
 * Deterministic in-memory adapter for tests. No network, no Supabase.
 * Insertion order is preserved so "latest" is well defined without a clock.
 */
export function createInMemoryBettingSplitPersistence(): InMemoryBettingSplitPersistence {
  const snapshots: StoredBettingSplitSnapshot[] = [];
  const crosswalks: BettingProviderGameCrosswalkRecord[] = [];

  return {
    get snapshots() {
      return snapshots;
    },
    get crosswalks() {
      return crosswalks;
    },

    async findLatestSnapshot(key) {
      for (let index = snapshots.length - 1; index >= 0; index -= 1) {
        if (seriesMatches(snapshots[index], key)) return snapshots[index];
      }
      return null;
    },

    async insertSnapshot(record) {
      snapshots.push({ ...record });
    },

    async extendSnapshotObservation(id, observation) {
      const target = snapshots.find((snapshot) => snapshot.id === id);
      if (!target) throw new Error(`Unknown snapshot id: ${id}`);
      target.lastObservedAt = observation.lastObservedAt;
      target.providerLastSeenAt = observation.providerLastSeenAt;
    },

    async findCrosswalk(key) {
      return (
        crosswalks.find(
          (crosswalk) =>
            crosswalk.league === key.league &&
            crosswalk.provider === key.provider &&
            crosswalk.providerGameId === key.providerGameId,
        ) ?? null
      );
    },

    async insertCrosswalk(record) {
      crosswalks.push({ ...record });
    },

    async updateCrosswalkVerification(id, verification) {
      const target = crosswalks.find((crosswalk) => crosswalk.id === id);
      if (!target) throw new Error(`Unknown crosswalk id: ${id}`);
      target.lastVerifiedAt = verification.lastVerifiedAt;
      target.providerHomeTeamId = verification.providerHomeTeamId;
      target.providerAwayTeamId = verification.providerAwayTeamId;
      target.canonicalHomeTeamId = verification.canonicalHomeTeamId;
      target.canonicalAwayTeamId = verification.canonicalAwayTeamId;
    },
  };
}
