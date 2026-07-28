import { MATCHUP_MULTIPLIERS } from "../data/engineConfig";

export function getMatchupMultiplier(defenseRank: number | null | undefined) {
  if (!Number.isInteger(defenseRank) || defenseRank < 1 || defenseRank > 32) {
    return MATCHUP_MULTIPLIERS.neutral;
  }
  if (defenseRank <= 4) return MATCHUP_MULTIPLIERS.easiest;
  if (defenseRank <= 8) return MATCHUP_MULTIPLIERS.easy;
  if (defenseRank <= 12) return MATCHUP_MULTIPLIERS.favorable;
  if (defenseRank <= 20) return MATCHUP_MULTIPLIERS.neutral;
  if (defenseRank <= 24) return MATCHUP_MULTIPLIERS.difficult;
  if (defenseRank <= 28) return MATCHUP_MULTIPLIERS.hard;
  return MATCHUP_MULTIPLIERS.hardest;
}

export function applyMatchupAdjustment(mean: number, defenseRank: number | null | undefined) {
  if (!Number.isFinite(mean)) throw new Error("Expected scoring mean must be finite.");
  return mean * getMatchupMultiplier(defenseRank);
}

