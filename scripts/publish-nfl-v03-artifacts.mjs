/** Offline, plan-first publication runner for NFL v0.3 Stage-1 artifacts. */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildNflV03ArtifactSet,
  serializeNflV03Artifact,
} from "./lib/nfl-v03-artifacts.mjs";
import {
  NFL_V03_PLACEHOLDER_GENERATED_AT,
  assertUtcIsoTimestamp,
  deriveCandidateManifest,
  deriveGovernancePaths,
  derivePublicationAllowlist,
  planPublication,
  publishPlannedArtifacts,
  readArtifactSet,
  reconcileGeneratedAt,
  restoreGovernanceCandidateBytes,
  seedExistingArtifacts,
  snapshotRawFiles,
  validateCompleteCandidateSet,
  verifyRawFiles,
} from "./lib/nfl-v03-publication.mjs";
import {
  loadNflV03Inputs,
  writeNflV03Artifacts,
} from "./generate-nfl-v03-artifacts.mjs";
import { validateNflWeeklySourceCache } from "./validate-nfl-weekly-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATA_DIR = join(ROOT, "public", "data", "nfl");

function inferSourceRoot(inputDir) {
  const absolute = resolve(inputDir);
  const suffix = join("public", "data", "nfl");
  if (!absolute.endsWith(suffix)) {
    throw new Error(
      `--input-dir must point to <repository-root>/public/data/nfl so source-cache validation and generation use the same fixture: ${absolute}`
    );
  }
  return resolve(absolute, "..", "..", "..");
}

export function parsePublicationArgs(argv) {
  const args = {
    write: false,
    generatedAt: null,
    allowHistorical: false,
    historicalPaths: [],
    inputDir: DEFAULT_DATA_DIR,
    outputDir: DEFAULT_DATA_DIR,
  };
  for (const arg of argv) {
    if (arg === "--write") args.write = true;
    else if (arg === "--allow-historical") args.allowHistorical = true;
    else if (arg.startsWith("--generated-at=")) {
      args.generatedAt = arg.slice("--generated-at=".length);
    } else if (arg.startsWith("--historical-path=")) {
      args.historicalPaths.push(arg.slice("--historical-path=".length));
    } else if (arg.startsWith("--input-dir=")) {
      args.inputDir = resolve(arg.slice("--input-dir=".length));
    } else if (arg.startsWith("--output-dir=")) {
      args.outputDir = resolve(arg.slice("--output-dir=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.generatedAt != null) assertUtcIsoTimestamp(args.generatedAt);
  if (args.historicalPaths.length > 0 && !args.allowHistorical) {
    throw new Error("--historical-path requires --allow-historical");
  }
  return args;
}

function readLiveArtifacts(rootDir) {
  const artifacts = {};
  for (const path of deriveCandidateManifest()) {
    const absolute = join(rootDir, ...path.split("/"));
    if (!existsSync(absolute)) continue;
    artifacts[path] = JSON.parse(readFileSync(absolute, "utf8"));
  }
  return artifacts;
}

function writeCandidateArtifacts(candidateDir, artifacts, paths) {
  for (const path of paths) {
    const artifact = artifacts[path];
    const absolute = join(candidateDir, ...path.split("/"));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, serializeNflV03Artifact(artifact));
  }
}

export async function runNflV03Publication(
  args,
  log = console.log,
  dependencies = {}
) {
  const sourceRoot = dependencies.sourceRoot ?? inferSourceRoot(args.inputDir);
  const weeklyCacheDir = join(
    sourceRoot,
    "data",
    "nfl",
    "nflverse",
    "stats-team-week"
  );
  const makeTempRoot =
    dependencies.makeTempRoot ??
    (() => mkdtempSync(join(tmpdir(), "jkb-nfl-v03-publication-")));
  const validateSourceCache =
    dependencies.validateSourceCache ?? validateNflWeeklySourceCache;
  const loadInputs = dependencies.loadInputs ?? loadNflV03Inputs;
  const buildArtifacts = dependencies.buildArtifacts ?? buildNflV03ArtifactSet;
  const writeArtifacts = dependencies.writeArtifacts ?? writeNflV03Artifacts;

  const tempRoot = makeTempRoot();
  dependencies.onTempRoot?.(tempRoot);
  const candidateDir = join(tempRoot, "candidate");
  const manifest = deriveCandidateManifest();
  const governancePaths = deriveGovernancePaths();

  try {
    const cacheValidation = validateSourceCache({ rootDir: sourceRoot });
    if (!cacheValidation.valid) throw new Error("Weekly source-cache validation failed");

    const liveArtifacts = readLiveArtifacts(args.outputDir);
    const governanceSnapshots = snapshotRawFiles(args.outputDir, governancePaths);

    seedExistingArtifacts({
      liveDir: args.outputDir,
      candidateDir,
      paths: [...new Set([...governancePaths, ...derivePublicationAllowlist()])],
    });

    const inputs = loadInputs({
      inputDir: args.inputDir,
      outputDir: candidateDir,
      weeklyCacheDir,
    });
    const candidateArtifacts = buildArtifacts({
      ...inputs,
      generatedAt: NFL_V03_PLACEHOLDER_GENERATED_AT,
    });
    writeArtifacts(candidateArtifacts, candidateDir);

    restoreGovernanceCandidateBytes({
      candidateDir,
      candidateArtifacts,
      governanceSnapshots,
    });

    await dependencies.mutateCandidateTree?.({
      candidateDir,
      candidateArtifacts,
      inputs,
      manifest,
    });

    const validatedCandidates = readArtifactSet(candidateDir, manifest);
    validateCompleteCandidateSet({
      candidateDir,
      candidateArtifacts: validatedCandidates,
      teamsJson: inputs.teamsJson,
    });

    const timestampResult = reconcileGeneratedAt({
      candidateArtifacts: validatedCandidates,
      liveArtifacts,
      generatedAt: args.generatedAt,
    });
    if (args.write && timestampResult.changed.length > 0 && args.generatedAt == null) {
      throw new Error(
        "Substantive artifact changes require --generated-at=<ISO-8601 UTC timestamp> before --write can modify live files"
      );
    }

    writeCandidateArtifacts(
      candidateDir,
      validatedCandidates,
      derivePublicationAllowlist()
    );
    const finalCandidates = readArtifactSet(candidateDir, manifest);
    validateCompleteCandidateSet({
      candidateDir,
      candidateArtifacts: finalCandidates,
      teamsJson: inputs.teamsJson,
    });

    const plan = planPublication({
      candidateArtifacts: finalCandidates,
      liveArtifacts,
      allowHistorical: args.allowHistorical,
      historicalPaths: args.historicalPaths,
    });

    log(`[nfl:v03:publish] mode=${args.write ? "write" : "plan"}`);
    log(`[nfl:v03:publish] candidate artifacts=${manifest.length}`);
    log(`[nfl:v03:publish] changed=${plan.changed.length}`);
    for (const path of plan.changed) log(`[nfl:v03:publish] change ${path}`);
    if (!args.write && plan.changed.length > 0) {
      log(
        "[nfl:v03:publish] plan only: --write requires --generated-at=<ISO-8601 UTC timestamp>"
      );
    }

    if (args.write && plan.changed.length > 0) {
      publishPlannedArtifacts({
        outputDir: args.outputDir,
        candidateArtifacts: finalCandidates,
        changedPaths: plan.changed,
        afterReplace: dependencies.afterReplace,
      });
    }

    verifyRawFiles(args.outputDir, governanceSnapshots, "Governance file");

    return {
      mode: args.write ? "write" : "plan",
      changed: plan.changed,
      unchanged: plan.unchanged,
      generatedAtRequired: !args.write && plan.changed.length > 0,
      published: args.write ? plan.changed : [],
      candidateCount: manifest.length,
      tempRoot,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  runNflV03Publication(parsePublicationArgs(process.argv.slice(2))).catch((error) => {
    console.error(`[nfl:v03:publish] FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
