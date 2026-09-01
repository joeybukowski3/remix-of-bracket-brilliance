import { appendFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  archiveMlbKDailySnapshot,
  DEFAULT_MLB_K_DAILY_ARTIFACTS,
} from "./lib/mlb-k-history-archive.mjs";

const ROOT = process.cwd();

function values(argv, prefix) {
  return argv.filter((entry) => entry.startsWith(prefix)).map((entry) => entry.slice(prefix.length));
}

export function main(argv = process.argv.slice(2)) {
  const value = (prefix) => argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  const slateDate = value("--date=");
  const sources = values(argv, "--source=");
  const result = archiveMlbKDailySnapshot({
    slateDate,
    sourceDirectory: value("--source-dir=") ?? path.join(ROOT, "public", "data", "mlb"),
    archiveRoot: value("--archive-root=") ?? path.join(ROOT, "data", "mlb", "k-history", "daily"),
    sourceArtifacts: sources.length ? sources : DEFAULT_MLB_K_DAILY_ARTIFACTS,
    replace: argv.includes("--replace"),
    generationTime: value("--generation-time="),
    workflowRunId: value("--workflow-run-id="),
    workflowRunAttempt: value("--workflow-run-attempt="),
  });
  const output = {
    status: result.status,
    slateDate: result.manifest.slateDate,
    snapshotId: result.snapshotId,
    combinedContentSha256: result.manifest.combinedContentSha256,
    archiveDirectory: result.archiveDirectory,
    artifactCount: result.manifest.artifacts.length,
    totalBytes: result.manifest.artifacts.reduce((sum, artifact) => sum + artifact.byteCount, 0),
  };
  console.log(JSON.stringify(output, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `snapshot_id=${result.snapshotId}\n`, "utf8");
    appendFileSync(process.env.GITHUB_OUTPUT, `combined_content_sha256=${result.manifest.combinedContentSha256}\n`, "utf8");
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[archive-mlb-k-daily-snapshot] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
