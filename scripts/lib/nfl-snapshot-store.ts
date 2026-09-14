/**
 * WU3.2 -- append-only, model-isolated storage for AnalysisSnapshot history.
 *
 * Layout (mirrors the WU2 evidence store's per-(season,week,gameId,model)
 * directory convention, scripts/lib/nfl-evidence-store.ts):
 *
 *   data/nfl/analysis/<season>/<week>/<gameId>/<model>/snapshots/<snapshotId>.json
 *   data/nfl/analysis/<season>/<week>/<gameId>/<model>/latest.json   (derived pointer)
 *   data/nfl/analysis/<season>/<week>/<gameId>/<model>/history.json  (derived index)
 *
 * Individual snapshot files under snapshots/ are the canonical historical
 * record and are NEVER rewritten once written (writeSnapshot() throws if a
 * write would change an existing snapshotId's content). latest.json and
 * history.json are rebuilt wholesale on every write -- they are indexes,
 * never the source of truth.
 *
 * Model isolation is enforced twice: physically (grok/chatgpt are separate
 * directories -- no function here ever reads both for one call) and
 * defensively (every read validates snapshot.model against the model the
 * caller asked for, so a misplaced/corrupted file is a hard error, not a
 * silent cross-model leak).
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite, canonicalJson, contentHash, type JsonValue } from "./nfl-production-prediction-archive";
import { computeAnalysisLifecycleTimeline, resolveLatestWu46CompatibleAnalysisSnapshot, resolvePreviousAnalysisSnapshot, type AnalysisLifecycleState } from "./nfl-snapshot-analysis-lifecycle";
import type { AnalysisSnapshot, OverallChange, SideLean, SnapshotModel, SnapshotType, TotalLean } from "./nfl-snapshot-types";

export function snapshotModelDirPath(root: string, season: number, week: number, gameId: string, model: SnapshotModel): string {
  return join(root, "data", "nfl", "analysis", String(season), String(week), gameId, model);
}

function snapshotsDirPath(root: string, season: number, week: number, gameId: string, model: SnapshotModel): string {
  return join(snapshotModelDirPath(root, season, week, gameId, model), "snapshots");
}

export function snapshotFilePath(root: string, season: number, week: number, gameId: string, model: SnapshotModel, snapshotId: string): string {
  return join(snapshotsDirPath(root, season, week, gameId, model), `${snapshotId}.json`);
}

function latestFilePath(root: string, season: number, week: number, gameId: string, model: SnapshotModel): string {
  return join(snapshotModelDirPath(root, season, week, gameId, model), "latest.json");
}

function historyFilePath(root: string, season: number, week: number, gameId: string, model: SnapshotModel): string {
  return join(snapshotModelDirPath(root, season, week, gameId, model), "history.json");
}

/**
 * Deterministic snapshot ID: a content hash over the fields that identify
 * WHAT this snapshot is (model, game, type, research cutoff, the exact
 * context version it was built against, and the full evidence-id set),
 * never a random/opaque value. Deliberately excludes `createdAt` -- two
 * snapshots built from identical inputs at slightly different wall-clock
 * moments are the same snapshot.
 */
export function computeSnapshotId(input: {
  model: SnapshotModel;
  gameId: string;
  snapshotType: SnapshotType;
  researchCutoff: string;
  contextHash: string;
  evidenceIds: readonly string[];
}): string {
  const key = {
    model: input.model,
    gameId: input.gameId,
    snapshotType: input.snapshotType,
    researchCutoff: input.researchCutoff,
    contextHash: input.contextHash,
    evidenceIds: [...input.evidenceIds].sort(),
  };
  return `${input.model}-${input.gameId}-${input.snapshotType}-${contentHash(key as unknown as JsonValue).slice(0, 16)}`;
}

function assertSnapshotModelMatches(snapshot: AnalysisSnapshot, expectedModel: SnapshotModel, sourcePath: string): void {
  if (snapshot.model !== expectedModel) {
    throw new Error(
      `Model isolation violation: expected a "${expectedModel}" snapshot but read a "${snapshot.model}" snapshot from ${sourcePath}. ` +
        `Grok and ChatGPT snapshot streams must never be cross-loaded.`
    );
  }
}

export interface SnapshotHistoryEntry {
  snapshotId: string;
  createdAt: string;
  researchCutoff: string;
  snapshotType: SnapshotType;
  marketSpreadHomeLine: number | null;
  marketTotalLine: number | null;
  sideLean: SideLean | null;
  totalLean: TotalLean | null;
  sideConfidence: number | null;
  totalConfidence: number | null;
  overallChange: OverallChange | null;
  previousSnapshotId: string | null;
  /** Whether THIS snapshot itself carries a non-null analysisState -- a research-only snapshot has hasAnalysis:false regardless of what came later. */
  hasAnalysis: boolean;
  /** See nfl-snapshot-analysis-lifecycle.ts. Distinct from `snapshotType`: the first analysis-bearing snapshot in a chain is "initial" here even when its own snapshotType is "daily_update" (WU4.4.2). */
  analysisLifecycleState: AnalysisLifecycleState;
  /** The chain's first analysis-bearing snapshotId as of THIS row, or null if no analysis has started yet. */
  firstAnalysisSnapshotId: string | null;
  /** That first analysis-bearing snapshot's own createdAt, or null if no analysis has started yet. */
  firstAnalysisGeneratedAt: string | null;
}

function toHistoryEntry(snapshot: AnalysisSnapshot, lifecycle: { state: AnalysisLifecycleState; firstAnalysisSnapshotId: string | null; firstAnalysisGeneratedAt: string | null }): SnapshotHistoryEntry {
  return {
    snapshotId: snapshot.snapshotId,
    createdAt: snapshot.createdAt,
    researchCutoff: snapshot.researchCutoff,
    snapshotType: snapshot.snapshotType,
    marketSpreadHomeLine: snapshot.market.spread.homeLine,
    marketTotalLine: snapshot.market.total.line,
    sideLean: snapshot.analysisState?.side.lean ?? null,
    totalLean: snapshot.analysisState?.total.lean ?? null,
    sideConfidence: snapshot.analysisState?.side.confidence ?? null,
    totalConfidence: snapshot.analysisState?.total.confidence ?? null,
    overallChange: snapshot.updateAssessment?.overallChange ?? null,
    previousSnapshotId: snapshot.previousSnapshotId,
    hasAnalysis: snapshot.analysisState !== null,
    analysisLifecycleState: lifecycle.state,
    firstAnalysisSnapshotId: lifecycle.firstAnalysisSnapshotId,
    firstAnalysisGeneratedAt: lifecycle.firstAnalysisGeneratedAt,
  };
}

function toHistoryEntries(snapshots: readonly AnalysisSnapshot[]): SnapshotHistoryEntry[] {
  const timeline = computeAnalysisLifecycleTimeline(snapshots);
  return snapshots.map((snapshot) => toHistoryEntry(snapshot, timeline.get(snapshot.snapshotId)!));
}

function readAllSnapshotsFromDisk(root: string, season: number, week: number, gameId: string, model: SnapshotModel): AnalysisSnapshot[] {
  const dir = snapshotsDirPath(root, season, week, gameId, model);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  const snapshots = files.map((name) => {
    const filePath = join(dir, name);
    const snapshot = JSON.parse(readFileSync(filePath, "utf8")) as AnalysisSnapshot;
    assertSnapshotModelMatches(snapshot, model, filePath);
    return snapshot;
  });
  return snapshots.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * Writes ONE new snapshot, append-only. Idempotent for an exact re-write of
 * the same snapshotId with byte-identical content; throws if an existing
 * snapshotId's file would change -- prior snapshots are immutable, full
 * stop. Rebuilds history.json/latest.json (both derived) after a
 * successful write.
 */
export function writeSnapshot(root: string, snapshot: AnalysisSnapshot): void {
  const filePath = snapshotFilePath(root, snapshot.season, snapshot.week, snapshot.gameId, snapshot.model, snapshot.snapshotId);
  const nextContent = `${canonicalJson(snapshot as unknown as JsonValue)}\n`;

  if (existsSync(filePath)) {
    const existingContent = readFileSync(filePath, "utf8");
    if (existingContent !== nextContent) {
      throw new Error(`Immutable snapshot violation: snapshotId "${snapshot.snapshotId}" already exists at ${filePath} with different content. Prior snapshots can never be rewritten.`);
    }
    return; // exact re-write -- no-op, not an error
  }

  mkdirSync(snapshotsDirPath(root, snapshot.season, snapshot.week, snapshot.gameId, snapshot.model), { recursive: true });
  atomicWrite(filePath, nextContent);

  const allSnapshots = readAllSnapshotsFromDisk(root, snapshot.season, snapshot.week, snapshot.gameId, snapshot.model);
  const history = toHistoryEntries(allSnapshots);
  atomicWrite(historyFilePath(root, snapshot.season, snapshot.week, snapshot.gameId, snapshot.model), `${canonicalJson(history as unknown as JsonValue)}\n`);

  const latest = allSnapshots[allSnapshots.length - 1];
  atomicWrite(latestFilePath(root, snapshot.season, snapshot.week, snapshot.gameId, snapshot.model), `${canonicalJson({ snapshotId: latest.snapshotId } as unknown as JsonValue)}\n`);
}

/**
 * Rebuilds ONLY the derived history.json index from the immutable snapshot
 * files on disk -- no snapshot content changes. Safe to call any time (e.g.
 * to backfill newly-added index fields such as analysisLifecycleState onto
 * an already-written chain, WU4.4.2); a no-op if there are no snapshots yet.
 */
export function rebuildSnapshotHistoryIndex(root: string, season: number, week: number, gameId: string, model: SnapshotModel): void {
  const allSnapshots = readAllSnapshotsFromDisk(root, season, week, gameId, model);
  if (allSnapshots.length === 0) return;
  const history = toHistoryEntries(allSnapshots);
  atomicWrite(historyFilePath(root, season, week, gameId, model), `${canonicalJson(history as unknown as JsonValue)}\n`);
}

/** Full, immutable snapshot history for ONE model's stream. Never merges/accepts the other model's snapshots -- see assertSnapshotModelMatches(). */
export function readSnapshotHistory(root: string, season: number, week: number, gameId: string, model: SnapshotModel): AnalysisSnapshot[] {
  return readAllSnapshotsFromDisk(root, season, week, gameId, model);
}

/** The derived history INDEX (lightweight rows, see SnapshotHistoryEntry) -- reads history.json if present, else rebuilds it from disk without writing. */
export function readSnapshotHistoryIndex(root: string, season: number, week: number, gameId: string, model: SnapshotModel): SnapshotHistoryEntry[] {
  const path = historyFilePath(root, season, week, gameId, model);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as SnapshotHistoryEntry[];
  return toHistoryEntries(readAllSnapshotsFromDisk(root, season, week, gameId, model));
}

/**
 * The UPDATE MODE GUARD (WU4.4.2): the snapshot an update/delta pass must
 * diff its proposal against -- the latest snapshot in this model's chain
 * with a non-null analysisState, never simply readLatestSnapshot()'s
 * result, which may be a research-only snapshot. Returns null (caller must
 * refuse to run update mode) if no snapshot has ever carried an opinion.
 */
export function readPreviousAnalysisSnapshot(root: string, season: number, week: number, gameId: string, model: SnapshotModel): AnalysisSnapshot | null {
  return resolvePreviousAnalysisSnapshot(readAllSnapshotsFromDisk(root, season, week, gameId, model));
}

/**
 * WU4.6.1 -- the public AI Picks presentation's resolver: the latest
 * snapshot in this model's chain whose analysisState is WU4.6-compatible
 * (carries both blindPrediction and marketDecision). Distinct from
 * readPreviousAnalysisSnapshot() above, which is the update-mode guard and
 * deliberately accepts ANY analysis-bearing snapshot (including legacy
 * pre-WU4.6 ones) because a delta pass needs the most recent opinion of any
 * shape to diff against. The public card must never do that -- see
 * scripts/generate-nfl-ai-handicap-presentation.ts.
 */
export function readLatestWu46CompatibleAnalysisSnapshot(root: string, season: number, week: number, gameId: string, model: SnapshotModel): AnalysisSnapshot | null {
  return resolveLatestWu46CompatibleAnalysisSnapshot(readAllSnapshotsFromDisk(root, season, week, gameId, model));
}

/** The most recent snapshot in this model's stream, or null if none exists yet. */
export function readLatestSnapshot(root: string, season: number, week: number, gameId: string, model: SnapshotModel): AnalysisSnapshot | null {
  const path = latestFilePath(root, season, week, gameId, model);
  let snapshotId: string | null = null;
  if (existsSync(path)) {
    snapshotId = (JSON.parse(readFileSync(path, "utf8")) as { snapshotId: string }).snapshotId;
  } else {
    const all = readAllSnapshotsFromDisk(root, season, week, gameId, model);
    snapshotId = all.length > 0 ? all[all.length - 1].snapshotId : null;
  }
  if (!snapshotId) return null;
  const filePath = snapshotFilePath(root, season, week, gameId, model, snapshotId);
  if (!existsSync(filePath)) return null;
  const snapshot = JSON.parse(readFileSync(filePath, "utf8")) as AnalysisSnapshot;
  assertSnapshotModelMatches(snapshot, model, filePath);
  return snapshot;
}
