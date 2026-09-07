/**
 * RESEARCH ONLY -- study mlb-k-high-line-calibration-v1
 *
 * Reconstructs the 2026-09-06 Gavin Williams projection from the archived
 * pregame artifacts and runs a workload sensitivity sweep. The sweep only
 * re-evaluates the published formula at alternative innings inputs; no
 * production constant or artifact is altered.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { mean, windowKRate } from "./lib/mlb-k-research-helpers.mjs";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "public", "data", "mlb");
const OUT = path.join(ROOT, "data", "mlb", "k-research", "high-line-calibration");

const SHRINKAGE_ALPHA = 0.55;
const OPPONENT_MATCHUP_MULTIPLIER = 0.75;
const MAX_MATCHUP_ADJUSTMENT = 0.035;
const MIN_K_RATE = 0.1;
const MAX_K_RATE = 0.4;

const read = (file) => JSON.parse(readFileSync(path.join(DATA, file), "utf8"));
const round = (value, digits = 4) =>
  value == null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits;

const shadow = read("k-props-v2-shadow.json");
const raw = read("hr-props-raw.json");
const details = read("strikeout-prop-details.json");
const workload = read("k-workload-shadow.json");

const v2Row = shadow.rows.find((row) => row.pitcher?.name === "Gavin Williams");
const rawRow = raw.pitchers.find((row) => row.pitcher === "Gavin Williams");
const detailRow = details.details.find((row) => row.pitcher === "Gavin Williams");
const workloadRow = workload.pitchers.find((row) => row.pitcher === "Gavin Williams");

const v2 = v2Row.v2;
const input = v2Row.inputs.v2Input;
const starts = input.pitcher.recentStarts.map((start) => ({
  k: start.strikeouts,
  ip: start.inningsPitched,
  bf: start.battersFaced,
  pc: start.pitchCount,
}));

// Recover the league anchor the row was built against.
const leagueAnchor = v2.opponentEnvironmentRate - v2.matchupAdjustment / OPPONENT_MATCHUP_MULTIPLIER;
const shrunk = leagueAnchor + SHRINKAGE_ALPHA * (v2.pitcherSkillRate - leagueAnchor);
const bfPerInning = input.pitcher.averageBattersFacedPerInning;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

function projectAtInnings(innings) {
  const bf = innings * bfPerInning;
  const kRate = clamp(shrunk + v2.matchupAdjustment, MIN_K_RATE, MAX_K_RATE);
  const unshrunkRate = clamp(v2.pitcherSkillRate + v2.matchupAdjustment, MIN_K_RATE, MAX_K_RATE);
  return {
    innings,
    projectedBF: round(bf, 3),
    projectedKs_currentModel: round(kRate * bf, 3),
    projectedKs_ifNoSkillShrinkage: round(unshrunkRate * bf, 3),
    beatsLine_currentModel: kRate * bf > v2Row.market.kLine,
    beatsLine_ifNoSkillShrinkage: unshrunkRate * bf > v2Row.market.kLine,
  };
}

const sweep = [4.8, 5.0, 5.5, 6.0, 6.5, 7.0].map(projectAtInnings);

const opponent = detailRow.opponentLastFiveVsStartersSummary;

const caseStudy = {
  studyId: "mlb-k-high-line-calibration-v1",
  section: "gavin-williams-2026-09-06-case-study",
  generatedAt: new Date().toISOString(),
  market: {
    line: v2Row.market.kLine,
    oddsOver: v2Row.market.oddsOver,
    oddsUnder: v2Row.market.oddsUnder,
    book: v2Row.market.book,
    capturedAt: rawRow.kOddsCapturedAt,
    slateDate: v2Row.market.slateDate,
  },
  pitcher: {
    seasonKRatePct: input.pitcher.seasonKRate,
    seasonKPer9: input.pitcher.seasonKPer9,
    seasonWhiffRatePct: input.pitcher.seasonWhiffRate,
    recentKRate: input.pitcher.recentKRate,
    recentKPer9: input.pitcher.recentKPer9,
    last3KRate: round(windowKRate(starts, 3)),
    last5KRate: round(windowKRate(starts, 5)),
    handedness: input.pitcher.handedness,
    recentStarts: detailRow.pitcherLastFiveStarts.map((start) => ({
      date: start.date,
      opponent: start.opponentAbbr,
      ip: start.inningsPitched,
      k: start.strikeouts,
      bf: start.battersFaced,
      pitches: start.pitchCount,
    })),
    recentIpAverage: round(mean(starts.map((start) => start.ip)), 3),
    recentIpMedian: 5.667,
    recentBfAverage: round(mean(starts.map((start) => start.bf)), 3),
    recentPitchAverage: round(mean(starts.map((start) => start.pc)), 2),
    homeSeasonKRatePct: detailRow.pitcherVenueSplits.home.season.strikeoutRate,
    homeLastFiveKRatePct: detailRow.pitcherVenueSplits.home.lastFiveAtSite.strikeoutRate,
  },
  workload: {
    modelVersion: workloadRow?.modelVersion ?? null,
    expectedPitchLimit: workloadRow?.projection?.expectedPitchLimit ?? null,
    projectedBF: v2.projectedBattersFaced,
    projectedInnings: v2.projectedInnings,
    bfPerInning: round(bfPerInning, 4),
    recentPitchAverage: workloadRow?.inputs?.recentPitchAverage ?? null,
    recentBfAverage: workloadRow?.inputs?.recentBfAverage ?? null,
    recentIpAverage: workloadRow?.inputs?.recentIpAverage ?? null,
    confidenceGrade: rawRow.workloadConfidenceGrade,
    flags: rawRow.workloadFlags,
    note:
      "Projected innings 4.946 is essentially the mean of the last five starts (72 outs / 5 = 4.8 IP). " +
      "One 1.1 IP start on 2026-08-25 pulls that mean down 0.87 IP below the 5.67 IP median of the other four.",
  },
  opponentDet: {
    seasonKRate: input.opponent.seasonKRate,
    recentKRateRaw: input.opponent.recentKRate,
    recentKRateAfterModelRegression: v2.components.find((component) => component.key === "opponent.recentKRate")?.value ?? null,
    projectedLineupKRatePct: input.opponent.projectedLineupKRate,
    vsRhpKRate: input.opponent.vsRhpKRate,
    opponentEnvironmentRate: v2.opponentEnvironmentRate,
    leagueAnchor: round(leagueAnchor),
    last10AvgOpposingStarterKs: opponent.averageOpposingStarterStrikeouts,
    last10AvgTeamKs: opponent.averageTeamStrikeouts,
    last10OpposingStarterKPerInning: round(opponent.opposingStarterStrikeoutsPerInning, 4),
    note:
      "DET raw recent K rate 0.2703 vs season 0.2278 -- a +4.25 point short-term shift. The model regresses " +
      "recent 35/65 back to season, so the environment input only moves to 0.2427, and the matchup adjustment " +
      "that survives is +0.0079 K rate, worth +0.17 Ks.",
  },
  projection: {
    pitcherSkillRate: v2.pitcherSkillRate,
    pitcherSkillRateShrunk: round(shrunk),
    shrinkageAlpha: SHRINKAGE_ALPHA,
    kRateLostToShrinkage: round(v2.pitcherSkillRate - shrunk),
    ksLostToShrinkage: round((v2.pitcherSkillRate - shrunk) * v2.projectedBattersFaced, 3),
    opponentEnvironmentRate: v2.opponentEnvironmentRate,
    matchupAdjustment: v2.matchupAdjustment,
    matchupAdjustmentClamped: Math.abs(Math.abs(v2.matchupAdjustment) - MAX_MATCHUP_ADJUSTMENT) < 1e-9,
    projectedKRate: v2.projectedKRate,
    projectedBF: v2.projectedBattersFaced,
    projectedInnings: v2.projectedInnings,
    productionProjectedKs: v2.projectedStrikeouts,
    legacyProjectedKs: v2Row.legacy.projectedKs,
    workloadOnlyProjectedKs: rawRow.workloadOnlyProjectedKs,
    teamAdjustedProjectedKs: rawRow.teamAdjustedProjectedKs,
    candidateProjectedKs: rawRow.candidateProjectedKs,
    edgeToLine: round(v2.projectedStrikeouts - v2Row.market.kLine, 3),
    recommendedSide: v2.projectedStrikeouts > v2Row.market.kLine ? "over" : "under",
  },
  sensitivity: {
    note:
      "Re-evaluates the published formula at alternative projected innings. Nothing in the model is changed; " +
      "the K rate is held at its archived value and only workload varies.",
    kRateUsed: round(v2.projectedKRate),
    kRateIfNoSkillShrinkage: round(clamp(v2.pitcherSkillRate + v2.matchupAdjustment, MIN_K_RATE, MAX_K_RATE)),
    inningsNeededToReachLine_currentKRate: round(v2Row.market.kLine / v2.projectedKRate / bfPerInning, 3),
    inningsNeededToReachLine_noShrinkage: round(
      v2Row.market.kLine / clamp(v2.pitcherSkillRate + v2.matchupAdjustment, MIN_K_RATE, MAX_K_RATE) / bfPerInning,
      3,
    ),
    sweep,
  },
};

writeFileSync(path.join(OUT, "gavin-williams-case-study.json"), `${JSON.stringify(caseStudy, null, 1)}\n`);

console.log(JSON.stringify(caseStudy.projection, null, 1));
console.log("\nSENSITIVITY");
console.table(sweep);
console.log(
  "\ninnings needed to reach 7.5 at current K rate:",
  caseStudy.sensitivity.inningsNeededToReachLine_currentKRate,
  "| without skill shrinkage:",
  caseStudy.sensitivity.inningsNeededToReachLine_noShrinkage,
);
