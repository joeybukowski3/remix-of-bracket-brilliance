/**
 * RESEARCH ONLY — weekly forward-validation summary + promotion-gate report
 * for the prospective 2026 JKB TD Score calibration study.
 *
 * Pure aggregation. Input rows are the append-only forward archive joined to
 * their (nullable) grades. No production model, artifact, or UI is touched;
 * `probabilityEdge*` and ROI outputs are descriptive research measures, NOT a
 * production "TD Edge", and the promotion gates are REPORTED, never enforced.
 */

import {
  calibrationBins,
  flatStakeRoi,
  round,
  summarizeProbabilities,
  wilsonInterval,
} from "./nfl-td-forward-metrics.mjs";

/** Probability series compared in every block. */
export const SERIES = Object.freeze({
  A_productionWindowCalibrated: "candidateCalibratedProbabilityProductionWindow",
  B_trailing8Calibrated: "candidateCalibratedProbabilityTrailing8",
  C_novigNoVig: "novigNoVigProbability",
  D_sportsbookRawImplied: "rawMarketImpliedProbability",
});

const EDGE_THRESHOLDS = [0, 0.02, 0.05, 0.075, 0.1];
const MIN_THRESHOLD_SAMPLE = 20;

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function seriesSummaries(rows) {
  const outcomes = rows.map((r) => r.actualTd);
  const out = {};
  for (const [label, field] of Object.entries(SERIES)) {
    out[label] = summarizeProbabilities(rows.map((r) => num(r[field])), outcomes);
  }
  return out;
}

/** One stratum: headline summaries for all four series + graded n. */
function stratum(rows) {
  const graded = rows.filter((r) => r.actualTd === 0 || r.actualTd === 1);
  return {
    n: rows.length,
    gradedN: graded.length,
    tdRate: graded.length ? round(graded.reduce((a, r) => a + r.actualTd, 0) / graded.length, 5) : null,
    series: seriesSummaries(graded),
  };
}

function bin(rows, predicate) {
  return stratum(rows.filter(predicate));
}

/**
 * Model-vs-market research: edge distributions + realized flat-stake ROI on the
 * best sportsbook price, by edge threshold. Positive edge ⇒ the candidate
 * (trailing8) probability exceeds the market ⇒ hypothetical "over" bet.
 */
function modelVsMarket(graded) {
  const withNovig = graded.filter(
    (r) => num(r.candidateCalibratedProbabilityTrailing8) != null && num(r.novigNoVigProbability) != null,
  );
  const withBook = graded.filter(
    (r) => num(r.candidateCalibratedProbabilityTrailing8) != null && num(r.rawMarketImpliedProbability) != null,
  );

  const edgeBlock = (rows, marketField) => {
    const withEdge = rows.map((r) => ({
      ...r,
      edge: num(r.candidateCalibratedProbabilityTrailing8) - num(r[marketField]),
    }));
    return EDGE_THRESHOLDS.map((t) => {
      const picked = withEdge.filter((r) => r.edge >= t && num(r.bestSportsbookOdds) != null);
      if (picked.length < MIN_THRESHOLD_SAMPLE) {
        return { threshold: t, n: picked.length, reported: false, note: `n<${MIN_THRESHOLD_SAMPLE} — not reported` };
      }
      const k = picked.reduce((a, r) => a + r.actualTd, 0);
      const roi = flatStakeRoi(picked.map((r) => ({ americanPrice: r.bestSportsbookOdds, actualTd: r.actualTd })));
      return {
        threshold: t,
        n: picked.length,
        reported: true,
        tdRate: round(k / picked.length, 4),
        meanEdge: round(picked.reduce((a, r) => a + r.edge, 0) / picked.length, 4),
        wilson95TdRate: wilsonInterval(k, picked.length),
        flatStakeRoi: roi,
      };
    });
  };

  return {
    note: "probabilityEdgeVsNovig = candidateTrailing8Probability - novigNoVigProbability; probabilityEdgeVsBook = candidateTrailing8Probability - rawMarketImpliedProbability. Descriptive research only — NOT a production TD Edge, NOT a betting recommendation.",
    vsNovig: { pairedN: withNovig.length, byThreshold: edgeBlock(withNovig, "novigNoVigProbability") },
    vsBook: { pairedN: withBook.length, byThreshold: edgeBlock(withBook, "rawMarketImpliedProbability") },
  };
}

/**
 * @param {object[]} rows  forward archive rows joined to grades (actualTd 0|1|null)
 * @param {{ calibratorVersion: string, historicalStudy?: { ece?: number, brier?: number, source?: string } }} opts
 */
export function buildForwardValidationSummary(rows, opts = {}) {
  const { calibratorVersion = null, historicalStudy = null } = opts;
  const graded = rows.filter((r) => r.actualTd === 0 || r.actualTd === 1);
  const completedWeeks = [...new Set(graded.map((r) => Number(r.week)).filter(Number.isFinite))].sort((a, b) => a - b);

  const overall = stratum(rows);
  const overallCalibration = {
    A_productionWindowCalibrated: calibrationBins(
      graded.map((r) => num(r[SERIES.A_productionWindowCalibrated])),
      graded.map((r) => r.actualTd),
    ),
    B_trailing8Calibrated: calibrationBins(
      graded.map((r) => num(r[SERIES.B_trailing8Calibrated])),
      graded.map((r) => r.actualTd),
    ),
    C_novigNoVig: calibrationBins(graded.map((r) => num(r[SERIES.C_novigNoVig])), graded.map((r) => r.actualTd)),
    D_sportsbookRawImplied: calibrationBins(
      graded.map((r) => num(r[SERIES.D_sportsbookRawImplied])),
      graded.map((r) => r.actualTd),
    ),
  };

  const candProb = (r) => num(r.candidateCalibratedProbabilityTrailing8);
  const strata = {
    weeks_2_4: bin(rows, (r) => Number(r.week) >= 2 && Number(r.week) <= 4),
    weeks_5_plus: bin(rows, (r) => Number(r.week) >= 5),
    teamChangers: bin(rows, (r) => r.teamChanged === true),
    nonTeamChangers: bin(rows, (r) => r.teamChanged === false),
    teamChangedUnknown: bin(rows, (r) => r.teamChanged == null),
    position_QB: bin(rows, (r) => r.position === "QB"),
    position_RB: bin(rows, (r) => r.position === "RB"),
    position_WR: bin(rows, (r) => r.position === "WR"),
    position_TE: bin(rows, (r) => r.position === "TE"),
    candidateProbabilityGt40: bin(rows, (r) => candProb(r) != null && candProb(r) > 0.4),
    candidateProbabilityGt50: bin(rows, (r) => candProb(r) != null && candProb(r) > 0.5),
  };

  const summary = {
    schemaVersion: "nfl-td-forward-validation-summary-v1",
    generatedAt: new Date().toISOString(),
    status: "RESEARCH ONLY — prospective validation of the candidate TD Score calibrator; nothing here is promoted to production.",
    calibratorVersion,
    historicalStudyBaseline: historicalStudy,
    coverage: {
      totalObservations: rows.length,
      gradedObservations: graded.length,
      completedWeeks,
      completedWeekCount: completedWeeks.length,
      gradedInCandidateProbabilityGt40: graded.filter((r) => candProb(r) != null && candProb(r) > 0.4).length,
      gradedInCandidateProbabilityGt50: graded.filter((r) => candProb(r) != null && candProb(r) > 0.5).length,
    },
    overall: {
      ...overall,
      seriesLegend: {
        A_productionWindowCalibrated: "candidate calibrated probability on the production-window JKB TD Score",
        B_trailing8Calibrated: "candidate calibrated probability on the trailing8 JKB TD Score",
        C_novigNoVig: "Novig two-sided line=0.5 no-vig P(over)",
        D_sportsbookRawImplied: "best approved-book Anytime TD raw (vig-inclusive) implied probability",
      },
    },
    calibrationByProbabilityBin: overallCalibration,
    strata,
    modelVsMarket: modelVsMarket(graded),
    promotionGates: evaluatePromotionGates({ overall, strata, completedWeeks, graded, candProb, historicalStudy }),
  };
  return summary;
}

const ECE_TOLERANCE = 0.02;
const TEAM_CHANGER_ECE_MAX_DELTA = 0.03;
const EARLY_SEASON_ECE_MAX_DELTA = 0.03;
const MIN_COMPLETED_WEEKS = 4;
const PREFERRED_COMPLETED_WEEKS = 6;
const MIN_GRADED_FAVORITE_REGION = 50;

/**
 * REPORTED review gates — never enforced, never auto-promoting. Each gate is
 * { pass: boolean|null, detail } where `null` means "not yet evaluable".
 */
export function evaluatePromotionGates(ctx) {
  const { overall, strata, completedWeeks, graded, candProb, historicalStudy } = ctx;
  const bEce = overall?.series?.B_trailing8Calibrated?.ece ?? null;
  const bMeanPred = overall?.series?.B_trailing8Calibrated?.meanPred ?? null;
  const bTdRate = overall?.series?.B_trailing8Calibrated?.tdRate ?? null;

  const weeksGate = {
    pass: completedWeeks.length >= MIN_COMPLETED_WEEKS,
    preferredMet: completedWeeks.length >= PREFERRED_COMPLETED_WEEKS,
    detail: `${completedWeeks.length} completed 2026 weeks (min ${MIN_COMPLETED_WEEKS}, preferred ${PREFERRED_COMPLETED_WEEKS}+)`,
  };

  const favN = graded.filter((r) => candProb(r) != null && candProb(r) > 0.4).length;
  const favoriteRegionGate = {
    pass: favN >= MIN_GRADED_FAVORITE_REGION,
    detail: `${favN} graded observations with candidate trailing8 probability > 0.40 (min ${MIN_GRADED_FAVORITE_REGION})`,
  };

  let calibrationStableGate = { pass: null, detail: "no graded observations yet" };
  if (bEce != null) {
    const histEce = historicalStudy?.ece ?? null;
    const eceDelta = histEce != null ? Math.abs(bEce - histEce) : null;
    const meanVsRate = bMeanPred != null && bTdRate != null ? Math.abs(bMeanPred - bTdRate) : null;
    calibrationStableGate = {
      pass:
        (histEce == null || eceDelta <= ECE_TOLERANCE) &&
        (meanVsRate == null || meanVsRate <= ECE_TOLERANCE),
      detail: `forward trailing8 ECE ${bEce}${histEce != null ? ` vs historical ${histEce} (Δ ${round(eceDelta, 4)})` : " (no historical baseline)"}; |meanPred-tdRate| ${round(meanVsRate, 4)}`,
    };
  }

  const tcEce = strata?.teamChangers?.series?.B_trailing8Calibrated?.ece ?? null;
  const tcN = strata?.teamChangers?.gradedN ?? 0;
  const nonTcEce = strata?.nonTeamChangers?.series?.B_trailing8Calibrated?.ece ?? null;
  let teamChangerGate = { pass: null, detail: `team-changer graded n=${tcN} — insufficient to evaluate` };
  if (tcEce != null && nonTcEce != null && tcN >= 20) {
    teamChangerGate = {
      pass: tcEce - nonTcEce <= TEAM_CHANGER_ECE_MAX_DELTA,
      detail: `team-changer trailing8 ECE ${tcEce} vs non-changer ${nonTcEce} (Δ ${round(tcEce - nonTcEce, 4)}, max ${TEAM_CHANGER_ECE_MAX_DELTA})`,
    };
  }

  const earlyEce = strata?.weeks_2_4?.series?.B_trailing8Calibrated?.ece ?? null;
  const lateEce = strata?.weeks_5_plus?.series?.B_trailing8Calibrated?.ece ?? null;
  let earlySeasonDriftGate = { pass: null, detail: "weeks 2-4 and/or 5+ not both graded yet" };
  if (earlyEce != null && lateEce != null) {
    earlySeasonDriftGate = {
      pass: earlyEce - lateEce <= EARLY_SEASON_ECE_MAX_DELTA,
      detail: `weeks 2-4 trailing8 ECE ${earlyEce} vs weeks 5+ ${lateEce} (Δ ${round(earlyEce - lateEce, 4)}, max ${EARLY_SEASON_ECE_MAX_DELTA})`,
    };
  }

  const gates = {
    minimumCompletedWeeks: weeksGate,
    gradedFavoriteRegionDepth: favoriteRegionGate,
    calibrationStableVsHistorical: calibrationStableGate,
    noMaterialTeamChangerDegradation: teamChangerGate,
    noMajorEarlySeasonDrift: earlySeasonDriftGate,
  };
  const values = Object.values(gates).map((g) => g.pass);
  return {
    autoPromote: false,
    autoPromoteNote:
      "Promotion is a manual review decision. These gates are informational; no script in this repo promotes a model, exposes JKB TD Probability / Fair Odds / TD Edge, or changes production selection.",
    allGatesPass: values.every((v) => v === true),
    anyGateFails: values.some((v) => v === false),
    gatesNotYetEvaluable: values.filter((v) => v === null).length,
    gates,
  };
}
