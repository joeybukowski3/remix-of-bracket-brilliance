/**
 * RESEARCH-ONLY. Paired significance testing over the joined Method A /
 * Method B backtest sample produced by evaluate.mts.
 *
 * Every comparison is PAIRED on the same game, which is the only honest way
 * to test two margin models whose predictions correlate at r ~ 0.82: an
 * unpaired MAE gap of 0.1 points is meaningless noise, a paired one may not
 * be. Reports a paired t-statistic on |error| differences plus a
 * percentile bootstrap CI (10,000 resamples, fixed seed).
 *
 * Also evaluates a SITUATIONAL blend (different A/B weight by week band),
 * with every weight chosen on 2023-2024 only and applied to the untouched
 * 2025 holdout.
 *
 * Run: npx tsx scripts/research/nfl-margin-model-comparison/significance.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "out");

type Joined = {
  gameId: string; season: number; week: number;
  homeAbbr: string; awayAbbr: string;
  actualMargin: number; a: number; b: number;
  bHomePoints: number; bAwayPoints: number; bTotal: number;
  marketHomeMargin: number | null;
};

const games: Joined[] = JSON.parse(readFileSync(join(OUT_DIR, "joined-games.json"), "utf-8"));

function weekBand(week: number): "weeks1-4" | "weeks5-10" | "weeks11-18" {
  if (week <= 4) return "weeks1-4";
  if (week <= 10) return "weeks5-10";
  return "weeks11-18";
}

// Deterministic PRNG so the bootstrap is reproducible.
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(xs: readonly number[]): number { return xs.reduce((s, v) => s + v, 0) / xs.length; }

/** Paired test on d_i = |err_left| - |err_right|. Negative mean => left is better. */
function pairedAbsErrorTest(rows: readonly Joined[], left: (j: Joined) => number, right: (j: Joined) => number, seed = 20260907) {
  const d = rows.map((j) => Math.abs(left(j) - j.actualMargin) - Math.abs(right(j) - j.actualMargin));
  const n = d.length;
  const m = mean(d);
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const rng = mulberry32(seed);
  const boots: number[] = [];
  for (let b = 0; b < 10000; b += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += d[(rng() * n) | 0];
    boots.push(sum / n);
  }
  boots.sort((x, y) => x - y);
  return {
    n,
    meanAbsErrorDifference: m,
    standardError: se,
    tStat: m / se,
    bootstrapCi95: [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]] as [number, number],
    bootstrapShareFavouringLeft: boots.filter((v) => v < 0).length / boots.length,
  };
}

function squaredErrorTest(rows: readonly Joined[], left: (j: Joined) => number, right: (j: Joined) => number) {
  const d = rows.map((j) => (left(j) - j.actualMargin) ** 2 - (right(j) - j.actualMargin) ** 2);
  const n = d.length;
  const m = mean(d);
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / (n - 1));
  return { n, meanSquaredErrorDifference: m, tStat: m / (sd / Math.sqrt(n)) };
}

const A = (j: Joined) => j.a;
const B = (j: Joined) => j.b;
const blend = (w: number) => (j: Joined) => w * j.a + (1 - w) * j.b;

const trainFold = games.filter((g) => g.season === 2023 || g.season === 2024);
const holdout = games.filter((g) => g.season === 2025);

// ---------------------------------------------------------------------------
// 1. Paired A-vs-B, overall / per season / per week band
// ---------------------------------------------------------------------------
const scopes: { label: string; rows: Joined[] }[] = [
  { label: "pooled2023-2025", rows: games },
  { label: "season2023", rows: games.filter((g) => g.season === 2023) },
  { label: "season2024", rows: games.filter((g) => g.season === 2024) },
  { label: "season2025(holdout)", rows: holdout },
  { label: "weeks1-4", rows: games.filter((g) => weekBand(g.week) === "weeks1-4") },
  { label: "weeks5-10", rows: games.filter((g) => weekBand(g.week) === "weeks5-10") },
  { label: "weeks11-18", rows: games.filter((g) => weekBand(g.week) === "weeks11-18") },
  { label: "week1only", rows: games.filter((g) => g.week === 1) },
  { label: "disagreements", rows: games.filter((g) => g.a !== 0 && g.b !== 0 && Math.sign(g.a) !== Math.sign(g.b)) },
];

const aVsB = Object.fromEntries(scopes.map((s) => [s.label, {
  mae: pairedAbsErrorTest(s.rows, A, B),
  mse: squaredErrorTest(s.rows, A, B),
}]));

// ---------------------------------------------------------------------------
// 2. Paired blend-vs-A (the decision that actually matters)
// ---------------------------------------------------------------------------
const blendVsA = Object.fromEntries(scopes.map((s) => [s.label, Object.fromEntries(
  [0.75, 0.5, 0.25].map((w) => [`blend_${Math.round(w * 100)}A`, pairedAbsErrorTest(s.rows, blend(w), A)]),
)]));

// ---------------------------------------------------------------------------
// 3. Situational blend: per-week-band weight chosen on 2023-2024, applied 2025
// ---------------------------------------------------------------------------
const bandWeights: Record<string, { w: number; trainMae: number }> = {};
for (const band of ["weeks1-4", "weeks5-10", "weeks11-18"] as const) {
  const rows = trainFold.filter((g) => weekBand(g.week) === band);
  let best = { w: 1, mae: Infinity };
  for (let i = 0; i <= 100; i += 1) {
    const w = i / 100;
    const mae = mean(rows.map((j) => Math.abs(blend(w)(j) - j.actualMargin)));
    if (mae < best.mae) best = { w, mae };
  }
  bandWeights[band] = { w: best.w, trainMae: best.mae };
}
const situational = (j: Joined) => blend(bandWeights[weekBand(j.week)].w)(j);

const situationalHoldout = {
  bandWeightsFromTrainFolds: bandWeights,
  vsA: pairedAbsErrorTest(holdout, situational, A),
  maeSituational: mean(holdout.map((j) => Math.abs(situational(j) - j.actualMargin))),
  maeA: mean(holdout.map((j) => Math.abs(j.a - j.actualMargin))),
  maeB: mean(holdout.map((j) => Math.abs(j.b - j.actualMargin))),
  byBandOnHoldout: Object.fromEntries((["weeks1-4", "weeks5-10", "weeks11-18"] as const).map((band) => {
    const rows = holdout.filter((g) => weekBand(g.week) === band);
    return [band, {
      n: rows.length,
      maeA: mean(rows.map((j) => Math.abs(j.a - j.actualMargin))),
      maeB: mean(rows.map((j) => Math.abs(j.b - j.actualMargin))),
      maeSituational: mean(rows.map((j) => Math.abs(situational(j) - j.actualMargin))),
    }];
  })),
};

// ---------------------------------------------------------------------------
// 4. Week-band stability: is "B early, A late" reproducible season by season?
// ---------------------------------------------------------------------------
const weekBandStability = Object.fromEntries((["weeks1-4", "weeks5-10", "weeks11-18"] as const).map((band) => [
  band,
  Object.fromEntries([2023, 2024, 2025].map((season) => {
    const rows = games.filter((g) => g.season === season && weekBand(g.week) === band);
    return [season, {
      n: rows.length,
      maeA: mean(rows.map((j) => Math.abs(j.a - j.actualMargin))),
      maeB: mean(rows.map((j) => Math.abs(j.b - j.actualMargin))),
      maeAMinusB: mean(rows.map((j) => Math.abs(j.a - j.actualMargin) - Math.abs(j.b - j.actualMargin))),
    }];
  })),
]));

// ---------------------------------------------------------------------------
// 5. Both models vs the market (benchmark only)
// ---------------------------------------------------------------------------
const withMarket = games.filter((g) => g.marketHomeMargin != null);
const marketComparison = {
  n: withMarket.length,
  aVsMarket: pairedAbsErrorTest(withMarket, A, (j) => j.marketHomeMargin!),
  bVsMarket: pairedAbsErrorTest(withMarket, B, (j) => j.marketHomeMargin!),
  note: "market is a reported benchmark only and is never an input to any candidate",
};

const report = { generatedAt: new Date().toISOString(), sampleSize: games.length, aVsB, blendVsA, situationalHoldout, weekBandStability, marketComparison };
writeFileSync(join(OUT_DIR, "significance.json"), JSON.stringify(report, null, 2));

const f = (x: number) => x.toFixed(3);
console.log("=== Paired A vs B (negative meanAbsErrorDifference => A better) ===");
for (const [label, v] of Object.entries(aVsB)) {
  const t = (v as any).mae;
  console.log(`${label.padEnd(22)} n=${String(t.n).padStart(4)}  dMAE=${f(t.meanAbsErrorDifference).padStart(7)}  t=${f(t.tStat).padStart(6)}  CI95=[${f(t.bootstrapCi95[0])}, ${f(t.bootstrapCi95[1])}]`);
}
console.log("\n=== Situational blend on untouched 2025 holdout ===");
console.log(JSON.stringify(situationalHoldout, null, 2));
console.log("\n=== Week-band stability (maeA - maeB per season; negative => A better) ===");
for (const [band, bySeason] of Object.entries(weekBandStability)) {
  const parts = Object.entries(bySeason as any).map(([s, v]: any) => `${s}:${f(v.maeAMinusB)}(n=${v.n})`);
  console.log(`${band.padEnd(12)} ${parts.join("  ")}`);
}
console.log(`\n[research] wrote ${join(OUT_DIR, "significance.json")}`);
