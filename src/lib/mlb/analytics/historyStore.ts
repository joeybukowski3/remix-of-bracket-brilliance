/**
 * Historical observation storage adapter boundary (Phase 1).
 *
 * The storage backend must be replaceable without touching scoring or the
 * history schema. Phase 1 ships only the in-memory fixture adapter used by
 * tests; production adapters are future phases:
 *
 *  - SupabaseHistoryStore  (Phase C: database-backed observations/querying;
 *    requires live credentials and table migrations — deliberately NOT
 *    implemented here)
 *  - ObjectStorageHistoryStore  (Phase B: compressed immutable artifacts,
 *    one per slate + snapshot type — never a growing monthly rewrite file
 *    in Git)
 *
 * The interface is append-only by contract: records are immutable once
 * written, duplicates (same observation key) are rejected, and there is no
 * update or delete operation.
 */

import {
  historyObservationKey,
  validateHistoryObservation,
  type HrHistoryObservation,
  type SnapshotType,
} from "./historySchema";
import type { MlbMarket } from "./types";

export interface AppendResult {
  appended: number;
  /** Observation keys rejected because a record with the same key already exists. */
  duplicateKeys: string[];
}

export interface HistoryObservationStore {
  append(records: HrHistoryObservation[]): Promise<AppendResult>;
  listSlate(
    market: MlbMarket,
    slateDate: string,
    snapshotType?: SnapshotType,
  ): Promise<HrHistoryObservation[]>;
}

/**
 * In-memory adapter for tests and fixture-driven validation. Enforces the
 * same append-only semantics a production adapter must honor.
 */
export class InMemoryHistoryStore implements HistoryObservationStore {
  private readonly records = new Map<string, HrHistoryObservation>();

  async append(records: HrHistoryObservation[]): Promise<AppendResult> {
    let appended = 0;
    const duplicateKeys: string[] = [];
    for (const record of records) {
      const validation = validateHistoryObservation(record);
      if (!validation.valid) {
        throw new Error(`History append rejected invalid record: ${validation.errors.join("; ")}`);
      }
      const key = historyObservationKey(record);
      if (this.records.has(key)) {
        duplicateKeys.push(key);
        continue;
      }
      // Store a deep copy so callers cannot mutate appended records.
      this.records.set(key, JSON.parse(JSON.stringify(record)) as HrHistoryObservation);
      appended += 1;
    }
    return { appended, duplicateKeys };
  }

  async listSlate(
    market: MlbMarket,
    slateDate: string,
    snapshotType?: SnapshotType,
  ): Promise<HrHistoryObservation[]> {
    return [...this.records.values()]
      .filter(
        (record) =>
          record.market === market &&
          record.slateDate === slateDate &&
          (snapshotType == null || record.snapshotType === snapshotType),
      )
      .map((record) => JSON.parse(JSON.stringify(record)) as HrHistoryObservation);
  }

  get size(): number {
    return this.records.size;
  }
}
