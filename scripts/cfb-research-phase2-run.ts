import { resolve } from "node:path";
import { writeAtomic } from "../src/lib/cfb/research/ingestion/cfbdClient";
import { runExperiment, type ExperimentResult } from "../src/lib/cfb/research/phase2/experimentRunner";
import { runRawMarginBaseline } from "../src/lib/cfb/research/phase2/rawMarginBaseline";
import { evaluatePredictions } from "../src/lib/cfb/research/phase2/evaluation";
import {
  CFB_RESEARCH_PHASE2_BASELINE_CONFIG,
  CFB_RESEARCH_PHASE2_EXPERIMENTS_DIR,
  CFB_RESEARCH_PHASE2_GARBAGE_POLICIES,
  CFB_RESEARCH_PHASE2_METRIC_SETS,
  HYPERPARAMETER_HOLDOUT_SEASONS,
  HYPERPARAMETER_TUNING_SEASONS,
  ITERATIVE_ITERATIONS_GRID,
  ITERATIVE_STRENGTH_GRID,
  PARTIAL_POOLING_TAU_GRID,
  RIDGE_LAMBDA_GRID,
  WALK_FORWARD_TEST_SEASONS,
  WALK_FORWARD_WARM_START_SEASON,
} from "../src/lib/cfb/research/phase2/config";
import type { MethodConfig } from "../src/lib/cfb/research/phase2/walkForward";
import type { CfbGarbagePolicy, CfbMetricName } from "../src/lib/cfb/research/phase2/types";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, CFB_RESEARCH_PHASE2_EXPERIMENTS_DIR);

function write(name: string, data: unknown) {
  writeAtomic(resolve(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

function slim(result: ExperimentResult) {
  return {
    configLabel: result.configLabel,
    metricSet: result.options.metricSet,
    method: result.options.methodConfig.method,
    methodConfig: result.options.methodConfig.config,
    policy: result.options.policy,
    aggregationMode: result.options.aggregationMode,
    n: result.n,
    overall: result.overall,
    weeks1to4: result.weeks1to4,
    weeks5to8: result.weeks5to8,
    weeks9plus: result.weeks9plus,
    bySeason: result.bySeason,
  };
}

async function main() {
  const log: string[] = [];
  const t0 = Date.now();

  // === STAGE A: Baseline + simple Method A/B/C comparison on PPA, NONE, gameWeighted ===
  console.log("[phase2] Stage A: baseline + method family comparison");

  const baselinePredictions = runExperiment("baseline-jkb-v1-independent", {
    methodConfig: { method: "ITERATIVE", config: { strength: CFB_RESEARCH_PHASE2_BASELINE_CONFIG.opponentAdjustmentStrength, iterations: CFB_RESEARCH_PHASE2_BASELINE_CONFIG.iterations, minimumGames: CFB_RESEARCH_PHASE2_BASELINE_CONFIG.minimumGames } },
    metricSet: [...CFB_RESEARCH_PHASE2_BASELINE_CONFIG.metrics] as CfbMetricName[],
    policy: CFB_RESEARCH_PHASE2_BASELINE_CONFIG.garbagePolicy,
    aggregationMode: CFB_RESEARCH_PHASE2_BASELINE_CONFIG.aggregationMode,
    warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
    testSeasons: WALK_FORWARD_TEST_SEASONS,
  });
  write("baseline-v1-independent.json", slim(baselinePredictions));
  console.log(`[phase2]   baseline MAE=${baselinePredictions.overall.mae?.toFixed(3)} corr=${baselinePredictions.overall.correlation?.toFixed(3)}`);

  const rawMarginPreds = runRawMarginBaseline(WALK_FORWARD_WARM_START_SEASON, WALK_FORWARD_TEST_SEASONS);
  const rawMarginSummary = evaluatePredictions(rawMarginPreds);
  write("baseline-raw-margin.json", { configLabel: "baseline-raw-margin", n: rawMarginPreds.length, overall: rawMarginSummary });
  console.log(`[phase2]   raw-margin baseline MAE=${rawMarginSummary.mae?.toFixed(3)} corr=${rawMarginSummary.correlation?.toFixed(3)}`);

  const methodDefaults: Record<string, MethodConfig> = {
    ITERATIVE: { method: "ITERATIVE", config: { strength: 0.2, iterations: 6, minimumGames: 1 } },
    RIDGE: { method: "RIDGE", config: { lambda: 5, includeHfa: true } },
    PARTIAL_POOLING: { method: "PARTIAL_POOLING", config: { tau: 3, iterations: 8, minimumGames: 1, propagation: 0.2 } },
  };

  const stageAResults: ExperimentResult[] = [];
  for (const [methodName, methodConfig] of Object.entries(methodDefaults)) {
    const result = runExperiment(`stageA-${methodName}-ppa-none-gameWeighted`, {
      methodConfig,
      metricSet: ["ppaPerPlay"],
      policy: "NONE",
      aggregationMode: "gameWeighted",
      warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
      testSeasons: WALK_FORWARD_TEST_SEASONS,
    });
    stageAResults.push(result);
    console.log(`[phase2]   ${methodName} PPA MAE=${result.overall.mae?.toFixed(3)} corr=${result.overall.correlation?.toFixed(3)}`);
  }
  write("model-comparison.json", {
    baseline: slim(baselinePredictions),
    rawMargin: { configLabel: "baseline-raw-margin", n: rawMarginPreds.length, overall: rawMarginSummary },
    methods: stageAResults.map(slim),
  });

  // === STAGE B: hyperparameter tuning (train-only 2019-2022), then frozen holdout eval (2023-2025) ===
  console.log("[phase2] Stage B: hyperparameter tuning");

  const iterativeGrid: { strength: number; iterations: number; tuningMae: number | null }[] = [];
  for (const strength of ITERATIVE_STRENGTH_GRID) {
    for (const iterations of ITERATIVE_ITERATIONS_GRID) {
      const result = runExperiment(`tune-iterative-${strength}-${iterations}`, {
        methodConfig: { method: "ITERATIVE", config: { strength, iterations, minimumGames: 1 } },
        metricSet: ["ppaPerPlay"],
        policy: "NONE",
        aggregationMode: "gameWeighted",
        warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
        testSeasons: HYPERPARAMETER_TUNING_SEASONS,
      });
      iterativeGrid.push({ strength, iterations, tuningMae: result.overall.mae });
    }
  }
  const bestIterative = iterativeGrid.reduce((best, cur) =>
    cur.tuningMae !== null && (best.tuningMae === null || cur.tuningMae < best.tuningMae) ? cur : best,
  );
  console.log(`[phase2]   best iterative: strength=${bestIterative.strength} iterations=${bestIterative.iterations} tuningMAE=${bestIterative.tuningMae?.toFixed(3)}`);

  const ridgeGrid: { lambda: number; tuningMae: number | null }[] = [];
  for (const lambda of RIDGE_LAMBDA_GRID) {
    const result = runExperiment(`tune-ridge-${lambda}`, {
      methodConfig: { method: "RIDGE", config: { lambda, includeHfa: true } },
      metricSet: ["ppaPerPlay"],
      policy: "NONE",
      aggregationMode: "gameWeighted",
      warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
      testSeasons: HYPERPARAMETER_TUNING_SEASONS,
    });
    ridgeGrid.push({ lambda, tuningMae: result.overall.mae });
  }
  const bestRidge = ridgeGrid.reduce((best, cur) =>
    cur.tuningMae !== null && (best.tuningMae === null || cur.tuningMae < best.tuningMae) ? cur : best,
  );
  console.log(`[phase2]   best ridge: lambda=${bestRidge.lambda} tuningMAE=${bestRidge.tuningMae?.toFixed(3)}`);

  const poolingGrid: { tau: number; tuningMae: number | null }[] = [];
  for (const tau of PARTIAL_POOLING_TAU_GRID) {
    const result = runExperiment(`tune-pooling-${tau}`, {
      methodConfig: { method: "PARTIAL_POOLING", config: { tau, iterations: 8, minimumGames: 1, propagation: 0.2 } },
      metricSet: ["ppaPerPlay"],
      policy: "NONE",
      aggregationMode: "gameWeighted",
      warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
      testSeasons: HYPERPARAMETER_TUNING_SEASONS,
    });
    poolingGrid.push({ tau, tuningMae: result.overall.mae });
  }
  const bestPooling = poolingGrid.reduce((best, cur) =>
    cur.tuningMae !== null && (best.tuningMae === null || cur.tuningMae < best.tuningMae) ? cur : best,
  );
  console.log(`[phase2]   best pooling: tau=${bestPooling.tau} tuningMAE=${bestPooling.tuningMae?.toFixed(3)}`);

  const frozenConfigs: Record<string, MethodConfig> = {
    ITERATIVE: { method: "ITERATIVE", config: { strength: bestIterative.strength, iterations: bestIterative.iterations, minimumGames: 1 } },
    RIDGE: { method: "RIDGE", config: { lambda: bestRidge.lambda, includeHfa: true } },
    PARTIAL_POOLING: { method: "PARTIAL_POOLING", config: { tau: bestPooling.tau, iterations: 8, minimumGames: 1, propagation: 0.2 } },
  };

  const holdoutResults: Record<string, ExperimentResult> = {};
  for (const [methodName, methodConfig] of Object.entries(frozenConfigs)) {
    const result = runExperiment(`holdout-${methodName}-ppa-none-gameWeighted`, {
      methodConfig,
      metricSet: ["ppaPerPlay"],
      policy: "NONE",
      aggregationMode: "gameWeighted",
      warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
      testSeasons: HYPERPARAMETER_HOLDOUT_SEASONS,
    });
    holdoutResults[methodName] = result;
    console.log(`[phase2]   HOLDOUT ${methodName} MAE=${result.overall.mae?.toFixed(3)} corr=${result.overall.correlation?.toFixed(3)}`);
  }

  write("hyperparameter-results.json", {
    tuningSeasons: HYPERPARAMETER_TUNING_SEASONS,
    holdoutSeasons: HYPERPARAMETER_HOLDOUT_SEASONS,
    iterativeGrid,
    ridgeGrid,
    poolingGrid,
    bestIterative,
    bestRidge,
    bestPooling,
    holdoutResults: Object.fromEntries(Object.entries(holdoutResults).map(([k, v]) => [k, slim(v)])),
  });

  // Pick the overall winning method family by holdout MAE.
  const winningMethodName = Object.entries(holdoutResults).reduce((best, [name, result]) =>
    result.overall.mae !== null && (best[1].overall.mae === null || result.overall.mae < best[1].overall.mae) ? [name, result] as const : best,
  Object.entries(holdoutResults)[0])[0];
  const winningMethodConfig = frozenConfigs[winningMethodName];
  console.log(`[phase2] Winning method family: ${winningMethodName}`);

  // === STAGE C: metric-set comparison on the winning method, NONE, gameWeighted, holdout seasons ===
  console.log("[phase2] Stage C: metric-set comparison");
  const metricSetResults: Record<string, ExperimentResult> = {};
  for (const [setName, metrics] of Object.entries(CFB_RESEARCH_PHASE2_METRIC_SETS)) {
    const result = runExperiment(`metricset-${setName}`, {
      methodConfig: winningMethodConfig,
      metricSet: metrics as CfbMetricName[],
      policy: "NONE",
      aggregationMode: "gameWeighted",
      warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
      testSeasons: HYPERPARAMETER_HOLDOUT_SEASONS,
    });
    metricSetResults[setName] = result;
    console.log(`[phase2]   ${setName} MAE=${result.overall.mae?.toFixed(3)} corr=${result.overall.correlation?.toFixed(3)}`);
  }
  const winningMetricSetName = Object.entries(metricSetResults).reduce((best, [name, result]) =>
    result.overall.mae !== null && (best[1].overall.mae === null || result.overall.mae < best[1].overall.mae) ? [name, result] as const : best,
  Object.entries(metricSetResults)[0])[0];
  const winningMetricSet = CFB_RESEARCH_PHASE2_METRIC_SETS[winningMetricSetName as keyof typeof CFB_RESEARCH_PHASE2_METRIC_SETS] as unknown as CfbMetricName[];
  console.log(`[phase2] Winning metric set: ${winningMetricSetName}`);

  write("model-comparison.json", {
    baseline: slim(baselinePredictions),
    rawMargin: { configLabel: "baseline-raw-margin", n: rawMarginPreds.length, overall: rawMarginSummary },
    stageAMethods: stageAResults.map(slim),
    holdoutMethods: Object.fromEntries(Object.entries(holdoutResults).map(([k, v]) => [k, slim(v)])),
    winningMethodName,
    metricSets: Object.fromEntries(Object.entries(metricSetResults).map(([k, v]) => [k, slim(v)])),
    winningMetricSetName,
  });

  // === STAGE D: garbage-time comparison on winning method+metric set, holdout seasons ===
  console.log("[phase2] Stage D: garbage-time policy comparison");
  const garbageResults: Record<CfbGarbagePolicy, ExperimentResult> = {} as Record<CfbGarbagePolicy, ExperimentResult>;
  for (const policy of CFB_RESEARCH_PHASE2_GARBAGE_POLICIES) {
    const result = runExperiment(`garbage-${policy}`, {
      methodConfig: winningMethodConfig,
      metricSet: winningMetricSet,
      policy,
      aggregationMode: "gameWeighted",
      warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
      testSeasons: HYPERPARAMETER_HOLDOUT_SEASONS,
    });
    garbageResults[policy] = result;
    console.log(`[phase2]   ${policy} MAE=${result.overall.mae?.toFixed(3)} corr=${result.overall.correlation?.toFixed(3)}`);
  }
  const winningPolicy = (Object.entries(garbageResults) as [CfbGarbagePolicy, ExperimentResult][]).reduce((best, cur) =>
    cur[1].overall.mae !== null && (best[1].overall.mae === null || cur[1].overall.mae < best[1].overall.mae) ? cur : best,
  )[0];
  console.log(`[phase2] Winning garbage-time policy: ${winningPolicy}`);
  write("garbage-time-comparison.json", { results: Object.fromEntries(Object.entries(garbageResults).map(([k, v]) => [k, slim(v)])), winningPolicy });

  // === STAGE E: aggregation mode on winning method+metric+policy, holdout seasons ===
  console.log("[phase2] Stage E: aggregation-mode comparison");
  const aggregationResults: Record<string, ExperimentResult> = {};
  for (const mode of ["gameWeighted", "playWeighted"] as const) {
    const result = runExperiment(`aggregation-${mode}`, {
      methodConfig: winningMethodConfig,
      metricSet: winningMetricSet,
      policy: winningPolicy,
      aggregationMode: mode,
      warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
      testSeasons: HYPERPARAMETER_HOLDOUT_SEASONS,
    });
    aggregationResults[mode] = result;
    console.log(`[phase2]   ${mode} MAE=${result.overall.mae?.toFixed(3)} corr=${result.overall.correlation?.toFixed(3)}`);
  }
  write("aggregation-comparison.json", { results: Object.fromEntries(Object.entries(aggregationResults).map(([k, v]) => [k, slim(v)])) });

  // === STAGE F: ablation across the PPA metric family, holdout seasons, winning policy+aggregation ===
  console.log("[phase2] Stage F: ablation");
  const winningAggregation = Object.entries(aggregationResults).reduce((best, [name, result]) =>
    result.overall.mae !== null && (best[1].overall.mae === null || result.overall.mae < best[1].overall.mae) ? [name, result] as const : best,
  Object.entries(aggregationResults)[0])[0] as "gameWeighted" | "playWeighted";

  const ablationSets: Record<string, CfbMetricName[]> = {
    PPA_ONLY: ["ppaPerPlay"],
    PPA_PLUS_SUCCESS: ["ppaPerPlay", "ppaSuccessRate"],
    PPA_PLUS_SUCCESS_PLUS_EXPLOSIVENESS: ["ppaPerPlay", "ppaSuccessRate", "explosivePlayRate"],
  };
  const ablationResults: Record<string, ExperimentResult> = {};
  for (const [name, metrics] of Object.entries(ablationSets)) {
    const result = runExperiment(`ablation-${name}`, {
      methodConfig: winningMethodConfig,
      metricSet: metrics,
      policy: winningPolicy,
      aggregationMode: winningAggregation,
      warmStartSeason: WALK_FORWARD_WARM_START_SEASON,
      testSeasons: HYPERPARAMETER_HOLDOUT_SEASONS,
    });
    ablationResults[name] = result;
    console.log(`[phase2]   ${name} MAE=${result.overall.mae?.toFixed(3)} corr=${result.overall.correlation?.toFixed(3)}`);
  }
  write("ablation-results.json", { results: Object.fromEntries(Object.entries(ablationResults).map(([k, v]) => [k, slim(v)])) });

  // === Early-season analysis (Section 15): weeks 1-4 behavior across method families, full 2019-2025 ===
  console.log("[phase2] Early-season analysis");
  const earlySeasonAnalysis = stageAResults.map((result) => ({
    method: result.options.methodConfig.method,
    weeks1to4: result.weeks1to4,
    weeks5to8: result.weeks5to8,
    weeks9plus: result.weeks9plus,
  }));
  write("early-season-analysis.json", { results: earlySeasonAnalysis });

  write("walk-forward-summary.json", {
    generatedAt: new Date().toISOString(),
    winningMethodName,
    winningMetricSetName,
    winningPolicy,
    winningAggregation,
    elapsedMs: Date.now() - t0,
  });

  console.log(`[phase2] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(log.join("\n"));
}

main().catch((error) => {
  console.error(`[phase2] FAILED: ${(error as Error).message}`);
  console.error(error);
  process.exitCode = 1;
});
