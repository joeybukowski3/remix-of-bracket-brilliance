/**
 * RESEARCH ONLY -- study mlb-k-projection-v3-workload-model
 *
 * INTEGRATION REPRODUCTION CHECK.
 *
 * The research backtest scored v3 by calling the workload model directly with a
 * config read out of selected-config.json. Production instead goes through
 * scripts/lib/mlb-k-v3-production-adapter.mjs, which carries its own frozen
 * V3_PRODUCTION_CONFIG. If those two ever drift apart, the shipped model stops
 * being the validated model and every backtest number becomes a claim about
 * different code.
 *
 * This script re-runs the SAME clean historical sample through the PRODUCTION
 * config object and asserts the metrics land within a deterministic tolerance of
 * the research figures. It fails loudly rather than reporting a near miss.
 *
 * The market line is used only to bucket and score, never as an input.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { correlation, mean, rmse } from "./lib/mlb-k-research-helpers.mjs";
import { PRODUCTION_ALPHA, projectWithAlpha } from "./lib/mlb-k-shrinkage-helpers.mjs";
import { candidateMetrics, round } from "./lib/mlb-k-shrinkage-metrics.mjs";
import { attachV3Workload, buildEvaluationRows, buildLeagueCentreIndex, loadSources } from "./lib/mlb-k-v3-dataset.mjs";

import {
  V3_PRODUCTION_CONFIG,
  V3_PRODUCTION_OPPONENT_CONFIG,
} from "../lib/mlb-k-v3-production-adapter.mjs";
import { SAMPLE_SIZE_ALPHA_K, sampleSizeAlpha } from "../lib/mlb-k-projection-v3.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "mlb", "k-research", "v3-workload-model");
mkdirSync(OUT, { recursive: true });

/** Research figures this integration must reproduce. Asserted, not assumed. */
const RESEARCH_TARGETS = Object.freeze({
  mae: 1.7669,
  rmse: 2.2031,
  highLineSignedError: -0.8895,
  highLineMae: 1.9818,
  line75PctUnder: 92.7,
  lowMidLineMae: 1.7109,
  directionalHitRate: 52.04,
  ipMae: 0.9044,
  bfMae: 2.6144,
  bfCorrelation: 0.4463,
  productionHitRate: 53.86,
});

/**
 * Tolerances. Tight because the pipeline is deterministic: any difference beyond
 * floating-point noise means the production config and the research config are
 * not the same model.
 */
const TOLERANCE = Object.freeze({ metric: 0.005, rate: 0.2 });

const dataset = buildEvaluationRows(loadSources(ROOT));
const { rows: baseRows, startLog, logByPitcher, leagueIndex } = dataset;
const leagueCentreIndex = buildLeagueCentreIndex({ rows: baseRows, startLog, logByPitcher, leagueIndex });

const attached = attachV3Workload(baseRows, {
  startLog,
  logByPitcher,
  config: V3_PRODUCTION_CONFIG,
  opponentConfig: V3_PRODUCTION_OPPONENT_CONFIG,
  leagueCentreIndex,
});

const rows = attached.map((row) => {
  const ssAlpha = sampleSizeAlpha(row.seasonBattersFaced, SAMPLE_SIZE_ALPHA_K).alpha;
  const v3Bf = row.v3.battersFaced.projectedBattersFaced;
  const project = (alpha, bf) => {
    const out = projectWithAlpha({
      alpha,
      pitcherSkillRate: row.v2PitcherSkillRate,
      leagueAnchor: row.leagueAnchor,
      matchupAdjustment: row.v2MatchupAdjustment,
      projectedBF: bf,
    });
    return out ? out.projectedKs : null;
  };
  return {
    ...row,
    v3ProjectedIP: row.v3.workload.finalProjectedIP,
    v3ProjectedBF: v3Bf,
    projA: project(PRODUCTION_ALPHA, row.v2ProjectedBF),
    projD: project(ssAlpha, v3Bf),
  };
});

const scored = rows.filter((row) => Number.isFinite(row.projA) && Number.isFinite(row.projD));

const production = candidateMetrics(scored, "projA");
const v3 = candidateMetrics(scored, "projD");

const ipRows = scored.filter((r) => Number.isFinite(r.v3ProjectedIP) && Number.isFinite(r.actualIP));
const bfRows = scored.filter((r) => Number.isFinite(r.v3ProjectedBF) && Number.isFinite(r.actualBF));
const ipErr = ipRows.map((r) => r.v3ProjectedIP - r.actualIP);
const bfErr = bfRows.map((r) => r.v3ProjectedBF - r.actualBF);

const workload = {
  ipN: ipRows.length,
  ipMae: round(mean(ipErr.map(Math.abs)), 4),
  ipSigned: round(mean(ipErr), 4),
  ipRmse: round(rmse(ipErr), 4),
  bfN: bfRows.length,
  bfMae: round(mean(bfErr.map(Math.abs)), 4),
  bfSigned: round(mean(bfErr), 4),
  bfCorrelation: round(correlation(bfRows.map((r) => [r.v3ProjectedBF, r.actualBF])), 4),
};

const checks = [
  { key: "overall MAE", actual: v3.mae, target: RESEARCH_TARGETS.mae, tol: TOLERANCE.metric },
  { key: "overall RMSE", actual: v3.rmse, target: RESEARCH_TARGETS.rmse, tol: TOLERANCE.metric },
  { key: "high-line signed error", actual: v3.highLineSignedError, target: RESEARCH_TARGETS.highLineSignedError, tol: TOLERANCE.metric },
  { key: "high-line MAE", actual: v3.highLineMae, target: RESEARCH_TARGETS.highLineMae, tol: TOLERANCE.metric },
  { key: "7.5 %Under", actual: v3.line75PctUnder, target: RESEARCH_TARGETS.line75PctUnder, tol: TOLERANCE.rate },
  { key: "<=5.5 MAE", actual: v3.lowMidLineMae, target: RESEARCH_TARGETS.lowMidLineMae, tol: TOLERANCE.metric },
  { key: "v3 directional hit rate", actual: v3.directionalHitRate, target: RESEARCH_TARGETS.directionalHitRate, tol: TOLERANCE.rate },
  { key: "production directional hit rate", actual: production.directionalHitRate, target: RESEARCH_TARGETS.productionHitRate, tol: TOLERANCE.rate },
  { key: "workload IP MAE", actual: workload.ipMae, target: RESEARCH_TARGETS.ipMae, tol: TOLERANCE.metric },
  { key: "workload BF MAE", actual: workload.bfMae, target: RESEARCH_TARGETS.bfMae, tol: TOLERANCE.metric },
  { key: "workload BF correlation", actual: workload.bfCorrelation, target: RESEARCH_TARGETS.bfCorrelation, tol: TOLERANCE.metric },
].map((check) => ({
  ...check,
  delta: check.actual === null ? null : round(check.actual - check.target, 4),
  pass: check.actual !== null && Math.abs(check.actual - check.target) <= check.tol,
}));

const reproduced = checks.every((c) => c.pass);

const payload = {
  study: "mlb-k-projection-v3-workload-model",
  section: "production-config-reproduction",
  generatedAt: new Date().toISOString(),
  note:
    "Re-runs the clean historical sample using the FROZEN V3_PRODUCTION_CONFIG from " +
    "scripts/lib/mlb-k-v3-production-adapter.mjs, so the shipped configuration and the validated " +
    "configuration are proven to be the same model rather than assumed to be.",
  n: scored.length,
  productionMetrics: production,
  v3Metrics: v3,
  workload,
  researchTargets: RESEARCH_TARGETS,
  tolerance: TOLERANCE,
  checks,
  reproduced,
  directionalHitRateWarning: {
    production: production.directionalHitRate,
    v3: v3.directionalHitRate,
    deltaPoints: round(v3.directionalHitRate - production.directionalHitRate, 2),
    productionRecord: production.directionalRecord,
    v3Record: v3.directionalRecord,
    statement:
      "v3 wins fewer directional calls than production on this sample. This is a known, reported " +
      "caution carried forward from the research pass, not a hidden result, and it is the single " +
      "strongest argument for a shadow period before any promotion.",
  },
};

writeFileSync(path.join(OUT, "production-reproduction.json"), `${JSON.stringify(payload, null, 2)}\n`);

for (const check of checks) {
  console.log(
    `${check.pass ? "PASS" : "FAIL"}  ${check.key.padEnd(34)} actual=${String(check.actual).padStart(8)} target=${String(check.target).padStart(8)} delta=${String(check.delta).padStart(8)}`,
  );
}
console.log(`\nn=${scored.length}  REPRODUCED=${reproduced}`);
console.log(
  `directional hit rate: production ${production.directionalHitRate}% (${production.directionalRecord}) vs v3 ${v3.directionalHitRate}% (${v3.directionalRecord})`,
);

if (!reproduced) {
  console.error("\nIntegration does NOT reproduce the research figures. Investigate before proceeding.");
  process.exitCode = 1;
}
