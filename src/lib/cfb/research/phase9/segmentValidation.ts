import {
  buildConnectivityBuckets,
  buildNonconferenceBuckets,
  buildSeasonRows,
  buildTransitionTeamBuckets,
  buildWeekRangeRows,
} from "../phase8/bucketAnalysis";
import type { Phase8Prediction } from "../phase8/types";

/**
 * Sections 5/6/7/8/20 — margin-based segment validation (week ranges,
 * connectivity buckets, transition teams, nonconference, season-by-season)
 * reuses Phase 8's own bucket-analysis functions VERBATIM. This is valid
 * because Phase 5's TOTAL_ONLY calibration mode is mathematically proven to
 * preserve raw margin exactly (calibratedMargin = calibratedHome -
 * calibratedAway = rawMargin — see phase5WalkForwardCore.ts), so the
 * Phase 8 rating-step predictions (`ratingPredictions`) already carry the
 * correct calibrated margin for every downstream segment analysis; no new
 * bucket logic is duplicated here (Section 2).
 */
export function buildAllSegmentValidations(ratingPredictions: readonly Phase8Prediction[]) {
  return {
    weekRanges: buildWeekRangeRows(ratingPredictions),
    connectivityBuckets: buildConnectivityBuckets(ratingPredictions),
    transitionTeamBuckets: buildTransitionTeamBuckets(ratingPredictions),
    nonconferenceBuckets: buildNonconferenceBuckets(ratingPredictions),
    seasonRows: buildSeasonRows(ratingPredictions),
  };
}
