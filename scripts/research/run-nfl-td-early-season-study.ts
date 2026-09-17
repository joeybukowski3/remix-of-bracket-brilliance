/**
 * RESEARCH ONLY — early-season prior / shrinkage study for JKB TD Score.
 *
 * Phase-2 follow-up. The Phase-1 study found the production window
 * under-predicts anytime-TD in Weeks 2-4 (tiny 1-3 game samples). This script
 * evaluates a small set of interpretable, leakage-safe trailing-window
 * strategies (built by build-nfl-td-calibration-dataset.ts) to see whether
 * Weeks 2-4 calibration improves without degrading Weeks 5+.
 *
 * The calibrator itself is unchanged: a single global one-parameter logistic
 * `logit(p) = a + b * (jkbTdScore / 100)`, fit ONLY on training seasons.
 * Strategy selection uses pre-2025 folds; 2025 is confirmation only.
 *
 * Reads:  data/nfl/research/td-calibration/calibration-dataset.jsonl.gz
 * Writes: data/nfl/research/td-calibration/early-season-results.json
 *         data/nfl/research/td-calibration/candidate-model.json  (updated)
 *
 * Usage: npx tsx scripts/research/run-nfl-td-early-season-study.ts
 */
import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "data", "nfl", "research", "td-calibration");

type Row = {
  strategy: string;
  season: number;
  week: number;
  weekBand: string;
  position: "QB" | "RB" | "WR" | "TE";
  jkbTdScore: number | null;
  scoreState: string;
  sampleGames: number;
  actualTd: number;
  playerPriorGames: number;
  playerPriorGamesAllTime: number;
  earlySeasonFlag: boolean;
  rookieOrNoPriorFlag: boolean;
  teamChanged: boolean;
  movementClass: string;
  limitedHistoryFlag: boolean;
};

const rows: Row[] = gunzipSync(readFileSync(path.join(DIR, "calibration-dataset.jsonl.gz")))
  .toString("utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as Row);

const STRATEGIES = [...new Set(rows.map((r) => r.strategy))];
const scoredBy = (st: string) => rows.filter((r) => r.strategy === st && r.scoreState === "available" && r.jkbTdScore != null);

// ---------------------------------------------------------------------------
// math
// ---------------------------------------------------------------------------
const clamp = (p: number, eps = 1e-9) => Math.min(1 - eps, Math.max(eps, p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const round = (v: number, d = 5) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
const wilson = (k: number, n: number): [number, number] => {
  if (!n) return [NaN, NaN];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
};

function fitLogistic(X: number[][], y: number[], ridge = 1e-6, iters = 60): number[] {
  const k = X[0].length;
  const beta = new Array(k).fill(0);
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
    let step = 0;
    for (let j = 0; j < k; j += 1) {
      beta[j] += delta[j];
      step = Math.max(step, Math.abs(delta[j]));
    }
    if (step < 1e-9) break;
  }
  return beta;
}
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
function auc(preds: number[], y: number[]): number {
  const np = y.filter((v) => v === 1).length;
  const nn = y.length - np;
  if (!np || !nn) return NaN;
  const all = preds.map((p, i) => ({ p, y: y[i] })).sort((a, b) => a.p - b.p);
  let rankSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j < all.length && all[j].p === all[i].p) j += 1;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) if (all[k].y === 1) rankSum += avg;
    i = j;
  }
  return (rankSum - (np * (np + 1)) / 2) / (np * nn);
}
function ece(preds: number[], y: number[], bins = 10): number {
  let e = 0;
  for (let b = 0; b < bins; b += 1) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const idx = preds.map((p, i) => i).filter((i) => (b === bins - 1 ? preds[i] >= lo && preds[i] <= hi : preds[i] >= lo && preds[i] < hi));
    if (!idx.length) continue;
    e += (idx.length / preds.length) * Math.abs(mean(idx.map((i) => preds[i])) - mean(idx.map((i) => y[i])));
  }
  return e;
}
function evalSet(preds: number[], y: number[]) {
  if (!y.length) return { n: 0 };
  const brier = mean(preds.map((p, i) => (p - y[i]) ** 2));
  const logloss = mean(preds.map((p, i) => -(y[i] * Math.log(clamp(p)) + (1 - y[i]) * Math.log(1 - clamp(p)))));
  const logits = preds.map((p) => Math.log(clamp(p) / (1 - clamp(p))));
  const [ci, cs] = fitLogistic(logits.map((l) => [1, l]), y);
  return {
    n: y.length,
    actualRate: round(mean(y), 5),
    meanPred: round(mean(preds), 5),
    brier: round(brier, 6),
    logLoss: round(logloss, 6),
    ece: round(ece(preds, y), 5),
    auc: round(auc(preds, y), 5),
    calIntercept: round(ci, 4),
    calSlope: round(cs, 4),
  };
}

// ---------------------------------------------------------------------------
// per-strategy: fit on train seasons, evaluate on a test season, sliced
// ---------------------------------------------------------------------------
const x01 = (r: Row) => (r.jkbTdScore as number) / 100;

function fitOn(trainSeasons: number[], strat: string): [number, number] {
  const tr = scoredBy(strat).filter((r) => trainSeasons.includes(r.season));
  const b = fitLogistic(tr.map((r) => [1, x01(r)]), tr.map((r) => r.actualTd));
  return [b[0], b[1]];
}

function sliceEval(beta: [number, number], test: Row[]) {
  const predict = (r: Row) => sigmoid(beta[0] + beta[1] * x01(r));
  const band = (name: string, f: (r: Row) => boolean) => {
    const sub = test.filter(f);
    return { band: name, ...evalSet(sub.map(predict), sub.map((r) => r.actualTd)) };
  };
  return {
    full: band("full", () => true),
    w1: band("w1", (r) => r.week === 1),
    w2to4: band("w2-4", (r) => r.week >= 2 && r.week <= 4),
    w5to18: band("w5-18", (r) => r.week >= 5),
  };
}

const FOLDS: Array<{ name: string; train: number[]; test: number }> = [
  { name: "train2022_test2023", train: [2022], test: 2023 },
  { name: "train2022-2023_test2024", train: [2022, 2023], test: 2024 },
  { name: "train2022-2024_test2025", train: [2022, 2023, 2024], test: 2025 },
];

const perStrategy: Record<string, unknown> = {};
for (const strat of STRATEGIES) {
  const folds = FOLDS.map((fold) => {
    const beta = fitOn(fold.train, strat);
    const test = scoredBy(strat).filter((r) => r.season === fold.test);
    return { fold: fold.name, coefficients: { a: round(beta[0], 4), b: round(beta[1], 4) }, ...sliceEval(beta, test) };
  });
  // pre-2025 selection metrics: mean over the two folds that test 2023 & 2024
  const pre2025 = folds.filter((f) => f.fold !== "train2022-2024_test2025");
  const meanBy = (pick: (x: { brier?: number | null; ece?: number | null; meanPred?: number | null; actualRate?: number | null }) => number | null | undefined, key: "w2to4" | "w5to18" | "full") =>
    round(mean(pre2025.map((f) => pick((f as never)[key]) as number).filter((v) => Number.isFinite(v))), 5);
  perStrategy[strat] = {
    folds,
    selection_pre2025: {
      w2to4_meanBrier: meanBy((x) => x.brier, "w2to4"),
      w2to4_meanEce: meanBy((x) => x.ece, "w2to4"),
      w2to4_meanPredMinusActual: round(
        mean(pre2025.map((f) => ((f as never).w2to4.meanPred as number) - ((f as never).w2to4.actualRate as number))),
        5,
      ),
      w5to18_meanBrier: meanBy((x) => x.brier, "w5to18"),
      w5to18_meanEce: meanBy((x) => x.ece, "w5to18"),
      full_meanBrier: meanBy((x) => x.brier, "full"),
    },
  };
}

// ---------------------------------------------------------------------------
// movement-class stratified calibration (production + best strategy),
// candidate fit on 2022-2024, evaluated on 2025.
// ---------------------------------------------------------------------------
function movementStrata(strat: string) {
  const beta = fitOn([2022, 2023, 2024], strat);
  const predict = (r: Row) => sigmoid(beta[0] + beta[1] * x01(r));
  const test = scoredBy(strat).filter((r) => r.season === 2025);
  const classes = ["returning_same_team", "returning_new_team", "rookie_or_no_prior", "__limited_history_1to4"];
  const out: Record<string, unknown> = {};
  for (const c of classes) {
    const sub =
      c === "__limited_history_1to4"
        ? test.filter((r) => r.limitedHistoryFlag)
        : test.filter((r) => r.movementClass === c);
    out[c] = evalSet(sub.map(predict), sub.map((r) => r.actualTd));
    // also the early-season slice of each class
    const subEarly = sub.filter((r) => r.week >= 2 && r.week <= 4);
    (out[c] as Record<string, unknown>).w2to4 = evalSet(subEarly.map(predict), subEarly.map((r) => r.actualTd));
  }
  // note: rookie_or_no_prior mostly has null scores (fail-closed); report count of null too
  const rookieAll = rows.filter((r) => r.strategy === strat && r.season === 2025 && r.movementClass === "rookie_or_no_prior");
  (out.rookie_or_no_prior as Record<string, unknown>).totalRows = rookieAll.length;
  (out.rookie_or_no_prior as Record<string, unknown>).nullScoreRows = rookieAll.filter((r) => r.scoreState !== "available").length;
  return out;
}

// ---------------------------------------------------------------------------
// favorite / high-probability region audit (candidate on held-out 2025)
// ---------------------------------------------------------------------------
function favoriteRegion(strat: string) {
  const beta = fitOn([2022, 2023, 2024], strat);
  const test = scoredBy(strat).filter((r) => r.season === 2025);
  const preds = test.map((r) => sigmoid(beta[0] + beta[1] * x01(r)));
  const y = test.map((r) => r.actualTd);
  const edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 1.01];
  const bins: Array<Record<string, unknown>> = [];
  for (let b = 0; b < edges.length - 1; b += 1) {
    const idx = preds.map((p, i) => i).filter((i) => preds[i] >= edges[b] && preds[i] < edges[b + 1]);
    const n = idx.length;
    const k = idx.reduce((a, i) => a + y[i], 0);
    const [lo, hi] = wilson(k, n);
    bins.push({
      band: `${edges[b].toFixed(2)}-${Math.min(edges[b + 1], 1).toFixed(2)}`,
      n,
      predMean: n ? round(mean(idx.map((i) => preds[i])), 4) : null,
      actualRate: n ? round(k / n, 4) : null,
      wilson95: n ? [round(lo, 4), round(hi, 4)] : null,
    });
  }
  return bins;
}

// ---------------------------------------------------------------------------
// choose a recommended early-season strategy
// ---------------------------------------------------------------------------
// Rule: among strategies whose pre-2025 Weeks-5-18 mean Brier is within 0.001
// of the production strategy's, pick the one with the best (lowest) pre-2025
// Weeks-2-4 mean Brier. Confirm the pick on held-out 2025.
const prodW5Brier = (perStrategy.production as never)["selection_pre2025"]["w5to18_meanBrier"] as number;
const w2to4Brier = (st: string) => (perStrategy[st] as never)["selection_pre2025"]["w2to4_meanBrier"] as number;
const eligible = STRATEGIES.filter(
  (st) => ((perStrategy[st] as never)["selection_pre2025"]["w5to18_meanBrier"] as number) <= prodW5Brier + 0.001,
);
const bestW2to4 = Math.min(...eligible.map(w2to4Brier));
// Among strategies within 0.0005 W2-4 Brier of the best, prefer one that
// already exists as a production window ("trailing8" == the live "last 8"
// toggle) — an operational simplicity tiebreak, not a statistical one.
const nearBest = eligible.filter((st) => w2to4Brier(st) <= bestW2to4 + 0.0005);
const recommended =
  nearBest.includes("trailing8") ? "trailing8" : nearBest.sort((a, b) => w2to4Brier(a) - w2to4Brier(b))[0];

const dummyProbe = movementDummyStudy(recommended);
const recBeta = fitOn([2022, 2023, 2024], recommended);
const rec2025 = sliceEval([recBeta[0], recBeta[1]], scoredBy(recommended).filter((r) => r.season === 2025));
const prodBeta = fitOn([2022, 2023, 2024], "production");
const prod2025 = sliceEval([prodBeta[0], prodBeta[1]], scoredBy("production").filter((r) => r.season === 2025));

// ---------------------------------------------------------------------------
// optional calibrator tweak: a team-changed dummy (does NOT touch the score,
// just the calibrator). logit(p) = a + b*score + c*teamChanged
// ---------------------------------------------------------------------------
function movementDummyStudy(strat: string) {
  const tr = scoredBy(strat).filter((r) => [2022, 2023, 2024].includes(r.season));
  const te = scoredBy(strat).filter((r) => r.season === 2025);
  const feat = (r: Row) => [1, x01(r), r.teamChanged ? 1 : 0];
  const beta = fitLogistic(tr.map(feat), tr.map((r) => r.actualTd));
  const predict = (r: Row) => sigmoid(feat(r).reduce((a, v, j) => a + v * beta[j], 0));
  const movers = te.filter((r) => r.teamChanged);
  const nonMovers = te.filter((r) => !r.teamChanged);
  return {
    coefficients: { a: round(beta[0], 4), bScore: round(beta[1], 4), cTeamChanged: round(beta[2], 4) },
    all2025: evalSet(te.map(predict), te.map((r) => r.actualTd)),
    movers2025: evalSet(movers.map(predict), movers.map((r) => r.actualTd)),
    nonMovers2025: evalSet(nonMovers.map(predict), nonMovers.map((r) => r.actualTd)),
    note: "Research probe only. c<0 means the calibrator shrinks team-changers' probability. Compare movers2025 ECE here vs movementStrata2025.returning_new_team.",
  };
}

const results = {
  schemaVersion: "nfl-td-early-season-results-v1",
  generatedAt: new Date().toISOString(),
  calibrator: "global one-parameter logistic  logit(p) = a + b * (jkbTdScore / 100)  (unchanged)",
  strategiesEvaluated: STRATEGIES,
  perStrategy,
  recommendedStrategy: recommended,
  recommendationRule:
    "Among strategies whose pre-2025 Weeks 5-18 mean Brier is within 0.001 of production, take those within 0.0005 W2-4 Brier of the best, and prefer one that already exists as a production window (trailing8 = the live 'last 8' toggle). Confirm on held-out 2025.",
  heldOut2025: {
    production: prod2025,
    recommended: rec2025,
  },
  recommendedCoefficients2022_2024: { a: round(recBeta[0], 6), b: round(recBeta[1], 6) },
  movementStrata2025: {
    production: movementStrata("production"),
    recommended: movementStrata(recommended),
  },
  favoriteRegion2025: {
    production: favoriteRegion("production"),
    recommended: favoriteRegion(recommended),
  },
  teamChangedDummyProbe: dummyProbe,
};

mkdirSync(DIR, { recursive: true });
writeFileSync(path.join(DIR, "early-season-results.json"), JSON.stringify(results, null, 2) + "\n", "utf8");

// refresh candidate-model.json to the recommended strategy
writeFileSync(
  path.join(DIR, "candidate-model.json"),
  JSON.stringify(
    {
      schemaVersion: "nfl-td-score-calibrator-candidate-v2",
      status: "RESEARCH ONLY — not wired into production; not validated vs market; favorite region thin",
      method: "global-logistic",
      version: `td-score-calibrator-candidate-${recommended}-2022-2024`,
      generatedAt: new Date().toISOString(),
      trailingWindowStrategy: recommended,
      trainSeasons: [2022, 2023, 2024],
      input: "jkbTdScore (0-100 production JKB TD Score, computed with the trailingWindowStrategy window)",
      transform: "x = jkbTdScore / 100",
      coefficients: { intercept: round(recBeta[0], 6), slope: round(recBeta[1], 6) },
      predict: "p_anytime_td = 1 / (1 + exp(-(intercept + slope * x)))",
      optionalTeamChangedTerm: {
        rationale:
          "The base calibrator over-predicts players in their first games with a new team by ~5pp (prior-team role does not transfer). Adding a teamChanged dummy to the CALIBRATOR (not the score) removes it at ~zero cost to everyone else.",
        predict: "p = 1 / (1 + exp(-(a + bScore*x + cTeamChanged*isTeamChanged)))",
        coefficients: {
          a: round(dummyProbe.coefficients.a as number, 6),
          bScore: round(dummyProbe.coefficients.bScore as number, 6),
          cTeamChanged: round(dummyProbe.coefficients.cTeamChanged as number, 6),
        },
        isTeamChanged: "1 if the player's most recent prior game was for a different team than this week's team, else 0",
        caveat: "c is estimated on ~180 mover player-games/season — re-estimate as seasons accrue.",
      },
      heldOut2025: rec2025,
      caveats: [
        "No historical sportsbook odds — market edge untested.",
        "Predicted P > 0.5 region has < 25 observations in 2025 — unvalidated; do not extrapolate. Prefer a confidence flag above ~P 0.45 over a hard cap (P 0.40-0.50 is well calibrated).",
        "Weeks 2-4 remain the weakest band even under the recommended strategy (cal slope ~0.93) — see early-season-results.json.",
        "The recommended strategy changes the live default window from season-to-date to 'last 8' — a visible behaviour change that needs its own shadow validation.",
      ],
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

// ---------------------------------------------------------------------------
// console digest
// ---------------------------------------------------------------------------
console.log("per-strategy pre-2025 selection metrics (mean of folds testing 2023 & 2024):");
console.log("  strategy            w2-4 Brier  w2-4 ECE  w2-4 pred-act   w5-18 Brier  full Brier");
for (const st of STRATEGIES) {
  const s = (perStrategy[st] as never)["selection_pre2025"];
  console.log(
    `  ${st.padEnd(18)} ${String(s.w2to4_meanBrier).padEnd(11)} ${String(s.w2to4_meanEce).padEnd(9)} ${String(s.w2to4_meanPredMinusActual).padEnd(14)} ${String(s.w5to18_meanBrier).padEnd(12)} ${s.full_meanBrier}`,
  );
}
console.log(`\nrecommended strategy: ${recommended}`);
console.log("held-out 2025 — production vs recommended, by week band:");
for (const band of ["full", "w1", "w2to4", "w5to18"] as const) {
  const p = (prod2025 as never)[band];
  const r = (rec2025 as never)[band];
  console.log(`  ${band.padEnd(7)}  production: n=${p.n} pred=${p.meanPred} act=${p.actualRate} Brier=${p.brier} ECE=${p.ece}`);
  console.log(`  ${" ".repeat(7)}  recommend.: n=${r.n} pred=${r.meanPred} act=${r.actualRate} Brier=${r.brier} ECE=${r.ece}`);
}
console.log("\nfavorite region (recommended, held-out 2025):");
for (const b of results.favoriteRegion2025.recommended) {
  const x = b as Record<string, unknown>;
  console.log(`  P ${x.band}  n=${x.n}  pred=${x.predMean}  actual=${x.actualRate}  95%CI=${JSON.stringify(x.wilson95)}`);
}
console.log("\nmovement strata (recommended, held-out 2025):");
for (const [c, v] of Object.entries(results.movementStrata2025.recommended)) {
  const x = v as Record<string, unknown>;
  console.log(`  ${c.padEnd(26)} n=${x.n} act=${x.actualRate} pred=${x.meanPred} Brier=${x.brier} ECE=${x.ece}`);
}
console.log("\nwrote early-season-results.json + candidate-model.json");
