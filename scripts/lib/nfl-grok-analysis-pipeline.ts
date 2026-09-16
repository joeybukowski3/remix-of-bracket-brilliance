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
import { GROK_ANALYSIS_SCHEMA_VERSION, type GrokSideOpinion, type GrokStageAUpdateProposal, type GrokStageAV1, type GrokStageBUpdateProposal, type GrokStageBV1, type GrokTotalOpinion } from "./nfl-grok-analysis-types";
import type { AnalysisSnapshot, MarketAtDecision, OverallChange, SideOpinionState, SnapshotAnalysisState, TotalOpinionState, UpdateAssessment } from "./nfl-snapshot-types";

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
      editorialArticle: input.stageB.editorialArticle,
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
    // WU6.8 -- this path re-ran Stage A (the blind prediction may have moved), distinguishing it
    // from combineRepricingStage()'s market-only path below.
    analysisUpdateKind: "football_update",
  };

  return { assessment, newAnalysisState };
}

/**
 * WU6.8 -- reconstructs the exact GrokStageAV1 shape a prior WU4.6-compatible
 * snapshot's locked Stage A output had, so a Stage-B-only repricing call can
 * reuse it verbatim (buildStageBInitialPrompt/runGrokStageBInitial take a
 * GrokStageAV1, not a bespoke "locked prediction" shape). Every field is read
 * from the snapshot as persisted -- nothing here re-derives or revises the
 * football projection. `contextHash`/`generatedAt` are the ORIGINAL Stage A
 * values, proving (not just asserting) that repricing never re-stamps them.
 */
export function reconstructLockedStageAFromSnapshot(snapshot: AnalysisSnapshot & { analysisState: NonNullable<AnalysisSnapshot["analysisState"]> & { blindPrediction: NonNullable<SnapshotAnalysisState["blindPrediction"]> } }): GrokStageAV1 {
  const state = snapshot.analysisState;
  const matchupFactors = state.matchupFactors ?? [];
  return {
    schemaVersion: GROK_ANALYSIS_SCHEMA_VERSION,
    model: snapshot.model,
    gameId: snapshot.gameId,
    contextHash: snapshot.context.contextHash,
    evidenceIdsUsed: Array.from(new Set(matchupFactors.flatMap((f) => f.evidenceIds))),
    footballThesis: state.blindPrediction.footballThesis,
    matchupFactors,
    prediction: { fairSpread: state.blindPrediction.fairSpread, projectedTotal: state.blindPrediction.projectedTotal },
    failureModes: state.failureModes ?? [],
    evidenceQualityAssessment: state.evidenceQualityAssessment ?? { strengths: [], limitations: [] },
    generatedAt: state.blindPrediction.generatedAt,
  };
}

export interface CombineRepricingStageInput {
  /** The prior snapshot's analysisState -- Stage A fields (thesis/matchupFactors/failureModes/
   * evidenceQualityAssessment/independentPrediction/blindPrediction) are carried forward
   * UNCHANGED; only side/total/marketDecision are replaced. */
  previous: SnapshotAnalysisState;
  /** A fresh Stage B result, produced by calling the SAME runGrokStageBInitial/runChatGptStageBInitial
   * used for a brand-new "initial" pass, but with lockedStageA reconstructed from `previous`
   * (see reconstructLockedStageAFromSnapshot) instead of a freshly-run Stage A. */
  stageB: GrokStageBV1;
  /** Built by the caller from the CURRENT authoritative market read -- never echoed from provider output. */
  marketAtDecision: MarketAtDecision;
}

/**
 * WU6.8 -- Stage-B-only market repricing. Reuses the prior snapshot's locked
 * Stage A output (thesis/matchupFactors/failureModes/evidenceQualityAssessment/
 * independentPrediction/blindPrediction) byte-for-byte; only `side`, `total`,
 * and `marketDecision` are replaced with the new Stage B result. There is
 * structurally no way for this function to alter the football prediction --
 * it never reads a `stageA` argument at all.
 */
export function combineRepricingStage(input: CombineRepricingStageInput): SnapshotAnalysisState {
  const { previous, stageB, marketAtDecision } = input;
  const side = mapGrokSideOpinionToState(stageB.side);
  const total = mapGrokTotalOpinionToState(stageB.total);
  return {
    thesis: previous.thesis,
    side,
    total,
    matchupFactors: previous.matchupFactors,
    failureModes: previous.failureModes,
    evidenceQualityAssessment: previous.evidenceQualityAssessment,
    independentPrediction: previous.independentPrediction,
    blindPrediction: previous.blindPrediction,
    marketDecision: {
      generatedAt: stageB.generatedAt,
      marketAtDecision,
      side,
      total,
      sideEdgePoints: stageB.marketAssessment.sideEdgePoints,
      totalEdgePoints: stageB.marketAssessment.totalEdgePoints,
      editorialArticle: stageB.editorialArticle,
    },
    analysisUpdateKind: "market_reprice",
  };
}
