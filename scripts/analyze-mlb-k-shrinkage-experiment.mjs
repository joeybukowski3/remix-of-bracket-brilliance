/**
 * analyze-mlb-k-shrinkage-experiment.mjs  (calibration experiment 1)
 *
 * ANALYSIS ONLY. Does not import or modify any production module. Reads the
 * frozen backtest dataset.jsonl and, for a grid of shrinkage strengths,
 * recomputes the V2 Projected-K output with the single controlled change:
 *
 *   pitcherSkillAdjusted = leagueKRate + alpha * (pitcherSkillRate - leagueKRate)
 *
 * Development set : 2023 + 2024   (tuning / selection)
 * Holdout set     : 2025          (untouched; scored once for the selected alpha)
 * Full set        : 2023-2025     (descriptive only)
 *
 * Usage:
 *   node scripts/analyze-mlb-k-shrinkage-experiment.mjs \
 *     --dir=data/mlb/k-history/backtest/2023-2025
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
import { DEFAULT_ALPHA_GRID, shrinkRow } from "./lib/mlb-k-shrinkage-experiment.mjs";

const ROOT = process.cwd();
const DEV_SEASONS = new Set([2023, 2024]);
const HOLDOUT_SEASON = 2025;
const MIN_SEGMENT_N = 30;
const REPRO_TOLERANCE_K = 0.05; // max |alpha=1 recompute - stored V2| we will accept

function loadRows(datasetPath) {
  return readFileSync(datasetPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

/** Rows scoreable for the V2 view: finite stored V2 projection AND finite actual. */
function scoreableV2Rows(rows) {
  return rows.filter(
    (row) => Number.isFinite(row.v2?.projectedStrikeouts) && Number.isFinite(row.actual?.strikeouts),
  );
}

function calibrationFit(entries) {
  if (entries.length < 50) return { slope: null, intercept: null };
  const fit = ols(entries.map((e) => e.actual), [entries.map((e) => e.projection)]);
  return fit ? { slope: round(fit.coefficients[0]), intercept: round(fit.intercept) } : { slope: null, intercept: null };
}

/** Bucket bias using FIXED baseline-projection terciles so buckets are comparable across alphas. */
function bucketBias(entries) {
  const edges = tercileEdges(entries.map((e) => e.baseProjection));
  const groups = { low: [], mid: [], high: [] };
  const nameByIndex = ["low", "mid", "high"];
  for (const e of entries) {
    const idx = Number(bucketByEdges(e.baseProjection, edges).slice(1)) - 1;
    groups[nameByIndex[idx] ?? "mid"].push(e);
  }
  return Object.fromEntries(
    Object.entries(groups).map(([name, list]) => [
      name,
      {
        n: list.length,
        meanBaseProjection: round(mean(list.map((e) => e.baseProjection)), 3),
        meanProjection: round(mean(list.map((e) => e.projection)), 3),
        meanActual: round(mean(list.map((e) => e.actual)), 3),
        bias: round(mean(list.map((e) => e.actual - e.projection)), 4),
      },
    ]),
  );
}

function segmentBias(entries, keyOf) {
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

/** Full metric block for one alpha on one split. */
function evaluate(entries, pitcherTypeEdges) {
  const profile = errorProfile(entries.map((e) => ({ actual: e.actual, projection: e.projection })));
  const projections = entries.map((e) => e.projection);
  const cal = calibrationFit(entries);
  const highK = entries.filter((e) => e.pitcherKRate != null && e.pitcherKRate >= pitcherTypeEdges[1]);
  const lowK = entries.filter((e) => e.pitcherKRate != null && e.pitcherKRate < pitcherTypeEdges[0]);
  const sub = (list) => ({
    n: list.length,
    bias: round(mean(list.map((e) => e.actual - e.projection)), 4),
    mae: round(mean(list.map((e) => Math.abs(e.actual - e.projection))), 4),
    rmse: round(Math.sqrt(mean(list.map((e) => (e.actual - e.projection) ** 2))), 4),
    corr: round(pearson(list.map((e) => [e.projection, e.actual])), 4),
    meanProjection: round(mean(list.map((e) => e.projection)), 3),
    meanActual: round(mean(list.map((e) => e.actual)), 3),
  });

  return {
    n: profile.sampleSize,
    mae: profile.mae,
    rmse: profile.rmse,
    correlation: profile.correlation,
    bias: profile.bias,
    medianAbsError: profile.medianAbsError,
    meanProjection: profile.meanProjection,
    meanActual: profile.meanActual,
    calibrationSlope: cal.slope,
    calibrationIntercept: cal.intercept,
    projectionStdDev: round(stddev(projections), 4),
    projectionRange: [round(Math.min(...projections), 2), round(Math.max(...projections), 2)],
    projectionP05: round(quantile(projections, 0.05), 3),
    projectionP95: round(quantile(projections, 0.95), 3),
    bucketBias: bucketBias(entries),
    discrimination: { highKPitchers: sub(highK), lowKPitchers: sub(lowK) },
    bySeasonPhase: segmentBias(entries, (e) => e.seasonPhase),
    byDataQualityTier: segmentBias(entries, (e) => e.dataQualityTier),
  };
}

function quantile(values, q) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function runExperiment(datasetPath, alphaGrid = DEFAULT_ALPHA_GRID) {
  const allRows = loadRows(datasetPath);
  const rows = scoreableV2Rows(allRows);

  // Attach the fields every evaluation needs, once.
  const enriched = rows.map((row) => ({
    row,
    season: row.season,
    actual: row.actual.strikeouts,
    baseProjection: row.v2.projectedStrikeouts,
    seasonPhase: row.seasonPhase ?? null,
    dataQualityTier: row.dataQualityTier ?? null,
    pitcherKRate: Number.isFinite(row.inputs?.pitcher?.seasonKRate)
      ? row.inputs.pitcher.seasonKRate
      : Number.isFinite(row.inputs?.pitcher?.recentKRate)
        ? row.inputs.pitcher.recentKRate
        : null,
  }));

  const splits = {
    development: enriched.filter((e) => DEV_SEASONS.has(e.season)),
    holdout: enriched.filter((e) => e.season === HOLDOUT_SEASON),
    full: enriched,
  };

  // Pitcher-type terciles are fixed from the DEVELOPMENT set only (no holdout peeking).
  const pitcherTypeEdges = tercileEdges(splits.development.map((e) => e.pitcherKRate));

  // Fidelity check: alpha = 1.0 recompute vs the stored production V2 projection.
  const reproDiffs = splits.full.map((e) => Math.abs(shrinkRow(e.row, 1.0).projectedStrikeouts - e.baseProjection));
  const repro = {
    maxAbsDiffK: round(Math.max(...reproDiffs), 5),
    meanAbsDiffK: round(mean(reproDiffs), 6),
    rowsOverTolerance: reproDiffs.filter((d) => d > REPRO_TOLERANCE_K).length,
    toleranceK: REPRO_TOLERANCE_K,
  };

  const candidates = alphaGrid.map((alpha) => {
    const withProjection = (list) =>
      list
        .map((e) => ({ ...e, projection: shrinkRow(e.row, alpha).projectedStrikeouts }))
        .filter((e) => Number.isFinite(e.projection));
    return {
      alpha,
      development: evaluate(withProjection(splits.development), pitcherTypeEdges),
      holdout: evaluate(withProjection(splits.holdout), pitcherTypeEdges),
      full: evaluate(withProjection(splits.full), pitcherTypeEdges),
    };
  });

  const baseline = candidates.find((c) => c.alpha === 1.0);
  const selection = selectAlpha(candidates, baseline);

  return {
    schemaVersion: 1,
    kind: "mlb-k-shrinkage-experiment",
    experiment: "experiment-1-shrink-pitcher-skill-dispersion",
    generatedAt: new Date().toISOString(),
    datasetPath: path.relative(ROOT, datasetPath),
    change: "pitcherSkillAdjusted = leagueKRate + alpha * (pitcherSkillRate - leagueKRate); then unchanged matchup + clamp",
    splitDefinition: { development: "season 2023 + 2024", holdout: "season 2025 (scored once)", full: "2023-2025 descriptive only" },
    counts: {
      datasetRows: allRows.length,
      v2ScoreableRows: rows.length,
      development: splits.development.length,
      holdout: splits.holdout.length,
    },
    baselineReproduction: repro,
    pitcherTypeTercileEdges_devSet: pitcherTypeEdges.map((v) => round(v, 4)),
    alphaGrid,
    candidates,
    selection,
  };
}

/**
 * Select alpha ONLY from development data:
 *  - keep alpha 1.0 as reference
 *  - require discrimination is not destroyed: dev correlation >= baseline - 0.01
 *    AND dev projection SD >= 60% of baseline projection SD
 *  - among survivors, minimise dev RMSE, tie-break dev MAE
 */
function selectAlpha(candidates, baseline) {
  const baseCorr = baseline.development.correlation ?? 0;
  const baseSd = baseline.development.projectionStdDev ?? 0;
  const survivors = candidates.filter((c) => {
    const corr = c.development.correlation ?? 0;
    const sd = c.development.projectionStdDev ?? 0;
    return corr >= baseCorr - 0.01 && sd >= 0.6 * baseSd;
  });
  const pool = survivors.length ? survivors : [baseline];
  const best = [...pool].sort(
    (a, b) =>
      (a.development.rmse ?? Infinity) - (b.development.rmse ?? Infinity) ||
      (a.development.mae ?? Infinity) - (b.development.mae ?? Infinity),
  )[0];
  return {
    selectedAlpha: best.alpha,
    rule: "min development RMSE among alphas that keep dev correlation >= baseline-0.01 and dev projection SD >= 60% of baseline",
    consideredAlphas: pool.map((c) => c.alpha),
    developmentDeltaVsBaseline: {
      mae: round((best.development.mae ?? 0) - (baseline.development.mae ?? 0), 4),
      rmse: round((best.development.rmse ?? 0) - (baseline.development.rmse ?? 0), 4),
      correlation: round((best.development.correlation ?? 0) - (baseline.development.correlation ?? 0), 4),
      calibrationSlope: round((best.development.calibrationSlope ?? 0) - (baseline.development.calibrationSlope ?? 0), 4),
    },
    holdoutDeltaVsBaseline: {
      mae: round((best.holdout.mae ?? 0) - (baseline.holdout.mae ?? 0), 4),
      rmse: round((best.holdout.rmse ?? 0) - (baseline.holdout.rmse ?? 0), 4),
      correlation: round((best.holdout.correlation ?? 0) - (baseline.holdout.correlation ?? 0), 4),
      calibrationSlope: round((best.holdout.calibrationSlope ?? 0) - (baseline.holdout.calibrationSlope ?? 0), 4),
    },
  };
}

function fmt(v) {
  return v == null ? "—" : String(v);
}

function candidateTableRows(candidates, split) {
  return candidates.map((c) => {
    const m = c[split];
    return `| ${c.alpha.toFixed(2)} | ${fmt(m.n)} | ${fmt(m.mae)} | ${fmt(m.rmse)} | ${fmt(m.correlation)} | ${fmt(m.bias)} | ${fmt(m.medianAbsError)} | ${fmt(m.calibrationSlope)} | ${fmt(m.calibrationIntercept)} | ${fmt(m.projectionStdDev)} | ${fmt(m.meanProjection)} |`;
  });
}

export function renderReport(result) {
  const L = [];
  L.push(`# MLB Projected-K calibration — Experiment 1: shrink pitcher skill dispersion`, "");
  L.push(`Generated ${result.generatedAt}. Analysis only; no production module changed.`, "");
  L.push(`**Change under test:** \`${result.change}\``, "");
  L.push(`Signed error = actual − projection (positive ⇒ under-projection).`, "");
  L.push("", "## Setup", "");
  L.push(`- Development: ${result.splitDefinition.development} — n=${result.counts.development}`);
  L.push(`- Holdout: ${result.splitDefinition.holdout} — n=${result.counts.holdout}`);
  L.push(`- V2-scoreable rows total: ${result.counts.v2ScoreableRows} / ${result.counts.datasetRows}`);
  L.push(
    `- Baseline reproduction (alpha=1.0 recompute vs stored V2): max |Δ| ${result.baselineReproduction.maxAbsDiffK} K, mean |Δ| ${result.baselineReproduction.meanAbsDiffK} K, rows over ${result.baselineReproduction.toleranceK} K tolerance: ${result.baselineReproduction.rowsOverTolerance}`,
  );
  L.push(`- Pitcher-type terciles (dev-set season K rate edges): ${result.pitcherTypeTercileEdges_devSet.join(", ")}`);

  const header =
    "| alpha | n | MAE | RMSE | corr | bias | medAE | calib slope | calib int | proj SD | mean proj |";
  const sep = "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |";

  for (const [split, title] of [
    ["development", "A. Development (2023–2024) — tuning"],
    ["holdout", "B. Holdout (2025) — untouched"],
    ["full", "C. Full 2023–2025 — descriptive only"],
  ]) {
    L.push("", `## ${title}`, "", header, sep, ...candidateTableRows(result.candidates, split));
  }

  const s = result.selection;
  L.push("", "## Selection (development data only)", "");
  L.push(`- **Selected alpha: ${s.selectedAlpha}**`);
  L.push(`- Rule: ${s.rule}`);
  L.push(`- Alphas that survived the discrimination guard: ${s.consideredAlphas.join(", ")}`);
  L.push(
    `- Dev Δ vs baseline: MAE ${fmt(s.developmentDeltaVsBaseline.mae)}, RMSE ${fmt(s.developmentDeltaVsBaseline.rmse)}, corr ${fmt(s.developmentDeltaVsBaseline.correlation)}, calib slope ${fmt(s.developmentDeltaVsBaseline.calibrationSlope)}`,
  );
  L.push(
    `- Holdout Δ vs baseline: MAE ${fmt(s.holdoutDeltaVsBaseline.mae)}, RMSE ${fmt(s.holdoutDeltaVsBaseline.rmse)}, corr ${fmt(s.holdoutDeltaVsBaseline.correlation)}, calib slope ${fmt(s.holdoutDeltaVsBaseline.calibrationSlope)}`,
  );

  const selected = result.candidates.find((c) => c.alpha === s.selectedAlpha);
  const base = result.candidates.find((c) => c.alpha === 1.0);
  for (const [split, title] of [["development", "development"], ["holdout", "holdout (untouched)"]]) {
    for (const [label, cand] of [["baseline alpha=1.0", base], [`candidate alpha=${s.selectedAlpha}`, selected]]) {
      const m = cand[split];
      L.push("", `### ${title} — ${label}`, "");
      L.push(
        `n ${fmt(m.n)} · MAE ${fmt(m.mae)} · RMSE ${fmt(m.rmse)} · corr ${fmt(m.correlation)} · bias ${fmt(m.bias)} · medAE ${fmt(m.medianAbsError)} · calib ${fmt(m.calibrationSlope)}x+${fmt(m.calibrationIntercept)} · proj SD ${fmt(m.projectionStdDev)} · proj range ${JSON.stringify(m.projectionRange)} (p05 ${fmt(m.projectionP05)}, p95 ${fmt(m.projectionP95)})`,
      );
      L.push("", "Bucket bias (fixed baseline-projection terciles):", "");
      L.push("| bucket | n | mean base proj | mean proj | mean actual | bias |", "| --- | --- | --- | --- | --- | --- |");
      for (const [b, v] of Object.entries(m.bucketBias)) {
        L.push(`| ${b} | ${fmt(v.n)} | ${fmt(v.meanBaseProjection)} | ${fmt(v.meanProjection)} | ${fmt(v.meanActual)} | ${fmt(v.bias)} |`);
      }
      L.push("", "Discrimination:", "");
      L.push("| group | n | mean proj | mean actual | bias | MAE | RMSE | corr |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
      for (const [g, v] of Object.entries(m.discrimination)) {
        L.push(`| ${g} | ${fmt(v.n)} | ${fmt(v.meanProjection)} | ${fmt(v.meanActual)} | ${fmt(v.bias)} | ${fmt(v.mae)} | ${fmt(v.rmse)} | ${fmt(v.corr)} |`);
      }
      L.push("", "By season phase:", "", "| phase | n | bias | MAE | RMSE | corr |", "| --- | --- | --- | --- | --- | --- |");
      for (const [p, v] of Object.entries(m.bySeasonPhase)) L.push(`| ${p} | ${fmt(v.n)} | ${fmt(v.bias)} | ${fmt(v.mae)} | ${fmt(v.rmse)} | ${fmt(v.corr)} |`);
      L.push("", "By data-quality tier:", "", "| tier | n | bias | MAE | RMSE | corr |", "| --- | --- | --- | --- | --- | --- |");
      for (const [t, v] of Object.entries(m.byDataQualityTier)) L.push(`| ${t} | ${fmt(v.n)} | ${fmt(v.bias)} | ${fmt(v.mae)} | ${fmt(v.rmse)} | ${fmt(v.corr)} |`);
    }
  }

  L.push("", "## Notes", "");
  L.push("- Selection used development (2023–2024) only. The 2025 holdout column was computed once and never fed back into the choice.");
  L.push("- Full 2023–2025 rows are descriptive; do not read them as validation.");
  L.push("- matchupAdjustment is reused verbatim from the persisted V2 decomposition (it does not depend on pitcherSkillRate).");
  return `${L.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const dir = argv.find((e) => e.startsWith("--dir="))?.slice(6) ?? path.join("data", "mlb", "k-history", "backtest", "2023-2025");
  const datasetPath = path.isAbsolute(dir) ? path.join(dir, "dataset.jsonl") : path.join(ROOT, dir, "dataset.jsonl");
  const result = runExperiment(datasetPath);
  const outDir = path.join(path.dirname(datasetPath), "shrinkage-experiment");
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
    console.error(`[analyze-mlb-k-shrinkage-experiment] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
