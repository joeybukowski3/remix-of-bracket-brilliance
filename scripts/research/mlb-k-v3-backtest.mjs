/**
 * RESEARCH ONLY -- study mlb-k-projection-v3-workload-model
 *
 * BACKTEST. Scores four strikeout projections on the SAME clean, leakage-safe
 * rows the prior workload-dispersion study used, so every number here is
 * directly comparable to that study's baselines:
 *
 *   A  production        v2 workload x alpha 0.55
 *   B  ss-k125 only      v2 workload x alpha BF/(BF+125)
 *   C  revised workload  v3 workload x alpha 0.55
 *   D  revised + ss-k125 v3 workload x alpha BF/(BF+125)
 *
 * A fifth variant, D-nonzero, is carried alongside: the same model with the
 * site and opponent terms forced to interpretable non-zero settings rather than
 * the strengths the selection pass chose. The selection pass drove both to zero
 * on this sample, and reporting the non-zero variant is what makes that finding
 * checkable rather than a claim.
 *
 * ERA NOTE, carried over unchanged from the prior two studies. The alpha 0.55
 * shrinkage landed on 2026-09-02, so only the last slates were SHIPPED through
 * it. "Production" here therefore means a COUNTERFACTUAL REPLAY of alpha 0.55
 * across every row, exactly as the prior studies defined it, and the baselines
 * are directly comparable. The as-shipped projection is carried as projAsShipped
 * for context only.
 *
 * The market K line enters only through the scoring module. No projection in
 * this file reads it.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { correlation, mean, rmse } from "./lib/mlb-k-research-helpers.mjs";
import {
  PRODUCTION_ALPHA,
  assertTemporalOrder,
  projectWithAlpha,
  rollingOriginFolds,
  temporalSplit,
} from "./lib/mlb-k-shrinkage-helpers.mjs";
import { LINE_BUCKET_SPEC, bucketTable, candidateMetrics, round } from "./lib/mlb-k-shrinkage-metrics.mjs";
import { attachV3Workload, buildEvaluationRows, buildLeagueCentreIndex, loadSources } from "./lib/mlb-k-v3-dataset.mjs";

import { DEFAULTS } from "../mlb-k/mlb-k-workload-v3-core.mjs";
import { OPPONENT_DEFAULTS } from "../mlb-k/mlb-k-opponent-sp-workload-v3.mjs";
import { SAMPLE_SIZE_ALPHA_K, sampleSizeAlpha } from "../lib/mlb-k-projection-v3.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "mlb", "k-research", "v3-workload-model");
mkdirSync(OUT, { recursive: true });

const STUDY_ID = "mlb-k-projection-v3-workload-model";

const writeJson = (file, payload) => writeFileSync(path.join(OUT, file), `${JSON.stringify(payload, null, 2)}\n`);

function writeCsv(file, rows) {
  if (!rows.length) return writeFileSync(path.join(OUT, file), "");
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => cell(row[h])).join(","));
  writeFileSync(path.join(OUT, file), `${lines.join("\n")}\n`);
}

// =================================================================================
// 1. DATA + THE SELECTED CONFIGURATION
// =================================================================================

const selected = JSON.parse(readFileSync(path.join(OUT, "selected-config.json"), "utf8"));

const dataset = buildEvaluationRows(loadSources(ROOT));
const { rows: baseRows, startLog, logByPitcher, leagueIndex, excluded } = dataset;
const leagueCentreIndex = buildLeagueCentreIndex({ rows: baseRows, startLog, logByPitcher, leagueIndex });

const SELECTED_CONFIG = selected.config ?? DEFAULTS;
const SELECTED_OPPONENT = selected.opponentConfig ?? OPPONENT_DEFAULTS;

/**
 * The non-zero comparison variant. Site and opponent are set to the strongest
 * settings that still finished near the top of their own grids on innings, so
 * the cost of turning these terms on is measurable rather than assumed.
 */
const NONZERO_CONFIG = { ...SELECTED_CONFIG, siteScale: 0.5, siteShrinkK: 14, siteCapIp: 0.15 };
const NONZERO_OPPONENT = {
  ...OPPONENT_DEFAULTS,
  seasonWeight: 1,
  last10Weight: 0,
  last5Weight: 0,
  scale: 0.5,
  capIp: 0.3,
};

const withSelected = attachV3Workload(baseRows, {
  startLog,
  logByPitcher,
  config: SELECTED_CONFIG,
  opponentConfig: SELECTED_OPPONENT,
  leagueCentreIndex,
});
const withNonzero = attachV3Workload(baseRows, {
  startLog,
  logByPitcher,
  config: NONZERO_CONFIG,
  opponentConfig: NONZERO_OPPONENT,
  leagueCentreIndex,
});

// =================================================================================
// 2. THE FOUR CANDIDATES
// =================================================================================

/**
 * Replays the frozen v2 K-rate pipeline with a caller-supplied alpha and a
 * caller-supplied batters faced. Every K-rate component -- season skill, recent
 * skill regression, whiff support, opponent environment, handedness, lineup,
 * matchup multiplier and matchup clamp -- comes from the archived v2 row
 * untouched, so nothing but workload and alpha can differ between candidates.
 */
function projectRow(row, { alpha, projectedBF }) {
  const out = projectWithAlpha({
    alpha,
    pitcherSkillRate: row.v2PitcherSkillRate,
    leagueAnchor: row.leagueAnchor,
    matchupAdjustment: row.v2MatchupAdjustment,
    projectedBF,
  });
  return out ? out.projectedKs : null;
}

const rows = withSelected.map((row, index) => {
  const nonzero = withNonzero[index];
  const ssAlpha = sampleSizeAlpha(row.seasonBattersFaced, SAMPLE_SIZE_ALPHA_K).alpha;
  const v2Bf = row.v2ProjectedBF;
  const v3Bf = row.v3.battersFaced.projectedBattersFaced;
  const v3BfNonzero = nonzero.v3.battersFaced.projectedBattersFaced;
  return {
    ...row,
    v3Nonzero: nonzero.v3,
    ssAlpha,
    v2ProjectedBFUsed: v2Bf,
    v3ProjectedBFUsed: v3Bf,
    v3ProjectedIPUsed: row.v3.workload.finalProjectedIP,
    // A. production replay
    projA: projectRow(row, { alpha: PRODUCTION_ALPHA, projectedBF: v2Bf }),
    // B. ss-k125 only
    projB: projectRow(row, { alpha: ssAlpha, projectedBF: v2Bf }),
    // C. revised workload only
    projC: projectRow(row, { alpha: PRODUCTION_ALPHA, projectedBF: v3Bf }),
    // D. revised workload + ss-k125
    projD: projectRow(row, { alpha: ssAlpha, projectedBF: v3Bf }),
    // D-nonzero. same, with site and opponent forced on
    projDNonzero: projectRow(row, { alpha: ssAlpha, projectedBF: v3BfNonzero }),
    projAsShipped: Number.isFinite(v2Bf) && Number.isFinite(row.v2ProjectedKRate) ? row.v2ProjectedKRate * v2Bf : null,
  };
});

const CANDIDATES = [
  { id: "A production (v2 workload, alpha 0.55)", field: "projA", bf: "v2ProjectedBFUsed" },
  { id: "B ss-k125 only", field: "projB", bf: "v2ProjectedBFUsed" },
  { id: "C revised workload only", field: "projC", bf: "v3ProjectedBFUsed" },
  { id: "D revised workload + ss-k125", field: "projD", bf: "v3ProjectedBFUsed" },
  { id: "D-nonzero (site+opponent forced on)", field: "projDNonzero", bf: null },
];

// Every candidate is scored on the rows where ALL of them are defined, so the
// comparison is like for like rather than each candidate picking its own sample.
const scored = rows.filter((row) => CANDIDATES.every((c) => Number.isFinite(row[c.field])));

// =================================================================================
// 3. OVERALL + LINE BUCKETS + HIGH LINE
// =================================================================================

const overall = CANDIDATES.map((c) => ({ candidate: c.id, ...candidateMetrics(scored, c.field) }));
writeJson("baseline-comparison.json", {
  study: STUDY_ID,
  generatedAt: new Date().toISOString(),
  n: scored.length,
  candidates: overall,
  asShippedContextOnly: { candidate: "as-shipped (era-mixed)", ...candidateMetrics(scored, "projAsShipped") },
});

const bucketRows = [];
for (const c of CANDIDATES) {
  for (const bucket of bucketTable(scored, c.field, LINE_BUCKET_SPEC)) {
    bucketRows.push({ candidate: c.id, ...bucket });
  }
}
writeCsv("line-bucket-comparison.csv", bucketRows);

// =================================================================================
// 4. WORKLOAD CALIBRATION  (IP and BF, independent of the K rate)
// =================================================================================

function workloadMetrics(list, ipOf, bfOf) {
  const ipRows = list.filter((row) => Number.isFinite(ipOf(row)) && Number.isFinite(row.actualIP));
  const bfRows = list.filter((row) => Number.isFinite(bfOf(row)) && Number.isFinite(row.actualBF));
  const ipErr = ipRows.map((row) => ipOf(row) - row.actualIP);
  const bfErr = bfRows.map((row) => bfOf(row) - row.actualBF);
  const sd = (values) => {
    const m = mean(values);
    return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
  };
  return {
    ipN: ipRows.length,
    ipMae: round(mean(ipErr.map(Math.abs)), 4),
    ipRmse: round(rmse(ipErr), 4),
    ipSigned: round(mean(ipErr), 4),
    ipCorrelation: round(correlation(ipRows.map((row) => [ipOf(row), row.actualIP])), 4),
    sdPredictedIp: round(sd(ipRows.map(ipOf)), 4),
    sdActualIp: round(sd(ipRows.map((row) => row.actualIP)), 4),
    bfN: bfRows.length,
    bfMae: round(mean(bfErr.map(Math.abs)), 4),
    bfRmse: round(rmse(bfErr), 4),
    bfSigned: round(mean(bfErr), 4),
    bfCorrelation: round(correlation(bfRows.map((row) => [bfOf(row), row.actualBF])), 4),
    sdPredictedBf: round(sd(bfRows.map(bfOf)), 4),
    sdActualBf: round(sd(bfRows.map((row) => row.actualBF)), 4),
  };
}

const workloadComparison = [
  { model: "v2 production workload", ...workloadMetrics(scored, (r) => r.v2ProjectedInnings, (r) => r.v2ProjectedBFUsed) },
  { model: "v3 revised workload (selected)", ...workloadMetrics(scored, (r) => r.v3ProjectedIPUsed, (r) => r.v3ProjectedBFUsed) },
  {
    model: "v3 revised workload (site+opponent on)",
    ...workloadMetrics(scored, (r) => r.v3Nonzero.workload.finalProjectedIP, (r) => r.v3Nonzero.battersFaced.projectedBattersFaced),
  },
];
writeCsv("workload-calibration-comparison.csv", workloadComparison);

// Workload calibration inside each line bucket: is the high-line miss a
// workload miss or a rate miss?
const workloadByBucket = [];
for (const bucket of LINE_BUCKET_SPEC) {
  const list = scored.filter(bucket.test);
  if (!list.length) continue;
  workloadByBucket.push({
    bucket: bucket.key,
    n: list.length,
    v2IpSigned: round(mean(list.map((r) => r.v2ProjectedInnings - r.actualIP)), 3),
    v3IpSigned: round(mean(list.map((r) => r.v3ProjectedIPUsed - r.actualIP)), 3),
    v2BfSigned: round(mean(list.map((r) => r.v2ProjectedBFUsed - r.actualBF)), 3),
    v3BfSigned: round(mean(list.map((r) => r.v3ProjectedBFUsed - r.actualBF)), 3),
    meanActualIp: round(mean(list.map((r) => r.actualIP)), 3),
    meanActualBf: round(mean(list.map((r) => r.actualBF)), 3),
  });
}
writeCsv("workload-by-line-bucket.csv", workloadByBucket);

// =================================================================================
// 5. TEMPORAL VALIDATION  (spec section 17)
// =================================================================================

const temporalRows = [];
const split = temporalSplit(scored, { devFraction: 0.6 });
const order = assertTemporalOrder(split.development, split.validation);
if (!order.ok) throw new Error(`temporal split leaked: ${order.violations.join(",")}`);

for (const [label, list] of [
  ["development", split.development],
  ["validation", split.validation],
]) {
  for (const c of CANDIDATES) {
    const m = candidateMetrics(list, c.field);
    temporalRows.push({
      window: label,
      range: label === "development" ? `${split.devDates[0]}..${split.cutoffDate}` : `${split.validationDates[0]}..${split.validationDates[split.validationDates.length - 1]}`,
      candidate: c.id,
      n: m.n,
      mae: m.mae,
      rmse: m.rmse,
      signedError: m.signedError,
      highLineN: m.highLineN,
      highLineSignedError: m.highLineSignedError,
      highLineMae: m.highLineMae,
      lowMidLineMae: m.lowMidLineMae,
      directionalHitRate: m.directionalHitRate,
    });
  }
}

for (const fold of rollingOriginFolds(scored, { folds: 4, minTrainDates: 10 })) {
  const foldOrder = assertTemporalOrder(fold.train, fold.test);
  if (!foldOrder.ok) throw new Error(`fold ${fold.fold} leaked: ${foldOrder.violations.join(",")}`);
  for (const c of CANDIDATES) {
    const m = candidateMetrics(fold.test, c.field);
    temporalRows.push({
      window: `fold ${fold.fold}`,
      range: fold.testRange,
      candidate: c.id,
      n: m.n,
      mae: m.mae,
      rmse: m.rmse,
      signedError: m.signedError,
      highLineN: m.highLineN,
      highLineSignedError: m.highLineSignedError,
      highLineMae: m.highLineMae,
      lowMidLineMae: m.lowMidLineMae,
      directionalHitRate: m.directionalHitRate,
    });
  }
}
writeCsv("temporal-validation.csv", temporalRows);

// =================================================================================
// 6. SUMMARY + VERDICT
// =================================================================================

const byId = Object.fromEntries(overall.map((row) => [row.candidate, row]));
const A = byId["A production (v2 workload, alpha 0.55)"];
const D = byId["D revised workload + ss-k125"];
const C = byId["C revised workload only"];
const B = byId["B ss-k125 only"];

const w2 = workloadComparison[0];
const w3 = workloadComparison[1];

/**
 * PASS requires every one of the promotion criteria in the work-unit spec. Each
 * is evaluated explicitly and reported with its own number, so a FAIL says
 * which criterion failed rather than delivering a verdict on its own authority.
 */
const criteria = [
  { key: "overall K MAE better or equal", pass: D.mae <= A.mae, detail: `D ${D.mae} vs A ${A.mae}` },
  {
    key: "workload/IP calibration better",
    pass: w3.ipMae <= w2.ipMae && w3.bfMae <= w2.bfMae,
    detail: `IP MAE ${w3.ipMae} vs ${w2.ipMae}; BF MAE ${w3.bfMae} vs ${w2.bfMae}`,
  },
  {
    key: "materially reduced high-line under-bias",
    pass: Math.abs(D.highLineSignedError) <= 0.75 * Math.abs(A.highLineSignedError),
    detail: `D ${D.highLineSignedError} vs A ${A.highLineSignedError} over n=${D.highLineN}`,
  },
  {
    key: "no meaningful degradation at lines <=5.5",
    pass: D.lowMidLineMae <= A.lowMidLineMae + 0.05,
    detail: `D ${D.lowMidLineMae} vs A ${A.lowMidLineMae}`,
  },
  {
    /**
     * NOT one of the work-unit's PASS conditions, and therefore not allowed to
     * change the verdict -- but it moved the wrong way and belongs in the
     * report rather than in a footnote. Recorded with informational: true.
     */
    key: "directional hit rate not degraded (informational)",
    informational: true,
    pass: D.directionalHitRate >= A.directionalHitRate,
    detail: `D ${D.directionalHitRate}% (${D.directionalRecord}) vs A ${A.directionalHitRate}% (${A.directionalRecord})`,
  },
  {
    key: "stable across temporal folds",
    pass: (() => {
      const folds = temporalRows.filter((r) => r.window.startsWith("fold") && r.candidate === D.candidate);
      const base = temporalRows.filter((r) => r.window.startsWith("fold") && r.candidate === A.candidate);
      return folds.every((f, i) => f.mae <= base[i].mae + 0.1);
    })(),
    detail: "each rolling-origin fold within 0.10 K MAE of production",
  },
];
const gating = criteria.filter((c) => !c.informational);
const verdict = gating.every((c) => c.pass) ? "PASS" : gating.some((c) => c.pass) ? "PROMISING" : "FAIL";

const summary = {
  study: STUDY_ID,
  generatedAt: new Date().toISOString(),
  n: scored.length,
  excludedN: excluded.length,
  candidates: overall,
  workloadComparison,
  workloadByBucket,
  criteria,
  verdict,
  selectedConfig: { config: SELECTED_CONFIG, opponentConfig: SELECTED_OPPONENT },
  nonzeroVariant: { config: NONZERO_CONFIG, opponentConfig: NONZERO_OPPONENT },
};
writeJson("v3-summary.json", summary);

console.log(
  JSON.stringify(
    {
      n: scored.length,
      overall: overall.map((r) => ({
        candidate: r.candidate,
        mae: r.mae,
        rmse: r.rmse,
        signed: r.signedError,
        sdProj: r.sdProjectedKs,
        maxProj: r.maxProjectedKs,
        highLineN: r.highLineN,
        highLineSigned: r.highLineSignedError,
        highLineMae: r.highLineMae,
        line75PctUnder: r.line75PctUnder,
        lowMidMae: r.lowMidLineMae,
        hitRate: r.directionalHitRate,
      })),
      workload: workloadComparison,
      criteria,
      verdict,
    },
    null,
    1,
  ),
);

// =================================================================================
// 7. RESEARCH METADATA
// =================================================================================

writeJson("research-metadata.json", {
  study: STUDY_ID,
  title: "Revised MLB strikeout workload model (v3): neutral IP baseline, workload regime, site and opponent-SP effects",
  generatedAt: new Date().toISOString(),
  branch: "research/mlb-k-high-line-calibration",
  status: `IMPLEMENTED_AND_VALIDATED_${verdict}_NO_PROMOTION`,
  inputs: {
    archive: "data/mlb/k-research/high-line-calibration/pregame-archive.json",
    seasonBfIndex: "data/mlb/k-research/high-line-calibration/shrinkage-experiment/season-bf-index.json",
    venueSplitIndex: "data/mlb/k-research/v3-workload-model/venue-split-index.json",
    startLog: "data/mlb/k-research/v3-workload-model/start-log.json",
  },
  newModelFiles: [
    "scripts/mlb-k/mlb-k-workload-v3-core.mjs",
    "scripts/mlb-k/mlb-k-opponent-sp-workload-v3.mjs",
    "scripts/mlb-k/compute-workload-projection-v3.mjs",
    "scripts/lib/mlb-k-projection-v3.mjs",
  ],
  productionFilesRead: [
    "src/lib/mlb/kProjectionV2.ts",
    "scripts/mlb-k/compute-workload-projection.mjs",
  ],
  productionFilesWritten: [],
  publicArtifactsWritten: [],
  cleanN: scored.length,
  excludedN: excluded.length,
  ssAlphaK: SAMPLE_SIZE_ALPHA_K,
  vegasUsedInModelMath: false,
  vegasUsage: "Evaluation and bucketing only. No projection function in any v3 module reads kLine, oddsOver or oddsUnder; an enforced test passes a market line into the model and asserts the output is byte-identical.",
  determinism:
    "No randomness anywhere: every estimator, weight, bucket and split is a pure function of the archive and the start log. Re-running any script reproduces its artifacts exactly.",
  leakageControls: [
    "Only pregame artifact revisions contribute inputs; a revision whose commit date post-dates its own slate is rejected at extraction.",
    "Every workload window reads starts strictly before the slate date.",
    "The league starter IP/start and BF/IP levels are EXPANDING means over starts before the slate, never full-sample constants.",
    "The opponent league-centring constants are likewise expanding and computed before the slate.",
    "All grid selection is scored on a development window; the validation window is reported but never used to choose.",
    "Rolling-origin folds assert temporal order before scoring.",
  ],
  verdict,
  criteria,
});
