/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v2 (shrinkage experiment)
 *
 * SHADOW EXPERIMENT. Nothing here changes production. src/lib/mlb/kProjectionV2.ts
 * is read for its constants only and is not modified; no public artifact is written.
 *
 * Question: can a shrinkage STRUCTURE (rather than the constant alpha = 0.55)
 * keep bulk calibration while restoring upper-tail reach?
 *
 * Families tested, each with every other model component frozen:
 *   A  alpha = seasonBF / (seasonBF + k)                     [sample size]
 *   B1 piecewise on a leakage-safe pregame skill percentile  [skill]
 *   B2 continuous one-sided ramp on excess skill             [skill]
 *   B3 logistic on excess skill                              [skill]
 *   C  A lifted modestly for high-skill pitchers             [combined]
 * plus constant-alpha reference points for context.
 *
 * The market line is never an input to any alpha function; it is used only for
 * evaluation and bucketing. See the helper tests for the enforced guard.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
  bootstrapMeanCi,
  filterLeakageSafe,
  mean,
  quantile,
} from "./lib/mlb-k-research-helpers.mjs";

import {
  MIN_PERCENTILE_POOL,
  PRODUCTION_ALPHA,
  SKILL_EXCESS_REFERENCE_SD,
  assertTemporalOrder,
  combinedAlpha,
  continuousSkillAlpha,
  logisticSkillAlpha,
  percentileInSortedPool,
  piecewisePercentileAlpha,
  projectWithAlpha,
  rankCandidates,
  recoverLeagueAnchor,
  rollingOriginFolds,
  sampleSizeAlpha,
  temporalSplit,
} from "./lib/mlb-k-shrinkage-helpers.mjs";

import {
  LINE_BUCKET_SPEC,
  SAMPLE_SIZE_BUCKET_SPEC,
  WORKLOAD_BUCKET_SPEC,
  bucketTable,
  candidateMetrics,
  round,
  skillBucketSpec,
} from "./lib/mlb-k-shrinkage-metrics.mjs";

const ROOT = process.cwd();
const BASE = path.join(ROOT, "data", "mlb", "k-research", "high-line-calibration");
const OUT = path.join(BASE, "shrinkage-experiment");
mkdirSync(OUT, { recursive: true });

const STUDY_ID = "mlb-k-high-line-calibration-v2-shrinkage";

// Prior-study baseline figures, asserted rather than assumed.
const BASELINE_EXPECTATIONS = {
  n: 958,
  mae: 1.799,
  signedError: 0.056,
  sdProjectedKs: 0.913,
  pctAtLeast7: 0.73,
  pctAtLeast8: 0,
  highLineSignedError: -1.126,
  line75PctUnder: 97.7,
  line85PctUnder: 100,
};
const BASELINE_TOLERANCE = 0.002;

const writeJson = (file, payload) =>
  writeFileSync(path.join(OUT, file), `${JSON.stringify(payload, null, 2)}\n`);

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

// ------------------------------- load and prepare -------------------------------

const archive = JSON.parse(readFileSync(path.join(BASE, "pregame-archive.json"), "utf8"));
const seasonBfIndex = JSON.parse(readFileSync(path.join(OUT, "season-bf-index.json"), "utf8"));
const bfByKey = new Map(seasonBfIndex.entries.map((entry) => [`${entry.slateDate}|${entry.pitcherId}`, entry]));

/**
 * Percentile pool. Built from EVERY archived pregame row (including rows with
 * no graded outcome), restricted to slates on or before the row's own slate.
 * A pitcher's pregame skill rate for a slate is known before first pitch for
 * every starter on that slate, so same-slate rows are admissible; later slates
 * are not. No outcome ever enters the pool.
 */
const poolRows = archive.rows
  .filter((row) => Number.isFinite(row.v2PitcherSkillRate) && row.slateDate)
  .map((row) => ({ slateDate: row.slateDate, skill: row.v2PitcherSkillRate }))
  .sort((a, b) => (a.slateDate < b.slateDate ? -1 : a.slateDate > b.slateDate ? 1 : 0));

const poolBySlate = new Map();
{
  const dates = [...new Set(poolRows.map((row) => row.slateDate))].sort();
  const running = [];
  let cursor = 0;
  for (const date of dates) {
    while (cursor < poolRows.length && poolRows[cursor].slateDate <= date) {
      running.push(poolRows[cursor].skill);
      cursor += 1;
    }
    poolBySlate.set(date, [...running].sort((a, b) => a - b));
  }
}

const rows = filterLeakageSafe(archive.rows)
  .map((row) => {
    const leagueAnchor = recoverLeagueAnchor(row.v2OpponentEnvRate, row.v2MatchupAdjustment);
    const bfEntry = bfByKey.get(`${row.slateDate}|${row.pitcherId}`) ?? null;
    const pool = poolBySlate.get(row.slateDate) ?? [];
    const usablePool = pool.length >= MIN_PERCENTILE_POOL;
    return {
      ...row,
      leagueAnchor,
      seasonBattersFaced: bfEntry ? bfEntry.seasonBattersFaced : null,
      seasonGamesStarted: bfEntry ? bfEntry.seasonGamesStarted : null,
      skillPercentile: usablePool ? percentileInSortedPool(pool, row.v2PitcherSkillRate) : null,
      skillPercentilePoolN: pool.length,
      skillExcessZ:
        leagueAnchor === null ? null : (row.v2PitcherSkillRate - leagueAnchor) / SKILL_EXCESS_REFERENCE_SD,
    };
  })
  .filter(
    (row) =>
      row.leagueAnchor !== null &&
      Number.isFinite(row.v2PitcherSkillRate) &&
      Number.isFinite(row.v2ProjectedBF),
  )
  .sort((a, b) => (a.slateDate < b.slateDate ? -1 : a.slateDate > b.slateDate ? 1 : 0));

// The league anchor is only recoverable while the matchup adjustment is inside
// its clamp. Assert that no row sits on the clamp before trusting the replay.
const clampedMatchupRows = rows.filter((row) => Math.abs(Math.abs(row.v2MatchupAdjustment) - 0.035) < 1e-9);

const dataIntegrity = {
  archiveRows: archive.rows.length,
  leakageSafeRows: filterLeakageSafe(archive.rows).length,
  replayableRows: rows.length,
  clampedMatchupRows: clampedMatchupRows.length,
  seasonBfCoverage: rows.filter((row) => row.seasonBattersFaced !== null).length,
  seasonBfMissing: rows.filter((row) => row.seasonBattersFaced === null).length,
  seasonBfZero: rows.filter((row) => row.seasonBattersFaced === 0).length,
  percentileFallbackRows: rows.filter((row) => row.skillPercentile === null).length,
  slates: [...new Set(rows.map((row) => row.slateDate))].length,
  dateRange: `${rows[0].slateDate}..${rows[rows.length - 1].slateDate}`,
  seasonBfQuantiles: {
    min: round(quantile(rows.map((row) => row.seasonBattersFaced), 0), 1),
    p10: round(quantile(rows.map((row) => row.seasonBattersFaced), 0.1), 1),
    p50: round(quantile(rows.map((row) => row.seasonBattersFaced), 0.5), 1),
    p90: round(quantile(rows.map((row) => row.seasonBattersFaced), 0.9), 1),
    max: round(quantile(rows.map((row) => row.seasonBattersFaced), 1), 1),
  },
  marketReference: {
    pctLinesAtLeast7: round((rows.filter((row) => row.kLine >= 7).length / rows.length) * 100, 2),
    pctLinesAtLeast8point5: round((rows.filter((row) => row.kLine >= 8.5).length / rows.length) * 100, 2),
    sdMarketLine: round(
      Math.sqrt(
        rows.map((row) => row.kLine).reduce((sum, value, _i, all) => {
          const m = all.reduce((s, v) => s + v, 0) / all.length;
          return sum + (value - m) ** 2;
        }, 0) /
          (rows.length - 1),
      ),
      4,
    ),
    pctActualAtLeast7: round((rows.filter((row) => row.actualKs >= 7).length / rows.length) * 100, 2),
    pctActualAtLeast8: round((rows.filter((row) => row.actualKs >= 8).length / rows.length) * 100, 2),
  },
};

if (clampedMatchupRows.length > 0) {
  throw new Error(
    `League anchor is not recoverable for ${clampedMatchupRows.length} rows sitting on the matchup clamp. Stopping.`,
  );
}

// ------------------------------- candidate catalogue -------------------------------

/**
 * Each candidate is a pure function row -> alpha. None of them may read
 * row.kLine, row.oddsOver, row.oddsUnder or row.actualKs.
 */
const candidates = [];

const addCandidate = (id, family, label, params, alphaOf) =>
  candidates.push({ id, family, label, params, alphaOf });

// -- reference constants (family R) --
addCandidate("const-0.55-production", "constant", "Production alpha 0.55", { alpha: 0.55 }, () => PRODUCTION_ALPHA);
for (const alpha of [0.7, 0.85, 1.0]) {
  addCandidate(`const-${alpha}`, "constant", `Constant alpha ${alpha}`, { alpha }, () => alpha);
}

// -- Variant A: sample size --
// Grid spans the theoretically motivated region: for a K rate near .22 with a
// true between-pitcher SD near .045, the beta-binomial prior weight is ~85 BF.
const SAMPLE_SIZE_GRID = [25, 50, 75, 85, 100, 125, 150, 200, 300, 500];
for (const k of SAMPLE_SIZE_GRID) {
  addCandidate(
    `ss-k${k}`,
    "sample-size",
    `alpha = BF / (BF + ${k})`,
    { k },
    (row) => sampleSizeAlpha(row.seasonBattersFaced, k).alpha,
  );
}

// -- Variant B1: piecewise percentile --
const PIECEWISE_GRID = [
  { id: "pw-mild", mid: 0.65, high: 0.75, top: 0.85 },
  { id: "pw-spec", mid: 0.7, high: 0.85, top: 0.95 },
  { id: "pw-spec-full", mid: 0.7, high: 0.85, top: 1.0 },
  { id: "pw-steep", mid: 0.75, high: 0.9, top: 1.0 },
  { id: "pw-toponly", mid: 0.55, high: 0.7, top: 1.0 },
];
for (const entry of PIECEWISE_GRID) {
  addCandidate(
    entry.id,
    "skill-piecewise",
    `piecewise pct: <p60 0.55, p80 ${entry.mid}, p90 ${entry.high}, p100 ${entry.top}`,
    { baseAlpha: 0.55, midAlpha: entry.mid, highAlpha: entry.high, topAlpha: entry.top },
    (row) =>
      piecewisePercentileAlpha(row.skillPercentile, {
        baseAlpha: PRODUCTION_ALPHA,
        midAlpha: entry.mid,
        highAlpha: entry.high,
        topAlpha: entry.top,
      }).alpha,
  );
}

// -- Variant B2: continuous one-sided ramp on excess skill --
for (const slope of [0.1, 0.15, 0.2, 0.25, 0.3, 0.4]) {
  addCandidate(
    `cont-slope${slope}`,
    "skill-continuous",
    `alpha = 0.55 + ${slope} * max(0, z), z = (skill - league) / ${SKILL_EXCESS_REFERENCE_SD}`,
    { baseAlpha: 0.55, slope },
    (row) => continuousSkillAlpha(row.v2PitcherSkillRate, row.leagueAnchor, { slope }).alpha,
  );
}
addCandidate(
  "cont-twosided-0.2",
  "skill-continuous",
  "alpha = 0.55 + 0.2 * z (two-sided; shrinks weak pitchers harder)",
  { baseAlpha: 0.55, slope: 0.2, twoSided: true },
  (row) => continuousSkillAlpha(row.v2PitcherSkillRate, row.leagueAnchor, { slope: 0.2, twoSided: true }).alpha,
);

// -- Variant B3: logistic on excess skill --
const LOGISTIC_GRID = [
  { id: "logi-m1.0-s0.6", midpointZ: 1.0, steepnessZ: 0.6 },
  { id: "logi-m1.25-s0.5", midpointZ: 1.25, steepnessZ: 0.5 },
  { id: "logi-m1.5-s0.5", midpointZ: 1.5, steepnessZ: 0.5 },
  { id: "logi-m1.0-s1.0", midpointZ: 1.0, steepnessZ: 1.0 },
];
for (const entry of LOGISTIC_GRID) {
  addCandidate(
    entry.id,
    "skill-logistic",
    `alpha = 0.55 + 0.45 * logistic((z - ${entry.midpointZ}) / ${entry.steepnessZ})`,
    { low: 0.55, high: 1.0, ...entry },
    (row) =>
      logisticSkillAlpha(row.v2PitcherSkillRate, row.leagueAnchor, {
        low: PRODUCTION_ALPHA,
        high: 1.0,
        midpointZ: entry.midpointZ,
        steepnessZ: entry.steepnessZ,
      }).alpha,
  );
}

// -- Variant C: combined. Evaluated only for context after A and B stand alone. --
for (const k of [85, 100, 150]) {
  for (const uplift of [0.05, 0.1, 0.15]) {
    addCandidate(
      `comb-k${k}-u${uplift}`,
      "combined",
      `alpha = BF/(BF+${k}) + ${uplift} * max(0, z)`,
      { k, uplift },
      (row) =>
        combinedAlpha({
          seasonBattersFaced: row.seasonBattersFaced,
          k,
          pitcherSkillRate: row.v2PitcherSkillRate,
          leagueKRate: row.leagueAnchor,
          uplift,
        }).alpha,
    );
  }
}

// ------------------------------- scoring -------------------------------

/** Materialises one candidate's projections onto a copy of the row set. */
function score(rowSet, candidate) {
  return rowSet.map((row) => {
    const alpha = candidate.alphaOf(row);
    const projection = projectWithAlpha({
      alpha,
      pitcherSkillRate: row.v2PitcherSkillRate,
      leagueAnchor: row.leagueAnchor,
      matchupAdjustment: row.v2MatchupAdjustment,
      projectedBF: row.v2ProjectedBF,
    });
    return {
      ...row,
      candidateAlpha: alpha,
      candidateKRate: projection ? projection.projectedKRate : null,
      projectedKs: projection ? projection.projectedKs : null,
    };
  });
}

const scored = new Map(candidates.map((candidate) => [candidate.id, score(rows, candidate)]));

function metricsFor(candidateId, rowSubset) {
  const list = rowSubset ?? scored.get(candidateId);
  return candidateMetrics(list, "projectedKs");
}

function alphaSummary(candidateId) {
  const list = scored.get(candidateId);
  const alphas = list.map((row) => row.candidateAlpha);
  return {
    meanAlpha: round(mean(alphas), 4),
    p10Alpha: round(quantile(alphas, 0.1), 4),
    p50Alpha: round(quantile(alphas, 0.5), 4),
    p90Alpha: round(quantile(alphas, 0.9), 4),
    minAlpha: round(quantile(alphas, 0), 4),
    maxAlpha: round(quantile(alphas, 1), 4),
  };
}

// ------------------------------- baseline freeze -------------------------------

const baselineRows = scored.get("const-0.55-production");
const baseline = metricsFor("const-0.55-production");

const baselineChecks = Object.entries(BASELINE_EXPECTATIONS).map(([key, expected]) => {
  const actual = key === "n" ? baseline.n : baseline[key];
  const delta = actual === null ? null : Math.abs(actual - expected);
  const tolerance = key === "n" ? 0 : key === "line75PctUnder" || key === "line85PctUnder" ? 0.06 : BASELINE_TOLERANCE;
  return { metric: key, expected, actual, delta: round(delta, 6), tolerance, ok: delta !== null && delta <= tolerance };
});
const baselineReproduced = baselineChecks.every((check) => check.ok);

if (!baselineReproduced) {
  console.error(JSON.stringify(baselineChecks, null, 2));
  throw new Error("Baseline did not reproduce the prior study within tolerance. STOPPING before any candidate work.");
}

const baselineHighLineCi = bootstrapMeanCi(
  baselineRows.filter((row) => row.kLine >= 7).map((row) => row.projectedKs - row.actualKs),
);

writeJson("baseline.json", {
  studyId: STUDY_ID,
  section: "baseline-freeze",
  generatedAt: new Date().toISOString(),
  productionAlpha: PRODUCTION_ALPHA,
  productionSource: "src/lib/mlb/kProjectionV2.ts (read only; NOT modified)",
  dataIntegrity,
  expectations: BASELINE_EXPECTATIONS,
  checks: baselineChecks,
  reproduced: baselineReproduced,
  metrics: baseline,
  alphaSummary: alphaSummary("const-0.55-production"),
  highLineSignedErrorCi: baselineHighLineCi
    ? { mean: round(baselineHighLineCi.mean, 4), lower: round(baselineHighLineCi.lower, 4), upper: round(baselineHighLineCi.upper, 4) }
    : null,
  lineBuckets: bucketTable(baselineRows, "projectedKs", LINE_BUCKET_SPEC),
});

// ------------------------------- temporal validation -------------------------------

const split = temporalSplit(rows, { devFraction: 0.6 });
const splitGuard = assertTemporalOrder(split.development, split.validation);
if (!splitGuard.ok) {
  throw new Error(`Temporal split leaks: ${splitGuard.violations.join(", ")}`);
}

const folds = rollingOriginFolds(rows, { folds: 4, minTrainDates: 12 });
for (const fold of folds) {
  const guard = assertTemporalOrder(fold.train, fold.test);
  if (!guard.ok) throw new Error(`Rolling fold ${fold.fold} leaks: ${guard.violations.join(", ")}`);
}

const devKeys = new Set(split.development.map((row) => `${row.slateDate}|${row.pitcherId}`));
const subsetOf = (candidateId, predicate) => scored.get(candidateId).filter(predicate);
const devRowsOf = (candidateId) => subsetOf(candidateId, (row) => devKeys.has(`${row.slateDate}|${row.pitcherId}`));
const valRowsOf = (candidateId) => subsetOf(candidateId, (row) => !devKeys.has(`${row.slateDate}|${row.pitcherId}`));

const splitDesign = {
  method: "leakage-safe temporal split by slate date, 60% of distinct dates to development",
  totalSlates: [...new Set(rows.map((row) => row.slateDate))].length,
  developmentSlates: split.devDates.length,
  validationSlates: split.validationDates.length,
  cutoffDate: split.cutoffDate,
  developmentRange: `${split.devDates[0]}..${split.devDates[split.devDates.length - 1]}`,
  validationRange: `${split.validationDates[0]}..${split.validationDates[split.validationDates.length - 1]}`,
  developmentRows: split.development.length,
  validationRows: split.validation.length,
  developmentHighLineRows: split.development.filter((row) => row.kLine >= 7).length,
  validationHighLineRows: split.validation.filter((row) => row.kLine >= 7).length,
  development75Rows: split.development.filter((row) => row.kLine > 6.5 && row.kLine <= 7.5).length,
  validation75Rows: split.validation.filter((row) => row.kLine > 6.5 && row.kLine <= 7.5).length,
  development85Rows: split.development.filter((row) => row.kLine > 7.5).length,
  validation85Rows: split.validation.filter((row) => row.kLine > 7.5).length,
  leakageGuard: splitGuard,
  rollingOriginFolds: folds.map((fold) => ({
    fold: fold.fold,
    trainRange: fold.trainRange,
    testRange: fold.testRange,
    testRows: fold.test.length,
    testHighLineRows: fold.test.filter((row) => row.kLine >= 7).length,
  })),
};

// ------------------------------- candidate report rows -------------------------------

function reportRow(candidate) {
  const pooled = metricsFor(candidate.id);
  const dev = candidateMetrics(devRowsOf(candidate.id), "projectedKs");
  const val = candidateMetrics(valRowsOf(candidate.id), "projectedKs");
  const alphas = alphaSummary(candidate.id);
  return {
    id: candidate.id,
    family: candidate.family,
    label: candidate.label,
    ...alphas,
    ...pooled,
    devN: dev.n,
    devMae: dev.mae,
    devSignedError: dev.signedError,
    devSdProjectedKs: dev.sdProjectedKs,
    devHighLineN: dev.highLineN,
    devHighLineSignedError: dev.highLineSignedError,
    devPctAtLeast7: dev.pctAtLeast7,
    devPctAtLeast8: dev.pctAtLeast8,
    devDirectionalHitRate: dev.directionalHitRate,
    valN: val.n,
    valMae: val.mae,
    valSignedError: val.signedError,
    valSdProjectedKs: val.sdProjectedKs,
    valHighLineN: val.highLineN,
    valHighLineSignedError: val.highLineSignedError,
    valPctAtLeast7: val.pctAtLeast7,
    valPctAtLeast8: val.pctAtLeast8,
    valDirectionalHitRate: val.directionalHitRate,
  };
}

const report = new Map(candidates.map((candidate) => [candidate.id, reportRow(candidate)]));

// ------------------------------- promotion gates -------------------------------

/**
 * Gates are evaluated on the POOLED archive, with the temporal split reported
 * alongside. A gate that only the development half clears is not a pass.
 */
function evaluateGates(row) {
  const b = baseline;
  const improvement =
    row.highLineSignedError === null ? null : (Math.abs(b.highLineSignedError) - Math.abs(row.highLineSignedError)) / Math.abs(b.highLineSignedError);
  const gates = {
    g1_maeNotWorse: { value: row.mae, threshold: b.mae, pass: row.mae !== null && row.mae <= b.mae + 1e-9 },
    g2_highLineSignedErrorImproves: {
      value: row.highLineSignedError,
      improvementFraction: round(improvement, 4),
      threshold: "abs(signed error) reduced by >= 25% and not overshot past +1.126",
      pass: improvement !== null && improvement >= 0.25 && row.highLineSignedError <= Math.abs(b.highLineSignedError),
    },
    g3_dispersionRises: {
      value: row.sdProjectedKs,
      threshold: ">= 1.20 (baseline 0.913, target ~1.4)",
      pass: row.sdProjectedKs !== null && row.sdProjectedKs >= 1.2,
    },
    g4_pctAtLeast7InBand: {
      value: row.pctAtLeast7,
      threshold: "4.0% - 7.5% (market lines >= 7 are 5.64% of rows)",
      pass: row.pctAtLeast7 !== null && row.pctAtLeast7 >= 4 && row.pctAtLeast7 <= 7.5,
    },
    g5_pctAtLeast8Plausible: {
      value: row.pctAtLeast8,
      threshold: "> 0% and <= 2.5%",
      pass: row.pctAtLeast8 !== null && row.pctAtLeast8 > 0 && row.pctAtLeast8 <= 2.5,
    },
    g6_lowMidLineNotDegraded: {
      value: row.lowMidLineMae,
      threshold: `<= ${round(b.lowMidLineMae + 0.02, 4)} (baseline ${b.lowMidLineMae} + 0.02)`,
      pass: row.lowMidLineMae !== null && row.lowMidLineMae <= b.lowMidLineMae + 0.02,
    },
    g7_directionalNotMateriallyWorse: {
      value: row.directionalHitRate,
      threshold: `>= ${round(b.directionalHitRate - 1, 2)} (baseline ${b.directionalHitRate} - 1.0pp)`,
      pass: row.directionalHitRate !== null && row.directionalHitRate >= b.directionalHitRate - 1,
    },
  };
  const passed = Object.values(gates).filter((gate) => gate.pass).length;
  return { gates, gatesPassed: passed, gatesTotal: Object.keys(gates).length, allPass: passed === Object.keys(gates).length };
}

for (const [id, row] of report) {
  const verdict = evaluateGates(row);
  row.gatesPassed = verdict.gatesPassed;
  row.allGatesPass = verdict.allPass;
  report.set(id, row);
}

const gateDetail = Object.fromEntries([...report].map(([id, row]) => [id, evaluateGates(row)]));

// ------------------------------- overcorrection checks -------------------------------

function overcorrectionCheck(candidateId) {
  const row = report.get(candidateId);
  const b = baseline;
  return {
    id: candidateId,
    tooMany7: row.pctAtLeast7 !== null && row.pctAtLeast7 > 7.5,
    tooMany8: row.pctAtLeast8 !== null && row.pctAtLeast8 > 2.5,
    inflatedP95: row.p95ProjectedKs !== null && row.p95ProjectedKs > 8.0,
    worseLowLineMae: row.lowLineMae !== null && row.lowLineMae > b.lowLineMae + 0.02,
    worseOverallMae: row.mae !== null && row.mae > b.mae,
    overProjectsWeakPitchers: (() => {
      const list = scored.get(candidateId);
      const q25 = quantile(list.map((entry) => entry.v2PitcherSkillRate), 0.25);
      const weak = list.filter((entry) => entry.v2PitcherSkillRate < q25);
      const weakSigned = mean(weak.map((entry) => entry.projectedKs - entry.actualKs));
      const baseWeak = mean(
        baselineRows
          .filter((entry) => entry.v2PitcherSkillRate < q25)
          .map((entry) => entry.projectedKs - entry.actualKs),
      );
      return { weakSignedError: round(weakSigned, 4), baselineWeakSignedError: round(baseWeak, 4), worse: weakSigned > baseWeak + 0.15 };
    })(),
    dispersionVsMarket: {
      sdProjectedKs: row.sdProjectedKs,
      sdMarketLine: dataIntegrity.marketReference.sdMarketLine,
      sdActualKs: round(
        Math.sqrt(
          rows.map((r) => r.actualKs).reduce((sum, value, _i, all) => {
            const m = all.reduce((s, v) => s + v, 0) / all.length;
            return sum + (value - m) ** 2;
          }, 0) /
            (rows.length - 1),
        ),
        4,
      ),
      exceedsMarketDispersion: row.sdProjectedKs !== null && row.sdProjectedKs > dataIntegrity.marketReference.sdMarketLine,
    },
  };
}

// --------------------- how much reach can alpha buy at all? ---------------------

/**
 * Sweeps a constant alpha, including values ABOVE 1. Alpha > 1 is not a legal
 * shrinkage weight -- it inflates the pitcher's skill estimate away from the
 * league mean rather than pulling it toward it -- and is swept here only to
 * locate the alpha the dispersion gates would require. Nothing above 1 is a
 * candidate.
 */
const alphaCeiling = [0.55, 0.7, 0.85, 1.0, 1.1, 1.25, 1.5, 2.0].map((alpha) => {
  const projected = rows.map((row) => {
    const shrunk = row.leagueAnchor + alpha * (row.v2PitcherSkillRate - row.leagueAnchor);
    const kRate = Math.min(0.4, Math.max(0.1, shrunk + row.v2MatchupAdjustment));
    return { ...row, projectedKs: kRate * row.v2ProjectedBF };
  });
  const m = candidateMetrics(projected, "projectedKs");
  return {
    alpha,
    legalShrinkage: alpha <= 1,
    mae: m.mae,
    sdProjectedKs: m.sdProjectedKs,
    pctAtLeast7: m.pctAtLeast7,
    pctAtLeast8: m.pctAtLeast8,
    maxProjectedKs: m.maxProjectedKs,
    highLineSignedError: m.highLineSignedError,
    directionalHitRate: m.directionalHitRate,
  };
});

const sdOf = (values) => {
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
};

/**
 * Why the upper tail stays short even at alpha = 1: projected strikeouts are
 * kRate * projectedBF, and BOTH factors are compressed relative to outcomes.
 * The prior study rejected workload BIAS (the mean projected BF is right);
 * this is a statement about workload DISPERSION, which is a different claim.
 */
const actualBfRows = rows.filter((row) => Number.isFinite(row.actualBF) && row.actualBF > 0);
const tailCeiling = {
  question: "Can any alpha in [0,1] reach the dispersion gates?",
  answer: "No. The gates require alpha near 1.25, which is inflation, not shrinkage.",
  sdProjectedKsAtAlpha1: alphaCeiling.find((entry) => entry.alpha === 1).sdProjectedKs,
  sdProjectedKsTarget: 1.4,
  sdMarketLine: dataIntegrity.marketReference.sdMarketLine,
  sdActualKs: round(sdOf(rows.map((row) => row.actualKs)), 4),
  pctAtLeast7AtAlpha1: alphaCeiling.find((entry) => entry.alpha === 1).pctAtLeast7,
  pctAtLeast7Target: "4.0-7.5",
  workloadDispersion: {
    sdProjectedBF: round(sdOf(rows.map((row) => row.v2ProjectedBF)), 4),
    sdActualBF: round(sdOf(actualBfRows.map((row) => row.actualBF)), 4),
    meanProjectedBF: round(mean(rows.map((row) => row.v2ProjectedBF)), 4),
    meanActualBF: round(mean(actualBfRows.map((row) => row.actualBF)), 4),
    maxProjectedBF: round(Math.max(...rows.map((row) => row.v2ProjectedBF)), 4),
    maxActualBF: round(Math.max(...actualBfRows.map((row) => row.actualBF)), 4),
    note:
      "Projected BF is centred correctly (mean matches) but only ~70% as dispersed as actual BF, " +
      "and its maximum is far below the observed maximum. This refines -- it does not reverse -- " +
      "the prior finding that workload BIAS is not the driver.",
  },
  rateNeededForEightKs: {
    atMedianProjectedBF: round(8 / quantile(rows.map((row) => row.v2ProjectedBF), 0.5), 4),
    atMaxProjectedBF: round(8 / Math.max(...rows.map((row) => row.v2ProjectedBF)), 4),
    rawSkillP95: round(quantile(rows.map((row) => row.v2PitcherSkillRate), 0.95), 4),
    rawSkillMax: round(quantile(rows.map((row) => row.v2PitcherSkillRate), 1), 4),
    note:
      "An 8-K projection needs a K rate near .358 at a median workload. The 95th percentile of the " +
      "UNSHRUNK pitcher skill rate is .296, so alpha = 1 still cannot get there at a typical workload.",
  },
};

writeCsv("alpha-ceiling.csv", alphaCeiling);

// ---------------------- rolling-origin folds for the shortlist ----------------------

function foldMetrics(candidateId) {
  const list = scored.get(candidateId);
  const byKey = new Map(list.map((row) => [`${row.slateDate}|${row.pitcherId}`, row]));
  return folds.map((fold) => {
    const test = fold.test.map((row) => byKey.get(`${row.slateDate}|${row.pitcherId}`)).filter(Boolean);
    const m = candidateMetrics(test, "projectedKs");
    return {
      candidate: candidateId,
      fold: fold.fold,
      trainRange: fold.trainRange,
      testRange: fold.testRange,
      n: m.n,
      mae: m.mae,
      signedError: m.signedError,
      sdProjectedKs: m.sdProjectedKs,
      highLineN: m.highLineN,
      highLineSignedError: m.highLineSignedError,
      pctAtLeast7: m.pctAtLeast7,
      directionalHitRate: m.directionalHitRate,
    };
  });
}

// ------------------------------- winners per family -------------------------------

const RANK_KEYS = [
  { key: "gatesPassed", direction: "desc" },
  { key: "mae", direction: "asc" },
  { key: "highLineSignedError", direction: "desc" },
];

function bestOf(family) {
  const pool = [...report.values()].filter((row) => row.family === family);
  return rankCandidates(pool, RANK_KEYS)[0] ?? null;
}

const bestSampleSize = bestOf("sample-size");
const bestPiecewise = bestOf("skill-piecewise");
const bestContinuous = bestOf("skill-continuous");
const bestLogistic = bestOf("skill-logistic");
const bestSkill = rankCandidates(
  [bestPiecewise, bestContinuous, bestLogistic].filter(Boolean),
  RANK_KEYS,
)[0];
const bestCombined = bestOf("combined");
const bestOverall = rankCandidates(
  [...report.values()].filter((row) => row.family !== "constant"),
  RANK_KEYS,
)[0];

function classify(family) {
  const pool = [...report.values()].filter((row) => row.family === family);
  if (pool.some((row) => row.allGatesPass)) return "PASS";
  const best = rankCandidates(pool, RANK_KEYS)[0];
  if (best && best.gatesPassed >= 5) return "PROMISING";
  return "FAIL";
}

const familyVerdicts = {
  "sample-size": classify("sample-size"),
  "skill-piecewise": classify("skill-piecewise"),
  "skill-continuous": classify("skill-continuous"),
  "skill-logistic": classify("skill-logistic"),
  combined: classify("combined"),
};

// ------------------------------- artifacts -------------------------------

const csvColumns = (row) => ({
  id: row.id,
  family: row.family,
  label: row.label,
  meanAlpha: row.meanAlpha,
  p10Alpha: row.p10Alpha,
  p50Alpha: row.p50Alpha,
  p90Alpha: row.p90Alpha,
  n: row.n,
  mae: row.mae,
  rmse: row.rmse,
  signedError: row.signedError,
  sdProjectedKs: row.sdProjectedKs,
  p75ProjectedKs: row.p75ProjectedKs,
  p90ProjectedKs: row.p90ProjectedKs,
  p95ProjectedKs: row.p95ProjectedKs,
  maxProjectedKs: row.maxProjectedKs,
  pctAtLeast7: row.pctAtLeast7,
  pctAtLeast8: row.pctAtLeast8,
  highLineN: row.highLineN,
  highLineSignedError: row.highLineSignedError,
  line75N: row.line75N,
  line75SignedError: row.line75SignedError,
  line75PctUnder: row.line75PctUnder,
  line85N: row.line85N,
  line85SignedError: row.line85SignedError,
  line85PctUnder: row.line85PctUnder,
  lowMidLineMae: row.lowMidLineMae,
  lowLineMae: row.lowLineMae,
  directionalHitRate: row.directionalHitRate,
  directionalRecord: row.directionalRecord,
  directionalHitRateHighLine: row.directionalHitRateHighLine,
  gatesPassed: row.gatesPassed,
  allGatesPass: row.allGatesPass,
});

const byFamily = (family) => [...report.values()].filter((row) => row.family === family).map(csvColumns);

writeCsv("sample-size-grid.csv", [...byFamily("constant"), ...byFamily("sample-size")]);
writeCsv("skill-dependent-grid.csv", [
  ...byFamily("constant").slice(0, 1),
  ...byFamily("skill-piecewise"),
  ...byFamily("skill-continuous"),
  ...byFamily("skill-logistic"),
]);
writeCsv("combined-grid.csv", [...byFamily("constant").slice(0, 1), ...byFamily("combined")]);

const validationRows = [...report.values()].map((row) => ({
  id: row.id,
  family: row.family,
  devN: row.devN,
  devHighLineN: row.devHighLineN,
  devMae: row.devMae,
  devSignedError: row.devSignedError,
  devSdProjectedKs: row.devSdProjectedKs,
  devHighLineSignedError: row.devHighLineSignedError,
  devPctAtLeast7: row.devPctAtLeast7,
  devPctAtLeast8: row.devPctAtLeast8,
  devDirectionalHitRate: row.devDirectionalHitRate,
  valN: row.valN,
  valHighLineN: row.valHighLineN,
  valMae: row.valMae,
  valSignedError: row.valSignedError,
  valSdProjectedKs: row.valSdProjectedKs,
  valHighLineSignedError: row.valHighLineSignedError,
  valPctAtLeast7: row.valPctAtLeast7,
  valPctAtLeast8: row.valPctAtLeast8,
  valDirectionalHitRate: row.valDirectionalHitRate,
  pooledMae: row.mae,
  pooledSdProjectedKs: row.sdProjectedKs,
  pooledHighLineSignedError: row.highLineSignedError,
  pooledPctAtLeast7: row.pctAtLeast7,
  pooledPctAtLeast8: row.pctAtLeast8,
  pooledDirectionalHitRate: row.directionalHitRate,
}));
writeCsv("validation-summary.csv", validationRows);


const COMPARISON_SET = [
  "const-0.55-production",
  bestSampleSize && bestSampleSize.id,
  bestSkill && bestSkill.id,
  bestCombined && bestCombined.id,
].filter(Boolean);

const comparisonIds = [...new Set(COMPARISON_SET)];

const lineBucketComparison = [];
const skillBucketComparison = [];
const sampleSizeBucketComparison = [];
const workloadBucketComparison = [];
const skillSpec = skillBucketSpec(rows);

for (const id of comparisonIds) {
  const list = scored.get(id);
  for (const entry of bucketTable(list, "projectedKs", LINE_BUCKET_SPEC)) {
    lineBucketComparison.push({ candidate: id, ...entry });
  }
  for (const entry of bucketTable(list, "projectedKs", skillSpec)) {
    skillBucketComparison.push({ candidate: id, ...entry });
  }
  for (const entry of bucketTable(list, "projectedKs", SAMPLE_SIZE_BUCKET_SPEC)) {
    sampleSizeBucketComparison.push({ candidate: id, ...entry });
  }
  for (const entry of bucketTable(list, "projectedKs", WORKLOAD_BUCKET_SPEC)) {
    workloadBucketComparison.push({ candidate: id, ...entry });
  }
}

writeCsv("line-bucket-comparison.csv", lineBucketComparison);
writeCsv("skill-bucket-comparison.csv", skillBucketComparison);
writeCsv("sample-size-bucket-comparison.csv", sampleSizeBucketComparison);
writeCsv("workload-bucket-comparison.csv", workloadBucketComparison);
writeCsv("rolling-origin-folds.csv", comparisonIds.flatMap((id) => foldMetrics(id)));

// ------------------------------- Gavin Williams replay -------------------------------

const GAVIN_SLATE = "2026-09-06";
const gavinRow =
  rows.find((row) => row.pitcher === "Gavin Williams" && row.slateDate === GAVIN_SLATE) ??
  archive.rows
    .filter((row) => row.pitcher === "Gavin Williams" && row.slateDate === GAVIN_SLATE)
    .map((row) => {
      const leagueAnchor = recoverLeagueAnchor(row.v2OpponentEnvRate, row.v2MatchupAdjustment);
      const bfEntry = bfByKey.get(`${row.slateDate}|${row.pitcherId}`) ?? null;
      const pool = poolBySlate.get(row.slateDate) ?? [];
      return {
        ...row,
        leagueAnchor,
        seasonBattersFaced: bfEntry ? bfEntry.seasonBattersFaced : null,
        skillPercentile: pool.length >= MIN_PERCENTILE_POOL ? percentileInSortedPool(pool, row.v2PitcherSkillRate) : null,
        skillExcessZ: leagueAnchor === null ? null : (row.v2PitcherSkillRate - leagueAnchor) / SKILL_EXCESS_REFERENCE_SD,
      };
    })[0] ?? null;

const gavinReplay = gavinRow
  ? {
      studyId: STUDY_ID,
      section: "gavin-williams-replay",
      generatedAt: new Date().toISOString(),
      note: "Case study only. No candidate was tuned to this row.",
      row: {
        slateDate: gavinRow.slateDate,
        pitcher: gavinRow.pitcher,
        team: gavinRow.team,
        opponent: gavinRow.opponent,
        kLine: gavinRow.kLine,
        oddsOver: gavinRow.oddsOver,
        oddsUnder: gavinRow.oddsUnder,
        archivedProjectedKs: round(gavinRow.v2ProjectedKs, 4),
        pitcherSkillRate: round(gavinRow.v2PitcherSkillRate, 6),
        leagueAnchor: round(gavinRow.leagueAnchor, 6),
        matchupAdjustment: round(gavinRow.v2MatchupAdjustment, 6),
        projectedBF: gavinRow.v2ProjectedBF,
        projectedInnings: gavinRow.v2ProjectedInnings,
        seasonBattersFaced: gavinRow.seasonBattersFaced,
        skillPercentile: round(gavinRow.skillPercentile, 4),
        skillExcessZ: round(gavinRow.skillExcessZ, 4),
        actualKs: gavinRow.actualKs ?? null,
      },
      replays: comparisonIds.map((id) => {
        const candidate = candidates.find((entry) => entry.id === id);
        const alpha = candidate.alphaOf(gavinRow);
        const projection = projectWithAlpha({
          alpha,
          pitcherSkillRate: gavinRow.v2PitcherSkillRate,
          leagueAnchor: gavinRow.leagueAnchor,
          matchupAdjustment: gavinRow.v2MatchupAdjustment,
          projectedBF: gavinRow.v2ProjectedBF,
        });
        return {
          candidate: id,
          family: candidate.family,
          label: candidate.label,
          alpha: round(alpha, 4),
          shrunkKRate: round(projection.shrunkKRate, 6),
          projectedKRate: round(projection.projectedKRate, 6),
          projectedKs: round(projection.projectedKs, 4),
          edgeVsLine: round(projection.projectedKs - gavinRow.kLine, 4),
          direction: projection.projectedKs > gavinRow.kLine ? "over" : projection.projectedKs < gavinRow.kLine ? "under" : "neutral",
        };
      }),
    }
  : { studyId: STUDY_ID, section: "gavin-williams-replay", found: false };

writeJson("gavin-replay.json", gavinReplay);

// ------------------------------- winner summary -------------------------------

const bootstrapFor = (candidateId, predicate) => {
  const list = scored.get(candidateId).filter(predicate);
  const ci = bootstrapMeanCi(list.map((row) => row.projectedKs - row.actualKs));
  return ci ? { n: list.length, mean: round(ci.mean, 4), lower: round(ci.lower, 4), upper: round(ci.upper, 4) } : null;
};

const shadowCandidate = bestOverall && bestOverall.allGatesPass ? bestOverall : null;

const winnerSummary = {
  studyId: STUDY_ID,
  section: "winner-summary",
  generatedAt: new Date().toISOString(),
  productionUnchanged: true,
  productionFilesTouched: [],
  baseline: { id: "const-0.55-production", ...baseline, ...alphaSummary("const-0.55-production") },
  splitDesign,
  familyVerdicts,
  bestByFamily: {
    "sample-size": bestSampleSize,
    "skill-piecewise": bestPiecewise,
    "skill-continuous": bestContinuous,
    "skill-logistic": bestLogistic,
    combined: bestCombined,
  },
  bestOverall,
  bestOverallStatus: shadowCandidate ? "SHADOW_CANDIDATE" : "NOT_READY",
  gateDetail: Object.fromEntries(comparisonIds.map((id) => [id, gateDetail[id]])),
  overcorrectionChecks: comparisonIds.map((id) => overcorrectionCheck(id)),
  bootstrapHighLineSignedError: Object.fromEntries(
    comparisonIds.map((id) => [id, bootstrapFor(id, (row) => row.kLine >= 7)]),
  ),
  bootstrapOverallSignedError: Object.fromEntries(comparisonIds.map((id) => [id, bootstrapFor(id, () => true)])),
  sufficiencyQuestion: {
    bestSampleSizeGates: bestSampleSize ? bestSampleSize.gatesPassed : null,
    bestSkillGates: bestSkill ? bestSkill.gatesPassed : null,
    bestCombinedGates: bestCombined ? bestCombined.gatesPassed : null,
  },
  alphaCeiling,
  tailCeiling,
  rollingOriginMetrics: comparisonIds.flatMap((id) => foldMetrics(id)),
};

writeJson("winner-summary.json", winnerSummary);

writeJson("candidate-detail.json", {
  studyId: STUDY_ID,
  section: "candidate-detail",
  generatedAt: new Date().toISOString(),
  candidates: [...report.values()],
  gateDetail,
});

// -------------------- sensitivity: ungraded placeholder outcomes --------------------

/**
 * DATA DEFECT inherited from the v1 extraction. Eight leakage-safe rows carry
 * actualKs = 0 with actualBF = 0 and actualsSource "top-k-grading" -- among
 * them Paul Skenes and Gavin Williams on 2026-09-06. A start that faced zero
 * batters did not happen; these are unsettled slates recorded as zeros, not
 * genuine 0-strikeout outcomes. (A real 0-K start has actualBF > 0, and 50
 * other top-k-graded rows do.)
 *
 * They are kept in the frozen baseline so it reproduces the prior study
 * exactly, and excluded here to show how much of the high-line picture --
 * especially the late-window sign flip -- rests on them.
 */
const isUngradedPlaceholder = (row) =>
  row.actualKs === 0 && (!Number.isFinite(row.actualBF) || row.actualBF <= 0);

const ungradedRows = rows.filter(isUngradedPlaceholder);
const gradedKeys = new Set(
  rows.filter((row) => !isUngradedPlaceholder(row)).map((row) => `${row.slateDate}|${row.pitcherId}`),
);

const sensitivity = {
  studyId: STUDY_ID,
  section: "sensitivity-ungraded-outcomes",
  generatedAt: new Date().toISOString(),
  defect:
    "actualKs = 0 with actualBF = 0 is an unsettled slate recorded as a zero, not a 0-strikeout start. " +
    "Inherited from the v1 archive extraction; not introduced by this study.",
  excludedRows: ungradedRows.map((row) => ({
    slateDate: row.slateDate,
    pitcher: row.pitcher,
    kLine: row.kLine,
    actualKs: row.actualKs,
    actualBF: row.actualBF,
    actualsSource: row.actualsSource,
  })),
  excludedCount: ungradedRows.length,
  excludedHighLineCount: ungradedRows.filter((row) => row.kLine >= 7).length,
  comparison: comparisonIds.map((id) => {
    const all = candidateMetrics(scored.get(id), "projectedKs");
    const graded = candidateMetrics(
      scored.get(id).filter((row) => gradedKeys.has(`${row.slateDate}|${row.pitcherId}`)),
      "projectedKs",
    );
    return {
      candidate: id,
      withUngraded: {
        n: all.n,
        mae: all.mae,
        signedError: all.signedError,
        highLineN: all.highLineN,
        highLineSignedError: all.highLineSignedError,
        directionalHitRate: all.directionalHitRate,
      },
      ungradedExcluded: {
        n: graded.n,
        mae: graded.mae,
        signedError: graded.signedError,
        highLineN: graded.highLineN,
        highLineSignedError: graded.highLineSignedError,
        directionalHitRate: graded.directionalHitRate,
      },
    };
  }),
  splitWithoutUngraded: comparisonIds.map((id) => {
    const list = scored.get(id).filter((row) => gradedKeys.has(`${row.slateDate}|${row.pitcherId}`));
    const dev = candidateMetrics(
      list.filter((row) => devKeys.has(`${row.slateDate}|${row.pitcherId}`)),
      "projectedKs",
    );
    const val = candidateMetrics(
      list.filter((row) => !devKeys.has(`${row.slateDate}|${row.pitcherId}`)),
      "projectedKs",
    );
    return {
      candidate: id,
      devN: dev.n,
      devMae: dev.mae,
      devHighLineN: dev.highLineN,
      devHighLineSignedError: dev.highLineSignedError,
      devDirectionalHitRate: dev.directionalHitRate,
      valN: val.n,
      valMae: val.mae,
      valHighLineN: val.highLineN,
      valHighLineSignedError: val.highLineSignedError,
      valDirectionalHitRate: val.directionalHitRate,
    };
  }),
  allFoldsWithoutUngraded: comparisonIds.flatMap((id) => {
    const byKey = new Map(scored.get(id).map((row) => [`${row.slateDate}|${row.pitcherId}`, row]));
    return folds.map((fold) => {
      const test = fold.test
        .map((row) => byKey.get(`${row.slateDate}|${row.pitcherId}`))
        .filter((row) => row && gradedKeys.has(`${row.slateDate}|${row.pitcherId}`));
      const m = candidateMetrics(test, "projectedKs");
      return {
        candidate: id,
        fold: fold.fold,
        testRange: fold.testRange,
        n: m.n,
        mae: m.mae,
        highLineN: m.highLineN,
        highLineSignedError: m.highLineSignedError,
        directionalHitRate: m.directionalHitRate,
      };
    });
  }),
  finalFoldWithoutUngraded: comparisonIds.map((id) => {
    const lastFold = folds[folds.length - 1];
    const byKey = new Map(scored.get(id).map((row) => [`${row.slateDate}|${row.pitcherId}`, row]));
    const test = lastFold.test
      .map((row) => byKey.get(`${row.slateDate}|${row.pitcherId}`))
      .filter((row) => row && gradedKeys.has(`${row.slateDate}|${row.pitcherId}`));
    const m = candidateMetrics(test, "projectedKs");
    return {
      candidate: id,
      testRange: lastFold.testRange,
      n: m.n,
      mae: m.mae,
      highLineN: m.highLineN,
      highLineSignedError: m.highLineSignedError,
      directionalHitRate: m.directionalHitRate,
    };
  }),
};

writeJson("sensitivity-ungraded-outcomes.json", sensitivity);

// ------------------------------- forward shadow plan -------------------------------

const foldsForBest = bestOverall ? foldMetrics(bestOverall.id) : [];
const baselineFolds = foldMetrics("const-0.55-production");

writeJson("forward-shadow-plan.json", {
  studyId: STUDY_ID,
  section: "forward-shadow-plan",
  generatedAt: new Date().toISOString(),
  status: shadowCandidate ? "SHADOW_CANDIDATE" : "NOT_READY",
  candidate: bestOverall ? bestOverall.id : null,
  productionChange: "NONE. This plan is a proposal only; PITCHER_SKILL_SHRINKAGE_ALPHA stays 0.55.",
  whyNotReadyNow: [
    "Gates 3 and 4 (dispersion, % projected >= 7) are unreachable for ANY alpha in [0,1]: at alpha = 1 " +
      "the sd of projected Ks is 1.2225 and % >= 7 is 3.97%. Reaching sd 1.4 needs alpha near 1.25, " +
      "which is skill inflation rather than shrinkage. No shrinkage structure can clear them.",
    "The upper tail is capped jointly by rate compression AND workload compression. An 8-K projection " +
      "needs a K rate near .358 at a median projected workload, above the .296 that is the 95th " +
      "percentile of the UNSHRUNK skill rate. Alpha alone cannot reach it.",
    "High-line sample counts are small: 54 rows at line >= 7 pooled (52 after removing ungraded rows), " +
      "20 in validation, 11 at 8.5+. No 8.5+ claim in this study should be treated as settled.",
    "The v1 archive carries 8 ungraded rows recorded as 0 strikeouts on 0 batters faced, 2 of them at " +
      "line 7.5. They should be repaired before any forward shadow is scored against this archive.",
  ],
  design: {
    durationSlates: 60,
    durationCalendar: "approximately 10-12 weeks of MLB slates, or one full season segment",
    minimumTotalRows: 1500,
    minimumHighLineRows: 120,
    minimum75PlusRows: 100,
    minimum85PlusRows: 30,
    rationale:
      "The pooled archive carries 54 rows at line >= 7. Doubling that to ~120 is the smallest sample " +
      "at which a 0.4-K shift in high-line signed error has a bootstrap CI that can exclude zero, " +
      "given the observed per-row error sd of roughly 2.2 Ks.",
    method:
      "Run the candidate alpha alongside production on every slate, writing a shadow-only column. " +
      "Production Projected K continues to be served from alpha = 0.55 throughout.",
  },
  metricsToMonitor: [
    "overall MAE and RMSE",
    "overall signed error",
    "sd of projected Ks",
    "% projected >= 7 and >= 8",
    "signed error at line >= 7, at 7.5 and at 8.5+",
    "% Under at 7.5 and 8.5+",
    "directional hit rate overall and at line >= 7",
    "MAE at lines <= 5.5",
    "signed error in the bottom skill quartile (over-projection guard)",
    "rolling 20-slate high-line signed error, to detect the sign flip seen in fold 4",
  ],
  promotionGates: {
    note: "ALL must hold on the forward shadow window alone, not pooled with this archive.",
    g1: "overall MAE <= production MAE over the same forward window",
    g2: "signed error at line >= 7 improves toward zero by >= 25% in absolute terms, with a bootstrap " +
      "95% CI that does not cross the production point estimate in the wrong direction",
    g3: "signed error at line >= 7 stays within +/-0.5 Ks of zero, i.e. no overshoot into over-projection",
    g4: "MAE at lines <= 5.5 no worse than production + 0.02",
    g5: "directional hit rate overall no worse than production - 1.0pp",
    g6: "signed error in the bottom skill quartile no worse than production + 0.15",
    g7: "at least 120 rows at line >= 7 and 30 rows at 8.5+ accumulated before any gate is scored",
  },
  rollbackConditions: [
    "signed error at line >= 7 exceeds +0.75 Ks (over-projection) on any trailing 20-slate window",
    "overall MAE exceeds production MAE by more than 0.03 on any trailing 20-slate window",
    "directional hit rate falls more than 2.0pp below production on any trailing 20-slate window",
    "% projected >= 8 exceeds 3.0% on any trailing 20-slate window",
    "season BF coverage falls below 95% of rows, i.e. the fail-closed fallback is carrying the model",
    "MAE at lines <= 5.5 exceeds production + 0.05 on any trailing 20-slate window",
  ],
  foldStability: { baseline: baselineFolds, candidate: foldsForBest },
});

writeJson("research-metadata.json", {
  studyId: STUDY_ID,
  parentStudy: "mlb-k-high-line-calibration-v1",
  section: "shrinkage-experiment-metadata",
  generatedAt: new Date().toISOString(),
  shadowExperimentOnly: true,
  productionFilesModified: [],
  productionArtifactsModified: [],
  productionConstantsChanged: [],
  scripts: [
    "scripts/research/mlb-k-extract-season-bf.mjs",
    "scripts/research/mlb-k-shrinkage-experiment.mjs",
    "scripts/research/lib/mlb-k-shrinkage-helpers.mjs",
    "scripts/research/lib/mlb-k-shrinkage-metrics.mjs",
    "scripts/research/lib/mlb-k-shrinkage-helpers.test.mjs",
  ],
  dataIntegrity,
  splitDesign,
  familyVerdicts,
  bestOverall: bestOverall ? bestOverall.id : null,
  status: shadowCandidate ? "SHADOW_CANDIDATE" : "NOT_READY",
  marketLineUsage: "evaluation and bucketing only; enforced by a test that no alpha helper reads kLine or odds",
  leakageControls: [
    "pregame archive rows only (snapshot date <= slate date)",
    "season BF read from pregame strikeout-prop-details snapshots, verified monotone non-decreasing per pitcher",
    "skill percentile pool restricted to slates on or before the row's own slate, outcomes never included",
    "temporal split and rolling folds cut on slate date, guarded by assertTemporalOrder",
  ],
});

// ------------------------------- console report -------------------------------

const brief = (row) =>
  row
    ? {
        id: row.id,
        meanAlpha: row.meanAlpha,
        mae: row.mae,
        signed: row.signedError,
        sd: row.sdProjectedKs,
        pct7: row.pctAtLeast7,
        pct8: row.pctAtLeast8,
        highLineSigned: row.highLineSignedError,
        l75Under: row.line75PctUnder,
        l85Under: row.line85PctUnder,
        lowMidMae: row.lowMidLineMae,
        hit: row.directionalHitRate,
        gates: `${row.gatesPassed}/7`,
      }
    : null;

console.log("=== BASELINE REPRODUCED ===");
console.log(JSON.stringify(baselineChecks, null, 1));
console.log("\n=== DATA INTEGRITY ===");
console.log(JSON.stringify(dataIntegrity, null, 1));
console.log("\n=== SPLIT ===");
console.log(JSON.stringify(splitDesign, null, 1));
console.log("\n=== ALL CANDIDATES ===");
console.table([...report.values()].map(brief));
console.log("\n=== FAMILY VERDICTS ===");
console.log(JSON.stringify(familyVerdicts, null, 1));
console.log("\n=== BEST OVERALL ===", bestOverall ? bestOverall.id : null, winnerSummary.bestOverallStatus);
console.log("\n=== GAVIN ===");
console.log(JSON.stringify(gavinReplay.replays ?? gavinReplay, null, 1));
