/**
 * Pure deterministic helpers for NFL Situational Trends Study v1, Phase 2C.
 *
 * Phase 2C adds a predeclared Week 1 / Week 2 early-season angle family on top
 * of the locked Phase 1 team-game rows. It reuses Phase 1/2B grading, market,
 * spread-band, and evidence primitives unchanged and never rewrites a Phase 1,
 * Phase 2, or Phase 2B definition or artifact.
 */

import { classifyEvidence, classifyRecentEvidence, summarizeRows, summarizeStability } from "./nfl-situational-trends-core.mjs";
import { sampleSizeLabel } from "./nfl-situational-trends-phase2-core.mjs";
import {
  articleRelevanceFor as phase2bArticleRelevanceFor,
  buildPhase2bVariant,
  doubleDigitClassification,
  doubleDigitMarginBand,
  favoriteSpreadBand,
  homeUnderdog,
  marketRole,
  roadFavorite,
  underdogSpreadBand,
  windowAssignments,
} from "./nfl-situational-trends-phase2b-core.mjs";

export const PHASE2C_STUDY_VERSION = "nfl-situational-trends-phase2c-v1";
export const PHASE2C_DEFINITION_VERSION = "nfl-situational-trend-definitions-phase2c-v1";
export const PHASE2C_SCHEMA_VERSION = "nfl-situational-trends-phase2c-report-v1";

export const PHASE2C_WEEK1_TREND_IDS = [
  "week1-home-favorites",
  "week1-home-underdogs",
  "week1-road-favorites",
  "week1-road-underdogs",
  "week1-divisional-home-favorites",
  "week1-divisional-home-underdogs",
  "week1-favorites-by-spread-band",
  "week1-underdogs-by-spread-band",
  "week1-double-digit-favorites",
  "week1-double-digit-underdogs",
  "week1-prior-season-playoff-team",
  "week1-prior-season-non-playoff-team",
  "week1-prior-season-winning-vs-losing",
];

export const PHASE2C_WEEK2_TREND_IDS = [
  "week2-after-0-1-start",
  "week2-after-1-0-start",
  "week2-after-week1-ats-loss",
  "week2-after-week1-ats-win",
  "week2-after-week1-favorite-failed-to-cover",
  "week2-home-favorite-after-week1-ats-loss",
  "week2-after-week1-favorite-lost-outright",
  "week2-after-week1-underdog-won-outright",
  "week2-after-week1-win-10-plus",
  "week2-after-week1-loss-10-plus",
  "week2-after-week1-win-14-plus",
  "week2-after-week1-loss-14-plus",
  "week2-0-1-favorite",
  "week2-0-1-underdog",
  "week2-1-0-favorite",
  "week2-1-0-underdog",
  "week2-0-1-vs-1-0-opponent",
  "week2-1-0-vs-0-1-opponent",
];

export const PHASE2C_TREND_IDS = [...PHASE2C_WEEK1_TREND_IDS, ...PHASE2C_WEEK2_TREND_IDS];

export { doubleDigitClassification, doubleDigitMarginBand, favoriteSpreadBand, homeUnderdog, marketRole, roadFavorite, underdogSpreadBand, windowAssignments };

/** Re-exported so Phase 2C generation and current-week qualification share one variant builder. */
export function buildPhase2cVariant(input) {
  return buildPhase2bVariant(input);
}

export function articleRelevanceFor(baseVariant) {
  return phase2bArticleRelevanceFor(baseVariant);
}

/** "current-favorite" / "current-underdog" for the game the row describes, or null when pick'em/unavailable. */
export function currentRoleVariantId(teamSpread) {
  const role = marketRole(teamSpread);
  if (role === "favorite") return "current-favorite";
  if (role === "underdog") return "current-underdog";
  return null;
}

export function currentVenueVariantId(venue) {
  if (venue === "home") return "current-home";
  if (venue === "away") return "current-road";
  return null;
}

/**
 * Classifies a team's own prior-season regular-season record as "winning" or
 * "losing". Returns null when the record is unknown or exactly .500 (ties are
 * never inferred as a winning or losing record).
 */
export function priorSeasonRecordRole(priorSeasonRecord) {
  if (!priorSeasonRecord || !Number.isFinite(priorSeasonRecord.wins) || !Number.isFinite(priorSeasonRecord.losses)) return null;
  if (priorSeasonRecord.wins > priorSeasonRecord.losses) return "winning";
  if (priorSeasonRecord.losses > priorSeasonRecord.wins) return "losing";
  return null;
}

export function priorSeasonPlayoffStatus(madePriorSeasonPlayoffs) {
  if (madePriorSeasonPlayoffs == null) return null;
  return madePriorSeasonPlayoffs ? "playoff" : "non-playoff";
}

/** Week 1 SU outcome expressed as a start-of-season record label. */
export function week1StartRecord(week1SuResult) {
  if (week1SuResult === "W") return "1-0";
  if (week1SuResult === "L") return "0-1";
  return null;
}

export function marginAtLeast(pointMargin, threshold) {
  return Number.isFinite(pointMargin) && Math.abs(pointMargin) >= threshold;
}

export function isWeek1FavoriteAtsLoss({ previousTeamSpread, previousAtsResult }) {
  return marketRole(previousTeamSpread) === "favorite" && previousAtsResult === "L";
}

export function isWeek1FavoriteLostOutright({ previousTeamSpread, previousPointMargin }) {
  return marketRole(previousTeamSpread) === "favorite" && Number.isFinite(previousPointMargin) && previousPointMargin < 0;
}

export function isWeek1UnderdogWonOutright({ previousTeamSpread, previousPointMargin }) {
  return marketRole(previousTeamSpread) === "underdog" && Number.isFinite(previousPointMargin) && previousPointMargin > 0;
}
