import { CFB_V1_CONFIG } from "./config";

export function applyTransitionFallbackShrinkage(
  priorPerformanceSource: string,
  standardizedValue: number | null,
): number | null {
  if (standardizedValue === null || priorPerformanceSource !== CFB_V1_CONFIG.transitionFallback.source) {
    return standardizedValue;
  }
  const policy = CFB_V1_CONFIG.transitionFallback;
  return standardizedValue * policy.priorPerformanceWeight +
    policy.fbsLeagueAverageStandardizedValue * policy.fbsLeagueAverageWeight;
}
