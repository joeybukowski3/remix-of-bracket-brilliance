/**
 * RESEARCH ONLY — calibration evaluation for JKB TD Score.
 *
 * Phase 4 of the TD Score calibration study. Reads the leakage-safe
 * player-game dataset from build-nfl-td-calibration-dataset.ts and evaluates
 * simple, interpretable score -> anytime-TD-probability calibrators with
 * chronological rolling-origin validation. Writes research artifacts only;
 * nothing is wired into production.
 *
 * Methods:
 *   A naive         p = jkbTdScore / 100
 *   B base rate     p = train mean(actualTd)
 *   C position rate p = train mean(actualTd | position)
 *   D logistic      logit p = a + b * (score/100)
 *   E logistic+pos  logit p = a + b * (score/100) + gamma_position
 *   F isotonic      PAV(score -> rate) on train, step-interpolated
 *   G per-position  separate logistic (a,b) per position (>= MIN_POS_TRAIN rows)
 *
 * Folds (rolling origin):
 *   primary   : train 2022        -> test 2023
 *               train 2022-2023   -> test 2024
 *               train 2022-2024   -> test 2025
 *   secondary : train 2023        -> test 2024   (2022 excluded)
 *               train 2023-2024   -> test 2025
 *
 * Usage: npx tsx scripts/research/run-nfl-td-calibration.ts [--strategy=production|trailing8|trailing10|priorSeasonThruW4|blendThruW4]
 */
import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "data", "nfl", "research", "td-calibration");

const STRATEGY = process.argv.find((a) => a.startsWith("--strategy="))?.split("=")[1] ?? "production";
const MIN_POS_TRAIN = 400;
const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
type Position = (typeof POSITIONS)[number];

type Row = {
  strategy: string;
  season: number;
  week: number;
  position: Position;
  jkbTdScore: number | null;
  scoreState: string;
  actualTd: number;
  earlySeasonFlag: boolean;
  rookieOrNoPriorFlag: boolean;
  playerPriorGames: number;
};

const allRows: Row[] = gunzipSync(readFileSync(path.join(DIR, "calibration-dataset.jsonl.gz")))
  .toString("utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as Row)
  .filter((r) => r.strategy === STRATEGY);

/** Fittable rows: a real (non-null) JKB TD Score. */
const scored = allRows.filter((r) => r.scoreState === "available" && r.jkbTdScore != null);

// ---------------------------------------------------------------------------
// math helpers
// ---------------------------------------------------------------------------
const clamp = (p: number, eps = 1e-9) => Math.min(1 - eps, Math.max(eps, p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const round = (v: number, d = 5) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/** Logistic regression via IRLS (Newton-Raphson). X includes intercept col. */
function fitLogistic(X: number[][], y: number[], ridge = 1e-6, iters = 50): number[] {
  const k = X[0].length;
  let beta = new Array(k).fill(0);
  for (let it = 0; it < iters; it += 1) {
    const grad = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < X.length; i += 1) {
      const xi = X[i];
      let z = 0;
      for (let j = 0; j < k; j += 1) z += beta[j] * xi[j];
      const p = sigmoid(z);
      const w = Math.max(p * (1 - p), 1e-9);
      const r = y[i] - p;
      for (let j = 0; j < k; j += 1) {
        grad[j] += r * xi[j];
        for (let l = 0; l < k; l += 1) H[j][l] += w * xi[j] * xi[l];
      }
    }
    for (let j = 0; j < k; j += 1) {
      grad[j] -= ridge * beta[j];
      H[j][j] += ridge;
    }
    const delta = solve(H, grad);
    let maxStep = 0;
    for (let j = 0; j < k; j += 1) {
      beta[j] += delta[j];
      maxStep = Math.max(maxStep, Math.abs(delta[j]));
    }
    if (maxStep < 1e-8) break;
  }
  return beta;
}

/** Gaussian elimination solve H d = g. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-12;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col] / d;
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** Pool-adjacent-violators isotonic fit: returns sorted (x, yhat) knots. */
function fitIsotonic(pairs: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const sorted = [...pairs].sort((a, b) => a.x - b.x);
  const blocks: Array<{ sumY: number; n: number; x: number }> = [];
  for (const p of sorted) {
    blocks.push({ sumY: p.y, n: 1, x: p.x });
    while (blocks.length > 1 && blocks[blocks.length - 2].sumY / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sumY / blocks[blocks.length - 1].n) {
      const b = blocks.pop()!;
      const a = blocks.pop()!;
      blocks.push({ sumY: a.sumY + b.sumY, n: a.n + b.n, x: a.x });
    }
  }
  // expand blocks back to knot list at each block's left x with its mean
  const knots: Array<{ x: number; y: number }> = [];
  let idx = 0;
  for (const b of blocks) {
    const yhat = b.sumY / b.n;
    for (let i = 0; i < b.n; i += 1) {
      knots.push({ x: sorted[idx].x, y: yhat });
      idx += 1;
    }
  }
  return knots;
}

function isotonicPredict(knots: Array<{ x: number; y: number }>, x: number): number {
  if (x <= knots[0].x) return knots[0].y;
  if (x >= knots[knots.length - 1].x) return knots[knots.length - 1].y;
  let lo = 0;
  let hi = knots.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (knots[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = knots[lo];
  const b = knots[hi];
  if (b.x === a.x) return a.y;
  const t = (x - a.x) / (b.x - a.x);
  return a.y + t * (b.y - a.y);
}

// ---------------------------------------------------------------------------
// metrics
// ---------------------------------------------------------------------------
function auc(preds: number[], y: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  for (let i = 0; i < y.length; i += 1) (y[i] === 1 ? pos : neg).push(preds[i]);
  if (!pos.length || !neg.length) return NaN;
  const all = preds.map((p, i) => ({ p, y: y[i] })).sort((a, b) => a.p - b.p);
  let rankSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j < all.length && all[j].p === all[i].p) j += 1;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) if (all[k].y === 1) rankSum += avgRank;
    i = j;
  }
  return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

function reliability(preds: number[], y: number[], bins = 10) {
  const table: Array<{ bin: string; n: number; predMean: number | null; obsRate: number | null }> = [];
  let ece = 0;
  for (let b = 0; b < bins; b += 1) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const idx: number[] = [];
    for (let i = 0; i < preds.length; i += 1) {
      const p = preds[i];
      if ((b === bins - 1 && p >= lo && p <= hi) || (p >= lo && p < hi)) idx.push(i);
    }
    const n = idx.length;
    const pm = n ? mean(idx.map((i) => preds[i])) : null;
    const om = n ? mean(idx.map((i) => y[i])) : null;
    if (n && pm != null && om != null) ece += (n / preds.length) * Math.abs(pm - om);
    table.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n, predMean: pm == null ? null : round(pm, 4), obsRate: om == null ? null : round(om, 4) });
  }
  return { table, ece: round(ece, 5) };
}

function evaluate(preds: number[], y: number[]) {
  const n = y.length;
  const brier = mean(preds.map((p, i) => (p - y[i]) ** 2));
  const logloss = mean(preds.map((p, i) => {
    const c = clamp(p);
    return -(y[i] * Math.log(c) + (1 - y[i]) * Math.log(1 - c));
  }));
  const rel = reliability(preds, y);
  // calibration slope/intercept: logistic regression y ~ logit(pred)
  const logits = preds.map((p) => Math.log(clamp(p) / (1 - clamp(p))));
  const [ci, cs] = fitLogistic(logits.map((l) => [1, l]), y);
  return {
    n,
    baseRate: round(mean(y), 5),
    meanPred: round(mean(preds), 5),
    brier: round(brier, 6),
    logLoss: round(logloss, 6),
    auc: round(auc(preds, y), 5),
    ece: rel.ece,
    calibrationIntercept: round(ci, 4),
    calibrationSlope: round(cs, 4),
    reliability: rel.table,
  };
}

// ---------------------------------------------------------------------------
// model family
// ---------------------------------------------------------------------------
type Predictor = (rows: Row[]) => number[];

function buildModels(train: Row[]): Record<string, Predictor> {
  const s01 = (r: Row) => (r.jkbTdScore as number) / 100;
  const base = mean(train.map((r) => r.actualTd));
  const posRate: Record<string, number> = {};
  for (const p of POSITIONS) {
    const sub = train.filter((r) => r.position === p);
    posRate[p] = sub.length ? mean(sub.map((r) => r.actualTd)) : base;
  }

  const dBeta = fitLogistic(train.map((r) => [1, s01(r)]), train.map((r) => r.actualTd));

  const posIndex: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3 };
  const eX = (r: Row) => {
    const d = [0, 0, 0]; // QB is reference
    if (posIndex[r.position] > 0) d[posIndex[r.position] - 1] = 1;
    return [1, s01(r), ...d];
  };
  const eBeta = fitLogistic(train.map(eX), train.map((r) => r.actualTd));

  const iso = fitIsotonic(train.map((r) => ({ x: s01(r), y: r.actualTd })));

  const gBeta: Record<string, number[] | null> = {};
  for (const p of POSITIONS) {
    const sub = train.filter((r) => r.position === p);
    gBeta[p] = sub.length >= MIN_POS_TRAIN ? fitLogistic(sub.map((r) => [1, s01(r)]), sub.map((r) => r.actualTd)) : null;
  }

  return {
    "A_naive_score/100": (rows) => rows.map((r) => clamp(s01(r))),
    "B_base_rate": (rows) => rows.map(() => base),
    "C_position_rate": (rows) => rows.map((r) => posRate[r.position]),
    "D_logistic": (rows) => rows.map((r) => sigmoid(dBeta[0] + dBeta[1] * s01(r))),
    "E_logistic_position": (rows) =>
      rows.map((r) => {
        const x = eX(r);
        return sigmoid(x.reduce((a, v, j) => a + v * eBeta[j], 0));
      }),
    "F_isotonic": (rows) => rows.map((r) => clamp(isotonicPredict(iso, s01(r)))),
    "G_position_specific": (rows) =>
      rows.map((r) => {
        const b = gBeta[r.position];
        return b ? sigmoid(b[0] + b[1] * s01(r)) : sigmoid(dBeta[0] + dBeta[1] * s01(r));
      }),
  };
}

// ---------------------------------------------------------------------------
// folds
// ---------------------------------------------------------------------------
type Fold = { name: string; train: number[]; test: number };
const PRIMARY_FOLDS: Fold[] = [
  { name: "train2022_test2023", train: [2022], test: 2023 },
  { name: "train2022-2023_test2024", train: [2022, 2023], test: 2024 },
  { name: "train2022-2024_test2025", train: [2022, 2023, 2024], test: 2025 },
];
const SECONDARY_FOLDS: Fold[] = [
  { name: "train2023_test2024", train: [2023], test: 2024 },
  { name: "train2023-2024_test2025", train: [2023, 2024], test: 2025 },
];

function runFolds(folds: Fold[]) {
  const out: Record<string, unknown>[] = [];
  for (const fold of folds) {
    const train = scored.filter((r) => fold.train.includes(r.season));
    const test = scored.filter((r) => r.season === fold.test);
    const models = buildModels(train);
    const methods: Record<string, unknown> = {};
    for (const [name, predict] of Object.entries(models)) {
      methods[name] = evaluate(predict(test), test.map((r) => r.actualTd));
    }
    out.push({ fold: fold.name, trainSeasons: fold.train, testSeason: fold.test, trainN: train.length, testN: test.length, methods });
  }
  return out;
}

/** Mean OOS metric per method across a fold set (for model selection). */
function methodSummary(foldResults: Record<string, unknown>[]) {
  const acc: Record<string, { brier: number[]; logLoss: number[]; auc: number[]; ece: number[]; slope: number[] }> = {};
  for (const fr of foldResults) {
    for (const [name, m] of Object.entries(fr.methods as Record<string, ReturnType<typeof evaluate>>)) {
      acc[name] ??= { brier: [], logLoss: [], auc: [], ece: [], slope: [] };
      acc[name].brier.push(m.brier as number);
      acc[name].logLoss.push(m.logLoss as number);
      acc[name].auc.push(m.auc as number);
      acc[name].ece.push(m.ece as number);
      acc[name].slope.push(m.calibrationSlope as number);
    }
  }
  const summary: Record<string, unknown> = {};
  for (const [name, a] of Object.entries(acc)) {
    summary[name] = {
      meanBrier: round(mean(a.brier), 6),
      meanLogLoss: round(mean(a.logLoss), 6),
      meanAuc: round(mean(a.auc), 5),
      meanEce: round(mean(a.ece), 5),
      meanCalibrationSlope: round(mean(a.slope), 4),
    };
  }
  return summary;
}

// ---------------------------------------------------------------------------
// position-curve comparison (global vs position)
// ---------------------------------------------------------------------------
function positionCurves() {
  const out: Record<string, unknown> = {};
  for (const p of ["ALL", ...POSITIONS]) {
    const sub = p === "ALL" ? scored : scored.filter((r) => r.position === p);
    const bins: Array<Record<string, unknown>> = [];
    for (let lo = 0; lo < 100; lo += 10) {
      const hi = lo + 10;
      const inBin = sub.filter((r) => {
        const v = r.jkbTdScore as number;
        return lo === 90 ? v >= lo && v <= hi : v >= lo && v < hi;
      });
      const n = inBin.length;
      const rate = n ? mean(inBin.map((r) => r.actualTd)) : null;
      bins.push({ bin: `${lo}-${hi}`, n, obsRate: rate == null ? null : round(rate, 4), se: n && rate != null ? round(Math.sqrt((rate * (1 - rate)) / n), 4) : null });
    }
    out[p] = { n: sub.length, baseRate: sub.length ? round(mean(sub.map((r) => r.actualTd)), 4) : null, bins };
  }
  return out;
}

// ---------------------------------------------------------------------------
// finer / quantile bins on the full scored set
// ---------------------------------------------------------------------------
function quantileBins(nBins = 20) {
  const sorted = [...scored].sort((a, b) => (a.jkbTdScore as number) - (b.jkbTdScore as number));
  const per = Math.floor(sorted.length / nBins);
  const out: Array<Record<string, unknown>> = [];
  for (let b = 0; b < nBins; b += 1) {
    const slice = sorted.slice(b * per, b === nBins - 1 ? sorted.length : (b + 1) * per);
    const rate = mean(slice.map((r) => r.actualTd));
    out.push({
      bin: b + 1,
      n: slice.length,
      scoreLo: round(slice[0].jkbTdScore as number, 2),
      scoreHi: round(slice[slice.length - 1].jkbTdScore as number, 2),
      avgScore: round(mean(slice.map((r) => r.jkbTdScore as number)), 2),
      obsRate: round(rate, 4),
      se: round(Math.sqrt((rate * (1 - rate)) / slice.length), 4),
    });
  }
  // Spearman between avgScore and obsRate
  return out;
}

// ---------------------------------------------------------------------------
// assemble
// ---------------------------------------------------------------------------
const primary = runFolds(PRIMARY_FOLDS);
const secondary = runFolds(SECONDARY_FOLDS);
const primarySummary = methodSummary(primary);
const secondarySummary = methodSummary(secondary);

// sensitivity: established contributors only (>=1 prior game)
const scoredEstablished = scored.filter((r) => r.playerPriorGames >= 1);
function runFoldsOn(rowset: Row[], folds: Fold[]) {
  const out: Record<string, unknown>[] = [];
  for (const fold of folds) {
    const train = rowset.filter((r) => fold.train.includes(r.season));
    const test = rowset.filter((r) => r.season === fold.test);
    const models = buildModels(train);
    const methods: Record<string, unknown> = {};
    for (const [name, predict] of Object.entries(models)) methods[name] = evaluate(predict(test), test.map((r) => r.actualTd));
    out.push({ fold: fold.name, trainN: train.length, testN: test.length, methods });
  }
  return out;
}

// candidate production calibrator: logistic fit on the largest primary training
// window (2022-2024). Reported, NOT wired in.
const trainFull = scored.filter((r) => [2022, 2023, 2024].includes(r.season));
const candBeta = fitLogistic(trainFull.map((r) => [1, (r.jkbTdScore as number) / 100]), trainFull.map((r) => r.actualTd));
const test2025 = scored.filter((r) => r.season === 2025);
const candPreds2025 = test2025.map((r) => sigmoid(candBeta[0] + candBeta[1] * ((r.jkbTdScore as number) / 100)));
const candEval2025 = evaluate(candPreds2025, test2025.map((r) => r.actualTd));

// week-band diagnostics: apply the candidate calibrator (train 2022-2024) to
// 2025, sliced by week band, to probe early-season small-window stability.
function weekBandDiagnostics() {
  const sig = (z: number) => 1 / (1 + Math.exp(-z));
  const predict = (r: Row) => sig(candBeta[0] + candBeta[1] * ((r.jkbTdScore as number) / 100));
  const bands: Array<{ name: string; test: (r: Row) => boolean }> = [
    { name: "2025_week1", test: (r) => r.season === 2025 && r.week === 1 },
    { name: "2025_weeks2-4", test: (r) => r.season === 2025 && r.week >= 2 && r.week <= 4 },
    { name: "2025_weeks5-9", test: (r) => r.season === 2025 && r.week >= 5 && r.week <= 9 },
    { name: "2025_weeks10-18", test: (r) => r.season === 2025 && r.week >= 10 },
  ];
  return bands.map((b) => {
    const sub = test2025.filter(b.test);
    return { band: b.name, ...evaluate(sub.map(predict), sub.map((r) => r.actualTd)) };
  });
}

const results = {
  schemaVersion: "nfl-td-calibration-results-v1",
  generatedAt: new Date().toISOString(),
  strategy: STRATEGY,
  dataset: {
    file: "player-game-dataset.jsonl",
    totalRowsWindow: allRows.length,
    scoredRows: scored.length,
    nullScoreRows: allRows.length - scored.length,
    baseRateScored: round(mean(scored.map((r) => r.actualTd)), 5),
    bySeason: Object.fromEntries(
      [2022, 2023, 2024, 2025].map((s) => [s, scored.filter((r) => r.season === s).length]),
    ),
  },
  scoreBinsDecile: positionCurves().ALL,
  quantileBins20: quantileBins(20),
  positionCurves: positionCurves(),
  rollingOrigin: { primary, secondary },
  methodSummary: { primary: primarySummary, secondary: secondarySummary },
  weekBandDiagnostics2025: weekBandDiagnostics(),
  sensitivityEstablishedContributors: {
    n: scoredEstablished.length,
    primary: runFoldsOn(scoredEstablished, PRIMARY_FOLDS),
  },
  candidateCalibrator: {
    method: "global logistic  logit(p) = a + b * (jkbTdScore / 100)",
    trainSeasons: [2022, 2023, 2024],
    trainN: trainFull.length,
    coefficients: { a: round(candBeta[0], 6), b: round(candBeta[1], 6) },
    formula: `p = 1 / (1 + exp(-(${round(candBeta[0], 4)} + ${round(candBeta[1], 4)} * (jkbTdScore/100))))`,
    heldOut2025: candEval2025,
  },
};

mkdirSync(DIR, { recursive: true });
writeFileSync(path.join(DIR, `calibration-results${STRATEGY === "production" ? "" : "-" + STRATEGY}.json`), JSON.stringify(results, null, 2) + "\n", "utf8");

// candidate-model.json only for the production window
if (STRATEGY === "production") {
  writeFileSync(
    path.join(DIR, "candidate-model.json"),
    JSON.stringify(
      {
        schemaVersion: "nfl-td-score-calibrator-candidate-v1",
        status: "RESEARCH ONLY — not wired into production",
        method: "global-logistic",
        version: "td-score-calibrator-candidate-2022-2024",
        generatedAt: new Date().toISOString(),
        trainSeasons: [2022, 2023, 2024],
        trainN: trainFull.length,
        input: "jkbTdScore (0-100 production JKB TD Score, production window)",
        transform: "x = jkbTdScore / 100",
        coefficients: { intercept: round(candBeta[0], 6), slope: round(candBeta[1], 6) },
        predict: "p_anytime_td = 1 / (1 + exp(-(intercept + slope * x)))",
        heldOut2025Metrics: {
          n: candEval2025.n,
          brier: candEval2025.brier,
          logLoss: candEval2025.logLoss,
          auc: candEval2025.auc,
          ece: candEval2025.ece,
          calibrationSlope: candEval2025.calibrationSlope,
          calibrationIntercept: candEval2025.calibrationIntercept,
        },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// console digest
// ---------------------------------------------------------------------------
console.log(`strategy=${STRATEGY}  scored=${scored.length}  baseRate=${results.dataset.baseRateScored}`);
console.log("\nrolling-origin PRIMARY — mean OOS by method:");
for (const [m, v] of Object.entries(primarySummary)) {
  const s = v as Record<string, number>;
  console.log(`  ${m.padEnd(22)} Brier=${s.meanBrier}  LogLoss=${s.meanLogLoss}  AUC=${s.meanAuc}  ECE=${s.meanEce}  calSlope=${s.meanCalibrationSlope}`);
}
console.log("\nrolling-origin SECONDARY (2022 excluded) — mean OOS by method:");
for (const [m, v] of Object.entries(secondarySummary)) {
  const s = v as Record<string, number>;
  console.log(`  ${m.padEnd(22)} Brier=${s.meanBrier}  LogLoss=${s.meanLogLoss}  AUC=${s.meanAuc}  ECE=${s.meanEce}  calSlope=${s.meanCalibrationSlope}`);
}
console.log("\ncandidate calibrator (global logistic, train 2022-2024) held-out 2025:");
console.log(`  ${results.candidateCalibrator.formula}`);
console.log(`  Brier=${candEval2025.brier}  LogLoss=${candEval2025.logLoss}  AUC=${candEval2025.auc}  ECE=${candEval2025.ece}  calSlope=${candEval2025.calibrationSlope}  calIntercept=${candEval2025.calibrationIntercept}`);
console.log("\n20-quantile reliability (full scored set):");
for (const b of results.quantileBins20) {
  const x = b as Record<string, number>;
  console.log(`  bin ${String(x.bin).padStart(2)}  n=${x.n}  score ${x.scoreLo}-${x.scoreHi}  avg=${x.avgScore}  obsTdRate=${x.obsRate} ±${x.se}`);
}
console.log(`\nwrote calibration-results${STRATEGY === "production" ? "" : "-" + STRATEGY}.json`);
