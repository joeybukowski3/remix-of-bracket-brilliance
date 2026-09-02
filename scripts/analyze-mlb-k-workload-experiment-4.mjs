/**
 * analyze-mlb-k-workload-experiment-4.mjs  (calibration experiment 4)
 *
 * ANALYSIS ONLY. No production module changed.
 *
 * Reads the instrumented backtest dataset (built with the additive
 * `workloadDecomp` + `_v2Input` + `workload4Inputs` blocks) and evaluates a
 * small grid of PITCHER-ANCHORED workload projections:
 *
 *   baseline  : production V2.2 workload (exact)
 *   B50/B60/B70 : projected pitch-limit / BF / IP = blend(season per-start,
 *                 last-5 per-start) at 50/50, 60/40, 70/30; league/role
 *                 defaults only as a fallback when season starts < 3 AND no
 *                 recent sample
 *   B60_ppb   : B60 but expected BF = pitch-limit / pitcher's own season
 *               pitches-per-BF (the one optional arm)
 *
 * For each candidate: workload-only metrics (IP / BF / pitches) AND downstream
 * Projected K, the latter by RE-RUNNING the real production projectStrikeoutsV2
 * with only the projected workload swapped. K-rate model, shrinkage (0.55),
 * opponent multiplier (0.75) and clamp (+/-0.035) untouched.
 *
 * Development : 2023 + 2024   (selection)
 * Holdout     : 2025          (scored once)
 * Full        : 2023-2025     (descriptive only)
 *
 * Usage:
 *   node scripts/analyze-mlb-k-workload-experiment-4.mjs \
 *     --dir=data/mlb/k-history/backtest/2023-2025-v2_2-workload
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { mean, median, ols, pearson, rmse, round, stddev } from "./lib/mlb-k-backtest-stats.mjs";
import { reprojectV4 } from "./lib/mlb-k-workload-experiment-4.mjs";
import { loadProjectStrikeoutsV2 } from "./lib/mlb-k-backtest-v2-loader.mjs";

const ROOT = process.cwd();
const DEV_SEASONS = new Set([2023, 2024]);
const HOLDOUT_SEASON = 2025;
const MIN_SEGMENT_N = 40;

function candidateGrid() {
  return [
    { id: "baseline", label: "V2.2 production workload", params: { mode: "baseline" } },
    { id: "B50", label: "pitcher-anchored blend 50% season / 50% last-5", params: { mode: "pitcher-anchored", seasonWeight: 0.5 } },
    { id: "B60", label: "pitcher-anchored blend 60% season / 40% last-5", params: { mode: "pitcher-anchored", seasonWeight: 0.6 } },
    { id: "B70", label: "pitcher-anchored blend 70% season / 30% last-5", params: { mode: "pitcher-anchored", seasonWeight: 0.7 } },
    { id: "B60_ppb", label: "B60 + expected BF via pitcher's own pitches-per-BF", params: { mode: "pitcher-anchored", seasonWeight: 0.6, usePitcherPitchesPerBF: true } },
  ];
}

function loadRows(datasetPath) {
  return readFileSync(datasetPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function scoreable(rows) {
  return rows.filter(
    (r) =>
      r.workloadDecomp &&
      r.workload4Inputs &&
      r._v2Input &&
      Number.isFinite(r.workloadDecomp.expectedBF) &&
      Number.isFinite(r.actual?.battersFaced) && r.actual.battersFaced > 0 &&
      Number.isFinite(r.actual?.inningsPitched) &&
      Number.isFinite(r.actual?.strikeouts) &&
      Number.isFinite(r.v2?.projectedStrikeouts),
  );
}

function corr(pairs) {
  return round(pearson(pairs), 4);
}

function calibSlope(entries) {
  if (entries.length < 50) return { slope: null, intercept: null };
  const fit = ols(entries.map((e) => e.actual), [entries.map((e) => e.projection)]);
  return fit ? { slope: round(fit.coefficients[0], 4), intercept: round(fit.intercept, 4) } : { slope: null, intercept: null };
}

/** error = actual - projection (positive => under-projection). */
function profile(entries) {
  const clean = entries.filter((e) => Number.isFinite(e.projection) && Number.isFinite(e.actual));
  const errs = clean.map((e) => e.actual - e.projection);
  const proj = clean.map((e) => e.projection);
  const act = clean.map((e) => e.actual);
  const c = calibSlope(clean);
  return {
    n: clean.length,
    mae: round(mean(errs.map(Math.abs)), 4),
    rmse: round(rmse(errs), 4),
    corr: corr(clean.map((e) => [e.projection, e.actual])),
    bias: round(mean(errs), 4),
    projMean: round(mean(proj), 3),
    projSD: round(stddev(proj), 4),
    actualSD: round(stddev(act), 4),
    sdRatio: round(stddev(proj) / stddev(act), 4),
    calibSlope: c.slope,
    calibIntercept: c.intercept,
  };
}

function subBias(entries, keyOf) {
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
      .map(([k, list]) => [k, {
        n: list.length,
        bias: round(mean(list.map((e) => e.actual - e.projection)), 4),
        mae: round(mean(list.map((e) => Math.abs(e.actual - e.projection))), 4),
      }]),
  );
}

function startLenBucket(ip) {
  if (!Number.isFinite(ip)) return null;
  if (ip < 5) return "1_short_lt5IP";
  if (ip < 6) return "2_mid_5to6IP";
  return "3_long_ge6IP";
}

export async function runExperiment(datasetPath) {
  const projectStrikeoutsV2 = await loadProjectStrikeoutsV2();
  const allRows = loadRows(datasetPath);
  const rows = scoreable(allRows);
  const grid = candidateGrid();

  function projectRow(row, params) {
    const wl = reprojectV4(row.workloadDecomp, row.workload4Inputs, params);
    const bf = wl.expectedBF;
    const ip = wl.expectedInnings;
    const pit = wl.expectedPitchLimit;
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
    return { bf, ip, pit, k };
  }

  const enriched = rows.map((row) => {
    const rec = {
      season: row.season,
      seasonPhase: row.seasonPhase ?? null,
      dqt: row.dataQualityTier ?? null,
      role: row.workloadDecomp.role,
      seasonStarts: row.workload4Inputs.seasonStarts ?? 0,
      firstStartOfSeason: Boolean(row.workload4Inputs.firstStartOfSeason),
      actualBF: row.actual.battersFaced,
      actualIP: row.actual.inningsPitched,
      actualPitches: Number.isFinite(row.actual.pitches) ? row.actual.pitches : null,
      actualK: row.actual.strikeouts,
      storedV2K: row.v2.projectedStrikeouts,
      storedV2BF: row.workloadDecomp.expectedBF,
    };
    for (const c of grid) rec[c.id] = projectRow(row, c.params);
    return rec;
  });

  // fidelity: baseline candidate must reproduce stored V2.2 K + BF
  const kDiffs = enriched.filter((e) => Number.isFinite(e.baseline.k) && Number.isFinite(e.storedV2K)).map((e) => Math.abs(e.baseline.k - e.storedV2K));
  const bfDiffs = enriched.map((e) => Math.abs(e.baseline.bf - e.storedV2BF));
  const repro = {
    kMaxAbsDiff: round(Math.max(...kDiffs), 5),
    kMeanAbsDiff: round(mean(kDiffs), 6),
    kRowsOver_0_02: kDiffs.filter((d) => d > 0.02).length,
    bfMaxAbsDiff: round(Math.max(...bfDiffs), 6),
  };

  const splits = {
    development: enriched.filter((e) => DEV_SEASONS.has(e.season)),
    holdout: enriched.filter((e) => e.season === HOLDOUT_SEASON),
    full: enriched,
  };

  const thinSet = (set) => set.filter((e) => e.seasonStarts < 5);
  const earlySet = (set) => set.filter((e) => e.seasonPhase === "early");

  function evalCandidate(id, set) {
    const wlBF = profile(set.map((e) => ({ actual: e.actualBF, projection: e[id].bf })));
    const wlIP = profile(set.map((e) => ({ actual: e.actualIP, projection: e[id].ip })));
    const wlPIT = profile(set.filter((e) => e.actualPitches != null).map((e) => ({ actual: e.actualPitches, projection: e[id].pit })));
    const dsK = profile(set.map((e) => ({ actual: e.actualK, projection: e[id].k })));
    return {
      workload: { bf: wlBF, ip: wlIP, pitches: wlPIT },
      downstream: {
        n: dsK.n, mae: dsK.mae, rmse: dsK.rmse, corr: dsK.corr, bias: dsK.bias,
        calibSlope: dsK.calibSlope, projSD: dsK.projSD,
        byStartLen: subBias(set.map((e) => ({ actual: e.actualK, projection: e[id].k, b: startLenBucket(e.actualIP) })), (e) => e.b),
        bySeasonPhase: subBias(set.map((e) => ({ actual: e.actualK, projection: e[id].k, b: e.seasonPhase })), (e) => e.b),
      },
      bfByStartLen: subBias(set.map((e) => ({ actual: e.actualBF, projection: e[id].bf, b: startLenBucket(e.actualIP) })), (e) => e.b),
      early: {
        bf: profile(earlySet(set).map((e) => ({ actual: e.actualBF, projection: e[id].bf }))),
        k: profile(earlySet(set).map((e) => ({ actual: e.actualK, projection: e[id].k }))),
      },
      thin: {
        n: thinSet(set).length,
        bf: profile(thinSet(set).map((e) => ({ actual: e.actualBF, projection: e[id].bf }))),
        k: profile(thinSet(set).map((e) => ({ actual: e.actualK, projection: e[id].k }))),
      },
    };
  }

  const candidates = grid.map((c) => ({
    id: c.id,
    label: c.label,
    changedParams: c.params,
    isBaseline: c.id === "baseline",
    development: evalCandidate(c.id, splits.development),
    holdout: evalCandidate(c.id, splits.holdout),
    full: evalCandidate(c.id, splits.full),
  }));

  const baseline = candidates.find((c) => c.isBaseline);
  const selection = select(candidates, baseline);

  return {
    schemaVersion: 1,
    kind: "mlb-k-workload-experiment-4",
    experiment: "experiment-4-contextual-starter-workload",
    generatedAt: new Date().toISOString(),
    datasetPath: path.relative(ROOT, datasetPath),
    baseModel: "V2.2 (pitcher-skill shrinkage alpha 0.55 + opponent multiplier 0.75 + matchup clamp +/-0.035, all frozen)",
    change: "projected workload only: pitch-limit / BF / IP = blend(season-to-date per-start, last-5 per-start); optional arm B60_ppb derives BF from pitch-limit / pitcher season pitches-per-BF; production projectStrikeoutsV2 re-run with the swapped workload",
    splitDefinition: { development: "2023 + 2024", holdout: "2025 (scored once)", full: "2023-2025 descriptive only" },
    counts: {
      datasetRows: allRows.length,
      scoreableRows: rows.length,
      development: splits.development.length,
      holdout: splits.holdout.length,
      byRole: countBy(rows, (r) => r.workloadDecomp.role),
      devThinLt5Starts: thinSet(splits.development).length,
      devEarly: earlySet(splits.development).length,
    },
    baselineReproduction: repro,
    candidates,
    selection,
  };
}

function countBy(rows, keyOf) {
  const m = {};
  for (const r of rows) { const k = keyOf(r) ?? "unknown"; m[k] = (m[k] ?? 0) + 1; }
  return m;
}

/**
 * Selection — DEVELOPMENT ONLY. "Prefer the simplest candidate that improves
 * workload fidelity without worsening downstream Projected K."
 *
 * Improves workload fidelity  = BF calibration slope closer to 1 by >= 0.02
 *                               OR BF SD-ratio closer to 1 by >= 0.03,
 *                               AND BF MAE not worse by > 0.02,
 *                               AND BF corr not down > 0.004.
 * Does not worsen downstream K = K MAE not worse by > 0.001,
 *                               K RMSE not worse by > 0.001,
 *                               K corr not down > 0.001,
 *                               |K bias| not up > 0.02.
 * Tie-break: candidate closest to a pure recent/season blend with the fewest
 * extra mechanisms (B50 < B60 < B70 < B60_ppb), then best dev K RMSE.
 */
function select(candidates, baseline) {
  const b = baseline.development;
  const bbf = b.workload.bf;
  const bk = b.downstream;
  const simplicity = { B50: 1, B60: 2, B70: 3, B60_ppb: 4 };

  const improvesWorkload = (c) => {
    const wl = c.development.workload.bf;
    const slopeGain = Math.abs(1 - (bbf.calibSlope ?? 0)) - Math.abs(1 - (wl.calibSlope ?? 0));
    const sdGain = Math.abs(1 - (bbf.sdRatio ?? 0)) - Math.abs(1 - (wl.sdRatio ?? 0));
    return (
      (slopeGain >= 0.02 || sdGain >= 0.03) &&
      (wl.mae ?? 99) - (bbf.mae ?? 0) <= 0.02 &&
      (wl.corr ?? 0) >= (bbf.corr ?? 0) - 0.004
    );
  };
  const keepsDownstream = (c) => {
    const k = c.development.downstream;
    return (
      (k.mae ?? 99) <= (bk.mae ?? 0) + 0.001 &&
      (k.rmse ?? 99) <= (bk.rmse ?? 0) + 0.001 &&
      (k.corr ?? 0) >= (bk.corr ?? 0) - 0.001 &&
      Math.abs(k.bias ?? 0) <= Math.abs(bk.bias ?? 0) + 0.02
    );
  };

  const survivors = candidates.filter((c) => !c.isBaseline && improvesWorkload(c) && keepsDownstream(c));
  const pick = survivors
    .slice()
    .sort((x, y) => (simplicity[x.id] ?? 9) - (simplicity[y.id] ?? 9) || (x.development.downstream.rmse ?? 9) - (y.development.downstream.rmse ?? 9))[0];

  const deltaVs = (cand, split) => {
    const cb = baseline[split];
    const cc = cand[split];
    const d = (a, x) => round((a ?? 0) - (x ?? 0), 4);
    return {
      bf: { mae: d(cc.workload.bf.mae, cb.workload.bf.mae), rmse: d(cc.workload.bf.rmse, cb.workload.bf.rmse), corr: d(cc.workload.bf.corr, cb.workload.bf.corr), bias: d(cc.workload.bf.bias, cb.workload.bf.bias), sdRatio: d(cc.workload.bf.sdRatio, cb.workload.bf.sdRatio), calibSlope: d(cc.workload.bf.calibSlope, cb.workload.bf.calibSlope) },
      ip: { mae: d(cc.workload.ip.mae, cb.workload.ip.mae), corr: d(cc.workload.ip.corr, cb.workload.ip.corr), bias: d(cc.workload.ip.bias, cb.workload.ip.bias) },
      pitches: { mae: d(cc.workload.pitches.mae, cb.workload.pitches.mae), corr: d(cc.workload.pitches.corr, cb.workload.pitches.corr), bias: d(cc.workload.pitches.bias, cb.workload.pitches.bias) },
      k: { mae: d(cc.downstream.mae, cb.downstream.mae), rmse: d(cc.downstream.rmse, cb.downstream.rmse), corr: d(cc.downstream.corr, cb.downstream.corr), bias: d(cc.downstream.bias, cb.downstream.bias), calibSlope: d(cc.downstream.calibSlope, cb.downstream.calibSlope) },
    };
  };

  return {
    selected: pick ? pick.id : null,
    survivors: survivors.map((c) => c.id),
    verdict: pick ? `adopt ${pick.id} (development bar cleared; simplest qualifying candidate)` : "no candidate improved workload fidelity without worsening downstream K — reject",
    rule: "dev only: (BF calib slope closer to 1 by >=0.02 OR BF SD-ratio closer to 1 by >=0.03) AND BF MAE not worse >0.02 AND BF corr not down >0.004; downstream K MAE/RMSE not worse >0.001, K corr not down >0.001, |K bias| not up >0.02. Tie-break: simplest (B50<B60<B70<B60_ppb), then dev K RMSE.",
    developmentDeltaVsBaseline: pick ? deltaVs(pick, "development") : null,
    holdoutDeltaVsBaseline: pick ? deltaVs(pick, "holdout") : null,
    fullDeltaVsBaseline: pick ? deltaVs(pick, "full") : null,
    // always report every candidate's dev deltas so the season/recent-blend and
    // pitches-per-BF questions can be answered even when nothing is selected
    allDevDeltas: Object.fromEntries(candidates.filter((c) => !c.isBaseline).map((c) => [c.id, deltaVs(c, "development")])),
  };
}

function f(v) { return v == null ? "—" : String(v); }

export function renderReport(result) {
  const L = [];
  const base = result.candidates.find((c) => c.isBaseline);
  L.push("# MLB Projected-K calibration — Experiment 4: contextual starter workload", "");
  L.push(`Generated ${result.generatedAt}. Analysis only; no production module changed.`, "");
  L.push(`Base model: **${result.baseModel}**`, "");
  L.push(`**Change under test:** ${result.change}`, "");
  L.push(`Signed error = actual − projection (positive ⇒ under-projection). Baseline row \`*\`.`, "");
  L.push("", "## Setup", "");
  L.push(`- Development ${result.splitDefinition.development} — n=${result.counts.development} (thin <5 season starts: ${result.counts.devThinLt5Starts}; early-season: ${result.counts.devEarly})`);
  L.push(`- Holdout ${result.splitDefinition.holdout} — n=${result.counts.holdout}`);
  L.push(`- Scoreable ${result.counts.scoreableRows} of ${result.counts.datasetRows}; roles ${JSON.stringify(result.counts.byRole)}`);
  L.push(`- Baseline reproduction: downstream K max |Δ| ${result.baselineReproduction.kMaxAbsDiff}, mean |Δ| ${result.baselineReproduction.kMeanAbsDiff}, rows>0.02 ${result.baselineReproduction.kRowsOver_0_02}; workload BF max |Δ| ${result.baselineReproduction.bfMaxAbsDiff}`);

  const wlHeader = "| candidate | n | BF MAE | BF RMSE | BF corr | BF bias | BF projSD | BF actSD | BF sdRatio | BF calibSlope | IP MAE | IP corr | IP bias | Pit MAE | Pit corr | Pit bias |";
  const kHeader = "| candidate | n | K MAE | K RMSE | K corr | K bias | K calibSlope | K projSD | short<5 K bias | long≥6 K bias |";
  const wlRow = (c, s) => {
    const w = c[s].workload;
    return `| ${c.id}${c.isBaseline ? " *" : ""} | ${f(w.bf.n)} | ${f(w.bf.mae)} | ${f(w.bf.rmse)} | ${f(w.bf.corr)} | ${f(w.bf.bias)} | ${f(w.bf.projSD)} | ${f(w.bf.actualSD)} | ${f(w.bf.sdRatio)} | ${f(w.bf.calibSlope)} | ${f(w.ip.mae)} | ${f(w.ip.corr)} | ${f(w.ip.bias)} | ${f(w.pitches.mae)} | ${f(w.pitches.corr)} | ${f(w.pitches.bias)} |`;
  };
  const kRow = (c, s) => {
    const k = c[s].downstream;
    const sl = k.byStartLen ?? {};
    return `| ${c.id}${c.isBaseline ? " *" : ""} | ${f(k.n)} | ${f(k.mae)} | ${f(k.rmse)} | ${f(k.corr)} | ${f(k.bias)} | ${f(k.calibSlope)} | ${f(k.projSD)} | ${f(sl["1_short_lt5IP"]?.bias)} | ${f(sl["3_long_ge6IP"]?.bias)} |`;
  };

  for (const [split, title] of [["development", "A. Development (2023–2024) — selection"], ["holdout", "B. Holdout (2025) — untouched"], ["full", "C. Full 2023–2025 — descriptive only"]]) {
    L.push("", `## ${title}`, "", "### Workload", "", wlHeader, `| ${"--- |".repeat(16)}`);
    for (const c of result.candidates) L.push(wlRow(c, split));
    L.push("", "### Downstream Projected K (production V2.2 re-run)", "", kHeader, `| ${"--- |".repeat(10)}`);
    for (const c of result.candidates) L.push(kRow(c, split));
  }

  L.push("", "## Early-season & thin-sample (development)", "");
  L.push("| candidate | early BF MAE | early BF bias | early K MAE | early K bias | thin n | thin BF MAE | thin BF bias | thin K MAE | thin K bias |", `| ${"--- |".repeat(10)}`);
  for (const c of result.candidates) {
    const e = c.development.early; const t = c.development.thin;
    L.push(`| ${c.id}${c.isBaseline ? " *" : ""} | ${f(e.bf.mae)} | ${f(e.bf.bias)} | ${f(e.k.mae)} | ${f(e.k.bias)} | ${f(t.n)} | ${f(t.bf.mae)} | ${f(t.bf.bias)} | ${f(t.k.mae)} | ${f(t.k.bias)} |`);
  }

  const s = result.selection;
  L.push("", "## Selection (development only)", "");
  L.push(`- Rule: ${s.rule}`);
  L.push(`- Survivors: ${s.survivors.join(", ") || "none"}`);
  L.push(`- **Verdict: ${s.verdict}**`);
  L.push("", "Per-candidate dev Δ vs baseline (BF sdRatio / BF calibSlope / BF MAE / BF corr | K MAE / K RMSE / K corr / K bias):", "");
  for (const [id, d] of Object.entries(s.allDevDeltas)) {
    L.push(`- ${id}: BF ${f(d.bf.sdRatio)} / ${f(d.bf.calibSlope)} / ${f(d.bf.mae)} / ${f(d.bf.corr)} | K ${f(d.k.mae)} / ${f(d.k.rmse)} / ${f(d.k.corr)} / ${f(d.k.bias)}`);
  }
  if (s.selected) {
    L.push("", `Selected **${s.selected}** — holdout Δ vs baseline: BF sdRatio ${f(s.holdoutDeltaVsBaseline.bf.sdRatio)}, BF calibSlope ${f(s.holdoutDeltaVsBaseline.bf.calibSlope)}, BF MAE ${f(s.holdoutDeltaVsBaseline.bf.mae)}; K MAE ${f(s.holdoutDeltaVsBaseline.k.mae)}, K RMSE ${f(s.holdoutDeltaVsBaseline.k.rmse)}, K corr ${f(s.holdoutDeltaVsBaseline.k.corr)}.`);
  }

  L.push("", "## Notes", "");
  L.push("- Selection used development (2023–2024) only. 2025 scored once.");
  L.push("- `reprojectV4` at baseline params reproduces production `mlb-k-workload-v2` exactly (fidelity test + full-dataset check).");
  L.push("- Downstream K re-runs the real `projectStrikeoutsV2` with ONLY projected workload swapped; shrinkage, opponent term and clamp untouched.");
  L.push("- No opponent workload / offensive-quality / wRC+ / OPS terms (Experiment 4 diagnosis found no usable signal).");
  return `${L.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const dir = argv.find((e) => e.startsWith("--dir="))?.slice(6) ?? path.join("data", "mlb", "k-history", "backtest", "2023-2025-v2_2-workload");
  const datasetPath = path.isAbsolute(dir) ? path.join(dir, "dataset.jsonl") : path.join(ROOT, dir, "dataset.jsonl");
  const result = await runExperiment(datasetPath);
  const outDir = path.join(path.dirname(datasetPath), "workload-experiment-4");
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
    console.error(`[analyze-mlb-k-workload-experiment-4] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
