import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CFB_RESEARCH_PHASE9_EXPERIMENTS_DIR, PHASE9_BASELINE_SPEC, PHASE9_FINALIST_SPEC, PHASE9_TEST_SEASONS, SEASON_TIE_BAND_MAE } from "../src/lib/cfb/research/phase9/config";
import { runPhase9Pipeline, type Phase9PipelineResult } from "../src/lib/cfb/research/phase9/pipeline";
import { buildPhase9MarketJoin, pickOneRowPerGame } from "../src/lib/cfb/research/phase9/marketJoin";
import { evaluateCalibrated, evaluateRawVsCalibratedTotal } from "../src/lib/cfb/research/phase9/scoreEvaluation";
import { buildAllSegmentValidations } from "../src/lib/cfb/research/phase9/segmentValidation";
import { buildExtremeProbabilityQa, buildIntervalCoverage, buildProbabilitySummary } from "../src/lib/cfb/research/phase9/probabilityValidation";
import { buildResidualValidation } from "../src/lib/cfb/research/phase9/residualValidation";
import { buildMarketRevalidation } from "../src/lib/cfb/research/phase9/marketRevalidation";
import { buildExtremeDisagreementValidation } from "../src/lib/cfb/research/phase9/extremeDisagreementValidation";
import { buildEdgeDiagnostics } from "../src/lib/cfb/research/phase9/edgeDiagnostic";
import { buildProductionCandidateConfigSnapshot } from "../src/lib/cfb/research/phase9/productionCandidateConfig";
import type { Phase8Prediction } from "../src/lib/cfb/research/phase8/types";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, CFB_RESEARCH_PHASE9_EXPERIMENTS_DIR);
mkdirSync(OUT_DIR, { recursive: true });

function writeArtifact(name: string, data: unknown): void {
  writeFileSync(resolve(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`[cfb:research:phase9:run] wrote ${name}`);
}

function assertNoNaNOrInfinity(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoNaNOrInfinity(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoNaNOrInfinity(v, `${path}.${k}`);
  }
}

function nonconferenceMarketGap(ratingPredictions: readonly Phase8Prediction[], marketRows: readonly ReturnType<typeof pickOneRowPerGame>[number][]) {
  const byGame = new Map(ratingPredictions.map((p) => [p.gameId, p]));
  const withConf = marketRows
    .map((r) => {
      const rp = byGame.get(r.gameId);
      if (!rp || rp.homeConference === null || rp.awayConference === null || r.spreadLatestObserved === null) return null;
      const marketMargin = -r.spreadLatestObserved;
      return { nonconference: rp.homeConference !== rp.awayConference, modelError: Math.abs(r.modelProjectedMargin - r.actualMargin), marketError: Math.abs(marketMargin - r.actualMargin) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  function summarize(rows: typeof withConf) {
    if (rows.length === 0) return { n: 0, modelMae: null, marketMae: null, gap: null };
    const modelMae = rows.reduce((s, r) => s + r.modelError, 0) / rows.length;
    const marketMae = rows.reduce((s, r) => s + r.marketError, 0) / rows.length;
    return { n: rows.length, modelMae, marketMae, gap: modelMae - marketMae };
  }

  return { conference: summarize(withConf.filter((r) => !r.nonconference)), nonconference: summarize(withConf.filter((r) => r.nonconference)) };
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const testSeasons = [...PHASE9_TEST_SEASONS];

  console.log("[cfb:research:phase9:run] running baseline pipeline...");
  const baselineStart = Date.now();
  const baseline: Phase9PipelineResult = runPhase9Pipeline(PHASE9_BASELINE_SPEC, testSeasons);
  const baselineRuntimeMs = Date.now() - baselineStart;
  console.log(`[cfb:research:phase9:run] baseline done (${baselineRuntimeMs}ms)`);

  console.log("[cfb:research:phase9:run] running finalist pipeline...");
  const finalistStart = Date.now();
  const finalist: Phase9PipelineResult = runPhase9Pipeline(PHASE9_FINALIST_SPEC, testSeasons);
  const finalistRuntimeMs = Date.now() - finalistStart;
  console.log(`[cfb:research:phase9:run] finalist done (${finalistRuntimeMs}ms)`);

  const baselineMarketAll = buildPhase9MarketJoin(baseline.calibrated, baseline.probabilities, testSeasons);
  const finalistMarketAll = buildPhase9MarketJoin(finalist.calibrated, finalist.probabilities, testSeasons);
  const baselineMarket = pickOneRowPerGame(baselineMarketAll);
  const finalistMarket = pickOneRowPerGame(finalistMarketAll);

  // ---- end-to-end-comparison.json (Sections 3/6/7/8/9/10) ----
  writeArtifact("end-to-end-comparison.json", {
    baseline: { evaluation: evaluateCalibrated(baseline.calibrated), totalCalibration: evaluateRawVsCalibratedTotal(baseline.calibrated) },
    finalist: { evaluation: evaluateCalibrated(finalist.calibrated), totalCalibration: evaluateRawVsCalibratedTotal(finalist.calibrated) },
  });

  // ---- week-segment-validation.json (Sections 5, 10-13 week ranges) ----
  const baselineSegments = buildAllSegmentValidations(baseline.ratingPredictions);
  const finalistSegments = buildAllSegmentValidations(finalist.ratingPredictions);
  writeArtifact("week-segment-validation.json", { baseline: baselineSegments.weekRanges, finalist: finalistSegments.weekRanges });

  // ---- connectivity-segment-validation.json (Section 6/14) ----
  writeArtifact("connectivity-segment-validation.json", { baseline: baselineSegments.connectivityBuckets, finalist: finalistSegments.connectivityBuckets });

  // ---- transition-team-validation.json (Section 7/15) ----
  writeArtifact("transition-team-validation.json", { baseline: baselineSegments.transitionTeamBuckets, finalist: finalistSegments.transitionTeamBuckets });

  // ---- season-stability.json (Section 8/16) ----
  const seasonClassification = baselineSegments.seasonRows.map((b) => {
    const f = finalistSegments.seasonRows.find((r) => r.label === b.label)!;
    if (b.mae === null || f.mae === null) return { season: b.label, baselineMae: b.mae, finalistMae: f.mae, delta: null, classification: "INSUFFICIENT_DATA" as const };
    const delta = f.mae - b.mae; // negative = finalist improved
    const classification = delta <= -SEASON_TIE_BAND_MAE ? "IMPROVED" : delta >= SEASON_TIE_BAND_MAE ? "MATERIALLY_WORSE" : "EFFECTIVELY_TIED";
    return { season: b.label, baselineMae: b.mae, finalistMae: f.mae, delta, classification };
  });
  writeArtifact("season-stability.json", { tieBandMae: SEASON_TIE_BAND_MAE, bySeason: seasonClassification });

  // ---- probability-validation.json (Sections 12/13/19-22) ----
  writeArtifact("probability-validation.json", {
    baseline: {
      summary: buildProbabilitySummary(baseline.calibrated, baseline.probabilities),
      intervalCoverage: buildIntervalCoverage(baseline.probabilities),
      extremeProbabilityQa: buildExtremeProbabilityQa(baseline.calibrated, baseline.probabilities),
    },
    finalist: {
      summary: buildProbabilitySummary(finalist.calibrated, finalist.probabilities),
      intervalCoverage: buildIntervalCoverage(finalist.probabilities),
      extremeProbabilityQa: buildExtremeProbabilityQa(finalist.calibrated, finalist.probabilities),
    },
  });

  // ---- residual-validation.json (Section 11/18) ----
  writeArtifact("residual-validation.json", { baseline: buildResidualValidation(baseline.calibrated), finalist: buildResidualValidation(finalist.calibrated) });

  // ---- market-revalidation.json (Sections 14/23/24/29) ----
  writeArtifact("market-revalidation.json", {
    baseline: { ...buildMarketRevalidation(baselineMarket), nonconferenceGap: nonconferenceMarketGap(baseline.ratingPredictions, baselineMarket) },
    finalist: { ...buildMarketRevalidation(finalistMarket), nonconferenceGap: nonconferenceMarketGap(finalist.ratingPredictions, finalistMarket) },
    priorPhaseReference: { phase6IncrementalR2: 0.0003, phase8DiagnosticIncrementalR2: 0.00076 },
  });

  // ---- extreme-disagreement-validation.json (Section 19/28) ----
  writeArtifact("extreme-disagreement-validation.json", {
    baseline: buildExtremeDisagreementValidation(baselineMarket),
    finalist: buildExtremeDisagreementValidation(finalistMarket),
  });

  // ---- edge-diagnostic.json (Sections 16/17/18/25-27) ----
  writeArtifact("edge-diagnostic.json", {
    baseline: buildEdgeDiagnostics(baselineMarket),
    finalist: buildEdgeDiagnostics(finalistMarket),
  });

  // ---- runtime-validation.json (Section 22/31) ----
  writeArtifact("runtime-validation.json", {
    baselineRuntimeMs,
    finalistRuntimeMs,
    runtimeDeltaMs: finalistRuntimeMs - baselineRuntimeMs,
    runtimeDeltaPct: baselineRuntimeMs > 0 ? (finalistRuntimeMs - baselineRuntimeMs) / baselineRuntimeMs : null,
    nGamesEvaluated: finalist.calibrated.length,
    note: "Determinism (repeated-run byte-identity) is verified separately by pipelineFidelity.test.ts (single-season, fast) rather than re-run here (full 6-season run costs ~4-5 minutes per run).",
  });

  // ---- phase9-production-candidate.json (Section 24) ----
  const configSnapshot = buildProductionCandidateConfigSnapshot();
  const baselineEval = evaluateCalibrated(baseline.calibrated);
  const finalistEval = evaluateCalibrated(finalist.calibrated);
  writeArtifact("phase9-production-candidate.json", {
    config: configSnapshot,
    summary: {
      baselineMarginMae: baselineEval.margin.mae,
      finalistMarginMae: finalistEval.margin.mae,
      marginMaeImprovement: baselineEval.margin.mae !== null && finalistEval.margin.mae !== null ? baselineEval.margin.mae - finalistEval.margin.mae : null,
      baselineTotalMae: baselineEval.total.mae,
      finalistTotalMae: finalistEval.total.mae,
      seasonsImproved: seasonClassification.filter((s) => s.classification === "IMPROVED").length,
      seasonsTied: seasonClassification.filter((s) => s.classification === "EFFECTIVELY_TIED").length,
      seasonsWorse: seasonClassification.filter((s) => s.classification === "MATERIALLY_WORSE").length,
    },
  });

  assertNoNaNOrInfinity({ baselineEval, finalistEval, seasonClassification });
  console.log(`[cfb:research:phase9:run] done in ${Date.now() - t0}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
