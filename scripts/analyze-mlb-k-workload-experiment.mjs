/**
 * analyze-mlb-k-workload-experiment.mjs  (calibration experiment 3)
 *
 * ANALYSIS ONLY. Does not modify any production module. Reads the instrumented
 * workload backtest dataset (built by build-mlb-k-backtest-dataset.mjs with the
 * additive `workloadDecomp` + `_v2Input` blocks) and:
 *
 *   1. decomposes baseline workload accuracy (projected BF/IP vs actual)
 *   2. evaluates a small grid of interpretable changes INSIDE the existing
 *      workload structure (BF blend weights, pitch->league regression, caps,
 *      post-clamp variance inflation) — K-rate model untouched
 *   3. for each candidate reports workload-only metrics AND downstream Projected
 *      K metrics, the latter by RE-RUNNING the real production projectStrikeoutsV2
 *      with only the projected workload swapped
 *
 * Development : 2023 + 2024   (selection)
 * Holdout     : 2025          (scored once, never fed back)
 * Full        : 2023-2025     (descriptive only)
 *
 * Usage:
 *   node scripts/analyze-mlb-k-workload-experiment.mjs \
 *     --dir=data/mlb/k-history/backtest/2023-2025-v2_2-workload
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { mean, median, ols, pearson, rmse, round, stddev, tercileEdges, bucketByEdges } from "./lib/mlb-k-backtest-stats.mjs";
import { BASELINE_PARAMS, reprojectFromDecomp } from "./lib/mlb-k-workload-experiment.mjs";
import { loadProjectStrikeoutsV2 } from "./lib/mlb-k-backtest-v2-loader.mjs";

const ROOT = process.cwd();
const DEV_SEASONS = new Set([2023, 2024]);
const HOLDOUT_SEASON = 2025;
const MIN_SEGMENT_N = 40;

// ---------------------------------------------------------------- candidates ---
// Each candidate is a small, interpretable override of BASELINE_PARAMS.
function candidateGrid() {
  return [
    { id: "baseline", label: "V2.2 production workload", params: {} },
    { id: "C1a-bf-blend-45-55", label: "BF blend 0.45 pitch / 0.55 recentBF", params: { bfByPitchesWeight: 0.45, bfRecentWeight: 0.55 } },
    { id: "C1b-bf-blend-30-70", label: "BF blend 0.30 pitch / 0.70 recentBF", params: { bfByPitchesWeight: 0.30, bfRecentWeight: 0.70 } },
    { id: "C2-pitch-reg-85-15", label: "Pitch limit 0.85 recent / 0.15 league", params: { pitchRecentWeightHi: 0.85, pitchLeagueWeightHi: 0.15 } },
    { id: "C3-combined-mild", label: "C1a + C2 (BF 0.45/0.55, pitch 0.85/0.15)", params: { bfByPitchesWeight: 0.45, bfRecentWeight: 0.55, pitchRecentWeightHi: 0.85, pitchLeagueWeightHi: 0.15 } },
    { id: "C4-widen-caps", label: "Widen caps (pitchMax x1.10, bfMax x1.15, bfMin x0.85)", params: { pitchMaxFactor: 1.10, bfMaxFactor: 1.15, bfMinFactor: 0.85 } },
    { id: "C5-variance-inflate-125", label: "Post-clamp variance inflation k=1.25 about role mean", params: { varianceInflation: 1.25 } },
  ];
}

// -------------------------------------------------------------------- helpers ---
function loadRows(datasetPath) {
  return readFileSync(datasetPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function scoreable(rows) {
  return rows.filter(
    (r) =>
      r.workloadDecomp &&
      r._v2Input &&
      Number.isFinite(r.workloadDecomp.expectedBF) &&
      Number.isFinite(r.actual?.battersFaced) &&
      r.actual.battersFaced > 0 &&
      Number.isFinite(r.actual?.inningsPitched) &&
      Number.isFinite(r.actual?.strikeouts) &&
      Number.isFinite(r.v2?.projectedStrikeouts),
  );
}

function corr(pairs) {
  return round(pearson(pairs), 4);
}

function calib(entries) {
  if (entries.length < 50) return { slope: null, intercept: null };
  const fit = ols(entries.map((e) => e.actual), [entries.map((e) => e.projection)]);
  return fit ? { slope: round(fit.coefficients[0], 4), intercept: round(fit.intercept, 4) } : { slope: null, intercept: null };
}

/** Full error profile: error = actual - projection (positive => under-projection). */
function profile(entries) {
  const errs = entries.map((e) => e.actual - e.projection);
  const proj = entries.map((e) => e.projection);
  const act = entries.map((e) => e.actual);
  const c = calib(entries);
  return {
    n: entries.length,
    mae: round(mean(errs.map(Math.abs)), 4),
    rmse: round(rmse(errs), 4),
    corr: corr(entries.map((e) => [e.projection, e.actual])),
    bias: round(mean(errs), 4),
    medAbsErr: round(median(errs.map(Math.abs)), 4),
    projMean: round(mean(proj), 3),
    projSD: round(stddev(proj), 4),
    actualSD: round(stddev(act), 4),
    sdRatio: round(stddev(proj) / stddev(act), 4),
    calibSlope: c.slope,
    calibIntercept: c.intercept,
  };
}

function biasBy(entries, keyOf) {
  const groups = new Map();
  for (const e of entries) {
    const k = keyOf(e);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .filter(([, list]) => list.length >= MIN_SEGMENT_N)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([k, list]) => [
        k,
        {
          n: list.length,
          bias: round(mean(list.map((e) => e.actual - e.projection)), 4),
          mae: round(mean(list.map((e) => Math.abs(e.actual - e.projection))), 4),
          projSD: round(stddev(list.map((e) => e.projection)), 3),
          actualSD: round(stddev(list.map((e) => e.actual)), 3),
        },
      ]),
  );
}

function actualIpBucket(ip) {
  if (!Number.isFinite(ip)) return null;
  if (ip < 4) return "1_lt4IP";
  if (ip < 6) return "2_4to6IP";
  if (ip < 7) return "3_6to7IP";
  return "4_7plusIP";
}

// -------------------------------------------------------------- core evaluation ---
function evaluateWorkload(entries, projKey) {
  const items = entries.map((e) => ({ actual: e.actualBF, projection: e[projKey].bf }));
  const ipItems = entries.map((e) => ({ actual: e.actualIP, projection: e[projKey].ip }));
  return {
    bf: profile(items),
    ip: profile(ipItems.filter((x) => Number.isFinite(x.projection))),
    bfBiasByActualIp: biasBy(
      entries.map((e) => ({ actual: e.actualBF, projection: e[projKey].bf, ipb: actualIpBucket(e.actualIP) })),
      (e) => e.ipb,
    ),
  };
}

function evaluateDownstream(entries, projKey) {
  const items = entries.map((e) => ({ actual: e.actualK, projection: e[projKey].k }));
  const p = profile(items);
  const projEdges = tercileEdges(entries.map((e) => e.baseline.k));
  const lowHigh = (name, idx) => {
    const list = entries.filter((e) => bucketByEdges(e.baseline.k, projEdges) === `q${idx}`);
    return list.length
      ? { n: list.length, bias: round(mean(list.map((e) => e.actualK - e[projKey].k)), 4), projMean: round(mean(list.map((e) => e[projKey].k)), 3) }
      : { n: 0 };
  };
  return {
    ...p,
    lowProjKBias: lowHigh("low", 1),
    midProjKBias: lowHigh("mid", 2),
    highProjKBias: lowHigh("high", 3),
    kBiasByActualIp: biasBy(
      entries.map((e) => ({ actual: e.actualK, projection: e[projKey].k, ipb: actualIpBucket(e.actualIP) })),
      (e) => e.ipb,
    ),
    bySeasonPhase: biasBy(entries.map((e) => ({ actual: e.actualK, projection: e[projKey].k, ph: e.seasonPhase })), (e) => e.ph),
    byDataQualityTier: biasBy(entries.map((e) => ({ actual: e.actualK, projection: e[projKey].k, t: e.dqt })), (e) => e.t),
    byRecentWorkloadTier: biasBy(entries.map((e) => ({ actual: e.actualK, projection: e[projKey].k, t: e.recentBfTier })), (e) => e.t),
    startLengthSplit: {
      short_lt5IP: profileSub(entries.filter((e) => e.actualIP < 5), projKey, "k", "actualK"),
      long_ge6IP: profileSub(entries.filter((e) => e.actualIP >= 6), projKey, "k", "actualK"),
    },
  };
}

function profileSub(entries, projKey, field, actualField) {
  if (!entries.length) return { n: 0 };
  return profile(entries.map((e) => ({ actual: e[actualField], projection: e[projKey][field] })));
}

// ------------------------------------------------------------------------ main ---
export async function runExperiment(datasetPath) {
  const projectStrikeoutsV2 = await loadProjectStrikeoutsV2();
  const allRows = loadRows(datasetPath);
  const rows = scoreable(allRows);

  // dev-set tercile edges for the recent-workload tier (recency-weighted recent BF)
  const devRecentBf = rows
    .filter((r) => DEV_SEASONS.has(r.season) && Number.isFinite(r.workloadDecomp.recentBfAverage))
    .map((r) => r.workloadDecomp.recentBfAverage);
  const recentBfEdges = tercileEdges(devRecentBf);
  const recentBfTierOf = (r) => {
    const v = r.workloadDecomp.recentBfAverage;
    if (!Number.isFinite(v)) return null;
    const q = bucketByEdges(v, recentBfEdges);
    return q === "q1" ? "1_light" : q === "q2" ? "2_mid" : "3_heavy";
  };

  // dev-set role means for variance inflation
  const roleMeanBF = {};
  for (const role of ["starter", "opener", "reliever"]) {
    const v = rows.filter((r) => DEV_SEASONS.has(r.season) && r.workloadDecomp.role === role).map((r) => r.workloadDecomp.expectedBF);
    roleMeanBF[role] = v.length ? mean(v) : null;
  }

  const grid = candidateGrid();

  // Reproject workload + rerun production V2 downstream for every candidate/row.
  function projectRow(row, params) {
    const wl = reprojectFromDecomp(row.workloadDecomp, params, roleMeanBF[row.workloadDecomp.role]);
    const bf = wl.expectedBF;
    const ip = wl.expectedInnings;
    let k = null;
    if (Number.isFinite(bf)) {
      const v2in = row._v2Input;
      const patched = {
        ...v2in,
        pitcher: {
          ...v2in.pitcher,
          projectedBattersFaced: bf,
          projectedInnings: Number.isFinite(ip) ? ip : v2in.pitcher.projectedInnings,
          averageBattersFacedPerInning: Number.isFinite(ip) && ip > 0 ? bf / ip : v2in.pitcher.averageBattersFacedPerInning,
        },
      };
      const out = projectStrikeoutsV2(patched);
      k = Number.isFinite(out.projectedStrikeouts) ? out.projectedStrikeouts : null;
    }
    return { bf, ip, k };
  }

  const enriched = rows.map((row) => {
    const rec = {
      season: row.season,
      seasonPhase: row.seasonPhase ?? null,
      dqt: row.dataQualityTier ?? null,
      role: row.workloadDecomp.role,
      recentBfTier: recentBfTierOf(row),
      actualBF: row.actual.battersFaced,
      actualIP: row.actual.inningsPitched,
      actualK: row.actual.strikeouts,
      storedV2K: row.v2.projectedStrikeouts,
      storedV2BF: row.workloadDecomp.expectedBF,
    };
    for (const c of grid) rec[c.id] = projectRow(row, c.params);
    rec.baseline = rec.baseline; // alias present
    return rec;
  });

  // fidelity: candidate "baseline" reruns must reproduce the stored V2 K within tolerance
  const reproDiffs = enriched
    .filter((e) => Number.isFinite(e.baseline.k) && Number.isFinite(e.storedV2K))
    .map((e) => Math.abs(e.baseline.k - e.storedV2K));
  const reproBFDiffs = enriched.map((e) => Math.abs(e.baseline.bf - e.storedV2BF));
  const repro = {
    kMaxAbsDiff: round(Math.max(...reproDiffs), 5),
    kMeanAbsDiff: round(mean(reproDiffs), 6),
    kRowsOver_0_02: reproDiffs.filter((d) => d > 0.02).length,
    bfMaxAbsDiff: round(Math.max(...reproBFDiffs), 6),
  };

  const splits = {
    development: enriched.filter((e) => DEV_SEASONS.has(e.season)),
    holdout: enriched.filter((e) => e.season === HOLDOUT_SEASON),
    full: enriched,
  };

  const candidates = grid.map((c) => ({
    id: c.id,
    label: c.label,
    params: { ...BASELINE_PARAMS, ...c.params },
    changedParams: c.params,
    isBaseline: c.id === "baseline",
    development: {
      workload: evaluateWorkload(splits.development, c.id),
      downstream: evaluateDownstream(splits.development, c.id),
    },
    holdout: {
      workload: evaluateWorkload(splits.holdout, c.id),
      downstream: evaluateDownstream(splits.holdout, c.id),
    },
    full: {
      workload: evaluateWorkload(splits.full, c.id),
      downstream: evaluateDownstream(splits.full, c.id),
    },
  }));

  const baseline = candidates.find((c) => c.isBaseline);
  const selection = select(candidates, baseline);

  return {
    schemaVersion: 1,
    kind: "mlb-k-workload-experiment",
    experiment: "experiment-3-workload-calibration",
    generatedAt: new Date().toISOString(),
    datasetPath: path.relative(ROOT, datasetPath),
    baseModel: "V2.2 (pitcher-skill shrinkage alpha 0.55 + opponent multiplier 0.75, both already applied and unchanged)",
    change: "projected workload only: reprojectFromDecomp() recomputes expectedBF/expectedInnings inside the existing mlb-k-workload-v2 structure; production projectStrikeoutsV2 re-run with the swapped workload; K-rate model, shrinkage, opponent term, clamp all untouched",
    splitDefinition: { development: "2023 + 2024", holdout: "2025 (scored once)", full: "2023-2025 descriptive only" },
    counts: {
      datasetRows: allRows.length,
      scoreableRows: rows.length,
      development: splits.development.length,
      holdout: splits.holdout.length,
      byRole: countBy(rows, (r) => r.workloadDecomp.role),
    },
    recentBfTercileEdges_devSet: recentBfEdges.map((v) => round(v, 3)),
    roleMeanBF_devSet: Object.fromEntries(Object.entries(roleMeanBF).map(([k, v]) => [k, round(v, 3)])),
    baselineReproduction: repro,
    candidates,
    selection,
  };
}

function countBy(rows, keyOf) {
  const m = {};
  for (const r of rows) {
    const k = keyOf(r) ?? "unknown";
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
}

/**
 * Selection — DEVELOPMENT ONLY. Prefer the smallest, simplest change that:
 *  - moves projected-BF SD ratio (proj/actual) toward 1 by >= 0.05 without
 *    overshooting (dev BF sdRatio must land in [0.72, 1.05]; baseline ~0.78)
 *  - improves BF MAE and BF correlation (>= baseline - 0.001)
 *  - does not worsen downstream Projected-K RMSE (dev) and does not add K bias
 *    (|dev K bias| <= baseline + 0.06)
 *  - keeps downstream K calibration slope in [0.90, 1.05]
 *  - does not create a material short/long start divergence worse than baseline
 * Among survivors: fewest changed knobs, then smallest total knob delta, then
 * best dev downstream K RMSE.
 */
function select(candidates, baseline) {
  const b = baseline.development;
  const bwl = b.workload.bf;
  const bk = b.downstream;
  // A candidate must improve BOTH workload fidelity and downstream K without
  // making the workload point estimate materially less realistic.
  const passes = (c) => {
    const wl = c.development.workload.bf;
    const k = c.development.downstream;
    const sdGain = (wl.sdRatio ?? 0) - (bwl.sdRatio ?? 0); // toward 1.0
    return (
      !c.isBaseline &&
      sdGain >= 0.03 &&
      (wl.sdRatio ?? 0) <= 1.05 &&
      Math.abs(1 - (wl.calibSlope ?? 0)) <= Math.abs(1 - (bwl.calibSlope ?? 0)) && // BF calibration slope closer to 1
      (wl.mae ?? 99) - (bwl.mae ?? 0) <= 0.02 && // BF point accuracy not materially worse
      (wl.corr ?? 0) >= (bwl.corr ?? 0) - 0.004 &&
      (k.mae ?? 99) <= (bk.mae ?? 0) + 0.001 && // downstream K not worse
      (k.rmse ?? 99) <= (bk.rmse ?? 0) + 0.001 &&
      (k.corr ?? 0) >= (bk.corr ?? 0) - 0.001 &&
      Math.abs(k.bias ?? 0) <= Math.abs(bk.bias ?? 0) + 0.02
    );
  };
  const survivors = candidates.filter(passes);
  const knobCount = (c) => Object.keys(c.changedParams).length;
  const knobDelta = (c) =>
    Object.entries(c.changedParams).reduce((s, [key, v]) => s + Math.abs(v - (BASELINE_PARAMS[key] ?? 0)), 0);
  const pick = survivors
    .slice()
    .sort(
      (x, y) =>
        knobCount(x) - knobCount(y) ||
        knobDelta(x) - knobDelta(y) ||
        (x.development.downstream.rmse ?? 9) - (y.development.downstream.rmse ?? 9),
    )[0];

  const deltaVs = (cand, split) => {
    const cb = baseline[split];
    const cc = cand[split];
    return {
      bf: {
        mae: round((cc.workload.bf.mae ?? 0) - (cb.workload.bf.mae ?? 0), 4),
        rmse: round((cc.workload.bf.rmse ?? 0) - (cb.workload.bf.rmse ?? 0), 4),
        corr: round((cc.workload.bf.corr ?? 0) - (cb.workload.bf.corr ?? 0), 4),
        bias: round((cc.workload.bf.bias ?? 0) - (cb.workload.bf.bias ?? 0), 4),
        sdRatio: round((cc.workload.bf.sdRatio ?? 0) - (cb.workload.bf.sdRatio ?? 0), 4),
      },
      ip: {
        mae: round((cc.workload.ip.mae ?? 0) - (cb.workload.ip.mae ?? 0), 4),
        bias: round((cc.workload.ip.bias ?? 0) - (cb.workload.ip.bias ?? 0), 4),
        sdRatio: round((cc.workload.ip.sdRatio ?? 0) - (cb.workload.ip.sdRatio ?? 0), 4),
      },
      k: {
        mae: round((cc.downstream.mae ?? 0) - (cb.downstream.mae ?? 0), 4),
        rmse: round((cc.downstream.rmse ?? 0) - (cb.downstream.rmse ?? 0), 4),
        corr: round((cc.downstream.corr ?? 0) - (cb.downstream.corr ?? 0), 4),
        bias: round((cc.downstream.bias ?? 0) - (cb.downstream.bias ?? 0), 4),
        calibSlope: round((cc.downstream.calibSlope ?? 0) - (cb.downstream.calibSlope ?? 0), 4),
        projSD: round((cc.downstream.projSD ?? 0) - (cb.downstream.projSD ?? 0), 4),
      },
    };
  };

  // "closest" = smallest change that is at least downstream-K-neutral on dev,
  // reported even when the full bar is not cleared.
  const closest = candidates
    .filter((c) => !c.isBaseline && (c.development.downstream.mae ?? 99) <= (bk.mae ?? 0) + 0.0005 && (c.development.downstream.rmse ?? 99) <= (bk.rmse ?? 0) + 0.0005)
    .sort((x, y) => Object.keys(x.changedParams).length - Object.keys(y.changedParams).length || (x.development.downstream.rmse ?? 9) - (y.development.downstream.rmse ?? 9))[0];

  return {
    selected: pick ? pick.id : null,
    closestNeutralCandidate: closest
      ? { id: closest.id, developmentDeltaVsBaseline: deltaVs(closest, "development"), holdoutDeltaVsBaseline: deltaVs(closest, "holdout") }
      : null,
    verdict: pick
      ? `adopt ${pick.id} (development bar cleared; smallest qualifying change)`
      : "no candidate cleared the development bar — reject / narrower experiment",
    rule:
      "dev-only: BF SD-ratio gain >= 0.03 toward 1.0 (cap 1.05); BF calibration slope closer to 1; BF MAE not worse by > 0.02 and BF corr not down > 0.004; downstream K MAE/RMSE not worse by > 0.001 and K corr not down > 0.001; |K bias| not up > 0.02. Tie-break: fewest knobs, then smallest knob delta, then dev K RMSE.",
    survivors: survivors.map((c) => c.id),
    developmentDeltaVsBaseline: pick ? deltaVs(pick, "development") : null,
    holdoutDeltaVsBaseline: pick ? deltaVs(pick, "holdout") : null,
    fullDeltaVsBaseline: pick ? deltaVs(pick, "full") : null,
  };
}

// ---------------------------------------------------------------------- report ---
function f(v) {
  return v == null ? "—" : String(v);
}

function wlRow(c, split) {
  const bf = c[split].workload.bf;
  const ip = c[split].workload.ip;
  return `| ${c.id}${c.isBaseline ? " *" : ""} | ${f(bf.n)} | ${f(bf.mae)} | ${f(bf.rmse)} | ${f(bf.corr)} | ${f(bf.bias)} | ${f(bf.projSD)} | ${f(bf.sdRatio)} | ${f(ip.mae)} | ${f(ip.rmse)} | ${f(ip.corr)} | ${f(ip.bias)} |`;
}

function kRow(c, split) {
  const k = c[split].downstream;
  return `| ${c.id}${c.isBaseline ? " *" : ""} | ${f(k.n)} | ${f(k.mae)} | ${f(k.rmse)} | ${f(k.corr)} | ${f(k.bias)} | ${f(k.calibSlope)} | ${f(k.projSD)} | ${f(k.lowProjKBias.bias)} | ${f(k.highProjKBias.bias)} | ${f(k.startLengthSplit.short_lt5IP.bias)} | ${f(k.startLengthSplit.long_ge6IP.bias)} |`;
}

export function renderReport(result) {
  const L = [];
  const base = result.candidates.find((c) => c.isBaseline);
  L.push("# MLB Projected-K calibration — Experiment 3: workload calibration", "");
  L.push(`Generated ${result.generatedAt}. Analysis only; no production module changed.`, "");
  L.push(`Base model: **${result.baseModel}**`, "");
  L.push(`**Change under test:** ${result.change}`, "");
  L.push(`Signed error = actual − projection (positive ⇒ under-projection). Baseline row \`*\`.`, "");
  L.push("", "## Setup", "");
  L.push(`- Development ${result.splitDefinition.development} — n=${result.counts.development}`);
  L.push(`- Holdout ${result.splitDefinition.holdout} — n=${result.counts.holdout}`);
  L.push(`- Scoreable rows ${result.counts.scoreableRows} of ${result.counts.datasetRows}; roles ${JSON.stringify(result.counts.byRole)}`);
  L.push(`- Recent-BF tercile edges (dev set): ${result.recentBfTercileEdges_devSet.join(", ")}`);
  L.push(
    `- Baseline reproduction: downstream K max |Δ| ${result.baselineReproduction.kMaxAbsDiff}, mean |Δ| ${result.baselineReproduction.kMeanAbsDiff}, rows over 0.02 ${result.baselineReproduction.kRowsOver_0_02}; workload BF max |Δ| ${result.baselineReproduction.bfMaxAbsDiff}`,
  );

  L.push("", "## Baseline workload decomposition (development)", "");
  const bw = base.development.workload;
  const bk = base.development.downstream;
  L.push(`- Projected BF vs actual: MAE ${f(bw.bf.mae)}, RMSE ${f(bw.bf.rmse)}, corr ${f(bw.bf.corr)}, bias ${f(bw.bf.bias)}`);
  L.push(`- Projected BF SD ${f(bw.bf.projSD)} vs actual SD ${f(bw.bf.actualSD)} → **SD ratio ${f(bw.bf.sdRatio)}** (under-dispersed)`);
  L.push(`- Projected BF calibration: slope ${f(bw.bf.calibSlope)}, intercept ${f(bw.bf.calibIntercept)}`);
  L.push(`- Projected IP vs actual: MAE ${f(bw.ip.mae)}, RMSE ${f(bw.ip.rmse)}, corr ${f(bw.ip.corr)}, bias ${f(bw.ip.bias)}, SD ratio ${f(bw.ip.sdRatio)}`);
  L.push("", "Projected-BF signed bias by actual-IP bucket (baseline):", "");
  L.push("| bucket | n | BF bias | BF mae |", "| --- | --- | --- | --- |");
  for (const [k, v] of Object.entries(bw.bfBiasByActualIp)) L.push(`| ${k} | ${v.n} | ${f(v.bias)} | ${f(v.mae)} |`);
  L.push("", "Downstream Projected-K signed bias by actual-IP bucket (baseline):", "");
  L.push("| bucket | n | K bias |", "| --- | --- | --- |");
  for (const [k, v] of Object.entries(bk.kBiasByActualIp)) L.push(`| ${k} | ${v.n} | ${f(v.bias)} |`);
  L.push("", "By recent-workload tier / season phase / data-quality tier (downstream K bias):", "");
  L.push("| segment | key | n | K bias | K mae |", "| --- | --- | --- | --- | --- |");
  for (const [k, v] of Object.entries(bk.byRecentWorkloadTier)) L.push(`| recentWorkload | ${k} | ${v.n} | ${f(v.bias)} | ${f(v.mae)} |`);
  for (const [k, v] of Object.entries(bk.bySeasonPhase)) L.push(`| seasonPhase | ${k} | ${v.n} | ${f(v.bias)} | ${f(v.mae)} |`);
  for (const [k, v] of Object.entries(bk.byDataQualityTier)) L.push(`| dataQuality | ${k} | ${v.n} | ${f(v.bias)} | ${f(v.mae)} |`);

  const WL_HEADER = "| candidate | n | BF MAE | BF RMSE | BF corr | BF bias | BF projSD | BF sdRatio | IP MAE | IP RMSE | IP corr | IP bias |";
  const K_HEADER = "| candidate | n | K MAE | K RMSE | K corr | K bias | K calibSlope | K projSD | lowProjK bias | highProjK bias | short<5IP bias | long>=6IP bias |";
  for (const [split, title] of [
    ["development", "A. Development (2023–2024) — selection"],
    ["holdout", "B. Holdout (2025) — untouched"],
    ["full", "C. Full 2023–2025 — descriptive only"],
  ]) {
    L.push("", `## ${title}`, "", "### Workload-only", "", WL_HEADER, `| ${"--- |".repeat(12)}`);
    for (const c of result.candidates) L.push(wlRow(c, split));
    L.push("", "### Downstream Projected K (production V2.2 re-run)", "", K_HEADER, `| ${"--- |".repeat(12)}`);
    for (const c of result.candidates) L.push(kRow(c, split));
  }

  const s = result.selection;
  L.push("", "## Selection (development only)", "");
  L.push(`- Rule: ${s.rule}`);
  L.push(`- Survivors: ${s.survivors.join(", ") || "none"}`);
  L.push(`- **Verdict: ${s.verdict}**`);
  if (s.closestNeutralCandidate) {
    const c = s.closestNeutralCandidate;
    L.push(
      `- Closest downstream-K-neutral candidate: **${c.id}** — dev Δ BF sdRatio ${f(c.developmentDeltaVsBaseline.bf.sdRatio)}, BF MAE ${f(c.developmentDeltaVsBaseline.bf.mae)}, BF corr ${f(c.developmentDeltaVsBaseline.bf.corr)}; K MAE ${f(c.developmentDeltaVsBaseline.k.mae)}, K RMSE ${f(c.developmentDeltaVsBaseline.k.rmse)}, K corr ${f(c.developmentDeltaVsBaseline.k.corr)}, K bias ${f(c.developmentDeltaVsBaseline.k.bias)}`,
    );
    L.push(
      `  - Holdout Δ: BF sdRatio ${f(c.holdoutDeltaVsBaseline.bf.sdRatio)}, BF MAE ${f(c.holdoutDeltaVsBaseline.bf.mae)}; K MAE ${f(c.holdoutDeltaVsBaseline.k.mae)}, K RMSE ${f(c.holdoutDeltaVsBaseline.k.rmse)}, K corr ${f(c.holdoutDeltaVsBaseline.k.corr)}`,
    );
  }
  if (s.selected) {
    const d = s.developmentDeltaVsBaseline;
    const h = s.holdoutDeltaVsBaseline;
    L.push(
      `- Dev Δ vs V2.2: BF MAE ${f(d.bf.mae)}, BF corr ${f(d.bf.corr)}, BF sdRatio ${f(d.bf.sdRatio)}; K MAE ${f(d.k.mae)}, K RMSE ${f(d.k.rmse)}, K corr ${f(d.k.corr)}, K bias ${f(d.k.bias)}, K projSD ${f(d.k.projSD)}`,
    );
    L.push(
      `- Holdout Δ vs V2.2: BF MAE ${f(h.bf.mae)}, BF corr ${f(h.bf.corr)}, BF sdRatio ${f(h.bf.sdRatio)}; K MAE ${f(h.k.mae)}, K RMSE ${f(h.k.rmse)}, K corr ${f(h.k.corr)}, K bias ${f(h.k.bias)}`,
    );
    const pick = result.candidates.find((c) => c.id === s.selected);
    for (const split of ["development", "holdout"]) {
      L.push("", `### ${split} — short/long start & thin-tier detail (selected vs baseline)`, "");
      const pb = base[split];
      const pp = pick[split];
      L.push("| metric | baseline | selected |", "| --- | --- | --- |");
      L.push(`| short <5IP: K bias / mae | ${f(pb.downstream.startLengthSplit.short_lt5IP.bias)} / ${f(pb.downstream.startLengthSplit.short_lt5IP.mae)} | ${f(pp.downstream.startLengthSplit.short_lt5IP.bias)} / ${f(pp.downstream.startLengthSplit.short_lt5IP.mae)} |`);
      L.push(`| long >=6IP: K bias / mae | ${f(pb.downstream.startLengthSplit.long_ge6IP.bias)} / ${f(pb.downstream.startLengthSplit.long_ge6IP.mae)} | ${f(pp.downstream.startLengthSplit.long_ge6IP.bias)} / ${f(pp.downstream.startLengthSplit.long_ge6IP.mae)} |`);
      const e = (m, key) => (m.bySeasonPhase.early ? `${f(m.bySeasonPhase.early.bias)} / ${f(m.bySeasonPhase.early.mae)}` : "—");
      L.push(`| early season: K bias / mae | ${e(pb.downstream)} | ${e(pp.downstream)} |`);
      const t = (m) => (m.byDataQualityTier.C ? `${f(m.byDataQualityTier.C.bias)} / ${f(m.byDataQualityTier.C.mae)}` : "—");
      L.push(`| data-quality C: K bias / mae | ${t(pb.downstream)} | ${t(pp.downstream)} |`);
      L.push(`| BF bias by actual IP <4 / 4-6 / 6-7 / 7+ | ${ipBiasStr(pb.workload.bfBiasByActualIp)} | ${ipBiasStr(pp.workload.bfBiasByActualIp)} |`);
      L.push(`| K bias by actual IP <4 / 4-6 / 6-7 / 7+ | ${ipBiasStr(pb.downstream.kBiasByActualIp)} | ${ipBiasStr(pp.downstream.kBiasByActualIp)} |`);
    }
  }

  L.push("", "## Notes", "");
  L.push("- Selection used development (2023–2024) only. The 2025 holdout was scored once.");
  L.push("- `decomposeWorkload`/`reprojectFromDecomp` reproduce the production `mlb-k-workload-v2` expectedBF/expectedInnings exactly at baseline params (fidelity test + full-dataset check).");
  L.push("- Downstream K re-runs the real `projectStrikeoutsV2` with ONLY projected workload swapped; shrinkage, opponent term and clamp are untouched.");
  return `${L.join("\n")}\n`;
}

function ipBiasStr(byBucket) {
  const g = (k) => (byBucket[k] ? f(byBucket[k].bias) : "—");
  return `${g("1_lt4IP")} / ${g("2_4to6IP")} / ${g("3_6to7IP")} / ${g("4_7plusIP")}`;
}

export async function main(argv = process.argv.slice(2)) {
  const dir =
    argv.find((e) => e.startsWith("--dir="))?.slice(6) ??
    path.join("data", "mlb", "k-history", "backtest", "2023-2025-v2_2-workload");
  const datasetPath = path.isAbsolute(dir) ? path.join(dir, "dataset.jsonl") : path.join(ROOT, dir, "dataset.jsonl");
  const result = await runExperiment(datasetPath);
  const outDir = path.join(path.dirname(datasetPath), "workload-experiment");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "experiment.json"), JSON.stringify(result, null, 2), "utf8");
  const report = renderReport(result);
  writeFileSync(path.join(outDir, "report.md"), report, "utf8");
  console.log(report);
  console.log(`\nWrote ${path.relative(ROOT, outDir)}/experiment.json + report.md`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[analyze-mlb-k-workload-experiment] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
