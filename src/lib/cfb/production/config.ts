import { CFB_V02_CANDIDATE_CONFIG } from "../calibration";

export const CFB_V1_CONFIG = Object.freeze({
  ...CFB_V02_CANDIDATE_CONFIG,
  version: "cfb-preseason-v1" as const,
  transitionFallback: Object.freeze({
    source: "prior-fcs-fallback" as const,
    priorPerformanceWeight: 0.5,
    fbsLeagueAverageWeight: 0.5,
    fbsLeagueAverageStandardizedValue: 0,
    policy: "temporary-conservative-cross-classification-shrinkage" as const,
  }),
});
