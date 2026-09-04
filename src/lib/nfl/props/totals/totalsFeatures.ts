/**
 * NFL projected game total -- v1 production feature builder.
 *
 * Reuses the exact leakage-safe logic already proven in the Phase A-Q
 * research program: `computeEwmaWindow` (src/lib/nfl/research/total/ewmaWindow.ts)
 * for the offense (half-life 6 team games) and opponent-defense-allowed
 * (half-life 4 team games) windows, and `buildScoringSupportIndex`
 * (src/lib/nfl/research/total/teamScoringFeatures.ts) for the by-team /
 * by-opponent row index. This module adds nothing new to that logic -- it
 * only fixes the frozen v1 feature contract (5 features, no
 * scoringEnvironment, no explosive rate) on top of it and reports the
 * per-side history metadata (games used, effective sample size, status)
 * the production output contract requires.
 *
 * Framework-free and pure: callers supply already-loaded scoring-support
 * rows (from whatever cache is wired in -- see this module's file header
 * in the production generator script for the current, disclosed gap
 * around cache freshness) and get back computed features. No file I/O
 * here, matching every other props/ generator's pure-function convention.
 */
import { computeEwmaWindow } from "@/lib/nfl/research/total/ewmaWindow";
import { buildScoringSupportIndex, type NflTotalResearchScoringSupportIndex } from "@/lib/nfl/research/total/teamScoringFeatures";
import { normalizeNflTeamAbbr } from "@/lib/nfl/identity/identity";
import type { NflTotalResearchScoringSupportRow } from "@/lib/nfl/research/total/types";
import { NFL_TOTAL_OFFENSE_HALF_LIFE_GAMES, NFL_TOTAL_DEFENSE_HALF_LIFE_GAMES, NFL_TOTAL_FEATURE_NAMES, classifyHistoryStatus, type NflTotalHistoryStatus } from "./totalsModelContract";

export type NflTotalFeatureCutoff = { season: number; week: number };

export type NflTotalSideFeatures = {
  offenseEpaPerPlay: number | null;
  offenseSuccessRate: number | null;
  opponentDefenseEpaAllowed: number | null;
  opponentDefenseSuccessAllowed: number | null;
  homeIndicator: 0 | 1;
  offenseGamesUsed: number;
  offenseEffectiveSampleSize: number;
  defenseGamesUsed: number;
  defenseEffectiveSampleSize: number;
  historyStatus: NflTotalHistoryStatus;
};

export { buildScoringSupportIndex, type NflTotalResearchScoringSupportIndex };

/**
 * Builds one team's v1 feature row at a strict (season, week) cutoff.
 * `team` and `opponent` are normalized through the canonical identity
 * layer, matching every other NFL production consumer.
 */
export function buildNflTotalFeatures(
  index: NflTotalResearchScoringSupportIndex,
  rawTeam: string,
  rawOpponent: string,
  cutoff: NflTotalFeatureCutoff,
  homeAway: "home" | "away",
): NflTotalSideFeatures {
  const team = normalizeNflTeamAbbr(rawTeam);
  const opponent = normalizeNflTeamAbbr(rawOpponent);
  if (!team || !opponent) throw new Error(`buildNflTotalFeatures: unresolved team code (team=${String(rawTeam)}, opponent=${String(rawOpponent)})`);

  const offense = computeEwmaWindow(index.byTeam.get(team) ?? [], cutoff, NFL_TOTAL_OFFENSE_HALF_LIFE_GAMES);
  const defenseAllowed = computeEwmaWindow(index.byOpponent.get(opponent) ?? [], cutoff, NFL_TOTAL_DEFENSE_HALF_LIFE_GAMES);

  const historyStatus = classifyHistoryStatus(Math.min(offense.totalGamesUsed, defenseAllowed.totalGamesUsed));

  return {
    offenseEpaPerPlay: offense.epaPerPlay,
    offenseSuccessRate: offense.successRate,
    opponentDefenseEpaAllowed: defenseAllowed.epaPerPlay,
    opponentDefenseSuccessAllowed: defenseAllowed.successRate,
    homeIndicator: homeAway === "home" ? 1 : 0,
    offenseGamesUsed: offense.totalGamesUsed,
    offenseEffectiveSampleSize: offense.effectiveSampleSize,
    defenseGamesUsed: defenseAllowed.totalGamesUsed,
    defenseEffectiveSampleSize: defenseAllowed.effectiveSampleSize,
    historyStatus,
  };
}

/** Ordered feature vector for the ridge, or null if any required value is unresolved (never zero-imputed). */
export function toOrderedFeatureVector(features: NflTotalSideFeatures): readonly number[] | null {
  if (features.offenseEpaPerPlay === null || features.offenseSuccessRate === null || features.opponentDefenseEpaAllowed === null || features.opponentDefenseSuccessAllowed === null) {
    return null;
  }
  return [features.offenseEpaPerPlay, features.offenseSuccessRate, features.opponentDefenseEpaAllowed, features.opponentDefenseSuccessAllowed, features.homeIndicator];
}

export function featureValuesRecord(features: NflTotalSideFeatures): Record<string, number | null> {
  const vector = toOrderedFeatureVector(features);
  return Object.fromEntries(NFL_TOTAL_FEATURE_NAMES.map((name, i) => [name, vector ? vector[i] : (features as unknown as Record<string, number | null>)[name] ?? null]));
}

export type { NflTotalResearchScoringSupportRow };
