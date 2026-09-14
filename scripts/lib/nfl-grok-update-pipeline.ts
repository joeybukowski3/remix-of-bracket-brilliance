/**
 * WU3.3 -- pure orchestration for turning one Grok update-mode research
 * result into (a) newly normalized/appended EvidenceRecord[] and (b) a new,
 * immutable AnalysisSnapshot linked to the previous one. No network, no
 * filesystem I/O -- callers (scripts/run-nfl-grok-research.ts) own reading
 * the previous snapshot/evidence store and writing the results back.
 *
 * This is intentionally the ONE place update-mode wiring lives, so the CLI
 * script and tests exercise the exact same append -> evidence-delta ->
 * market-delta -> snapshot path (per the WU3.3 work order's pipeline
 * diagram) rather than two subtly different implementations.
 */

import { appendEvidence, type AppendOutcome } from "./nfl-evidence-store";
import { normalizeExternalEvidence } from "./nfl-evidence-normalizer";
import type { EvidenceModel, EvidenceNormalizationContext, EvidenceRecord, RawEvidenceCandidate } from "./nfl-evidence-types";
import { canCreatePregameSnapshot } from "./nfl-snapshot-lock";
import { computeEvidenceDelta } from "./nfl-snapshot-evidence-delta";
import { computeMarketDelta } from "./nfl-snapshot-market-delta";
import { computeSnapshotId } from "./nfl-snapshot-store";
import { checkContextFreshness } from "./nfl-snapshot-context-freshness";
import type { AnalysisSnapshot, SnapshotMarketState, SnapshotType } from "./nfl-snapshot-types";

export interface NormalizeRejection {
  claim: string;
  reasons: string[];
}

export interface AppendedRecordOutcome {
  record: EvidenceRecord;
  outcome: AppendOutcome;
}

export interface GrokUpdatePipelineInput {
  model: EvidenceModel;
  previousSnapshot: AnalysisSnapshot;
  /** The FULL existing evidence stream for this model/game to date (append-only; a superset of previousSnapshot.evidence.evidenceIds). */
  existingRecords: readonly EvidenceRecord[];
  /** RawEvidenceCandidate[] returned by runGrokResearch() for this update pass -- not yet normalized. */
  newCandidates: readonly RawEvidenceCandidate[];
  normalizationContext: EvidenceNormalizationContext;
  currentMarketState: SnapshotMarketState;
  newResearchCutoff: string;
  newContextHash: string;
  /** WU3.3.1 -- the fresh Game Context Packet's own contextVersion (usually unchanged, but never assumed constant). */
  newContextVersion: string;
  /**
   * WU3.3.1 -- the fresh Game Context Packet's own `generatedAt`/`provenance.builtAt`
   * (from nfl-full-game-context-loader.ts), NOT this snapshot's `createdAt`.
   * Checked against the previous snapshot's stored context-generation time
   * via checkContextFreshness() -- see this module's stale-context guard
   * below. Required so update mode can never silently reuse a stale context.
   */
  newContextGeneratedAt: string;
  snapshotType: SnapshotType;
  now?: () => Date;
}

export type GrokUpdatePipelineResult =
  | {
      ok: true;
      allRecords: EvidenceRecord[];
      appendedOutcomes: AppendedRecordOutcome[];
      normalizeRejections: NormalizeRejection[];
      snapshot: AnalysisSnapshot;
    }
  | { ok: false; error: string };

/**
 * Runs the full append -> evidence-delta -> market-delta -> snapshot
 * pipeline for one Grok update pass. Idempotent: replaying the exact same
 * `newCandidates` against the exact same `existingRecords` produces
 * `added_duplicate_skipped` outcomes (via appendEvidence's claim+URL
 * dedup) and, given the same `now`, a byte-identical snapshot -- which
 * nfl-snapshot-store.ts's writeSnapshot() safely no-ops on rather than
 * treating as an error.
 */
export function runGrokUpdatePipeline(input: GrokUpdatePipelineInput): GrokUpdatePipelineResult {
  if (input.previousSnapshot.model !== input.model) {
    return { ok: false, error: `Model isolation violation: previousSnapshot.model ("${input.previousSnapshot.model}") does not match the pipeline's model ("${input.model}").` };
  }
  for (const record of input.existingRecords) {
    if (record.model !== input.model) {
      return { ok: false, error: `Model isolation violation: existingRecords contains a "${record.model}" record in a "${input.model}" update pipeline run.` };
    }
  }

  const nowFn = input.now ?? (() => new Date());

  const lockCheck = canCreatePregameSnapshot({
    kickoffUtc: input.previousSnapshot.kickoff,
    researchCutoff: input.newResearchCutoff,
    snapshotType: input.snapshotType,
    now: nowFn,
  });
  if (!lockCheck.ok) {
    return { ok: false, error: lockCheck.reason };
  }

  if (Date.parse(input.newResearchCutoff) < Date.parse(input.previousSnapshot.researchCutoff)) {
    return {
      ok: false,
      error: `newResearchCutoff (${input.newResearchCutoff}) must not be before the previous snapshot's researchCutoff (${input.previousSnapshot.researchCutoff}).`,
    };
  }

  // WU3.3.1 stale-context guard: the update pipeline must never silently proceed on a context
  // that was not freshly regenerated/read (nfl-full-game-context-loader.ts) for THIS pass. This
  // checks PROVENANCE (was the context freshly built) never VALUES (an unchanged market/context
  // hash is explicitly fine -- see nfl-snapshot-context-freshness.ts's header comment).
  const freshness = checkContextFreshness(input.previousSnapshot.context.contextGeneratedAt, input.newContextGeneratedAt);
  if (freshness.status === "stale_or_reused") {
    return { ok: false, error: `Stale context guard tripped: ${freshness.reason}` };
  }

  let store = { model: input.model, gameId: input.previousSnapshot.gameId, records: [...input.existingRecords] };
  const appendedOutcomes: AppendedRecordOutcome[] = [];
  const normalizeRejections: NormalizeRejection[] = [];

  for (const candidate of input.newCandidates) {
    // Model isolation is enforced structurally at every layer (WU2's appendEvidence throws on
    // a model mismatch); surfaced here as a typed result rather than an uncaught exception, since
    // a candidate crossing model namespaces should never happen via the normal adapter path but
    // must never be allowed to silently write into the wrong model's stream.
    if (candidate.model !== input.model) {
      return { ok: false, error: `Model isolation violation: a "${candidate.model}" candidate cannot be written into a "${input.model}" update pipeline run.` };
    }
    const normalized = normalizeExternalEvidence(candidate, input.normalizationContext);
    if (!normalized.ok) {
      normalizeRejections.push({ claim: candidate.claim, reasons: normalized.reasons });
      continue;
    }
    const appended = appendEvidence(store, normalized.evidence);
    store = appended.store;
    appendedOutcomes.push({ record: normalized.evidence, outcome: appended.outcome });
  }

  const evidence = computeEvidenceDelta(input.previousSnapshot.evidence.evidenceIds, store.records);
  const market = computeMarketDelta(
    { sportsbook: input.previousSnapshot.market.sportsbook, spread: input.previousSnapshot.market.spread, total: input.previousSnapshot.market.total, moneyline: input.previousSnapshot.market.moneyline, asOf: input.previousSnapshot.market.asOf },
    input.currentMarketState
  );

  const snapshotId = computeSnapshotId({
    model: input.model,
    gameId: input.previousSnapshot.gameId,
    snapshotType: input.snapshotType,
    researchCutoff: input.newResearchCutoff,
    contextHash: input.newContextHash,
    evidenceIds: evidence.evidenceIds,
  });

  const snapshot: AnalysisSnapshot = {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId,
    model: input.model,
    gameId: input.previousSnapshot.gameId,
    season: input.previousSnapshot.season,
    week: input.previousSnapshot.week,
    snapshotType: input.snapshotType,
    createdAt: nowFn().toISOString(),
    researchCutoff: input.newResearchCutoff,
    kickoff: input.previousSnapshot.kickoff,
    previousSnapshotId: input.previousSnapshot.snapshotId,
    context: { contextVersion: input.newContextVersion, contextHash: input.newContextHash, contextGeneratedAt: input.newContextGeneratedAt },
    evidence,
    market,
    // WU3.3 scope: research/update ingestion only -- the betting lean/confidence/thesis
    // state is carried forward UNCHANGED from the previous snapshot. No opinion is
    // re-asked or re-derived here; that is the future analysis/update-assessment WU's job.
    analysisState: input.previousSnapshot.analysisState,
    updateAssessment: null,
  };

  return { ok: true, allRecords: store.records, appendedOutcomes, normalizeRejections, snapshot };
}
