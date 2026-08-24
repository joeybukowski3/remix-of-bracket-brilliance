import { resolve } from "node:path";
import { writeAtomic } from "../src/lib/cfb/research/ingestion/cfbdClient";
import { runPhase3Experiment, type Phase3ExperimentResult } from "../src/lib/cfb/research/phase3/phase3ExperimentRunner";
import { runExperiment } from "../src/lib/cfb/research/phase2/experimentRunner";
import {
  CFB_RESEARCH_PHASE3_EXPERIMENTS_DIR,
  DECAY_FIXED_GAME_COUNT_RAMP_GRID,
  DECAY_PRECISION_WEIGHTED_K_GRID,
  PHASE3_ALL_TEST_SEASONS,
  PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS,
  PRIOR_RIDGE_LAMBDA,
  RIDGE_WITH_PRIOR_LAMBDA_GRID,
} from "../src/lib/cfb/research/phase3/config";
import type { CfbPriorFeatureSet } from "../src/lib/cfb/research/phase3/types";
import type { DecayConfig } from "../src/lib/cfb/research/phase3/decay";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, CFB_RESEARCH_PHASE3_EXPERIMENTS_DIR);

function write(name: string, data: unknown) {
  writeAtomic(resolve(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

function slim(result: Phase3ExperimentResult) {
  return {
    configLabel: result.configLabel,
    method: result.options.method,
    priorFeatureSet: result.options.priorFeatureSet,
    priorLambda: result.options.priorLambda,
    n: result.n,
    overall: result.overall,
    weeks1to4: result.weeks1to4,
    weeks5to8: result.weeks5to8,
    weeks9plus: result.weeks9plus,
    bySeason: result.bySeason,
  };
}

async function main() {
  const t0 = Date.now();

  // === Baselines: no-prior Iterative/Ridge (Phase 3 core), Baseline JKB V1 Independent (Phase 2 harness) ===
  console.log("[phase3] Baselines");
  const noPriorIterativeAll = runPhase3Experiment("no-prior-iterative-2019-2025", {
    method: { kind: "NO_PRIOR_ITERATIVE" },
    metricSet: ["ypp", "ppp"],
    testSeasons: [...PHASE3_ALL_TEST_SEASONS],
  });
  const noPriorRidgeAll = runPhase3Experiment("no-prior-ridge-2019-2025", {
    method: { kind: "NO_PRIOR_RIDGE" },
    metricSet: ["ypp", "ppp"],
    testSeasons: [...PHASE3_ALL_TEST_SEASONS],
  });
  const noPriorIterativeEligible = runPhase3Experiment("no-prior-iterative-2020-2025", {
    method: { kind: "NO_PRIOR_ITERATIVE" },
    metricSet: ["ypp", "ppp"],
    testSeasons: [...PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS],
  });
  const noPriorRidgeEligible = runPhase3Experiment("no-prior-ridge-2020-2025", {
    method: { kind: "NO_PRIOR_RIDGE" },
    metricSet: ["ypp", "ppp"],
    testSeasons: [...PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS],
  });
  const baselineJkbV1 = runExperiment("baseline-jkb-v1-independent-2020-2025", {
    methodConfig: { method: "ITERATIVE", config: { strength: 0.2, iterations: 6, minimumGames: 1 } },
    metricSet: ["ypp", "ppp"],
    policy: "NONE",
    aggregationMode: "gameWeighted",
    warmStartSeason: 2018,
    testSeasons: PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS,
  });
  console.log(`[phase3]   no-prior Iterative (2020-25) MAE=${noPriorIterativeEligible.overall.mae?.toFixed(3)}`);
  console.log(`[phase3]   no-prior Ridge (2020-25) MAE=${noPriorRidgeEligible.overall.mae?.toFixed(3)}`);
  console.log(`[phase3]   baseline JKB V1 (2020-25) MAE=${baselineJkbV1.overall.mae?.toFixed(3)}`);

  // === Prior A/B/C/D comparison (Iterative + PRECISION_WEIGHTED decay, K=3) ===
  console.log("[phase3] Prior A/B/C/D comparison");
  const priorFeatureResults: Record<CfbPriorFeatureSet, Phase3ExperimentResult> = {} as Record<
    CfbPriorFeatureSet,
    Phase3ExperimentResult
  >;
  for (const featureSet of ["PRIOR_A", "PRIOR_B", "PRIOR_C", "PRIOR_D"] as CfbPriorFeatureSet[]) {
    const result = runPhase3Experiment(`prior-${featureSet}`, {
      method: { kind: "ITERATIVE_WITH_PRIOR", decay: { method: "PRECISION_WEIGHTED", priorGamesWeight: 3 } },
      metricSet: ["ypp", "ppp"],
      testSeasons: [...PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS],
      priorFeatureSet: featureSet,
      priorLambda: PRIOR_RIDGE_LAMBDA,
    });
    priorFeatureResults[featureSet] = result;
    console.log(
      `[phase3]   ${featureSet}: overall MAE=${result.overall.mae?.toFixed(3)} w1-4 MAE=${result.weeks1to4.mae?.toFixed(3)}`,
    );
  }
  const winningFeatureSet = (Object.entries(priorFeatureResults) as [CfbPriorFeatureSet, Phase3ExperimentResult][]).reduce(
    (best, cur) => (cur[1].weeks1to4.mae !== null && (best[1].weeks1to4.mae === null || cur[1].weeks1to4.mae < best[1].weeks1to4.mae) ? cur : best),
  )[0];
  console.log(`[phase3] Winning prior feature set (by Weeks 1-4 MAE): ${winningFeatureSet}`);
  write("prior-feature-comparison.json", {
    results: Object.fromEntries(Object.entries(priorFeatureResults).map(([k, v]) => [k, slim(v)])),
    winningFeatureSet,
  });

  // === Decay comparison (winning feature set, Iterative) ===
  console.log("[phase3] Decay comparison");
  const decayResults: Record<string, Phase3ExperimentResult> = {};
  const decayConfigs: [string, DecayConfig][] = [
    ["NONE", { method: "NONE" }],
    ...DECAY_FIXED_GAME_COUNT_RAMP_GRID.map((r) => [`FIXED_GAME_COUNT_ramp${r}`, { method: "FIXED_GAME_COUNT", rampGames: r }] as [string, DecayConfig]),
    ...DECAY_PRECISION_WEIGHTED_K_GRID.map((k) => [`PRECISION_WEIGHTED_K${k}`, { method: "PRECISION_WEIGHTED", priorGamesWeight: k }] as [string, DecayConfig]),
  ];
  for (const [label, decay] of decayConfigs) {
    const result = runPhase3Experiment(`decay-${label}`, {
      method: { kind: "ITERATIVE_WITH_PRIOR", decay },
      metricSet: ["ypp", "ppp"],
      testSeasons: [...PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS],
      priorFeatureSet: winningFeatureSet,
      priorLambda: PRIOR_RIDGE_LAMBDA,
    });
    decayResults[label] = result;
    console.log(`[phase3]   ${label}: overall MAE=${result.overall.mae?.toFixed(3)} w1-4 MAE=${result.weeks1to4.mae?.toFixed(3)}`);
  }
  const winningDecayLabel = Object.entries(decayResults).reduce((best, cur) =>
    cur[1].weeks1to4.mae !== null && (best[1].weeks1to4.mae === null || cur[1].weeks1to4.mae < best[1].weeks1to4.mae) ? cur : best,
  )[0];
  console.log(`[phase3] Winning decay method (by Weeks 1-4 MAE): ${winningDecayLabel}`);
  write("decay-comparison.json", {
    results: Object.fromEntries(Object.entries(decayResults).map(([k, v]) => [k, slim(v)])),
    winningDecayLabel,
  });
  const winningDecayConfig = decayConfigs.find(([label]) => label === winningDecayLabel)![1];

  // === Iterative + prior final (best feature set + best decay) ===
  console.log("[phase3] Iterative + prior (final config)");
  const iterativeWithPriorFinal = runPhase3Experiment("iterative-with-prior-final", {
    method: { kind: "ITERATIVE_WITH_PRIOR", decay: winningDecayConfig },
    metricSet: ["ypp", "ppp"],
    testSeasons: [...PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS],
    priorFeatureSet: winningFeatureSet,
    priorLambda: PRIOR_RIDGE_LAMBDA,
  });
  write("iterative-prior-results.json", { noPrior: slim(noPriorIterativeEligible), withPrior: slim(iterativeWithPriorFinal) });
  console.log(`[phase3]   Iterative+prior final MAE=${iterativeWithPriorFinal.overall.mae?.toFixed(3)} w1-4=${iterativeWithPriorFinal.weeks1to4.mae?.toFixed(3)}`);

  // === Ridge + prior (lambda grid on the prior-centered penalty) ===
  console.log("[phase3] Ridge + prior lambda grid");
  const ridgePriorResults: Record<number, Phase3ExperimentResult> = {};
  for (const lambda of RIDGE_WITH_PRIOR_LAMBDA_GRID) {
    const result = runPhase3Experiment(`ridge-with-prior-lambda${lambda}`, {
      method: { kind: "RIDGE_WITH_PRIOR", lambda },
      metricSet: ["ypp", "ppp"],
      testSeasons: [...PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS],
      priorFeatureSet: winningFeatureSet,
      priorLambda: PRIOR_RIDGE_LAMBDA,
    });
    ridgePriorResults[lambda] = result;
    console.log(`[phase3]   lambda=${lambda}: overall MAE=${result.overall.mae?.toFixed(3)} w1-4=${result.weeks1to4.mae?.toFixed(3)}`);
  }
  const winningRidgeLambda = Object.entries(ridgePriorResults).reduce((best, cur) =>
    cur[1].weeks1to4.mae !== null && (best[1].weeks1to4.mae === null || cur[1].weeks1to4.mae < best[1].weeks1to4.mae) ? cur : best,
  )[0];
  const ridgeWithPriorFinal = ridgePriorResults[Number(winningRidgeLambda)];
  write("ridge-prior-results.json", {
    noPrior: slim(noPriorRidgeEligible),
    grid: Object.fromEntries(Object.entries(ridgePriorResults).map(([k, v]) => [k, slim(v)])),
    winningLambda: winningRidgeLambda,
  });
  console.log(`[phase3]   Ridge+prior final (lambda=${winningRidgeLambda}) MAE=${ridgeWithPriorFinal.overall.mae?.toFixed(3)} w1-4=${ridgeWithPriorFinal.weeks1to4.mae?.toFixed(3)}`);

  // === Weeks 1-4 focused comparison across everything ===
  console.log("[phase3] Weeks 1-4 focused comparison");
  const early = {
    baselineJkbV1: baselineJkbV1.weeks1to4,
    noPriorIterative: noPriorIterativeEligible.weeks1to4,
    noPriorRidge: noPriorRidgeEligible.weeks1to4,
    iterativeWithPrior: iterativeWithPriorFinal.weeks1to4,
    ridgeWithPrior: ridgeWithPriorFinal.weeks1to4,
  };
  write("early-season-results.json", early);
  console.log("[phase3]  ", JSON.stringify(early));

  // === Prior ablation (winning feature set assumed PRIOR_D; report A/B/C as the block-removal ablation) ===
  write("ablation-results.json", {
    note: "Prior A/B/C/D IS the block-ablation matrix (A=prevYear only, B=prevYear+returning, C=prevYear+talent, D=full). 'D minus prevYear' (returning+talent only, no prior-year performance) was not tested — see Phase 3 final report Section 27 deviations.",
    results: Object.fromEntries(Object.entries(priorFeatureResults).map(([k, v]) => [k, slim(v)])),
  });

  // === Final model comparison ===
  write("phase3-model-comparison.json", {
    generatedAt: new Date().toISOString(),
    testSeasons: PHASE3_PRIOR_ELIGIBLE_TEST_SEASONS,
    baselineJkbV1: slim(baselineJkbV1 as unknown as Phase3ExperimentResult),
    noPriorIterative: slim(noPriorIterativeEligible),
    noPriorRidge: slim(noPriorRidgeEligible),
    iterativeWithPrior: slim(iterativeWithPriorFinal),
    ridgeWithPrior: slim(ridgeWithPriorFinal),
    winningFeatureSet,
    winningDecayLabel,
    winningRidgeLambda,
    elapsedMs: Date.now() - t0,
  });

  console.log(`[phase3] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(`[phase3] FAILED: ${(error as Error).message}`);
  console.error(error);
  process.exitCode = 1;
});
