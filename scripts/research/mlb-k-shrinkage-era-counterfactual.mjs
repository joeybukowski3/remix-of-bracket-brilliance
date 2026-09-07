/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v1
 *
 * The archived projections span two calibrations of the same model:
 *   Era A (through 2026-09-01): pitcher-skill shrinkage alpha = 1.0 (none)
 *   Era B (from  2026-09-02):   pitcher-skill shrinkage alpha = 0.55 (current)
 *
 * Because every Era A row archives its own pitcher skill rate, matchup
 * adjustment and projected batters faced, today's production formula can be
 * replayed exactly over the whole history. The per-row league anchor is
 * recovered from the archived matchup adjustment, which is
 * (opponentEnvironmentRate - leagueKRate) * 0.75 before clamping.
 *
 * This is a counterfactual on archived pregame inputs only. No production
 * constant is changed and nothing is written back to a production artifact.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  bootstrapMeanCi,
  correlation,
  filterLeakageSafe,
  gradeDirection,
  linearRegression,
  lineBucket,
  LINE_BUCKETS,
  mean,
  projectionDirection,
  quantile,
  stdev,
} from "./lib/mlb-k-research-helpers.mjs";

const DIR = path.join(process.cwd(), "data", "mlb", "k-research", "high-line-calibration");
const archive = JSON.parse(readFileSync(path.join(DIR, "pregame-archive.json"), "utf8"));
const rows = filterLeakageSafe(archive.rows);

// Production constants, read for the counterfactual only. Source of truth:
// src/lib/mlb/kProjectionV2.ts (not modified by this study).
const SHRINKAGE_ALPHA = 0.55;
const OPPONENT_MATCHUP_MULTIPLIER = 0.75;
const MIN_K_RATE = 0.1;
const MAX_K_RATE = 0.4;
const SHRINKAGE_LANDED = "2026-09-02";

const round = (value, digits = 4) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits;
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

for (const row of rows) {
  row.era = row.slateDate < SHRINKAGE_LANDED ? "A_pre_shrinkage" : "B_alpha_0.55";
  // Recover the league anchor this row was actually built against.
  row.leagueAnchor =
    row.v2OpponentEnvRate != null && row.v2MatchupAdjustment != null
      ? row.v2OpponentEnvRate - row.v2MatchupAdjustment / OPPONENT_MATCHUP_MULTIPLIER
      : null;
  // Replay the current formula on the archived pregame inputs.
  if (row.v2PitcherSkillRate != null && row.leagueAnchor != null && row.v2ProjectedBF != null) {
    const shrunk = row.leagueAnchor + SHRINKAGE_ALPHA * (row.v2PitcherSkillRate - row.leagueAnchor);
    row.cfKRate = clamp(shrunk + (row.v2MatchupAdjustment ?? 0), MIN_K_RATE, MAX_K_RATE);
    row.cfProjectedKs = row.cfKRate * row.v2ProjectedBF;
    row.cfDirection = projectionDirection(row.cfProjectedKs, row.kLine);
    row.cfGrade = gradeDirection(row.cfDirection, row.actualKs, row.kLine);
    row.cfSignedError = row.cfProjectedKs - row.actualKs;
    row.cfProjMinusLine = row.cfProjectedKs - row.kLine;
  } else {
    row.cfKRate = null;
    row.cfProjectedKs = null;
    row.cfDirection = null;
    row.cfGrade = null;
    row.cfSignedError = null;
    row.cfProjMinusLine = null;
  }
  row.asIsDirection = projectionDirection(row.v2ProjectedKs, row.kLine);
  row.asIsGrade = gradeDirection(row.asIsDirection, row.actualKs, row.kLine);
}

// Sanity: on Era B rows the replay must reproduce the archived projection.
const eraB = rows.filter((row) => row.era === "B_alpha_0.55" && row.cfProjectedKs != null);
const replayError = eraB.map((row) => Math.abs(row.cfProjectedKs - row.v2ProjectedKs));
const replayCheck = {
  eraBRows: eraB.length,
  maxAbsReplayError: round(replayError.length ? Math.max(...replayError) : null, 6),
  meanAbsReplayError: round(mean(replayError), 6),
  verdict: replayError.length && Math.max(...replayError) < 0.05 ? "REPLAY_MATCHES" : "REPLAY_DIVERGES",
};

function tally(list, accessor) {
  const out = { WIN: 0, LOSS: 0, PUSH: 0 };
  for (const row of list) {
    const grade = accessor(row);
    if (grade && out[grade] !== undefined) out[grade] += 1;
  }
  const decided = out.WIN + out.LOSS;
  return { ...out, decided, hitRate: decided ? round((out.WIN / decided) * 100, 2) : null };
}

function bucketSummary(list, projField, dirField, gradeField) {
  const projections = list.map((row) => row[projField]);
  const usable = list.filter((row) => row[projField] != null);
  const under = usable.filter((row) => row[dirField] === "under");
  const over = usable.filter((row) => row[dirField] === "over");
  return {
    n: usable.length,
    meanProjection: round(mean(projections), 3),
    meanLine: round(mean(list.map((row) => row.kLine)), 3),
    meanActual: round(mean(list.map((row) => row.actualKs)), 3),
    meanProjMinusLine: round(mean(usable.map((row) => row[projField] - row.kLine)), 3),
    pctUnder: round((under.length / (usable.length || 1)) * 100, 1),
    pctOver: round((over.length / (usable.length || 1)) * 100, 1),
    meanSignedError: round(mean(usable.map((row) => row[projField] - row.actualKs)), 3),
    mae: round(mean(usable.map((row) => Math.abs(row[projField] - row.actualKs))), 3),
    underSignal: tally(under, (row) => row[gradeField]),
    overSignal: tally(over, (row) => row[gradeField]),
  };
}

// ---------- era comparison ----------
const eraTable = ["A_pre_shrinkage", "B_alpha_0.55"].map((era) => {
  const list = rows.filter((row) => row.era === era);
  const dates = [...new Set(list.map((row) => row.slateDate))].sort();
  return {
    era,
    n: list.length,
    dateRange: dates.length ? `${dates[0]}..${dates[dates.length - 1]}` : null,
    sdProjectedKRate: round(stdev(list.map((row) => row.v2ProjectedKRate)), 4),
    sdProjectedKs: round(stdev(list.map((row) => row.v2ProjectedKs)), 3),
    sdActualKs: round(stdev(list.map((row) => row.actualKs)), 3),
    sdMarketLine: round(stdev(list.map((row) => row.kLine)), 3),
    pctProjectedAtLeast7: round(
      (list.filter((row) => row.v2ProjectedKs >= 7).length / (list.length || 1)) * 100,
      2,
    ),
    p90ProjectedKs: round(quantile(list.map((row) => row.v2ProjectedKs), 0.9), 3),
    pctUnderAll: round(
      (list.filter((row) => row.asIsDirection === "under").length / (list.length || 1)) * 100,
      1,
    ),
    highLineN: list.filter((row) => row.kLine >= 7).length,
    pctUnderHighLine: (() => {
      const high = list.filter((row) => row.kLine >= 7);
      return high.length
        ? round((high.filter((row) => row.asIsDirection === "under").length / high.length) * 100, 1)
        : null;
    })(),
  };
});

// ---------- counterfactual: current model replayed over full history ----------
const counterfactualBuckets = LINE_BUCKETS.map((bucket) => {
  const list = rows.filter((row) => lineBucket(row.kLine) === bucket.key);
  if (!list.length) return null;
  return {
    bucket: bucket.key,
    n: list.length,
    asIs: bucketSummary(list, "v2ProjectedKs", "asIsDirection", "asIsGrade"),
    currentModelReplay: bucketSummary(list, "cfProjectedKs", "cfDirection", "cfGrade"),
  };
}).filter(Boolean);

const flat = counterfactualBuckets.map((entry) => ({
  bucket: entry.bucket,
  n: entry.n,
  meanLine: entry.asIs.meanLine,
  meanActual: entry.asIs.meanActual,
  archivedProjection: entry.asIs.meanProjection,
  archivedPctUnder: entry.asIs.pctUnder,
  archivedSignedError: entry.asIs.meanSignedError,
  archivedMae: entry.asIs.mae,
  archivedUnderHit: entry.asIs.underSignal.hitRate,
  archivedUnderRecord: `${entry.asIs.underSignal.WIN}-${entry.asIs.underSignal.LOSS}`,
  replayProjection: entry.currentModelReplay.meanProjection,
  replayPctUnder: entry.currentModelReplay.pctUnder,
  replaySignedError: entry.currentModelReplay.meanSignedError,
  replayMae: entry.currentModelReplay.mae,
  replayUnderHit: entry.currentModelReplay.underSignal.hitRate,
  replayUnderRecord: `${entry.currentModelReplay.underSignal.WIN}-${entry.currentModelReplay.underSignal.LOSS}`,
}));

const replayable = rows.filter((row) => row.cfProjectedKs != null);
const counterfactualOverall = {
  n: replayable.length,
  archived: {
    sdProjectedKs: round(stdev(replayable.map((row) => row.v2ProjectedKs)), 3),
    pctAtLeast7: round((replayable.filter((row) => row.v2ProjectedKs >= 7).length / replayable.length) * 100, 2),
    pctAtLeast8: round((replayable.filter((row) => row.v2ProjectedKs >= 8).length / replayable.length) * 100, 2),
    pctUnder: round((replayable.filter((row) => row.asIsDirection === "under").length / replayable.length) * 100, 1),
    mae: round(mean(replayable.map((row) => Math.abs(row.v2SignedError ?? row.v2ProjectedKs - row.actualKs))), 3),
    meanSignedError: round(mean(replayable.map((row) => row.v2ProjectedKs - row.actualKs)), 3),
    allSignal: tally(replayable, (row) => row.asIsGrade),
  },
  currentModelReplay: {
    sdProjectedKs: round(stdev(replayable.map((row) => row.cfProjectedKs)), 3),
    pctAtLeast7: round((replayable.filter((row) => row.cfProjectedKs >= 7).length / replayable.length) * 100, 2),
    pctAtLeast8: round((replayable.filter((row) => row.cfProjectedKs >= 8).length / replayable.length) * 100, 2),
    pctUnder: round((replayable.filter((row) => row.cfDirection === "under").length / replayable.length) * 100, 1),
    mae: round(mean(replayable.map((row) => Math.abs(row.cfSignedError))), 3),
    meanSignedError: round(mean(replayable.map((row) => row.cfSignedError)), 3),
    allSignal: tally(replayable, (row) => row.cfGrade),
  },
  sdActualKs: round(stdev(replayable.map((row) => row.actualKs)), 3),
  regReplaySignedErrorOnLine: (() => {
    const fit = linearRegression(replayable.map((row) => [row.kLine, row.cfSignedError]));
    return fit
      ? { n: fit.n, slope: round(fit.slope, 4), slopeStdError: round(fit.slopeStdError, 4), tStat: round(fit.tStat, 2) }
      : null;
  })(),
  regArchivedSignedErrorOnLine: (() => {
    const fit = linearRegression(replayable.map((row) => [row.kLine, row.v2ProjectedKs - row.actualKs]));
    return fit
      ? { n: fit.n, slope: round(fit.slope, 4), slopeStdError: round(fit.slopeStdError, 4), tStat: round(fit.tStat, 2) }
      : null;
  })(),
  highLineReplay: (() => {
    const high = replayable.filter((row) => row.kLine >= 7);
    const ci = bootstrapMeanCi(high.map((row) => row.cfSignedError));
    return {
      n: high.length,
      meanSignedError: round(mean(high.map((row) => row.cfSignedError)), 3),
      ci: ci ? [round(ci.lower, 3), round(ci.upper, 3)] : null,
      pctUnder: round((high.filter((row) => row.cfDirection === "under").length / (high.length || 1)) * 100, 1),
      underSignal: tally(high.filter((row) => row.cfDirection === "under"), (row) => row.cfGrade),
    };
  })(),
  corrShrinkageCostVsLine: round(
    correlation(
      replayable.map((row) => [row.kLine, (row.v2PitcherSkillRate - row.cfKRate + (row.v2MatchupAdjustment ?? 0)) * row.v2ProjectedBF]),
    ),
    4,
  ),
};

const output = {
  studyId: "mlb-k-high-line-calibration-v1",
  section: "shrinkage-era-split-and-counterfactual",
  generatedAt: new Date().toISOString(),
  shrinkageLandedOn: SHRINKAGE_LANDED,
  constantsReplayed: { SHRINKAGE_ALPHA, OPPONENT_MATCHUP_MULTIPLIER, MIN_K_RATE, MAX_K_RATE },
  replayCheck,
  eraTable,
  counterfactualBuckets,
  counterfactualOverall,
};

writeFileSync(path.join(DIR, "shrinkage-era-counterfactual.json"), `${JSON.stringify(output, null, 1)}\n`);

function toCsv(records) {
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return [headers.join(","), ...records.map((record) => headers.map((header) => record[header] ?? "").join(","))].join("\n");
}
writeFileSync(path.join(DIR, "shrinkage-counterfactual-buckets.csv"), `${toCsv(flat)}\n`);
writeFileSync(path.join(DIR, "shrinkage-eras.csv"), `${toCsv(eraTable)}\n`);

console.log("REPLAY CHECK", JSON.stringify(replayCheck));
console.log("\nERAS");
console.table(eraTable);
console.log("\nCOUNTERFACTUAL BY BUCKET (current alpha=0.55 model replayed over the full archive)");
console.table(flat);
console.log("\nOVERALL");
console.log(JSON.stringify(counterfactualOverall, null, 1));
