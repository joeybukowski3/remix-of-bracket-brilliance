import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { combineInitialStages, combineRepricingStage, combineUpdateStages, deriveOverallChange, mapGrokSideOpinionToState, mapGrokTotalOpinionToState, reconstructLockedStageAFromSnapshot } from "./nfl-grok-analysis-pipeline";
import { isWu46CompatibleAnalysisState } from "./nfl-snapshot-analysis-lifecycle";
import { computeSideEdgePoints, computeTotalEdgePoints } from "./nfl-market-edge";
import type { GrokStageBV1 } from "./nfl-grok-analysis-types";
import type { SnapshotAnalysisState } from "./nfl-snapshot-types";
import { validateGrokStageA, validateGrokStageAUpdate, validateGrokStageB, validateGrokStageBUpdate, type GrokStageAValidationContext, type GrokStageBValidationContext } from "./nfl-grok-analysis-validator";
import { computeSnapshotId, readSnapshotHistory, writeSnapshot } from "./nfl-snapshot-store";
import type { AnalysisSnapshot, MarketAtDecision } from "./nfl-snapshot-types";
import {
  FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_ANALYSIS_CONTEXT_HASH,
  FIXTURE_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_ANALYSIS_CURRENT_MARKET,
  FIXTURE_EDITORIAL_ARTICLE,
  FIXTURE_PREDICTION,
  FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN,
  FIXTURE_STAGE_A_BASE,
  FIXTURE_STAGE_A_UPDATE_NO_MATERIAL_CHANGE,
  FIXTURE_STAGE_A_UPDATE_REAFFIRM,
  FIXTURE_STAGE_B_HOME_LEAN,
  FIXTURE_STAGE_B_UPDATE_CHANGES_SIDE,
  FIXTURE_STAGE_B_UPDATE_MOVES_TO_PASS,
  FIXTURE_STAGE_B_UPDATE_NO_MATERIAL_CHANGE,
  FIXTURE_STAGE_B_UPDATE_STRENGTHENS,
  FIXTURE_STAGE_B_UPDATE_WEAKENS,
} from "./__fixtures__/nfl-grok-analysis-fixtures";

function extractPayload(fixtureResponse: { output: Array<{ type: string; content?: Array<{ text: string }> }> }): unknown {
  const message = fixtureResponse.output.find((o) => o.type === "message");
  return JSON.parse(message!.content![0].text);
}

const STAGE_A_CONTEXT: GrokStageAValidationContext = {
  model: "grok",
  gameId: "2026_01_BAL_IND",
  generatedAt: "2026-09-13T00:00:00.000Z",
  contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH,
  contextPacket: FIXTURE_ANALYSIS_CONTEXT_PACKET,
  homeTeam: FIXTURE_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
  awayTeam: FIXTURE_ANALYSIS_CONTEXT_PACKET.identity.awayTeam,
  allEvidenceRecords: FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
};

const STAGE_B_CONTEXT: GrokStageBValidationContext = {
  model: "grok",
  gameId: "2026_01_BAL_IND",
  generatedAt: "2026-09-13T00:05:00.000Z",
  contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH,
  currentMarketState: FIXTURE_ANALYSIS_CURRENT_MARKET,
  homeTeam: FIXTURE_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
  lockedPrediction: FIXTURE_PREDICTION,
};

const MARKET_AT_DECISION: MarketAtDecision = { spread: FIXTURE_ANALYSIS_CURRENT_MARKET.spread, total: FIXTURE_ANALYSIS_CURRENT_MARKET.total.line, asOf: FIXTURE_ANALYSIS_CURRENT_MARKET.asOf };

function validStageA() {
  const result = validateGrokStageA(extractPayload(FIXTURE_STAGE_A_BASE), STAGE_A_CONTEXT);
  if (!result.ok) throw new Error("fixture Stage A failed to validate");
  return result.analysis;
}

function validStageB(fixture: Parameters<typeof extractPayload>[0]) {
  const result = validateGrokStageB(extractPayload(fixture), STAGE_B_CONTEXT);
  if (!result.ok) throw new Error(`fixture Stage B failed to validate: ${result.reasons.join("; ")}`);
  return result.analysis;
}

function validStageAUpdate(fixture: Parameters<typeof extractPayload>[0]) {
  const result = validateGrokStageAUpdate(extractPayload(fixture), STAGE_A_CONTEXT);
  if (!result.ok) throw new Error(`fixture Stage A update failed to validate: ${result.reasons.join("; ")}`);
  return result.proposal;
}

function validStageBUpdate(fixture: Parameters<typeof extractPayload>[0]) {
  const result = validateGrokStageBUpdate(extractPayload(fixture), STAGE_B_CONTEXT);
  if (!result.ok) throw new Error(`fixture Stage B update failed to validate: ${result.reasons.join("; ")}`);
  return result.proposal;
}

describe("mapGrokSideOpinionToState / mapGrokTotalOpinionToState", () => {
  it("preserves confidence and line for a play (home/away)", () => {
    const state = mapGrokSideOpinionToState({ lean: "home", confidence: 8, lineAtOpinion: { homeLine: 3.5, awayLine: -3.5 }, rationale: "x" });
    expect(state).toEqual({ lean: "home", confidence: 8, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 }, rationale: "x" });
  });

  it("nulls out confidence and line for pass/undecided regardless of what the model reported", () => {
    const state = mapGrokSideOpinionToState({ lean: "pass", confidence: 7, rationale: "x" });
    expect(state.confidence).toBeNull();
    expect(state.spreadLineAtOpinion).toBeNull();
  });
});

describe("deriveOverallChange", () => {
  it("classifies 'none' when neither market changed", () => {
    expect(deriveOverallChange("none", "none")).toBe("none");
  });

  it("classifies 'minor' for a pure confidence move on either market", () => {
    expect(deriveOverallChange("strengthened", "none")).toBe("minor");
    expect(deriveOverallChange("none", "weakened")).toBe("minor");
  });

  it("classifies 'material' for a side/total flip or pass transition", () => {
    expect(deriveOverallChange("changed_side", "none")).toBe("material");
    expect(deriveOverallChange("moved_to_pass", "none")).toBe("material");
    expect(deriveOverallChange("none", "changed_total")).toBe("material");
    expect(deriveOverallChange("pass_to_play", "none")).toBe("material");
  });
});

describe("combineInitialStages", () => {
  it("1. produces a valid initial SnapshotAnalysisState from validated Stage A + Stage B", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    const state = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });
    expect(state.side.lean).toBe("home");
    expect(state.side.confidence).toBe(8);
    expect(state.thesis).toBe(stageA.footballThesis);
  });

  it("WU5: carries matchupFactors, failureModes, and evidenceQualityAssessment from Stage A into the persisted state", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    const state = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });
    expect(state.matchupFactors).toEqual(stageA.matchupFactors);
    expect(state.failureModes).toEqual(stageA.failureModes);
    expect(state.evidenceQualityAssessment).toEqual(stageA.evidenceQualityAssessment);
  });

  it("WU4.5: carries the LOCKED Stage A prediction into independentPrediction/blindPrediction -- never anything from Stage B", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    const state = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });
    expect(state.independentPrediction).toEqual(stageA.prediction);
    expect(state.blindPrediction).toEqual({ generatedAt: stageA.generatedAt, fairSpread: stageA.prediction.fairSpread, projectedTotal: stageA.prediction.projectedTotal, footballThesis: stageA.footballThesis });
  });

  it("11/12/14. marketDecision.marketAtDecision comes from the caller-supplied authoritative market, and edges come from Stage B's mechanically-computed marketAssessment", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    const state = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });
    expect(state.marketDecision?.marketAtDecision).toEqual(MARKET_AT_DECISION);
    expect(state.marketDecision?.sideEdgePoints).toBe(stageB.marketAssessment.sideEdgePoints);
    expect(state.marketDecision?.totalEdgePoints).toBe(stageB.marketAssessment.totalEdgePoints);
  });
});

describe("combineUpdateStages", () => {
  it("13. reads the previous analysis state as the deterministic baseline", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.previousLean).toBe(FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.side.lean);
    expect(assessment.sideAssessment.previousConfidence).toBe(FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.side.confidence);
  });

  it("classifies a confidence increase with the same lean as 'strengthened'", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.change).toBe("strengthened");
    expect(assessment.overallChange).toBe("minor");
  });

  it("classifies a confidence decrease with the same lean as 'weakened'", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_WEAKENS);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.change).toBe("weakened");
  });

  it("classifies a home<->away flip as 'changed_side'", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_CHANGES_SIDE);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.change).toBe("changed_side");
    expect(assessment.overallChange).toBe("material");
  });

  it("classifies a play->pass transition as 'moved_to_pass'", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_MOVES_TO_PASS);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.change).toBe("moved_to_pass");
  });

  it("classifies a pass->play transition as 'pass_to_play'", () => {
    const previousPass = { ...FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, side: { lean: "pass" as const, confidence: null, spreadLineAtOpinion: null } };
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS); // proposes lean:"home"
    const { assessment } = combineUpdateStages({ previous: previousPass, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.change).toBe("pass_to_play");
  });

  it("a no-material-change update classifies overallChange as 'none'", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_NO_MATERIAL_CHANGE);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_NO_MATERIAL_CHANGE);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.change).toBe("none");
    expect(assessment.overallChange).toBe("none");
    expect(assessment.developments).toEqual([]);
  });

  it("preserves the exact prior and current line-at-opinion rather than collapsing to a team label", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { newAnalysisState } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(newAnalysisState.side.spreadLineAtOpinion).toEqual({ homeLine: FIXTURE_ANALYSIS_CURRENT_MARKET.spread.homeLine, awayLine: FIXTURE_ANALYSIS_CURRENT_MARKET.spread.awayLine });
  });

  it("never mutates the previous analysis state it reads from", () => {
    const before = JSON.stringify(FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN);
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_CHANGES_SIDE);
    combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(JSON.stringify(FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN)).toBe(before);
  });

  it("computes thesisAssessment.changed mechanically by text comparison, never by trusting a self-reported flag", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_NO_MATERIAL_CHANGE);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_NO_MATERIAL_CHANGE);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.thesisAssessment.changed).toBe(false);
  });

  it("WU5: carries forward the previous snapshot's matchupFactors/failureModes/evidenceQualityAssessment unchanged (an update proposal never re-supplies them)", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { newAnalysisState } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(newAnalysisState.matchupFactors).toEqual(FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.matchupFactors);
    expect(newAnalysisState.failureModes).toEqual(FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.failureModes);
    expect(newAnalysisState.evidenceQualityAssessment).toEqual(FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN.evidenceQualityAssessment);
  });

  it("WU4.5/WU4.6: an update's independent/blind prediction (re-affirmed or revised) replaces the prior one -- it is never carried forward blindly", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { newAnalysisState } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(newAnalysisState.independentPrediction).toEqual(stageAUpdate.prediction);
    expect(newAnalysisState.blindPrediction?.fairSpread).toEqual(stageAUpdate.prediction.fairSpread);
  });

  it("17. a pre-WU4.6 snapshot with no blindPrediction/marketDecision field remains a valid, parseable SnapshotAnalysisState", () => {
    const legacyState: import("./nfl-snapshot-types").SnapshotAnalysisState = {
      thesis: "Legacy thesis written before WU4.6.",
      side: { lean: "pass", confidence: null, spreadLineAtOpinion: null },
      total: { lean: "pass", confidence: null, totalLineAtOpinion: null },
    };
    expect(legacyState.blindPrediction).toBeUndefined();
    expect(legacyState.marketDecision).toBeUndefined();
  });
});

/**
 * WU4.6.5 -- DETERMINISTIC BLIND-PREDICTION TIMESTAMPS. Confirms the persisted
 * blindPrediction.generatedAt / marketDecision.generatedAt / marketAtDecision.asOf that reach the
 * snapshot are exactly the trusted values the caller supplied -- Stage A's timestamp strictly
 * before Stage B's (as BlindPrediction's own doc comment requires), and marketAtDecision.asOf
 * equal to the authoritative market record, never anything echoed from provider output.
 */
describe("WU4.6.5 -- trusted timestamp provenance through the combiners", () => {
  it("initial: blindPrediction.generatedAt / marketDecision.generatedAt come from the trusted validation-context timestamps, strictly ordered", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    const state = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });
    expect(state.blindPrediction?.generatedAt).toBe(STAGE_A_CONTEXT.generatedAt);
    expect(state.marketDecision?.generatedAt).toBe(STAGE_B_CONTEXT.generatedAt);
    expect(new Date(state.marketDecision!.generatedAt).getTime()).toBeGreaterThan(new Date(state.blindPrediction!.generatedAt).getTime());
  });

  it("initial: marketAtDecision.asOf equals the authoritative market record's asOf, never provider-echoed", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    const state = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });
    expect(state.marketDecision?.marketAtDecision.asOf).toBe(FIXTURE_ANALYSIS_CURRENT_MARKET.asOf);
  });

  it("update: blindPrediction.generatedAt / marketDecision.generatedAt come from the trusted validation-context timestamps, strictly ordered", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { newAnalysisState } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(newAnalysisState.blindPrediction?.generatedAt).toBe(STAGE_A_CONTEXT.generatedAt);
    expect(newAnalysisState.marketDecision?.generatedAt).toBe(STAGE_B_CONTEXT.generatedAt);
    expect(new Date(newAnalysisState.marketDecision!.generatedAt).getTime()).toBeGreaterThan(new Date(newAnalysisState.blindPrediction!.generatedAt).getTime());
  });

  it("update: marketAtDecision.asOf equals the authoritative market record's asOf, never provider-echoed", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { newAnalysisState } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(newAnalysisState.marketDecision?.marketAtDecision.asOf).toBe(FIXTURE_ANALYSIS_CURRENT_MARKET.asOf);
  });
});

describe("end-to-end: analysisState/updateAssessment written through the real WU3.2 snapshot store", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-grok-analysis-snapshot-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("links the update snapshot to the initial one, and the initial snapshot remains immutable afterward", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    const initialAnalysisState = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });

    const initialSnapshotId = computeSnapshotId({ model: "grok", gameId: "2026_01_BAL_IND", snapshotType: "initial", researchCutoff: "2026-09-09T11:00:00.000Z", contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH, evidenceIds: [] });
    const initialSnapshot: AnalysisSnapshot = {
      schemaVersion: "nfl-snapshot-v1",
      snapshotId: initialSnapshotId,
      model: "grok",
      gameId: "2026_01_BAL_IND",
      season: 2026,
      week: 1,
      snapshotType: "initial",
      createdAt: "2026-09-09T12:00:00.000Z",
      researchCutoff: "2026-09-09T11:00:00.000Z",
      kickoff: FIXTURE_ANALYSIS_CONTEXT_PACKET.schedule.kickoffUtc,
      previousSnapshotId: null,
      context: { contextVersion: "nfl-game-context-v1-fixture", contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH, contextGeneratedAt: "2026-09-09T10:30:00.000Z" },
      evidence: { evidenceIds: [], addedEvidenceIds: [], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
      market: { ...FIXTURE_ANALYSIS_CURRENT_MARKET, previousSpread: null, previousTotal: null, spreadDelta: null, totalDelta: null, moneylineHomeDelta: null, moneylineAwayDelta: null, sportsbookChanged: false, asOfDeltaMs: null },
      analysisState: initialAnalysisState,
      updateAssessment: null,
    };
    writeSnapshot(root, initialSnapshot);
    const beforeUpdate = JSON.stringify(initialSnapshot);

    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { assessment, newAnalysisState } = combineUpdateStages({ previous: initialAnalysisState, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    const updateSnapshotId = computeSnapshotId({ model: "grok", gameId: "2026_01_BAL_IND", snapshotType: "daily_update", researchCutoff: "2026-09-10T11:00:00.000Z", contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH, evidenceIds: [] });
    const updateSnapshot: AnalysisSnapshot = {
      ...initialSnapshot,
      snapshotId: updateSnapshotId,
      snapshotType: "daily_update",
      createdAt: "2026-09-10T12:00:00.000Z",
      researchCutoff: "2026-09-10T11:00:00.000Z",
      previousSnapshotId: initialSnapshot.snapshotId,
      analysisState: newAnalysisState,
      updateAssessment: assessment,
    };
    writeSnapshot(root, updateSnapshot);

    const history = readSnapshotHistory(root, 2026, 1, "2026_01_BAL_IND", "grok");
    expect(history).toHaveLength(2);
    expect(history[1].previousSnapshotId).toBe(initialSnapshot.snapshotId);
    expect(history[1].updateAssessment?.overallChange).toBe(assessment.overallChange);

    // Rewriting the SAME initial snapshotId with different content must throw -- immutability held.
    expect(() => writeSnapshot(root, { ...initialSnapshot, analysisState: { ...initialAnalysisState, thesis: "tampered" } })).toThrow(/Immutable snapshot violation/);
    expect(JSON.stringify(initialSnapshot)).toBe(beforeUpdate);
  });
});

describe("WU6.8 -- Stage B-only market repricing (combineRepricingStage / reconstructLockedStageAFromSnapshot)", () => {
  function freshStageB(overrides: Partial<GrokStageBV1["marketAssessment"]> = {}, side: Partial<GrokStageBV1["side"]> = {}, total: Partial<GrokStageBV1["total"]> = {}): GrokStageBV1 {
    return {
      schemaVersion: "nfl-grok-analysis-v1",
      model: "grok",
      gameId: "2026_01_BAL_IND",
      contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH,
      generatedAt: "2026-09-11T00:00:00.000Z",
      side: { lean: "home", team: "ind", lineAtOpinion: { homeLine: -2, awayLine: 2 }, confidence: 7, rationale: "repriced side", ...side },
      total: { lean: "over", totalAtOpinion: 44, confidence: 6, rationale: "repriced total", ...total },
      marketAssessment: { currentHomeLine: -2, currentAwayLine: 2, currentTotal: 44, sideEdgePoints: 1.5, totalEdgePoints: 1.5, interpretation: "repriced", ...overrides },
      editorialArticle: FIXTURE_EDITORIAL_ARTICLE,
    };
  }

  function priorLockedState(): SnapshotAnalysisState {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    return combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });
  }

  it("4/6. carries thesis/matchupFactors/failureModes/evidenceQualityAssessment/independentPrediction/blindPrediction FORWARD UNCHANGED -- Stage A is provably immutable", () => {
    const previous = priorLockedState();
    const newMarketAtDecision: MarketAtDecision = { spread: { homeLine: -2, awayLine: 2 }, total: 44, asOf: "2026-09-11T00:00:00.000Z" };
    const repriced = combineRepricingStage({ previous, stageB: freshStageB(), marketAtDecision: newMarketAtDecision });

    expect(repriced.thesis).toBe(previous.thesis);
    expect(repriced.matchupFactors).toBe(previous.matchupFactors);
    expect(repriced.failureModes).toBe(previous.failureModes);
    expect(repriced.evidenceQualityAssessment).toBe(previous.evidenceQualityAssessment);
    expect(repriced.independentPrediction).toBe(previous.independentPrediction);
    expect(repriced.blindPrediction).toBe(previous.blindPrediction); // same object reference -- not even a clone, structurally cannot differ
  });

  it("marks the result as a market_reprice, distinct from a football_update", () => {
    const previous = priorLockedState();
    const repriced = combineRepricingStage({ previous, stageB: freshStageB(), marketAtDecision: MARKET_AT_DECISION });
    expect(repriced.analysisUpdateKind).toBe("market_reprice");
  });

  it("combineUpdateStages marks its result as football_update, never market_reprice", () => {
    const previous = priorLockedState();
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { newAnalysisState } = combineUpdateStages({ previous, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(newAnalysisState.analysisUpdateKind).toBe("football_update");
  });

  it("7/8. replaces side/total/marketDecision with the NEW Stage B result, preserving the authoritative market input exactly", () => {
    const previous = priorLockedState();
    const newMarketAtDecision: MarketAtDecision = { spread: { homeLine: -2, awayLine: 2 }, total: 44, asOf: "2026-09-11T00:00:00.000Z" };
    const stageB = freshStageB();
    const repriced = combineRepricingStage({ previous, stageB, marketAtDecision: newMarketAtDecision });

    expect(repriced.marketDecision?.marketAtDecision).toEqual(newMarketAtDecision);
    expect(repriced.side.lean).toBe("home");
    expect(repriced.side.confidence).toBe(7);
    expect(repriced.total.lean).toBe("over");
    // Deterministic edges come from Stage B's mechanically-computed marketAssessment -- never authored by combineRepricingStage itself.
    expect(repriced.marketDecision?.sideEdgePoints).toBe(stageB.marketAssessment.sideEdgePoints);
    expect(repriced.marketDecision?.totalEdgePoints).toBe(stageB.marketAssessment.totalEdgePoints);
  });

  it("reconstructLockedStageAFromSnapshot reproduces the exact locked Stage A fields from a WU4.6-compatible snapshot", () => {
    const stageA = validStageA();
    const previous = priorLockedState();
    const snapshot: AnalysisSnapshot = {
      schemaVersion: "nfl-snapshot-v1",
      snapshotId: "grok-2026_01_BAL_IND-initial-fixture",
      model: "grok",
      gameId: "2026_01_BAL_IND",
      season: 2026,
      week: 1,
      snapshotType: "initial",
      createdAt: "2026-09-10T00:00:00.000Z",
      researchCutoff: "2026-09-10T00:00:00.000Z",
      kickoff: "2026-09-13T17:00:00.000Z",
      previousSnapshotId: null,
      context: { contextVersion: "nfl-game-context-v1", contextHash: FIXTURE_ANALYSIS_CONTEXT_HASH, contextGeneratedAt: "2026-09-09T00:00:00.000Z" },
      evidence: { evidenceIds: [], addedEvidenceIds: [], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
      market: { sportsbook: null, spread: { homeLine: null, awayLine: null }, total: { line: null }, moneyline: null, asOf: null, previousSpread: null, previousTotal: null, spreadDelta: null, totalDelta: null, moneylineHomeDelta: null, moneylineAwayDelta: null, sportsbookChanged: false, asOfDeltaMs: null },
      analysisState: previous,
      updateAssessment: null,
    };
    if (!isWu46CompatibleAnalysisState(previous)) throw new Error("expected priorLockedState() to be WU4.6-compatible");
    const reconstructed = reconstructLockedStageAFromSnapshot({ ...snapshot, analysisState: previous });

    expect(reconstructed.footballThesis).toBe(stageA.footballThesis);
    expect(reconstructed.prediction).toEqual(stageA.prediction);
    expect(reconstructed.generatedAt).toBe(stageA.generatedAt);
    expect(reconstructed.matchupFactors).toEqual(stageA.matchupFactors);
    expect(reconstructed.failureModes).toEqual(stageA.failureModes);
    expect(reconstructed.evidenceQualityAssessment).toEqual(stageA.evidenceQualityAssessment);
    expect(reconstructed.contextHash).toBe(snapshot.context.contextHash);
  });
});

describe("WU6.8 -- DET_BUF regression: deterministic edge math for a real live-validated repricing scenario", () => {
  // Live-validated locked Stage A values from the first successful WU6 production run (WU6.7):
  const GROKOWSKI_FAIR_SPREAD = { team: "buf", line: -5.5 };
  const GROKOWSKI_PROJECTED_TOTAL = 49.5;
  const CHATTY_ICE_FAIR_SPREAD = { team: "buf", line: -3 };
  const CHATTY_ICE_PROJECTED_TOTAL = 47;
  const HOME_TEAM = "buf";

  it("Grokowski: fair BUF -5.5 vs market BUF -4 => side edge +1.5 toward BUF; total 49.5 vs 48 => total edge +1.5 toward OVER", () => {
    const sideEdge = computeSideEdgePoints({ fairSpread: GROKOWSKI_FAIR_SPREAD }, HOME_TEAM, -4);
    const totalEdge = computeTotalEdgePoints({ projectedTotal: GROKOWSKI_PROJECTED_TOTAL }, 48);
    expect(sideEdge).toBe(1.5); // positive => home-oriented => value on BUF (home), per nfl-market-edge.ts's documented sign convention
    expect(totalEdge).toBe(1.5); // positive => OVER
  });

  it("Chatty Ice: fair BUF -3 vs market BUF -4 => side edge -1 toward DET; total 47 vs 48 => total edge -1 toward UNDER", () => {
    const sideEdge = computeSideEdgePoints({ fairSpread: CHATTY_ICE_FAIR_SPREAD }, HOME_TEAM, -4);
    const totalEdge = computeTotalEdgePoints({ projectedTotal: CHATTY_ICE_PROJECTED_TOTAL }, 48);
    expect(sideEdge).toBe(-1); // negative => away-oriented => value on DET (away)
    expect(totalEdge).toBe(-1); // negative => UNDER
  });

  it("proves Stage A values are unchanged by repricing: combineRepricingStage never alters fairSpread/projectedTotal regardless of the new market", () => {
    const previous: SnapshotAnalysisState = {
      thesis: "Buffalo favored on EPA and protection.",
      side: { lean: "pass", confidence: null, spreadLineAtOpinion: null, rationale: "no market" },
      total: { lean: "pass", confidence: null, totalLineAtOpinion: null, rationale: "no market" },
      blindPrediction: { generatedAt: "2026-09-15T14:41:57.181Z", fairSpread: GROKOWSKI_FAIR_SPREAD, projectedTotal: GROKOWSKI_PROJECTED_TOTAL, footballThesis: "Buffalo favored on EPA and protection." },
      independentPrediction: { fairSpread: GROKOWSKI_FAIR_SPREAD, projectedTotal: GROKOWSKI_PROJECTED_TOTAL },
      marketDecision: { generatedAt: "2026-09-15T14:42:12.366Z", marketAtDecision: { spread: { homeLine: null, awayLine: null }, total: null, asOf: null }, side: { lean: "pass", confidence: null, spreadLineAtOpinion: null, rationale: "no market" }, total: { lean: "pass", confidence: null, totalLineAtOpinion: null, rationale: "no market" }, sideEdgePoints: null, totalEdgePoints: null },
    };
    const newMarketAtDecision: MarketAtDecision = { spread: { homeLine: -4, awayLine: 4 }, total: 48, asOf: "2026-09-18T00:00:00.000Z" };
    const stageB: GrokStageBV1 = {
      schemaVersion: "nfl-grok-analysis-v1",
      model: "grok",
      gameId: "2026_02_DET_BUF",
      contextHash: "unchanged-context-hash",
      generatedAt: "2026-09-18T00:00:05.000Z",
      side: { lean: "home", team: "buf", lineAtOpinion: { homeLine: -4, awayLine: 4 }, confidence: 6, rationale: "value on Buffalo" },
      total: { lean: "over", totalAtOpinion: 48, confidence: 5, rationale: "value on the over" },
      marketAssessment: { currentHomeLine: -4, currentAwayLine: 4, currentTotal: 48, sideEdgePoints: computeSideEdgePoints({ fairSpread: GROKOWSKI_FAIR_SPREAD }, HOME_TEAM, -4), totalEdgePoints: computeTotalEdgePoints({ projectedTotal: GROKOWSKI_PROJECTED_TOTAL }, 48), interpretation: "x" },
      editorialArticle: FIXTURE_EDITORIAL_ARTICLE,
    };
    const repriced = combineRepricingStage({ previous, stageB, marketAtDecision: newMarketAtDecision });

    expect(repriced.blindPrediction?.fairSpread).toEqual(GROKOWSKI_FAIR_SPREAD);
    expect(repriced.blindPrediction?.projectedTotal).toBe(GROKOWSKI_PROJECTED_TOTAL);
    expect(repriced.independentPrediction?.fairSpread).toEqual(GROKOWSKI_FAIR_SPREAD);
    expect(repriced.independentPrediction?.projectedTotal).toBe(GROKOWSKI_PROJECTED_TOTAL);
    expect(repriced.marketDecision?.sideEdgePoints).toBe(1.5);
    expect(repriced.marketDecision?.totalEdgePoints).toBe(1.5);
    expect(repriced.marketDecision?.marketAtDecision).toEqual(newMarketAtDecision);
    expect(repriced.side.lean).toBe("home");
    expect(repriced.total.lean).toBe("over");
  });
});
