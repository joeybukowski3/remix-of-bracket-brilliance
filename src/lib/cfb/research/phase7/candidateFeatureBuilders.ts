import { buildCoachingContext } from "./coachingContinuity";
import { buildPrimaryQbByTeam, computeQbContinuityFeatures } from "./qbContinuity";
import { buildTransferCountsByTeam } from "./transferFeatures";
import type { CandidateFeatureRow } from "./candidateFeatureIncremental";
import type { MissDatasetRow } from "./types";

/** Section 7/21/25 — QB continuity differential (home - away), strictly from season-1 vs season primary-QB identity (both preseason-fixed, never updated mid-season — as-of safe by construction). */
export function buildQbCandidateRows(rows: readonly MissDatasetRow[]): CandidateFeatureRow[] {
  const primaryByseason = new Map<number, ReturnType<typeof buildPrimaryQbByTeam>>();
  function primaryFor(season: number) {
    if (!primaryByseason.has(season)) primaryByseason.set(season, buildPrimaryQbByTeam(season));
    return primaryByseason.get(season)!;
  }

  const result: CandidateFeatureRow[] = [];
  for (const row of rows) {
    const homeFeatures = computeQbContinuityFeatures(
      primaryFor(row.season - 1).get(row.homeTeamExternalId) ?? null,
      primaryFor(row.season).get(row.homeTeamExternalId) ?? null,
    );
    const awayFeatures = computeQbContinuityFeatures(
      primaryFor(row.season - 1).get(row.awayTeamExternalId) ?? null,
      primaryFor(row.season).get(row.awayTeamExternalId) ?? null,
    );
    if (homeFeatures.returningPrimaryQb === null || awayFeatures.returningPrimaryQb === null) continue;
    result.push({
      ...row,
      candidateDifferential: (homeFeatures.returningPrimaryQb ? 1 : 0) - (awayFeatures.returningPrimaryQb ? 1 : 0),
    });
  }
  return result;
}

/** Section 9/21/25 — net transfer differential (home - away), preseason aggregate (Section 27 documents the timing simplification). */
export function buildTransferCandidateRows(rows: readonly MissDatasetRow[]): CandidateFeatureRow[] {
  const countsBySeason = new Map<number, ReturnType<typeof buildTransferCountsByTeam>>();
  function countsFor(season: number) {
    if (!countsBySeason.has(season)) countsBySeason.set(season, buildTransferCountsByTeam(season));
    return countsBySeason.get(season)!;
  }

  const result: CandidateFeatureRow[] = [];
  for (const row of rows) {
    const counts = countsFor(row.season);
    const home = counts.get(row.homeTeamExternalId);
    const away = counts.get(row.awayTeamExternalId);
    if (!home || !away || counts.size === 0) continue;
    result.push({ ...row, candidateDifferential: home.net - away.net });
  }
  return result;
}

/** Section 10/21/25 — head-coach continuity differential (home - away), 1 = same coach as prior season, 0 = new coach; skipped when either side is unknown (outside backfill window). */
export function buildCoachingCandidateRows(rows: readonly MissDatasetRow[], testSeasons: readonly number[]): CandidateFeatureRow[] {
  const context = buildCoachingContext(testSeasons);
  const result: CandidateFeatureRow[] = [];
  for (const row of rows) {
    const home = context.get(`${row.season}:${row.homeTeamExternalId}`);
    const away = context.get(`${row.season}:${row.awayTeamExternalId}`);
    if (!home || !away || home.newHeadCoach === null || away.newHeadCoach === null) continue;
    const homeContinuity = home.newHeadCoach ? 0 : 1;
    const awayContinuity = away.newHeadCoach ? 0 : 1;
    result.push({ ...row, candidateDifferential: homeContinuity - awayContinuity });
  }
  return result;
}
