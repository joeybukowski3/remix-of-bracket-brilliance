/**
 * Fixture/local generator for future NFL personnel evidence artifacts.
 *
 * This phase intentionally performs no external fetches. It reads an explicit
 * input artifact, validates it against the Phase 5B schema, runs transaction
 * reconciliation, and optionally writes deterministic JSON.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import teamsJson from "../public/data/nfl/teams.json" with { type: "json" };
import { toNflJsonFileString } from "./lib/nfl-data-meta.mjs";
import {
  PERSONNEL_EVIDENCE_GENERATOR_VERSION,
  assertValidPersonnelEvidenceDataset,
  sortPersonnelEvidenceDataset,
  validatePersonnelEvidenceDataset,
} from "./lib/nfl-personnel/schema.mjs";
import { collectDatasetTransactions, reconcileTransactions } from "./lib/nfl-personnel/transactions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    season: null,
    priorSeason: null,
    input: null,
    output: null,
    validateOnly: false,
    dryRun: false,
    generatedAt: null,
  };
  for (const arg of argv) {
    if (arg === "--validate-only") args.validateOnly = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--season=")) args.season = Number(arg.slice("--season=".length));
    else if (arg.startsWith("--prior-season=")) args.priorSeason = Number(arg.slice("--prior-season=".length));
    else if (arg.startsWith("--input=")) args.input = resolve(arg.slice("--input=".length));
    else if (arg.startsWith("--output=")) args.output = resolve(arg.slice("--output=".length));
    else if (arg.startsWith("--generated-at=")) args.generatedAt = arg.slice("--generated-at=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.input) throw new Error("--input is required; Phase 5B does not fetch providers");
  if (!args.validateOnly && !args.dryRun && !args.output) throw new Error("--output is required unless --validate-only or --dry-run is used");
  return args;
}

export function loadPersonnelEvidenceInput(inputPath) {
  return JSON.parse(readFileSync(inputPath, "utf8"));
}

export function buildPersonnelEvidenceArtifact(raw, args = {}) {
  const dataset = structuredClone(raw);
  if (args.season != null) dataset.targetSeason = args.season;
  if (args.priorSeason != null) dataset.priorSeason = args.priorSeason;
  if (args.generatedAt != null) dataset.generatedAt = args.generatedAt;
  if (!dataset.generatorVersion) dataset.generatorVersion = PERSONNEL_EVIDENCE_GENERATOR_VERSION;

  const reconciliation = reconcileTransactions(collectDatasetTransactions(dataset));
  const existingConflictIds = new Set((dataset.conflicts ?? []).map((conflict) => conflict.conflictId));
  dataset.conflicts = [
    ...(dataset.conflicts ?? []),
    ...reconciliation.conflicts.filter((conflict) => !existingConflictIds.has(conflict.conflictId)),
  ];
  dataset.warnings = [
    ...(dataset.warnings ?? []),
    ...reconciliation.warnings.map((warning) => warning.message),
  ];

  return sortPersonnelEvidenceDataset(dataset);
}

export function validatePersonnelEvidenceArtifact(artifact, { requireAllTeams = false } = {}) {
  return validatePersonnelEvidenceDataset(artifact, teamsJson, { requireAllTeams });
}

export function summarizePersonnelEvidenceArtifact(artifact, validation) {
  return {
    schemaVersion: artifact.schemaVersion,
    targetSeason: artifact.targetSeason,
    priorSeason: artifact.priorSeason,
    teamCount: artifact.teams.length,
    sourceCount: artifact.sources.length,
    transactionCount: artifact.teams.reduce((sum, team) => sum + team.transactions.length, 0),
    injuryReturnCount: artifact.teams.reduce((sum, team) => sum + team.injuryReturns.length, 0),
    valid: validation.valid,
    errorCount: validation.errors.length,
    warningCount: validation.warnings.length,
  };
}

export function runPersonnelEvidenceGenerator(raw, args = {}) {
  const artifact = buildPersonnelEvidenceArtifact(raw, args);
  const validation = assertValidPersonnelEvidenceDataset(artifact, teamsJson, { requireAllTeams: false });
  return {
    artifact,
    validation,
    summary: summarizePersonnelEvidenceArtifact(artifact, validation),
    json: toNflJsonFileString(artifact),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = loadPersonnelEvidenceInput(args.input);
  const artifact = buildPersonnelEvidenceArtifact(raw, args);
  const validation = validatePersonnelEvidenceArtifact(artifact);
  const summary = summarizePersonnelEvidenceArtifact(artifact, validation);

  if (!validation.valid) {
    console.error(JSON.stringify({ ...summary, errors: validation.errors }, null, 2));
    process.exit(1);
  }

  const json = toNflJsonFileString(artifact);
  if (!args.validateOnly && !args.dryRun) {
    writeFileSync(args.output, json);
  }

  console.log(
    JSON.stringify(
      {
        ...summary,
        input: args.input.replace(`${ROOT}\\`, "").replace(`${ROOT}/`, ""),
        output: args.output,
        validateOnly: args.validateOnly,
        dryRun: args.dryRun,
        wrote: Boolean(!args.validateOnly && !args.dryRun && args.output),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1]).replace(/\\/g, "/")}`).href) {
  main().catch((error) => {
    console.error(`[nfl:personnel] FAILED: ${error.message}`);
    process.exit(1);
  });
}
