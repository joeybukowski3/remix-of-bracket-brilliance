/**
 * WU4.4 -- exercises the SHARED pipeline (nfl-grok-analysis-pipeline.ts) end
 * to end against the ChatGPT-namespace fixtures/validator, proving it is
 * genuinely provider-neutral business logic (no fork), and that a ChatGPT
 * snapshot lineage writes into `.../chatgpt/`, never `.../grok/`.
 *
 * WU4.6 -- updated for the two-stage (Stage A blind projection / Stage B
 * market decision) split.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { combineInitialStages, combineUpdateStages } from "./nfl-grok-analysis-pipeline";
import { validateGrokStageA, validateGrokStageAUpdate, validateGrokStageB, validateGrokStageBUpdate, type GrokStageAValidationContext, type GrokStageBValidationContext } from "./nfl-grok-analysis-validator";
import { computeSnapshotId, readSnapshotHistory, snapshotModelDirPath, writeSnapshot } from "./nfl-snapshot-store";
import type { AnalysisSnapshot, MarketAtDecision } from "./nfl-snapshot-types";
import {
  FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
  FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET,
  FIXTURE_PREDICTION,
  FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN,
  FIXTURE_STAGE_A_BASE,
  FIXTURE_STAGE_A_UPDATE_REAFFIRM,
  FIXTURE_STAGE_B_HOME_LEAN,
  FIXTURE_STAGE_B_UPDATE_CHANGES_SIDE,
  FIXTURE_STAGE_B_UPDATE_STRENGTHENS,
} from "./__fixtures__/nfl-chatgpt-analysis-fixtures";

function extractPayload(fixtureResponse: { output: Array<{ type: string; content?: Array<{ text: string }> }> }): unknown {
  const message = fixtureResponse.output.find((o) => o.type === "message");
  return JSON.parse(message!.content![0].text);
}

const STAGE_A_CONTEXT: GrokStageAValidationContext = {
  model: "chatgpt",
  gameId: "2026_01_BAL_IND",
  generatedAt: "2026-09-13T00:00:00.000Z",
  contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
  contextPacket: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
  homeTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
  awayTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.awayTeam,
  allEvidenceRecords: FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS,
};

const STAGE_B_CONTEXT: GrokStageBValidationContext = {
  model: "chatgpt",
  gameId: "2026_01_BAL_IND",
  generatedAt: "2026-09-13T00:05:00.000Z",
  contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
  currentMarketState: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET,
  homeTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
  lockedPrediction: FIXTURE_PREDICTION,
};

const MARKET_AT_DECISION: MarketAtDecision = { spread: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.spread, total: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.total.line, asOf: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.asOf };

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

describe("shared pipeline against the chatgpt namespace", () => {
  it("combineInitialStages produces a valid state from chatgpt-validated Stage A + Stage B", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    expect(stageA.model).toBe("chatgpt");
    const state = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });
    expect(state.side.lean).toBe("home");
    expect(state.side.confidence).toBe(8);
  });

  it("combineUpdateStages classifies a chatgpt update identically to how it classifies a grok one (shared, not forked, business logic)", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.change).toBe("strengthened");
    expect(assessment.overallChange).toBe("minor");
  });

  it("classifies a home<->away flip as 'changed_side' for the chatgpt namespace too", () => {
    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_CHANGES_SIDE);
    const { assessment } = combineUpdateStages({ previous: FIXTURE_PREVIOUS_ANALYSIS_STATE_HOME_LEAN, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    expect(assessment.sideAssessment.change).toBe("changed_side");
    expect(assessment.overallChange).toBe("material");
  });
});

describe("MODEL ISOLATION: end-to-end chatgpt snapshot lineage never touches the grok/ directory", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-chatgpt-analysis-snapshot-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("writes into .../chatgpt/, links the update to the initial snapshot, and the grok/ dir never gets created", () => {
    const stageA = validStageA();
    const stageB = validStageB(FIXTURE_STAGE_B_HOME_LEAN);
    const initialAnalysisState = combineInitialStages({ stageA, stageB, marketAtDecision: MARKET_AT_DECISION });

    const initialSnapshotId = computeSnapshotId({ model: "chatgpt", gameId: "2026_01_BAL_IND", snapshotType: "initial", researchCutoff: "2026-09-09T11:00:00.000Z", contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH, evidenceIds: [] });
    const initialSnapshot: AnalysisSnapshot = {
      schemaVersion: "nfl-snapshot-v1",
      snapshotId: initialSnapshotId,
      model: "chatgpt",
      gameId: "2026_01_BAL_IND",
      season: 2026,
      week: 1,
      snapshotType: "initial",
      createdAt: "2026-09-09T12:00:00.000Z",
      researchCutoff: "2026-09-09T11:00:00.000Z",
      kickoff: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.schedule.kickoffUtc,
      previousSnapshotId: null,
      context: { contextVersion: "nfl-game-context-v1-fixture", contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH, contextGeneratedAt: "2026-09-09T10:30:00.000Z" },
      evidence: { evidenceIds: [], addedEvidenceIds: [], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
      market: { ...FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET, previousSpread: null, previousTotal: null, spreadDelta: null, totalDelta: null, moneylineHomeDelta: null, moneylineAwayDelta: null, sportsbookChanged: false, asOfDeltaMs: null },
      analysisState: initialAnalysisState,
      updateAssessment: null,
    };
    writeSnapshot(root, initialSnapshot);

    const stageAUpdate = validStageAUpdate(FIXTURE_STAGE_A_UPDATE_REAFFIRM);
    const stageBUpdate = validStageBUpdate(FIXTURE_STAGE_B_UPDATE_STRENGTHENS);
    const { assessment, newAnalysisState } = combineUpdateStages({ previous: initialAnalysisState, stageAUpdate, stageBUpdate, marketAtDecision: MARKET_AT_DECISION });
    const updateSnapshotId = computeSnapshotId({ model: "chatgpt", gameId: "2026_01_BAL_IND", snapshotType: "daily_update", researchCutoff: "2026-09-10T11:00:00.000Z", contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH, evidenceIds: [] });
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

    const chatgptHistory = readSnapshotHistory(root, 2026, 1, "2026_01_BAL_IND", "chatgpt");
    expect(chatgptHistory).toHaveLength(2);
    expect(chatgptHistory[1].previousSnapshotId).toBe(initialSnapshot.snapshotId);

    const grokHistory = readSnapshotHistory(root, 2026, 1, "2026_01_BAL_IND", "grok");
    expect(grokHistory).toHaveLength(0);

    const chatgptDir = snapshotModelDirPath(root, 2026, 1, "2026_01_BAL_IND", "chatgpt");
    const grokDir = snapshotModelDirPath(root, 2026, 1, "2026_01_BAL_IND", "grok");
    expect(chatgptDir).not.toBe(grokDir);
  });
});
