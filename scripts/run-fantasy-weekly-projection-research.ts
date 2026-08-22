import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PREREGISTERED_HYPERPARAMETER_GRIDS, PROMOTION_CRITERIA } from "../src/lib/fantasy/weekly/projections/model/preregistration";
import { runPositionResearch } from "../src/lib/fantasy/weekly/projections/model/positionResearch";
import { runHoldoutEvaluation } from "../src/lib/fantasy/weekly/projections/model/holdout";
import { assertNotModelSelectionSeason } from "../src/lib/fantasy/weekly/projections/splitAuthority";
import type { WeeklyFantasyProjectionTrainingRow } from "../src/lib/fantasy/weekly/projections/contract";
import type { FantasyPosition } from "../src/lib/fantasy/rankings";

/**
 * Phase 2 research driver. NOT wired into any build/CI step, NOT a production
 * generator, and produces only untracked artifacts under
 * data/fantasy/projections/research/. Run manually:
 *   npx tsx scripts/run-fantasy-weekly-projection-research.ts
 */

const ROOT = path.resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATASET_PATH = path.join(ROOT, "data", "fantasy", "projections", "weekly-fantasy-projection-training-dataset-v1.json");
const OUTPUT_DIR = path.join(ROOT, "data", "fantasy", "projections", "research");
const POSITIONS: readonly FantasyPosition[] = ["QB", "RB", "WR", "TE"];

function writeJson(filename: string, data: unknown): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(data, null, 2));
  console.log(`wrote ${path.join("data/fantasy/projections/research", filename)}`);
}

function main(): void {
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as {
    rows: WeeklyFantasyProjectionTrainingRow[];
  };
  const rows = dataset.rows;

  // Step 1: preregistration artifact, written before any validation number is computed below.
  writeJson("model-preregistration.json", {
    generatedAt: new Date().toISOString(),
    hyperparameterGrids: PREREGISTERED_HYPERPARAMETER_GRIDS,
    promotionCriteria: PROMOTION_CRITERIA,
    frozenSplit: { training: 2023, validation: 2024, holdout: 2025 },
    note: "Grids and promotion criteria are fixed module-level constants that existed before this run computed any validation metric.",
  });

  const trainingRows = rows.filter((row) => row.season === 2023);
  const validationRows = rows.filter((row) => row.season === 2024);
  const holdoutRows = rows.filter((row) => row.season === 2025);
  for (const row of [...trainingRows, ...validationRows]) assertNotModelSelectionSeason(row.season);

  // Step 2: per-position model selection using ONLY 2023 train / 2024 validation.
  const results = POSITIONS.map((position) => runPositionResearch(position, trainingRows, validationRows));

  writeJson("2024-validation-and-ablation-results.json", {
    generatedAt: new Date().toISOString(),
    positions: results.map((result) => ({
      position: result.position,
      simpleBaselines: result.simpleBaselines,
      strongestSimpleBaseline: result.strongestSimpleBaseline,
      ablation: result.ablation.map((step) => ({
        ladderStep: step.ladderStep,
        blocks: step.blocks,
        candidates: step.candidates.map((candidate) => ({
          family: candidate.fitted.family,
          hyperparameter: candidate.fitted.hyperparameter,
          l1Ratio: candidate.fitted.l1Ratio,
          shrinkageK: candidate.fitted.shrinkageK,
          validation: candidate.evaluation.validation,
          calibration: candidate.evaluation.calibration,
          ranking: candidate.evaluation.ranking,
        })),
      })),
      finalState: result.finalState,
    })),
  });

  writeJson("position-decision-report.json", {
    generatedAt: new Date().toISOString(),
    positions: results.map((result) => ({
      position: result.position,
      finalState: result.finalState,
      frozenSpec: result.frozenSpec,
    })),
  });

  // Step 3: unlock 2025 exactly once, only after all four specs are frozen.
  const frozenSpecs = results.map((result) => result.frozenSpec);
  const holdout = runHoldoutEvaluation(frozenSpecs, POSITIONS, trainingRows, validationRows, holdoutRows);

  writeJson("2025-final-holdout-results.json", {
    generatedAt: new Date().toISOString(),
    note: "Evaluated exactly once, after every position's spec was frozen from 2023/2024 only. No changes were made afterward.",
    results: holdout,
  });

  console.log("\nFinal position states:");
  for (const result of results) console.log(`  ${result.position}: ${result.finalState}`);
}

main();
