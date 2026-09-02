/**
 * analyze-mlb-k-backtest.mjs  (backtest step 7)
 *
 * Reads a dataset.jsonl and emits the three-view backtest report:
 *   1. production-resolved (headline)   2. V2-only   3. legacy
 * plus paired V2-vs-legacy, fallback-mechanism benefit, segmented diagnostics,
 * and residual/component diagnosis. Diagnosis only - never refits the model.
 *
 * Output: <dir>/analysis.json  +  <dir>/report.md
 *
 * Usage: node scripts/analyze-mlb-k-backtest.mjs --dir=data/mlb/k-history/backtest/2023-2025
 */
import { readFileSync } from "node:fs";
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

const ROOT = process.cwd();
const MIN_SEGMENT_N = 30;

function loadRows(datasetPath) {
  return readFileSync(datasetPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

const projectionOf = {
  productionResolved: (row) => row.productionResolved.projectedKs,
  v2: (row) => row.v2.projectedStrikeouts,
  legacy: (row) => (row.availability.legacy ? row.legacy.projectedKs : null),
};

function viewRows(rows, view) {
  return rows
    .map((row) => ({ actual: row.actual.strikeouts, projection: projectionOf[view](row) }))
    .filter((entry) => Number.isFinite(entry.actual) && Number.isFinite(entry.projection));
}

function segmentProfiles(rows, view, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const actual = row.actual.strikeouts;
    const projection = projectionOf[view](row);
    if (!Number.isFinite(actual) || !Number.isFinite(projection)) continue;
    const key = keyFn(row);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ actual, projection });
  }
  return Object.fromEntries(
    [...groups.entries()]
      .filter(([, entries]) => entries.length >= MIN_SEGMENT_N)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([key, entries]) => [key, errorProfile(entries)]),
  );
}

function pairedV2VsLegacy(rows, keyFn = () => "all") {
  const groups = new Map();
  for (const row of rows) {
    if (!row.availability.both) continue;
    const actual = row.actual.strikeouts;
    if (!Number.isFinite(actual)) continue;
    const eV2 = Math.abs(actual - row.v2.projectedStrikeouts);
    const eLegacy = Math.abs(actual - row.legacy.projectedKs);
    const key = keyFn(row);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ eV2, eLegacy, delta: eV2 - eLegacy });
  }
  return Object.fromEntries(
    [...groups.entries()]
      .filter(([, entries]) => entries.length >= MIN_SEGMENT_N)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([key, entries]) => {
        const deltas = entries.map((entry) => entry.delta);
        const v2Wins = entries.filter((entry) => entry.delta < 0).length;
        const ties = entries.filter((entry) => Math.abs(entry.delta) < 1e-9).length;
        const sd = stddev(deltas);
        const meanDelta = mean(deltas);
        return [key, {
          sampleSize: entries.length,
          v2MAE: round(mean(entries.map((entry) => entry.eV2))),
          legacyMAE: round(mean(entries.map((entry) => entry.eLegacy))),
          meanAbsErrorDelta_v2MinusLegacy: round(meanDelta),
          medianAbsErrorDelta_v2MinusLegacy: round(median(deltas)),
          v2WinRate: round(v2Wins / entries.length, 4),
          tieRate: round(ties / entries.length, 4),
          pairedTStat: sd && sd > 0 ? round((meanDelta / (sd / Math.sqrt(entries.length))), 3) : null,
        }];
      }),
  );
}

function fallbackAnalysis(rows) {
  const scoreable = rows.filter((row) => row.availability.productionScoreable);
  const fallbackRows = scoreable.filter((row) => row.availability.isProductionFallbackRow);

  const profileFor = (subset, pick) => errorProfile(
    subset
      .map((row) => ({ actual: row.actual.strikeouts, projection: pick(row) }))
      .filter((entry) => Number.isFinite(entry.actual) && Number.isFinite(entry.projection)),
  );

  const onFallback = {
    sampleSize: fallbackRows.length,
    productionResolved: profileFor(fallbackRows, (row) => row.productionResolved.projectedKs),
    v2OnSameRows: profileFor(fallbackRows, (row) => row.v2.projectedStrikeouts),
    legacyOnSameRows: profileFor(fallbackRows, (row) => row.legacy.projectedKs),
  };
  const systemWide = {
    sampleSize: scoreable.length,
    productionResolved: profileFor(scoreable, (row) => row.productionResolved.projectedKs),
    alwaysV2: profileFor(scoreable, (row) => row.v2.projectedStrikeouts),
    alwaysLegacy: profileFor(scoreable, (row) => row.legacy.projectedKs),
  };

  const fbMae = onFallback.productionResolved.mae;
  const v2Mae = onFallback.v2OnSameRows.mae;
  const legacyMae = onFallback.legacyOnSameRows.mae;
  let verdict = "insufficient-data";
  if (fbMae != null && v2Mae != null) {
    verdict = fbMae < v2Mae
      ? `fallback IMPROVES accuracy on fallback rows (MAE ${fbMae} vs serving V2 ${v2Mae}; delta ${round(fbMae - v2Mae)})`
      : fbMae > v2Mae
        ? `fallback WORSENS accuracy on fallback rows (MAE ${fbMae} vs serving V2 ${v2Mae}; delta +${round(fbMae - v2Mae)})`
        : "fallback is neutral on fallback rows";
  }
  return { onFallbackRows: onFallback, systemWide, verdict, note: "onFallbackRows.productionResolved == legacyOnSameRows by construction (production serves legacy on these rows)." };
}

function componentDiagnostics(rows) {
  // Rows where V2 was the served projection AND has a decomposition.
  const v2Rows = rows.filter((row) => Number.isFinite(row.actual.strikeouts) && Number.isFinite(row.v2.projectedStrikeouts));
  if (v2Rows.length < 50) return { status: "INSUFFICIENT", sampleSize: v2Rows.length };

  const residual = (row) => row.actual.strikeouts - row.v2.projectedStrikeouts;

  // Per-component: correlation of contribution with actual K, and mean residual by contribution tercile.
  const componentKeys = [...new Set(v2Rows.flatMap((row) => row.v2.components.map((component) => component.key)))].sort();
  const perComponent = {};
  for (const key of componentKeys) {
    const withComponent = v2Rows
      .map((row) => {
        const component = row.v2.components.find((entry) => entry.key === key);
        return component ? { contribution: component.contribution, value: component.value, residual: residual(row), actual: row.actual.strikeouts } : null;
      })
      .filter(Boolean);
    if (withComponent.length < MIN_SEGMENT_N) continue;
    const edges = tercileEdges(withComponent.map((entry) => entry.value));
    const byTercile = {};
    for (const entry of withComponent) {
      const bucket = bucketByEdges(entry.value, edges);
      (byTercile[bucket] ??= []).push(entry.residual);
    }
    perComponent[key] = {
      presentRows: withComponent.length,
      presenceRate: round(withComponent.length / v2Rows.length, 3),
      meanValue: round(mean(withComponent.map((entry) => entry.value))),
      meanContribution: round(mean(withComponent.map((entry) => entry.contribution))),
      corrValueWithActualK: round(pearson(withComponent.map((entry) => [entry.value, entry.actual]))),
      corrContributionWithResidual: round(pearson(withComponent.map((entry) => [entry.contribution, entry.residual]))),
      meanResidualByValueTercile: Object.fromEntries(Object.entries(byTercile).map(([bucket, residuals]) => [bucket, round(mean(residuals), 3)])),
    };
  }

  // OLS of residual on standardized component contributions present on most rows.
  const denseKeys = componentKeys.filter((key) => (perComponent[key]?.presenceRate ?? 0) >= 0.6);
  let regression = null;
  if (denseKeys.length >= 2) {
    const usable = v2Rows.filter((row) => denseKeys.every((key) => row.v2.components.some((component) => component.key === key)));
    if (usable.length >= 100) {
      const columns = denseKeys.map((key) => {
        const raw = usable.map((row) => row.v2.components.find((component) => component.key === key).contribution);
        const m = mean(raw);
        const sd = stddev(raw) || 1;
        return raw.map((value) => (value - m) / sd);
      });
      const y = usable.map((row) => residual(row));
      const fit = ols(y, columns);
      regression = fit
        ? {
          note: "residual = actual - v2Projected regressed on standardized component contributions; positive coeff => component drives under-projection => under-weighted",
          sampleSize: usable.length,
          intercept: round(fit.intercept),
          coefficients: Object.fromEntries(denseKeys.map((key, index) => [key, round(fit.coefficients[index])])),
        }
        : null;
    }
  }

  // Bias attribution between the two V2 multiplicands.
  const decomp = v2Rows.filter((row) => Number.isFinite(row.v2.projectedKRate) && Number.isFinite(row.v2.projectedBattersFaced) && Number.isFinite(row.actual.battersFaced));
  const kRateComponent = decomp.map((row) => row.v2.projectedKRate);
  const bfComponent = decomp.map((row) => row.v2.projectedBattersFaced);
  const actualKRate = decomp.filter((row) => row.actual.battersFaced > 0).map((row) => row.actual.strikeouts / row.actual.battersFaced);
  const projKRateForActualBf = decomp.filter((row) => row.actual.battersFaced > 0).map((row) => row.v2.projectedKRate);

  return {
    status: "OK",
    sampleSize: v2Rows.length,
    perComponent,
    residualRegression: regression,
    multiplicandDecomposition: {
      note: "V2 projectedStrikeouts = projectedKRate * projectedBattersFaced",
      meanProjectedKRate: round(mean(kRateComponent)),
      meanActualKRate: round(mean(actualKRate)),
      kRateBias: round(mean(projKRateForActualBf) - mean(actualKRate)),
      meanProjectedBattersFaced: round(mean(bfComponent)),
      meanActualBattersFaced: round(mean(decomp.map((row) => row.actual.battersFaced))),
      battersFacedBias: round(mean(bfComponent) - mean(decomp.map((row) => row.actual.battersFaced))),
      varProjectedStrikeouts: round(stddev(decomp.map((row) => row.v2.projectedStrikeouts)) ** 2, 4),
      varFromKRateHoldingBf: round(stddev(decomp.map((row) => row.v2.projectedKRate * mean(bfComponent))) ** 2, 4),
      varFromBfHoldingKRate: round(stddev(decomp.map((row) => mean(kRateComponent) * row.v2.projectedBattersFaced)) ** 2, 4),
    },
  };
}

function calibration(rows, view) {
  const usable = viewRows(rows, view);
  if (usable.length < 50) return { status: "INSUFFICIENT" };
  const fit = ols(usable.map((entry) => entry.actual), [usable.map((entry) => entry.projection)]);
  const sorted = [...usable].sort((a, b) => a.projection - b.projection);
  const binSize = Math.floor(sorted.length / 10) || 1;
  const bins = [];
  for (let i = 0; i < 10 && i * binSize < sorted.length; i += 1) {
    const slice = sorted.slice(i * binSize, i === 9 ? sorted.length : (i + 1) * binSize);
    bins.push({ meanProjection: round(mean(slice.map((entry) => entry.projection)), 3), meanActual: round(mean(slice.map((entry) => entry.actual)), 3), n: slice.length });
  }
  return {
    status: "OK",
    slope: fit ? round(fit.coefficients[0]) : null,
    intercept: fit ? round(fit.intercept) : null,
    note: "actual ~ 1 + projection; slope 1 / intercept 0 == perfectly calibrated",
    decile: bins,
  };
}

export function analyze(datasetPath) {
  const rows = loadRows(datasetPath);
  const flat = (view) => errorProfile(viewRows(rows, view));

  const counts = {
    totalStarts: rows.length,
    v2Available: rows.filter((row) => row.availability.v2).length,
    v2ProductionEligible: rows.filter((row) => row.v2.productionEligible).length,
    legacyAvailable: rows.filter((row) => row.availability.legacy).length,
    bothAvailable: rows.filter((row) => row.availability.both).length,
    productionResolvedScoreable: rows.filter((row) => row.availability.productionScoreable).length,
    productionFallbackRows: rows.filter((row) => row.availability.isProductionFallbackRow).length,
    productionUnavailableRows: rows.filter((row) => row.productionResolved.source === "unavailable").length,
    servedByV2: rows.filter((row) => row.projectionServedByProduction === "v2").length,
    servedByLegacy: rows.filter((row) => row.projectionServedByProduction === "legacy").length,
  };

  const segmenters = {
    projectionBucket: (row) => row.segments.productionProjectionBucket,
    v2Confidence: (row) => row.v2.confidence,
    dataQualityTier: (row) => row.dataQualityTier,
    homeAway: (row) => row.segments.homeAway,
    handedness: (row) => row.segments.handedness,
    actualIpBucket: (row) => row.segments.actualIpBucket,
    seasonPhase: (row) => row.seasonPhase,
    season: (row) => String(row.season),
  };
  // opponent K tendency + recent-form terciles need global edges
  const oppEdges = tercileEdges(rows.map((row) => row.inputs.opponent.seasonKRate));
  const formEdges = tercileEdges(rows.map((row) => row.segments.recentFormDelta));
  segmenters.opponentKTendency = (row) => bucketByEdges(row.inputs.opponent.seasonKRate, oppEdges);
  segmenters.recentFormStrength = (row) => bucketByEdges(row.segments.recentFormDelta, formEdges);

  const views = ["productionResolved", "v2", "legacy"];
  const segmented = {};
  for (const view of views) {
    segmented[view] = Object.fromEntries(Object.entries(segmenters).map(([name, keyFn]) => [name, segmentProfiles(rows, view, keyFn)]));
  }

  return {
    schemaVersion: 1,
    kind: "mlb-k-backtest-analysis",
    generatedAt: new Date().toISOString(),
    datasetPath: path.relative(ROOT, datasetPath),
    counts,
    overall: { productionResolved: flat("productionResolved"), v2: flat("v2"), legacy: flat("legacy") },
    v2ByConfidence: Object.fromEntries(["high", "medium", "low", "insufficient"].map((grade) => [grade, errorProfile(
      rows.filter((row) => row.v2.confidence === grade).map((row) => ({ actual: row.actual.strikeouts, projection: row.v2.projectedStrikeouts })),
    )])),
    v2ByDataQualityTier: Object.fromEntries(["A", "B", "C"].map((tier) => [tier, errorProfile(
      rows.filter((row) => row.dataQualityTier === tier).map((row) => ({ actual: row.actual.strikeouts, projection: row.v2.projectedStrikeouts })),
    )])),
    paired_v2_vs_legacy: {
      overall: pairedV2VsLegacy(rows).all ?? { sampleSize: 0 },
      byConfidence: pairedV2VsLegacy(rows, (row) => row.v2.confidence),
      byProjectionBucket: pairedV2VsLegacy(rows, (row) => row.segments.productionProjectionBucket),
      bySeasonPhase: pairedV2VsLegacy(rows, (row) => row.seasonPhase),
      byHandedness: pairedV2VsLegacy(rows, (row) => row.segments.handedness),
      byDataQualityTier: pairedV2VsLegacy(rows, (row) => row.dataQualityTier),
    },
    fallbackAnalysis: fallbackAnalysis(rows),
    calibration: { productionResolved: calibration(rows, "productionResolved"), v2: calibration(rows, "v2"), legacy: calibration(rows, "legacy") },
    componentDiagnostics: componentDiagnostics(rows),
    segmented,
    degradationCoverage: rows.reduce((acc, row) => {
      for (const flag of row.degradationFlags) acc[flag] = (acc[flag] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

function fmt(value) {
  return value == null ? "—" : String(value);
}

function profileRow(label, profile) {
  return `| ${label} | ${fmt(profile.sampleSize)} | ${fmt(profile.meanActual)} | ${fmt(profile.meanProjection)} | ${fmt(profile.bias)} | ${fmt(profile.mae)} | ${fmt(profile.rmse)} | ${fmt(profile.correlation)} | ${fmt(profile.medianAbsError)} |`;
}

export function renderReport(analysis) {
  const lines = [];
  lines.push(`# MLB Projected K backtest — ${analysis.datasetPath}`, "");
  lines.push(`Generated ${analysis.generatedAt}. Signed error = actual − projection (positive ⇒ model under-projected).`, "");
  lines.push("## Row counts", "");
  for (const [key, value] of Object.entries(analysis.counts)) lines.push(`- **${key}**: ${value}`);
  lines.push("", "## Overall metrics (three views)", "");
  lines.push("| view | n | mean actual K | mean proj K | bias | MAE | RMSE | corr | median abs err |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  lines.push(profileRow("production-resolved", analysis.overall.productionResolved));
  lines.push(profileRow("V2-only (all confidences)", analysis.overall.v2));
  lines.push(profileRow("legacy", analysis.overall.legacy));
  lines.push("", "### V2 by confidence", "", "| confidence | n | mean actual | mean proj | bias | MAE | RMSE | corr | medAE |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [grade, profile] of Object.entries(analysis.v2ByConfidence)) lines.push(profileRow(grade, profile));
  lines.push("", "### V2 by data-quality tier", "", "| tier | n | mean actual | mean proj | bias | MAE | RMSE | corr | medAE |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const [tier, profile] of Object.entries(analysis.v2ByDataQualityTier)) lines.push(profileRow(tier, profile));

  lines.push("", "## Fallback-mechanism analysis", "");
  const fb = analysis.fallbackAnalysis;
  lines.push(`**Verdict:** ${fb.verdict}`, "");
  lines.push("On the rows production actually served legacy:", "");
  lines.push("| projection on those rows | n | bias | MAE | RMSE | corr |", "| --- | --- | --- | --- | --- | --- |");
  for (const [label, key] of [["production-resolved (= legacy here)", "productionResolved"], ["V2 (suppressed)", "v2OnSameRows"], ["legacy", "legacyOnSameRows"]]) {
    const p = fb.onFallbackRows[key];
    lines.push(`| ${label} | ${fmt(p.sampleSize)} | ${fmt(p.bias)} | ${fmt(p.mae)} | ${fmt(p.rmse)} | ${fmt(p.correlation)} |`);
  }
  lines.push("", "System-wide on all production-scoreable rows:", "");
  lines.push("| strategy | n | bias | MAE | RMSE | corr |", "| --- | --- | --- | --- | --- | --- |");
  for (const [label, key] of [["production-resolved (fallback)", "productionResolved"], ["always serve V2", "alwaysV2"], ["always serve legacy", "alwaysLegacy"]]) {
    const p = fb.systemWide[key];
    lines.push(`| ${label} | ${fmt(p.sampleSize)} | ${fmt(p.bias)} | ${fmt(p.mae)} | ${fmt(p.rmse)} | ${fmt(p.correlation)} |`);
  }

  lines.push("", "## Paired V2 vs legacy (rows where both available)", "");
  const po = analysis.paired_v2_vs_legacy.overall;
  lines.push(`- n=${fmt(po.sampleSize)}, V2 MAE ${fmt(po.v2MAE)} vs legacy MAE ${fmt(po.legacyMAE)}`);
  lines.push(`- mean |err| delta (V2−legacy): ${fmt(po.meanAbsErrorDelta_v2MinusLegacy)} (negative ⇒ V2 better); V2 win rate ${fmt(po.v2WinRate)}; paired t ${fmt(po.pairedTStat)}`);
  lines.push("", "By V2 confidence:", "", "| confidence | n | V2 MAE | legacy MAE | Δ|err| | V2 win rate |", "| --- | --- | --- | --- | --- | --- |");
  for (const [grade, entry] of Object.entries(analysis.paired_v2_vs_legacy.byConfidence)) {
    lines.push(`| ${grade} | ${fmt(entry.sampleSize)} | ${fmt(entry.v2MAE)} | ${fmt(entry.legacyMAE)} | ${fmt(entry.meanAbsErrorDelta_v2MinusLegacy)} | ${fmt(entry.v2WinRate)} |`);
  }

  lines.push("", "## Calibration", "");
  for (const [view, cal] of Object.entries(analysis.calibration)) {
    lines.push(`- **${view}**: slope ${fmt(cal.slope)}, intercept ${fmt(cal.intercept)} (${cal.status})`);
  }

  lines.push("", "## Residual / component diagnosis (V2)", "");
  const cd = analysis.componentDiagnostics;
  if (cd.status === "OK") {
    lines.push(`Sample ${cd.sampleSize}.`, "");
    lines.push("| component | presence | mean value | corr(value, actual K) | corr(contribution, residual) |", "| --- | --- | --- | --- | --- |");
    for (const [key, stats] of Object.entries(cd.perComponent)) {
      lines.push(`| ${key} | ${fmt(stats.presenceRate)} | ${fmt(stats.meanValue)} | ${fmt(stats.corrValueWithActualK)} | ${fmt(stats.corrContributionWithResidual)} |`);
    }
    if (cd.residualRegression) {
      lines.push("", "Residual regression on standardized component contributions (positive ⇒ under-weighted):", "");
      for (const [key, coeff] of Object.entries(cd.residualRegression.coefficients)) lines.push(`- ${key}: ${fmt(coeff)}`);
    }
    const md = cd.multiplicandDecomposition;
    lines.push("", `K-rate bias ${fmt(md.kRateBias)} (proj ${fmt(md.meanProjectedKRate)} vs actual ${fmt(md.meanActualKRate)}); BF bias ${fmt(md.battersFacedBias)} (proj ${fmt(md.meanProjectedBattersFaced)} vs actual ${fmt(md.meanActualBattersFaced)}).`);
    lines.push(`Variance of projected K: ${fmt(md.varProjectedStrikeouts)}; from K-rate ${fmt(md.varFromKRateHoldingBf)}, from BF ${fmt(md.varFromBfHoldingKRate)}.`);
  } else {
    lines.push(`Status: ${cd.status} (n=${fmt(cd.sampleSize)})`);
  }

  lines.push("", "## Segmented diagnostics (production-resolved)", "");
  for (const [name, groups] of Object.entries(analysis.segmented.productionResolved)) {
    if (!Object.keys(groups).length) continue;
    lines.push(`### ${name}`, "", "| segment | n | bias | MAE | RMSE | corr |", "| --- | --- | --- | --- | --- | --- |");
    for (const [key, profile] of Object.entries(groups)) {
      lines.push(`| ${key} | ${fmt(profile.sampleSize)} | ${fmt(profile.bias)} | ${fmt(profile.mae)} | ${fmt(profile.rmse)} | ${fmt(profile.correlation)} |`);
    }
    lines.push("");
  }

  lines.push("## Fidelity / degradation coverage", "");
  for (const [flag, count] of Object.entries(analysis.degradationCoverage).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${flag}: ${count} rows`);
  }
  return `${lines.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const dir = argv.find((entry) => entry.startsWith("--dir="))?.slice(6) ?? path.join("data", "mlb", "k-history", "backtest", "2023-2025");
  const datasetPath = path.isAbsolute(dir) ? path.join(dir, "dataset.jsonl") : path.join(ROOT, dir, "dataset.jsonl");
  const analysis = analyze(datasetPath);
  const outDir = path.dirname(datasetPath);
  writeJsonAtomic(path.join(outDir, "analysis.json"), analysis);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(path.join(outDir, "report.md"), renderReport(analysis), "utf8");
  console.log(JSON.stringify({ counts: analysis.counts, overall: analysis.overall, fallbackVerdict: analysis.fallbackAnalysis.verdict }, null, 2));
  return analysis;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[analyze-mlb-k-backtest] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
