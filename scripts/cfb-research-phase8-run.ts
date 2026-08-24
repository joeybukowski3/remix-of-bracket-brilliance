import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_PHASE8_EXPERIMENTS_DIR, PHASE8_HOLDOUT_SEASONS, PHASE8_TEST_SEASONS, PHASE8_TUNING_SEASONS } from "../src/lib/cfb/research/phase8/config";
import { runPhase8WalkForward } from "../src/lib/cfb/research/phase8/phase8WalkForward";
import {
  BASELINE_SPEC,
  buildBaseLambdaSweepSpecs,
  buildConnectivitySweepSpecs,
  buildJointSpec,
  buildStalenessSweepSpecs,
} from "../src/lib/cfb/research/phase8/candidateSpecs";
import { buildWeekGraphSnapshots } from "../src/lib/cfb/research/phase8/scheduleGraph";
import { loadTeamConferenceById } from "../src/lib/cfb/research/phase8/teamConference";
import { loadSeasonGames } from "../src/lib/cfb/research/phase2/loadTeamGameObservations";
import { evalRow, selectionScore } from "../src/lib/cfb/research/phase8/evaluation";
import { buildConnectivityBuckets, buildNonconferenceBuckets, buildSeasonRows, buildStalenessBuckets, buildTransitionTeamBuckets, buildWeekRangeRows } from "../src/lib/cfb/research/phase8/bucketAnalysis";
import { buildMarketGapDiagnostic } from "../src/lib/cfb/research/phase8/marketGapDiagnostic";
import { buildCoachingContinuityAblation, buildQbContinuityAblation } from "../src/lib/cfb/research/phase8/secondaryFeatureAblation";
import type { Phase8CandidateSpec, Phase8Prediction } from "../src/lib/cfb/research/phase8/types";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, CFB_RESEARCH_PHASE8_EXPERIMENTS_DIR);
mkdirSync(OUT_DIR, { recursive: true });

function writeArtifact(name: string, data: unknown): void {
  writeFileSync(resolve(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`[cfb:research:phase8:run] wrote ${name}`);
}

function assertNoNaNOrInfinity(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoNaNOrInfinity(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoNaNOrInfinity(v, `${path}.${k}`);
  }
}

function runOn(spec: Phase8CandidateSpec, seasons: readonly number[]): Phase8Prediction[] {
  return runPhase8WalkForward({ testSeasons: [...seasons], candidateSpec: spec });
}

async function main(): Promise<void> {
  const t0 = Date.now();

  // ---- Section 3 — graph connectivity summary (diagnostic, independent of any candidate) ----
  const graphSummaryBySeasonWeek: { season: number; week: number; componentCount: number; meanComponentSize: number }[] = [];
  for (const season of PHASE8_TEST_SEASONS) {
    const games = loadSeasonGames(season);
    const teamConf = loadTeamConferenceById(season);
    const snapshots = buildWeekGraphSnapshots(season, games, teamConf);
    for (const snap of snapshots) {
      const sizes = [...snap.byTeam.values()].map((m) => m.componentSize);
      graphSummaryBySeasonWeek.push({
        season,
        week: snap.week,
        componentCount: snap.componentCount,
        meanComponentSize: sizes.length === 0 ? 0 : sizes.reduce((s, v) => s + v, 0) / sizes.length,
      });
    }
  }
  writeArtifact("graph-connectivity-summary.json", {
    bySeasonWeek: graphSummaryBySeasonWeek,
    weeks1to3MeanComponentCount:
      graphSummaryBySeasonWeek.filter((r) => r.week <= 3).reduce((s, r) => s + r.componentCount, 0) / Math.max(1, graphSummaryBySeasonWeek.filter((r) => r.week <= 3).length),
    week4PlusMeanComponentCount:
      graphSummaryBySeasonWeek.filter((r) => r.week > 3).reduce((s, r) => s + r.componentCount, 0) / Math.max(1, graphSummaryBySeasonWeek.filter((r) => r.week > 3).length),
  });
  console.log(`[cfb:research:phase8:run] graph summary done (${Date.now() - t0}ms)`);

  // ---- Baseline ----
  const baselinePredictionsFull = runOn(BASELINE_SPEC, PHASE8_TEST_SEASONS);
  console.log(`[cfb:research:phase8:run] baseline full run done (${Date.now() - t0}ms)`);

  // ---- Section 11 — base-lambda sweep (GLOBAL_BASELINE) on TUNING seasons only ----
  const lambdaSweepResults = buildBaseLambdaSweepSpecs().map((spec) => {
    const preds = runOn(spec, PHASE8_TUNING_SEASONS);
    return { spec, score: selectionScore(preds) };
  });
  const bestLambdaResult = [...lambdaSweepResults].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity))[0];
  const bestBaseLambda = bestLambdaResult.spec.baseLambda;
  console.log(`[cfb:research:phase8:run] lambda sweep done, best=${bestBaseLambda} (${Date.now() - t0}ms)`);

  // ---- Section 5/11 — connectivity sweep on TUNING seasons ----
  const connectivitySweepResults = buildConnectivitySweepSpecs().map((spec) => {
    const preds = runOn(spec, PHASE8_TUNING_SEASONS);
    return { spec, score: selectionScore(preds) };
  });
  const bestConnectivityResult = [...connectivitySweepResults, bestLambdaResult].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity))[0];
  console.log(`[cfb:research:phase8:run] connectivity sweep done, best=${bestConnectivityResult.spec.id} score=${bestConnectivityResult.score} (${Date.now() - t0}ms)`);

  writeArtifact("connectivity-regularization-comparison.json", {
    tuningSeasons: PHASE8_TUNING_SEASONS,
    baseLambdaSweep: lambdaSweepResults.map((r) => ({ id: r.spec.id, baseLambda: r.spec.baseLambda, tuningScore: r.score })),
    connectivitySweep: connectivitySweepResults.map((r) => ({ id: r.spec.id, connectivity: r.spec.connectivity, baseLambda: r.spec.baseLambda, tuningScore: r.score })),
    bestOverall: { id: bestConnectivityResult.spec.id, connectivity: bestConnectivityResult.spec.connectivity, baseLambda: bestConnectivityResult.spec.baseLambda, tuningScore: bestConnectivityResult.score },
  });

  // ---- Section 7 — staleness diagnostics (reuse the best-lambda baseline's staleness values, informational) ----
  const bestLambdaBaselinePreds = runOn({ ...BASELINE_SPEC, baseLambda: bestBaseLambda }, PHASE8_TEST_SEASONS);
  const stalenessValues = bestLambdaBaselinePreds.flatMap((p) => [p.homeStaleness, p.awayStaleness]).filter((v): v is number => v !== null);
  const sortedStaleness = [...stalenessValues].sort((a, b) => a - b);
  const quantile = (q: number) => sortedStaleness[Math.floor(q * (sortedStaleness.length - 1))] ?? null;
  writeArtifact("staleness-diagnostics.json", {
    n: stalenessValues.length,
    mean: stalenessValues.length === 0 ? null : stalenessValues.reduce((s, v) => s + v, 0) / stalenessValues.length,
    p50: quantile(0.5),
    p80: quantile(0.8),
    p95: quantile(0.95),
    max: sortedStaleness[sortedStaleness.length - 1] ?? null,
  });
  console.log(`[cfb:research:phase8:run] staleness diagnostics done (${Date.now() - t0}ms)`);

  // ---- Section 8/12 — staleness sweep on TUNING seasons, at bestBaseLambda ----
  const stalenessSweepResults = buildStalenessSweepSpecs(bestBaseLambda).map((spec) => {
    const preds = runOn(spec, PHASE8_TUNING_SEASONS);
    return { spec, score: selectionScore(preds) };
  });
  const bestStalenessResult = [...stalenessSweepResults, bestLambdaResult].sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity))[0];
  console.log(`[cfb:research:phase8:run] staleness sweep done, best=${bestStalenessResult.spec.id} score=${bestStalenessResult.score} (${Date.now() - t0}ms)`);

  writeArtifact("adaptive-prior-comparison.json", {
    tuningSeasons: PHASE8_TUNING_SEASONS,
    baseLambda: bestBaseLambda,
    stalenessSweep: stalenessSweepResults.map((r) => ({ id: r.spec.id, staleness: r.spec.staleness, floor: r.spec.stalenessFloor, thresholdLow: r.spec.stalenessThresholdLow, thresholdHigh: r.spec.stalenessThresholdHigh, tuningScore: r.score })),
    bestOverall: { id: bestStalenessResult.spec.id, staleness: bestStalenessResult.spec.staleness, tuningScore: bestStalenessResult.score },
  });

  // ---- Section 10 — joint model ----
  const jointSpec = buildJointSpec(bestConnectivityResult.spec, bestStalenessResult.spec);
  const jointTuningPreds = runOn(jointSpec, PHASE8_TUNING_SEASONS);
  const jointTuningScore = selectionScore(jointTuningPreds);
  console.log(`[cfb:research:phase8:run] joint tuning done, score=${jointTuningScore} (${Date.now() - t0}ms)`);

  // ---- Final full-season (all test seasons) evaluation of the 4 frozen candidates ----
  const candidates: { key: string; spec: Phase8CandidateSpec }[] = [
    { key: "A_baseline", spec: BASELINE_SPEC },
    { key: "B_connectivity_only", spec: bestConnectivityResult.spec },
    { key: "C_staleness_only", spec: bestStalenessResult.spec },
    { key: "D_joint", spec: jointSpec },
  ];
  const fullPredictionsByKey = new Map<string, Phase8Prediction[]>();
  for (const c of candidates) {
    fullPredictionsByKey.set(c.key, c.key === "A_baseline" ? baselinePredictionsFull : runOn(c.spec, PHASE8_TEST_SEASONS));
    console.log(`[cfb:research:phase8:run] full run for ${c.key} done (${Date.now() - t0}ms)`);
  }

  const jointComparison = candidates.map((c) => {
    const preds = fullPredictionsByKey.get(c.key)!;
    return {
      key: c.key,
      spec: c.spec,
      overall: evalRow(preds),
      weeks1to4: evalRow(preds.filter((p) => p.week <= 4)),
      holdoutOverall: evalRow(preds.filter((p) => PHASE8_HOLDOUT_SEASONS.includes(p.season as (typeof PHASE8_HOLDOUT_SEASONS)[number]))),
    };
  });
  writeArtifact("joint-structural-comparison.json", { candidates: jointComparison, jointTuningScore });

  // ---- Section 13 — early-season primary analysis ----
  writeArtifact("early-season-analysis.json", {
    candidates: candidates.map((c) => ({ key: c.key, weekRanges: buildWeekRangeRows(fullPredictionsByKey.get(c.key)!) })),
  });

  // ---- Section 14/15/16 — bucket analyses (baseline vs joint, the two most informative comparisons) ----
  writeArtifact("connectivity-bucket-analysis.json", {
    baseline: buildConnectivityBuckets(fullPredictionsByKey.get("A_baseline")!),
    connectivityOnly: buildConnectivityBuckets(fullPredictionsByKey.get("B_connectivity_only")!),
    joint: buildConnectivityBuckets(fullPredictionsByKey.get("D_joint")!),
  });
  writeArtifact("staleness-bucket-analysis.json", {
    baseline: buildStalenessBuckets(fullPredictionsByKey.get("A_baseline")!),
    stalenessOnly: buildStalenessBuckets(fullPredictionsByKey.get("C_staleness_only")!),
    joint: buildStalenessBuckets(fullPredictionsByKey.get("D_joint")!),
  });
  writeArtifact("nonconference-analysis.json", {
    baseline: buildNonconferenceBuckets(fullPredictionsByKey.get("A_baseline")!),
    connectivityOnly: buildNonconferenceBuckets(fullPredictionsByKey.get("B_connectivity_only")!),
    joint: buildNonconferenceBuckets(fullPredictionsByKey.get("D_joint")!),
    transitionTeams: {
      baseline: buildTransitionTeamBuckets(fullPredictionsByKey.get("A_baseline")!),
      joint: buildTransitionTeamBuckets(fullPredictionsByKey.get("D_joint")!),
    },
  });

  // ---- Pick the Phase 8 finalist: best selectionScore across the FULL test-season run's overall+weeks1-4 (never on market) ----
  const finalistKey = jointComparison
    .map((c) => ({ key: c.key, score: c.overall.mae !== null && c.weeks1to4.mae !== null ? 0.5 * c.overall.mae + 0.5 * c.weeks1to4.mae : Infinity }))
    .sort((a, b) => a.score - b.score)[0].key;
  const finalistPredictions = fullPredictionsByKey.get(finalistKey)!;
  const finalistSpec = candidates.find((c) => c.key === finalistKey)!.spec;
  console.log(`[cfb:research:phase8:run] finalist=${finalistKey} (${Date.now() - t0}ms)`);

  // ---- Section 18/19 — secondary feature ablation on the finalist ----
  writeArtifact("secondary-feature-ablation.json", {
    finalist: finalistKey,
    qbContinuity: buildQbContinuityAblation(finalistPredictions),
    coachingContinuity: buildCoachingContinuityAblation(finalistPredictions, [...PHASE8_TEST_SEASONS]),
  });
  console.log(`[cfb:research:phase8:run] secondary ablation done (${Date.now() - t0}ms)`);

  // ---- Section 21 — market-gap diagnostic, AFTER independent selection ----
  writeArtifact("market-gap-diagnostic.json", {
    finalist: finalistKey,
    baseline: buildMarketGapDiagnostic(fullPredictionsByKey.get("A_baseline")!, [...PHASE8_TEST_SEASONS]),
    finalistDiagnostic: buildMarketGapDiagnostic(finalistPredictions, [...PHASE8_TEST_SEASONS]),
  });
  console.log(`[cfb:research:phase8:run] market gap diagnostic done (${Date.now() - t0}ms)`);

  // ---- Finalist artifact ----
  const baselineRow = jointComparison.find((c) => c.key === "A_baseline")!;
  const finalistRow = jointComparison.find((c) => c.key === finalistKey)!;
  const seasonStability = candidates.map((c) => ({ key: c.key, bySeason: buildSeasonRows(fullPredictionsByKey.get(c.key)!) }));
  writeArtifact("phase8-finalist.json", {
    finalistKey,
    finalistSpec,
    baselineOverall: baselineRow.overall,
    finalistOverall: finalistRow.overall,
    maeImprovement: baselineRow.overall.mae !== null && finalistRow.overall.mae !== null ? baselineRow.overall.mae - finalistRow.overall.mae : null,
    weeks1to4Improvement: baselineRow.weeks1to4.mae !== null && finalistRow.weeks1to4.mae !== null ? baselineRow.weeks1to4.mae - finalistRow.weeks1to4.mae : null,
    seasonStability,
    recommendation:
      finalistKey === "A_baseline"
        ? "NO-GO — no structural candidate materially improved on the frozen baseline within the tested grid."
        : "See report for the full GO/NO-GO writeup; this artifact records the numeric basis for that decision.",
  });

  assertNoNaNOrInfinity({ baselinePredictionsFull, jointComparison });
  console.log(`[cfb:research:phase8:run] done in ${Date.now() - t0}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
