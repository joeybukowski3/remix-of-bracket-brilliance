import { buildCoachingContext } from "../phase7/coachingContinuity";
import { buildPrimaryQbByTeam, computeQbContinuityFeatures } from "../phase7/qbContinuity";
import { fitMultiOls, predictMultiOls, rSquared } from "../phase7/regressionUtils";
import type { Phase8Prediction } from "./types";

type AblationResult = { n: number; modelOnlyR2: number | null; modelPlusCandidateR2: number | null; gain: number | null };

function fitAndScore(rows: readonly { features: number[]; y: number }[], names: string[]): number | null {
  if (rows.length < names.length + 3) return null;
  const model = fitMultiOls(rows, names);
  return rSquared(rows.map((r) => r.y), rows.map((r) => predictMultiOls(model, r.features)));
}

/**
 * Sections 18/19 — secondary ablation: does adding coaching/QB continuity
 * (Phase 7's existing bounded feature blocks, reused read-only) improve the
 * BEST structural candidate's own margin prediction? Only run after
 * structural selection (Section 22) — never used to pick structural
 * hyperparameters.
 */
export function buildQbContinuityAblation(predictions: readonly Phase8Prediction[]): AblationResult {
  const primaryBySeason = new Map<number, ReturnType<typeof buildPrimaryQbByTeam>>();
  function primaryFor(season: number) {
    if (!primaryBySeason.has(season)) primaryBySeason.set(season, buildPrimaryQbByTeam(season));
    return primaryBySeason.get(season)!;
  }

  const rows: { modelMargin: number; actualMargin: number; candidateDifferential: number }[] = [];
  for (const p of predictions) {
    if (p.projectedMargin === null || p.actualMargin === null) continue;
    const home = computeQbContinuityFeatures(primaryFor(p.season - 1).get(p.homeTeamExternalId) ?? null, primaryFor(p.season).get(p.homeTeamExternalId) ?? null);
    const away = computeQbContinuityFeatures(primaryFor(p.season - 1).get(p.awayTeamExternalId) ?? null, primaryFor(p.season).get(p.awayTeamExternalId) ?? null);
    if (home.returningPrimaryQb === null || away.returningPrimaryQb === null) continue;
    rows.push({ modelMargin: p.projectedMargin, actualMargin: p.actualMargin, candidateDifferential: (home.returningPrimaryQb ? 1 : 0) - (away.returningPrimaryQb ? 1 : 0) });
  }

  const modelOnlyR2 = fitAndScore(rows.map((r) => ({ features: [r.modelMargin], y: r.actualMargin })), ["model"]);
  const modelPlusCandidateR2 = fitAndScore(rows.map((r) => ({ features: [r.modelMargin, r.candidateDifferential], y: r.actualMargin })), ["model", "qb"]);
  return { n: rows.length, modelOnlyR2, modelPlusCandidateR2, gain: modelOnlyR2 !== null && modelPlusCandidateR2 !== null ? modelPlusCandidateR2 - modelOnlyR2 : null };
}

export function buildCoachingContinuityAblation(predictions: readonly Phase8Prediction[], testSeasons: readonly number[]): AblationResult {
  const context = buildCoachingContext(testSeasons);

  const rows: { modelMargin: number; actualMargin: number; candidateDifferential: number }[] = [];
  for (const p of predictions) {
    if (p.projectedMargin === null || p.actualMargin === null) continue;
    const home = context.get(`${p.season}:${p.homeTeamExternalId}`);
    const away = context.get(`${p.season}:${p.awayTeamExternalId}`);
    if (!home || !away || home.newHeadCoach === null || away.newHeadCoach === null) continue;
    const homeContinuity = home.newHeadCoach ? 0 : 1;
    const awayContinuity = away.newHeadCoach ? 0 : 1;
    rows.push({ modelMargin: p.projectedMargin, actualMargin: p.actualMargin, candidateDifferential: homeContinuity - awayContinuity });
  }

  const modelOnlyR2 = fitAndScore(rows.map((r) => ({ features: [r.modelMargin], y: r.actualMargin })), ["model"]);
  const modelPlusCandidateR2 = fitAndScore(rows.map((r) => ({ features: [r.modelMargin, r.candidateDifferential], y: r.actualMargin })), ["model", "coach"]);
  return { n: rows.length, modelOnlyR2, modelPlusCandidateR2, gain: modelOnlyR2 !== null && modelPlusCandidateR2 !== null ? modelPlusCandidateR2 - modelOnlyR2 : null };
}
