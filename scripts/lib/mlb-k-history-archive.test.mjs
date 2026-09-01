import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  archiveMlbKDailySnapshot,
  MLB_K_DAILY_ARCHIVE_SCHEMA_VERSION,
  sha256,
} from "./mlb-k-history-archive.mjs";

const temporaryDirectories = [];

function fixture() {
  const root = path.join(tmpdir(), `mlb-k-archive-${process.pid}-${Date.now()}-${temporaryDirectories.length}`);
  temporaryDirectories.push(root);
  const sourceDirectory = path.join(root, "source");
  const archiveRoot = path.join(root, "archive");
  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(path.join(sourceDirectory, "a.json"), '{"schemaVersion":2,"date":"2025-04-01","rows":[1]}\n');
  writeFileSync(path.join(sourceDirectory, "b.json"), '{"modelVersion":"v2","rows":[2]}\n');
  return { root, sourceDirectory, archiveRoot };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("archiveMlbKDailySnapshot", () => {
  it("archives successful artifacts with byte-accurate manifest integrity", () => {
    const paths = fixture();
    const now = new Date("2025-04-01T15:00:00Z");
    const result = archiveMlbKDailySnapshot({
      slateDate: "2025-04-01",
      sourceDirectory: paths.sourceDirectory,
      archiveRoot: paths.archiveRoot,
      sourceArtifacts: ["b.json", "a.json"],
      now,
    });
    assert.equal(result.status, "created");
    assert.equal(result.manifest.schemaVersion, MLB_K_DAILY_ARCHIVE_SCHEMA_VERSION);
    assert.equal(result.manifest.createdAt, now.toISOString());
    assert.equal(result.manifest.generationTime, now.toISOString());
    assert.equal(result.manifest.snapshotId, result.snapshotId);
    assert.match(result.manifest.combinedContentSha256, /^[a-f0-9]{64}$/);
    assert.equal(path.basename(result.archiveDirectory), result.snapshotId);
    assert.deepEqual(result.manifest.artifacts.map((entry) => entry.sourceArtifact), ["a.json", "b.json"]);
    for (const entry of result.manifest.artifacts) {
      const bytes = readFileSync(path.join(result.archiveDirectory, entry.archivedFile));
      assert.equal(entry.byteCount, bytes.length);
      assert.equal(entry.sha256, sha256(bytes));
    }
    assert.deepEqual(result.manifest.artifacts[0].schema, { schemaVersion: 2 });
  });

  it("treats an identical rerun as idempotent and preserves the original manifest", () => {
    const paths = fixture();
    const input = { slateDate: "2025-04-01", sourceDirectory: paths.sourceDirectory, archiveRoot: paths.archiveRoot, sourceArtifacts: ["a.json"] };
    const first = archiveMlbKDailySnapshot({ ...input, now: new Date("2025-04-01T15:00:00Z") });
    const second = archiveMlbKDailySnapshot({ ...input, now: new Date("2025-04-01T16:00:00Z") });
    assert.equal(second.status, "identical");
    assert.equal(second.manifest.createdAt, first.manifest.createdAt);
  });

  it("keeps identical workflow runs distinguishable while recording duplicate content", () => {
    const paths = fixture();
    const base = {
      slateDate: "2025-04-01",
      sourceDirectory: paths.sourceDirectory,
      archiveRoot: paths.archiveRoot,
      sourceArtifacts: ["a.json"],
      workflowRunAttempt: "1",
    };
    const first = archiveMlbKDailySnapshot({ ...base, workflowRunId: "12345" });
    const second = archiveMlbKDailySnapshot({ ...base, workflowRunId: "67890" });
    assert.equal(second.status, "created");
    assert.notEqual(second.snapshotId, first.snapshotId);
    assert.equal(second.manifest.combinedContentSha256, first.manifest.combinedContentSha256);
    assert.equal(second.manifest.duplicateContentOfSnapshotId, first.snapshotId);
    assert.equal(second.manifest.workflowRunId, "67890");
    assert.equal(second.manifest.workflowRunAttempt, 1);
  });

  it("preserves materially different same-day content under distinct snapshot IDs", () => {
    const paths = fixture();
    const input = {
      slateDate: "2025-04-01",
      sourceDirectory: paths.sourceDirectory,
      archiveRoot: paths.archiveRoot,
      sourceArtifacts: ["a.json"],
      workflowRunId: "12345",
      workflowRunAttempt: "1",
    };
    const first = archiveMlbKDailySnapshot(input);
    assert.match(first.snapshotId, /^run-12345-attempt-1-[a-f0-9]{16}$/);
    assert.equal(first.manifest.workflowRunId, "12345");
    assert.equal(first.manifest.workflowRunAttempt, 1);
    writeFileSync(path.join(paths.sourceDirectory, "a.json"), '{"schemaVersion":2,"rows":[99]}\n');
    const second = archiveMlbKDailySnapshot(input);
    assert.equal(second.status, "created");
    assert.notEqual(second.snapshotId, first.snapshotId);
    assert.equal(readFileSync(path.join(first.archiveDirectory, "a.json"), "utf8"), '{"schemaVersion":2,"date":"2025-04-01","rows":[1]}\n');
    assert.equal(readFileSync(path.join(second.archiveDirectory, "a.json"), "utf8"), '{"schemaVersion":2,"rows":[99]}\n');
  });

  it("fails without creating a snapshot when a required source is missing", () => {
    const paths = fixture();
    assert.throws(() => archiveMlbKDailySnapshot({
      slateDate: "2025-04-01",
      sourceDirectory: paths.sourceDirectory,
      archiveRoot: paths.archiveRoot,
      sourceArtifacts: ["missing.json"],
    }), /Required source artifact is missing/);
  });

  it("detects archived-byte corruption instead of accepting a false idempotent rerun", () => {
    const paths = fixture();
    const input = {
      slateDate: "2025-04-01",
      sourceDirectory: paths.sourceDirectory,
      archiveRoot: paths.archiveRoot,
      sourceArtifacts: ["a.json"],
      generationTime: "2025-04-01T15:00:00Z",
    };
    const first = archiveMlbKDailySnapshot(input);
    writeFileSync(path.join(first.archiveDirectory, "a.json"), "corrupt");
    assert.throws(() => archiveMlbKDailySnapshot(input), /Archive conflict/);
    const replaced = archiveMlbKDailySnapshot({ ...input, replace: true });
    assert.equal(replaced.status, "replaced");
    assert.equal(replaced.manifest.artifacts[0].sha256, sha256(readFileSync(path.join(paths.sourceDirectory, "a.json"))));
  });
});
