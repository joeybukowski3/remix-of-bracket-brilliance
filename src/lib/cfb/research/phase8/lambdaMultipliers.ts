import { CROSS_CONFERENCE_K, GAMES_PLAYED_K, COMPONENT_SIZE_K, MAX_CONNECTIVITY_MULTIPLIER } from "./config";
import type { LambdaCandidateId, TeamGraphMetrics } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Section 5 — larger multiplier = MORE shrinkage toward the prior for teams with less trustworthy current-season evidence. Always >= 1 (never LESS shrinkage than baseline), capped at MAX_CONNECTIVITY_MULTIPLIER (Section 6). */
function gamesPlayedMultiplier(metrics: TeamGraphMetrics): number {
  return clamp(GAMES_PLAYED_K / Math.max(metrics.weightedDegree, 1), 1, MAX_CONNECTIVITY_MULTIPLIER);
}

function componentSizeMultiplier(metrics: TeamGraphMetrics): number {
  return clamp(COMPONENT_SIZE_K / Math.max(metrics.componentSize, 1), 1, MAX_CONNECTIVITY_MULTIPLIER);
}

function crossConferenceMultiplier(metrics: TeamGraphMetrics): number {
  return clamp(CROSS_CONFERENCE_K / Math.max(metrics.crossConferenceOpponents + 1, 1), 1, MAX_CONNECTIVITY_MULTIPLIER);
}

/**
 * Section 5 candidates A-E. Each formula is tested individually (B/C/D)
 * before the simple predeclared combination (E) — never an opaque fitted
 * score (Section 4).
 */
export function connectivityLambdaMultiplier(candidate: LambdaCandidateId, metrics: TeamGraphMetrics): number {
  switch (candidate) {
    case "GLOBAL_BASELINE":
      return 1;
    case "GAMES_PLAYED":
      return gamesPlayedMultiplier(metrics);
    case "COMPONENT_SIZE":
      return componentSizeMultiplier(metrics);
    case "CROSS_CONFERENCE":
      return crossConferenceMultiplier(metrics);
    case "COMBINED_INFORMATION":
      return clamp(0.5 * (gamesPlayedMultiplier(metrics) + crossConferenceMultiplier(metrics)), 1, MAX_CONNECTIVITY_MULTIPLIER);
    default:
      return 1;
  }
}
