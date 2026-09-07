/**
 * RESEARCH ONLY -- study mlb-k-projection-v3-workload-model
 *
 * SELECTION PASS. Chooses the v3 workload weights, the regime strength, the
 * site rule and the opponent rule on a DEVELOPMENT window only, and reports
 * every candidate's validation-window number alongside so an overfit winner is
 * visible rather than hidden. Nothing here changes production;
 * src/lib/mlb/kProjectionV2.ts and scripts/mlb-k/compute-workload-projection.mjs
 * are untouched.
 *
 * SELECTION METRIC. Every grid is ranked on next-start BATTERS FACED MAE, with
 * innings MAE as the tie-break. Batters faced, not innings, is the workload
 * quantity the strikeout projection actually consumes --
 * projectedKs = projectedKRate x projectedBF -- so it is the output whose error
 * propagates into the number this model exists to produce. Innings MAE, signed
 * error and correlation are reported for every candidate and every grid is
 * written out in full, so the alternative ranking can be read off the artifacts.
 *
 * The market K line is not read in this file at all.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { correlation, mean, rmse } from "./lib/mlb-k-research-helpers.mjs";
import { assertTemporalOrder, rankCandidates, temporalSplit } from "./lib/mlb-k-shrinkage-helpers.mjs";
import { round } from "./lib/mlb-k-shrinkage-metrics.mjs";
import { attachV3Workload, buildEvaluationRows, buildLeagueCentreIndex, loadSources } from "./lib/mlb-k-v3-dataset.mjs";

import { DEFAULTS, blendNeutralIp, priorStarts, robustIpPerStart } from "../mlb-k/mlb-k-workload-v3-core.mjs";
import { OPPONENT_DEFAULTS } from "../mlb-k/mlb-k-opponent-sp-workload-v3.mjs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "mlb", "k-research", "v3-workload-model");
mkdirSync(OUT, { recursive: true });

const STUDY_ID = "mlb-k-projection-v3-workload-model";
const DEV_FRACTION = 0.6;
const SELECTION_KEYS = [{ key: "bfMae" }, { key: "ipMae" }];

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
// 0. DATA AND SPLIT
// =================================================================================

const sources = loadSources(ROOT);
const dataset = buildEvaluationRows(sources);
const { rows: allRows, startLog, logByPitcher, leagueIndex } = dataset;
/**
 * Built ONCE: it depends only on the start log, not on any configuration under
 * test, and it is by far the most expensive part of the attach loop.
 */
const leagueCentreIndex = buildLeagueCentreIndex({ rows: allRows, startLog, logByPitcher, leagueIndex });
const split = temporalSplit(allRows, { devFraction: DEV_FRACTION });
const order = assertTemporalOrder(split.development, split.validation);
if (!order.ok) throw new Error(`temporal split leaked: ${order.violations.join(",")}`);

const devIds = new Set(split.development.map((r) => `${r.slateDate}|${r.pitcherId}`));
const isDev = (row) => devIds.has(`${row.slateDate}|${row.pitcherId}`);

function ipScore(rows, valueOf) {
  const usable = rows.filter((row) => Number.isFinite(valueOf(row)) && Number.isFinite(row.actualIP));
  if (!usable.length) return { n: 0 };
  const errors = usable.map((row) => valueOf(row) - row.actualIP);
  return {
    n: usable.length,
    ipMae: round(mean(errors.map(Math.abs)), 4),
    ipRmse: round(rmse(errors), 4),
    ipSigned: round(mean(errors), 4),
    ipCorrelation: round(correlation(usable.map((row) => [valueOf(row), row.actualIP])), 4),
  };
}

function bfScore(rows, valueOf) {
  const usable = rows.filter((row) => Number.isFinite(valueOf(row)) && Number.isFinite(row.actualBF));
  if (!usable.length) return { bfN: 0 };
  const errors = usable.map((row) => valueOf(row) - row.actualBF);
  return {
    bfN: usable.length,
    bfMae: round(mean(errors.map(Math.abs)), 4),
    bfSigned: round(mean(errors), 4),
    bfCorrelation: round(correlation(usable.map((row) => [valueOf(row), row.actualBF])), 4),
  };
}

const ipOf = (row) => row.v3.workload.finalProjectedIP;
const bfOf = (row) => row.v3.battersFaced.projectedBattersFaced;

/** Scores one fully composed v3 configuration on both windows. */
function scoreConfig(id, extra, config, opponentConfig) {
  const attached = attachV3Workload(allRows, { startLog, logByPitcher, config, opponentConfig, leagueCentreIndex });
  const dev = attached.filter(isDev);
  const val = attached.filter((row) => !isDev(row));
  const valIp = ipScore(val, ipOf);
  const valBf = bfScore(val, bfOf);
  return {
    row: {
      id,
      ...extra,
      ...ipScore(dev, ipOf),
      ...bfScore(dev, bfOf),
      meanAbsRegimeAdj: round(mean(attached.map((r) => Math.abs(r.v3.workload.currentRegimeAdjustment ?? 0))), 4),
      meanAbsSiteAdj: round(mean(attached.map((r) => Math.abs(r.v3.workload.siteAdjustment ?? 0))), 4),
      meanAbsOpponentAdj: round(mean(attached.map((r) => Math.abs(r.v3.workload.opponentAdjustment ?? 0))), 4),
      pctOpponentCapped: round((100 * attached.filter((r) => r.v3.opponent.capped).length) / Math.max(1, attached.length), 2),
      validationBfMae: valBf.bfMae,
      validationBfSigned: valBf.bfSigned,
      validationIpMae: valIp.ipMae,
      validationIpSigned: valIp.ipSigned,
    },
    attached,
  };
}

const OFF = Object.freeze({ ...OPPONENT_DEFAULTS, scale: 0 });

// =================================================================================
// 1. PITCHER NEUTRAL-IP ESTIMATOR FAMILY  (spec section 19)
// =================================================================================

function windowsFor(row) {
  const last10Starts = priorStarts(row.pitcherLog, row.slateDate, 10);
  return {
    last10Starts,
    last5Starts: last10Starts.slice(0, 5),
    seasonIpPerStart: row.seasonSplit ? row.seasonSplit.seasonIpPerStart : null,
    robust10: robustIpPerStart(last10Starts, DEFAULTS),
    robust5: robustIpPerStart(last10Starts.slice(0, 5), DEFAULTS),
    raw10: robustIpPerStart(last10Starts, { ...DEFAULTS, shortfallMax: 0 }),
    raw5: robustIpPerStart(last10Starts.slice(0, 5), { ...DEFAULTS, shortfallMax: 0 }),
  };
}
const withWindows = allRows.map((row) => ({ ...row, w: windowsFor(row) }));

/**
 * Single-window reference estimators. Reported on innings only: none of them
 * produces a batters-faced projection, so they are a diagnostic for what each
 * window is worth on its own, not candidates for selection.
 */
const SINGLE_WINDOW = {
  "v2-production-ip": (row) => row.v2ProjectedInnings,
  "season-only": (row) => row.w.seasonIpPerStart,
  "last10-only-raw": (row) => row.w.raw10.value,
  "last5-only-raw": (row) => row.w.raw5.value,
  "last10-only-robust": (row) => row.w.robust10.value,
  "last5-only-robust": (row) => row.w.robust5.value,
};
const singleWindowRows = Object.entries(SINGLE_WINDOW).map(([id, valueOf]) => ({
  id,
  family: "single-window",
  ...ipScore(withWindows.filter(isDev), valueOf),
  validationIpMae: ipScore(withWindows.filter((r) => !isDev(r)), valueOf).ipMae,
}));

const WEIGHT_SETS = [
  { id: "45/35/20", seasonWeight: 0.45, last10Weight: 0.35, last5Weight: 0.2 },
  { id: "50/30/20", seasonWeight: 0.5, last10Weight: 0.3, last5Weight: 0.2 },
  { id: "40/40/20", seasonWeight: 0.4, last10Weight: 0.4, last5Weight: 0.2 },
  { id: "45/40/15", seasonWeight: 0.45, last10Weight: 0.4, last5Weight: 0.15 },
  { id: "35/45/20", seasonWeight: 0.35, last10Weight: 0.45, last5Weight: 0.2 },
  { id: "55/30/15", seasonWeight: 0.55, last10Weight: 0.3, last5Weight: 0.15 },
  { id: "30/45/25", seasonWeight: 0.3, last10Weight: 0.45, last5Weight: 0.25 },
  { id: "60/25/15", seasonWeight: 0.6, last10Weight: 0.25, last5Weight: 0.15 },
];

const weightRows = [];
for (const set of WEIGHT_SETS) {
  for (const robust of [true, false]) {
    const config = {
      ...DEFAULTS,
      seasonWeight: set.seasonWeight,
      last10Weight: set.last10Weight,
      last5Weight: set.last5Weight,
      regimeMaxShift: 0,
      siteScale: 0,
      shortfallMax: robust ? DEFAULTS.shortfallMax : 0,
    };
    weightRows.push(
      scoreConfig(`${set.id} ${robust ? "robust" : "raw"}`, {
        family: robust ? "robust-blend" : "raw-blend",
        seasonWeight: set.seasonWeight,
        last10Weight: set.last10Weight,
        last5Weight: set.last5Weight,
      }, config, OFF).row,
    );
  }
}
writeCsv("pitcher-weight-grid.csv", [
  ...rankCandidates(weightRows, SELECTION_KEYS),
  ...rankCandidates(singleWindowRows, [{ key: "ipMae" }]),
]);

const bestWeightRow = rankCandidates(weightRows.filter((r) => r.family === "robust-blend"), SELECTION_KEYS)[0];
const bestWeights = WEIGHT_SETS.find((s) => bestWeightRow.id.startsWith(`${s.id} `));

// ---------------------------- league prior strength ----------------------------
/**
 * How hard to pull a thin-record pitcher toward the league starter level.
 * Without this the blend takes a one-start "season IP/start" at face value,
 * which produced the single worst miss in the sample.
 */
const priorRows = [0, 1, 2, 3, 5, 8].map(
  (leaguePriorK) =>
    scoreConfig(
      `leaguePriorK=${leaguePriorK}`,
      { leaguePriorK },
      { ...DEFAULTS, ...bestWeights, leaguePriorK, regimeMaxShift: 0, siteScale: 0 },
      OFF,
    ).row,
);
writeCsv("league-prior-grid.csv", rankCandidates(priorRows, SELECTION_KEYS));
const bestPrior = rankCandidates(priorRows, SELECTION_KEYS)[0];

// =================================================================================
// 2. OUTLIER WEIGHT VALIDATION  (spec section 20)
// =================================================================================

const OUTLIER_SLICES = [
  { key: "prior start <2 IP", test: (s) => s.ip < 2 },
  { key: "prior start 2-3 IP", test: (s) => s.ip >= 2 && s.ip <= 3 },
  { key: "prior start >3 IP", test: (s) => s.ip > 3 },
  {
    key: "prior start high traffic (baserunners/IP >= 2)",
    test: (s) => s.hits != null && (s.hits + (s.walks ?? 0)) / Math.max(s.ip, 1 / 3) >= 2,
  },
  {
    key: "prior start short (<3 IP) with LOW traffic",
    test: (s) => s.ip < 3 && s.hits != null && (s.hits + (s.walks ?? 0)) / Math.max(s.ip, 1 / 3) < 2,
  },
  {
    key: "prior start short (<3 IP) with HIGH traffic",
    test: (s) => s.ip < 3 && s.hits != null && (s.hits + (s.walks ?? 0)) / Math.max(s.ip, 1 / 3) >= 2,
  },
];
const allWindowStarts = withWindows.flatMap((row) =>
  row.w.last10Starts.map((start, index) => ({ start, weight: row.w.robust10.weights[index] })),
);
writeCsv(
  "outlier-weight-analysis.csv",
  OUTLIER_SLICES.map((slice) => {
    const list = allWindowStarts.filter((entry) => slice.test(entry.start));
    return {
      slice: slice.key,
      n: list.length,
      meanIp: round(mean(list.map((e) => e.start.ip)), 3),
      meanReliabilityWeight: round(mean(list.map((e) => e.weight)), 4),
      minWeight: round(list.length ? Math.min(...list.map((e) => e.weight)) : null, 4),
      maxWeight: round(list.length ? Math.max(...list.map((e) => e.weight)) : null, 4),
      pctAtFloor: round(
        list.length ? (100 * list.filter((e) => e.weight <= DEFAULTS.reliabilityFloor + 1e-9).length) / list.length : null,
        2,
      ),
    };
  }),
);
writeCsv(
  "outlier-weight-sensitivity.csv",
  weightRows.filter((r) => r.id.startsWith(`${bestWeights.id} `)),
);

// =================================================================================
// 3. REGIME STRENGTH GRID  (spec section 4)
// =================================================================================

const baseWeights = {
  seasonWeight: bestWeights.seasonWeight,
  last10Weight: bestWeights.last10Weight,
  last5Weight: bestWeights.last5Weight,
  leaguePriorK: bestPrior.leaguePriorK,
};
const regimeRows = [0, 0.15, 0.3, 0.45, 0.6].map(
  (regimeMaxShift) =>
    scoreConfig(
      `regimeMaxShift=${regimeMaxShift}`,
      { regimeMaxShift },
      { ...DEFAULTS, ...baseWeights, regimeMaxShift, siteScale: 0 },
      OFF,
    ).row,
);
writeCsv("regime-shift-grid.csv", rankCandidates(regimeRows, SELECTION_KEYS));
const bestRegime = rankCandidates(regimeRows, SELECTION_KEYS)[0];

// =================================================================================
// 4. SITE ADJUSTMENT GRID  (spec section 6)
// =================================================================================

const siteRows = [];
for (const siteScale of [0, 0.5, 0.75, 1.0]) {
  for (const siteShrinkK of [4, 8, 14]) {
    for (const siteCapIp of [0.15, 0.25, 0.4]) {
      if (siteScale === 0 && (siteShrinkK !== 4 || siteCapIp !== 0.15)) continue; // scale 0 is one candidate
      siteRows.push(
        scoreConfig(
          `scale=${siteScale} k=${siteShrinkK} cap=${siteCapIp}`,
          { siteScale, siteShrinkK, siteCapIp },
          { ...DEFAULTS, ...baseWeights, regimeMaxShift: bestRegime.regimeMaxShift, siteScale, siteShrinkK, siteCapIp },
          OFF,
        ).row,
      );
    }
  }
}
writeCsv("site-adjustment-grid.csv", rankCandidates(siteRows, SELECTION_KEYS));
const bestSite = rankCandidates(siteRows, SELECTION_KEYS)[0];

const pitcherConfig = {
  ...DEFAULTS,
  ...baseWeights,
  regimeMaxShift: bestRegime.regimeMaxShift,
  siteScale: bestSite.siteScale,
  siteShrinkK: bestSite.siteShrinkK,
  siteCapIp: bestSite.siteCapIp,
};

// =================================================================================
// 5. OPPONENT SIGNAL VALIDATION  (spec section 18)
// =================================================================================

/**
 * Does the opponent read predict anything the pitcher baseline has not already
 * accounted for? The target is the pitcher-side RESIDUAL -- innings actually
 * thrown minus the innings the pitcher-only v3 model projected -- so a signal
 * scores only for information the pitcher baseline does not already carry.
 * Opponent diagnostics are still computed at scale 0, so every signal is
 * available while contributing nothing to the projection being residualised.
 */
const pitcherOnly = attachV3Workload(allRows, { startLog, logByPitcher, config: pitcherConfig, opponentConfig: OFF, leagueCentreIndex });
const residualRows = pitcherOnly.filter((row) => Number.isFinite(ipOf(row)) && Number.isFinite(row.actualIP));
const residualIp = (row) => row.actualIP - ipOf(row);
const residualBf = (row) => row.actualBF - bfOf(row);

const OPPONENT_SIGNALS = {
  "raw opposing-SP mean IP": (row) => row.v3.opponent.opponentRawMeanStarterIP,
  "raw opposing-SP mean IP, league-centred": (row) =>
    row.v3.opponent.opponentRawMeanStarterIP === null ? null : row.v3.opponent.opponentRawMeanStarterIP - (row.leagueIpPerStart ?? 0),
  "season delta (actual - starter expected)": (row) => row.v3.opponent.opponentSeasonDelta,
  "season median delta": (row) => row.v3.opponent.opponentSeasonMedianDelta,
  "L10 delta": (row) => row.v3.opponent.opponentL10Delta,
  "L5 delta": (row) => row.v3.opponent.opponentL5Delta,
  "blended delta": (row) => row.v3.opponent.blendedDelta,
  "over-expected-IP rate (season)": (row) => row.v3.opponent.opponentOverExpectedRate,
  "final opponent adjustment (at unit scale)": (row) =>
    row.v3.opponent.blendedDelta === null
      ? null
      : row.v3.opponent.blendedDelta * (row.v3.opponent.reliability ?? 0) * (row.v3.opponent.consistencyScale ?? 0),
};

const corr = (rows, valueOf, target) =>
  round(
    correlation(rows.map((row) => [valueOf(row), target(row)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))),
    4,
  );

writeCsv(
  "opponent-delta-validation.csv",
  rankCandidates(
    Object.entries(OPPONENT_SIGNALS).map(([signal, valueOf]) => ({
      id: signal,
      signal,
      n: residualRows.length,
      devN: residualRows.filter(isDev).length,
      devCorrWithResidualIp: corr(residualRows.filter(isDev), valueOf, residualIp),
      devCorrWithResidualBf: corr(residualRows.filter(isDev), valueOf, residualBf),
      validationCorrWithResidualIp: corr(residualRows.filter((r) => !isDev(r)), valueOf, residualIp),
      fullCorrWithResidualIp: corr(residualRows, valueOf, residualIp),
      devCorrWithRawActualIp: corr(residualRows.filter(isDev), valueOf, (row) => row.actualIP),
    })),
    [{ key: "devCorrWithResidualIp", direction: "desc" }],
  ),
);

// =================================================================================
// 6. OPPONENT WEIGHT / SCALE / CAP GRID  (spec section 10)
// =================================================================================

const OPPONENT_WEIGHT_SETS = [
  { id: "50/30/20", seasonWeight: 0.5, last10Weight: 0.3, last5Weight: 0.2 },
  { id: "60/25/15", seasonWeight: 0.6, last10Weight: 0.25, last5Weight: 0.15 },
  { id: "45/35/20", seasonWeight: 0.45, last10Weight: 0.35, last5Weight: 0.2 },
  { id: "70/20/10", seasonWeight: 0.7, last10Weight: 0.2, last5Weight: 0.1 },
  { id: "100/0/0", seasonWeight: 1, last10Weight: 0, last5Weight: 0 },
];
const opponentRows = [];
for (const set of OPPONENT_WEIGHT_SETS) {
  for (const scale of [0, 0.5, 1.0, 1.5]) {
    for (const capIp of [0.3, 0.5, 0.7]) {
      if (scale === 0 && (set.id !== "50/30/20" || capIp !== 0.5)) continue; // scale 0 is one candidate
      opponentRows.push(
        scoreConfig(
          `${set.id} scale=${scale} cap=${capIp}`,
          { weights: set.id, scale, capIp },
          pitcherConfig,
          { ...OPPONENT_DEFAULTS, ...set, scale, capIp },
        ).row,
      );
    }
  }
}
writeCsv("opponent-weight-grid.csv", rankCandidates(opponentRows, SELECTION_KEYS));
const bestOpponent = rankCandidates(opponentRows, SELECTION_KEYS)[0];
const bestOpponentSet = OPPONENT_WEIGHT_SETS.find((s) => s.id === bestOpponent.weights);
const opponentConfig = {
  ...OPPONENT_DEFAULTS,
  ...bestOpponentSet,
  scale: bestOpponent.scale,
  capIp: bestOpponent.capIp,
};

// =================================================================================
// 7. TERM-BY-TERM ABLATION
// =================================================================================

const ablation = [
  scoreConfig("neutral baseline only", {}, { ...DEFAULTS, ...baseWeights, regimeMaxShift: 0, siteScale: 0 }, OFF).row,
  scoreConfig("+ regime", {}, { ...DEFAULTS, ...baseWeights, regimeMaxShift: bestRegime.regimeMaxShift, siteScale: 0 }, OFF).row,
  scoreConfig("+ regime + site", {}, pitcherConfig, OFF).row,
  scoreConfig("+ regime + site + opponent (full v3)", {}, pitcherConfig, opponentConfig).row,
];
writeCsv("workload-term-ablation.csv", ablation);

// =================================================================================
// 8. SELECTED CONFIGURATION
// =================================================================================

const selected = {
  study: STUDY_ID,
  generatedAt: new Date().toISOString(),
  selectionRule:
    "Every grid is ranked on next-start BATTERS FACED MAE over the DEVELOPMENT window only, innings MAE " +
    "as tie-break. Batters faced is the workload output the strikeout projection consumes. The validation " +
    "window is reported for every candidate but never used to choose one. The market line is not read.",
  cleanN: allRows.length,
  developmentWindow: { first: split.devDates[0], last: split.cutoffDate, rows: split.development.length },
  validationWindow: {
    first: split.validationDates[0],
    last: split.validationDates[split.validationDates.length - 1],
    rows: split.validation.length,
  },
  pitcherWeights: { ...baseWeights, chosenFrom: bestWeightRow.id, devBfMae: bestWeightRow.bfMae, devIpMae: bestWeightRow.ipMae },
  leaguePrior: { leaguePriorK: bestPrior.leaguePriorK, devBfMae: bestPrior.bfMae, devIpMae: bestPrior.ipMae, validationBfMae: bestPrior.validationBfMae },
  regime: { regimeMaxShift: bestRegime.regimeMaxShift, devBfMae: bestRegime.bfMae, devIpMae: bestRegime.ipMae },
  site: {
    siteScale: bestSite.siteScale,
    siteShrinkK: bestSite.siteShrinkK,
    siteCapIp: bestSite.siteCapIp,
    devBfMae: bestSite.bfMae,
    meanAbsAdjustment: bestSite.meanAbsSiteAdj,
  },
  opponent: {
    weights: bestOpponent.weights,
    scale: bestOpponent.scale,
    capIp: bestOpponent.capIp,
    devBfMae: bestOpponent.bfMae,
    validationBfMae: bestOpponent.validationBfMae,
    meanAbsAdjustment: bestOpponent.meanAbsOpponentAdj,
    pctCapped: bestOpponent.pctOpponentCapped,
  },
  config: pitcherConfig,
  opponentConfig,
  ablation,
};
writeJson("selected-config.json", selected);

console.log(
  JSON.stringify(
    {
      cleanN: selected.cleanN,
      dev: selected.developmentWindow,
      validation: selected.validationWindow,
      pitcherWeights: selected.pitcherWeights,
      leaguePrior: selected.leaguePrior,
      regime: selected.regime,
      site: selected.site,
      opponent: selected.opponent,
      ablation: ablation.map((r) => ({
        id: r.id,
        devBfMae: r.bfMae,
        devBfSigned: r.bfSigned,
        devIpMae: r.ipMae,
        devIpSigned: r.ipSigned,
        valBfMae: r.validationBfMae,
        valBfSigned: r.validationBfSigned,
        valIpMae: r.validationIpMae,
      })),
    },
    null,
    1,
  ),
);
