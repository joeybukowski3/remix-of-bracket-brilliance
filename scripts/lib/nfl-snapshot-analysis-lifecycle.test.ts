/**
 * WU4.4.2 -- tests for deterministic analysis-lifecycle bookkeeping
 * (nfl-snapshot-analysis-lifecycle.ts) and its wiring into the snapshot
 * store's history index / update-mode guard (nfl-snapshot-store.ts).
 *
 * Fixture chain mirrors the real live ChatGPT lineage this WU was written
 * against: two research-only snapshots (analysisState: null) followed by
 * the first-ever analysis-bearing snapshot, followed by a later update.
 * Every fixture value is synthetic -- see nfl-snapshot-fixtures.ts's header
 * for the same disclaimer pattern.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeAnalysisLifecycleTimeline, resolvePreviousAnalysisSnapshot } from "./nfl-snapshot-analysis-lifecycle";
import { readPreviousAnalysisSnapshot, readSnapshotHistory, readSnapshotHistoryIndex, writeSnapshot } from "./nfl-snapshot-store";
import type { AnalysisSnapshot, SnapshotModel } from "./nfl-snapshot-types";

const GAME_ID = "2026_01_BAL_IND";
const SEASON = 2026;
const WEEK = 1;
const KICKOFF = "2026-09-13T17:00:00.000Z";

function baseSnapshot(model: SnapshotModel, overrides: Partial<AnalysisSnapshot>): AnalysisSnapshot {
  return {
    schemaVersion: "nfl-snapshot-v1",
    snapshotId: `${model}-${GAME_ID}-fixture-${Math.random()}`,
    model,
    gameId: GAME_ID,
    season: SEASON,
    week: WEEK,
    snapshotType: "initial",
    createdAt: "2026-09-09T12:00:00.000Z",
    researchCutoff: "2026-09-09T11:00:00.000Z",
    kickoff: KICKOFF,
    previousSnapshotId: null,
    context: { contextVersion: "nfl-game-context-v1-fixture", contextHash: "fixturehash", contextGeneratedAt: "2026-09-09T10:30:00.000Z" },
    evidence: { evidenceIds: [], addedEvidenceIds: [], supersededEvidenceIds: [], conflictingEvidenceIds: [] },
    market: {
      sportsbook: "draftkings",
      spread: { homeLine: 3.5, awayLine: -3.5 },
      total: { line: 47.5 },
      moneyline: null,
      asOf: "2026-09-09T10:00:00.000Z",
      previousSpread: null,
      previousTotal: null,
      spreadDelta: null,
      totalDelta: null,
      moneylineHomeDelta: null,
      moneylineAwayDelta: null,
      sportsbookChanged: false,
      asOfDeltaMs: null,
    },
    analysisState: null,
    updateAssessment: null,
    ...overrides,
  };
}

function buildChain(model: SnapshotModel) {
  const research1 = baseSnapshot(model, {
    snapshotId: `${model}-${GAME_ID}-initial-research1`,
    snapshotType: "initial",
    createdAt: "2026-09-09T12:00:00.000Z",
  });
  const research2 = baseSnapshot(model, {
    snapshotId: `${model}-${GAME_ID}-daily_update-research2`,
    snapshotType: "daily_update",
    createdAt: "2026-09-10T12:00:00.000Z",
    previousSnapshotId: research1.snapshotId,
  });
  const firstAnalysis = baseSnapshot(model, {
    snapshotId: `${model}-${GAME_ID}-daily_update-firstanalysis`,
    snapshotType: "daily_update",
    createdAt: "2026-09-11T14:00:00.000Z",
    previousSnapshotId: research2.snapshotId,
    analysisState: { thesis: "First real handicap.", side: { lean: "home", confidence: 6, spreadLineAtOpinion: { homeLine: 3.5, awayLine: -3.5 } }, total: { lean: "over", confidence: 5, totalLineAtOpinion: 47.5 } },
  });
  const laterUpdate = baseSnapshot(model, {
    snapshotId: `${model}-${GAME_ID}-daily_update-laterupdate`,
    snapshotType: "daily_update",
    createdAt: "2026-09-12T14:00:00.000Z",
    previousSnapshotId: firstAnalysis.snapshotId,
    analysisState: { thesis: "Updated handicap.", side: { lean: "home", confidence: 7, spreadLineAtOpinion: { homeLine: 3, awayLine: -3 } }, total: { lean: "over", confidence: 6, totalLineAtOpinion: 47.5 } },
  });
  return { research1, research2, firstAnalysis, laterUpdate };
}

describe("computeAnalysisLifecycleTimeline", () => {
  it("1. research-only snapshots before analysis are valid and stay not_started", () => {
    const { research1, research2 } = buildChain("chatgpt");
    const timeline = computeAnalysisLifecycleTimeline([research1, research2]);
    expect(timeline.get(research1.snapshotId)).toEqual({ state: "not_started", firstAnalysisSnapshotId: null, firstAnalysisGeneratedAt: null });
    expect(timeline.get(research2.snapshotId)).toEqual({ state: "not_started", firstAnalysisSnapshotId: null, firstAnalysisGeneratedAt: null });
  });

  it("2. the first snapshot after research-only daily updates that carries analysisState is marked initial", () => {
    const { research1, research2, firstAnalysis } = buildChain("chatgpt");
    const timeline = computeAnalysisLifecycleTimeline([research1, research2, firstAnalysis]);
    expect(timeline.get(firstAnalysis.snapshotId)?.state).toBe("initial");
    // Its own snapshotType is "daily_update" -- lifecycle state is independent of cadence type.
    expect(firstAnalysis.snapshotType).toBe("daily_update");
  });

  it("3. a prior null analysisState is never treated as a prior opinion", () => {
    const { research1, research2, firstAnalysis } = buildChain("chatgpt");
    const timeline = computeAnalysisLifecycleTimeline([research1, research2, firstAnalysis]);
    expect(timeline.get(firstAnalysis.snapshotId)?.firstAnalysisSnapshotId).toBe(firstAnalysis.snapshotId);
    expect(resolvePreviousAnalysisSnapshot([research1, research2])).toBeNull();
  });

  it("4. firstAnalysisSnapshotId is deterministic and preserved across later updates", () => {
    const { research1, research2, firstAnalysis, laterUpdate } = buildChain("chatgpt");
    const timeline = computeAnalysisLifecycleTimeline([research1, research2, firstAnalysis, laterUpdate]);
    expect(timeline.get(laterUpdate.snapshotId)?.firstAnalysisSnapshotId).toBe(firstAnalysis.snapshotId);
  });

  it("5. firstAnalysisGeneratedAt is preserved as the first analysis snapshot's own createdAt", () => {
    const { research1, research2, firstAnalysis, laterUpdate } = buildChain("chatgpt");
    const timeline = computeAnalysisLifecycleTimeline([research1, research2, firstAnalysis, laterUpdate]);
    expect(timeline.get(laterUpdate.snapshotId)?.firstAnalysisGeneratedAt).toBe(firstAnalysis.createdAt);
    expect(timeline.get(laterUpdate.snapshotId)?.firstAnalysisGeneratedAt).not.toBe(laterUpdate.createdAt);
  });

  it("6. a later update resolves the correct prior analysis snapshot, marked as update", () => {
    const { research1, research2, firstAnalysis, laterUpdate } = buildChain("chatgpt");
    const resolved = resolvePreviousAnalysisSnapshot([research1, research2, firstAnalysis]);
    expect(resolved?.snapshotId).toBe(firstAnalysis.snapshotId);
    const timeline = computeAnalysisLifecycleTimeline([research1, research2, firstAnalysis, laterUpdate]);
    expect(timeline.get(laterUpdate.snapshotId)?.state).toBe("update");
  });
});

describe("snapshot store wiring: history index + update-mode guard", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nfl-snapshot-lifecycle-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("7. writing later snapshots never mutates an earlier research-only snapshot on disk", () => {
    const { research1, research2, firstAnalysis } = buildChain("chatgpt");
    writeSnapshot(root, research1);
    writeSnapshot(root, research2);
    const beforeResearch1 = JSON.stringify(research1);
    const beforeResearch2 = JSON.stringify(research2);
    writeSnapshot(root, firstAnalysis);

    const history = readSnapshotHistory(root, SEASON, WEEK, GAME_ID, "chatgpt");
    const readBackResearch1 = history.find((s) => s.snapshotId === research1.snapshotId)!;
    const readBackResearch2 = history.find((s) => s.snapshotId === research2.snapshotId)!;
    expect(readBackResearch1.analysisState).toBeNull();
    expect(readBackResearch2.analysisState).toBeNull();
    expect(JSON.stringify(research1)).toBe(beforeResearch1);
    expect(JSON.stringify(research2)).toBe(beforeResearch2);
  });

  it("history.json index marks the first analysis-bearing row 'initial' and the live-case lineage matches the real bug report", () => {
    const { research1, research2, firstAnalysis } = buildChain("chatgpt");
    writeSnapshot(root, research1);
    writeSnapshot(root, research2);
    writeSnapshot(root, firstAnalysis);

    const index = readSnapshotHistoryIndex(root, SEASON, WEEK, GAME_ID, "chatgpt");
    expect(index.map((row) => ({ id: row.snapshotId, state: row.analysisLifecycleState, hasAnalysis: row.hasAnalysis }))).toEqual([
      { id: research1.snapshotId, state: "not_started", hasAnalysis: false },
      { id: research2.snapshotId, state: "not_started", hasAnalysis: false },
      { id: firstAnalysis.snapshotId, state: "initial", hasAnalysis: true },
    ]);
    expect(index[2].firstAnalysisSnapshotId).toBe(firstAnalysis.snapshotId);
    expect(index[2].firstAnalysisGeneratedAt).toBe(firstAnalysis.createdAt);
  });

  it("readPreviousAnalysisSnapshot resolves the first analysis-bearing snapshot even when it is also the latest snapshot (today's live case)", () => {
    const { research1, research2, firstAnalysis } = buildChain("chatgpt");
    writeSnapshot(root, research1);
    writeSnapshot(root, research2);
    writeSnapshot(root, firstAnalysis);

    const resolved = readPreviousAnalysisSnapshot(root, SEASON, WEEK, GAME_ID, "chatgpt");
    expect(resolved?.snapshotId).toBe(firstAnalysis.snapshotId);
  });

  it("readPreviousAnalysisSnapshot returns null (update mode must refuse) when only research-only snapshots exist", () => {
    const { research1, research2 } = buildChain("chatgpt");
    writeSnapshot(root, research1);
    writeSnapshot(root, research2);
    expect(readPreviousAnalysisSnapshot(root, SEASON, WEEK, GAME_ID, "chatgpt")).toBeNull();
  });

  it("8. ChatGPT/Grok isolation remains intact -- resolving ChatGPT's previous-analysis snapshot never returns Grok's, even when Grok already has analysis and ChatGPT does not", () => {
    const grok = buildChain("grok");
    const chatgpt = buildChain("chatgpt");
    writeSnapshot(root, grok.research1);
    writeSnapshot(root, grok.research2);
    writeSnapshot(root, grok.firstAnalysis); // Grok already has an opinion.
    writeSnapshot(root, chatgpt.research1);
    writeSnapshot(root, chatgpt.research2); // ChatGPT does not yet.

    expect(readPreviousAnalysisSnapshot(root, SEASON, WEEK, GAME_ID, "chatgpt")).toBeNull();
    const grokResolved = readPreviousAnalysisSnapshot(root, SEASON, WEEK, GAME_ID, "grok");
    expect(grokResolved?.snapshotId).toBe(grok.firstAnalysis.snapshotId);
    expect(JSON.stringify(grokResolved)).not.toContain(chatgpt.research1.snapshotId);
  });
});
