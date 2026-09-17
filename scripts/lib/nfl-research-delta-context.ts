/**
 * WU3.2 -- pure builder for the provider-neutral ResearchDeltaContext
 * (nfl-snapshot-types.ts) a future delta-research pass (Grok's "update"
 * mode, ChatGPT's update mode) will consume. No network, no model call, no
 * provider-specific field -- this module and its output type must stay
 * usable unchanged by both adapters.
 */

import type { AnalysisSnapshot, ResearchDeltaContext, SnapshotMarketState } from "./nfl-snapshot-types";
import type { ResearchCoverageSummary } from "./nfl-grok-research-coverage";

function marketStateFrom(snapshot: AnalysisSnapshot): SnapshotMarketState {
  const { sportsbook, spread, total, moneyline, asOf } = snapshot.market;
  return { sportsbook, spread, total, moneyline, asOf };
}

export function buildResearchDeltaContext(input: {
  previousSnapshot: AnalysisSnapshot | null;
  priorEvidenceClaims?: readonly { evidenceId: string; claim: string }[];
  priorCoverage?: ResearchCoverageSummary;
}): ResearchDeltaContext {
  if (!input.previousSnapshot) {
    return {
      previousSnapshotId: null,
      previousResearchCutoff: null,
      priorEvidenceIds: [],
      priorEvidenceClaims: input.priorEvidenceClaims,
      priorCoverage: input.priorCoverage,
      previousMarketState: undefined,
    };
  }

  const previous = input.previousSnapshot;
  return {
    previousSnapshotId: previous.snapshotId,
    previousResearchCutoff: previous.researchCutoff,
    priorEvidenceIds: previous.evidence.evidenceIds,
    priorEvidenceClaims: input.priorEvidenceClaims,
    priorCoverage: input.priorCoverage,
    previousMarketState: marketStateFrom(previous),
  };
}
