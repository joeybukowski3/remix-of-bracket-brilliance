/**
 * WU4G.2 -- OFFLINE fit step for the corrected, pool-scoped rushing
 * role-conflict severity diagnostic (`rushingRoleConflictDiagnosticV2.ts`).
 *
 * The old rushing shadow allocator's `fit.rankPrior`
 * (`data/nfl/models/rushing-shadow-allocation-v1.json`) mixes QB and RB
 * rows into one `rank:<n>` training bucket (see
 * `rushingRoleConflictDiagnosticV2.ts`'s doc comment for the root cause and
 * the resulting bias). `buildPoolScopedRankPrior` fixes this by scoping the
 * prior to `rb:<n>` -- but doing so requires the full player-level
 * `rushShares` rows from the RESEARCH dataset
 * (`data/nfl/props/role-allocation-dataset-2022-2025.json`, gitignored,
 * ~33MB). That dataset is NEVER read by any production/runtime path -- only
 * by this offline command, mirroring
 * `fit-receiving-production-model.ts`'s exact same pattern for the same
 * dataset. The output here is a small, committed, hash-verified lookup
 * table; `generate-nfl-current-week-yardage-projections.ts` loads ONLY that
 * small artifact at prediction time, never the research dataset itself.
 *
 * Re-run deliberately whenever the research dataset changes and commit the
 * result. Given the same dataset content, the fitted state (everything
 * except `generatedAt`) is byte-identical run to run.
 *
 *   npx tsx scripts/analysis/nfl-role-allocation/fit-rushing-role-conflict-v2-prior.ts
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash, type JsonValue } from "../../lib/nfl-production-prediction-archive";
import { buildPoolScopedRankPrior, type PoolScopedTrainingRow } from "../../../src/lib/nfl/research/rushingRoleConflictDiagnosticV2";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DATASET_PATH = join(ROOT, "data", "nfl", "props", "role-allocation-dataset-2022-2025.json");
const ARTIFACT_PATH = join(ROOT, "data", "nfl", "models", "rushing-role-conflict-v2-prior.json");

export const RUSHING_ROLE_CONFLICT_V2_PRIOR_SCHEMA_VERSION = "nfl-rushing-role-conflict-v2-prior-v1" as const;

export type RushingRoleConflictV2PriorArtifact = {
  schema_version: typeof RUSHING_ROLE_CONFLICT_V2_PRIOR_SCHEMA_VERSION;
  model_version: typeof RUSHING_ROLE_CONFLICT_V2_PRIOR_SCHEMA_VERSION;
  trained_through_season: number;
  dataset_seasons: number[];
  dataset_fingerprint: string;
  training_row_count: number;
  pool_scoped_rank_prior: Record<string, number>;
  generated_at: string;
  content_hash: string;
};

export function buildArtifact(dataset: {
  seasons: number[];
  rushShares: readonly { poolKey: string; role: { depthRankProxy: number | null }; shareOfPositionalPool: number }[];
}, datasetFingerprint: string, generatedAt: string): RushingRoleConflictV2PriorArtifact {
  const trainingRows: PoolScopedTrainingRow[] = dataset.rushShares.map((r) => ({
    poolKey: r.poolKey, depthRankProxy: r.role.depthRankProxy, shareOfPositionalPool: r.shareOfPositionalPool,
  }));
  const prior = buildPoolScopedRankPrior(trainingRows);
  const poolScopedRankPrior = Object.fromEntries([...prior.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const withoutHash = {
    schema_version: RUSHING_ROLE_CONFLICT_V2_PRIOR_SCHEMA_VERSION,
    model_version: RUSHING_ROLE_CONFLICT_V2_PRIOR_SCHEMA_VERSION,
    trained_through_season: Math.max(...dataset.seasons),
    dataset_seasons: [...dataset.seasons].sort((a, b) => a - b),
    dataset_fingerprint: datasetFingerprint,
    training_row_count: trainingRows.length,
    pool_scoped_rank_prior: poolScopedRankPrior,
    generated_at: generatedAt,
  };
  return { ...withoutHash, content_hash: contentHash(withoutHash as unknown as JsonValue) };
}

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

function main(): void {
  if (!existsSync(DATASET_PATH)) {
    throw new Error(
      `Research dataset not found at ${DATASET_PATH}. Run 'npx tsx scripts/analysis/nfl-role-allocation/build-dataset.ts' first ` +
        `(offline/dev only -- this file is intentionally gitignored, see data/nfl/props/role-allocation-*.json in .gitignore).`,
    );
  }
  const datasetText = readFileSync(DATASET_PATH, "utf8");
  const datasetFingerprint = contentHash(datasetText);
  const dataset = JSON.parse(datasetText) as { seasons: number[]; rushShares: { poolKey: string; role: { depthRankProxy: number | null }; shareOfPositionalPool: number }[] };
  const artifact = buildArtifact(dataset, datasetFingerprint, new Date().toISOString());
  writeAtomic(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`Wrote ${ARTIFACT_PATH}`);
  console.log(`  trainedThroughSeason=${artifact.trained_through_season} datasetSeasons=${JSON.stringify(artifact.dataset_seasons)}`);
  console.log(`  trainingRowCount=${artifact.training_row_count} priorEntries=${Object.keys(artifact.pool_scoped_rank_prior).length}`);
  console.log(`  rb:1=${artifact.pool_scoped_rank_prior["rb:1"]} rb:2=${artifact.pool_scoped_rank_prior["rb:2"]} rb:3=${artifact.pool_scoped_rank_prior["rb:3"]}`);
  console.log(`  datasetFingerprint=${artifact.dataset_fingerprint}`);
  console.log(`  contentHash=${artifact.content_hash}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
