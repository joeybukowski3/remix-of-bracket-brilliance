/**
 * Prospective evaluation of shadow candidates versus production. Pure functions over (prediction, outcome) pairs.
 *
 * The evaluation NEVER declares a candidate superior: `verdict.status` is INSUFFICIENT_SAMPLE until `MIN_COMPLETED_WEEKS` distinct completed weeks and
 * `MIN_ROWS_PER_POSITION` scored rows exist, and even then reports only whether a paired 95% cluster-bootstrap interval excludes zero.
 */
export const MIN_COMPLETED_WEEKS = 6;
export const MIN_ROWS_PER_POSITION = 150;
export const POOL_SIZE = { QB: 24, RB: 48, WR: 72, TE: 24 } as const;
export const TOP_K: Record<string, readonly number[]> = { QB: [12], RB: [12, 24], WR: [12, 24], TE: [12] };
export type EvalPosition = "QB" | "RB" | "WR" | "TE";
export type ModelName = "production" | "candidateA" | "candidateB";

export type EvalRow = {
  position: EvalPosition; season: number; week: number; playerId: string; team: string;
  actual: number; played: boolean;
  production: number; productionRank: number; candidateA: number; candidateB: number | null;
};

export type PointMetrics = { n: number; mae: number; rmse: number; bias: number; calibrationIntercept: number | null; calibrationSlope: number | null; correlation: number | null };

export function pointMetrics(pred: readonly number[], actual: readonly number[]): PointMetrics {
  const n = pred.length;
  if (n === 0) return { n: 0, mae: NaN, rmse: NaN, bias: NaN, calibrationIntercept: null, calibrationSlope: null, correlation: null };
  const err = pred.map((p, i) => p - actual[i]);
  const mae = err.reduce((s, e) => s + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(err.reduce((s, e) => s + e * e, 0) / n);
  const bias = err.reduce((s, e) => s + e, 0) / n;
  const mp = pred.reduce((s, v) => s + v, 0) / n, ma = actual.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { sxx += (pred[i] - mp) ** 2; sxy += (pred[i] - mp) * (actual[i] - ma); syy += (actual[i] - ma) ** 2; }
  const slope = sxx > 1e-12 && n >= 3 ? sxy / sxx : null;
  return { n, mae, rmse, bias, calibrationSlope: slope, calibrationIntercept: slope == null ? null : ma - slope * mp, correlation: sxx > 1e-12 && syy > 1e-12 && n >= 3 ? sxy / Math.sqrt(sxx * syy) : null };
}

function ranks(values: readonly number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i; while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k += 1) out[order[k][1]] = avg; i = j + 1;
  }
  return out;
}
export function spearman(x: readonly number[], y: readonly number[]): number | null {
  if (x.length < 3) return null;
  const rx = ranks(x), ry = ranks(y); const n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i += 1) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
/** Fraction of pairs (actual scores differ) whose predicted order matches the realised order. */
export function pairwiseOrdering(pred: readonly number[], actual: readonly number[]): number | null {
  let ok = 0, total = 0;
  for (let i = 0; i < pred.length; i += 1) for (let j = i + 1; j < pred.length; j += 1) {
    if (actual[i] === actual[j]) continue;
    total += 1; if ((pred[i] - pred[j]) * (actual[i] - actual[j]) > 0) ok += 1;
  }
  return total ? ok / total : null;
}
/** |predicted top-k intersect actual top-k| / k. */
export function topKInclusion(pred: readonly number[], actual: readonly number[], k: number): number | null {
  if (pred.length < Math.ceil(k * 1.5)) return null;
  const top = (v: readonly number[]) => new Set(v.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, k).map(([, i]) => i));
  const p = top(pred), a = top(actual); let hit = 0; for (const i of p) if (a.has(i)) hit += 1;
  return hit / k;
}

export type RankMetrics = { weeks: number; spearman: number | null; pairwise: number | null; topK: Record<string, number | null> };
function weeklyRank(rows: readonly EvalRow[], pick: (row: EvalRow) => number | null, position: EvalPosition): RankMetrics {
  const byWeek = new Map<string, EvalRow[]>();
  for (const row of rows) byWeek.set(`${row.season}|${row.week}`, [...(byWeek.get(`${row.season}|${row.week}`) ?? []), row]);
  const sp: number[] = [], pw: number[] = []; const tk: Record<string, number[]> = {};
  for (const group of byWeek.values()) {
    const g = group.filter((row) => pick(row) != null);
    if (g.length < 8) continue;
    const pred = g.map((row) => pick(row) as number), act = g.map((row) => row.actual);
    const s = spearman(pred, act); if (s != null) sp.push(s);
    const p = pairwiseOrdering(pred, act); if (p != null) pw.push(p);
    for (const k of TOP_K[position]) { const t = topKInclusion(pred, act, k); if (t != null) (tk[`top${k}`] ??= []).push(t); }
  }
  const avg = (v: readonly number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
  return { weeks: sp.length, spearman: avg(sp), pairwise: avg(pw), topK: Object.fromEntries(Object.entries(tk).map(([k, v]) => [k, avg(v)])) };
}

/** Deterministic PRNG (mulberry32) so evaluations are reproducible. */
function rng(seed: number) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

export type PairedDiff = { n: number; clusters: number; dMae: number; dMaeCi: [number, number]; dRmse: number; dRmseCi: [number, number] };
/** Paired candidate-minus-production error differences; clusters = team-week (players on one team share game environment). Negative = candidate better. */
export function pairedVsProduction(rows: readonly EvalRow[], pick: (row: EvalRow) => number | null, boot = 2000, seed = 17): PairedDiff | null {
  const r = rows.filter((row) => pick(row) != null);
  if (!r.length) return null;
  const ids = new Map<string, number>(); const cl = r.map((row) => { const key = `${row.season}|${row.week}|${row.team}`; if (!ids.has(key)) ids.set(key, ids.size); return ids.get(key)!; });
  const k = ids.size; const sa = new Array(k).fill(0), sb = new Array(k).fill(0), sa2 = new Array(k).fill(0), sb2 = new Array(k).fill(0), cnt = new Array(k).fill(0);
  r.forEach((row, i) => { const ec = (pick(row) as number) - row.actual, ep = row.production - row.actual; sa[cl[i]] += Math.abs(ec); sb[cl[i]] += Math.abs(ep); sa2[cl[i]] += ec * ec; sb2[cl[i]] += ep * ep; cnt[cl[i]] += 1; });
  const stat = (idx: number[]) => { let n = 0, a = 0, b = 0, a2 = 0, b2 = 0; for (const c of idx) { n += cnt[c]; a += sa[c]; b += sb[c]; a2 += sa2[c]; b2 += sb2[c]; } return [a / n - b / n, Math.sqrt(a2 / n) - Math.sqrt(b2 / n)]; };
  const point = stat([...Array(k).keys()]); const rand = rng(seed); const dm: number[] = [], dr: number[] = [];
  for (let i = 0; i < boot; i += 1) { const idx = Array.from({ length: k }, () => Math.floor(rand() * k)); const [a, b] = stat(idx); dm.push(a); dr.push(b); }
  const ci = (v: number[]): [number, number] => { const s = [...v].sort((x, y) => x - y); return [s[Math.floor(0.025 * s.length)], s[Math.floor(0.975 * s.length) - 1]]; };
  return { n: r.length, clusters: k, dMae: point[0], dMaeCi: ci(dm), dRmse: point[1], dRmseCi: ci(dr) };
}

export type PositionEvaluation = {
  position: EvalPosition; scoredRows: number; completedWeeks: number;
  models: Partial<Record<ModelName, { pool: PointMetrics; poolPlayedOnly: PointMetrics; rank: RankMetrics }>>;
  pairedVsProduction: Partial<Record<"candidateA" | "candidateB", PairedDiff | null>>;
  verdict: { status: "INSUFFICIENT_SAMPLE" | "DESCRIPTIVE_ONLY"; reason: string };
};

export function evaluatePosition(all: readonly EvalRow[], position: EvalPosition): PositionEvaluation {
  const pool = all.filter((row) => row.position === position && row.productionRank <= POOL_SIZE[position]);
  const weeks = new Set(pool.map((row) => `${row.season}|${row.week}`)).size;
  const pickers: Record<ModelName, (row: EvalRow) => number | null> = { production: (row) => row.production, candidateA: (row) => row.candidateA, candidateB: (row) => row.candidateB };
  const models: PositionEvaluation["models"] = {};
  for (const name of ["production", "candidateA", "candidateB"] as const) {
    const usable = pool.filter((row) => pickers[name](row) != null);
    if (!usable.length) continue;
    const played = usable.filter((row) => row.played);
    models[name] = {
      pool: pointMetrics(usable.map((row) => pickers[name](row) as number), usable.map((row) => row.actual)),
      poolPlayedOnly: pointMetrics(played.map((row) => pickers[name](row) as number), played.map((row) => row.actual)),
      rank: weeklyRank(usable, pickers[name], position),
    };
  }
  const enough = weeks >= MIN_COMPLETED_WEEKS && pool.length >= MIN_ROWS_PER_POSITION;
  return {
    position, scoredRows: pool.length, completedWeeks: weeks, models,
    pairedVsProduction: { candidateA: pairedVsProduction(pool, pickers.candidateA), candidateB: pool.some((row) => row.candidateB != null) ? pairedVsProduction(pool, pickers.candidateB) : null },
    verdict: enough
      ? { status: "DESCRIPTIVE_ONLY", reason: "Sample thresholds met; interpret only via the paired intervals, never a single week." }
      : { status: "INSUFFICIENT_SAMPLE", reason: `Need >= ${MIN_COMPLETED_WEEKS} completed weeks and >= ${MIN_ROWS_PER_POSITION} pool rows; have ${weeks} weeks / ${pool.length} rows. No candidate may be called better or worse.` },
  };
}
