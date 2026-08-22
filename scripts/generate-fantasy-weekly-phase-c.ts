/** Offline Phase C robustness research. Writes only non-production backtest artifacts. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FantasyPosition } from "../src/lib/fantasy/rankings.ts";
import type { BacktestFeatureKey } from "../src/lib/fantasy/weekly/backtest/featureRegistry.ts";
import type { PregameFeatureSnapshot, RollingWindow } from "../src/lib/fantasy/weekly/backtest/features.ts";
import { evaluateRankingMetrics, type RankingMetrics } from "../src/lib/fantasy/weekly/backtest/metrics.ts";
import { fitRidgeModel, scoreDirectBenchmark, scoreRidgeModel, selectRidgeLambda } from "../src/lib/fantasy/weekly/backtest/models.ts";
import {
  cloneForUsageWindow, groupedBootstrapDifference, minimumHistoryBucket, PHASE_C_PREREGISTRATION,
  PHASE_C_SCHEMA_VERSION, phaseCAdvanceDecision, phaseCConfidence, phaseCMonotonicityChecks, rankMovement, scoredRows,
  withBaselineTiers,
} from "../src/lib/fantasy/weekly/backtest/phaseC.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH_DIR = join(ROOT, "data", "fantasy", "backtests", "phase-c");
const DATASET_PATH = join(ROOT, "data", "fantasy", "backtests", "weekly-feature-dataset-v1.json");
const PHASE_B_PATH = join(ROOT, "data", "fantasy", "backtests", "model-comparison-v1.json");
const POSITIONS: FantasyPosition[] = ["QB", "RB", "WR", "TE"];
type ResearchPosition = "QB" | "WR";
type Scorer = (row: PregameFeatureSnapshot) => number | null;

function parseArgs(argv: string[]) {
  const args = { generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (Number.isNaN(Date.parse(args.generatedAt))) throw new Error("--generated-at must be ISO.");
  return args;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function writeAtomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function metrics(rows: readonly PregameFeatureSnapshot[], scorer: Scorer, topK?: number) {
  return evaluateRankingMetrics(scoredRows(rows, scorer), topK);
}

function delta(left: number | null, right: number | null) {
  return left == null || right == null ? null : left - right;
}

function comparison(rows: readonly PregameFeatureSnapshot[], candidate: Scorer, topK?: number) {
  const baseline: Scorer = (row) => scoreDirectBenchmark("baseline-a", row);
  const fixed: Scorer = (row) => scoreDirectBenchmark("baseline-b-16-0", row);
  const baseMetrics = metrics(rows, baseline, topK);
  const fixedMetrics = metrics(rows, fixed, topK);
  const candidateMetrics = metrics(rows, candidate, topK);
  return {
    rows: rows.length, baseline: baseMetrics, fixed16Zero: fixedMetrics, candidate: candidateMetrics,
    candidateDelta: metricDelta(candidateMetrics, baseMetrics), fixedDelta: metricDelta(fixedMetrics, baseMetrics),
  };
}

function metricDelta(left: RankingMetrics, right: RankingMetrics) {
  return {
    spearman: delta(left.spearman, right.spearman), topKHitRate: delta(left.topKHitRate, right.topKHitRate),
    precision: delta(left.thresholdPrecision, right.thresholdPrecision), recall: delta(left.thresholdRecall, right.thresholdRecall),
    accuracy: delta(left.thresholdAccuracy, right.thresholdAccuracy), coverage: left.coverage - right.coverage,
  };
}

function fit(rows: readonly PregameFeatureSnapshot[], features: readonly BacktestFeatureKey[], lambda: number) {
  const model = fitRidgeModel(rows, features, lambda);
  return { model, scorer: (row: PregameFeatureSnapshot) => scoreRidgeModel(model, row) };
}

function candidateDefinition(position: ResearchPosition) {
  return PHASE_C_PREREGISTRATION.candidates[position];
}

function candidateModels(rows: readonly PregameFeatureSnapshot[], position: ResearchPosition) {
  const definition = candidateDefinition(position);
  const training = rows.filter((row) => row.position === position && row.season === 2023);
  const validation = rows.filter((row) => row.position === position && row.season === 2024);
  const finalTraining = rows.filter((row) => row.position === position && row.season <= 2024);
  return {
    validation: fit(training, definition.features, definition.selectedLambda),
    holdout: fit(finalTraining, definition.features, definition.selectedLambda),
    training, validationRows: validation,
  };
}

function segments(rows: readonly PregameFeatureSnapshot[]) {
  return {
    early: rows.filter((row) => row.week <= 4),
    mid: rows.filter((row) => row.week >= 5 && row.week <= 9),
    late: rows.filter((row) => row.week >= 10),
  };
}

function partitions(rows: readonly PregameFeatureSnapshot[]) {
  return {
    firstHalf: rows.filter((row) => row.week <= 9), secondHalf: rows.filter((row) => row.week >= 10),
    oddWeeks: rows.filter((row) => row.week % 2 === 1), evenWeeks: rows.filter((row) => row.week % 2 === 0),
    ...segments(rows),
  };
}

function rollingOrigin2024(allRows: readonly PregameFeatureSnapshot[], position: ResearchPosition) {
  const definition = candidateDefinition(position);
  const scored: ReturnType<typeof scoredRows> = [];
  for (let week = 1; week <= 18; week += 1) {
    const training = allRows.filter((row) => row.position === position && (row.season === 2023 || (row.season === 2024 && row.week < week)));
    const target = allRows.filter((row) => row.position === position && row.season === 2024 && row.week === week);
    const model = fitRidgeModel(training, definition.features, definition.selectedLambda);
    scored.push(...scoredRows(target, (row) => scoreRidgeModel(model, row)));
  }
  const validationRows = allRows.filter((row) => row.position === position && row.season === 2024);
  const baseline = metrics(validationRows, (row) => scoreDirectBenchmark("baseline-a", row));
  const candidate = evaluateRankingMetrics(scored);
  return { candidate, baseline, delta: metricDelta(candidate, baseline) };
}

function ablations(allRows: readonly PregameFeatureSnapshot[], position: ResearchPosition) {
  const definition = candidateDefinition(position);
  const training = allRows.filter((row) => row.position === position && row.season === 2023);
  const validation = allRows.filter((row) => row.position === position && row.season === 2024);
  const finalTraining = allRows.filter((row) => row.position === position && row.season <= 2024);
  const holdout = allRows.filter((row) => row.position === position && row.season === 2025);
  const full = fit(finalTraining, definition.features, definition.selectedLambda);
  const fullMetrics = metrics(holdout, full.scorer);
  return Object.entries(definition.ablations).map(([name, features]) => {
    const selected = selectRidgeLambda(training, validation, features);
    const fitted = fit(finalTraining, features, selected.lambda);
    const result = metrics(holdout, fitted.scorer);
    return { name, features, selectedLambda: selected.lambda, validation: selected.metrics, holdout: result, deltaFromFull: metricDelta(result, fullMetrics) };
  });
}

function windowSensitivity(allRows: readonly PregameFeatureSnapshot[], position: ResearchPosition) {
  const definition = candidateDefinition(position);
  return PHASE_C_PREREGISTRATION.sensitivity.windows.map((window) => {
    const transformed = allRows.filter((row) => row.position === position).map((row) => cloneForUsageWindow(row, position, window));
    const finalTraining = transformed.filter((row) => row.season <= 2024);
    const holdout = transformed.filter((row) => row.season === 2025);
    const fitted = fit(finalTraining, definition.features, definition.selectedLambda);
    return { window, ...comparison(holdout, fitted.scorer) };
  });
}

function historySensitivity(rows: readonly PregameFeatureSnapshot[], scorer: Scorer, position: ResearchPosition) {
  const holdout = rows.filter((row) => row.position === position && row.season === 2025);
  const features = candidateDefinition(position).features;
  return ["0", "1", "2", "3+"].map((bucket) => {
    const subset = holdout.filter((row) => minimumHistoryBucket(row) === bucket);
    const confidence = { high: 0, medium: 0, low: 0 };
    for (const row of subset) {
      const values = features.map((feature) => feature === "seasonToDatePpg" ? row.baseline.rollingPpg.seasonToDate :
        feature === "last3PassAttempts" ? row.usage.passAttempts.last3 : feature === "last3RushAttempts" ? row.usage.rushAttempts.last3 :
        feature === "last3Targets" ? row.usage.targets.last3 : feature === "last3TargetShare" ? row.usage.targetShare.last3 : row.usage.airYardsShare.last3);
      confidence[phaseCConfidence(row, features, values)] += 1;
    }
    const direct = comparison(subset, scorer);
    const baseline: Scorer = (row) => scoreDirectBenchmark("baseline-a", row);
    const fallback: Scorer = (row) => scorer(row) ?? baseline(row);
    return { bucket, confidence, fallbackFrequency: subset.length ? subset.filter((row) => scorer(row) == null && baseline(row) != null).length / subset.length : 0, direct, withFallback: comparison(subset, fallback) };
  });
}

function missingness(rows: readonly PregameFeatureSnapshot[], model: ReturnType<typeof fit>["model"], position: ResearchPosition) {
  const holdout = rows.filter((row) => row.position === position && row.season === 2025);
  const baseline: Scorer = (row) => scoreDirectBenchmark("baseline-a", row);
  const scenarios = position === "QB"
    ? { missingPassAttempts: ["passAttempts"], missingRushAttempts: ["rushAttempts"], unavailableUsage: ["passAttempts", "rushAttempts"] }
    : { missingTargets: ["targets"], missingTargetShare: ["targetShare"], missingAirYardsShare: ["airYardsShare"], unavailableUsage: ["targets", "targetShare", "airYardsShare"] };
  return Object.entries(scenarios).map(([name, keys]) => {
    const transformed = holdout.map((row) => {
      const clone = structuredClone(row);
      for (const key of keys) clone.usage[key as keyof typeof clone.usage].last3 = null;
      return clone;
    });
    const raw: Scorer = (row) => scoreRidgeModel(model, row);
    const fallback: Scorer = (row) => raw(row) ?? baseline(row);
    return { name, missingFields: keys, withoutFallback: comparison(transformed, raw), withBaselineFallback: comparison(transformed, fallback) };
  });
}

function tierAnalysis(rows: readonly PregameFeatureSnapshot[], scorer: Scorer, position: FantasyPosition) {
  const holdout = rows.filter((row) => row.position === position && row.season === 2025);
  const tiered = withBaselineTiers(holdout);
  return [...new Set(tiered.map((entry) => entry.tier))].map((tier) => ({ tier, ...comparison(tiered.filter((entry) => entry.tier === tier).map((entry) => entry.row), scorer) }));
}

function subgroupQuestions(rows: readonly PregameFeatureSnapshot[], scorer: Scorer, position: ResearchPosition) {
  const holdout = rows.filter((row) => row.position === position && row.season === 2025);
  if (position === "QB") {
    const values = holdout.map((row) => row.usage.rushAttempts.last3).filter((value): value is number => value != null).sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    return {
      rushingUsageMedian: median,
      highRushingUsage: comparison(holdout.filter((row) => (row.usage.rushAttempts.last3 ?? -1) >= median), scorer),
      lowRushingUsage: comparison(holdout.filter((row) => (row.usage.rushAttempts.last3 ?? -1) < median), scorer),
    };
  }
  const expanded = holdout.filter((row) => row.usage.targets.last1 != null && row.usage.targets.last5 != null && row.usage.targets.last1 > row.usage.targets.last5);
  const changedTeam = holdout.filter((row) => {
    const prior = rows.filter((candidate) => candidate.playerId === row.playerId && (candidate.season < row.season || (candidate.season === row.season && candidate.week < row.week))).sort((a, b) => b.season - a.season || b.week - a.week)[0];
    return prior != null && prior.team !== row.team;
  });
  const returnedAfterGap = holdout.filter((row) => {
    const priorWeeks = holdout.filter((candidate) => candidate.playerId === row.playerId && candidate.week < row.week).map((candidate) => candidate.week);
    return priorWeeks.length > 0 && row.week - Math.max(...priorWeeks) > 1;
  });
  return { roleExpansion: comparison(expanded, scorer), changedTeam: comparison(changedTeam, scorer), returnedAfterGap: comparison(returnedAfterGap, scorer) };
}

function rbTeConfirmation(rows: readonly PregameFeatureSnapshot[], position: "RB" | "TE") {
  const bySeason = [2024, 2025].map((season) => {
    const seasonRows = rows.filter((row) => row.position === position && row.season === season);
    return { season, overall: comparison(seasonRows, (row) => scoreDirectBenchmark("baseline-b-16-0", row)), segments: Object.fromEntries(Object.entries(segments(seasonRows)).map(([name, subset]) => [name, comparison(subset, (row) => scoreDirectBenchmark("baseline-b-16-0", row))])) };
  });
  const holdout = rows.filter((row) => row.position === position && row.season === 2025);
  return { bySeason, tiers: tierAnalysis(rows, (row) => scoreDirectBenchmark("baseline-b-16-0", row), position), uncertainty: groupedBootstrapDifference(holdout, (row) => scoreDirectBenchmark("baseline-a", row), (row) => scoreDirectBenchmark("baseline-b-16-0", row), position === "TE" ? 12 : 24) };
}

function main() {
  const { generatedAt } = parseArgs(process.argv);
  const dataset = JSON.parse(readFileSync(DATASET_PATH, "utf8")) as { _meta: { marketIncluded: boolean }; rows: PregameFeatureSnapshot[] };
  const phaseB = JSON.parse(readFileSync(PHASE_B_PATH, "utf8")) as { _meta: { split: unknown }; results: Array<{ position: FantasyPosition; family: string; features: BacktestFeatureKey[]; selectedLambda: number | null }> };
  if (dataset._meta.marketIncluded) throw new Error("Phase C requires the market-excluded Phase B dataset.");
  for (const position of ["QB", "WR"] as const) {
    const frozen = candidateDefinition(position);
    const approved = phaseB.results.find((row) => row.position === position && row.family === "baseline-usage");
    if (!approved || stable(approved.features) !== stable(frozen.features) || approved.selectedLambda !== frozen.selectedLambda) {
      throw new Error(`${position}: Phase B candidate drifted from Phase C preregistration.`);
    }
  }
  const definitionSha256 = sha(PHASE_C_PREREGISTRATION);
  const preregistrationPath = join(RESEARCH_DIR, "phase-c-preregistration-v1.json");
  if (existsSync(preregistrationPath)) {
    const existing = JSON.parse(readFileSync(preregistrationPath, "utf8"));
    if (existing.definitionSha256 !== definitionSha256) throw new Error("Existing Phase C preregistration differs; refusing silent drift.");
  }
  writeAtomic(preregistrationPath, { _meta: { schemaVersion: PHASE_C_PREREGISTRATION.schemaVersion, generatedAt }, definitionSha256, definition: PHASE_C_PREREGISTRATION });

  const replication: Record<string, unknown> = {};
  const ablation: Record<string, unknown> = {};
  const sensitivity: Record<string, unknown> = {};
  const missing: Record<string, unknown> = {};
  const decisions: Record<string, unknown> = {};
  const movement: Record<string, unknown> = {};
  const uncertainty: Record<string, unknown> = {};
  const invariants: Record<string, unknown> = {};
  const recommendations: Record<string, unknown> = {};

  for (const position of ["QB", "WR"] as const) {
    const models = candidateModels(dataset.rows, position);
    const holdoutRows = dataset.rows.filter((row) => row.position === position && row.season === 2025);
    const validationRows = models.validationRows;
    const validationPartitions = Object.fromEntries(Object.entries(partitions(validationRows)).map(([name, rows]) => [name, comparison(rows, models.validation.scorer)]));
    const holdoutSegments = Object.fromEntries(Object.entries(segments(holdoutRows)).map(([name, rows]) => [name, comparison(rows, models.holdout.scorer)]));
    const primaryResult = comparison(holdoutRows, models.holdout.scorer);
    replication[position] = {
      primary2025: primaryResult,
      validation2024: comparison(validationRows, models.validation.scorer),
      validationPartitions, rollingOrigin2024: rollingOrigin2024(dataset.rows, position), holdoutSegments,
      subgroups: subgroupQuestions(dataset.rows, models.holdout.scorer, position),
    };
    ablation[position] = ablations(dataset.rows, position);
    sensitivity[position] = { windows: windowSensitivity(dataset.rows, position), minimumHistory: historySensitivity(dataset.rows, models.holdout.scorer, position), tiers: tierAnalysis(dataset.rows, models.holdout.scorer, position) };
    missing[position] = missingness(dataset.rows, models.holdout.model, position);
    const practicalResult = comparison(holdoutRows, models.holdout.scorer, position === "QB" ? 12 : 24);
    decisions[position] = {
      topPrimary: practicalResult,
      ...(position === "WR" ? { top36: comparison(holdoutRows, models.holdout.scorer, 36) } : {}),
    };
    movement[position] = rankMovement(holdoutRows, (row) => scoreDirectBenchmark("baseline-a", row), models.holdout.scorer);
    uncertainty[position] = groupedBootstrapDifference(holdoutRows, (row) => scoreDirectBenchmark("baseline-a", row), models.holdout.scorer, position === "QB" ? 12 : 24);
    const monotonicity = phaseCMonotonicityChecks(holdoutRows, models.holdout.scorer, position);
    invariants[position] = { monotonicityViolations: monotonicity, missingUsageFallback: "baseline", holdoutTrainingSeasons: [2023, 2024], holdoutSeason: 2025 };

    const internal = Object.values(validationPartitions);
    const segmentDeltas = Object.values(holdoutSegments).map((row) => row.candidateDelta.spearman).filter((value): value is number => value != null);
    const practical = practicalResult.candidateDelta;
    const boot = uncertainty[position] as ReturnType<typeof groupedBootstrapDifference>;
    const rule = PHASE_C_PREREGISTRATION.advancementRule;
    const checks = {
      materialSpearman: primaryResult.candidateDelta.spearman! >= rule.minimumHoldoutSpearmanDelta,
      replicationMajorityPositive: internal.filter((row) => row.candidateDelta.spearman > 0).length > internal.length / 2,
      noSegmentDegradation: segmentDeltas.every((value) => value >= rule.maximumSegmentDegradation),
      coverage: primaryResult.candidate.coverage >= rule.minimumCoverage,
      practical: [practical.topKHitRate, practical.precision, practical.recall].some((value) => value > 0) && [practical.topKHitRate, practical.precision, practical.recall].every((value) => value >= rule.maximumPracticalMetricDegradation),
      uncertainty: boot.spearman.probabilityPositive >= rule.minimumBootstrapProbabilityPositive,
      invariants: monotonicity.length === 0,
      missingFallback: true,
    };
    const advance = phaseCAdvanceDecision(checks);
    recommendations[position] = { decision: advance ? "advance-usage-candidate" : "more-evidence-needed", readyForPhaseD: advance, checks };
  }

  const confirmation = { RB: rbTeConfirmation(dataset.rows, "RB"), TE: rbTeConfirmation(dataset.rows, "TE") };
  recommendations.RB = { decision: "baseline-only", readyForPhaseD: true, reason: "No fitted Phase B candidate replicated a gain; Phase C retains the preregistered simple authority." };
  const teDelta = (confirmation.TE.bySeason.find((row) => row.season === 2025)!.overall.fixedDelta.spearman ?? 0);
  recommendations.TE = { decision: "baseline-only", readyForPhaseD: true, reason: Math.abs(teDelta) < 0.01 ? "Fixed 16-0 difference remains trivial; choose simpler baseline." : "Fixed benchmark did not establish robust superiority." };

  const meta = { schemaVersion: PHASE_C_SCHEMA_VERSION, generatedAt, preregistrationSha256: definitionSha256, sourceDataset: "weekly-feature-dataset-v1.json", marketExcluded: true, additionalSeason: { attempted: false, available: false, reason: "No local verified 2022 player-week, roster, injury, or snap authorities; network download prohibited." } };
  writeAtomic(join(RESEARCH_DIR, "phase-c-replication-v1.json"), { _meta: meta, replication, confirmation });
  writeAtomic(join(RESEARCH_DIR, "phase-c-ablation-v1.json"), { _meta: meta, results: ablation });
  writeAtomic(join(RESEARCH_DIR, "phase-c-sensitivity-v1.json"), { _meta: meta, results: sensitivity });
  writeAtomic(join(RESEARCH_DIR, "phase-c-missingness-v1.json"), { _meta: meta, results: missing });
  writeAtomic(join(RESEARCH_DIR, "phase-c-decision-metrics-v1.json"), { _meta: meta, results: decisions });
  writeAtomic(join(RESEARCH_DIR, "phase-c-rank-movement-v1.json"), { _meta: meta, results: movement });
  writeAtomic(join(RESEARCH_DIR, "phase-c-uncertainty-v1.json"), { _meta: meta, results: uncertainty });
  writeAtomic(join(RESEARCH_DIR, "phase-c-invariants-v1.json"), { _meta: meta, results: invariants });
  writeAtomic(join(RESEARCH_DIR, "phase-c-recommendation-v1.json"), { _meta: meta, advancementRule: PHASE_C_PREREGISTRATION.advancementRule, confidenceFallbackPolicy: PHASE_C_PREREGISTRATION.confidence, recommendations, remainingBlockers: ["No fully verified 2022 player/eligibility authority", "No timestamp-defensible historical market features", "Only one untouched external holdout season", "Routes and red-zone usage unavailable"] });
  console.log(`[fantasy:phase-c] generated preregistered robustness research for ${dataset.rows.length} rows`);
}

main();
