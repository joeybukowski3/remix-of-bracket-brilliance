/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v1
 *
 * Reads data/mlb/k-research/high-line-calibration/pregame-archive.json and
 * emits the calibration study artifacts. Touches no production math.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
  americanToImpliedProbability,
  bootstrapMeanCi,
  correlation,
  decomposeWorkloadError,
  filterLeakageSafe,
  gradeDirection,
  linearRegression,
  lineBucket,
  LINE_BUCKETS,
  mean,
  median,
  projectionDirection,
  quantile,
  rmse,
  stdev,
  windowAverage,
  windowKRate,
} from "./lib/mlb-k-research-helpers.mjs";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "data", "mlb", "k-research", "high-line-calibration");
mkdirSync(DIR, { recursive: true });

const archive = JSON.parse(readFileSync(path.join(DIR, "pregame-archive.json"), "utf8"));
const rows = filterLeakageSafe(archive.rows);

const round = (value, digits = 4) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits;

// ---------- derive per-row research fields ----------
for (const row of rows) {
  row.bucket = lineBucket(row.kLine);
  row.v2Direction = projectionDirection(row.v2ProjectedKs, row.kLine);
  row.legacyDirection = projectionDirection(row.legacyProjectedKs, row.kLine);
  row.v2Grade = gradeDirection(row.v2Direction, row.actualKs, row.kLine);
  row.legacyGrade = gradeDirection(row.legacyDirection, row.actualKs, row.kLine);
  row.v2ProjMinusLine = row.v2ProjectedKs - row.kLine;
  row.legacyProjMinusLine =
    row.legacyProjectedKs == null ? null : row.legacyProjectedKs - row.kLine;
  row.v2SignedError = row.v2ProjectedKs - row.actualKs; // positive = over-projected
  row.legacySignedError =
    row.legacyProjectedKs == null ? null : row.legacyProjectedKs - row.actualKs;
  row.marketResidual = row.actualKs - row.v2ProjectedKs;
  row.lineMinusProjection = row.kLine - row.v2ProjectedKs;
  row.overImpliedProb = americanToImpliedProbability(row.oddsOver);
  row.actualKRate =
    row.actualBF != null && row.actualBF > 0 ? row.actualKs / row.actualBF : null;
  row.ipError =
    row.actualIP != null && row.v2ProjectedInnings != null
      ? row.v2ProjectedInnings - row.actualIP
      : null;
  row.bfError =
    row.actualBF != null && row.v2ProjectedBF != null ? row.v2ProjectedBF - row.actualBF : null;
  row.decomposition = decomposeWorkloadError({
    projectedKRate: row.v2ProjectedKRate,
    projectedBF: row.v2ProjectedBF,
    actualKs: row.actualKs,
    actualBF: row.actualBF,
  });
  // Pregame-known recent-form windows, rebuilt from the archived start logs.
  row.last3KRate = windowKRate(row.recentStarts, 3);
  row.last5KRate = windowKRate(row.recentStarts, 5);
  row.last3Ip = windowAverage(row.recentStarts, 3, "ip");
  row.last5Ip = windowAverage(row.recentStarts, 5, "ip");
  row.last3Bf = windowAverage(row.recentStarts, 3, "bf");
  row.last5Bf = windowAverage(row.recentStarts, 5, "bf");
  row.last3Pitches = windowAverage(row.recentStarts, 3, "pc");
  row.last5Pitches = windowAverage(row.recentStarts, 5, "pc");
  row.last5K = windowAverage(row.recentStarts, 5, "k");
  // Season K% arrives in percent form in the archived inputs; normalise.
  row.seasonKRateDecimal =
    row.inSeasonKRate == null ? null : row.inSeasonKRate > 1.5 ? row.inSeasonKRate / 100 : row.inSeasonKRate;
  row.recentMinusSeasonPts =
    row.last5KRate != null && row.seasonKRateDecimal != null
      ? (row.last5KRate - row.seasonKRateDecimal) * 100
      : null;
}

function tally(list, accessor) {
  const out = { WIN: 0, LOSS: 0, PUSH: 0 };
  for (const row of list) {
    const grade = accessor(row);
    if (grade && out[grade] !== undefined) out[grade] += 1;
  }
  const decided = out.WIN + out.LOSS;
  return { ...out, decided, hitRate: decided > 0 ? round((out.WIN / decided) * 100, 2) : null };
}

function describe(list) {
  const dates = [...new Set(list.map((row) => row.slateDate))].sort();
  const overRows = list.filter((row) => row.v2Direction === "over");
  const underRows = list.filter((row) => row.v2Direction === "under");
  const neutralRows = list.filter((row) => row.v2Direction === "neutral");
  const projMinusLine = list.map((row) => row.v2ProjMinusLine);
  const signedError = list.map((row) => row.v2SignedError);
  return {
    n: list.length,
    dateRange: dates.length ? `${dates[0]}..${dates[dates.length - 1]}` : null,
    meanJkbProjection: round(mean(list.map((row) => row.v2ProjectedKs)), 3),
    meanLegacyProjection: round(mean(list.map((row) => row.legacyProjectedKs)), 3),
    meanMarketLine: round(mean(list.map((row) => row.kLine)), 3),
    meanActualKs: round(mean(list.map((row) => row.actualKs)), 3),
    meanProjMinusLine: round(mean(projMinusLine), 3),
    medianProjMinusLine: round(median(projMinusLine), 3),
    pctJkbOver: round((overRows.length / (list.length || 1)) * 100, 2),
    pctJkbUnder: round((underRows.length / (list.length || 1)) * 100, 2),
    pctJkbNeutral: round((neutralRows.length / (list.length || 1)) * 100, 2),
    mae: round(mean(signedError.map(Math.abs)), 3),
    medianAbsError: round(median(signedError.map(Math.abs)), 3),
    rmse: round(rmse(signedError), 3),
    meanSignedError: round(mean(signedError), 3),
    signedErrorCi: (() => {
      const ci = bootstrapMeanCi(signedError);
      return ci ? { lower: round(ci.lower, 3), upper: round(ci.upper, 3) } : null;
    })(),
    pctActualOverLine: round(
      (list.filter((row) => row.actualKs > row.kLine).length / (list.length || 1)) * 100,
      2,
    ),
    overSignal: tally(overRows, (row) => row.v2Grade),
    underSignal: tally(underRows, (row) => row.v2Grade),
    allSignal: tally(list, (row) => row.v2Grade),
    legacyAllSignal: tally(list, (row) => row.legacyGrade),
  };
}

// ---------- 4 / 5: line buckets and structural bias ----------
const bucketRows = new Map(LINE_BUCKETS.map((bucket) => [bucket.key, []]));
for (const row of rows) if (bucketRows.has(row.bucket)) bucketRows.get(row.bucket).push(row);

const lineBucketTable = [...bucketRows.entries()]
  .filter(([, list]) => list.length > 0)
  .map(([key, list]) => ({ bucket: key, ...describe(list) }));

const exactLineTable = [...new Set(rows.map((row) => row.kLine))]
  .sort((a, b) => a - b)
  .map((line) => {
    const list = rows.filter((row) => row.kLine === line);
    return { line, ...describe(list) };
  });

const biasTests = {
  corrLineVsProjMinusLine: round(
    correlation(rows.map((row) => [row.kLine, row.v2ProjMinusLine])),
    4,
  ),
  regProjMinusLineOnLine: (() => {
    const fit = linearRegression(rows.map((row) => [row.kLine, row.v2ProjMinusLine]));
    return fit
      ? { n: fit.n, slope: round(fit.slope, 4), intercept: round(fit.intercept, 4), slopeStdError: round(fit.slopeStdError, 4), tStat: round(fit.tStat, 2), r: round(fit.r, 4) }
      : null;
  })(),
  regSignedErrorOnLine: (() => {
    const fit = linearRegression(rows.map((row) => [row.kLine, row.v2SignedError]));
    return fit
      ? { n: fit.n, slope: round(fit.slope, 4), intercept: round(fit.intercept, 4), slopeStdError: round(fit.slopeStdError, 4), tStat: round(fit.tStat, 2), r: round(fit.r, 4) }
      : null;
  })(),
  regLegacySignedErrorOnLine: (() => {
    const withLegacy = rows.filter((row) => row.legacySignedError != null);
    const fit = linearRegression(withLegacy.map((row) => [row.kLine, row.legacySignedError]));
    return fit
      ? { n: fit.n, slope: round(fit.slope, 4), intercept: round(fit.intercept, 4), tStat: round(fit.tStat, 2) }
      : null;
  })(),
  regActualOnLine: (() => {
    const fit = linearRegression(rows.map((row) => [row.kLine, row.actualKs]));
    return fit ? { n: fit.n, slope: round(fit.slope, 4), intercept: round(fit.intercept, 4), r: round(fit.r, 4) } : null;
  })(),
  regProjectionOnLine: (() => {
    const fit = linearRegression(rows.map((row) => [row.kLine, row.v2ProjectedKs]));
    return fit ? { n: fit.n, slope: round(fit.slope, 4), intercept: round(fit.intercept, 4), r: round(fit.r, 4) } : null;
  })(),
};

// ---------- 6: workload decomposition ----------
const decomposed = rows.filter((row) => row.decomposition);
const workloadByBucket = [...bucketRows.entries()]
  .filter(([, list]) => list.some((row) => row.decomposition))
  .map(([key, list]) => {
    const usable = list.filter((row) => row.decomposition);
    const workload = usable.map((row) => row.decomposition.workloadError);
    const kRate = usable.map((row) => row.decomposition.kRateError);
    const total = usable.map((row) => row.decomposition.totalError);
    const workloadShare = mean(workload) !== null && mean(total) !== null && Math.abs(mean(total)) > 1e-9
      ? mean(workload) / mean(total)
      : null;
    return {
      bucket: key,
      n: usable.length,
      bfCoveragePct: round((usable.length / list.length) * 100, 1),
      meanTotalError: round(mean(total), 3),
      meanWorkloadError: round(mean(workload), 3),
      meanKRateError: round(mean(kRate), 3),
      workloadShareOfError: round(workloadShare, 3),
      meanProjectedBF: round(mean(usable.map((row) => row.v2ProjectedBF)), 2),
      meanActualBF: round(mean(usable.map((row) => row.actualBF)), 2),
      meanProjectedIP: round(mean(usable.map((row) => row.v2ProjectedInnings)), 2),
      meanActualIP: round(mean(usable.map((row) => row.actualIP)), 2),
      meanProjectedKRate: round(mean(usable.map((row) => row.v2ProjectedKRate)), 4),
      meanActualKRate: round(mean(usable.map((row) => row.actualKRate)), 4),
      workloadCiLower: round(bootstrapMeanCi(workload)?.lower, 3),
      workloadCiUpper: round(bootstrapMeanCi(workload)?.upper, 3),
      kRateCiLower: round(bootstrapMeanCi(kRate)?.lower, 3),
      kRateCiUpper: round(bootstrapMeanCi(kRate)?.upper, 3),
    };
  });

// ---------- 7: high-line pitcher profile ----------
function profile(list) {
  return {
    n: list.length,
    meanSeasonKRate: round(mean(list.map((row) => row.seasonKRateDecimal)), 4),
    meanLast5KRate: round(mean(list.map((row) => row.last5KRate)), 4),
    meanWhiffRate: round(mean(list.map((row) => row.inSeasonWhiffRate)), 3),
    meanProjectedIP: round(mean(list.map((row) => row.v2ProjectedInnings)), 3),
    meanActualIP: round(mean(list.map((row) => row.actualIP)), 3),
    meanLast5Ip: round(mean(list.map((row) => row.last5Ip)), 3),
    meanLast5Pitches: round(mean(list.map((row) => row.last5Pitches)), 2),
    meanProjectedBF: round(mean(list.map((row) => row.v2ProjectedBF)), 2),
    meanActualBF: round(mean(list.map((row) => row.actualBF)), 2),
    meanPitcherSkillRate: round(mean(list.map((row) => row.v2PitcherSkillRate)), 4),
    meanPitcherSkillShrunk: round(mean(list.map((row) => row.v2PitcherSkillRateShrunk)), 4),
    meanShrinkageCostKs: round(
      mean(
        list.map((row) =>
          row.v2PitcherSkillRate != null && row.v2PitcherSkillRateShrunk != null && row.v2ProjectedBF != null
            ? (row.v2PitcherSkillRate - row.v2PitcherSkillRateShrunk) * row.v2ProjectedBF
            : null,
        ),
      ),
      3,
    ),
    meanProjectedKRate: round(mean(list.map((row) => row.v2ProjectedKRate)), 4),
    meanActualKRate: round(mean(list.map((row) => row.actualKRate)), 4),
    meanOpponentEnvRate: round(mean(list.map((row) => row.v2OpponentEnvRate)), 4),
    meanMatchupAdjustment: round(mean(list.map((row) => row.v2MatchupAdjustment)), 4),
    pctMatchupClamped: round(
      (list.filter((row) => row.v2MatchupAdjustment != null && Math.abs(Math.abs(row.v2MatchupAdjustment) - 0.035) < 1e-6).length /
        (list.length || 1)) * 100,
      1,
    ),
    meanSignedError: round(mean(list.map((row) => row.v2SignedError)), 3),
  };
}

const highLineRows = rows.filter((row) => row.kLine >= 7.5);
const lowLineRows = rows.filter((row) => row.kLine < 7.5);
const highLineProfile = { highLine: profile(highLineRows), lowerLine: profile(lowLineRows) };

// ---------- 8: recent-form predictive value ----------
const recentForm = {
  note: "Forward predictive correlation of pregame windows against the next-start outcome.",
  vsActualKs: {
    seasonKRate: round(correlation(rows.map((row) => [row.seasonKRateDecimal, row.actualKs])), 4),
    last3KRate: round(correlation(rows.map((row) => [row.last3KRate, row.actualKs])), 4),
    last5KRate: round(correlation(rows.map((row) => [row.last5KRate, row.actualKs])), 4),
    modelPitcherSkillRate: round(correlation(rows.map((row) => [row.v2PitcherSkillRate, row.actualKs])), 4),
  },
  vsActualKRate: {
    seasonKRate: round(correlation(rows.map((row) => [row.seasonKRateDecimal, row.actualKRate])), 4),
    last3KRate: round(correlation(rows.map((row) => [row.last3KRate, row.actualKRate])), 4),
    last5KRate: round(correlation(rows.map((row) => [row.last5KRate, row.actualKRate])), 4),
    modelPitcherSkillRate: round(correlation(rows.map((row) => [row.v2PitcherSkillRate, row.actualKRate])), 4),
  },
  vsActualBF: {
    last3Bf: round(correlation(rows.map((row) => [row.last3Bf, row.actualBF])), 4),
    last5Bf: round(correlation(rows.map((row) => [row.last5Bf, row.actualBF])), 4),
    last3Pitches: round(correlation(rows.map((row) => [row.last3Pitches, row.actualBF])), 4),
    last5Pitches: round(correlation(rows.map((row) => [row.last5Pitches, row.actualBF])), 4),
    modelProjectedBF: round(correlation(rows.map((row) => [row.v2ProjectedBF, row.actualBF])), 4),
  },
  vsActualIP: {
    last3Ip: round(correlation(rows.map((row) => [row.last3Ip, row.actualIP])), 4),
    last5Ip: round(correlation(rows.map((row) => [row.last5Ip, row.actualIP])), 4),
    last5Pitches: round(correlation(rows.map((row) => [row.last5Pitches, row.actualIP])), 4),
    modelProjectedIP: round(correlation(rows.map((row) => [row.v2ProjectedInnings, row.actualIP])), 4),
  },
  highLineOnly: {
    n: highLineRows.length,
    last3KRateVsActualKRate: round(correlation(highLineRows.map((row) => [row.last3KRate, row.actualKRate])), 4),
    last5KRateVsActualKRate: round(correlation(highLineRows.map((row) => [row.last5KRate, row.actualKRate])), 4),
    seasonKRateVsActualKRate: round(correlation(highLineRows.map((row) => [row.seasonKRateDecimal, row.actualKRate])), 4),
    last5IpVsActualIp: round(correlation(highLineRows.map((row) => [row.last5Ip, row.actualIP])), 4),
  },
};

// ---------- 9: opponent windows ----------
const opponentWindows = {
  note: "Predictive value of each archived opponent K signal for the opposing starter outcome.",
  vsActualKRate: {
    opponentSeasonKRate: round(correlation(rows.map((row) => [row.inOppSeasonKRate, row.actualKRate])), 4),
    opponentRecentKRateRaw: round(correlation(rows.map((row) => [row.inOppRecentKRate, row.actualKRate])), 4),
    opponentLineupKRate: round(correlation(rows.map((row) => [row.inOppLineupKRate, row.actualKRate])), 4),
    modelBlendedOpponentEnv: round(correlation(rows.map((row) => [row.v2OpponentEnvRate, row.actualKRate])), 4),
  },
  vsActualKs: {
    opponentSeasonKRate: round(correlation(rows.map((row) => [row.inOppSeasonKRate, row.actualKs])), 4),
    opponentRecentKRateRaw: round(correlation(rows.map((row) => [row.inOppRecentKRate, row.actualKs])), 4),
    opponentLineupKRate: round(correlation(rows.map((row) => [row.inOppLineupKRate, row.actualKs])), 4),
    modelBlendedOpponentEnv: round(correlation(rows.map((row) => [row.v2OpponentEnvRate, row.actualKs])), 4),
  },
  coverage: {
    opponentSeasonKRate: rows.filter((row) => row.inOppSeasonKRate != null).length,
    opponentRecentKRate: rows.filter((row) => row.inOppRecentKRate != null).length,
    opponentLineupKRate: rows.filter((row) => row.inOppLineupKRate != null).length,
    opponentVsHandKRate: rows.filter((row) => row.inOppVsLhpKRate != null || row.inOppVsRhpKRate != null).length,
    total: rows.length,
  },
  recentVsSeasonSpread: {
    sdOpponentSeasonKRate: round(stdev(rows.map((row) => row.inOppSeasonKRate)), 4),
    sdOpponentRecentKRateRaw: round(stdev(rows.map((row) => row.inOppRecentKRate)), 4),
    sdModelBlendedOpponentEnv: round(stdev(rows.map((row) => row.v2OpponentEnvRate)), 4),
    sdMatchupAdjustment: round(stdev(rows.map((row) => row.v2MatchupAdjustment)), 4),
  },
};

// ---------- 10: market information diagnostic ----------
const marketDiagnostic = {
  corrResidualVsLine: round(correlation(rows.map((row) => [row.kLine, row.marketResidual])), 4),
  corrResidualVsLineMinusProjection: round(
    correlation(rows.map((row) => [row.lineMinusProjection, row.marketResidual])),
    4,
  ),
  corrResidualVsOverImpliedProb: round(
    correlation(rows.map((row) => [row.overImpliedProb, row.marketResidual])),
    4,
  ),
  regResidualOnLine: (() => {
    const fit = linearRegression(rows.map((row) => [row.kLine, row.marketResidual]));
    return fit ? { n: fit.n, slope: round(fit.slope, 4), intercept: round(fit.intercept, 4), slopeStdError: round(fit.slopeStdError, 4), tStat: round(fit.tStat, 2) } : null;
  })(),
  regResidualOnLineMinusProjection: (() => {
    const fit = linearRegression(rows.map((row) => [row.lineMinusProjection, row.marketResidual]));
    return fit ? { n: fit.n, slope: round(fit.slope, 4), intercept: round(fit.intercept, 4), tStat: round(fit.tStat, 2) } : null;
  })(),
  meanResidualByBucket: lineBucketTable.map((bucket) => ({
    bucket: bucket.bucket,
    n: bucket.n,
    meanResidual: round(-1 * bucket.meanSignedError, 3),
  })),
  highLineIndicator: (() => {
    const high = highLineRows.map((row) => row.marketResidual);
    const low = lowLineRows.map((row) => row.marketResidual);
    const highCi = bootstrapMeanCi(high);
    const lowCi = bootstrapMeanCi(low);
    return {
      highLineN: high.length,
      highLineMeanResidual: round(mean(high), 3),
      highLineCi: highCi ? [round(highCi.lower, 3), round(highCi.upper, 3)] : null,
      lowerLineN: low.length,
      lowerLineMeanResidual: round(mean(low), 3),
      lowerLineCi: lowCi ? [round(lowCi.lower, 3), round(lowCi.upper, 3)] : null,
    };
  })(),
  marketCalibration: {
    note: "How often the market line itself was beaten, by bucket -- a fair line lands near 50%.",
    byBucket: lineBucketTable.map((bucket) => ({ bucket: bucket.bucket, n: bucket.n, pctActualOverLine: bucket.pctActualOverLine })),
  },
};

// ---------- 11: legacy vs v2 ----------
const legacyVsV2 = [...bucketRows.entries()]
  .filter(([, list]) => list.length > 0)
  .map(([key, list]) => {
    const withLegacy = list.filter((row) => row.legacyProjectedKs != null);
    return {
      bucket: key,
      n: list.length,
      nWithLegacy: withLegacy.length,
      meanLine: round(mean(list.map((row) => row.kLine)), 3),
      meanActual: round(mean(list.map((row) => row.actualKs)), 3),
      meanV2: round(mean(list.map((row) => row.v2ProjectedKs)), 3),
      meanLegacy: round(mean(withLegacy.map((row) => row.legacyProjectedKs)), 3),
      meanWorkloadOnlyProxy: null,
      v2SignedError: round(mean(list.map((row) => row.v2SignedError)), 3),
      legacySignedError: round(mean(withLegacy.map((row) => row.legacySignedError)), 3),
      v2Mae: round(mean(list.map((row) => Math.abs(row.v2SignedError))), 3),
      legacyMae: round(mean(withLegacy.map((row) => Math.abs(row.legacySignedError))), 3),
      v2PctUnder: round((list.filter((row) => row.v2Direction === "under").length / (list.length || 1)) * 100, 1),
      legacyPctUnder: round(
        (withLegacy.filter((row) => row.legacyDirection === "under").length / (withLegacy.length || 1)) * 100,
        1,
      ),
      v2Hit: tally(list, (row) => row.v2Grade).hitRate,
      legacyHit: tally(withLegacy, (row) => row.legacyGrade).hitRate,
    };
  });

// ---------- 12: diagnostic slices ----------
function slice(label, predicate) {
  const list = rows.filter(predicate);
  return { slice: label, ...describe(list) };
}

const qSeasonK = quantile(rows.map((row) => row.seasonKRateDecimal), 0.75);
const qWhiff = quantile(rows.map((row) => row.inSeasonWhiffRate), 0.75);
const oppHigh = quantile(rows.map((row) => row.v2OpponentEnvRate), 0.67);
const oppLow = quantile(rows.map((row) => row.v2OpponentEnvRate), 0.33);

const diagnosticSlices = [
  slice("line<=4.5", (row) => row.kLine <= 4.5),
  slice("line=5.5", (row) => row.kLine === 5.5),
  slice("line=6.5", (row) => row.kLine === 6.5),
  slice("line>=7.5", (row) => row.kLine >= 7.5),
  slice("pitcher: top-quartile season K%", (row) => row.seasonKRateDecimal != null && row.seasonKRateDecimal >= qSeasonK),
  slice("pitcher: top-quartile whiff%", (row) => row.inSeasonWhiffRate != null && row.inSeasonWhiffRate >= qWhiff),
  slice("pitcher: recent K% above season", (row) => row.recentMinusSeasonPts != null && row.recentMinusSeasonPts > 0),
  slice("pitcher: recent K% below season", (row) => row.recentMinusSeasonPts != null && row.recentMinusSeasonPts < 0),
  slice("workload: projected IP <5", (row) => row.v2ProjectedInnings != null && row.v2ProjectedInnings < 5),
  slice("workload: projected IP 5-5.49", (row) => row.v2ProjectedInnings >= 5 && row.v2ProjectedInnings < 5.5),
  slice("workload: projected IP 5.5-5.99", (row) => row.v2ProjectedInnings >= 5.5 && row.v2ProjectedInnings < 6),
  slice("workload: projected IP 6+", (row) => row.v2ProjectedInnings >= 6),
  slice("opponent: high K environment", (row) => row.v2OpponentEnvRate != null && row.v2OpponentEnvRate >= oppHigh),
  slice("opponent: neutral K environment", (row) => row.v2OpponentEnvRate != null && row.v2OpponentEnvRate > oppLow && row.v2OpponentEnvRate < oppHigh),
  slice("opponent: low K environment", (row) => row.v2OpponentEnvRate != null && row.v2OpponentEnvRate <= oppLow),
  slice("recency: last5 K% >= season +3pts", (row) => row.recentMinusSeasonPts != null && row.recentMinusSeasonPts >= 3),
  slice("recency: last5 K% within +/-3pts", (row) => row.recentMinusSeasonPts != null && Math.abs(row.recentMinusSeasonPts) < 3),
  slice("recency: last5 K% <= season -3pts", (row) => row.recentMinusSeasonPts != null && row.recentMinusSeasonPts <= -3),
];

// ---------- 13: upper-tail compression ----------
const established = rows.filter((row) => row.recentStartsN >= 4);
function tail(list, accessor, label) {
  const values = list.map(accessor);
  return {
    series: label,
    n: values.filter((value) => value != null).length,
    mean: round(mean(values), 3),
    sd: round(stdev(values), 3),
    p75: round(quantile(values, 0.75), 3),
    p90: round(quantile(values, 0.9), 3),
    p95: round(quantile(values, 0.95), 3),
    max: round(Math.max(...values.filter((value) => value != null)), 3),
    pctAtLeast7: round((values.filter((value) => value != null && value >= 7).length / (values.filter((value) => value != null).length || 1)) * 100, 2),
    pctAtLeast8: round((values.filter((value) => value != null && value >= 8).length / (values.filter((value) => value != null).length || 1)) * 100, 2),
    pctAtLeast9: round((values.filter((value) => value != null && value >= 9).length / (values.filter((value) => value != null).length || 1)) * 100, 2),
  };
}

const upperTail = {
  all: [
    tail(rows, (row) => row.v2ProjectedKs, "JKB v2 projected Ks"),
    tail(rows, (row) => row.legacyProjectedKs, "JKB legacy projected Ks"),
    tail(rows, (row) => row.kLine, "Market line"),
    tail(rows, (row) => row.actualKs, "Actual Ks"),
  ],
  establishedStarters: [
    tail(established, (row) => row.v2ProjectedKs, "JKB v2 projected Ks"),
    tail(established, (row) => row.kLine, "Market line"),
    tail(established, (row) => row.actualKs, "Actual Ks"),
  ],
  varianceRatios: {
    v2SdOverActualSd: round(stdev(rows.map((row) => row.v2ProjectedKs)) / stdev(rows.map((row) => row.actualKs)), 3),
    v2SdOverLineSd: round(stdev(rows.map((row) => row.v2ProjectedKs)) / stdev(rows.map((row) => row.kLine)), 3),
    legacySdOverActualSd: round(stdev(rows.map((row) => row.legacyProjectedKs)) / stdev(rows.map((row) => row.actualKs)), 3),
    lineSdOverActualSd: round(stdev(rows.map((row) => row.kLine)) / stdev(rows.map((row) => row.actualKs)), 3),
  },
  kRateSpread: {
    sdPitcherSkillRate: round(stdev(rows.map((row) => row.v2PitcherSkillRate)), 4),
    sdPitcherSkillRateShrunk: round(stdev(rows.map((row) => row.v2PitcherSkillRateShrunk)), 4),
    sdProjectedKRate: round(stdev(rows.map((row) => row.v2ProjectedKRate)), 4),
    sdActualKRate: round(stdev(rows.map((row) => row.actualKRate)), 4),
    sdProjectedBF: round(stdev(rows.map((row) => row.v2ProjectedBF)), 3),
    sdActualBF: round(stdev(rows.map((row) => row.actualBF)), 3),
  },
};

// ---------- 14: outcome calibration by projected band ----------
const bands = [
  { key: "<3", min: -Infinity, max: 3 },
  { key: "3-3.9", min: 3, max: 4 },
  { key: "4-4.9", min: 4, max: 5 },
  { key: "5-5.9", min: 5, max: 6 },
  { key: "6-6.9", min: 6, max: 7 },
  { key: "7-7.9", min: 7, max: 8 },
  { key: "8+", min: 8, max: Infinity },
];

const outcomeCalibration = bands.map((band) => {
  const list = rows.filter((row) => row.v2ProjectedKs >= band.min && row.v2ProjectedKs < band.max);
  return {
    band: band.key,
    n: list.length,
    meanProjectedKs: round(mean(list.map((row) => row.v2ProjectedKs)), 3),
    meanActualKs: round(mean(list.map((row) => row.actualKs)), 3),
    meanLine: round(mean(list.map((row) => row.kLine)), 3),
    meanSignedError: round(mean(list.map((row) => row.v2SignedError)), 3),
    mae: round(mean(list.map((row) => Math.abs(row.v2SignedError))), 3),
  };
});

// ---------- write artifacts ----------
function toCsv(records) {
  if (!records.length) return "";
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const cell = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value).replaceAll('"', '""');
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers.join(","), ...records.map((record) => headers.map((header) => cell(record[header])).join(","))].join("\n");
}

const flatten = (records) =>
  records.map((record) => {
    const out = {};
    for (const [key, value] of Object.entries(record)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [innerKey, innerValue] of Object.entries(value)) out[`${key}_${innerKey}`] = innerValue;
      } else out[key] = value;
    }
    return out;
  });

writeFileSync(path.join(DIR, "line-buckets.csv"), `${toCsv(flatten(lineBucketTable))}\n`);
writeFileSync(path.join(DIR, "exact-lines.csv"), `${toCsv(flatten(exactLineTable))}\n`);
writeFileSync(path.join(DIR, "workload-decomposition.csv"), `${toCsv(workloadByBucket)}\n`);
writeFileSync(path.join(DIR, "legacy-vs-v2.csv"), `${toCsv(legacyVsV2)}\n`);
writeFileSync(path.join(DIR, "diagnostic-slices.csv"), `${toCsv(flatten(diagnosticSlices))}\n`);
writeFileSync(path.join(DIR, "outcome-calibration.csv"), `${toCsv(outcomeCalibration)}\n`);
writeFileSync(
  path.join(DIR, "opponent-window-analysis.csv"),
  `${toCsv(flatten([{ metric: "opponent-window-predictive-value", ...opponentWindows.vsActualKRate }]))}\n`,
);

const summary = {
  studyId: "mlb-k-high-line-calibration-v1",
  generatedAt: new Date().toISOString(),
  sample: {
    ...archive.meta,
    leakageSafeRows: rows.length,
    rowsWithActualBF: decomposed.length,
    bfCoveragePct: round((decomposed.length / (rows.length || 1)) * 100, 1),
  },
  lineBuckets: lineBucketTable,
  exactLines: exactLineTable,
  structuralBiasTests: biasTests,
  workloadDecomposition: workloadByBucket,
  highLineProfile,
  recentForm,
  opponentWindows,
  marketDiagnostic,
  legacyVsV2,
  diagnosticSlices,
  upperTail,
  outcomeCalibration,
};

writeFileSync(path.join(DIR, "summary.json"), `${JSON.stringify(summary, null, 1)}\n`);

console.log(JSON.stringify({ sample: summary.sample, lineBuckets: lineBucketTable, biasTests }, null, 1));
