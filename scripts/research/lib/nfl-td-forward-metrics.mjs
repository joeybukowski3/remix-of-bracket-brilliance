/**
 * RESEARCH ONLY — binary-outcome probability metrics for the prospective 2026
 * JKB TD Score forward validation.
 *
 * Pure functions. The Brier / log-loss / ECE / AUC / calibration-bin math is
 * ported verbatim in spirit from `scripts/research/run-nfl-td-early-season-study.ts`
 * (the historical study's `evalSet` / `auc` / `ece`) so the forward summary is
 * measured on the same scale as the study it is validating.
 */

const clamp = (p, eps = 1e-9) => Math.min(1 - eps, Math.max(eps, p));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function round(value, digits = 5) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

/** Pair predictions with outcomes, dropping any index where either is null/NaN or y ∉ {0,1}. */
export function pairProbabilities(predictions, outcomes) {
  const n = Math.min(predictions.length, outcomes.length);
  const preds = [];
  const y = [];
  for (let i = 0; i < n; i += 1) {
    if (predictions[i] == null || predictions[i] === "" || outcomes[i] == null) continue;
    const p = Number(predictions[i]);
    const o = Number(outcomes[i]);
    if (!Number.isFinite(p) || (o !== 0 && o !== 1)) continue;
    preds.push(p);
    y.push(o);
  }
  return { preds, y };
}

export function brierScore(predictions, outcomes) {
  const { preds, y } = pairProbabilities(predictions, outcomes);
  if (!preds.length) return null;
  return mean(preds.map((p, i) => (p - y[i]) ** 2));
}

export function logLoss(predictions, outcomes) {
  const { preds, y } = pairProbabilities(predictions, outcomes);
  if (!preds.length) return null;
  return mean(preds.map((p, i) => -(y[i] * Math.log(clamp(p)) + (1 - y[i]) * Math.log(1 - clamp(p)))));
}

/** Expected Calibration Error over `bins` equal-width probability bins. */
export function expectedCalibrationError(predictions, outcomes, bins = 10) {
  const { preds, y } = pairProbabilities(predictions, outcomes);
  if (!preds.length) return null;
  let e = 0;
  for (let b = 0; b < bins; b += 1) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const idx = preds
      .map((_, i) => i)
      .filter((i) => (b === bins - 1 ? preds[i] >= lo && preds[i] <= hi : preds[i] >= lo && preds[i] < hi));
    if (!idx.length) continue;
    e += (idx.length / preds.length) * Math.abs(mean(idx.map((i) => preds[i])) - mean(idx.map((i) => y[i])));
  }
  return e;
}

/** ROC AUC via the rank-sum (Mann–Whitney) estimator, tie-aware. */
export function rocAuc(predictions, outcomes) {
  const { preds, y } = pairProbabilities(predictions, outcomes);
  const np = y.filter((v) => v === 1).length;
  const nn = y.length - np;
  if (!np || !nn) return null;
  const all = preds.map((p, i) => ({ p, y: y[i] })).sort((a, b) => a.p - b.p);
  let rankSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j < all.length && all[j].p === all[i].p) j += 1;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) if (all[k].y === 1) rankSum += avgRank;
    i = j;
  }
  return (rankSum - (np * (np + 1)) / 2) / (np * nn);
}

/** 95% Wilson interval for a binomial proportion. */
export function wilsonInterval(k, n) {
  if (!n) return [null, null];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [round((c - s) / d, 4), round((c + s) / d, 4)];
}

/**
 * Calibration table over the given probability-bin edges (default deciles).
 * @returns {{ band: string, n: number, predMean: number|null, actualRate: number|null, wilson95: [number|null,number|null] }[]}
 */
export function calibrationBins(predictions, outcomes, edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001]) {
  const { preds, y } = pairProbabilities(predictions, outcomes);
  const out = [];
  for (let b = 0; b < edges.length - 1; b += 1) {
    const lo = edges[b];
    const hi = edges[b + 1];
    const idx = preds.map((_, i) => i).filter((i) => preds[i] >= lo && preds[i] < hi);
    const n = idx.length;
    const k = idx.reduce((a, i) => a + y[i], 0);
    out.push({
      band: `${lo.toFixed(2)}-${Math.min(hi, 1).toFixed(2)}`,
      n,
      predMean: n ? round(mean(idx.map((i) => preds[i])), 4) : null,
      actualRate: n ? round(k / n, 4) : null,
      wilson95: n ? wilsonInterval(k, n) : [null, null],
    });
  }
  return out;
}

/** Headline metric block for one probability series against its outcomes. */
export function summarizeProbabilities(predictions, outcomes) {
  const { preds, y } = pairProbabilities(predictions, outcomes);
  if (!preds.length) return { n: 0 };
  return {
    n: preds.length,
    tdRate: round(mean(y), 5),
    meanPred: round(mean(preds), 5),
    brier: round(brierScore(preds, y), 6),
    logLoss: round(logLoss(preds, y), 6),
    ece: round(expectedCalibrationError(preds, y), 5),
    auc: round(rocAuc(preds, y), 5),
  };
}

/**
 * American-odds profit for a flat 1-unit stake on a settled bet.
 * win: +decimalProfit ; loss: -1 ; (no pushes in a 0.5 anytime-TD market)
 */
export function flatStakeProfit(americanPrice, won) {
  const price = Number(americanPrice);
  if (!Number.isFinite(price)) return null;
  if (won !== 0 && won !== 1) return null;
  if (won === 0) return -1;
  return price > 0 ? price / 100 : 100 / -price;
}

/**
 * Realized flat-stake ROI over a set of settled bets on the best sportsbook
 * price. Each row: { americanPrice: number, actualTd: 0|1 }.
 * ROI = totalProfit / nBets.
 */
export function flatStakeRoi(rows) {
  let profit = 0;
  let n = 0;
  for (const row of rows) {
    const p = flatStakeProfit(row.americanPrice, row.actualTd);
    if (p == null) continue;
    profit += p;
    n += 1;
  }
  if (!n) return { nBets: 0, totalProfit: 0, roi: null };
  return { nBets: n, totalProfit: round(profit, 4), roi: round(profit / n, 4) };
}
