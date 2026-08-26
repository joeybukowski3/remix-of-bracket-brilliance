/**
 * Phase 3: baseline competition for the QB passing-opportunity target
 * (`primaryQbAttempts`). Reads the committed QB opportunity outcome
 * artifact (`npm run nfl:qb-opportunity-outcomes`) and the committed
 * historical market context artifact (`npm run nfl:historical-market-context`),
 * rebuilds team pregame features and the QB feature vector in-memory
 * (reusing Phase 2's exact leakage-safe window logic -- nothing here
 * recomputes a window differently), fits baselines A-D on the frozen
 * train/select/holdout split, and writes a report artifact. Does not fit
 * a passing-yard, matchup-score, or any efficiency model.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGameJoinIndex, type NflPropRawGameRecord } from "../src/lib/nfl/props/historicalOutcomes";
import { buildTeamGameLog, buildTeamPregameFeatures, type NflTeamGameLogEntry } from "../src/lib/nfl/props/teamPlayVolume";
import type { NflTeamGamePlayVolumeRecord, NflTeamPregameFeatures } from "../src/lib/nfl/props/types/teamPregameFeatures";
import type { NflQbOpportunityOutcome } from "../src/lib/nfl/props/types/qbOpportunity";
import {
  buildQbGameLog,
  buildQbOpportunityFeatureRow,
  marketKey,
  type NflHistoricalMarketRow,
} from "../src/lib/nfl/props/qbOpportunityFeatures";
import type { NflQbOpportunityFeatureRow } from "../src/lib/nfl/props/types/qbOpportunityFeatures";
import {
  ablateGroups,
  computeTrainFallbacks,
  encodeFeatureRow,
  FEATURE_GROUPS,
  type NflFeatureGroup,
} from "../src/lib/nfl/props/qbOpportunityEncoding";
import { computeBaselineConstants, predictBaselineA, predictBaselineB, predictBaselineC } from "../src/lib/nfl/props/qbOpportunityBaselines";
import { fitRidgeModel, scoreRidgeModel, RIDGE_ALPHA_GRID } from "../src/lib/nfl/props/ridge";
import { computeMetrics, metricsByGroup, totalBand, weekBand, type NflOpportunityPredictionPair } from "../src/lib/nfl/props/qbOpportunityEvaluation";
import { parseCsv } from "./lib/nfl-schedules-results-core.mjs";
import { verifyCacheEntry } from "./lib/nfl-source-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAY_VOLUME_CACHE_DIR = "data/nfl/nflverse/play-volume-team-game";
const DEFAULT_OUTPUT_DIR = join(ROOT, "data", "nfl", "props");

// Frozen split, decided before any result was viewed.
const TRAIN_SEASONS = [2022, 2023];
const SELECT_SEASON = 2024;
const HOLDOUT_SEASON = 2025;

type CsvRow = Record<string, string>;
type CacheEntry = { season: number | null; filename: string; [key: string]: unknown };
type CacheManifest = { files?: CacheEntry[] };

function parseArgs(argv: string[]) {
  const args = { output: null as string | null, generatedAt: new Date().toISOString() };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--output=")) args.output = resolve(ROOT, raw.slice(9));
    else if (raw.startsWith("--generated-at=")) args.generatedAt = raw.slice(15);
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function readManifest(relativeDir: string): CacheManifest {
  const path = join(ROOT, relativeDir, "manifest.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

function verifiedCsvRows(relativeDir: string, manifest: CacheManifest, season: number) {
  const entry = manifest.files?.find((c) => c.season === season);
  if (!entry) return null;
  const path = join(ROOT, relativeDir, entry.filename);
  const text = readFileSync(path, "utf8");
  const problems = verifyCacheEntry(entry as never, text);
  if (problems.length) throw new Error(problems.join("\n"));
  return parseCsv(text) as CsvRow[];
}

function toPlayVolumeRecord(row: CsvRow): NflTeamGamePlayVolumeRecord {
  const num = (field: string, integer: boolean) => {
    const text = String(row[field] ?? "").trim();
    const value = Number(text);
    if (text === "" || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
      throw new Error(`compact play-volume row field ${field} invalid: "${row[field]}"`);
    }
    return value;
  };
  return {
    gameId: String(row.game_id ?? "").trim(), season: num("season", true), week: num("week", true),
    team: String(row.team ?? "").trim(), opponent: String(row.opponent ?? "").trim(),
    eligiblePlays: num("eligible_plays", true), passPlays: num("pass_plays", true), rushPlays: num("rush_plays", true),
    neutralEligiblePlays: num("neutral_eligible_plays", true), neutralPassPlays: num("neutral_pass_plays", true),
    passOeSum: num("pass_oe_sum", false), passOeCount: num("pass_oe_count", true),
  };
}

function readSeasonGames(season: number): NflPropRawGameRecord[] {
  const path = join(ROOT, "public", "data", "nfl", String(season), "games.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { games?: NflPropRawGameRecord[] };
  return Array.isArray(parsed.games) ? parsed.games : [];
}

function writeAtomic(path: string, text: string) {
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

function splitFor(season: number): "train" | "select" | "holdout" | null {
  if (TRAIN_SEASONS.includes(season)) return "train";
  if (season === SELECT_SEASON) return "select";
  if (season === HOLDOUT_SEASON) return "holdout";
  return null;
}

const { output: outputOverride, generatedAt } = parseArgs(process.argv);
const ALL_SEASONS = [...TRAIN_SEASONS, SELECT_SEASON, HOLDOUT_SEASON];

// --- load inputs -----------------------------------------------------------

const outcomesPath = join(DEFAULT_OUTPUT_DIR, `qb-opportunity-outcomes-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(outcomesPath)) throw new Error(`Missing ${outcomesPath}. Run npm run nfl:qb-opportunity-outcomes first.`);
const outcomesArtifact = JSON.parse(readFileSync(outcomesPath, "utf8")) as { rows: NflQbOpportunityOutcome[] };

const marketPath = join(DEFAULT_OUTPUT_DIR, `historical-market-context-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
if (!existsSync(marketPath)) throw new Error(`Missing ${marketPath}. Run npm run nfl:historical-market-context first.`);
const marketArtifact = JSON.parse(readFileSync(marketPath, "utf8")) as { rows: NflHistoricalMarketRow[] };
const marketByKey = new Map(marketArtifact.rows.map((r) => [marketKey(r.season, r.week, r.team), r]));

const playVolumeManifest = readManifest(PLAY_VOLUME_CACHE_DIR);
const playVolumeRecords: NflTeamGamePlayVolumeRecord[] = [];
const allGames: NflPropRawGameRecord[] = [];
for (const season of ALL_SEASONS) {
  const rows = verifiedCsvRows(PLAY_VOLUME_CACHE_DIR, playVolumeManifest, season);
  if (!rows) throw new Error(`Play-volume source for ${season} not cached.`);
  for (const row of rows) playVolumeRecords.push(toPlayVolumeRecord(row));
  allGames.push(...readSeasonGames(season));
}
const gameJoinIndex = buildGameJoinIndex(allGames);
const fullTeamGameLog: NflTeamGameLogEntry[] = buildTeamGameLog(playVolumeRecords, gameJoinIndex);

const teamPregameFeaturesByKey = new Map<string, NflTeamPregameFeatures>();
for (const record of playVolumeRecords) {
  const features = buildTeamPregameFeatures(record, gameJoinIndex, fullTeamGameLog);
  teamPregameFeaturesByKey.set(`${record.season}|${record.week}|${record.team}`, features);
}

const outcomes = outcomesArtifact.rows.filter((o) => ALL_SEASONS.includes(o.season));
const qbGameLog = buildQbGameLog(outcomes, gameJoinIndex);

const featureRows: NflQbOpportunityFeatureRow[] = [];
for (const outcome of outcomes) {
  const split = splitFor(outcome.season);
  if (!split) continue;
  featureRows.push(
    buildQbOpportunityFeatureRow(outcome, {
      gameJoinIndex, teamPregameFeaturesByKey, fullTeamGameLog, marketByKey, qbGameLog, split,
    }),
  );
}

const trainRows = featureRows.filter((r) => r.split === "train");
const selectRows = featureRows.filter((r) => r.split === "select");
const holdoutRows = featureRows.filter((r) => r.split === "holdout");

// --- baselines A/B/C ---------------------------------------------------------

const baselineConstants = computeBaselineConstants(trainRows);

function pairsFor(rows: readonly NflQbOpportunityFeatureRow[], predict: (row: NflQbOpportunityFeatureRow) => number): NflOpportunityPredictionPair[] {
  return rows.map((row) => ({ actual: row.target.primaryQbAttempts, predicted: predict(row) }));
}

// --- baseline D: ridge, alpha selected on SELECT only -----------------------

const trainFallbacks = computeTrainFallbacks(trainRows);
const trainEncoded = trainRows.map((row) => encodeFeatureRow(row, trainFallbacks));
const trainTargets = trainRows.map((row) => row.target.primaryQbAttempts);

const alphaResults = RIDGE_ALPHA_GRID.map((alpha) => {
  const model = fitRidgeModel(trainEncoded, trainTargets, alpha);
  const selectPairs = selectRows.map((row) => ({
    actual: row.target.primaryQbAttempts,
    predicted: scoreRidgeModel(model, encodeFeatureRow(row, trainFallbacks)),
  }));
  const metrics = computeMetrics(selectPairs);
  return { alpha, mae: metrics?.mae ?? Infinity, model };
});
alphaResults.sort((a, b) => a.mae - b.mae);
const bestAlpha = alphaResults[0].alpha;
const bestRidgeModel = alphaResults[0].model;

function predictD(row: NflQbOpportunityFeatureRow): number {
  return scoreRidgeModel(bestRidgeModel, encodeFeatureRow(row, trainFallbacks));
}

// --- evaluation ---------------------------------------------------------------

const predictors: Record<string, (row: NflQbOpportunityFeatureRow) => number> = {
  baselineA_leagueMean: (row) => predictBaselineA(row, baselineConstants),
  baselineB_rollingMean: (row) => predictBaselineB(row, baselineConstants),
  baselineC_decomposition: (row) => predictBaselineC(row, baselineConstants),
  baselineD_ridge: predictD,
};

function evaluateSplit(rows: readonly NflQbOpportunityFeatureRow[]) {
  const result: Record<string, ReturnType<typeof computeMetrics>> = {};
  for (const [name, predict] of Object.entries(predictors)) {
    result[name] = computeMetrics(pairsFor(rows, predict));
  }
  return result;
}

function breakdowns(rows: readonly NflQbOpportunityFeatureRow[], predict: (row: NflQbOpportunityFeatureRow) => number) {
  return {
    bySeason: metricsByGroup(rows, (r) => String(r.season), (r) => ({ actual: r.target.primaryQbAttempts, predicted: predict(r) })),
    byWeekBand: metricsByGroup(rows, (r) => weekBand(r.week), (r) => ({ actual: r.target.primaryQbAttempts, predicted: predict(r) })),
    byFavoriteUnderdog: metricsByGroup(
      rows.filter((r) => r.features.market.spread != null && r.features.market.spread !== 0),
      (r) => (r.features.market.spread! < 0 ? "favorite" : "underdog"),
      (r) => ({ actual: r.target.primaryQbAttempts, predicted: predict(r) }),
    ),
    byHomeAway: metricsByGroup(
      rows.filter((r) => r.features.market.homeAway != null),
      (r) => r.features.market.homeAway as string,
      (r) => ({ actual: r.target.primaryQbAttempts, predicted: predict(r) }),
    ),
    byTotalBand: metricsByGroup(rows, (r) => totalBand(r.features.market.total), (r) => ({ actual: r.target.primaryQbAttempts, predicted: predict(r) })),
    byInstability: metricsByGroup(rows, (r) => r.diagnostics.instabilityCategory, (r) => ({ actual: r.target.primaryQbAttempts, predicted: predict(r) })),
  };
}

// --- feature-group ablation (best ridge alpha, refit on TRAIN, evaluated on SELECT) ---

const ablationResults: Record<string, ReturnType<typeof computeMetrics>> = {
  none: computeMetrics(pairsFor(selectRows, predictD)),
};
for (const group of FEATURE_GROUPS) {
  const excluded = new Set<NflFeatureGroup>([group]);
  const ablatedTrainEncoded = trainEncoded.map((row) => ablateGroups(row, trainFallbacks, excluded));
  const ablatedModel = fitRidgeModel(ablatedTrainEncoded, trainTargets, bestAlpha);
  const pairs = selectRows.map((row) => ({
    actual: row.target.primaryQbAttempts,
    predicted: scoreRidgeModel(ablatedModel, ablateGroups(encodeFeatureRow(row, trainFallbacks), trainFallbacks, excluded)),
  }));
  ablationResults[group] = computeMetrics(pairs);
}

// --- early-season prior analysis ---------------------------------------------

const week1Rows = featureRows.filter((r) => r.week === 1);
const week1WithPrior = week1Rows.filter((r) => r.features.qbRole.hasPriorSeasonStarts);
const week1WithoutPrior = week1Rows.filter((r) => !r.features.qbRole.hasPriorSeasonStarts);
const earlySeasonPriorAnalysis = {
  week1_withPriorSeasonQbHistory: computeMetrics(pairsFor(week1WithPrior, predictors.baselineB_rollingMean)),
  week1_withoutPriorSeasonQbHistory: computeMetrics(pairsFor(week1WithoutPrior, predictors.baselineB_rollingMean)),
  week1_leagueMeanOnly: computeMetrics(pairsFor(week1Rows, predictors.baselineA_leagueMean)),
  weeks2to3: computeMetrics(pairsFor(featureRows.filter((r) => r.week === 2 || r.week === 3), predictors.baselineB_rollingMean)),
};

// --- actual-target distribution -----------------------------------------------

function distribution(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length, min: sorted[0], max: sorted.at(-1),
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    median: sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
  };
}

const report = {
  _meta: {
    schemaVersion: "nfl-qb-opportunity-baseline-competition-v1",
    generatedAt,
    target: "primaryQbAttempts",
    split: { train: TRAIN_SEASONS, select: SELECT_SEASON, holdout: HOLDOUT_SEASON },
    rowCounts: { train: trainRows.length, select: selectRows.length, holdout: holdoutRows.length },
    ridgeAlphaGrid: RIDGE_ALPHA_GRID,
    ridgeAlphaSelectedOnSelectOnly: bestAlpha,
  },
  actualDistribution: {
    train: distribution(trainRows.map((r) => r.target.primaryQbAttempts)),
    select: distribution(selectRows.map((r) => r.target.primaryQbAttempts)),
    holdout: distribution(holdoutRows.map((r) => r.target.primaryQbAttempts)),
  },
  results: {
    train: evaluateSplit(trainRows),
    select: evaluateSplit(selectRows),
    holdout: evaluateSplit(holdoutRows),
  },
  breakdownsOnHoldout: {
    baselineB_rollingMean: breakdowns(holdoutRows, predictors.baselineB_rollingMean),
    baselineC_decomposition: breakdowns(holdoutRows, predictors.baselineC_decomposition),
    baselineD_ridge: breakdowns(holdoutRows, predictD),
  },
  stableVsFullSampleOnHoldout: {
    fullSample: computeMetrics(pairsFor(holdoutRows, predictD)),
    stableSingleQbOnly: computeMetrics(pairsFor(holdoutRows.filter((r) => r.diagnostics.instabilityCategory === "singleQbGame"), predictD)),
  },
  featureGroupAblationOnSelect_ridgeAlpha: bestAlpha,
  featureGroupAblationOnSelect: ablationResults,
  earlySeasonPriorAnalysis,
};

const output = outputOverride ?? join(DEFAULT_OUTPUT_DIR, `qb-opportunity-baseline-competition-${ALL_SEASONS[0]}-${ALL_SEASONS.at(-1)}.json`);
writeAtomic(output, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Wrote baseline competition report to ${output}`);
console.log(`Rows: train=${trainRows.length} select=${selectRows.length} holdout=${holdoutRows.length}`);
console.log(`Best ridge alpha (selected on SELECT only): ${bestAlpha}`);
console.log("Holdout MAE:", Object.fromEntries(Object.entries(report.results.holdout).map(([k, v]) => [k, v?.mae?.toFixed(3)])));
