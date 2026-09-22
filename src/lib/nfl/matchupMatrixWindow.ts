/**
 * Data Window resolution for the Weekly Matchups matrix.
 *
 * Three modes, mapped onto EXISTING infrastructure wherever it already
 * matches the spec exactly, with one new aggregation (Blended) built from
 * existing artifact windows:
 *
 *   Last 8     -> matchupSampleWindow's rolling 8-game window
 *                 (window: "season", includePriorSeason: true). This is
 *                 already exactly "each completed 2026 game replaces one
 *                 late-2025 game, crossing the season boundary" — no new code.
 *   2026 Only  -> matchupSampleWindow's uncapped current-season window
 *                 (window: "season", includePriorSeason: false). Already
 *                 exactly "completed 2026 games only, no 2025 games ever
 *                 contribute" — no new code.
 *   Blended    -> NEW. Phases each team's `prior-season-full` (2025) value
 *                 into its `season-current` (2026-to-date) value using the
 *                 same production weight curve the universal OVR board uses
 *                 (CURRENT_RATING_WEIGHTS_BY_GAMES), keyed by that team's own
 *                 completed-2026-game count — never a league-wide week
 *                 number. This mirrors the OVR board's own method rather than
 *                 duplicating a second, diverging blend formula.
 *
 * Success Rate and Blocking/Rush Defense (trench) are NOT resolved through
 * this module — both remain season-to-date regardless of the selected mode
 * (see matchupMatrixSeasonToDate.ts), because neither pipeline has a rolling
 * or cross-season window to select from.
 */

import { currentRatingWeightsFor } from "@/lib/nfl/currentRating2026";
import type { NflMatchupSampleSettings } from "@/lib/nfl/matchupSampleWindow";

export type NflMatrixDataWindowMode = "blended" | "2026-only" | "last8";

export const MATRIX_DATA_WINDOW_OPTIONS: readonly { value: NflMatrixDataWindowMode; label: string; shortLabel: string }[] = [
  { value: "blended", label: "Blended", shortLabel: "Blend" },
  { value: "2026-only", label: "2026 Only", shortLabel: "2026" },
  { value: "last8", label: "Last 8", shortLabel: "L8" },
] as const;

export const DEFAULT_MATRIX_DATA_WINDOW_MODE: NflMatrixDataWindowMode = "blended";

/**
 * Sample settings for the artifact window to read as the "current" leg.
 * Blended reads the same uncapped 2026-only window as its current-season leg
 * (see blendMatrixMetricValue) — only Last 8 reads the rolling-8 blend window.
 */
export function sampleSettingsForMatrixWindow(mode: NflMatrixDataWindowMode): NflMatchupSampleSettings {
  if (mode === "last8") return { window: "season", includePriorSeason: true };
  return { window: "season", includePriorSeason: false };
}

/**
 * Direct weighted blend of a team's full-2025-season value and its
 * 2026-to-date value, using the approved production curve. Identical method
 * to blendCurrentRating in currentRating2026.ts, applied to a raw metric
 * value instead of a 1-99 rating.
 *
 * No silent zero-fill: a missing leg simply drops out of the blend rather
 * than being treated as zero, matching the "direct blend, not a delta from a
 * missing baseline" philosophy the OVR board already uses.
 */
export function blendMatrixMetricValue(
  priorSeasonFullValue: number | null,
  current2026Value: number | null,
  gamesPlayed: number
): number | null {
  const weights = currentRatingWeightsFor(gamesPlayed);
  const hasPrior = priorSeasonFullValue != null && Number.isFinite(priorSeasonFullValue);
  const hasCurrent = current2026Value != null && Number.isFinite(current2026Value);

  if (weights.preseasonWeight === 0) return hasCurrent ? current2026Value : null;
  if (weights.performanceWeight === 0) return hasPrior ? priorSeasonFullValue : null;
  if (hasPrior && hasCurrent) {
    return weights.preseasonWeight * priorSeasonFullValue + weights.performanceWeight * current2026Value;
  }
  if (hasCurrent) return current2026Value;
  if (hasPrior) return priorSeasonFullValue;
  return null;
}
