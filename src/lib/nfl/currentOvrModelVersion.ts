/**
 * Model identity for the composed 2026 NFL Current OVR board.
 *
 * Until v1.1.0 the composed board (v0.4-beta preseason anchor + team-specific
 * completed-game blend + live Team Performance Rating) had no aggregate model
 * identity of its own (docs/models/nfl-power-rating.md, "known limitations").
 * The pre-change composition — 40% OFF / 40% DEF / 20% PD live composite with a
 * one-pass season-to-date opponent adjustment — is retroactively labelled
 * v1.0.0 for documentation only; it was never archived under that name.
 *
 * v1.1.0 (MINOR, per docs/modeling/MODEL_VERSIONING_GUIDE.md: a weight change
 * plus an intentional methodology change to the opponent adjustment):
 *   - live composite weights 40% OFF / 20% DEF / 40% PD (was 40/40/20)
 *   - leave-one-out opponent adjustment (was one-pass, self-contaminated)
 *   - overall scale divisor refit so the pooled 2023-2025 composite keeps the
 *     documented 50 +/- 15 public scale (the new composite is ~11% wider)
 * Unchanged: preseason/live blend schedule, EPA/SR/explosive definitions and
 * garbage-time treatment, OFF/DEF sub-weights, 1-99 scale, 0.24 coefficient,
 * 2.0 home-field advantage.
 *
 * This module is intentionally dependency-free so the browser, the generators
 * and the artifact validator can all import the same constant.
 */
export const NFL_CURRENT_OVR_MODEL_VERSION = "nfl-current-ovr-v1.1.0" as const;

/** Identifier of the opponent-adjustment method in force for this model version. */
export const NFL_OPPONENT_ADJUSTMENT_METHOD = "leave-one-out-v1" as const;
