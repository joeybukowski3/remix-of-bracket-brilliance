/**
 * WU4.4 -- MODEL ISOLATION test suite. Proves, with a real (temp-dir)
 * snapshot store containing BOTH a grok/ and a chatgpt/ lineage for the
 * SAME game, that:
 *   1. Reading the "previous snapshot" for model:"chatgpt" never resolves
 *      into the grok/ directory, even though grok/ has real, non-null
 *      analysisState data for the identical gameId/season/week.
 *   2. A ChatGPT update assessment built from that read previous state
 *      only ever reflects ChatGPT's own prior opinion (thesis/side/total),
 *      never Grok's.
 *   3. The shared validator (exercised via nfl-chatgpt-analysis-validator.test.ts
 *      and nfl-grok-analysis-validator.test.ts) independently enforces that
 *      a chatgpt-model analysis cannot cite a grok-model evidenceId -- this
 *      suite adds the snapshot/filesystem-layer half of that isolation
 *      guarantee, which the validator alone cannot prove.
 *
 * WU4.6 -- updated for the two-stage (Stage A blind projection / Stage B
 * market decision) split.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { combineUpdateStages } from "./nfl-grok-analysis-pipeline";
import { validateGrokStageA, validateGrokStageAUpdate, validateGrokStageBUpdate, type GrokStageBValidationContext } from "./nfl-grok-analysis-validator";
import { readLatestSnapshot, snapshotModelDirPath, writeSnapshot } from "./nfl-snapshot-store";
import type { AnalysisSnapshot } from "./nfl-snapshot-types";
import {
  FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_ANALYSIS_CONTEXT_HASH,
  FIXTURE_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_ANALYSIS_CURRENT_MARKET,
  FIXTURE_STAGE_A_BASE as GROK_FIXTURE_A,
} from "./__fixtures__/nfl-grok-analysis-fixtures";
import {
  FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS,
  FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
  FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
  FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET,
  FIXTURE_PREDICTION as CHATGPT_PREDICTION,
  FIXTURE_STAGE_A_BASE as CHATGPT_FIXTURE_A,
  FIXTURE_STAGE_A_UPDATE_REAFFIRM as CHATGPT_STAGE_A_UPDATE_REAFFIRM,
  FIXTURE_STAGE_B_UPDATE_STRENGTHENS as CHATGPT_UPDATE_STRENGTHENS,
} from "./__fixtures__/nfl-chatgpt-analysis-fixtures";

function extractPayload(fixtureResponse: { output: Array<{ type: string; content?: Array<{ text: string }> }> }): unknown {
  const message = fixtureResponse.output.find((o) => o.type === "message");
  return JSON.parse(message!.content![0].text);
}

const GAME_ID = "2026_01_BAL_IND";
const SEASON = 2026;
const WEEK = 1;

function buildInitialSnapshot(model: "grok" | "chatgpt", thesis: string, sideLean: "home" | "away", contextHash: string, kickoffUtc: string, currentMarket: typeof FIXTURE_ANALYSIS_CURRENT_MARKET): AnalysisSnapshot {
  return {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId: `${model}-${GAME_ID}-initial-fixture`,
    model,
    gameId: GAME_ID,
    season: SEASON,
    week: WEEK,
    snapshotType: "initial",
    createdAt: "2026-09-09T12:00:00.000Z",
    researchCutoff: "2026-09-09T11:00:00.000Z",
    kickoff: kickoffUtc,
    previousSnapshotId: null,
    context: { contextVersion: "nfl-game-context-v1-fixture", contextHash, contextGeneratedAt: "2026-09-09T10:30:00.000Z" },
    evidence: { evidenceIds: [], addedEvidenceIds: [], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
    market: { ...currentMarket, previousSpread: null, previousTotal: null, spreadDelta: null, totalDelta: null, moneylineHomeDelta: null, moneylineAwayDelta: null, sportsbookChanged: false, asOfDeltaMs: null },
    analysisState: { thesis, side: { lean: sideLean, confidence: 7, spreadLineAtOpinion: { homeLine: currentMarket.spread.homeLine!, awayLine: currentMarket.spread.awayLine! } }, total: { lean: "undecided", confidence: null, totalLineAtOpinion: null } },
    updateAssessment: null,
  };
}

describe("MODEL ISOLATION -- chatgpt snapshot reads never resolve grok state", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-analysis-isolation-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("readLatestSnapshot(model:'chatgpt') returns ChatGPT's own thesis/lean, never Grok's, even though both lineages exist for the same game", () => {
    const grokInitial = buildInitialSnapshot("grok", "GROK-ONLY thesis: Ravens are live on the road.", "away", FIXTURE_ANALYSIS_CONTEXT_HASH, FIXTURE_ANALYSIS_CONTEXT_PACKET.schedule.kickoffUtc, FIXTURE_ANALYSIS_CURRENT_MARKET);
    const chatgptInitial = buildInitialSnapshot("chatgpt", "CHATGPT-ONLY thesis: Colts are live at home.", "home", FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.schedule.kickoffUtc, FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET);

    writeSnapshot(root, grokInitial);
    writeSnapshot(root, chatgptInitial);

    const readBack = readLatestSnapshot(root, SEASON, WEEK, GAME_ID, "chatgpt");
    expect(readBack).not.toBeNull();
    expect(readBack!.model).toBe("chatgpt");
    expect(readBack!.analysisState?.thesis).toBe("CHATGPT-ONLY thesis: Colts are live at home.");
    expect(readBack!.analysisState?.side.lean).toBe("home");
    // The critical isolation assertion: nothing about Grok's thesis or lean leaked into the chatgpt read.
    expect(readBack!.analysisState?.thesis).not.toContain("GROK-ONLY");
    expect(JSON.stringify(readBack)).not.toContain("Ravens are live on the road");
  });

  it("16. a ChatGPT update assessment built from that read previous state only reflects ChatGPT's own prior opinion", () => {
    const grokInitial = buildInitialSnapshot("grok", "GROK-ONLY thesis.", "away", FIXTURE_ANALYSIS_CONTEXT_HASH, FIXTURE_ANALYSIS_CONTEXT_PACKET.schedule.kickoffUtc, FIXTURE_ANALYSIS_CURRENT_MARKET);
    const chatgptInitial = buildInitialSnapshot("chatgpt", "CHATGPT-ONLY thesis.", "home", FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH, FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.schedule.kickoffUtc, FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET);
    writeSnapshot(root, grokInitial);
    writeSnapshot(root, chatgptInitial);

    const previous = readLatestSnapshot(root, SEASON, WEEK, GAME_ID, "chatgpt")!;
    expect(previous.analysisState).not.toBeNull();

    const stageAContext = {
      model: "chatgpt" as const,
      gameId: GAME_ID,
      generatedAt: "2026-09-13T00:00:00.000Z",
      contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
      contextPacket: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
      homeTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
      awayTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.awayTeam,
      allEvidenceRecords: FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS,
    };
    const stageAUpdate = validateGrokStageAUpdate(extractPayload(CHATGPT_STAGE_A_UPDATE_REAFFIRM), stageAContext);
    if (!stageAUpdate.ok) throw new Error(`fixture failed to validate: ${stageAUpdate.reasons.join("; ")}`);

    const stageBContext: GrokStageBValidationContext = {
      model: "chatgpt",
      gameId: GAME_ID,
      generatedAt: "2026-09-13T00:05:00.000Z",
      contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
      currentMarketState: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET,
      homeTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
      lockedPrediction: CHATGPT_PREDICTION,
    };
    const stageBUpdate = validateGrokStageBUpdate(extractPayload(CHATGPT_UPDATE_STRENGTHENS), stageBContext);
    if (!stageBUpdate.ok) throw new Error(`fixture failed to validate: ${stageBUpdate.reasons.join("; ")}`);

    const marketAtDecision = { spread: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.spread, total: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.total.line, asOf: FIXTURE_CHATGPT_ANALYSIS_CURRENT_MARKET.asOf };
    const { assessment } = combineUpdateStages({ previous: previous.analysisState!, stageAUpdate: stageAUpdate.proposal, stageBUpdate: stageBUpdate.proposal, marketAtDecision });
    // previousLean/previousConfidence must reflect ChatGPT's own prior state, sourced from the chatgpt-only read above.
    expect(assessment.sideAssessment.previousLean).toBe("home");
    expect(assessment.thesisAssessment.explanation).toBeDefined();
    expect(JSON.stringify(assessment)).not.toContain("GROK-ONLY");
  });

  it("snapshotModelDirPath resolves grok and chatgpt to physically distinct directories for the identical game/season/week", () => {
    const grokDir = snapshotModelDirPath(root, SEASON, WEEK, GAME_ID, "grok");
    const chatgptDir = snapshotModelDirPath(root, SEASON, WEEK, GAME_ID, "chatgpt");
    expect(grokDir).not.toBe(chatgptDir);
    expect(grokDir.endsWith(join("grok"))).toBe(true);
    expect(chatgptDir.endsWith(join("chatgpt"))).toBe(true);
  });
});

describe("MODEL ISOLATION -- the shared validator, exercised with model:'chatgpt', independently blocks Grok evidenceId citation", () => {
  it("cannot validate a chatgpt Stage A that cites a grok-namespace evidenceId (cross-check against nfl-chatgpt-analysis-validator.test.ts's dedicated coverage)", () => {
    const grokOnlyId = FIXTURE_ANALYSIS_ALL_EVIDENCE_RECORDS.find((r) => r.model === "grok")!.evidenceId;
    const payload = extractPayload(CHATGPT_FIXTURE_A) as Record<string, unknown>;
    const bad = { ...payload, evidenceIdsUsed: [grokOnlyId] };
    const result = validateGrokStageA(bad, {
      model: "chatgpt",
      gameId: GAME_ID,
      generatedAt: "2026-09-13T00:00:00.000Z",
      contextHash: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_HASH,
      contextPacket: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET,
      homeTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.homeTeam,
      awayTeam: FIXTURE_CHATGPT_ANALYSIS_CONTEXT_PACKET.identity.awayTeam,
      // Deliberately supply ONLY the chatgpt-namespace evidence records (never mixing in Grok's real
      // evidence store) -- exactly as a real pipeline run would: nfl-chatgpt-analysis-adapter.ts's
      // buildCitableEvidenceLines only ever receives the chatgpt evidence artifact, not Grok's.
      allEvidenceRecords: FIXTURE_CHATGPT_ANALYSIS_ALL_EVIDENCE_RECORDS,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/does not exist in the supplied Chatgpt evidence set/);
  });

  it("acknowledges GROK_FIXTURE_A exists purely to prove the two fixture sets are independently sourced (sanity import check)", () => {
    expect(extractPayload(GROK_FIXTURE_A)).toHaveProperty("model", "grok");
  });
});
