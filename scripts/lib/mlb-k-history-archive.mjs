import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const MLB_K_DAILY_ARCHIVE_SCHEMA_VERSION = 1;

export const DEFAULT_MLB_K_DAILY_ARTIFACTS = Object.freeze([
  "hr-props-raw.json",
  "k-workload-shadow.json",
  "strikeout-prop-details.json",
  "mlb-odds.json",
  "team-wrc-plus.json",
  "k-props-v2-shadow.json",
]);

function assertSlateDate(value) {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`Invalid slate date: ${value}`);
  }
  return text;
}

function assertArtifactName(value) {
  const name = String(value ?? "").trim();
  if (!name || name !== path.basename(name) || !name.endsWith(".json")) {
    throw new Error(`Invalid source artifact name: ${value}`);
  }
  return name;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeAtomic(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const backupPath = `${filePath}.bak-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, bytes);
  let backedUp = false;
  try {
    if (existsSync(filePath)) {
      renameSync(filePath, backupPath);
      backedUp = true;
    }
    renameSync(temporaryPath, filePath);
    if (backedUp) rmSync(backupPath, { force: true });
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    if (backedUp && !existsSync(filePath) && existsSync(backupPath)) renameSync(backupPath, filePath);
    throw error;
  }
}

function schemaInformation(payload) {
  const keys = [
    "schemaVersion",
    "modelVersion",
    "trackingModelVersion",
    "projectionMode",
    "kProjectionMode",
    "kProjectionModelVersion",
  ];
  return Object.fromEntries(keys
    .filter((key) => payload?.[key] !== undefined && payload?.[key] !== null)
    .map((key) => [key, payload[key]]));
}

function readExistingManifest(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Existing archive manifest is invalid: ${manifestPath}: ${error.message}`);
  }
}

function artifactsMatch(existingManifest, prepared, archiveDirectory) {
  if (!existingManifest || existingManifest.schemaVersion !== MLB_K_DAILY_ARCHIVE_SCHEMA_VERSION) return false;
  if (existingManifest.artifacts?.length !== prepared.length) return false;
  const byName = new Map(existingManifest.artifacts.map((entry) => [entry.sourceArtifact, entry]));
  return prepared.every((item) => {
    const entry = byName.get(item.name);
    const archivedPath = path.join(archiveDirectory, item.name);
    if (!entry || entry.sha256 !== item.hash || entry.byteCount !== item.bytes.length || !existsSync(archivedPath)) return false;
    const archivedBytes = readFileSync(archivedPath);
    return archivedBytes.length === item.bytes.length && sha256(archivedBytes) === item.hash;
  });
}

function combinedContentHash(prepared) {
  const identity = prepared.map((item) => ({
    sourceArtifact: item.name,
    byteCount: item.bytes.length,
    sha256: item.hash,
  }));
  return sha256(Buffer.from(JSON.stringify(identity), "utf8"));
}

function normalizeGenerationTime(value, now) {
  const date = value == null ? now : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`Invalid generation time: ${value}`);
  }
  return date.toISOString();
}

function workflowIdentity(workflowRunId, workflowRunAttempt) {
  const runId = workflowRunId == null || workflowRunId === "" ? null : String(workflowRunId);
  const runAttempt = workflowRunAttempt == null || workflowRunAttempt === "" ? null : String(workflowRunAttempt);
  if ((runId == null) !== (runAttempt == null)) {
    throw new Error("workflowRunId and workflowRunAttempt must be supplied together");
  }
  if (runId != null && (!/^\d+$/.test(runId) || !/^\d+$/.test(runAttempt))) {
    throw new Error("workflowRunId and workflowRunAttempt must be positive integer strings");
  }
  return { runId, runAttempt };
}

function snapshotIdentity({ generationTime, combinedHash, workflowRunId, workflowRunAttempt }) {
  if (workflowRunId != null) {
    return `run-${workflowRunId}-attempt-${workflowRunAttempt}-${combinedHash.slice(0, 16)}`;
  }
  const timestamp = generationTime.replace(/[-:.]/g, "");
  return `local-${timestamp}-${combinedHash.slice(0, 16)}`;
}

function findIdenticalSnapshot(dateDirectory, prepared, combinedHash) {
  if (!existsSync(dateDirectory)) return null;
  const entries = readdirSync(dateDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const snapshotDirectory = path.join(dateDirectory, entry.name);
    try {
      const manifest = readExistingManifest(path.join(snapshotDirectory, "manifest.json"));
      if (manifest?.combinedContentSha256 === combinedHash
        && artifactsMatch(manifest, prepared, snapshotDirectory)) {
        return { snapshotDirectory, manifest };
      }
    } catch {
      // A corrupt unrelated snapshot must not block preserving new content.
    }
  }
  return null;
}

export function archiveMlbKDailySnapshot({
  slateDate,
  sourceDirectory,
  archiveRoot,
  sourceArtifacts = DEFAULT_MLB_K_DAILY_ARTIFACTS,
  replace = false,
  now = new Date(),
  generationTime,
  workflowRunId,
  workflowRunAttempt,
} = {}) {
  const date = assertSlateDate(slateDate);
  if (!sourceDirectory) throw new Error("sourceDirectory is required");
  if (!archiveRoot) throw new Error("archiveRoot is required");
  const names = [...new Set(sourceArtifacts.map(assertArtifactName))].sort();
  if (!names.length) throw new Error("At least one source artifact is required");

  const prepared = names.map((name) => {
    const sourcePath = path.join(sourceDirectory, name);
    if (!existsSync(sourcePath)) throw new Error(`Required source artifact is missing: ${sourcePath}`);
    const bytes = readFileSync(sourcePath);
    let payload;
    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Source artifact is not valid JSON: ${sourcePath}: ${error.message}`);
    }
    const artifactDate = payload?.slateDate ?? payload?.date ?? null;
    if (artifactDate != null && artifactDate !== date) {
      throw new Error(`Source artifact date mismatch for ${name}: expected ${date}, received ${artifactDate}`);
    }
    return { name, sourcePath, bytes, hash: sha256(bytes), schema: schemaInformation(payload) };
  });

  const generatedAt = normalizeGenerationTime(generationTime, now);
  const workflow = workflowIdentity(workflowRunId, workflowRunAttempt);
  const combinedHash = combinedContentHash(prepared);
  const snapshotId = snapshotIdentity({
    generationTime: generatedAt,
    combinedHash,
    workflowRunId: workflow.runId,
    workflowRunAttempt: workflow.runAttempt,
  });
  const dateDirectory = path.join(archiveRoot, date);
  const identical = findIdenticalSnapshot(dateDirectory, prepared, combinedHash);
  const identicalInvocation = identical && (workflow.runId == null
    || (String(identical.manifest.workflowRunId) === workflow.runId
      && String(identical.manifest.workflowRunAttempt) === workflow.runAttempt));
  if (identicalInvocation) {
    return {
      status: "identical",
      archiveDirectory: identical.snapshotDirectory,
      snapshotId: identical.manifest.snapshotId,
      manifest: identical.manifest,
    };
  }

  const archiveDirectory = path.join(dateDirectory, snapshotId);
  const manifestPath = path.join(archiveDirectory, "manifest.json");
  const existingManifest = readExistingManifest(manifestPath);
  if (existingManifest?.combinedContentSha256 === combinedHash
    && existingManifest.snapshotId === snapshotId
    && artifactsMatch(existingManifest, prepared, archiveDirectory)) {
    return { status: "identical", archiveDirectory, snapshotId, manifest: existingManifest };
  }
  if ((existingManifest || existsSync(archiveDirectory)) && !replace) {
    throw new Error(`Archive conflict for ${date}; rerun with explicit replacement to replace the dated snapshot`);
  }

  const createdAt = now.toISOString();
  const manifest = {
    schemaVersion: MLB_K_DAILY_ARCHIVE_SCHEMA_VERSION,
    slateDate: date,
    snapshotId,
    generationTime: generatedAt,
    createdAt,
    workflowRunId: workflow.runId,
    workflowRunAttempt: workflow.runAttempt == null ? null : Number(workflow.runAttempt),
    combinedContentSha256: combinedHash,
    duplicateContentOfSnapshotId: identical?.manifest.snapshotId ?? null,
    artifacts: prepared.map((item) => ({
      sourceArtifact: item.name,
      archivedFile: item.name,
      byteCount: item.bytes.length,
      sha256: item.hash,
      schema: item.schema,
    })),
  };

  const stagingDirectory = `${archiveDirectory}.tmp-${process.pid}-${Date.now()}`;
  const backupDirectory = `${archiveDirectory}.bak-${process.pid}-${Date.now()}`;
  mkdirSync(stagingDirectory, { recursive: true });
  for (const item of prepared) writeAtomic(path.join(stagingDirectory, item.name), item.bytes);
  writeAtomic(path.join(stagingDirectory, "manifest.json"), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"));

  let backedUp = false;
  try {
    if (existsSync(archiveDirectory)) {
      renameSync(archiveDirectory, backupDirectory);
      backedUp = true;
    }
    renameSync(stagingDirectory, archiveDirectory);
    if (backedUp) rmSync(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    rmSync(stagingDirectory, { recursive: true, force: true });
    if (backedUp && !existsSync(archiveDirectory) && existsSync(backupDirectory)) {
      renameSync(backupDirectory, archiveDirectory);
    }
    throw error;
  }
  return { status: replace ? "replaced" : "created", archiveDirectory, snapshotId, manifest };
}
