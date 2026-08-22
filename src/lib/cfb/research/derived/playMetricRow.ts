import type { CfbResearchPlay } from "../types";
import { classifyResearchPlayCategory } from "./classifyPlay";
import { CFB_PHASE1_METRICS_CONFIG } from "./metricsConfig";
import { isEligibleScrimmagePlay, isOvertimePeriod, isTwoPointTryCategory } from "./scrimmageEligibility";
import type { CfbResearchPlayCategory } from "./types";

/** Not exported in CfbResearchPlay today; the derive pipeline reads playText from the raw row alongside it. */
export type PlayMetricRowInput = { play: CfbResearchPlay; playText: string | null };

export type PlayMetricRow = {
  playId: string;
  gameId: string;
  season: number;
  week: number;
  offenseExternalId: string | null;
  defenseExternalId: string | null;
  rawPlayType: string | null;
  category: CfbResearchPlayCategory;
  eligible: boolean;
  isTwoPointTry: boolean;
  isOvertime: boolean;
  down: number | null;
  distance: number | null;
  yardsGained: number | null;
  providerPpa: number | null;
  period: number | null;
  clockMinutes: number | null;
  clockSeconds: number | null;
  offenseScore: number | null;
  defenseScore: number | null;
  isEarlyDown: boolean;
  isPassingDown: boolean;
  ppaSuccess: boolean | null;
  downDistanceSuccess: boolean | null;
  explosiveType: "pass" | "rush" | null;
  isExplosive: boolean | null;
};

function computeIsEarlyDown(down: number | null): boolean {
  return down === 1 || down === 2;
}

function computeIsPassingDown(down: number | null, distance: number | null): boolean {
  if (down === null || distance === null) return false;
  const rule = CFB_PHASE1_METRICS_CONFIG.passingDownRule;
  if (down === 2) return distance >= rule.down2MinDistance;
  if (down === 3 || down === 4) return distance >= rule.down3Or4MinDistance;
  return false;
}

function computePpaSuccess(providerPpa: number | null): boolean | null {
  if (providerPpa === null) return null;
  return providerPpa > CFB_PHASE1_METRICS_CONFIG.ppaSuccessThreshold;
}

function computeDownDistanceSuccess(
  down: number | null,
  distance: number | null,
  yardsGained: number | null,
): boolean | null {
  if (down === null || distance === null || yardsGained === null) return null;
  const requiredFraction = CFB_PHASE1_METRICS_CONFIG.downDistanceSuccessThresholds[down];
  if (requiredFraction === undefined || distance <= 0) return null;
  return yardsGained >= distance * requiredFraction;
}

function computeExplosive(
  category: CfbResearchPlayCategory,
  yardsGained: number | null,
): { type: "pass" | "rush" | null; isExplosive: boolean | null } {
  if (category !== "pass" && category !== "rush") return { type: null, isExplosive: null };
  if (yardsGained === null) return { type: category, isExplosive: null };
  const threshold =
    category === "pass"
      ? CFB_PHASE1_METRICS_CONFIG.explosivePassYards
      : CFB_PHASE1_METRICS_CONFIG.explosiveRushYards;
  return { type: category, isExplosive: yardsGained >= threshold };
}

export function buildPlayMetricRow({ play, playText }: PlayMetricRowInput): PlayMetricRow {
  const category = classifyResearchPlayCategory(play.rawPlayType, playText);
  const explosive = computeExplosive(category, play.yardsGained);
  return {
    playId: play.playId,
    gameId: play.gameId,
    season: play.season,
    week: play.week,
    offenseExternalId: play.offenseExternalId,
    defenseExternalId: play.defenseExternalId,
    rawPlayType: play.rawPlayType,
    category,
    eligible: isEligibleScrimmagePlay(category),
    isTwoPointTry: isTwoPointTryCategory(category),
    isOvertime: isOvertimePeriod(play.period),
    down: play.down,
    distance: play.distance,
    yardsGained: play.yardsGained,
    providerPpa: play.providerPpa,
    period: play.period,
    clockMinutes: play.clockMinutes,
    clockSeconds: play.clockSeconds,
    offenseScore: play.offenseScore,
    defenseScore: play.defenseScore,
    isEarlyDown: computeIsEarlyDown(play.down),
    isPassingDown: computeIsPassingDown(play.down, play.distance),
    ppaSuccess: computePpaSuccess(play.providerPpa),
    downDistanceSuccess: computeDownDistanceSuccess(play.down, play.distance, play.yardsGained),
    explosiveType: explosive.type,
    isExplosive: explosive.isExplosive,
  };
}
