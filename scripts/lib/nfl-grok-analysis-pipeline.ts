/**
 * WU3.4 -- pure orchestration turning validated Grok analysis proposals into
 * the WU3.2 snapshot shapes (`SnapshotAnalysisState`, `UpdateAssessment`). No
 * network, no I/O.
 *
 * WU4.6 -- TWO-STAGE MARKET-BLIND HANDICAPPER: a handicap pass is now TWO
 * validated proposals (Stage A blind football projection, Stage B market
 * decision), combined here into one SnapshotAnalysisState. This module never
 * lets Stage B influence the persisted fair spread/projected total --
 * `combineInitialStages`/`combineUpdateStages` always source
 * `independentPrediction`/`blindPrediction` from the Stage A output alone
 * (GrokStageBV1/GrokStageBUpdateProposal have no `prediction` field to even
 * consider). `marketDecision.marketAtDecision` is built by the CALLER from
 * the same authoritative market read as `SnapshotMarketRecord` -- never
 * echoed from provider output.
 *
 * The critical design point carried over from WU3.4's original "IMPORTANT
 * UPDATE RULE": an update proposal supplies ONLY the model's current
 * side/total opinion (and, for Stage A, its current/revised prediction) --
 * never a previousLean/change-kind self-report. Every classification --
 * strengthened/weakened/changed_side/moved_to_pass/pass_to_play/none, and
 * the derived overallChange -- is computed HERE, deterministically, by
 * reusing nfl-snapshot-opinion-delta.ts's classifiers verbatim.
 */

import { classifySideOpinionChange, classifyTotalOpinionChange } from "./nfl-snapshot-opinion-delta";
import type { GrokSideOpinion, GrokStageAUpdateProposal, GrokStageAV1, GrokStageBUpdateProposal, GrokStageBV1, GrokTotalOpinion } from "./nfl-grok-analysis-types";
import type { MarketAtDecision, OverallChange, SideOpinionState, SnapshotAnalysisState, TotalOpinionState, UpdateAssessment } from "./nfl-snapshot-types";

/**
 * Maps a GrokSideOpinion (always confidence 1-10, per nfl-grok-analysis-types.ts)
 * onto WU3.2's SideOpinionState convention (confidence null for
 * "pass"/"undecided" -- no directional confidence once no play is being
 * made). This is the ONE place the two schemas' differing confidence
 * conventions are reconciled.
 */
export function mapGrokSideOpinionToState(side: GrokSideOpinion): SideOpinionState {
  const isPlay = side.lean === "home" || side.lean === "away";
  return {
    lean: side.lean,
    confidence: isPlay ? side.confidence : null,
    spreadLineAtOpinion: isPlay ? side.lineAtOpinion ?? null : null,
    rationale: side.rationale,
  };
}

export function mapGrokTotalOpinionToState(total: GrokTotalOpinion): TotalOpinionState {
  const isPlay = total.lean === "over" || total.lean === "under";
  return {
    lean: total.lean,
    confidence: isPlay ? total.confidence : null,
    totalLineAtOpinion: isPlay ? total.totalAtOpinion ?? null : null,
    rationale: total.rationale,
  };
}

/**
 * Deterministic, mechanical derivation from the two per-market change
 * kinds -- never asked of the model. A genuine side/total flip or
 * pass-transition is "material"; a pure confidence move is "minor"; no
 * change on either market is "none".
 */
export function deriveOverallChange(sideChange: ReturnType<typeof classifySideOpinionChange>, totalChange: ReturnType<typeof classifyTotalOpinionChange>): OverallChange {
  const materialKinds = new Set(["changed_side", "moved_to_pass", "pass_to_play"]);
  const materialTotalKinds = new Set(["changed_total", "moved_to_pass", "pass_to_play"]);
  if (materialKinds.has(sideChange) || materialTotalKinds.has(totalChange)) return "material";
  if (sideChange === "strengthened" || sideChange === "weakened" || totalChange === "strengthened" || totalChange === "weakened") return "minor";
  return "none";
}

export interface CombineInitialStagesInput {
  stageA: GrokStageAV1;
  stageB: GrokStageBV1;
  /** Built by the caller from the same authoritative market read as SnapshotMarketRecord -- never echoed from provider output. */
  marketAtDecision: MarketAtDecision;
}

/**
 * Combines a validated Stage A (blind projection) and Stage B (market
 * decision) into one initial-snapshot SnapshotAnalysisState. The fair
 * spread/projected total ALWAYS come from `stageA.prediction` -- Stage B's
 * validated shape has no `prediction` field to accidentally read instead.
 */
export function combineInitialStages(input: CombineInitialStagesInput): SnapshotAnalysisState {
  const side = mapGrokSideOpinionToState(input.stageB.side);
  const total = mapGrokTotalOpinionToState(input.stageB.total);
  return {
    thesis: input.stageA.footballThesis,
    side,
    total,
    matchupFactors: input.stageA.matchupFactors,
    failureModes: input.stageA.failureModes,
    evidenceQualityAssessment: input.stageA.evidenceQualityAssessment,
    independentPrediction: input.stageA.prediction,
    blindPrediction: {
      generatedAt: input.stageA.generatedAt,
      fairSpread: input.stageA.prediction.fairSpread,
      projectedTotal: input.stageA.prediction.projectedTotal,
      footballThesis: input.stageA.footballThesis,
    },
    marketDecision: {
      generatedAt: input.stageB.generatedAt,
      marketAtDecision: input.marketAtDecision,
      side,
      total,
      sideEdgePoints: input.stageB.marketAssessment.sideEdgePoints,
      totalEdgePoints: input.stageB.marketAssessment.totalEdgePoints,
    },
  };
}

export interface CombineUpdateStagesInput {
  previous: SnapshotAnalysisState;
  stageAUpdate: GrokStageAUpdateProposal;
  stageBUpdate: GrokStageBUpdateProposal;
  marketAtDecision: MarketAtDecision;
}

export interface CombineUpdateStagesResult {
  assessment: UpdateAssessment;
  newAnalysisState: SnapshotAnalysisState;
}

/**
 * Combines the previous snapshot's analysisState with validated Stage A/B
 * UPDATE proposals. `previous` must be non-null -- an update pass with no
 * prior analysis state has nothing to diff against and is a caller-level
 * error, not something this function can paper over. As with the initial
 * combiner, the persisted fair spread/projected total always come from
 * `stageAUpdate.prediction` -- Stage B's update shape has no `prediction`
 * field at all.
 */
export function combineUpdateStages(input: CombineUpdateStagesInput): CombineUpdateStagesResult {
  const { previous, stageAUpdate, stageBUpdate, marketAtDecision } = input;
  const currentSide = mapGrokSideOpinionToState(stageBUpdate.side);
  const currentTotal = mapGrokTotalOpinionToState(stageBUpdate.total);

  const sideChange = classifySideOpinionChange(previous.side, currentSide);
  const totalChange = classifyTotalOpinionChange(previous.total, currentTotal);
  const overallChange = deriveOverallChange(sideChange, totalChange);

  // Thesis "changed" is a mechanical text-equality check against the previous stored thesis --
  // never trusted from a self-reported boolean the model could get wrong or fabricate.
  const previousThesisNormalized = (previous.thesis ?? "").trim();
  const currentThesisNormalized = stageAUpdate.currentFootballThesis.trim();
  const thesisChanged = previousThesisNormalized !== currentThesisNormalized;

  const assessment: UpdateAssessment = {
    developments: stageAUpdate.developments,
    thesisAssessment: { changed: thesisChanged, explanation: stageAUpdate.thesisChangeExplanation },
    sideAssessment: {
      previousLean: previous.side.lean,
      currentLean: currentSide.lean,
      change: sideChange,
      previousConfidence: previous.side.confidence,
      currentConfidence: currentSide.confidence,
      explanation: stageBUpdate.side.rationale,
    },
    totalAssessment: {
      previousLean: previous.total.lean,
      currentLean: currentTotal.lean,
      change: totalChange,
      previousConfidence: previous.total.confidence,
      currentConfidence: currentTotal.confidence,
      explanation: stageBUpdate.total.rationale,
    },
    overallChange,
    conciseCommentary: stageBUpdate.conciseCommentary,
  };

  // Stage A/B update proposals only ever supply the CURRENT prediction/side/total opinion and
  // new football developments -- structured reasoning fields (matchupFactors/failureModes/
  // evidenceQualityAssessment) are a full-re-research-pass-only concept and are carried forward
  // unchanged from the previous snapshot's analysisState, exactly as before WU4.6.
  const newAnalysisState: SnapshotAnalysisState = {
    thesis: stageAUpdate.currentFootballThesis,
    side: currentSide,
    total: currentTotal,
    matchupFactors: previous.matchupFactors,
    failureModes: previous.failureModes,
    evidenceQualityAssessment: previous.evidenceQualityAssessment,
    independentPrediction: stageAUpdate.prediction,
    blindPrediction: {
      generatedAt: stageAUpdate.generatedAt,
      fairSpread: stageAUpdate.prediction.fairSpread,
      projectedTotal: stageAUpdate.prediction.projectedTotal,
      footballThesis: stageAUpdate.currentFootballThesis,
    },
    marketDecision: {
      generatedAt: stageBUpdate.generatedAt,
      marketAtDecision,
      side: currentSide,
      total: currentTotal,
      sideEdgePoints: stageBUpdate.marketAssessment.sideEdgePoints,
      totalEdgePoints: stageBUpdate.marketAssessment.totalEdgePoints,
    },
  };

  return { assessment, newAnalysisState };
}
