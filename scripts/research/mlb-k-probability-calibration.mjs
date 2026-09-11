/**
 * mlb-k-probability-calibration.mjs -- RESEARCH ONLY.
 *
 * Historical calibration check for the K probability/value SHADOW layer
 * (scripts/lib/mlb-k-probability-model.mjs). Not wired into any workflow,
 * exactly like the K +EV V1 / V4 backtest research scripts it sits next to.
 *
 * ROW SOURCE. Reuses the SAME 1,186-row leakage-safe evaluation set the V4
 * backtest scores against (buildEvaluationRows from the v3 research lib),
 * which already carries real two-sided historical odds (kLine/oddsOver/
 * oddsUnder) AND graded actual outcomes (actualKs) -- exactly what a
 * probability calibration check needs and what a live slate does not yet
 * have enough graded history for.
 *
 * METHOD. For every row with a usable V4 block, a valid two-sided market, and
 * a graded actual outcome: run the deterministic Monte Carlo model to get
 * P(actual Ks > kLine), then check whether the row actually went Over at that
 * rate across all rows whose predicted probability falls in the same bucket
 * (50-54%, 55-59%, ..., 70%+). A well-calibrated model's buckets should track
 * the diagonal (predicted ~= observed hit rate).
 *
 * ALSO compares against a naive Poisson-around-the-mean baseline (STEP 4:
 * "we specifically want to know whether the richer probability model is more
 * calibrated") using the same finalProjectedKs mean.
 *
 * NO MARKET LEAKAGE: kLine/oddsOver/oddsUnder are read only in the scoring
 * section below, never passed into computeKProjectionV4 or the Monte Carlo
 * inputs -- identical discipline to mlb-k-v4-backtest.mjs.
 *
 * Usage: node scripts/research/mlb-k-probability-calibration.mjs [--json=out.json] [--simulations=4000]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadSources, buildEvaluationRows } from "./lib/mlb-k-v3-dataset.mjs";
import { computeKProjectionV4 } from "../mlb-k/compute-k-projection-v4.mjs";
import { createStartLogBaselineResolver, normalizePitcherKey } from "../mlb-k/mlb-k-opponent-starter-context.mjs";
import { V4_DEFAULTS } from "../mlb-k/mlb-k-projection-v4-core.mjs";
import { buildLeagueStarterIndex, leagueStarterLevelsAsOf } from "../mlb-k/mlb-k-league-starter-index.mjs";
import { noVigTwoWayProbabilities } from "../lib/mlb-k-odds-math.mjs";
import { probabilityFromCounts, simulateStrikeoutDistribution } from "../lib/mlb-k-probability-model.mjs";

const ROOT = process.cwd();
const arg = (prefix, fallback = null) =>
  process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
const SIMULATIONS = Number(arg("--simulations=", "4000"));
const JSON_OUT = arg("--json=", null);

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------- load
const sources = loadSources(ROOT);
const { rows, logByPitcher, startLog } = buildEvaluationRows(sources);

const v4StartLog = startLog
  .map((start) => ({
    date: String(start.date),
    pitcherKey: normalizePitcherKey(start.pitcher),
    outs: finite(start.outs),
    strikeouts: finite(start.strikeouts),
    opponent: start.opponent ?? null,
    battersFaced: finite(start.bf),
  }))
  .filter((s) => s.date && s.pitcherKey && s.outs !== null && s.strikeouts !== null);

const byOpponent = new Map();
for (const start of v4StartLog) {
  if (!start.opponent) continue;
  const bucket = byOpponent.get(start.opponent);
  if (bucket) bucket.push(start);
  else byOpponent.set(start.opponent, [start]);
}
for (const bucket of byOpponent.values()) bucket.sort((a, b) => b.date.localeCompare(a.date));

const leagueStarterIndex = buildLeagueStarterIndex(startLog);
const resolverByOpponent = new Map();
const resolverFor = (opponent) => {
  if (!resolverByOpponent.has(opponent)) {
    resolverByOpponent.set(opponent, createStartLogBaselineResolver(v4StartLog, { excludeOpponent: opponent }));
  }
  return resolverByOpponent.get(opponent);
};

function seasonOverrideFromSplit(split) {
  if (!split) return null;
  const games = finite(split.seasonGamesStarted);
  const outs = finite(split.seasonOuts);
  if (games === null || outs === null || games <= 0 || outs <= 0) return null;
  const innings = outs / 3;
  const strikeouts = (finite(split?.home?.strikeouts) ?? 0) + (finite(split?.away?.strikeouts) ?? 0);
  const bf = finite(split.seasonBattersFaced);
  return {
    starts: games,
    innings,
    ipPerStart: innings / games,
    kPerIP: strikeouts > 0 ? strikeouts / innings : null,
    bfPerIP: bf !== null && bf > 0 ? bf / innings : null,
  };
}

// ---------------------------------------------------------- per-row model
let usableRows = 0;
let skippedNoV4 = 0;
let skippedNoMarket = 0;
let skippedNoOutcome = 0;

const scored = [];
for (const row of rows) {
  const opponentObservations = (byOpponent.get(row.opponent) ?? []).filter((s) => s.date < row.slateDate).slice(0, 10);
  const hand = String(row.handedness ?? "").toUpperCase().startsWith("L") ? "L" : "R";
  const vsHand = hand === "L" ? finite(row.inOppVsLhpKRate) : finite(row.inOppVsRhpKRate);
  const lineup = finite(row.inOppLineupKRate);
  const lineupFraction = lineup === null ? null : (lineup > 1 ? lineup / 100 : lineup);

  const v4 = computeKProjectionV4({
    pitcherStarts: (logByPitcher.get(row.pitcherId) ?? []).map((s) => ({
      date: String(s.date),
      outs: finite(s.outs),
      strikeouts: finite(s.strikeouts),
      battersFaced: finite(s.bf),
    })),
    opponentObservations,
    baselineFor: resolverFor(row.opponent),
    asOfDate: row.slateDate,
    role: "starter",
    seasonOverride: seasonOverrideFromSplit(row.seasonSplit),
    config: V4_DEFAULTS,
    leagueContext: {
      ipPerStart: row.leagueIpPerStart,
      bfPerIP: row.leagueBfPerIp,
      kRate: row.leagueAnchor,
      kPerIP: leagueStarterLevelsAsOf(leagueStarterIndex, row.slateDate).kPerIP,
    },
    opponentSplits: {
      kRateVsHand: vsHand !== null && vsHand > 0 ? vsHand : lineupFraction,
      recentKRate: finite(row.inOppRecentKRate),
      wrcRankRecent: null,
      wrcRankSeason: null,
    },
  });

  const kLine = finite(row.kLine);
  const actualKs = finite(row.actualKs);
  const market = noVigTwoWayProbabilities(row.oddsOver, row.oddsUnder);

  if (finite(v4.finalProjectedIP) === null || finite(v4.finalProjectedKPerIP) === null) {
    skippedNoV4 += 1;
    continue;
  }
  if (kLine === null || !market.twoSided) {
    skippedNoMarket += 1;
    continue;
  }
  if (actualKs === null) {
    skippedNoOutcome += 1;
    continue;
  }
  usableRows += 1;

  const simulation = simulateStrikeoutDistribution(
    {
      pitcherId: row.pitcherId,
      slateDate: row.slateDate,
      finalProjectedIP: v4.finalProjectedIP,
      finalProjectedKPerIP: v4.finalProjectedKPerIP,
      bfPerIP: v4.bfPerIP,
      seasonIPPerStart: v4.seasonIPPerStart,
      last10IPPerStart: v4.last10IPPerStart,
      last5IPPerStart: v4.last5IPPerStart,
      seasonGamesStarted: v4.seasonGamesStarted,
      seasonKPerIP: v4.seasonKPerIP,
      last10KPerIP: v4.last10KPerIP,
      last5KPerIP: v4.last5KPerIP,
      seasonInnings: v4.seasonInnings,
    },
    { simulations: SIMULATIONS },
  );
  const { overProbability } = probabilityFromCounts(simulation.counts, simulation.simulations, kLine);

  // Naive Poisson-around-the-mean baseline, mean = V4's own point estimate --
  // STEP 4's explicit comparison candidate. P(K > line) = 1 - CDF(floor(line)).
  const poissonMean = finite(v4.projectedKs);
  let poissonOver = null;
  if (poissonMean !== null && poissonMean > 0) {
    let cdf = 0;
    let term = Math.exp(-poissonMean);
    for (let k = 0; k <= Math.floor(kLine); k++) {
      cdf += term;
      term *= poissonMean / (k + 1);
    }
    poissonOver = 1 - cdf;
  }

  scored.push({
    slateDate: row.slateDate,
    pitcher: row.pitcher,
    kLine,
    actualKs,
    actualOver: actualKs > kLine ? 1 : actualKs < kLine ? 0 : null,
    modelOverProbability: overProbability,
    poissonOverProbability: poissonOver,
    marketOverNoVig: market.overNoVigProbability,
  });
}

// ------------------------------------------------------------- calibration
const graded = scored.filter((r) => r.actualOver !== null);

function calibrationBuckets(rowsIn, probabilityKey) {
  const bucketEdges = [0.5, 0.55, 0.6, 0.65, 0.7, 1.01];
  const bucketLabels = ["50-54%", "55-59%", "60-64%", "65-69%", "70%+"];
  const buckets = bucketLabels.map(() => ({ n: 0, sumPredicted: 0, sumActual: 0 }));

  for (const row of rowsIn) {
    const p = row[probabilityKey];
    if (p === null || p < 0.5) continue; // buckets are defined on the "favored" side by construction below
    for (let i = 0; i < bucketEdges.length - 1; i++) {
      if (p >= bucketEdges[i] && p < bucketEdges[i + 1]) {
        buckets[i].n += 1;
        buckets[i].sumPredicted += p;
        buckets[i].sumActual += row.actualOver;
        break;
      }
    }
  }

  return bucketLabels.map((label, i) => ({
    bucket: label,
    n: buckets[i].n,
    predictedMean: buckets[i].n ? Number((buckets[i].sumPredicted / buckets[i].n).toFixed(4)) : null,
    actualHitRate: buckets[i].n ? Number((buckets[i].sumActual / buckets[i].n).toFixed(4)) : null,
    calibrationError: buckets[i].n
      ? Number((buckets[i].sumActual / buckets[i].n - buckets[i].sumPredicted / buckets[i].n).toFixed(4))
      : null,
  }));
}

function brierScore(rowsIn, probabilityKey) {
  const usable = rowsIn.filter((r) => r[probabilityKey] !== null);
  if (!usable.length) return null;
  const sum = usable.reduce((acc, r) => acc + (r[probabilityKey] - r.actualOver) ** 2, 0);
  return Number((sum / usable.length).toFixed(4));
}

function logLoss(rowsIn, probabilityKey) {
  const usable = rowsIn.filter((r) => r[probabilityKey] !== null);
  if (!usable.length) return null;
  const eps = 1e-6;
  const sum = usable.reduce((acc, r) => {
    const p = Math.min(1 - eps, Math.max(eps, r[probabilityKey]));
    return acc + (r.actualOver === 1 ? -Math.log(p) : -Math.log(1 - p));
  }, 0);
  return Number((sum / usable.length).toFixed(4));
}

// Buckets are computed on "whichever side the model favors" so a 30%-Over
// row (= 70%-Under favorite) still lands in a 70%+ bucket rather than being
// dropped -- mirrors STEP 4's Over AND Under bucket request.
function favoredProbability(row, key) {
  const p = row[key];
  if (p === null) return null;
  return p >= 0.5 ? p : 1 - p;
}
function favoredActual(row, key) {
  const p = row[key];
  if (p === null) return null;
  return p >= 0.5 ? row.actualOver : 1 - row.actualOver;
}

const modelFavored = graded.map((r) => ({ actualOver: favoredActual(r, "modelOverProbability"), modelOverProbability: favoredProbability(r, "modelOverProbability") })).filter((r) => r.modelOverProbability !== null);
const poissonFavored = graded.map((r) => ({ actualOver: favoredActual(r, "poissonOverProbability"), poissonOverProbability: favoredProbability(r, "poissonOverProbability") })).filter((r) => r.poissonOverProbability !== null);

const modelBuckets = calibrationBuckets(modelFavored, "modelOverProbability");
const poissonBuckets = calibrationBuckets(poissonFavored, "poissonOverProbability");

const report = {
  rowCounts: { totalCandidateRows: rows.length, usableRows, skippedNoV4, skippedNoMarket, skippedNoOutcome, gradedRows: graded.length },
  simulationsPerRow: SIMULATIONS,
  model: {
    brierScore: brierScore(graded, "modelOverProbability"),
    logLoss: logLoss(graded, "modelOverProbability"),
    calibrationBuckets: modelBuckets,
  },
  poissonBaseline: {
    brierScore: brierScore(graded, "poissonOverProbability"),
    logLoss: logLoss(graded, "poissonOverProbability"),
    calibrationBuckets: poissonBuckets,
  },
  marketNoVig: {
    brierScore: brierScore(graded, "marketOverNoVig"),
    logLoss: logLoss(graded, "marketOverNoVig"),
  },
};

console.log(`\nRows: total=${report.rowCounts.totalCandidateRows} usable(v4+market+outcome)=${report.rowCounts.usableRows} graded=${report.rowCounts.gradedRows}`);
console.log(`Skipped: noV4=${skippedNoV4} noTwoSidedMarket=${skippedNoMarket} noGradedOutcome=${skippedNoOutcome}\n`);

console.log("MODEL (Monte Carlo, this PR):");
console.log(`  Brier=${report.model.brierScore}  LogLoss=${report.model.logLoss}`);
console.table(modelBuckets);

console.log("\nPOISSON BASELINE (mean = V4 projectedKs, fixed variance = mean):");
console.log(`  Brier=${report.poissonBaseline.brierScore}  LogLoss=${report.poissonBaseline.logLoss}`);
console.table(poissonBuckets);

console.log(`\nMARKET NO-VIG (reference -- how good the market itself looks on this sample): Brier=${report.marketNoVig.brierScore}  LogLoss=${report.marketNoVig.logLoss}`);

if (JSON_OUT) {
  writeFileSync(path.resolve(ROOT, JSON_OUT), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nSaved ${JSON_OUT}`);
}
