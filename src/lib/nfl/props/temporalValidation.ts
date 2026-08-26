/**
 * Rolling-origin temporal validation folds, confined to 2022-2024. 2025 is
 * never a fold boundary here -- it is loaded and reported separately, as a
 * fixed retrospective benchmark, never used to select a feature, model,
 * hyperparameter, or threshold. See docs/nfl-qb-passing-baseline-
 * competition.md "Methodology change" for why this exists starting Phase 4.
 *
 * Two folds is the most defensible scheme supportable by three pre-2025
 * seasons (2022-2024): a single held-back season per fold, rolling forward.
 * A 3-fold or leave-one-season-out scheme would leave a fold with zero
 * training seasons (2022 has no prior-season cache) or would require
 * validating on 2022 itself with no antecedent training season at all.
 */
export type NflTemporalFold = {
  name: string;
  trainSeasons: readonly number[];
  validateSeason: number;
};

export const TEMPORAL_FOLDS: readonly NflTemporalFold[] = [
  { name: "fold1_train2022_validate2023", trainSeasons: [2022], validateSeason: 2023 },
  { name: "fold2_train2022-2023_validate2024", trainSeasons: [2022, 2023], validateSeason: 2024 },
];

export const FROZEN_BENCHMARK_SEASON = 2025;
export const FINAL_TRAIN_SEASONS: readonly number[] = [2022, 2023, 2024];

export function splitByFold<T extends { season: number }>(
  rows: readonly T[],
  fold: NflTemporalFold,
): { train: T[]; validate: T[] } {
  return {
    train: rows.filter((r) => fold.trainSeasons.includes(r.season)),
    validate: rows.filter((r) => r.season === fold.validateSeason),
  };
}

export function average(values: readonly number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : null;
}
