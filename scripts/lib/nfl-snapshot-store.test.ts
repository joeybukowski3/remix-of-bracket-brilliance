import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeSnapshotId, readLatestSnapshot, readSnapshotHistory, readSnapshotHistoryIndex, snapshotModelDirPath, writeSnapshot } from "./nfl-snapshot-store";
import {
  FIXTURE_SNAPSHOT_GAME_ID,
  FIXTURE_SNAPSHOT_SEASON,
  FIXTURE_SNAPSHOT_WEEK,
  SNAPSHOT_A_INITIAL,
  SNAPSHOT_B_DAILY_UPDATE,
  SNAPSHOT_C_NO_MATERIAL_CHANGE,
} from "./__fixtures__/nfl-snapshot-fixtures";
import type { AnalysisSnapshot } from "./nfl-snapshot-types";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nfl-snapshot-store-"));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

function chatgptMirror(snapshot: AnalysisSnapshot): AnalysisSnapshot {
  return { ...snapshot, model: "chatgpt", snapshotId: snapshot.snapshotId.replace(/^grok-/, "chatgpt-") };
}

describe("computeSnapshotId", () => {
  it("18. is deterministic for identical inputs", () => {
    const input = { model: "grok" as const, gameId: FIXTURE_SNAPSHOT_GAME_ID, snapshotType: "initial" as const, researchCutoff: "2026-09-09T11:00:00.000Z", contextHash: "abc123", evidenceIds: ["e1", "e2"] };
    expect(computeSnapshotId(input)).toBe(computeSnapshotId(input));
  });

  it("is order-independent over evidenceIds", () => {
    const base = { model: "grok" as const, gameId: FIXTURE_SNAPSHOT_GAME_ID, snapshotType: "initial" as const, researchCutoff: "2026-09-09T11:00:00.000Z", contextHash: "abc123" };
    expect(computeSnapshotId({ ...base, evidenceIds: ["e1", "e2"] })).toBe(computeSnapshotId({ ...base, evidenceIds: ["e2", "e1"] }));
  });

  it("changes when any identifying field changes", () => {
    const base = { model: "grok" as const, gameId: FIXTURE_SNAPSHOT_GAME_ID, snapshotType: "initial" as const, researchCutoff: "2026-09-09T11:00:00.000Z", contextHash: "abc123", evidenceIds: ["e1"] };
    expect(computeSnapshotId(base)).not.toBe(computeSnapshotId({ ...base, researchCutoff: "2026-09-10T11:00:00.000Z" }));
  });
});

describe("writeSnapshot / readSnapshotHistory", () => {
  it("1. creates and reads back an initial snapshot", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    const history = readSnapshotHistory(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toBe(SNAPSHOT_A_INITIAL.snapshotId);
    expect(history[0].previousSnapshotId).toBeNull();
  });

  it("2. a daily-update snapshot links to the previous snapshot via previousSnapshotId", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    writeSnapshot(root, SNAPSHOT_B_DAILY_UPDATE);
    const history = readSnapshotHistory(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok");
    expect(history).toHaveLength(2);
    expect(history[1].previousSnapshotId).toBe(SNAPSHOT_A_INITIAL.snapshotId);
  });

  it("19. an existing snapshot file is immutable -- rewriting the same id with different content throws", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    const mutated: AnalysisSnapshot = { ...SNAPSHOT_A_INITIAL, researchCutoff: "2026-09-09T09:00:00.000Z" };
    expect(() => writeSnapshot(root, mutated)).toThrow(/Immutable snapshot violation/);
  });

  it("re-writing the exact same snapshot content is a safe no-op, not an error", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    expect(() => writeSnapshot(root, SNAPSHOT_A_INITIAL)).not.toThrow();
    const history = readSnapshotHistory(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok");
    expect(history).toHaveLength(1);
  });

  it("25. never mutates the deterministic context/market state passed in via the fixture snapshot object", () => {
    const before = JSON.stringify(SNAPSHOT_A_INITIAL);
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    expect(JSON.stringify(SNAPSHOT_A_INITIAL)).toBe(before);
  });
});

describe("model isolation", () => {
  it("3. keeps grok and chatgpt snapshot streams physically separate", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    writeSnapshot(root, chatgptMirror(SNAPSHOT_A_INITIAL));
    const grokHistory = readSnapshotHistory(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok");
    const chatgptHistory = readSnapshotHistory(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "chatgpt");
    expect(grokHistory).toHaveLength(1);
    expect(chatgptHistory).toHaveLength(1);
    expect(grokHistory[0].model).toBe("grok");
    expect(chatgptHistory[0].model).toBe("chatgpt");
  });

  it("23. a function that loads Grok history rejects a ChatGPT-model snapshot found under the grok directory (defense against misplacement/corruption)", () => {
    const grokDir = snapshotModelDirPath(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok");
    mkdirSync(join(grokDir, "snapshots"), { recursive: true });
    const corrupted: AnalysisSnapshot = chatgptMirror(SNAPSHOT_A_INITIAL); // model:"chatgpt", but written to the grok path
    writeFileSync(join(grokDir, "snapshots", `${corrupted.snapshotId}.json`), JSON.stringify(corrupted));

    expect(() => readSnapshotHistory(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok")).toThrow(/Model isolation violation/);
  });

  it("24. ChatGPT's reader never returns a Grok snapshot even if queried for the same game, and rejects one found on disk under its own directory", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    const chatgptHistory = readSnapshotHistory(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "chatgpt");
    expect(chatgptHistory).toHaveLength(0);

    const chatgptDir = snapshotModelDirPath(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "chatgpt");
    mkdirSync(join(chatgptDir, "snapshots"), { recursive: true });
    writeFileSync(join(chatgptDir, "snapshots", `${SNAPSHOT_A_INITIAL.snapshotId}.json`), JSON.stringify(SNAPSHOT_A_INITIAL)); // model:"grok", misplaced under chatgpt
    expect(() => readSnapshotHistory(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "chatgpt")).toThrow(/Model isolation violation/);
  });
});

describe("readSnapshotHistoryIndex / readLatestSnapshot", () => {
  it("22. returns history rows in chronological order with the lightweight index fields", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    writeSnapshot(root, SNAPSHOT_B_DAILY_UPDATE);
    writeSnapshot(root, SNAPSHOT_C_NO_MATERIAL_CHANGE);
    const index = readSnapshotHistoryIndex(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok");
    expect(index.map((row) => row.snapshotId)).toEqual([SNAPSHOT_A_INITIAL.snapshotId, SNAPSHOT_B_DAILY_UPDATE.snapshotId, SNAPSHOT_C_NO_MATERIAL_CHANGE.snapshotId]);
    expect(index[2].overallChange).toBe("none");
    expect(index[1].sideConfidence).toBe(7);
  });

  it("10. the history index preserves each snapshot's own market spread/total exactly, never the latest value retroactively", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    writeSnapshot(root, SNAPSHOT_B_DAILY_UPDATE);
    const index = readSnapshotHistoryIndex(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok");
    expect(index[0].marketSpreadHomeLine).toBe(3.5);
    expect(index[1].marketSpreadHomeLine).toBe(3);
  });

  it("returns the most recently written snapshot as latest", () => {
    writeSnapshot(root, SNAPSHOT_A_INITIAL);
    writeSnapshot(root, SNAPSHOT_B_DAILY_UPDATE);
    const latest = readLatestSnapshot(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok");
    expect(latest?.snapshotId).toBe(SNAPSHOT_B_DAILY_UPDATE.snapshotId);
  });

  it("returns null when no snapshot exists yet", () => {
    expect(readLatestSnapshot(root, FIXTURE_SNAPSHOT_SEASON, FIXTURE_SNAPSHOT_WEEK, FIXTURE_SNAPSHOT_GAME_ID, "grok")).toBeNull();
  });
});
