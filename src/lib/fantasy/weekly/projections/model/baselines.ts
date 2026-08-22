import type { BaselineAuthorityName, Row } from "./types";

/**
 * Simple baselines (spec section 4) every learned model must beat, plus the
 * deterministic shrinkage baseline authority (spec section 6) used as
 * `stableBaseline` inside the residual model families. All baselines here are
 * pregame-known; none reads target-week stats.
 */

/** Preregistered shrinkage-strength grid for the deterministic blend baseline. Selected on 2024 validation MAE only. */
export const SHRINKAGE_K_CANDIDATES = [2, 4, 6, 8] as const;

export function averageOf(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Deterministic shrinkage blend: weight on current-season evidence grows with `gamesPlayedPrior`, capped by K. */
export function shrinkageBlend(row: Row, k: number, rookieFallbackPpg: number): number {
  const currentWeight = row.gamesPlayedPrior / (row.gamesPlayedPrior + k);
  const currentSignal = row.seasonPpgPrior ?? row.last3PpgPrior ?? row.priorSeasonPpg ?? null;
  const priorSignal = row.priorSeasonPpg ?? currentSignal;
  if (currentSignal == null && priorSignal == null) return rookieFallbackPpg;
  if (currentSignal == null) return priorSignal!;
  if (priorSignal == null) return currentSignal;
  return currentWeight * currentSignal + (1 - currentWeight) * priorSignal;
}

/** Existing hard 2-game transition authority (production `WEEKLY_FANTASY_MINIMUM_HISTORY_GAMES = 2`), benchmark only per spec section 4G. Never promoted as the Phase 2 baseline authority. */
export function hardTwoGameTransitionBaseline(row: Row, rookieFallbackPpg: number): number | null {
  if (row.gamesPlayedPrior >= 2) return row.seasonPpgPrior ?? row.priorSeasonPpg ?? rookieFallbackPpg;
  return row.priorSeasonPpg ?? row.seasonPpgPrior ?? rookieFallbackPpg;
}

export type SimpleBaselineName =
  | "priorSeasonPpg"
  | "seasonPpgPrior"
  | "last3PpgPrior"
  | "last5PpgPrior"
  | "shrinkageBlend"
  | "positionMeanNaive"
  | "hardTwoGameTransition";

export function scoreSimpleBaseline(
  name: SimpleBaselineName,
  row: Row,
  context: { shrinkageK: number; rookieFallbackPpg: number; positionMeanPpg: number },
): number | null {
  switch (name) {
    case "priorSeasonPpg": return row.priorSeasonPpg;
    case "seasonPpgPrior": return row.seasonPpgPrior;
    case "last3PpgPrior": return row.last3PpgPrior;
    case "last5PpgPrior": return row.last5PpgPrior;
    case "shrinkageBlend": return shrinkageBlend(row, context.shrinkageK, context.rookieFallbackPpg);
    case "positionMeanNaive": return context.positionMeanPpg;
    case "hardTwoGameTransition": return hardTwoGameTransitionBaseline(row, context.rookieFallbackPpg);
  }
}

export function baselineAuthorityValue(name: BaselineAuthorityName, row: Row, context: { shrinkageK: number; rookieFallbackPpg: number; positionMeanPpg: number }): number | null {
  switch (name) {
    case "prior-season-ppg": return row.priorSeasonPpg;
    case "season-ppg-prior": return row.seasonPpgPrior;
    case "last3-ppg-prior": return row.last3PpgPrior;
    case "last5-ppg-prior": return row.last5PpgPrior;
    case "shrinkage-blend": return shrinkageBlend(row, context.shrinkageK, context.rookieFallbackPpg);
    case "position-mean-naive": return context.positionMeanPpg;
    case "hard-2-game-transition": return hardTwoGameTransitionBaseline(row, context.rookieFallbackPpg);
  }
}

/** Rookie/no-prior-history fallback (spec section 6): population mean of `actualFantasyPoints` computed ONLY from training (2023) rows, never a league-wide average across positions. */
export function rookieFallbackFromTraining(trainingRows: readonly Row[]): number {
  const values = trainingRows.filter((row) => row.rookieOrNoPriorHistory).map((row) => row.actualFantasyPoints);
  const mean = averageOf(values);
  if (mean != null) return mean;
  // Defensible documented fallback if a position has zero rookie rows in training: whole-position training mean.
  return averageOf(trainingRows.map((row) => row.actualFantasyPoints)) ?? 0;
}

export function positionMeanFromTraining(trainingRows: readonly Row[]): number {
  return averageOf(trainingRows.map((row) => row.actualFantasyPoints)) ?? 0;
}
