/**
 * WU4D.3 — OFFLINE fit step for the rushing-v2 SHADOW allocation artifact.
 *
 * Reads the full role-allocation RESEARCH dataset (gitignored, ~34MB) and
 * writes the compact, committed, hash-verified artifact the shadow
 * instrumentation actually loads at runtime:
 *
 *   data/nfl/models/rushing-shadow-allocation-v1.json
 *
 * Mirrors fit-receiving-production-model.ts exactly. Model-development
 * command, not scheduled production -- re-run deliberately when the
 * research dataset changes and commit the result. Given the same dataset
 * content, the fitted state (everything except `generatedAt`) is
 * byte-identical run to run.
 *
 *   npx tsx scripts/analysis/nfl-role-allocation/fit-rushing-shadow-model.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildShareObservations } from "../../../src/lib/nfl/props/roleAllocation/walkForward";
import { computePoolLeagueConstants } from "../../../src/lib/nfl/props/roleAllocation/poolModels";
import { fitShareModel } from "../../../src/lib/nfl/props/roleAllocation/shareModels";
import {
  serializeRushingShadowModel, NFL_RUSHING_SHADOW_ALLOCATION_MODEL, type NflRushingShadowModel,
} from "../../../src/lib/nfl/props/roleAllocation/rushingShadowArtifact";
import type { NflRoleAllocationDataset } from "../../../src/lib/nfl/props/roleAllocation/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATASET_PATH = join(ROOT, "data", "nfl", "props", "role-allocation-dataset-2022-2025.json");
const ARTIFACT_PATH = join(ROOT, "data", "nfl", "models", "rushing-shadow-allocation-v1.json");
const RUSH_K = 1; // matches week1-candidate.ts's already-validated S5A shrinkage K for rush

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (error) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw error;
  }
}

if (!existsSync(DATASET_PATH)) {
  throw new Error(
    `Research dataset not found at ${DATASET_PATH}. Run 'npx tsx scripts/analysis/nfl-role-allocation/build-dataset.ts' first ` +
      `(offline/dev only -- this file is intentionally gitignored, see data/nfl/props/role-allocation-*.json in .gitignore).`,
  );
}

const datasetText = readFileSync(DATASET_PATH, "utf8");
const datasetFingerprint = createHash("sha256").update(datasetText).digest("hex");
const dataset = JSON.parse(datasetText) as NflRoleAllocationDataset;

const { rush: rushObsAll, poolRows } = buildShareObservations(dataset);
const fit = fitShareModel(rushObsAll, RUSH_K);
const league = computePoolLeagueConstants(poolRows);
const leagueEfficiency = rushObsAll.reduce((s, r) => s + r.actualYards, 0) / rushObsAll.reduce((s, r) => s + r.actualVolume, 0);

const model: NflRushingShadowModel = {
  allocationModelVersion: NFL_RUSHING_SHADOW_ALLOCATION_MODEL,
  fit, league, leagueEfficiency, poolRows, datasetSeasons: [...dataset.seasons],
};

const trainedThroughSeason = Math.max(...dataset.seasons);
const artifact = serializeRushingShadowModel(model, {
  trainedThroughSeason, datasetFingerprint, generatedAt: new Date().toISOString(),
});

writeAtomic(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Wrote ${ARTIFACT_PATH}`);
console.log(`  modelVersion=${artifact.modelVersion} allocationModelVersion=${artifact.allocationModelVersion}`);
console.log(`  trainedThroughSeason=${artifact.trainedThroughSeason} datasetSeasons=${JSON.stringify(artifact.datasetSeasons)}`);
console.log(`  poolRows=${artifact.poolRows.length} rankPrior entries=${Object.keys(artifact.fit.rankPrior).length}`);
console.log(`  datasetFingerprint=${artifact.datasetFingerprint}`);
console.log(`  contentHash=${artifact.contentHash}`);
