import { MIN_BUCKET_SAMPLE_SIZE } from "./config";
import { evalRow } from "./evaluation";
import type { EvalRow, Phase8Prediction } from "./types";

export type NamedEvalRow = { label: string } & EvalRow;

function named(label: string, predictions: readonly Phase8Prediction[]): NamedEvalRow {
  const row = evalRow(predictions);
  const enough = row.n >= MIN_BUCKET_SAMPLE_SIZE;
  return { label, n: row.n, mae: enough ? row.mae : null, rmse: enough ? row.rmse : null, correlation: enough ? row.correlation : null, calibrationSlope: enough ? row.calibrationSlope : null, calibrationIntercept: enough ? row.calibrationIntercept : null };
}

/** Section 14 — connected-components buckets (uses the SMALLER of the two teams' component sizes as the game's connectivity state, since either side's rating could be the unreliable one). */
export function buildConnectivityBuckets(predictions: readonly Phase8Prediction[]): NamedEvalRow[] {
  const withComponents = predictions.filter((p) => p.homeComponentSize !== null && p.awayComponentSize !== null);
  const componentCountForGame = (p: Phase8Prediction) => Math.min(p.homeComponentSize as number, p.awayComponentSize as number);
  return [
    named("component_1", withComponents.filter((p) => componentCountForGame(p) === 1)),
    named("component_2_4", withComponents.filter((p) => { const c = componentCountForGame(p); return c >= 2 && c <= 4; })),
    named("component_5_9", withComponents.filter((p) => { const c = componentCountForGame(p); return c >= 5 && c <= 9; })),
    named("component_10_plus", withComponents.filter((p) => componentCountForGame(p) >= 10)),
  ];
}

/** Section 15 — staleness buckets (uses the LARGER of the two teams' adjusted staleness, since that's the side most likely to drive a miss). */
export function buildStalenessBuckets(predictions: readonly Phase8Prediction[]): NamedEvalRow[] {
  const withStaleness = predictions.filter((p) => p.homeStaleness !== null && p.awayStaleness !== null);
  const maxStaleness = withStaleness.map((p) => Math.max(p.homeStaleness as number, p.awayStaleness as number));
  const sorted = [...maxStaleness].sort((a, b) => a - b);
  const q = (pct: number) => sorted[Math.floor(pct * (sorted.length - 1))] ?? 0;
  const p50 = q(0.5);
  const p80 = q(0.8);
  const p95 = q(0.95);
  return [
    named("staleness_p0_50", withStaleness.filter((p, i) => maxStaleness[i] < p50)),
    named("staleness_p50_80", withStaleness.filter((p, i) => maxStaleness[i] >= p50 && maxStaleness[i] < p80)),
    named("staleness_p80_95", withStaleness.filter((p, i) => maxStaleness[i] >= p80 && maxStaleness[i] < p95)),
    named("staleness_p95_100_extreme", withStaleness.filter((p, i) => maxStaleness[i] >= p95)),
  ];
}

/** Section 16 — conference vs nonconference. */
export function buildNonconferenceBuckets(predictions: readonly Phase8Prediction[]): NamedEvalRow[] {
  const withConf = predictions.filter((p) => p.homeConference !== null && p.awayConference !== null);
  return [
    named("conference_vs_conference", withConf.filter((p) => p.homeConference === p.awayConference)),
    named("nonconference", withConf.filter((p) => p.homeConference !== p.awayConference)),
  ];
}

/** Section 17 — transition-team involvement. */
export function buildTransitionTeamBuckets(predictions: readonly Phase8Prediction[]): NamedEvalRow[] {
  return [
    named("transition_team_involved", predictions.filter((p) => p.homeTransitionTeam || p.awayTransitionTeam)),
    named("no_transition_team", predictions.filter((p) => !p.homeTransitionTeam && !p.awayTransitionTeam)),
  ];
}

/** Section 10/13 — week-range segments. */
export function buildWeekRangeRows(predictions: readonly Phase8Prediction[]): NamedEvalRow[] {
  return [
    named("weeks_1_3", predictions.filter((p) => p.week <= 3)),
    named("weeks_1_4", predictions.filter((p) => p.week <= 4)),
    named("weeks_5_8", predictions.filter((p) => p.week >= 5 && p.week <= 8)),
    named("weeks_9_plus", predictions.filter((p) => p.week >= 9)),
  ];
}

export function buildSeasonRows(predictions: readonly Phase8Prediction[]): NamedEvalRow[] {
  const seasons = [...new Set(predictions.map((p) => p.season))].sort();
  return seasons.map((s) => named(String(s), predictions.filter((p) => p.season === s)));
}
