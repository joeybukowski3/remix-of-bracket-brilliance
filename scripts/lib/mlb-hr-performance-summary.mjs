/**
 * mlb-hr-performance-summary.mjs
 *
 * Builds a compact performance summary from graded archive records,
 * broken out by HR Quality Score band, confidence, lineup status, model version.
 *
 * IMPORTANT: these are empirical outcome rates from the graded sample,
 * NOT a claim that HR Quality Score is a calibrated probability.
 */

export const SCORE_BANDS = [
  { label: "80+", min: 80, max: Infinity },
  { label: "70-79.9", min: 70, max: 79.9 },
  { label: "60-69.9", min: 60, max: 69.9 },
  { label: "50-59.9", min: 50, max: 59.9 },
  { label: "Below 50", min: -Infinity, max: 49.9 },
];

function bandFor(score, bands) {
  if (score == null) return null;
  return bands.find((b) => score >= b.min && score <= b.max)?.label ?? null;
}

function americanOddsToImplied(odds) {
  const n = parseFloat(String(odds ?? "").replace("+", ""));
  if (!Number.isFinite(n)) return null;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}

function flatBetPayout(odds, isHit) {
  const n = parseFloat(String(odds ?? "").replace("+", ""));
  if (!Number.isFinite(n)) return null;
  if (!isHit) return -100;
  return n > 0 ? n : (100 * 100) / -n;
}

export function buildPerformanceSummary(records) {
  const eligible = records.filter((r) => r.result?.status === "hit" || r.result?.status === "miss");

  function summarizeGroup(groupRecords) {
    const predictions = groupRecords.length;
    const hits = groupRecords.filter((r) => r.result.status === "hit").length;
    const actualHrRate = predictions > 0 ? Math.round((hits / predictions) * 1000) / 10 : null;

    const withOdds = groupRecords.filter((r) => r.hrOddsYes != null);
    const avgImplied = withOdds.length
      ? Math.round((withOdds.reduce((sum, r) => sum + (r.marketImpliedProbability ?? americanOddsToImplied(r.hrOddsYes) ?? 0), 0) / withOdds.length) * 1000) / 10
      : null;
    const avgOddsNumeric = withOdds.length
      ? Math.round(withOdds.reduce((sum, r) => sum + (parseFloat(String(r.hrOddsYes).replace("+", "")) || 0), 0) / withOdds.length)
      : null;

    let flatBetRoi = null;
    if (withOdds.length > 0) {
      const totalPayout = withOdds.reduce((sum, r) => sum + (flatBetPayout(r.hrOddsYes, r.result.status === "hit") ?? 0), 0);
      const totalStaked = withOdds.length * 100;
      flatBetRoi = Math.round((totalPayout / totalStaked) * 1000) / 10;
    }

    return {
      predictions,
      eligibleGraded: predictions,
      hrHits: hits,
      actualHrRate,
      avgMarketImpliedProbability: avgImplied,
      avgOdds: avgOddsNumeric,
      flatBetRoi: withOdds.length > 0 ? flatBetRoi : null,
      calibrationDifference: null,
      sampleSize: predictions,
    };
  }

  const byScoreBand = {};
  for (const band of SCORE_BANDS) {
    const group = eligible.filter((r) => bandFor(r.hrQualityScore, SCORE_BANDS) === band.label);
    byScoreBand[band.label] = summarizeGroup(group);
  }

  const byConfidence = {};
  for (const level of ["high", "medium", "low", "incomplete"]) {
    const group = eligible.filter((r) => r.confidenceLevel === level);
    byConfidence[level] = summarizeGroup(group);
  }

  const byLineupStatus = {
    confirmed: summarizeGroup(eligible.filter((r) => r.lineupStatus === "confirmed")),
    unconfirmed: summarizeGroup(eligible.filter((r) => r.lineupStatus !== "confirmed")),
  };

  const byModelVersion = {};
  for (const version of new Set(eligible.map((r) => r.modelVersion))) {
    byModelVersion[version] = summarizeGroup(eligible.filter((r) => r.modelVersion === version));
  }

  return {
    generatedAt: new Date().toISOString(),
    note: "Score-band results are empirical outcome rates from graded historical predictions. HR Quality Score is a ranking score, not a calibrated probability — these rates describe what happened, not a validated forecast.",
    totalGradedRecords: eligible.length,
    byScoreBand,
    byConfidenceLevel: byConfidence,
    byLineupStatus,
    byModelVersion,
  };
}
