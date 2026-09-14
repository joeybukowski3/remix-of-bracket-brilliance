/**
 * WU4.4.2 -- deterministic analysis-lifecycle bookkeeping layered on top of
 * the existing immutable AnalysisSnapshot chain (nfl-snapshot-types.ts /
 * nfl-snapshot-store.ts). Nothing here mutates or is stored inside an
 * individual snapshot file -- every snapshot already on disk stays exactly
 * as written. This module answers, purely from the existing
 * analysisState null/non-null field across a model's chain:
 *
 *   1. Did this model have an analysis opinion before this snapshot?
 *   2. Which snapshot contains its first real handicap?
 *   3. When was the first handicap actually generated?
 *   4. Is a later opinion truly an update versus that prior handicap?
 *
 * A snapshot's own `snapshotType` ("initial" | "daily_update" | "gameday",
 * see nfl-snapshot-types.ts) describes cadence, NOT analysis lifecycle -- a
 * "daily_update" snapshot can legitimately be the first one that ever
 * carries an opinion, if it follows one or more research-only
 * "daily_update" snapshots. These two concepts are deliberately kept
 * independent rather than collapsed, so no historical snapshotType is ever
 * reinterpreted or rewritten to "fix" this.
 */
import type { AnalysisSnapshot, SnapshotAnalysisState } from "./nfl-snapshot-types";

export type AnalysisLifecycleState = "not_started" | "initial" | "update";
export const ANALYSIS_LIFECYCLE_STATES: readonly AnalysisLifecycleState[] = ["not_started", "initial", "update"];

export interface AnalysisLifecycle {
  state: AnalysisLifecycleState;
  /** The snapshotId of the first snapshot in this chain whose analysisState is non-null. Null if no snapshot up to this point has ever carried an opinion. */
  firstAnalysisSnapshotId: string | null;
  /** That first analysis-bearing snapshot's own createdAt -- never this snapshot's createdAt. */
  firstAnalysisGeneratedAt: string | null;
}

const NOT_STARTED: AnalysisLifecycle = { state: "not_started", firstAnalysisSnapshotId: null, firstAnalysisGeneratedAt: null };

/**
 * Computes the AnalysisLifecycle for EVERY snapshot in `orderedHistory`
 * (must already be chronologically ordered, oldest first -- matches
 * readSnapshotHistory()'s own ordering). A prior null analysisState is
 * never treated as a prior opinion: firstAnalysisSnapshotId only latches
 * onto the first snapshot whose analysisState is non-null, and every
 * snapshot before that stays "not_started".
 */
export function computeAnalysisLifecycleTimeline(orderedHistory: readonly AnalysisSnapshot[]): Map<string, AnalysisLifecycle> {
  const timeline = new Map<string, AnalysisLifecycle>();
  let firstAnalysisSnapshotId: string | null = null;
  let firstAnalysisGeneratedAt: string | null = null;

  for (const snapshot of orderedHistory) {
    const hasAnalysis = snapshot.analysisState !== null;
    if (hasAnalysis && firstAnalysisSnapshotId === null) {
      firstAnalysisSnapshotId = snapshot.snapshotId;
      firstAnalysisGeneratedAt = snapshot.createdAt;
    }
    const state: AnalysisLifecycleState = firstAnalysisSnapshotId === null ? "not_started" : firstAnalysisSnapshotId === snapshot.snapshotId ? "initial" : "update";
    timeline.set(snapshot.snapshotId, { state, firstAnalysisSnapshotId, firstAnalysisGeneratedAt });
  }
  return timeline;
}

/** Convenience: the AnalysisLifecycle for just the latest snapshot in an already-ordered history. Returns "not_started"/nulls for an empty history. */
export function computeLatestAnalysisLifecycle(orderedHistory: readonly AnalysisSnapshot[]): AnalysisLifecycle {
  if (orderedHistory.length === 0) return NOT_STARTED;
  const timeline = computeAnalysisLifecycleTimeline(orderedHistory);
  return timeline.get(orderedHistory[orderedHistory.length - 1].snapshotId) ?? NOT_STARTED;
}

/**
 * The UPDATE MODE GUARD: resolves the snapshot a delta/update pass must
 * compare its "prior opinion" against -- the latest snapshot with a
 * non-null analysisState, NOT simply the latest snapshot overall (which may
 * be a research-only snapshot, or may itself legitimately BE the first
 * analysis-bearing snapshot -- today's live case). A research-only
 * snapshot's null analysisState is never substituted in as if it were a
 * prior opinion. Returns null if no snapshot in the chain has ever carried
 * one, meaning update mode must refuse to run.
 */
export function resolvePreviousAnalysisSnapshot(orderedHistory: readonly AnalysisSnapshot[]): AnalysisSnapshot | null {
  for (let i = orderedHistory.length - 1; i >= 0; i--) {
    if (orderedHistory[i].analysisState !== null) return orderedHistory[i];
  }
  return null;
}

/**
 * WU4.6.1 -- a snapshot's analysisState is only WU4.6-compatible (eligible
 * for the public AI Picks card) once it carries BOTH `blindPrediction` and
 * `marketDecision`. A pre-WU4.6 snapshot has `independentPrediction`/
 * `thesis`/`side`/`total` populated but neither of those two fields, and
 * must never be presented as a current independent handicap -- its
 * thesis/side/total predate the market-blind architecture and may still
 * carry JKB-contaminated reasoning.
 */
export function isWu46CompatibleAnalysisState(state: SnapshotAnalysisState | null): state is SnapshotAnalysisState & {
  blindPrediction: NonNullable<SnapshotAnalysisState["blindPrediction"]>;
  marketDecision: NonNullable<SnapshotAnalysisState["marketDecision"]>;
} {
  return state != null && state.blindPrediction != null && state.marketDecision != null;
}

/**
 * The public-presentation counterpart of resolvePreviousAnalysisSnapshot():
 * resolves the LATEST snapshot in this model's chain whose analysisState is
 * WU4.6-compatible, skipping any legacy analysis-bearing snapshot (or
 * research-only snapshot) that doesn't qualify. Returns null if no snapshot
 * in the chain has ever produced a WU4.6-compatible handicap yet -- that is
 * a fully valid, expected state (never faked as if a legacy opinion counted).
 */
export function resolveLatestWu46CompatibleAnalysisSnapshot(orderedHistory: readonly AnalysisSnapshot[]): AnalysisSnapshot | null {
  for (let i = orderedHistory.length - 1; i >= 0; i--) {
    if (isWu46CompatibleAnalysisState(orderedHistory[i].analysisState)) return orderedHistory[i];
  }
  return null;
}
