/**
 * RESEARCH-ONLY. Side-by-side out-of-sample comparison of the two NFL game
 * margin methods currently surfaced on the site:
 *
 *   A = JKB Power Rating fair spread  (0.24 * CurrentOVR diff + 2.0 HFA)
 *   B = JKB projected score implied margin (jkb-nfl-total-ridge-v1.0.0)
 *
 * Nothing here writes to public/, to any production artifact, or to the
 * prediction archive. Market data is used ONLY as a reported benchmark and
 * never as an input to any candidate predictor.
 *
 * Run: npx tsx scripts/research/nfl-margin-model-comparison/evaluate.mts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { reconstructMethodA, ROOT, type MethodAObservation } from "./reconstructA.mts";
import { reconstructMethodBWalkForward, fitForTrainingSeasons, scoreSeason, type MethodBObservation } from "./reconstructB.mts";
import { parseCsv, NFL_GAMES_SOURCE_URL } from "../../lib/nfl-schedules-results-core.mjs";

const EVAL_SEASONS = [2023, 2024, 2025];
const TRAIN_FOLD_SEASONS = [2023, 2024];
const HOLDOUT_SEASON = 2025;

/** Production Method A constants (public/data/nfl/matchup-projections.json _meta.model). */
const OVR_TO_POINTS = 0.24;
const HFA_POINTS = 2.0;

const OUT_DIR = join(ROOT, "scripts", "research", "nfl-margin-model-comparison", "out");

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
type Row = { predicted: number; actual: number };

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : NaN;
}

function summarize(rows: readonly Row[]) {
  const n = rows.length;
  if (n === 0) return { n: 0 };
  const errors = rows.map((r) => r.predicted - r.actual);
  const decided = rows.filter((r) => r.actual !== 0);
  const called = decided.filter((r) => r.predicted !== 0);
  const correct = called.filter((r) => Math.sign(r.predicted) === Math.sign(r.actual)).length;
  const mx = rows.reduce((s, r) => s + r.predicted, 0) / n;
  const my = rows.reduce((s, r) => s + r.actual, 0) / n;
  const sxx = rows.reduce((s, r) => s + (r.predicted - mx) ** 2, 0);
  const slope = sxx > 0 ? rows.reduce((s, r) => s + (r.predicted - mx) * (r.actual - my), 0) / sxx : NaN;
  return {
    n,
    mae: errors.reduce((s, e) => s + Math.abs(e), 0) / n,
    rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n),
    bias: errors.reduce((s, e) => s + e, 0) / n,
    correlation: pearson(rows.map((r) => r.predicted), rows.map((r) => r.actual)),
    suAccuracy: called.length > 0 ? correct / called.length : NaN,
    suSample: called.length,
    calibrationSlope: slope,
    calibrationIntercept: my - slope * mx,
    meanPredicted: mx,
    meanActual: my,
  };
}

// ---------------------------------------------------------------------------
// Linear algebra (OLS, small systems)
// ---------------------------------------------------------------------------
function solve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-12) throw new Error("singular system");
    for (let c = col; c <= n; c += 1) M[col][c] /= pv;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** OLS with an explicit constant column supplied by the caller if wanted. Returns coefficients and their standard errors. */
function ols(rows: readonly { x: number[]; y: number }[]) {
  const k = rows[0].x.length;
  const XtX = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);
  for (const r of rows) {
    for (let i = 0; i < k; i += 1) {
      Xty[i] += r.x[i] * r.y;
      for (let j = 0; j < k; j += 1) XtX[i][j] += r.x[i] * r.x[j];
    }
  }
  const beta = solve(XtX.map((r) => [...r]), [...Xty]);
  const residuals = rows.map((r) => r.y - r.x.reduce((s, v, i) => s + v * beta[i], 0));
  const dof = rows.length - k;
  const sigma2 = residuals.reduce((s, e) => s + e * e, 0) / dof;
  // (X'X)^-1 via solving against identity columns
  const inv: number[][] = [];
  for (let c = 0; c < k; c += 1) {
    const e = Array(k).fill(0);
    e[c] = 1;
    inv.push(solve(XtX.map((r) => [...r]), e));
  }
  const stdErrors = beta.map((_, i) => Math.sqrt(sigma2 * inv[i][i]));
  return { beta, stdErrors, tStats: beta.map((b, i) => b / stdErrors[i]), n: rows.length, residualSd: Math.sqrt(sigma2) };
}

// ---------------------------------------------------------------------------
// Joined dataset
// ---------------------------------------------------------------------------
type Joined = {
  gameId: string; season: number; week: number;
  homeAbbr: string; awayAbbr: string; neutralSite: boolean;
  ratingDiff: number; ovrHome: number; ovrAway: number; minGamesPlayed: number;
  homeScore: number; awayScore: number; actualMargin: number;
  a: number;
  b: number;
  bHomePoints: number; bAwayPoints: number; bTotal: number;
  marketHomeMargin: number | null;
};

function methodAMargin(o: MethodAObservation): number {
  return OVR_TO_POINTS * o.ratingDiff + (o.neutralSite ? 0 : HFA_POINTS);
}

async function fetchMarket(): Promise<Map<string, number> | null> {
  try {
    const res = await fetch(NFL_GAMES_SOURCE_URL, { headers: { "User-Agent": "jkb-margin-model-research/1.0" } });
    if (!res.ok) return null;
    const rows = parseCsv(await res.text());
    if (rows.length === 0 || !("game_id" in rows[0]) || !("spread_line" in rows[0])) return null;
    const map = new Map<string, number>();
    for (const r of rows as any[]) {
      const spread = Number(r.spread_line);
      // nflverse spread_line is the HOME margin line (positive = home favoured).
      if (r.game_id && Number.isFinite(spread)) map.set(r.game_id, spread);
    }
    return map;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------
function weekBand(week: number): string {
  if (week <= 4) return "weeks1-4";
  if (week <= 10) return "weeks5-10";
  return "weeks11-18";
}

function marginBand(pred: number): string {
  const a = Math.abs(pred);
  if (a < 3) return "lt3";
  if (a <= 7) return "3to7";
  return "gt7";
}

function disagreementBand(gap: number): string {
  const a = Math.abs(gap);
  if (a < 2) return "lt2";
  if (a < 4) return "2to4";
  if (a <= 6) return "4to6";
  return "gt6";
}

function sameWinner(x: number, y: number): boolean {
  if (x === 0 || y === 0) return true;
  return Math.sign(x) === Math.sign(y);
}

// ---------------------------------------------------------------------------
// Candidate predictors
// ---------------------------------------------------------------------------
type Candidate = { name: string; predict: (j: Joined) => number };

function blend(w: number): Candidate {
  return { name: `blend_${Math.round(w * 100)}A_${Math.round((1 - w) * 100)}B`, predict: (j) => w * j.a + (1 - w) * j.b };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const aBySeason = reconstructMethodA(EVAL_SEASONS);
  const { bySeason: bBySeason, fits: bFits } = reconstructMethodBWalkForward(EVAL_SEASONS);

  // Parity check: walk-forward 2025 must equal the frozen production window.
  const prodModel = fitForTrainingSeasons([2022, 2023, 2024]);
  const prodScored = scoreSeason(2025, prodModel);
  const wf2025 = new Map(bBySeason.get(2025)!.map((o) => [o.gameId, o]));
  let maxParityDelta = 0;
  for (const p of prodScored) {
    const w = wf2025.get(p.gameId);
    if (w) maxParityDelta = Math.max(maxParityDelta, Math.abs(p.impliedHomeMargin - w.impliedHomeMargin));
  }

  const market = await fetchMarket();

  const joined: Joined[] = [];
  const joinDiagnostics: Record<number, { aGames: number; bGames: number; joined: number }> = {};
  for (const season of EVAL_SEASONS) {
    const aRows = aBySeason.get(season)!;
    const bRows = new Map(bBySeason.get(season)!.map((o: MethodBObservation) => [o.gameId, o]));
    let count = 0;
    for (const a of aRows) {
      const b = bRows.get(a.gameId);
      if (!b) continue;
      count += 1;
      joined.push({
        gameId: a.gameId, season, week: a.week,
        homeAbbr: a.homeAbbr, awayAbbr: a.awayAbbr, neutralSite: a.neutralSite,
        ratingDiff: a.ratingDiff, ovrHome: a.ovrHome, ovrAway: a.ovrAway, minGamesPlayed: a.minGamesPlayed,
        homeScore: a.homeScore, awayScore: a.awayScore, actualMargin: a.margin,
        a: methodAMargin(a),
        b: b.impliedHomeMargin,
        bHomePoints: b.homeExpectedPoints, bAwayPoints: b.awayExpectedPoints, bTotal: b.projectedGameTotal,
        marketHomeMargin: market?.get(a.gameId) ?? null,
      });
    }
    joinDiagnostics[season] = { aGames: aRows.length, bGames: bRows.size, joined: count };
  }

  const candidates: Candidate[] = [
    { name: "A_powerRating", predict: (j) => j.a },
    { name: "B_projectedScore", predict: (j) => j.b },
    blend(0.75), blend(0.5), blend(0.25),
  ];

  // --- Fitted blend: weights from TRAIN_FOLD_SEASONS only, applied to holdout
  const trainRows = joined.filter((j) => TRAIN_FOLD_SEASONS.includes(j.season));
  const holdoutRows = joined.filter((j) => j.season === HOLDOUT_SEASON);

  // Constrained convex blend w*A + (1-w)*B, w chosen on train folds by MAE and by RMSE.
  const grid: { w: number; mae: number; rmse: number }[] = [];
  for (let i = 0; i <= 100; i += 1) {
    const w = i / 100;
    const rows = trainRows.map((j) => ({ predicted: w * j.a + (1 - w) * j.b, actual: j.actualMargin }));
    const s = summarize(rows) as any;
    grid.push({ w, mae: s.mae, rmse: s.rmse });
  }
  const bestByMae = [...grid].sort((x, y) => x.mae - y.mae)[0];
  const bestByRmse = [...grid].sort((x, y) => x.rmse - y.rmse)[0];

  // Unconstrained OLS blend (intercept + A + B) fit on train folds only.
  const olsBlend = ols(trainRows.map((j) => ({ x: [1, j.a, j.b], y: j.actualMargin })));

  const fittedCandidates: Candidate[] = [
    { name: `fittedConvex_w${bestByMae.w.toFixed(2)}A`, predict: (j) => bestByMae.w * j.a + (1 - bestByMae.w) * j.b },
    { name: "fittedOls_intercept_A_B", predict: (j) => olsBlend.beta[0] + olsBlend.beta[1] * j.a + olsBlend.beta[2] * j.b },
  ];

  const allCandidates = [...candidates, ...fittedCandidates];

  function evaluateSet(rows: readonly Joined[], cands: readonly Candidate[]) {
    const out: Record<string, any> = {};
    for (const c of cands) {
      out[c.name] = summarize(rows.map((j) => ({ predicted: c.predict(j), actual: j.actualMargin })));
    }
    const withMarket = rows.filter((r) => r.marketHomeMargin != null && r.marketHomeMargin !== 0);
    if (withMarket.length > 0) {
      out["_favoriteDirectionVsMarket"] = Object.fromEntries(cands.map((c) => [
        c.name,
        withMarket.filter((j) => c.predict(j) !== 0 && Math.sign(c.predict(j)) === Math.sign(j.marketHomeMargin!)).length / withMarket.length,
      ]).concat([["sample", withMarket.length as unknown as number]]));
    }
    if (rows.some((r) => r.marketHomeMargin != null)) {
      const mrows = rows.filter((r) => r.marketHomeMargin != null);
      out["MARKET_benchmark"] = { ...summarize(mrows.map((j) => ({ predicted: j.marketHomeMargin!, actual: j.actualMargin }))), note: "benchmark only, never an input" };
    }
    return out;
  }

  // --- Headline OOS: pooled 2023-2025 and per season
  const pooled = evaluateSet(joined, allCandidates);
  const bySeasonResults: Record<number, any> = {};
  for (const season of EVAL_SEASONS) bySeasonResults[season] = evaluateSet(joined.filter((j) => j.season === season), allCandidates);
  const holdoutResults = evaluateSet(holdoutRows, allCandidates);

  // --- Cohorts (pooled 2023-2025, unfitted candidates only to keep it honest)
  const cohortCandidates = candidates;
  function cohortTable(keyFn: (j: Joined) => string, labels: string[]) {
    const out: Record<string, any> = {};
    for (const label of labels) {
      const rows = joined.filter((j) => keyFn(j) === label);
      out[label] = rows.length === 0 ? { n: 0 } : evaluateSet(rows, cohortCandidates);
    }
    return out;
  }

  const cohorts = {
    byWeekBand: cohortTable((j) => weekBand(j.week), ["weeks1-4", "weeks5-10", "weeks11-18"]),
    byMethodAMarginBand: cohortTable((j) => marginBand(j.a), ["lt3", "3to7", "gt7"]),
    byMethodBMarginBand: cohortTable((j) => marginBand(j.b), ["lt3", "3to7", "gt7"]),
    byAgreement: cohortTable((j) => (sameWinner(j.a, j.b) ? "agree" : "disagree"), ["agree", "disagree"]),
  };

  // --- Disagreement study
  const disagree = joined.filter((j) => !sameWinner(j.a, j.b));
  const agree = joined.filter((j) => sameWinner(j.a, j.b));
  const disagreementByBand: Record<string, any> = {};
  for (const label of ["lt2", "2to4", "4to6", "gt6"]) {
    const rows = joined.filter((j) => disagreementBand(j.a - j.b) === label);
    disagreementByBand[label] = rows.length === 0 ? { n: 0 } : {
      ...evaluateSet(rows, cohortCandidates),
      disagreeOnWinner: rows.filter((j) => !sameWinner(j.a, j.b)).length,
      meanAbsGap: rows.reduce((s, j) => s + Math.abs(j.a - j.b), 0) / rows.length,
    };
  }
  // Within disagreements only, does the size of the gap predict which side is right?
  const disagreementGapDetail = ["lt2", "2to4", "4to6", "gt6"].map((label) => {
    const rows = disagree.filter((j) => disagreementBand(j.a - j.b) === label);
    if (rows.length === 0) return { band: label, n: 0 };
    const decided = rows.filter((j) => j.actualMargin !== 0);
    return {
      band: label, n: rows.length,
      aSuAccuracy: decided.filter((j) => Math.sign(j.a) === Math.sign(j.actualMargin)).length / decided.length,
      bSuAccuracy: decided.filter((j) => Math.sign(j.b) === Math.sign(j.actualMargin)).length / decided.length,
      aMae: rows.reduce((s, j) => s + Math.abs(j.a - j.actualMargin), 0) / rows.length,
      bMae: rows.reduce((s, j) => s + Math.abs(j.b - j.actualMargin), 0) / rows.length,
      decidedSample: decided.length,
    };
  });

  const disagreementStudy = {
    sampleSize: disagree.length,
    agreeSampleSize: agree.length,
    disagreeRate: disagree.length / joined.length,
    disagree: evaluateSet(disagree, cohortCandidates),
    agree: evaluateSet(agree, cohortCandidates),
    byWeekBand: Object.fromEntries(["weeks1-4", "weeks5-10", "weeks11-18"].map((label) => {
      const rows = disagree.filter((j) => weekBand(j.week) === label);
      return [label, rows.length === 0 ? { n: 0 } : evaluateSet(rows, cohortCandidates)];
    })),
    byGapBand: disagreementByBand,
    gapDetailWithinDisagreements: disagreementGapDetail,
  };

  // --- Residual complementarity: rolling-origin OOS
  // Fit margin ~ 1 + A + B on all seasons strictly before the eval season,
  // evaluate on the eval season. Also report the A-only and B-only refits so
  // the marginal contribution of each is measured on the same rows.
  const residualStudy: Record<number, any> = {};
  for (const evalSeason of EVAL_SEASONS.slice(1)) {
    const tr = joined.filter((j) => j.season < evalSeason);
    const te = joined.filter((j) => j.season === evalSeason);
    if (tr.length === 0) continue;
    const both = ols(tr.map((j) => ({ x: [1, j.a, j.b], y: j.actualMargin })));
    const aOnly = ols(tr.map((j) => ({ x: [1, j.a], y: j.actualMargin })));
    const bOnly = ols(tr.map((j) => ({ x: [1, j.b], y: j.actualMargin })));
    const ev = (fn: (j: Joined) => number) => summarize(te.map((j) => ({ predicted: fn(j), actual: j.actualMargin })));
    residualStudy[evalSeason] = {
      trainSeasons: [...new Set(tr.map((j) => j.season))],
      trainN: tr.length, evalN: te.length,
      coefficients: {
        both: { intercept: both.beta[0], bA: both.beta[1], bB: both.beta[2], tStats: both.tStats, stdErrors: both.stdErrors },
        aOnly: { intercept: aOnly.beta[0], bA: aOnly.beta[1], tStats: aOnly.tStats },
        bOnly: { intercept: bOnly.beta[0], bB: bOnly.beta[1], tStats: bOnly.tStats },
      },
      oos: {
        both: ev((j) => both.beta[0] + both.beta[1] * j.a + both.beta[2] * j.b),
        aOnly: ev((j) => aOnly.beta[0] + aOnly.beta[1] * j.a),
        bOnly: ev((j) => bOnly.beta[0] + bOnly.beta[1] * j.b),
        rawA: ev((j) => j.a),
        rawB: ev((j) => j.b),
      },
    };
  }
  // Full-sample (pooled 2023-2025) in-sample coefficients, reported for signal only.
  const pooledOls = ols(joined.map((j) => ({ x: [1, j.a, j.b], y: j.actualMargin })));
  const correlationAB = pearson(joined.map((j) => j.a), joined.map((j) => j.b));

  // Residual complementarity split by season phase (rolling-origin, 2024+2025 eval pooled)
  const rollingRows: { j: Joined; both: number; aOnly: number }[] = [];
  for (const evalSeason of EVAL_SEASONS.slice(1)) {
    const tr = joined.filter((j) => j.season < evalSeason);
    const both = ols(tr.map((j) => ({ x: [1, j.a, j.b], y: j.actualMargin })));
    const aOnly = ols(tr.map((j) => ({ x: [1, j.a], y: j.actualMargin })));
    for (const j of joined.filter((x) => x.season === evalSeason)) {
      rollingRows.push({
        j,
        both: both.beta[0] + both.beta[1] * j.a + both.beta[2] * j.b,
        aOnly: aOnly.beta[0] + aOnly.beta[1] * j.a,
      });
    }
  }
  const complementarityByWeekBand = Object.fromEntries(["weeks1-4", "weeks5-10", "weeks11-18"].map((label) => {
    const rows = rollingRows.filter((r) => weekBand(r.j.week) === label);
    return [label, rows.length === 0 ? { n: 0 } : {
      both: summarize(rows.map((r) => ({ predicted: r.both, actual: r.j.actualMargin }))),
      aOnly: summarize(rows.map((r) => ({ predicted: r.aOnly, actual: r.j.actualMargin }))),
    }];
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    purpose: "Research-only OOS comparison of NFL margin Method A (power-rating fair spread) vs Method B (projected-score implied margin).",
    configuration: {
      evalSeasons: EVAL_SEASONS, seasonType: "REG",
      methodA: { ovrToPointsCoefficient: OVR_TO_POINTS, homeFieldAdvantage: HFA_POINTS, strengthInput: "walk-forward reconstructed Current OVR (preseason v0.3.1 anchor + performance blend)" },
      methodB: { modelVersion: "jkb-nfl-total-ridge-v1.0.0", regime: "walk-forward refit, train = all seasons in [2022, evalSeason-1]", featureHistoryCache: "2021-evalSeason" },
      blendTrainFolds: TRAIN_FOLD_SEASONS, blendHoldout: HOLDOUT_SEASON,
      marketUse: "benchmark only; never an input to any candidate",
    },
    dataset: { joinDiagnostics, totalJoinedGames: joined.length, marketCoverage: joined.filter((j) => j.marketHomeMargin != null).length },
    methodBFits: bFits,
    productionParity2025: { maxAbsImpliedMarginDelta: maxParityDelta, note: "walk-forward 2025 fit vs frozen production 2022-2024 fit" },
    results: { pooled2023to2025: pooled, bySeason: bySeasonResults, holdout2025: holdoutResults },
    blendSearch: { trainFolds: TRAIN_FOLD_SEASONS, bestByMae, bestByRmse, olsBlend: { intercept: olsBlend.beta[0], bA: olsBlend.beta[1], bB: olsBlend.beta[2], tStats: olsBlend.tStats, n: olsBlend.n }, grid: grid.filter((g) => Math.round(g.w * 100) % 5 === 0) },
    cohorts,
    disagreementStudy,
    residualComplementarity: { rollingOrigin: residualStudy, pooledInSampleOls: { intercept: pooledOls.beta[0], bA: pooledOls.beta[1], bB: pooledOls.beta[2], tStats: pooledOls.tStats, stdErrors: pooledOls.stdErrors, n: pooledOls.n }, correlationAB, byWeekBand: complementarityByWeekBand },
  };

  writeFileSync(join(OUT_DIR, "results.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT_DIR, "joined-games.json"), JSON.stringify(joined, null, 0));
  console.log(JSON.stringify({
    dataset: report.dataset,
    parity: report.productionParity2025,
    pooled: report.results.pooled2023to2025,
    holdout: report.results.holdout2025,
    blendSearch: { bestByMae, bestByRmse, ols: report.blendSearch.olsBlend },
    disagreeSummary: { n: disagreementStudy.sampleSize, rate: disagreementStudy.disagreeRate },
  }, null, 2));
  console.log(`\n[research] wrote ${join(OUT_DIR, "results.json")}`);
}

main().catch((err) => { console.error("[research] FAILED:", err); process.exit(1); });
