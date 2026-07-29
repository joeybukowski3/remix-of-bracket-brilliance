import { getExpectedPlayerScore } from "./lineupOptimizer";
import type { DefensePositionRanks } from "./lineupOptimizer";
import type { DraftSelection, ScheduleGame, SimulationPlayer } from "../types";

const REGULAR_SEASON_WEEKS = 14;
const DRAFT_VALUE_ADJUSTMENT_DIVISOR = 20;
const DRAFT_VALUE_ADJUSTMENT_CLAMP = 3;

export type PickOutcome = {
  playerId: string;
  playerName: string;
  team: string;
  round: number;
  overallPick: number;
  simulatedContributionPPG: number;
  projectedContributionPPG: number;
  pickOutcomeScore: number;
};

export type PickOutcomeExtremes = {
  best: PickOutcome;
  worst: PickOutcome;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Grades each user draft pick by how it actually played out this run, not
 * just where it was drafted relative to consensus. For every non-bye,
 * non-temporary-replacement start in regular-season Weeks 1-14, sums the
 * exact saved simulated points alongside the same deterministic
 * matchup-adjusted expected points used to build that week's lineup (no
 * re-simulation, no randomness consumed). Dividing both totals by 14 gives a
 * simulated and projected contribution PPG per player; the gap between them
 * (performanceDelta) is the primary signal, with a small clamped
 * draft-value nudge so a plainly-drafted riser or a premium-pick bust still
 * separates from the pack even on a small performance gap.
 */
export function computePickOutcomeExtremes(
  selections: readonly DraftSelection[],
  draftSlot: number,
  playerUniverse: readonly SimulationPlayer[],
  schedule: readonly ScheduleGame[],
  defenseRanks: DefensePositionRanks,
): PickOutcomeExtremes | null {
  const playerById = new Map(playerUniverse.map((player) => [player.id, player]));

  const simulatedTotals = new Map<string, number>();
  const expectedTotals = new Map<string, number>();

  for (const game of schedule) {
    if (game.fantasyWeek > REGULAR_SEASON_WEEKS || game.isBye || !game.boxScore) continue;
    for (const entry of game.boxScore.userLineup) {
      if (entry.isTemporaryReplacement) continue;
      const player = playerById.get(entry.playerId);
      if (!player) continue;
      simulatedTotals.set(entry.playerId, (simulatedTotals.get(entry.playerId) ?? 0) + entry.points);
      expectedTotals.set(
        entry.playerId,
        (expectedTotals.get(entry.playerId) ?? 0) +
          getExpectedPlayerScore(player, game.fantasyWeek, defenseRanks),
      );
    }
  }

  const outcomes: PickOutcome[] = [];
  for (const selection of selections) {
    if (selection.slot !== draftSlot) continue;
    const player = playerById.get(selection.playerId);
    if (!player) continue;

    const simulatedContributionPPG =
      (simulatedTotals.get(selection.playerId) ?? 0) / REGULAR_SEASON_WEEKS;
    const projectedContributionPPG =
      (expectedTotals.get(selection.playerId) ?? 0) / REGULAR_SEASON_WEEKS;
    const performanceDelta = simulatedContributionPPG - projectedContributionPPG;
    const draftValueAdjustment = clamp(
      (selection.overallPick - player.consensusOverallRank) / DRAFT_VALUE_ADJUSTMENT_DIVISOR,
      -DRAFT_VALUE_ADJUSTMENT_CLAMP,
      DRAFT_VALUE_ADJUSTMENT_CLAMP,
    );

    outcomes.push({
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      round: selection.round,
      overallPick: selection.overallPick,
      simulatedContributionPPG,
      projectedContributionPPG,
      pickOutcomeScore: performanceDelta + draftValueAdjustment,
    });
  }

  if (outcomes.length === 0) return null;

  const best = outcomes.reduce((current, candidate) =>
    candidate.pickOutcomeScore > current.pickOutcomeScore ? candidate : current,
  );
  const worst = outcomes.reduce((current, candidate) =>
    candidate.pickOutcomeScore < current.pickOutcomeScore ? candidate : current,
  );

  return { best, worst };
}
