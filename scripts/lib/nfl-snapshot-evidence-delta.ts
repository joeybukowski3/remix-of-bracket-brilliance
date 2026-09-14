/**
 * WU3.2 -- pure, deterministic evidence-delta computation between a
 * previous model-specific snapshot's evidence-id set and the current
 * model-specific EvidenceStore. No LLM involvement: "is this evidenceId
 * new/superseded/conflicting" is answered entirely from IDs and the
 * authority resolution already built in WU2 (resolveEvidenceAuthority,
 * nfl-evidence-store.ts) -- never asked of a model.
 */

import { resolveEvidenceAuthority } from "./nfl-evidence-store";
import type { EvidenceRecord } from "./nfl-evidence-types";
import type { SnapshotEvidenceState } from "./nfl-snapshot-types";

/**
 * `previousEvidenceIds` is the full evidenceIds set from the previous
 * snapshot (SnapshotEvidenceState.evidenceIds), not just "added" ones --
 * this function needs the complete prior set to correctly compute
 * "unchanged" vs "added". `currentRecords` is the model's FULL evidence
 * store as of now (append-only, so it is a superset of whatever the
 * previous snapshot saw, plus anything added since).
 */
export function computeEvidenceDelta(previousEvidenceIds: readonly string[], currentRecords: readonly EvidenceRecord[]): SnapshotEvidenceState {
  const previousIdSet = new Set(previousEvidenceIds);
  const authority = resolveEvidenceAuthority(currentRecords);
  const authorityById = new Map(authority.map((a) => [a.evidenceId, a.status] as const));

  const evidenceIds: string[] = [];
  const addedEvidenceIds: string[] = [];
  const supersededEvidenceIds: string[] = [];
  const conflictingEvidenceIds: string[] = [];

  for (const record of currentRecords) {
    evidenceIds.push(record.evidenceId);
    if (!previousIdSet.has(record.evidenceId)) addedEvidenceIds.push(record.evidenceId);

    const status = authorityById.get(record.evidenceId) ?? "current";
    if (status === "superseded") supersededEvidenceIds.push(record.evidenceId);
    if (status === "conflicting") conflictingEvidenceIds.push(record.evidenceId);
  }

  return { evidenceIds, addedEvidenceIds, supersededEvidenceIds, conflictingEvidenceIds };
}

/** Evidence ids present in the previous snapshot AND still resolving to "current" authority now -- i.e. genuinely unchanged, not superseded/conflicting/new. */
export function unchangedEvidenceIds(previousEvidenceIds: readonly string[], delta: SnapshotEvidenceState): string[] {
  const previousIdSet = new Set(previousEvidenceIds);
  const supersededOrConflicting = new Set([...delta.supersededEvidenceIds, ...delta.conflictingEvidenceIds]);
  return delta.evidenceIds.filter((id) => previousIdSet.has(id) && !supersededOrConflicting.has(id));
}
