/**
 * Prospective-validation report for the shadow total calibration candidate. Pure functions over archived shadow rows and
 * outcome events. Prospective and retrospective (Weeks 1-2 reference) cohorts are ALWAYS reported separately and the
 * retrospective cohort never enters the prospective score. No superiority claim is produced below the review threshold.
 */
import {
  NFL_TOTAL_SHADOW_K,
  NFL_TOTAL_SHADOW_MODEL_VERSION,
  NFL_TOTAL_SHADOW_REVIEW_MIN_GAMES,
  type ShadowOutcome,
  type ShadowRow,
} from "./nfl-total-shadow-calibration";

export type ErrorMetrics = { n: number; mae: number; rmse: number; signedError: number; calibrationSlope: number | null; calibrationIntercept: number | null };

export const TOTAL_BUCKETS = [
  { key: "under_40", label: "under 40", test: (t: number) => t < 40 },
  { key: "40_to_44_5", label: "40-44.5 (40 <= total < 45)", test: (t: number) => t >= 40 && t < 45 },
  { key: "45_to_49_5", label: "45-49.5 (45 <= total < 50)", test: (t: number) => t >= 45 && t < 50 },
  { key: "50_plus", label: "50+", test: (t: number) => t >= 50 },
] as const;

export function errorMetrics(pred: readonly number[], actual: readonly number[]): ErrorMetrics | null {
  const n = pred.length;
  if (n === 0) return null;
  let ae = 0; let se = 0; let me = 0;
  for (let i = 0; i < n; i++) { const e = pred[i] - actual[i]; ae += Math.abs(e); se += e * e; me += e; }
  const mp = pred.reduce((a, b) => a + b, 0) / n; const ma = actual.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (pred[i] - mp) * (actual[i] - ma); sxx += (pred[i] - mp) ** 2; }
  const slope = n >= 3 && sxx > 1e-12 ? sxy / sxx : null;
  return { n, mae: ae / n, rmse: Math.sqrt(se / n), signedError: me / n, calibrationSlope: slope, calibrationIntercept: slope === null ? null : ma - slope * mp };
}

const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const tCrit = (df: number) => (df <= 0 ? NaN : df <= 30 ? T95[df] : 1.96);

export type PairedSummary = { n: number; meanAbsErrorDiff: number | null; sd: number | null; se: number | null; ci95Low: number | null; ci95High: number | null; shadowBetter: number; shadowWorse: number; tied: number };

/** diff = |shadow error| − |production error| per game; negative means the shadow total was closer to the final total. */
export function pairedSummary(diffs: readonly number[]): PairedSummary {
  const n = diffs.length;
  const better = diffs.filter((d) => d < -1e-12).length; const worse = diffs.filter((d) => d > 1e-12).length;
  if (n === 0) return { n, meanAbsErrorDiff: null, sd: null, se: null, ci95Low: null, ci95High: null, shadowBetter: 0, shadowWorse: 0, tied: 0 };
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, meanAbsErrorDiff: mean, sd: null, se: null, ci95Low: null, ci95High: null, shadowBetter: better, shadowWorse: worse, tied: n - better - worse };
  const sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)); const se = sd / Math.sqrt(n);
  return { n, meanAbsErrorDiff: mean, sd, se, ci95Low: mean - tCrit(n - 1) * se, ci95High: mean + tCrit(n - 1) * se, shadowBetter: better, shadowWorse: worse, tied: n - better - worse };
}

export type PerGameRow = {
  game_id: string; week: number; raw_jkb_total: number; shadow_total: number; market_at_generation: number | null; market_closing_reference: number | null;
  final_total: number; production_abs_error: number; shadow_abs_error: number; abs_error_diff_shadow_minus_production: number; generated_at: string;
};

export type BucketRow = { bucket: string; n: number; production: ErrorMetrics | null; shadow: ErrorMetrics | null; marketAtGeneration: ErrorMetrics | null };

export type CohortSection = {
  cohort: "prospective" | "retrospective";
  gamesGraded: number; gamesAwaitingResult: number;
  production: ErrorMetrics | null; shadow: ErrorMetrics | null;
  marketAtGeneration: ErrorMetrics | null; marketGames: number;
  marketClosingReference: ErrorMetrics | null; marketClosingGames: number;
  bucketsByProductionTotal: BucketRow[]; bucketsByShadowTotal: BucketRow[];
  paired: PairedSummary;
  perGame: PerGameRow[];
};

export type ShadowReport = {
  schema_version: "jkb-nfl-total-shadow-report-v1";
  model_version: typeof NFL_TOTAL_SHADOW_MODEL_VERSION; k: typeof NFL_TOTAL_SHADOW_K;
  priorSeasonLeagueMean: number | null;
  reviewMinGames: number;
  status: "NO_PROSPECTIVE_GRADED_GAMES" | "INSUFFICIENT_SAMPLE_DESCRIPTIVE_ONLY" | "SAMPLE_REACHED_REVIEW_THRESHOLD";
  statement: string;
  prospective: CohortSection;
  retrospectiveReference: CohortSection;
  notes: string[];
};

/** Latest pregame snapshot per game (rows are already guaranteed pre-kickoff by validation). */
function latestPerGame(rows: readonly ShadowRow[]): Map<string, ShadowRow> {
  const m = new Map<string, ShadowRow>();
  for (const r of rows) { const p = m.get(r.game_id); if (!p || Date.parse(r.generated_at) > Date.parse(p.generated_at)) m.set(r.game_id, r); }
  return m;
}

function bucketRows(items: { prod: number; shadow: number; market: number | null; actual: number }[], by: "prod" | "shadow"): BucketRow[] {
  return TOTAL_BUCKETS.map((b) => {
    const sel = items.filter((i) => b.test(by === "prod" ? i.prod : i.shadow));
    const mk = sel.filter((i) => i.market != null);
    return { bucket: b.label, n: sel.length, production: errorMetrics(sel.map((i) => i.prod), sel.map((i) => i.actual)), shadow: errorMetrics(sel.map((i) => i.shadow), sel.map((i) => i.actual)), marketAtGeneration: errorMetrics(mk.map((i) => i.market as number), mk.map((i) => i.actual)) };
  });
}

export function buildCohortSection(cohort: "prospective" | "retrospective", rows: readonly ShadowRow[], outcomes: readonly ShadowOutcome[], closingMarket?: (row: ShadowRow) => number | null): CohortSection {
  const finals = new Map<string, ShadowOutcome>();
  for (const o of outcomes) { const p = finals.get(o.game_id); if (!p || Date.parse(o.graded_at) >= Date.parse(p.graded_at)) finals.set(o.game_id, o); }
  const latest = latestPerGame(rows.filter((r) => r.cohort === cohort));
  const perGame: PerGameRow[] = [];
  let pending = 0;
  for (const row of latest.values()) {
    const o = finals.get(row.game_id);
    if (!o) { pending++; continue; }
    const pAbs = Math.abs(row.raw_jkb_total - o.final_total); const sAbs = Math.abs(row.shadow_total - o.final_total);
    perGame.push({ game_id: row.game_id, week: row.week, raw_jkb_total: row.raw_jkb_total, shadow_total: row.shadow_total, market_at_generation: row.market_at_generation.total, market_closing_reference: closingMarket ? closingMarket(row) : null, final_total: o.final_total, production_abs_error: pAbs, shadow_abs_error: sAbs, abs_error_diff_shadow_minus_production: sAbs - pAbs, generated_at: row.generated_at });
  }
  perGame.sort((a, b) => a.week - b.week || a.game_id.localeCompare(b.game_id));
  const actual = perGame.map((g) => g.final_total);
  const mk = perGame.filter((g) => g.market_at_generation != null); const cl = perGame.filter((g) => g.market_closing_reference != null);
  const items = perGame.map((g) => ({ prod: g.raw_jkb_total, shadow: g.shadow_total, market: g.market_at_generation, actual: g.final_total }));
  return {
    cohort, gamesGraded: perGame.length, gamesAwaitingResult: pending,
    production: errorMetrics(perGame.map((g) => g.raw_jkb_total), actual), shadow: errorMetrics(perGame.map((g) => g.shadow_total), actual),
    marketAtGeneration: errorMetrics(mk.map((g) => g.market_at_generation as number), mk.map((g) => g.final_total)), marketGames: mk.length,
    marketClosingReference: errorMetrics(cl.map((g) => g.market_closing_reference as number), cl.map((g) => g.final_total)), marketClosingGames: cl.length,
    bucketsByProductionTotal: bucketRows(items, "prod"), bucketsByShadowTotal: bucketRows(items, "shadow"),
    paired: pairedSummary(perGame.map((g) => g.abs_error_diff_shadow_minus_production)),
    perGame,
  };
}

export function buildShadowReport(input: { rows: readonly ShadowRow[]; outcomes: readonly ShadowOutcome[]; closingMarket?: (row: ShadowRow) => number | null }): ShadowReport {
  const prospective = buildCohortSection("prospective", input.rows, input.outcomes, input.closingMarket);
  const retro = buildCohortSection("retrospective", input.rows, input.outcomes, input.closingMarket);
  const n = prospective.gamesGraded;
  const status = n === 0 ? "NO_PROSPECTIVE_GRADED_GAMES" : n < NFL_TOTAL_SHADOW_REVIEW_MIN_GAMES ? "INSUFFICIENT_SAMPLE_DESCRIPTIVE_ONLY" : "SAMPLE_REACHED_REVIEW_THRESHOLD";
  const statement = status === "SAMPLE_REACHED_REVIEW_THRESHOLD"
    ? `The prospective sample (${n} graded games) has reached the ${NFL_TOTAL_SHADOW_REVIEW_MIN_GAMES}-game review threshold; the numbers below are for human review, not an automatic conclusion.`
    : `Only ${n} prospective games are graded (review threshold ${NFL_TOTAL_SHADOW_REVIEW_MIN_GAMES}). Figures are descriptive only; no claim is made that the shadow total is better or worse than production.`;
  return {
    schema_version: "jkb-nfl-total-shadow-report-v1", model_version: NFL_TOTAL_SHADOW_MODEL_VERSION, k: NFL_TOTAL_SHADOW_K,
    priorSeasonLeagueMean: input.rows[0]?.prior_season_league_mean ?? null, reviewMinGames: NFL_TOTAL_SHADOW_REVIEW_MIN_GAMES, status, statement, prospective, retrospectiveReference: retro,
    notes: [
      "Prospective = Week 3 onward, generated by the live generator strictly before kickoff, from the same pregame information as the production total. Weeks 1-2 rows are retrospective reference and are excluded from the prospective score.",
      "Market total 'at generation' is the latest book observation available when the row was frozen (evaluation only, never a model input). The 'closing reference' is the latest pregame observation before kickoff, used only as an evaluation benchmark.",
      "Errors are prediction minus final game total (positive = projected too high). Calibration slope is the OLS slope of final total on projected total (1.0 = calibrated).",
      "Paired difference = |shadow error| - |production error| per game; negative favours the shadow total. The 95% interval is a t-interval on the mean of paired differences.",
      "Total buckets use the labelled half-open ranges shown in the tables.",
    ],
  };
}

const f = (v: number | null, d = 2) => (v == null ? "n/a" : v.toFixed(d));
const mrow = (name: string, m: ErrorMetrics | null) => (m ? `| ${name} | ${m.n} | ${f(m.mae, 3)} | ${f(m.rmse, 3)} | ${m.signedError >= 0 ? "+" : ""}${f(m.signedError, 2)} | ${f(m.calibrationSlope, 2)} |` : `| ${name} | 0 | n/a | n/a | n/a | n/a |`);

export function renderShadowReportMarkdown(report: ShadowReport): string {
  const out: string[] = [];
  out.push(`# Shadow total calibration report — ${report.model_version}`, "", `k = ${report.k} (frozen) · prior-season league mean = ${f(report.priorSeasonLeagueMean, 4)} · status: **${report.status}**`, "", report.statement, "");
  for (const s of [report.prospective, report.retrospectiveReference]) {
    out.push(`## ${s.cohort === "prospective" ? "Prospective (Week 3 onward) — the validation score" : "Retrospective reference (Weeks 1-2) — NOT part of the validation score"}`, "", `Graded games: ${s.gamesGraded} · awaiting result: ${s.gamesAwaitingResult}`, "");
    out.push("| Series | n | MAE | RMSE | Signed error | Calibration slope |", "|---|---|---|---|---|---|", mrow("Production raw JKB total", s.production), mrow("Shadow total", s.shadow), mrow("Market at generation", s.marketAtGeneration), mrow("Market closing (evaluation-only)", s.marketClosingReference), "");
    const p = s.paired;
    out.push(`Paired |shadow err| − |production err|: n=${p.n}, mean ${f(p.meanAbsErrorDiff, 3)}, 95% CI [${f(p.ci95Low, 3)}, ${f(p.ci95High, 3)}]; shadow closer in ${p.shadowBetter}, production closer in ${p.shadowWorse}, tied ${p.tied}.`, "");
    out.push("By production total bucket:", "", "| Bucket | n | Prod MAE | Shadow MAE | Prod signed | Shadow signed | Market MAE |", "|---|---|---|---|---|---|---|");
    for (const b of s.bucketsByProductionTotal) out.push(`| ${b.bucket} | ${b.n} | ${f(b.production?.mae ?? null, 2)} | ${f(b.shadow?.mae ?? null, 2)} | ${f(b.production?.signedError ?? null, 2)} | ${f(b.shadow?.signedError ?? null, 2)} | ${f(b.marketAtGeneration?.mae ?? null, 2)} |`);
    out.push("", "By shadow total bucket:", "", "| Bucket | n | Prod MAE | Shadow MAE | Prod signed | Shadow signed |", "|---|---|---|---|---|---|");
    for (const b of s.bucketsByShadowTotal) out.push(`| ${b.bucket} | ${b.n} | ${f(b.production?.mae ?? null, 2)} | ${f(b.shadow?.mae ?? null, 2)} | ${f(b.production?.signedError ?? null, 2)} | ${f(b.shadow?.signedError ?? null, 2)} |`);
    out.push("");
  }
  out.push("## Notes", "", ...report.notes.map((n) => `- ${n}`), "");
  return out.join("\n");
}
