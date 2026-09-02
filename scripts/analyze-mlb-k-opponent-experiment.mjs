/**
 * analyze-mlb-k-opponent-experiment.mjs  (calibration experiment 2)
 *
 * ANALYSIS ONLY. Does not import or modify any production module. Reads a
 * V2.1-built backtest dataset.jsonl and, for a compact (multiplier, clamp) grid,
 * recomputes the Projected-K output with the opponent-environment matchup term
 * rebuilt. The V2.1 league-shrunk pitcher skill term is reused verbatim.
 *
 * Development : 2023 + 2024   (tuning / selection)
 * Holdout     : 2025          (untouched; scored once for the selected candidate)
 * Full        : 2023-2025     (descriptive only)
 *
 * Usage:
 *   node scripts/analyze-mlb-k-opponent-experiment.mjs \
 *     --dir=data/mlb/k-history/backtest/2023-2025-v2_1-alpha055
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { writeJsonAtomic } from "./lib/mlb-k-backtest-cache.mjs";
import {
  bucketByEdges,
  errorProfile,
  mean,
  median,
  ols,
  pearson,
  round,
  stddev,
  tercileEdges,
} from "./lib/mlb-k-backtest-stats.mjs";
import {
  BASELINE_CLAMP_ABS,
  BASELINE_MULTIPLIER,
  defaultGrid,
  reprojectRow,
} from "./lib/mlb-k-opponent-experiment.mjs";

const ROOT = process.cwd();
const DEV_SEASONS = new Set([2023, 2024]);
const HOLDOUT_SEASON = 2025;
const MIN_SEGMENT_N = 30;
const REPRO_TOLERANCE_K = 0.05;

function loadRows(datasetPath) {
  return readFileSync(datasetPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function scoreableRows(rows) {
  return rows.filter(
    (row) =>
      Number.isFinite(row.v2?.projectedStrikeouts) &&
      Number.isFinite(row.actual?.strikeouts) &&
      Number.isFinite(row.v2?.pitcherSkillRateShrunk),
  );
}

function calibrationFit(entries) {
  if (entries.length < 50) return { slope: null, intercept: null };
  const fit = ols(entries.map((e) => e.actual), [entries.map((e) => e.projection)]);
  return fit ? { slope: round(fit.coefficients[0]), intercept: round(fit.intercept) } : { slope: null, intercept: null };
}

function biasBy(entries, keyOf) {
  const groups = new Map();
  for (const e of entries) {
    const key = keyOf(e);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .filter(([, list]) => list.length >= MIN_SEGMENT_N)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([key, list]) => [
        key,
        {
          n: list.length,
          bias: round(mean(list.map((e) => e.actual - e.projection)), 4),
          mae: round(mean(list.map((e) => Math.abs(e.actual - e.projection))), 4),
          rmse: round(Math.sqrt(mean(list.map((e) => (e.actual - e.projection) ** 2))), 4),
          corr: round(pearson(list.map((e) => [e.projection, e.actual])), 4),
        },
      ]),
  );
}

function quantile(values, q) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function evaluate(entries) {
  const profile = errorProfile(entries.map((e) => ({ actual: e.actual, projection: e.projection })));
  const cal = calibrationFit(entries);
  const projections = entries.map((e) => e.projection);

  const withMatchup = entries.filter((e) => e.matchupAdjustment != null);
  const adj = withMatchup.map((e) => e.matchupAdjustment);
  const clampHits = withMatchup.filter((e) => e.clampHit).length;

  const oppLowMid = entries.filter((e) => e.opponentKBucket === "low");
  const oppMid = entries.filter((e) => e.opponentKBucket === "mid");
  const oppHigh = entries.filter((e) => e.opponentKBucket === "high");
  const bucketBias = (list) =>
    list.length
      ? {
          n: list.length,
          bias: round(mean(list.map((e) => e.actual - e.projection)), 4),
          meanProjection: round(mean(list.map((e) => e.projection)), 3),
          meanActual: round(mean(list.map((e) => e.actual)), 3),
        }
      : { n: 0 };

  const projEdges = tercileEdges(entries.map((e) => e.baseProjection));
  const projBucket = (name, idx) => {
    const list = entries.filter((e) => bucketByEdges(e.baseProjection, projEdges) === `q${idx}`);
    return list.length ? { n: list.length, bias: round(mean(list.map((e) => e.actual - e.projection)), 4) } : { n: 0 };
  };

  return {
    n: profile.sampleSize,
    mae: profile.mae,
    rmse: profile.rmse,
    correlation: profile.correlation,
    bias: profile.bias,
    medianAbsError: profile.medianAbsError,
    meanProjection: profile.meanProjection,
    calibrationSlope: cal.slope,
    calibrationIntercept: cal.intercept,
    projectionStdDev: round(stddev(projections), 4),
    projectionRange: [round(Math.min(...projections), 2), round(Math.max(...projections), 2)],
    matchup: {
      rowsWithMatchup: withMatchup.length,
      clampHitRatePct: withMatchup.length ? round((clampHits / withMatchup.length) * 100, 2) : null,
      meanAbsAdjustment: round(mean(adj.map(Math.abs)), 5),
      adjustmentStdDev: round(stddev(adj), 5),
      adjustmentP05: round(quantile(adj, 0.05), 5),
      adjustmentP95: round(quantile(adj, 0.95), 5),
    },
    opponentKBucketBias: {
      low: bucketBias(oppLowMid),
      mid: bucketBias(oppMid),
      high: bucketBias(oppHigh),
    },
    projectionBucketBias: { low: projBucket("low", 1), mid: projBucket("mid", 2), high: projBucket("high", 3) },
    bySeasonPhase: biasBy(entries, (e) => e.seasonPhase),
    byDataQualityTier: biasBy(entries, (e) => e.dataQualityTier),
  };
}

export function runExperiment(datasetPath, grid = defaultGrid()) {
  const allRows = loadRows(datasetPath);
  const rows = scoreableRows(allRows);

  // opponent-K terciles fixed from the DEVELOPMENT set only.
  const devOppK = rows
    .filter((r) => DEV_SEASONS.has(r.season) && Number.isFinite(r.inputs?.opponent?.seasonKRate))
    .map((r) => r.inputs.opponent.seasonKRate);
  const oppKEdges = tercileEdges(devOppK);
  const oppKBucketOf = (r) => {
    const v = r.inputs?.opponent?.seasonKRate;
    if (!Number.isFinite(v)) return null;
    return bucketByEdges(v, oppKEdges) === "q1" ? "low" : bucketByEdges(v, oppKEdges) === "q2" ? "mid" : "high";
  };

  const enriched = rows.map((row) => ({
    row,
    season: row.season,
    actual: row.actual.strikeouts,
    baseProjection: row.v2.projectedStrikeouts,
    seasonPhase: row.seasonPhase ?? null,
    dataQualityTier: row.dataQualityTier ?? null,
    opponentKBucket: oppKBucketOf(row),
  }));

  const splits = {
    development: enriched.filter((e) => DEV_SEASONS.has(e.season)),
    holdout: enriched.filter((e) => e.season === HOLDOUT_SEASON),
    full: enriched,
  };

  // Fidelity: baseline params vs the stored V2.1 projection.
  const reproDiffs = splits.full.map((e) =>
    Math.abs(reprojectRow(e.row, BASELINE_MULTIPLIER, BASELINE_CLAMP_ABS).projectedStrikeouts - e.baseProjection),
  );
  const repro = {
    maxAbsDiffK: round(Math.max(...reproDiffs), 5),
    meanAbsDiffK: round(mean(reproDiffs), 6),
    rowsOverTolerance: reproDiffs.filter((d) => d > REPRO_TOLERANCE_K).length,
    toleranceK: REPRO_TOLERANCE_K,
  };

  const candidates = grid.map(({ multiplier, clampAbs, arm }) => {
    const withProjection = (list) =>
      list
        .map((e) => {
          const p = reprojectRow(e.row, multiplier, clampAbs);
          return { ...e, projection: p.projectedStrikeouts, matchupAdjustment: p.matchupAdjustment, clampHit: p.clampHit };
        })
        .filter((e) => Number.isFinite(e.projection));
    return {
      multiplier,
      clampAbs,
      arm,
      isBaseline: multiplier === BASELINE_MULTIPLIER && clampAbs === BASELINE_CLAMP_ABS,
      development: evaluate(withProjection(splits.development)),
      holdout: evaluate(withProjection(splits.holdout)),
      full: evaluate(withProjection(splits.full)),
    };
  });

  const baseline = candidates.find((c) => c.isBaseline);
  const selection = selectCandidate(candidates, baseline);

  return {
    schemaVersion: 1,
    kind: "mlb-k-opponent-experiment",
    experiment: "experiment-2-opponent-environment-calibration",
    generatedAt: new Date().toISOString(),
    datasetPath: path.relative(ROOT, datasetPath),
    baseModel: "V2.1 (pitcher-skill shrinkage alpha 0.55 already applied)",
    change:
      "matchupAdjustment = clamp((opponentEnvironmentRate - leagueKRate) * mult, -clampAbs, +clampAbs); pitcher skill (shrunk) unchanged",
    splitDefinition: {
      development: "season 2023 + 2024",
      holdout: "season 2025 (scored once)",
      full: "2023-2025 descriptive only",
    },
    counts: {
      datasetRows: allRows.length,
      scoreableRows: rows.length,
      development: splits.development.length,
      holdout: splits.holdout.length,
      rowsWithOpponentEnv: rows.filter((r) => Number.isFinite(r.v2.opponentEnvironmentRate)).length,
    },
    opponentKTercileEdges_devSet: oppKEdges.map((v) => round(v, 4)),
    baselineReproduction: repro,
    grid,
    candidates,
    selection,
  };
}

/**
 * Selection uses DEVELOPMENT only. Prefer the simplest candidate (smallest
 * multiplier, then smallest clamp) that:
 *  - improves dev MAE by >= 0.004 and dev RMSE by >= 0.004 vs V2.1 baseline
 *  - flattens BOTH outer opponent-K bucket biases to |bias| <= 0.10
 *    (baseline is low -0.26 / high +0.11)
 *  - does not hurt dev correlation (must be >= baseline - 0.002; in practice it rises)
 *  - keeps dev calibration slope within [0.92, 1.03] (V2.1 baseline ~0.96)
 */
function selectCandidate(candidates, baseline) {
  const b = baseline.development;
  const worstOppBias = (m) =>
    Math.max(Math.abs(m.opponentKBucketBias.low.bias ?? 0), Math.abs(m.opponentKBucketBias.high.bias ?? 0));
  const survivors = candidates.filter((c) => {
    if (c.isBaseline) return false;
    const d = c.development;
    return (
      (b.mae ?? 0) - (d.mae ?? 0) >= 0.004 &&
      (b.rmse ?? 0) - (d.rmse ?? 0) >= 0.004 &&
      worstOppBias(d) <= 0.1 &&
      (d.correlation ?? 0) >= (b.correlation ?? 0) - 0.002 &&
      (d.calibrationSlope ?? 0) >= 0.92 &&
      (d.calibrationSlope ?? 0) <= 1.03
    );
  });
  const pool = survivors.length ? survivors : [];
  const pick = pool
    .slice()
    .sort((a, b2) => a.multiplier - b2.multiplier || a.clampAbs - b2.clampAbs || (a.development.rmse ?? 0) - (b2.development.rmse ?? 0))[0];

  const delta = (cand, split) => ({
    mae: round((cand[split].mae ?? 0) - (baseline[split].mae ?? 0), 4),
    rmse: round((cand[split].rmse ?? 0) - (baseline[split].rmse ?? 0), 4),
    correlation: round((cand[split].correlation ?? 0) - (baseline[split].correlation ?? 0), 4),
    calibrationSlope: round((cand[split].calibrationSlope ?? 0) - (baseline[split].calibrationSlope ?? 0), 4),
    bias: round((cand[split].bias ?? 0) - (baseline[split].bias ?? 0), 4),
  });

  return {
    selected: pick ? { multiplier: pick.multiplier, clampAbs: pick.clampAbs } : null,
    verdict: pick ? "candidate meets the development bar" : "no candidate cleared the development bar; keep V2.1 baseline",
    rule:
      "dev-only: simplest (min multiplier, then clamp) with dev MAE and RMSE each improved >= 0.004 vs V2.1, both outer opponent-K bucket |bias| <= 0.10 (baseline -0.26 / +0.11), dev correlation not down > 0.002, dev calibration slope in [0.92, 1.03]",
    survivorCount: survivors.length,
    survivors: survivors.map((c) => ({ multiplier: c.multiplier, clampAbs: c.clampAbs })),
    developmentDeltaVsBaseline: pick ? delta(pick, "development") : null,
    holdoutDeltaVsBaseline: pick ? delta(pick, "holdout") : null,
  };
}

function fmt(v) {
  return v == null ? "—" : String(v);
}

function candidateRow(c, split) {
  const m = c[split];
  const ob = m.opponentKBucketBias;
  const pb = m.projectionBucketBias;
  return `| ${c.multiplier.toFixed(2)} / ${c.clampAbs.toFixed(3)}${c.isBaseline ? " *" : ""} | ${fmt(m.n)} | ${fmt(m.mae)} | ${fmt(m.rmse)} | ${fmt(m.correlation)} | ${fmt(m.bias)} | ${fmt(m.medianAbsError)} | ${fmt(m.calibrationSlope)} | ${fmt(m.calibrationIntercept)} | ${fmt(m.projectionStdDev)} | ${fmt(ob.low.bias)} | ${fmt(ob.mid.bias)} | ${fmt(ob.high.bias)} | ${fmt(pb.low.bias)} | ${fmt(pb.high.bias)} | ${fmt(m.matchup.clampHitRatePct)} | ${fmt(m.matchup.meanAbsAdjustment)} |`;
}

const TABLE_HEADER =
  "| mult / clamp | n | MAE | RMSE | corr | bias | medAE | calib slope | calib int | proj SD | oppK low bias | oppK mid bias | oppK high bias | proj low bias | proj high bias | clamp hit % | mean |adj| |";
const TABLE_SEP = `| ${"--- |".repeat(17)}`;

export function renderReport(result) {
  const L = [];
  L.push(`# MLB Projected-K calibration — Experiment 2: opponent-environment influence`, "");
  L.push(`Generated ${result.generatedAt}. Analysis only; no production module changed.`, "");
  L.push(`Base model: **${result.baseModel}**.`, "");
  L.push(`**Change under test:** \`${result.change}\``, "");
  L.push(`Signed error = actual − projection (positive ⇒ under-projection). Baseline row marked \`*\`.`, "");
  L.push("", "## Setup", "");
  L.push(`- Development ${result.splitDefinition.development} — n=${result.counts.development}`);
  L.push(`- Holdout ${result.splitDefinition.holdout} — n=${result.counts.holdout}`);
  L.push(`- Scoreable rows ${result.counts.scoreableRows}; with opponent environment ${result.counts.rowsWithOpponentEnv}`);
  L.push(`- Opponent-K terciles (dev-set season K rate edges): ${result.opponentKTercileEdges_devSet.join(", ")}`);
  L.push(
    `- Baseline reproduction (0.45 / 0.035 vs stored V2.1): max |Δ| ${result.baselineReproduction.maxAbsDiffK} K, mean |Δ| ${result.baselineReproduction.meanAbsDiffK} K, rows over tolerance ${result.baselineReproduction.rowsOverTolerance}`,
  );

  for (const [split, title] of [
    ["development", "A. Development (2023–2024) — tuning"],
    ["holdout", "B. Holdout (2025) — untouched"],
    ["full", "C. Full 2023–2025 — descriptive only"],
  ]) {
    L.push("", `## ${title}`, "", TABLE_HEADER, TABLE_SEP);
    for (const c of result.candidates) L.push(candidateRow(c, split));
  }

  const s = result.selection;
  L.push("", "## Selection (development data only)", "");
  L.push(`- Rule: ${s.rule}`);
  L.push(`- Survivors: ${s.survivors.map((x) => `${x.multiplier}/${x.clampAbs}`).join(", ") || "none"}`);
  L.push(`- **Verdict: ${s.verdict}**`);
  if (s.selected) {
    L.push(`- **Selected: multiplier ${s.selected.multiplier}, clamp ±${s.selected.clampAbs}**`);
    L.push(
      `- Dev Δ vs V2.1: MAE ${fmt(s.developmentDeltaVsBaseline.mae)}, RMSE ${fmt(s.developmentDeltaVsBaseline.rmse)}, corr ${fmt(s.developmentDeltaVsBaseline.correlation)}, calib slope ${fmt(s.developmentDeltaVsBaseline.calibrationSlope)}, bias ${fmt(s.developmentDeltaVsBaseline.bias)}`,
    );
    L.push(
      `- Holdout Δ vs V2.1: MAE ${fmt(s.holdoutDeltaVsBaseline.mae)}, RMSE ${fmt(s.holdoutDeltaVsBaseline.rmse)}, corr ${fmt(s.holdoutDeltaVsBaseline.correlation)}, calib slope ${fmt(s.holdoutDeltaVsBaseline.calibrationSlope)}, bias ${fmt(s.holdoutDeltaVsBaseline.bias)}`,
    );
  }

  for (const label of ["development", "holdout"]) {
    const base = result.candidates.find((c) => c.isBaseline)[label];
    const pick = s.selected
      ? result.candidates.find((c) => c.multiplier === s.selected.multiplier && c.clampAbs === s.selected.clampAbs)[label]
      : null;
    L.push("", `### ${label} — detail`, "");
    L.push("| candidate | opp-K low bias | opp-K mid bias | opp-K high bias | clamp hit % | mean |adj| | adj SD | proj SD | corr |", `| ${"--- |".repeat(9)}`);
    const line = (name, m) =>
      `| ${name} | ${fmt(m.opponentKBucketBias.low.bias)} | ${fmt(m.opponentKBucketBias.mid.bias)} | ${fmt(m.opponentKBucketBias.high.bias)} | ${fmt(m.matchup.clampHitRatePct)} | ${fmt(m.matchup.meanAbsAdjustment)} | ${fmt(m.matchup.adjustmentStdDev)} | ${fmt(m.projectionStdDev)} | ${fmt(m.correlation)} |`;
    L.push(line("V2.1 baseline (0.45/0.035)", base));
    if (pick) L.push(line(`selected (${s.selected.multiplier}/${s.selected.clampAbs})`, pick));
    L.push("", "By season phase (bias / MAE):", "", "| phase | baseline | selected |", "| --- | --- | --- |");
    for (const phase of Object.keys(base.bySeasonPhase)) {
      const bp = base.bySeasonPhase[phase];
      const pp = pick?.bySeasonPhase[phase];
      L.push(`| ${phase} | ${fmt(bp.bias)} / ${fmt(bp.mae)} | ${pp ? `${fmt(pp.bias)} / ${fmt(pp.mae)}` : "—"} |`);
    }
    L.push("", "By data-quality tier (bias / MAE):", "", "| tier | baseline | selected |", "| --- | --- | --- |");
    for (const tier of Object.keys(base.byDataQualityTier)) {
      const bt = base.byDataQualityTier[tier];
      const pt = pick?.byDataQualityTier[tier];
      L.push(`| ${tier} | ${fmt(bt.bias)} / ${fmt(bt.mae)} | ${pt ? `${fmt(pt.bias)} / ${fmt(pt.mae)}` : "—"} |`);
    }
  }

  L.push("", "## Notes", "");
  L.push("- Selection used development (2023–2024) only. The 2025 holdout column was computed once, never fed back.");
  L.push("- The V2.1 league-shrunk pitcher skill term is reused verbatim from the persisted decomposition.");
  L.push("- `clamp hit %` and `mean |adj|` are over rows that have an opponent environment (matchupAdjustment not null).");
  return `${L.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const dir =
    argv.find((e) => e.startsWith("--dir="))?.slice(6) ??
    path.join("data", "mlb", "k-history", "backtest", "2023-2025-v2_1-alpha055");
  const datasetPath = path.isAbsolute(dir) ? path.join(dir, "dataset.jsonl") : path.join(ROOT, dir, "dataset.jsonl");
  const result = runExperiment(datasetPath);
  const outDir = path.join(path.dirname(datasetPath), "opponent-experiment");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(outDir, { recursive: true });
  writeJsonAtomic(path.join(outDir, "experiment.json"), result);
  writeFileSync(path.join(outDir, "report.md"), renderReport(result), "utf8");
  console.log(renderReport(result));
  console.log(`\nWrote ${path.relative(ROOT, outDir)}/experiment.json + report.md`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[analyze-mlb-k-opponent-experiment] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
