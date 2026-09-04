/**
 * Phase M -- point-in-time league-average feature diagnostics (EPA/play and
 * traditional success rate), for the season-relative / week-relative
 * normalization comparisons in item 3 and the contemporaneous-relative
 * feature construction in item 8.
 *
 * Deliberately reuses scoringEnvironment.ts's `computeScoringEnvironment`
 * verbatim rather than reimplementing point-in-time filtering: a league
 * average of EPA/play (or success rate) at a strict (season, week) cutoff
 * is mathematically the exact same operation as the existing
 * scoring-environment computation (a strictly-prior mean over per-team-game
 * observations with the same three mode variants), just applied to a
 * different per-game scalar. Reusing the already-leakage-tested function
 * means this module inherits those same 9 passing leakage/cutoff/Week-1
 * guarantees by construction; leagueAverage.test.ts adds targeted tests
 * proving the two corpus builders below extract the correct per-game value
 * before that reused function ever sees it.
 *
 * `success rate` is symmetric across offense/defense: the same corpus of
 * per-team-game success-rate observations IS both "league offense success
 * rate" and "league defense-allowed success rate allowed" (every play is
 * simultaneously one team's offensive success and the opponent's defensive
 * allowance), so a single corpus serves both roles -- documented so this
 * is not mistaken for an oversight. The same symmetry applies to EPA/play.
 */
import { computeScoringEnvironment, type ScoringEnvironmentObservation } from "./scoringEnvironment";
import type { NflTotalResearchCutoff, NflTotalResearchScoringEnvironmentMode, NflTotalResearchScoringSupportRow } from "./types";

/** One league-wide EPA/play observation per team-game (symmetric: also usable as the defense-allowed reference). */
export function buildLeagueEpaCorpus(rows: readonly NflTotalResearchScoringSupportRow[]): ScoringEnvironmentObservation[] {
  return rows.filter((r) => r.eligiblePlays > 0).map((r) => ({ season: r.season, week: r.week, teamPoints: r.offEpaSum / r.eligiblePlays }));
}

/** One league-wide traditional-success-rate observation per team-game (symmetric, see file header). */
export function buildLeagueSuccessRateCorpus(rows: readonly NflTotalResearchScoringSupportRow[]): ScoringEnvironmentObservation[] {
  return rows.filter((r) => r.successDen > 0).map((r) => ({ season: r.season, week: r.week, teamPoints: r.successNum / r.successDen }));
}

export function computeContemporaneousLeagueAverage(
  corpus: readonly ScoringEnvironmentObservation[],
  cutoff: NflTotalResearchCutoff,
  mode: NflTotalResearchScoringEnvironmentMode,
) {
  return computeScoringEnvironment(corpus, cutoff, mode);
}
