/**
 * WU4B S6 production packaging -- OFFLINE fit step.
 *
 * Reads the full role-allocation RESEARCH dataset (player-level share rows;
 * gitignored, regenerated via `build-dataset.ts`) and writes the compact,
 * committed, hash-verified PRODUCTION artifact that
 * `generate-nfl-current-week-yardage-projections.ts` actually loads at
 * runtime:
 *
 *   data/nfl/models/receiving-role-allocation-v2.json
 *
 * This is a model-development command, NOT scheduled game-day production --
 * re-run it deliberately whenever the research dataset changes (a new
 * season's data lands, the fitting math changes) and commit the result.
 * Given the same research dataset content, the fitted state (everything
 * except `generatedAt`) is byte-identical run to run.
 *
 *   npx tsx scripts/analysis/nfl-role-allocation/fit-receiving-production-model.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fitReceivingShareModel } from "../../../src/lib/nfl/props/roleAllocation/receivingProduction";
import { serializeReceivingRoleAllocationModel } from "../../../src/lib/nfl/props/roleAllocation/productionArtifact";
import type { NflRoleAllocationDataset } from "../../../src/lib/nfl/props/roleAllocation/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATASET_PATH = join(ROOT, "data", "nfl", "props", "role-allocation-dataset-2022-2025.json");
const ARTIFACT_PATH = join(ROOT, "data", "nfl", "models", "receiving-role-allocation-v2.json");

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

const model = fitReceivingShareModel(dataset);
const trainedThroughSeason = Math.max(...dataset.seasons);
const artifact = serializeReceivingRoleAllocationModel(model, {
  trainedThroughSeason,
  datasetFingerprint,
  generatedAt: new Date().toISOString(),
});

writeAtomic(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Wrote ${ARTIFACT_PATH}`);
console.log(`  modelVersion=${artifact.modelVersion} allocationModelVersion=${artifact.allocationModelVersion}`);
console.log(`  trainedThroughSeason=${artifact.trainedThroughSeason} datasetSeasons=${JSON.stringify(artifact.datasetSeasons)}`);
console.log(`  poolRows=${artifact.poolRows.length} rankPrior entries=${Object.keys(artifact.fit.rankPrior).length}`);
console.log(`  datasetFingerprint=${artifact.datasetFingerprint}`);
console.log(`  contentHash=${artifact.contentHash}`);
