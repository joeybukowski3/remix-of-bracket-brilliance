import { resolve } from "node:path";
import { writeAtomic } from "../src/lib/cfb/research/ingestion/cfbdClient";
import { runPhase4WalkForward, type Phase4WalkForwardOptions } from "../src/lib/cfb/research/phase4/phase4WalkForward";
import { evaluateScorePredictions, type Phase4EvaluationBundle } from "../src/lib/cfb/research/phase4/scoreEvaluation";
import { auditExtremeScores, computeResidualDiagnostics } from "../src/lib/cfb/research/phase4/residualDiagnostics";
import {
  CFB_RESEARCH_PHASE4_EXPERIMENTS_DIR,
  PHASE4_TEST_SEASONS,
  PRIOR_K_SENSITIVITY_GRID,
  RIDGE_LAMBDA_SENSITIVITY_GRID,
  SCORING_RIDGE_LAMBDA,
} from "../src/lib/cfb/research/phase4/config";
import type { CfbHfaTreatment, CfbPaceTreatment, CfbSecondaryFeatureBlock, ScoringModelConfig, ScorePrediction } from "../src/lib/cfb/research/phase4/types";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, CFB_RESEARCH_PHASE4_EXPERIMENTS_DIR);

function write(name: string, data: unknown) {
  writeAtomic(resolve(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

type WeeklySegments = {
  overall: Phase4EvaluationBundle;
  weeks1to4: Phase4EvaluationBundle;
  weeks5to8: Phase4EvaluationBundle;
  weeks9plus: Phase4EvaluationBundle;
  bySeason: Record<number, Phase4EvaluationBundle>;
};

function segment(predictions: ScorePrediction[]): WeeklySegments {
  const fbsOnly = predictions.filter((p) => p.matchupPopulation === "fbs_vs_fbs");
  const seasons = [...new Set(fbsOnly.map((p) => p.season))].sort((a, b) => a - b);
  const bySeason: Record<number, Phase4EvaluationBundle> = {};
  for (const s of seasons) bySeason[s] = evaluateScorePredictions(fbsOnly.filter((p) => p.season === s));
  return {
    overall: evaluateScorePredictions(fbsOnly),
    weeks1to4: evaluateScorePredictions(fbsOnly.filter((p) => p.week >= 1 && p.week <= 4)),
    weeks5to8: evaluateScorePredictions(fbsOnly.filter((p) => p.week >= 5 && p.week <= 8)),
    weeks9plus: evaluateScorePredictions(fbsOnly.filter((p) => p.week >= 9)),
    bySeason,
  };
}

function runConfig(label: string, scoringConfig: ScoringModelConfig, ratingLambda?: number): { label: string; predictions: ScorePrediction[]; segments: WeeklySegments } {
  const options: Phase4WalkForwardOptions = {
    scoringConfig,
    testSeasons: [...PHASE4_TEST_SEASONS],
    ratingLambda,
  };
  const predictions = runPhase4WalkForward(options);
  const segments = segment(predictions);
  console.log(
    `[phase4]   ${label}: margin MAE=${segments.overall.margin.mae?.toFixed(3)} total MAE=${segments.overall.total.mae?.toFixed(3)} ` +
      `home MAE=${segments.overall.homeScore.mae?.toFixed(3)} away MAE=${segments.overall.awayScore.mae?.toFixed(3)}`,
  );
  return { label, predictions, segments };
}

function slim(run: ReturnType<typeof runConfig>) {
  return { label: run.label, ...run.segments };
}

async function main() {
  const t0 = Date.now();
  const BASE: ScoringModelConfig = {
    hfa: "NATIONAL",
    scoringEnvironment: "BLENDED_CURRENT",
    pace: "NONE",
    secondary: [],
    lambda: SCORING_RIDGE_LAMBDA,
    priorGamesWeight: 8,
  };

  // === Baseline scoring model (Model A: strength only) ===
  console.log("[phase4] Baseline scoring model (Model A)");
  const modelA = runConfig("modelA-strength-only", BASE);
  write("scoring-baseline.json", slim(modelA));

  // === HFA ablation ===
  console.log("[phase4] HFA ablation");
  const hfaResults: Record<CfbHfaTreatment, ReturnType<typeof runConfig>> = {} as Record<CfbHfaTreatment, ReturnType<typeof runConfig>>;
  for (const hfa of ["NONE", "NATIONAL", "SEASON_VARYING"] as CfbHfaTreatment[]) {
    hfaResults[hfa] = runConfig(`hfa-${hfa}`, { ...BASE, hfa });
  }
  const winningHfa = (Object.entries(hfaResults) as [CfbHfaTreatment, ReturnType<typeof runConfig>][]).reduce((best, cur) =>
    cur[1].segments.overall.margin.mae !== null && (best[1].segments.overall.margin.mae === null || cur[1].segments.overall.margin.mae < best[1].segments.overall.margin.mae) ? cur : best,
  )[0];
  console.log(`[phase4] Winning HFA treatment: ${winningHfa}`);
  write("hfa-comparison.json", { results: Object.fromEntries(Object.entries(hfaResults).map(([k, v]) => [k, slim(v)])), winningHfa });

  // === Pace ablation (judged on TOTAL MAE per spec Section 14) ===
  console.log("[phase4] Pace ablation");
  const paceResults: Record<CfbPaceTreatment, ReturnType<typeof runConfig>> = {} as Record<CfbPaceTreatment, ReturnType<typeof runConfig>>;
  for (const pace of ["NONE", "RAW", "SITUATION_NEUTRAL"] as CfbPaceTreatment[]) {
    paceResults[pace] = runConfig(`pace-${pace}`, { ...BASE, hfa: winningHfa, pace });
  }
  const winningPace = (Object.entries(paceResults) as [CfbPaceTreatment, ReturnType<typeof runConfig>][]).reduce((best, cur) =>
    cur[1].segments.overall.total.mae !== null && (best[1].segments.overall.total.mae === null || cur[1].segments.overall.total.mae < best[1].segments.overall.total.mae) ? cur : best,
  )[0];
  console.log(`[phase4] Winning pace treatment (by total MAE): ${winningPace}`);
  write("pace-comparison.json", { results: Object.fromEntries(Object.entries(paceResults).map(([k, v]) => [k, slim(v)])), winningPace });

  // === Secondary feature ablation ===
  console.log("[phase4] Secondary feature comparison");
  const secondaryBlocks: CfbSecondaryFeatureBlock[] = ["PPA", "SUCCESS", "EXPLOSIVENESS"];
  const secondaryResults: Record<string, ReturnType<typeof runConfig>> = {};
  for (const block of secondaryBlocks) {
    secondaryResults[block] = runConfig(`secondary-${block}`, { ...BASE, hfa: winningHfa, pace: winningPace, secondary: [block] });
  }
  secondaryResults.ALL = runConfig("secondary-ALL", { ...BASE, hfa: winningHfa, pace: winningPace, secondary: secondaryBlocks });
  const secondaryCandidates = Object.entries(secondaryResults).filter(([k]) => k !== "NONE");
  const winningSecondaryLabel = secondaryCandidates.reduce((best, cur) =>
    cur[1].segments.overall.margin.mae !== null && (best[1].segments.overall.margin.mae === null || cur[1].segments.overall.margin.mae < best[1].segments.overall.margin.mae) ? cur : best,
  )[0];
  const winningSecondary: CfbSecondaryFeatureBlock[] = winningSecondaryLabel === "ALL" ? secondaryBlocks : [winningSecondaryLabel as CfbSecondaryFeatureBlock];
  console.log(`[phase4] Winning secondary block: ${winningSecondaryLabel}`);
  write("secondary-feature-comparison.json", {
    results: Object.fromEntries(Object.entries(secondaryResults).map(([k, v]) => [k, slim(v)])),
    winningSecondaryLabel,
  });

  // === Model B/C/D (Model A already run above) ===
  console.log("[phase4] Model B/C/D");
  const modelB = runConfig("modelB-strength-pace", { ...BASE, hfa: winningHfa, pace: winningPace });
  const modelC = runConfig("modelC-strength-secondary", { ...BASE, hfa: winningHfa, secondary: winningSecondary });
  const modelD = runConfig("modelD-strength-pace-secondary", { ...BASE, hfa: winningHfa, pace: winningPace, secondary: winningSecondary });

  const modelResults = [modelA, modelB, modelC, modelD];
  const winningModel = modelResults.reduce((best, cur) =>
    cur.segments.overall.margin.mae !== null && (best.segments.overall.margin.mae === null || cur.segments.overall.margin.mae < best.segments.overall.margin.mae) ? cur : best,
  );
  console.log(`[phase4] Winning model: ${winningModel.label}`);
  write("scoring-model-comparison.json", { models: modelResults.map(slim), winningModel: winningModel.label });

  // === Ridge λ / Prior K sensitivity grid (small, on the winning model's config) ===
  console.log("[phase4] Ridge lambda / Prior K sensitivity");
  const winningConfig: ScoringModelConfig =
    winningModel.label === "modelA-strength-only" ? BASE :
    winningModel.label === "modelB-strength-pace" ? { ...BASE, hfa: winningHfa, pace: winningPace } :
    winningModel.label === "modelC-strength-secondary" ? { ...BASE, hfa: winningHfa, secondary: winningSecondary } :
    { ...BASE, hfa: winningHfa, pace: winningPace, secondary: winningSecondary };

  const sensitivityResults: Array<{ ratingLambda: number; priorK: number; marginMae: number | null; totalMae: number | null }> = [];
  for (const ratingLambda of RIDGE_LAMBDA_SENSITIVITY_GRID) {
    for (const priorK of PRIOR_K_SENSITIVITY_GRID) {
      const run = runConfig(`sensitivity-lambda${ratingLambda}-K${priorK}`, { ...winningConfig, priorGamesWeight: priorK }, ratingLambda);
      sensitivityResults.push({ ratingLambda, priorK, marginMae: run.segments.overall.margin.mae, totalMae: run.segments.overall.total.mae });
    }
  }
  write("parameter-sensitivity.json", { grid: sensitivityResults, interpretation: "ratingLambda = Ridge+prior team-rating penalty (Phase 3's Ridge lambda); priorK = precision-weight (equivalent games) used for the scoring-environment BLENDED_CURRENT estimate — Ridge+prior itself has no native 'K' concept, so this is a deliberate, documented reinterpretation of Phase 3's K for the one remaining precision-weighted mechanism in Phase 4 (see final report Section 30)." });

  // === Residual diagnostics + extreme-score QA on the winning model ===
  console.log("[phase4] Residual diagnostics + extreme-score QA");
  const fbsOnlyWinning = winningModel.predictions.filter((p) => p.matchupPopulation === "fbs_vs_fbs");
  const residuals = {
    overall: computeResidualDiagnostics(fbsOnlyWinning),
    weeks1to4: computeResidualDiagnostics(fbsOnlyWinning.filter((p) => p.week >= 1 && p.week <= 4)),
    weeks5to8: computeResidualDiagnostics(fbsOnlyWinning.filter((p) => p.week >= 5 && p.week <= 8)),
    weeks9plus: computeResidualDiagnostics(fbsOnlyWinning.filter((p) => p.week >= 9)),
  };
  const extremeQa = auditExtremeScores(fbsOnlyWinning);
  write("residual-diagnostics.json", { residuals, extremeScoreQa: extremeQa });

  // === FBS-vs-FCS behavior (structural finding — see phase4WalkForwardCore.ts doc) ===
  const fcsCount = winningModel.predictions.filter((p) => p.matchupPopulation === "fbs_vs_fcs" || p.matchupPopulation === "fcs_vs_fbs").length;
  write("fbs-vs-fcs-note.json", {
    note: "Primary evaluation is FBS-vs-FBS only, matching the Phase 2/3 opponent-adjustment foundation which excludes FCS teams from the rating network entirely. FCS opponents have no computed offense/defense rating, so FBS-vs-FCS games cannot be scored by this architecture without fabricating an FCS rating — which Phase 3 explicitly rejected. FBS-vs-FCS games are therefore out of scope for this scoring model, not silently mismodeled.",
    fbsVsFcsGamesInRawGameSet: fcsCount,
  });

  // === Final recommendation artifact ===
  write("phase4-finalist.json", {
    generatedAt: new Date().toISOString(),
    winningModel: winningModel.label,
    winningHfa,
    winningPace,
    winningSecondaryLabel,
    config: winningConfig,
    overall: winningModel.segments.overall,
    weeks1to4: winningModel.segments.weeks1to4,
    weeks5to8: winningModel.segments.weeks5to8,
    weeks9plus: winningModel.segments.weeks9plus,
    bySeason: winningModel.segments.bySeason,
    elapsedMs: Date.now() - t0,
  });

  console.log(`[phase4] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error(`[phase4] FAILED: ${(error as Error).message}`);
  console.error(error);
  process.exitCode = 1;
});
