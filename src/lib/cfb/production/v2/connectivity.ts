// CFB Model V2 — connectivity-aware regularization (Phase 10 §5, Phase 8
// §5/§6). This is a literal, faithful copy of the frozen research formula
// (src/lib/cfb/research/phase8/lambdaMultipliers.ts, COMPONENT_SIZE
// candidate only — the finalist per PHASE9_FINALIST_SPEC). It must never be
// reinterpreted or simplified; connectivityMultiplier.test.ts locks parity
// against the research implementation directly.

import { CFB_V2_CONNECTIVITY_CONFIG } from "./config";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Per-team regularization multiplier for the COMPONENT_SIZE connectivity
 * policy. Larger multiplier = more shrinkage toward the prior for teams in
 * small/disconnected schedule-graph components. Always >= 1, capped at
 * `maxPenaltyMultiplier`.
 *
 * Formula (Phase 8 §5): clamp(componentSizeK / max(componentSize, 1), 1, maxPenaltyMultiplier)
 */
export function componentSizeRegularizationMultiplier(componentSize: number): number {
  const { componentSizeK, maxPenaltyMultiplier } = CFB_V2_CONNECTIVITY_CONFIG;
  return clamp(componentSizeK / Math.max(componentSize, 1), 1, maxPenaltyMultiplier);
}

/** Effective per-team lambda = baseLambda * regularization multiplier. */
export function effectiveConnectivityLambda(componentSize: number): number {
  return CFB_V2_CONNECTIVITY_CONFIG.baseLambda * componentSizeRegularizationMultiplier(componentSize);
}
