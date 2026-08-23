/**
 * Phase 1B guardrail (not model-selection logic itself). Encodes the frozen
 * chronological split for weekly fantasy point projection modeling and
 * provides a typed assertion any FUTURE model-selection code must import and
 * check before touching 2025 rows. This module makes no prediction and picks
 * no model; it only prevents accidental 2025 use during model selection.
 *
 * Frozen split:
 *   2023 -> training
 *   2024 -> validation / model selection
 *   2025 -> final holdout (untouched until a single, final, pre-registered
 *            evaluation after model selection is fully frozen)
 */

export const TRAINING_SEASON = 2023 as const;
export const MODEL_SELECTION_SEASON = 2024 as const;
export const FINAL_HOLDOUT_SEASON = 2025 as const;

/** Seasons a model-selection process (feature choice, hyperparameters, early stopping, etc.) may look at. */
export const MODEL_SELECTION_ALLOWED_SEASONS: readonly number[] = [
  TRAINING_SEASON,
  MODEL_SELECTION_SEASON,
];

export const FINAL_HOLDOUT_SEASONS: readonly number[] = [FINAL_HOLDOUT_SEASON];

/**
 * Throws if `season` is not one of the seasons model-selection code is
 * allowed to consult (training + validation only). Import this in any future
 * Phase 2 model-selection module and call it on every season value read from
 * the dataset before it influences a modeling decision (feature choice,
 * hyperparameter search, early stopping, threshold tuning, etc.).
 */
export function assertNotModelSelectionSeason(season: number): void {
  if (season === FINAL_HOLDOUT_SEASON) {
    throw new Error(
      `Season ${season} is the frozen final holdout season and must never influence model selection. ` +
        `Only ${MODEL_SELECTION_ALLOWED_SEASONS.join(", ")} may be used for training/model selection.`,
    );
  }
  if (!MODEL_SELECTION_ALLOWED_SEASONS.includes(season)) {
    throw new Error(
      `Season ${season} is not a recognized modeled season. Expected one of ` +
        `${[...MODEL_SELECTION_ALLOWED_SEASONS, ...FINAL_HOLDOUT_SEASONS].join(", ")}.`,
    );
  }
}

/** True only for the frozen final holdout season (2025). Never mutate this per-call; it is a fixed constant check. */
export function isFinalHoldoutSeason(season: number): boolean {
  return season === FINAL_HOLDOUT_SEASON;
}
