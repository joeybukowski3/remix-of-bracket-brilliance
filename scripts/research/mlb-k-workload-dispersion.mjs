/**
 * RESEARCH ONLY -- study mlb-k-archive-outcome-repair-and-workload-dispersion-v1
 *
 * DIAGNOSIS ONLY. Nothing here changes production. src/lib/mlb/kProjectionV2.ts
 * and scripts/mlb-k/compute-workload-projection.mjs are read for constants and
 * are not modified; no public artifact is written or mutated.
 *
 * Three questions, in order:
 *   A. Which archived outcomes are placeholders rather than appearances, and
 *      what does the baseline look like once they are gone?
 *   B. Is the projected batters-faced distribution too narrow, or is it only
 *      as narrow as a conditional mean is supposed to be?
 *   C. If it IS too narrow, does any leakage-safe workload variant fix it
 *      without costing accuracy -- alone, and combined with alpha = BF/(BF+125)?
 *
 * The market K line never enters an estimator. It is used only to bucket and
 * to score. See the helper tests for the enforced guard.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
  correlation,
  filterLeakageSafe,
  mean,
  median,
  quantile,
  rmse,
  stdev,
} from "./lib/mlb-k-research-helpers.mjs";

import {
  EXCLUSION_REASONS,
  classifyRow,
  exclusionCounts,
  partitionByOutcomeValidity,
} from "./lib/mlb-k-outcome-validity.mjs";

import {
  BF_CANDIDATES,
  BF_ESTIMATORS,
  IP_ESTIMATORS,
  expectedKsOverWorkload,
  seasonBfPerStart,
  shrunkWorkloadSd,
  startSeries,
} from "./lib/mlb-k-workload-estimators.mjs";

import {
  PRODUCTION_ALPHA,
  assertTemporalOrder,
  projectWithAlpha,
  rankCandidates,
  recoverLeagueAnchor,
  rollingOriginFolds,
  sampleSizeAlpha,
  temporalSplit,
} from "./lib/mlb-k-shrinkage-helpers.mjs";

import { LINE_BUCKET_SPEC, bucketTable, candidateMetrics, round } from "./lib/mlb-k-shrinkage-metrics.mjs";

const ROOT = process.cwd();
const BASE = path.join(ROOT, "data", "mlb", "k-research", "high-line-calibration");
const PRIOR = path.join(BASE, "shrinkage-experiment");
const OUT = path.join(BASE, "workload-dispersion");
mkdirSync(OUT, { recursive: true });

const STUDY_ID = "mlb-k-archive-outcome-repair-and-workload-dispersion-v1";
const SS_K = 125;

/** Prior-study figures, asserted rather than assumed. */
const PRIOR_BASELINE = { n: 958, mae: 1.799, signedError: 0.056, sdProjectedKs: 0.913 };

const writeJson = (file, payload) => writeFileSync(path.join(OUT, file), `${JSON.stringify(payload, null, 2)}\n`);

function writeCsv(file, rows) {
  if (!rows.length) {
    writeFileSync(path.join(OUT, file), "");
    return;
  }
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((header) => cell(row[header])).join(","));
  writeFileSync(path.join(OUT, file), `${lines.join("\n")}\n`);
}

// =================================================================================
// 1. LOAD, REPAIR, RE-FREEZE
// =================================================================================

const archive = JSON.parse(readFileSync(path.join(BASE, "pregame-archive.json"), "utf8"));
const seasonBfIndex = JSON.parse(readFileSync(path.join(PRIOR, "season-bf-index.json"), "utf8"));
const bfByKey = new Map(seasonBfIndex.entries.map((entry) => [`${entry.slateDate}|${entry.pitcherId}`, entry]));

const leakageSafe = filterLeakageSafe(archive.rows);
/**
 * classifyRow gates BOTH manifestations of the same Number(null) === 0 defect:
 * unresolved outcomes encoded as 0 K on 0 BF, and rows where the model declined
 * to project and the nulls became a projection of 0 strikeouts at a 0 K rate.
 */
const { kept: validOutcomeRows, excluded } = partitionByOutcomeValidity(leakageSafe, { classify: classifyRow });

writeJson("excluded-outcomes.json", {
  study: STUDY_ID,
  generatedAt: new Date().toISOString(),
  rule:
    "A row enters a graded sample only if BOTH its projection and its outcome are real: v2ProjectedKRate > 0, v2PitcherSkillRate > 0 and v2ProjectedBF > 0, AND actualBF > 0. Zero batters faced is the absence of a performance, not a performance of zero; a K rate of exactly 0 is below MIN_K_RATE and is not a projection any model produces.",
  defect:
    "scripts/research/mlb-k-extract-history.mjs coerces with Number(value); Number(null) === 0 and Number(\"\") === 0, so nulls became real zeroes in two places. (1) Scheduled-but-unplayed starters in public/data/mlb/top-k-performance.json carry null actualStrikeOuts / battersFaced and were admitted as 0 K on 0 BF. (2) Rows where kProjectionV2 returned confidence \"insufficient\" with null projectedStrikeouts / projectedKRate / pitcherSkillRate were admitted as a projection of 0. Both production artifacts are correct; only the research extractor misread them.",
  reasons: EXCLUSION_REASONS,
  priorLeakageSafeN: leakageSafe.length,
  cleanN: validOutcomeRows.length,
  excludedN: excluded.length,
  counts: exclusionCounts(excluded),
  rows: excluded.map((entry) => ({
    reason: entry.reason,
    slateDate: entry.row.slateDate,
    pitcher: entry.row.pitcher,
    pitcherId: entry.row.pitcherId,
    gamePk: entry.row.gamePk,
    kLine: entry.row.kLine,
    v2ProjectedKs: entry.row.v2ProjectedKs,
    actualKs: entry.row.actualKs,
    actualBF: entry.row.actualBF,
    actualOuts: entry.row.actualOuts,
    actualIP: entry.row.actualIP,
    actualPitches: entry.row.actualPitches,
    actualsSource: entry.row.actualsSource,
  })),
});

// Enrich, exactly as the prior study did, so the two are directly comparable.
const rows = validOutcomeRows
  .map((row) => {
    const bfEntry = bfByKey.get(`${row.slateDate}|${row.pitcherId}`) ?? null;
    return {
      ...row,
      leagueAnchor: recoverLeagueAnchor(row.v2OpponentEnvRate, row.v2MatchupAdjustment),
      seasonBattersFaced: bfEntry ? bfEntry.seasonBattersFaced : null,
      seasonGamesStarted: bfEntry ? bfEntry.seasonGamesStarted : null,
    };
  })
  .filter(
    (row) =>
      row.leagueAnchor !== null &&
      Number.isFinite(row.v2PitcherSkillRate) &&
      Number.isFinite(row.v2ProjectedBF),
  )
  .sort((a, b) => (a.slateDate < b.slateDate ? -1 : a.slateDate > b.slateDate ? 1 : 0));

/**
 * ERA NOTE. The archive spans two model versions. The alpha = 0.55 pitcher-skill
 * shrinkage landed on 2026-09-02, so only the last five slates (39 graded rows)
 * were SHIPPED through the model production runs today. The other 919 rows were
 * shipped un-shrunk: projectedKRate = pitcherSkillRate + matchupAdjustment.
 *
 * The v1 audit established this and the v2 shrinkage study therefore evaluated
 * production as a COUNTERFACTUAL REPLAY of alpha = 0.55 across every row. This
 * study keeps that convention, so "production" here means the same thing it
 * meant in the prior study and the baselines are directly comparable. The
 * as-shipped, era-mixed projection is carried alongside as projAsShipped and
 * reported for context only -- it is not the comparison baseline.
 */
function attachKProjections(list, { bfOf }) {
  return list.map((row) => {
    const bf = bfOf(row);
    const production = projectWithAlpha({
      alpha: PRODUCTION_ALPHA,
      pitcherSkillRate: row.v2PitcherSkillRate,
      leagueAnchor: row.leagueAnchor,
      matchupAdjustment: row.v2MatchupAdjustment,
      projectedBF: bf,
    });
    const ss = projectWithAlpha({
      alpha: sampleSizeAlpha(row.seasonBattersFaced, SS_K).alpha,
      pitcherSkillRate: row.v2PitcherSkillRate,
      leagueAnchor: row.leagueAnchor,
      matchupAdjustment: row.v2MatchupAdjustment,
      projectedBF: bf,
    });
    return {
      ...row,
      candidateBF: bf,
      projProduction: production ? production.projectedKs : null,
      projSsK125: ss ? ss.projectedKs : null,
      projAsShipped:
        Number.isFinite(bf) && Number.isFinite(row.v2ProjectedKRate) ? row.v2ProjectedKRate * bf : null,
    };
  });
}

const base = attachKProjections(rows, { bfOf: (row) => row.v2ProjectedBF });

const productionMetrics = candidateMetrics(base, "projProduction");
const ssMetrics = candidateMetrics(base, "projSsK125");
const asShippedMetrics = candidateMetrics(base, "projAsShipped");

/**
 * The replay invariant is era-scoped: on the slates where alpha = 0.55 was
 * actually live, the replay must reproduce the shipped projection exactly. On
 * the earlier slates it must NOT, because the shipped model had no shrinkage.
 */
const eraB = base.filter((row) => row.slateDate >= "2026-09-02");
const eraA = base.filter((row) => row.slateDate < "2026-09-02");
const eraBDrift = eraB.length
  ? Math.max(...eraB.map((row) => Math.abs(row.projProduction - row.projAsShipped)))
  : 0;
if (!(eraBDrift < 1e-9)) {
  throw new Error(`alpha=0.55 replay drifted from the shipped projection on era-B slates by ${eraBDrift}. Stopping.`);
}
/**
 * Era A shipped projectedKRate = pitcherSkillRate + matchupAdjustment, then the
 * same MIN/MAX K-rate clamp production applies today. Two rows sit on the 0.10
 * floor, so the identity is checked post-clamp.
 */
const clampRate = (value) => Math.min(0.4, Math.max(0.1, value));
const eraAUnshrunkMismatch = eraA.filter(
  (row) => Math.abs(row.v2ProjectedKRate - clampRate(row.v2PitcherSkillRate + row.v2MatchupAdjustment)) > 1e-9,
).length;
const eraAClampedRows = eraA.filter(
  (row) => row.v2ProjectedKRate <= 0.1 + 1e-9 || row.v2ProjectedKRate >= 0.4 - 1e-9,
).length;

const cleanBaseline = {
  study: STUDY_ID,
  generatedAt: new Date().toISOString(),
  priorStudy: { id: "mlb-k-high-line-calibration-v2-shrinkage", ...PRIOR_BASELINE },
  archiveRows: archive.rows.length,
  leakageSafeN: leakageSafe.length,
  excludedN: excluded.length,
  exclusionCounts: exclusionCounts(excluded),
  cleanN: base.length,
  eraSplit: {
    shrinkageLandedOn: "2026-09-02",
    eraA_preShrinkageN: eraA.length,
    eraB_alpha055N: eraB.length,
    eraBReplayMaxAbsDrift: eraBDrift,
    eraAUnshrunkFormulaMismatches: eraAUnshrunkMismatch,
    eraAKRateClampedRows: eraAClampedRows,
    note:
      "Only era B was shipped through today's model. 'production' below is the alpha=0.55 counterfactual replay across all rows, matching the prior study's convention; asShipped is the era-mixed archive output, for context only.",
  },
  slates: [...new Set(base.map((row) => row.slateDate))].length,
  dateRange: `${base[0].slateDate}..${base[base.length - 1].slateDate}`,
  counts: {
    highLineN: base.filter((row) => row.kLine >= 7).length,
    line75N: base.filter((row) => row.kLine > 6.5 && row.kLine <= 7.5).length,
    line85PlusN: base.filter((row) => row.kLine > 7.5).length,
  },
  production: productionMetrics,
  ssK125: ssMetrics,
  asShipped: asShippedMetrics,
  conclusionsStillHold: {
    ssImprovesMae: ssMetrics.mae < productionMetrics.mae,
    ssImprovesHighLineSignedError:
      Math.abs(ssMetrics.highLineSignedError) < Math.abs(productionMetrics.highLineSignedError),
    ssRaisesDispersion: ssMetrics.sdProjectedKs > productionMetrics.sdProjectedKs,
    dispersionStillShortOfActual: true,
  },
};

// =================================================================================
// 2. WORKLOAD CALIBRATION: BF AND IP
// =================================================================================

function distribution(values) {
  const list = values.filter(Number.isFinite);
  return {
    n: list.length,
    mean: round(mean(list), 4),
    median: round(median(list), 4),
    sd: round(stdev(list), 4),
    p10: round(quantile(list, 0.1), 3),
    p25: round(quantile(list, 0.25), 3),
    p50: round(quantile(list, 0.5), 3),
    p75: round(quantile(list, 0.75), 3),
    p90: round(quantile(list, 0.9), 3),
    p95: round(quantile(list, 0.95), 3),
    min: round(list.length ? Math.min(...list) : null, 3),
    max: round(list.length ? Math.max(...list) : null, 3),
  };
}

function calibration(list, projField, actualField) {
  const usable = list.filter((row) => Number.isFinite(row[projField]) && Number.isFinite(row[actualField]));
  const projected = usable.map((row) => row[projField]);
  const actual = usable.map((row) => row[actualField]);
  const errors = usable.map((row) => row[projField] - row[actualField]);
  return {
    n: usable.length,
    projected: distribution(projected),
    actual: distribution(actual),
    sdRatio: round(stdev(projected) / stdev(actual), 4),
    mae: round(mean(errors.map(Math.abs)), 4),
    rmse: round(rmse(errors), 4),
    signedError: round(mean(errors), 4),
    correlation: round(correlation(usable.map((row) => [row[projField], row[actualField]])), 4),
  };
}

const bfCalibration = calibration(base, "v2ProjectedBF", "actualBF");
const ipCalibration = calibration(base, "v2ProjectedInnings", "actualIP");

writeCsv(
  "bf-distribution.csv",
  ["projected", "actual"].map((which) => ({
    series: which === "projected" ? "projectedBF" : "actualBF",
    ...bfCalibration[which],
  })),
);
writeCsv(
  "ip-distribution.csv",
  ["projected", "actual"].map((which) => ({
    series: which === "projected" ? "projectedIP" : "actualIP",
    ...ipCalibration[which],
  })),
);

// =================================================================================
// 3. DISPERSION BY MARKET LINE AND BY PITCHER PROFILE
// =================================================================================

function workloadSlice(list, label) {
  const bf = calibration(list, "v2ProjectedBF", "actualBF");
  const ip = calibration(list, "v2ProjectedInnings", "actualIP");
  return {
    bucket: label,
    n: list.length,
    projBfMean: bf.projected.mean,
    projBfSd: bf.projected.sd,
    actualBfMean: bf.actual.mean,
    actualBfSd: bf.actual.sd,
    bfSdRatio: bf.sdRatio,
    bfSignedError: bf.signedError,
    bfMae: bf.mae,
    projIpMean: ip.projected.mean,
    projIpSd: ip.projected.sd,
    actualIpMean: ip.actual.mean,
    actualIpSd: ip.actual.sd,
    ipSdRatio: ip.sdRatio,
    ipSignedError: ip.signedError,
    ipMae: ip.mae,
  };
}

const sliceTable = (list, spec) =>
  spec
    .map((bucket) => {
      const subset = list.filter(bucket.test);
      return subset.length ? workloadSlice(subset, bucket.key) : null;
    })
    .filter(Boolean);

writeCsv("line-bucket-workload.csv", sliceTable(base, LINE_BUCKET_SPEC));

const SEASON_BF_SPEC = [
  { key: "<100 BF", test: (row) => row.seasonBattersFaced !== null && row.seasonBattersFaced < 100 },
  { key: "100-249 BF", test: (row) => row.seasonBattersFaced >= 100 && row.seasonBattersFaced < 250 },
  { key: "250-399 BF", test: (row) => row.seasonBattersFaced >= 250 && row.seasonBattersFaced < 400 },
  { key: "400+ BF", test: (row) => row.seasonBattersFaced >= 400 },
  { key: "season BF missing", test: (row) => row.seasonBattersFaced === null },
];
writeCsv("sample-size-workload.csv", sliceTable(base, SEASON_BF_SPEC));

/** Pregame-only volatility descriptors, computed from recent starts alone. */
const withProfile = base.map((row) => {
  const bfSeries = startSeries(row, "bf", 5);
  const ipSeries = startSeries(row, "ip", 5);
  const bfMean = mean(bfSeries);
  const bfSd = stdev(bfSeries);
  const otherIp = ipSeries.slice(1);
  const referenceIp = median(otherIp);
  return {
    ...row,
    recentBfN: bfSeries.length,
    recentBfMean: bfMean,
    recentBfSd: bfSd,
    recentBfCv: bfMean && bfMean > 0 && bfSd !== null ? bfSd / bfMean : null,
    recentPitchAverage: Number.isFinite(row.inPitchCountTrend) && row.inPitchCountTrend > 0 ? row.inPitchCountTrend : null,
    lastStartIp: ipSeries.length ? ipSeries[0] : null,
    hasRecentShortStart:
      ipSeries.length >= 4 && referenceIp !== null && referenceIp > 0 ? ipSeries[0] < 0.6 * referenceIp : false,
    hasRecentLongStart:
      ipSeries.length >= 4 && referenceIp !== null && referenceIp > 0 ? ipSeries[0] > 1.3 * referenceIp : false,
    lastStartUnder2Ip: ipSeries.length ? ipSeries[0] < 2 : false,
    seasonBfPerStart: seasonBfPerStart(row),
  };
});

const cvValues = withProfile.map((row) => row.recentBfCv).filter(Number.isFinite);
const cvMedian = median(cvValues);

const ROLE_SPEC = [
  {
    key: "established starter (>=15 GS)",
    test: (row) => Number.isFinite(row.seasonGamesStarted) && row.seasonGamesStarted >= 15,
  },
  {
    key: "mid-sample starter (5-14 GS)",
    test: (row) => Number.isFinite(row.seasonGamesStarted) && row.seasonGamesStarted >= 5 && row.seasonGamesStarted < 15,
  },
  {
    key: "limited-sample starter (<5 GS)",
    test: (row) => Number.isFinite(row.seasonGamesStarted) && row.seasonGamesStarted < 5,
  },
  { key: "games-started missing", test: (row) => !Number.isFinite(row.seasonGamesStarted) },
];

const VOLATILITY_SPEC = [
  { key: "stable recent workload (CV<=median)", test: (row) => Number.isFinite(row.recentBfCv) && row.recentBfCv <= cvMedian },
  { key: "volatile recent workload (CV>median)", test: (row) => Number.isFinite(row.recentBfCv) && row.recentBfCv > cvMedian },
  { key: "recent short outing", test: (row) => row.hasRecentShortStart === true },
  { key: "recent long outing", test: (row) => row.hasRecentLongStart === true },
  { key: "last start <2 IP", test: (row) => row.lastStartUnder2Ip === true },
];

const PITCH_COUNT_SPEC = [
  { key: "recent pitches <80", test: (row) => Number.isFinite(row.recentPitchAverage) && row.recentPitchAverage < 80 },
  {
    key: "recent pitches 80-89",
    test: (row) => Number.isFinite(row.recentPitchAverage) && row.recentPitchAverage >= 80 && row.recentPitchAverage < 90,
  },
  {
    key: "recent pitches 90-99",
    test: (row) => Number.isFinite(row.recentPitchAverage) && row.recentPitchAverage >= 90 && row.recentPitchAverage < 100,
  },
  { key: "recent pitches 100+", test: (row) => Number.isFinite(row.recentPitchAverage) && row.recentPitchAverage >= 100 },
];

writeCsv("recent-volatility.csv", [
  ...sliceTable(withProfile, ROLE_SPEC).map((row) => ({ slice: "role", ...row })),
  ...sliceTable(withProfile, VOLATILITY_SPEC).map((row) => ({ slice: "volatility", ...row })),
  ...sliceTable(withProfile, PITCH_COUNT_SPEC).map((row) => ({ slice: "pitchCount", ...row })),
]);

// =================================================================================
// 4. NAIVE WORKLOAD BASELINES
// =================================================================================

/**
 * Every estimator is scored on the SAME row set -- the rows where all of them
 * are defined -- so a difference in MAE is never a difference in coverage.
 */
function estimatorTable(list, estimators, actualField) {
  const names = Object.keys(estimators);
  const evaluable = list.filter((row) =>
    names.every((name) => Number.isFinite(estimators[name](row))) && Number.isFinite(row[actualField]),
  );
  return {
    commonN: evaluable.length,
    coverage: names.map((name) => ({
      estimator: name,
      definedN: list.filter((row) => Number.isFinite(estimators[name](row))).length,
    })),
    table: names.map((name) => {
      const predictions = evaluable.map((row) => estimators[name](row));
      const errors = evaluable.map((row, i) => predictions[i] - row[actualField]);
      return {
        estimator: name,
        n: evaluable.length,
        mae: round(mean(errors.map(Math.abs)), 4),
        rmse: round(rmse(errors), 4),
        signedError: round(mean(errors), 4),
        sdPrediction: round(stdev(predictions), 4),
        sdActual: round(stdev(evaluable.map((row) => row[actualField])), 4),
        sdRatio: round(stdev(predictions) / stdev(evaluable.map((row) => row[actualField])), 4),
        correlation: round(correlation(evaluable.map((row, i) => [predictions[i], row[actualField]])), 4),
      };
    }),
  };
}

const bfBaselines = estimatorTable(withProfile, BF_ESTIMATORS, "actualBF");
const ipBaselines = estimatorTable(withProfile, IP_ESTIMATORS, "actualIP");

writeCsv("naive-workload-baselines.csv", [
  ...bfBaselines.table.map((row) => ({ target: "battersFaced", commonN: bfBaselines.commonN, ...row })),
  ...ipBaselines.table.map((row) => ({ target: "innings", commonN: ipBaselines.commonN, ...row })),
]);

// =================================================================================
// 5. SHORT-START SENSITIVITY
// =================================================================================

const shortStartRows = withProfile.filter((row) => row.lastStartUnder2Ip === true);

const shortStartSensitivity = Object.keys(BF_ESTIMATORS).map((name) => {
  const subset = shortStartRows.filter(
    (row) => Number.isFinite(BF_ESTIMATORS[name](row)) && Number.isFinite(row.actualBF),
  );
  const predictions = subset.map((row) => BF_ESTIMATORS[name](row));
  const errors = subset.map((row, i) => predictions[i] - row.actualBF);
  return {
    estimator: name,
    n: subset.length,
    meanPrediction: round(mean(predictions), 4),
    meanActualBF: round(mean(subset.map((row) => row.actualBF)), 4),
    mae: round(mean(errors.map(Math.abs)), 4),
    rmse: round(rmse(errors), 4),
    signedError: round(mean(errors), 4),
    sdPrediction: round(stdev(predictions), 4),
  };
});

/**
 * The named case from the prior study: does one very short outing move the
 * production projection more than it moves the actual outcome?
 */
const gavinRows = withProfile
  .filter((row) => String(row.pitcher || "").includes("Gavin Williams"))
  .map((row) => ({
    slateDate: row.slateDate,
    kLine: row.kLine,
    recentStartsBf: startSeries(row, "bf", 5).join("|"),
    recentStartsIp: startSeries(row, "ip", 5)
      .map((v) => round(v, 2))
      .join("|"),
    lastStartIp: round(row.lastStartIp, 2),
    lastStartUnder2Ip: row.lastStartUnder2Ip,
    projectedBF: round(row.v2ProjectedBF, 3),
    robustBF: round(BF_CANDIDATES.robustShortStart(row), 3),
    seasonBfPerStart: round(row.seasonBfPerStart, 3),
    actualBF: row.actualBF,
    projectedKs: round(row.v2ProjectedKs, 3),
    actualKs: row.actualKs,
  }));

writeCsv("short-start-sensitivity.csv", [
  ...shortStartSensitivity.map((row) => ({ scope: "last start <2 IP", ...row })),
]);

// =================================================================================
// 6. CONDITIONAL-EXPECTATION THEORY CHECK
// =================================================================================

/**
 * A conditional mean is SUPPOSED to be narrower than the outcome. The variance
 * decomposition is exact:
 *
 *   Var(actual) = Var(E[actual | x]) + E[Var(actual | x)]
 *
 * so an estimator whose predictions have the same SD as the outcome is
 * over-dispersed, not well calibrated. The right question is not "is the SD
 * ratio below 1" but "does the estimator capture as much explainable variance
 * as competing conditional means do".
 *
 * The attainable-SD benchmark below is the SD an unbiased conditional mean with
 * this estimator's own correlation would have: r * SD(actual). An estimator
 * sitting well below its own r * SD(actual) is compressed beyond what its
 * predictive content justifies.
 */
function dispersionDiagnosis(list, projField, actualField, label) {
  const usable = list.filter((row) => Number.isFinite(row[projField]) && Number.isFinite(row[actualField]));
  const predictions = usable.map((row) => row[projField]);
  const actual = usable.map((row) => row[actualField]);
  const sdPrediction = stdev(predictions);
  const sdActual = stdev(actual);
  const r = correlation(usable.map((row) => [row[projField], row[actualField]]));
  const attainableSd = r === null ? null : Math.abs(r) * sdActual;
  // OLS slope of actual on prediction. A slope above 1 means the prediction
  // under-reacts: the same evidence should have been extrapolated further.
  const mp = mean(predictions);
  const ma = mean(actual);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < predictions.length; i += 1) {
    sxy += (predictions[i] - mp) * (actual[i] - ma);
    sxx += (predictions[i] - mp) ** 2;
  }
  const calibrationSlope = sxx > 0 ? sxy / sxx : null;
  return {
    target: label,
    n: usable.length,
    sdPrediction: round(sdPrediction, 4),
    sdActual: round(sdActual, 4),
    sdRatio: round(sdPrediction / sdActual, 4),
    correlation: round(r, 4),
    attainableSd: round(attainableSd, 4),
    sdVsAttainable: round(sdPrediction / attainableSd, 4),
    calibrationSlope: round(calibrationSlope, 4),
    verdict:
      calibrationSlope === null
        ? "undetermined"
        : calibrationSlope > 1.15
          ? "under-dispersed beyond conditional-mean expectation"
          : calibrationSlope < 0.85
            ? "over-dispersed"
            : "consistent with a healthy conditional mean",
  };
}

const dispersionChecks = [
  dispersionDiagnosis(base, "v2ProjectedBF", "actualBF", "battersFaced (production)"),
  dispersionDiagnosis(base, "v2ProjectedInnings", "actualIP", "innings (production)"),
  dispersionDiagnosis(base, "projProduction", "actualKs", "strikeouts (production alpha=0.55 replay)"),
  dispersionDiagnosis(base, "projSsK125", "actualKs", "strikeouts (ss-k125)"),
  dispersionDiagnosis(base, "projAsShipped", "actualKs", "strikeouts (as shipped, era-mixed)"),
];

// Naive conditional-mean competitors, for the "is the model narrower than its
// rivals" question that SD alone cannot answer.
const competitorDispersion = Object.keys(BF_ESTIMATORS).map((name) => {
  const list = withProfile
    .map((row) => ({ ...row, estimate: BF_ESTIMATORS[name](row) }))
    .filter((row) => Number.isFinite(row.estimate) && Number.isFinite(row.actualBF));
  return { estimator: name, ...dispersionDiagnosis(list, "estimate", "actualBF", `battersFaced (${name})`) };
});

// =================================================================================
// 7. PROBABILISTIC WORKLOAD
// =================================================================================

/**
 * Does representing workload UNCERTAINTY move the central estimate? With a
 * constant K rate it cannot, by linearity of expectation; the only channel is
 * the starter BF clamp truncating the workload distribution. This measures
 * that channel rather than asserting it is negligible.
 */
const leagueRecentBfSd = stdev(
  withProfile.map((row) => row.recentBfSd).filter(Number.isFinite),
);
const leagueBfSdLevel = mean(withProfile.map((row) => row.recentBfSd).filter(Number.isFinite));

/**
 * The rate integrated against must be the SAME rate the point estimate uses --
 * the alpha = 0.55 replay rate, not the era-mixed as-shipped rate -- or the era
 * difference would be mistaken for a workload-uncertainty effect.
 */
const probabilistic = attachKProjections(withProfile, { bfOf: (row) => row.v2ProjectedBF })
  .map((row) => {
    const replay = projectWithAlpha({
      alpha: PRODUCTION_ALPHA,
      pitcherSkillRate: row.v2PitcherSkillRate,
      leagueAnchor: row.leagueAnchor,
      matchupAdjustment: row.v2MatchupAdjustment,
      projectedBF: row.v2ProjectedBF,
    });
    const sd = shrunkWorkloadSd(row, { leagueSd: leagueBfSdLevel, k: 3 });
    const rate = replay ? replay.projectedKRate : null;
    return {
      ...row,
      workloadSd: sd,
      projIntegrated: expectedKsOverWorkload({
        kRate: rate,
        expectedBf: row.v2ProjectedBF,
        workloadSd: sd,
        clampBf: true,
      }),
      projIntegratedUnclamped: expectedKsOverWorkload({
        kRate: rate,
        expectedBf: row.v2ProjectedBF,
        workloadSd: sd,
        clampBf: false,
      }),
    };
  })
  .filter((row) => Number.isFinite(row.projIntegrated));

const probabilisticFindings = {
  leagueMeanRecentBfSd: round(leagueBfSdLevel, 4),
  sdOfPitcherRecentBfSd: round(leagueRecentBfSd, 4),
  n: probabilistic.length,
  pointEstimate: candidateMetrics(probabilistic, "projProduction"),
  integratedClamped: candidateMetrics(probabilistic, "projIntegrated"),
  integratedUnclamped: candidateMetrics(probabilistic, "projIntegratedUnclamped"),
  maxAbsShiftFromClampTruncation: round(
    Math.max(...probabilistic.map((row) => Math.abs(row.projIntegrated - row.projProduction))),
    4,
  ),
  maxAbsShiftUnclamped: round(
    Math.max(...probabilistic.map((row) => Math.abs(row.projIntegratedUnclamped - row.projProduction))),
    6,
  ),
  quantileWorkload: {
    p25Bf: round(mean(probabilistic.map((row) => row.v2ProjectedBF - 0.674 * row.workloadSd)), 3),
    p50Bf: round(mean(probabilistic.map((row) => row.v2ProjectedBF)), 3),
    p75Bf: round(mean(probabilistic.map((row) => row.v2ProjectedBF + 0.674 * row.workloadSd)), 3),
  },
  note:
    "With a constant K rate, E[K] = rate * E[BF] exactly, so integrating over workload uncertainty cannot move the central estimate. The only movement observed comes from the starter BF clamp truncating the workload distribution. Workload uncertainty belongs in an uncertainty band, not in the expected-K point estimate.",
};

// =================================================================================
// 8. WORKLOAD CANDIDATE GRID, AND COMBINATION WITH ss-k125
// =================================================================================

const candidateRows = Object.keys(BF_CANDIDATES).map((name) => {
  const list = withProfile
    .map((row) => ({ ...row, candidate: BF_CANDIDATES[name](row) }))
    .filter((row) => Number.isFinite(row.candidate) && Number.isFinite(row.actualBF));
  const errors = list.map((row) => row.candidate - row.actualBF);
  const diagnosis = dispersionDiagnosis(list, "candidate", "actualBF", name);
  return {
    candidate: name,
    n: list.length,
    bfMae: round(mean(errors.map(Math.abs)), 4),
    bfRmse: round(rmse(errors), 4),
    bfSignedError: round(mean(errors), 4),
    sdPredictedBf: round(stdev(list.map((row) => row.candidate)), 4),
    sdActualBf: round(stdev(list.map((row) => row.actualBF)), 4),
    bfSdRatio: diagnosis.sdRatio,
    bfCorrelation: diagnosis.correlation,
    bfCalibrationSlope: diagnosis.calibrationSlope,
    meanAbsShiftFromProduction: round(
      mean(list.map((row) => Math.abs(row.candidate - row.v2ProjectedBF))),
      4,
    ),
  };
});

writeCsv("workload-candidate-grid.csv", candidateRows);

/** The four-cell comparison the decision rule needs. */
const COMBINATIONS = [
  { id: "production", bf: "production", alpha: "production-0.55" },
  { id: "ss-k125-only", bf: "production", alpha: "ss-k125" },
];
for (const name of Object.keys(BF_CANDIDATES)) {
  if (name === "production") continue;
  COMBINATIONS.push({ id: `${name}-only`, bf: name, alpha: "production-0.55" });
  COMBINATIONS.push({ id: `ss-k125+${name}`, bf: name, alpha: "ss-k125" });
}

const combinationRows = COMBINATIONS.map((combo) => {
  const list = attachKProjections(withProfile, { bfOf: BF_CANDIDATES[combo.bf] });
  const field = combo.alpha === "ss-k125" ? "projSsK125" : "projProduction";
  const metrics = candidateMetrics(list, field);
  return {
    id: combo.id,
    bfModel: combo.bf,
    alphaModel: combo.alpha,
    n: metrics.n,
    mae: metrics.mae,
    rmse: metrics.rmse,
    signedError: metrics.signedError,
    sdProjectedKs: metrics.sdProjectedKs,
    p90ProjectedKs: metrics.p90ProjectedKs,
    p95ProjectedKs: metrics.p95ProjectedKs,
    maxProjectedKs: metrics.maxProjectedKs,
    pctAtLeast7: metrics.pctAtLeast7,
    pctAtLeast8: metrics.pctAtLeast8,
    highLineN: metrics.highLineN,
    highLineSignedError: metrics.highLineSignedError,
    line75N: metrics.line75N,
    line75SignedError: metrics.line75SignedError,
    line75PctUnder: metrics.line75PctUnder,
    line85N: metrics.line85N,
    line85SignedError: metrics.line85SignedError,
    line85PctUnder: metrics.line85PctUnder,
    lowMidLineMae: metrics.lowMidLineMae,
    directionalHitRate: metrics.directionalHitRate,
    directionalRecord: metrics.directionalRecord,
    directionalHitRateHighLine: metrics.directionalHitRateHighLine,
  };
});

writeCsv("combined-k125-workload.csv", combinationRows);

// =================================================================================
// 9. TEMPORAL VALIDATION -- clean archive, date-based splits only
// =================================================================================

const split = temporalSplit(withProfile, { devFraction: 0.6 });
const splitOrder = assertTemporalOrder(split.development, split.validation);
if (!splitOrder.ok) {
  throw new Error(`Temporal split leaked slates: ${splitOrder.violations.join(", ")}. Stopping.`);
}

const TEMPORAL_SUBJECTS = combinationRows
  .filter((row) => ["production", "ss-k125-only"].includes(row.id) || row.id.startsWith("ss-k125+"))
  .map((row) => ({ id: row.id, bf: row.bfModel, alpha: row.alphaModel }));

const temporalRows = [];
for (const subject of TEMPORAL_SUBJECTS) {
  for (const segment of [
    { name: "development", rows: split.development, range: `${split.devDates[0]}..${split.cutoffDate}` },
    {
      name: "validation",
      rows: split.validation,
      range: `${split.validationDates[0]}..${split.validationDates[split.validationDates.length - 1]}`,
    },
  ]) {
    const list = attachKProjections(segment.rows, { bfOf: BF_CANDIDATES[subject.bf] });
    const field = subject.alpha === "ss-k125" ? "projSsK125" : "projProduction";
    const metrics = candidateMetrics(list, field);
    temporalRows.push({
      scheme: "date-split",
      segment: segment.name,
      range: segment.range,
      id: subject.id,
      n: metrics.n,
      mae: metrics.mae,
      signedError: metrics.signedError,
      sdProjectedKs: metrics.sdProjectedKs,
      highLineN: metrics.highLineN,
      highLineSignedError: metrics.highLineSignedError,
      line75N: metrics.line75N,
      line85N: metrics.line85N,
      directionalHitRate: metrics.directionalHitRate,
    });
  }
}

for (const fold of rollingOriginFolds(withProfile, { folds: 4, minTrainDates: 20 })) {
  const order = assertTemporalOrder(fold.train, fold.test);
  if (!order.ok) throw new Error(`Rolling-origin fold ${fold.fold} leaked slates. Stopping.`);
  for (const subject of TEMPORAL_SUBJECTS) {
    const list = attachKProjections(fold.test, { bfOf: BF_CANDIDATES[subject.bf] });
    const field = subject.alpha === "ss-k125" ? "projSsK125" : "projProduction";
    const metrics = candidateMetrics(list, field);
    temporalRows.push({
      scheme: "rolling-origin",
      segment: `fold ${fold.fold}`,
      range: fold.testRange,
      id: subject.id,
      n: metrics.n,
      mae: metrics.mae,
      signedError: metrics.signedError,
      sdProjectedKs: metrics.sdProjectedKs,
      highLineN: metrics.highLineN,
      highLineSignedError: metrics.highLineSignedError,
      line75N: metrics.line75N,
      line85N: metrics.line85N,
      directionalHitRate: metrics.directionalHitRate,
    });
  }
}

writeCsv("temporal-validation.csv", temporalRows);

// =================================================================================
// 10. SUMMARIES
// =================================================================================

writeJson("clean-baseline.json", cleanBaseline);

writeJson("workload-summary.json", {
  study: STUDY_ID,
  generatedAt: new Date().toISOString(),
  pipelineMap: {
    producer: "scripts/mlb-k/compute-workload-projection.mjs (WORKLOAD_MODEL_VERSION mlb-k-workload-v2)",
    consumer: "scripts/lib/mlb-k-props-v2-shadow-core.mjs -> src/lib/mlb/kProjectionV2.ts",
    recentStartsUsed: "last 5 starts, oldest first at source; recency weights index+1 so the newest start carries the most weight",
    pitchLimit: "clamp(0.72*recentPitchWeightedMean + 0.28*leagueStarterPitches, 55, 115); weights flip to 0.45/0.55 with <3 samples",
    battersFaced: "clamp(0.65*(pitchLimit / max(3.2, opponentPitchesPerPA)) + 0.35*recentBfWeightedMean, 12, 30)",
    innings: "clamp(0.7*recentIpWeightedMean + 0.3*(expectedBF*leagueOutsPerBF/3), 3, 8.5)",
    opponentAdjustment: "opponentPitchesPerPA = 0.75*season + 0.25*recent14, defaulting to league 3.9, floored at 3.2 in the divisor",
    roleLogic: "reliever if >=3 appearances, <=1 start and >=70% relief; opener if >=2 starts and recency-weighted starter IP <= 2.5; else starter. Each role carries its own pitch/BF/IP clamps.",
    confidence: "0.5*completeness + 0.2*min(1, samples/5) + 0.15*(any K rate) + 0.15*(opponent PPA present), graded A-D; A/B are public-eligible",
    fallbacks: "kProjectionV2 falls back projectedInnings -> BF/bfPerInning -> mean of last 5 start IP (needs >=3); projectedBF -> innings*bfPerInning -> mean of last 5 start BF (needs >=3)",
    shrinkageAndSmoothing: "three stacked shrinkages toward league or toward a pitch-derived anchor: 0.28 on pitches, 0.65 on the pitch-derived BF, 0.3 on the BF-derived innings, each followed by a hard clamp",
    shortOutingTreatment: "NONE. A 1-inning injury exit enters the recency-weighted mean at full weight, and as the newest start it carries the LARGEST weight of the five.",
    lastStartUse: "the most recent start is weighted 5/15 of the recent term in every one of pitches, BF and IP",
  },
  bfCalibration,
  ipCalibration,
  dispersionChecks,
  competitorDispersion,
  probabilisticFindings,
  shortStart: {
    lastStartUnder2IpN: shortStartRows.length,
    sensitivity: shortStartSensitivity,
    gavinWilliams: gavinRows,
  },
  naiveBaselines: { battersFaced: bfBaselines, innings: ipBaselines },
});

// ---- decision rule ----
const productionBfDiagnosis = dispersionChecks[0];

/**
 * The workload candidate is selected on WORKLOAD accuracy only -- batters-faced
 * MAE then RMSE -- never on any strikeout or market-line metric. Ranking is
 * deterministic and falls through to the candidate name.
 */
const bestCandidate = rankCandidates(
  candidateRows.filter((row) => row.candidate !== "production").map((row) => ({ ...row, id: row.candidate })),
  [
    { key: "bfMae", direction: "asc" },
    { key: "bfRmse", direction: "asc" },
  ],
)[0];
const productionCandidate = candidateRows.find((row) => row.candidate === "production");

const combinedBest = combinationRows.find((row) => row.id === `ss-k125+${bestCandidate.candidate}`) ?? null;

/**
 * Reported separately and deliberately NOT used to pick the workload candidate:
 * choosing a workload model by its downstream strikeout MAE would be tuning the
 * workload term against the strikeout evaluation it is supposed to be judged
 * independently of.
 */
const bestCombinedByKMae = rankCandidates(
  combinationRows.filter((row) => row.id.startsWith("ss-k125+")),
  [
    { key: "mae", direction: "asc" },
    { key: "rmse", direction: "asc" },
  ],
)[0] ?? null;
const ssOnly = combinationRows.find((row) => row.id === "ss-k125-only");
const productionCombo = combinationRows.find((row) => row.id === "production");

const workloadDefect =
  productionBfDiagnosis.calibrationSlope !== null && productionBfDiagnosis.calibrationSlope > 1.15
    ? "CONFIRMED"
    : productionBfDiagnosis.calibrationSlope > 1.05
      ? "PARTIAL"
      : "NOT_CONFIRMED";

const candidateBeatsProduction =
  bestCandidate.bfMae < productionCandidate.bfMae && bestCandidate.bfRmse < productionCandidate.bfRmse;

const candidateVerdict = !candidateBeatsProduction
  ? bestCandidate.bfMae < productionCandidate.bfMae
    ? "PROMISING"
    : "FAIL"
  : bestCandidate.bfMae < productionCandidate.bfMae - 0.1
    ? "PASS"
    : "PROMISING";

const winnerSummary = {
  study: STUDY_ID,
  generatedAt: new Date().toISOString(),
  outcomeRepair: excluded.length > 0 && base.length + excluded.length === leakageSafe.length ? "COMPLETE" : "INCOMPLETE",
  workloadDispersionDefect: workloadDefect,
  workloadCandidate: candidateVerdict,
  bestWorkloadCandidate: bestCandidate,
  productionWorkloadReference: productionCandidate,
  combined: {
    production: productionCombo,
    ssK125Only: ssOnly,
    bestWorkloadOnly: combinationRows.find((row) => row.id === `${bestCandidate.candidate}-only`) ?? null,
    ssK125PlusBestWorkload: combinedBest,
    bestCombinationByStrikeoutMae: bestCombinedByKMae,
  },
  combinedVerdict:
    combinedBest && ssOnly && combinedBest.mae <= ssOnly.mae && Math.abs(combinedBest.highLineSignedError) <= Math.abs(ssOnly.highLineSignedError)
      ? "SHADOW_CANDIDATE"
      : "NOT_READY",
  promoted: false,
  note: "Diagnosis only. Nothing is promoted; production K projection math and every public artifact are untouched.",
};
writeJson("winner-summary.json", winnerSummary);

writeJson("research-metadata.json", {
  study: STUDY_ID,
  generatedAt: new Date().toISOString(),
  branch: "research/mlb-k-high-line-calibration",
  inputs: {
    archive: "data/mlb/k-research/high-line-calibration/pregame-archive.json",
    seasonBfIndex: "data/mlb/k-research/high-line-calibration/shrinkage-experiment/season-bf-index.json",
  },
  productionFilesRead: [
    "src/lib/mlb/kProjectionV2.ts",
    "scripts/mlb-k/compute-workload-projection.mjs",
    "scripts/lib/mlb-k-props-v2-shadow-core.mjs",
  ],
  productionFilesWritten: [],
  publicArtifactsWritten: [],
  ssAlphaK: SS_K,
  cleanN: base.length,
  excludedN: excluded.length,
  determinism: "No randomness anywhere in this study: every estimator, bucket and split is a pure function of the archive.",
});

// ---- console report ----
const line = (label, value) => console.log(`${label.padEnd(42)} ${value}`);
console.log(`\n=== ${STUDY_ID} ===\n`);
console.log("-- outcome repair --");
line("leakage-safe rows (prior)", leakageSafe.length);
line("excluded", `${excluded.length} ${JSON.stringify(exclusionCounts(excluded))}`);
line("clean replayable n", base.length);
line("era A (pre-shrinkage) / era B", `${eraA.length} / ${eraB.length}, era-B replay drift ${eraBDrift.toExponential(2)}`);
console.log("\n-- clean baseline --");
line("production MAE / signed / SD", `${productionMetrics.mae} / ${productionMetrics.signedError} / ${productionMetrics.sdProjectedKs}`);
line("ss-k125 MAE / signed / SD", `${ssMetrics.mae} / ${ssMetrics.signedError} / ${ssMetrics.sdProjectedKs}`);
line("as-shipped MAE / signed / SD", `${asShippedMetrics.mae} / ${asShippedMetrics.signedError} / ${asShippedMetrics.sdProjectedKs}`);
line("high-line n / signed (prod)", `${productionMetrics.highLineN} / ${productionMetrics.highLineSignedError}`);
line("high-line signed (ss-k125)", ssMetrics.highLineSignedError);
console.log("\n-- workload calibration --");
line("BF proj SD / actual SD / ratio", `${bfCalibration.projected.sd} / ${bfCalibration.actual.sd} / ${bfCalibration.sdRatio}`);
line("BF signed / MAE / r", `${bfCalibration.signedError} / ${bfCalibration.mae} / ${bfCalibration.correlation}`);
line("IP proj SD / actual SD / ratio", `${ipCalibration.projected.sd} / ${ipCalibration.actual.sd} / ${ipCalibration.sdRatio}`);
console.log("\n-- dispersion diagnosis --");
for (const check of dispersionChecks) {
  line(`  ${check.target}`, `slope ${check.calibrationSlope}, sd/attainable ${check.sdVsAttainable} -- ${check.verdict}`);
}
console.log("\n-- decision --");
line("OUTCOME REPAIR", winnerSummary.outcomeRepair);
line("WORKLOAD DISPERSION DEFECT", winnerSummary.workloadDispersionDefect);
line("WORKLOAD CANDIDATE", `${winnerSummary.workloadCandidate} (${bestCandidate.candidate})`);
line("COMBINED", winnerSummary.combinedVerdict);
console.log(`\nArtifacts written to ${path.relative(ROOT, OUT)}\n`);
