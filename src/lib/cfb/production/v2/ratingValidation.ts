// CFB Model V2 — fail-closed rating validation (Phase 10 §16, WU2 §22).
// Aborts artifact generation on structural failure rather than publishing
// a partial/degraded artifact.

import { CFB_V2_RATING_CONFIG } from "./config";
import type { CfbV2TeamRating } from "./types";

export class CfbV2RatingValidationError extends Error {}

export type CfbV2ExpectedFbsTeams = ReadonlySet<string>;

/**
 * Validates a full CfbV2TeamRating[] before it may be written to an
 * artifact. Throws on the first structural failure found — never returns a
 * "partially valid" result.
 */
export function validateCfbV2TeamRatings(ratings: readonly CfbV2TeamRating[], expectedFbsTeamIds: CfbV2ExpectedFbsTeams): void {
  if (ratings.length === 0) {
    throw new CfbV2RatingValidationError("no team ratings produced");
  }

  const seenTeamIds = new Set<string>();
  for (const rating of ratings) {
    if (seenTeamIds.has(rating.teamId)) {
      throw new CfbV2RatingValidationError(`duplicate teamId in rating output: ${rating.teamId}`);
    }
    seenTeamIds.add(rating.teamId);

    for (const [field, value] of [
      ["offenseRating", rating.offenseRating],
      ["defenseRating", rating.defenseRating],
      ["overallRating", rating.overallRating],
    ] as const) {
      if (!Number.isFinite(value)) {
        throw new CfbV2RatingValidationError(`${rating.teamId}.${field} is not finite: ${value}`);
      }
    }

    if (rating.preseasonPriorOffense !== null && !Number.isFinite(rating.preseasonPriorOffense)) {
      throw new CfbV2RatingValidationError(`${rating.teamId}.preseasonPriorOffense is non-finite`);
    }
    if (rating.preseasonPriorDefense !== null && !Number.isFinite(rating.preseasonPriorDefense)) {
      throw new CfbV2RatingValidationError(`${rating.teamId}.preseasonPriorDefense is non-finite`);
    }

    if (!(rating.connectivity.componentSize >= 1)) {
      throw new CfbV2RatingValidationError(`${rating.teamId}.connectivity.componentSize must be >= 1, got ${rating.connectivity.componentSize}`);
    }
    const { regularizationMultiplier } = rating.connectivity;
    const cap = CFB_V2_RATING_CONFIG.connectivity.maxPenaltyMultiplier;
    if (!(regularizationMultiplier >= 1 && regularizationMultiplier <= cap)) {
      throw new CfbV2RatingValidationError(`${rating.teamId}.connectivity.regularizationMultiplier out of [1,${cap}]: ${regularizationMultiplier}`);
    }

    if (!(rating.gamesPlayed >= 0)) {
      throw new CfbV2RatingValidationError(`${rating.teamId}.gamesPlayed must be >= 0`);
    }

    if (!rating.modelVersion || !rating.configVersion || !rating.generatedAt || !rating.dataAsOf) {
      throw new CfbV2RatingValidationError(`${rating.teamId} is missing required provenance fields`);
    }

    if (Number.isNaN(Date.parse(rating.dataAsOf)) || Number.isNaN(Date.parse(rating.generatedAt))) {
      throw new CfbV2RatingValidationError(`${rating.teamId} has an unparseable provenance timestamp`);
    }
    if (Date.parse(rating.dataAsOf) > Date.parse(rating.generatedAt)) {
      throw new CfbV2RatingValidationError(`${rating.teamId}.dataAsOf (${rating.dataAsOf}) is after generatedAt (${rating.generatedAt})`);
    }
  }

  const missing = [...expectedFbsTeamIds].filter((teamId) => !seenTeamIds.has(teamId));
  if (missing.length > 0) {
    throw new CfbV2RatingValidationError(`expected FBS team(s) unresolved/missing from rating output: ${missing.join(", ")}`);
  }
}
