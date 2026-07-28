import type { SimulationPlayer } from "../types";
import type { DefensePositionRanks } from "./lineupOptimizer";
import { getExpectedPlayerScore, optimizeLineup } from "./lineupOptimizer";

export type CpuRosterStrength = {
  slot: number;
  strength: number;
};

export type PlayoffOpponentSelection = {
  week15: CpuRosterStrength;
  week16: CpuRosterStrength;
  week17: CpuRosterStrength;
};

/**
 * Deterministic, projection-based measure of a roster's expected weekly
 * output across the 14-week regular season. Uses matchup-adjusted expected
 * value only (no simulated outcomes), so it is safe to compute before any
 * weekly result exists and use for playoff-opponent tiering or standings.
 */
export function computeRosterStrength(
  roster: readonly SimulationPlayer[],
  defenseRanks: DefensePositionRanks,
  temporaryReplacementPool: readonly SimulationPlayer[],
): number {
  const weeklyExpectedTotals = Array.from({ length: 14 }, (_, index) => {
    const week = index + 1;
    const lineup = optimizeLineup(roster, week, defenseRanks, {
      temporaryReplacementPool,
    });
    return Object.values(lineup).reduce(
      (total, player) =>
        total + (player ? getExpectedPlayerScore(player, week, defenseRanks) : 0),
      0,
    );
  });
  return (
    weeklyExpectedTotals.reduce((total, value) => total + value, 0) /
    weeklyExpectedTotals.length
  );
}

/**
 * Selects playoff opponents purely from precomputed CPU roster strength,
 * ranked before any weekly outcome exists. Takes no user score as input, so
 * it structurally cannot inspect (or react to) a realized user result. Week
 * 17 gets the strongest CPU roster, Week 16 the next-strongest, and Week 15
 * an above-average qualifying roster from the upper-middle of the field.
 */
export function selectPlayoffOpponents(
  cpuStrengths: readonly CpuRosterStrength[],
): PlayoffOpponentSelection {
  if (cpuStrengths.length !== 11) {
    throw new Error("Playoff opponent selection requires exactly 11 CPU roster strengths.");
  }
  const rankedByStrengthDescending = [...cpuStrengths].sort(
    (first, second) => second.strength - first.strength,
  );
  const week17 = rankedByStrengthDescending[0];
  const week16 = rankedByStrengthDescending[1] ?? week17;
  const week15 =
    rankedByStrengthDescending[3] ??
    rankedByStrengthDescending[rankedByStrengthDescending.length - 1];
  return { week15, week16, week17 };
}
