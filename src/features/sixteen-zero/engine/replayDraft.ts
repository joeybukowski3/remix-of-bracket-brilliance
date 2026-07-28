import { LEAGUE_CONFIG } from "../data/engineConfig";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { OPPONENT_NAMES } from "../data/opponentNames";
import {
  assignCpuStrategies,
  chooseAutoPick,
  chooseCpuPlayer,
} from "../engine/cpuDraft";
import { createSnakeDraftOrder } from "../engine/draftOrder";
import {
  getLegalDraftCandidates,
  isLegalCompletedRoster,
} from "../engine/rosterRules";
import { SeededRandom } from "../engine/seededRandom";
import { simulateSeason } from "../engine/seasonSimulation";
import type {
  DraftSelection,
  SeasonResult,
  SimulationPlayer,
} from "../types";

export type ReplayedDraft = {
  rosters: Record<number, SimulationPlayer[]>;
  userRoster: SimulationPlayer[];
  result: SeasonResult;
};

export function replayDeterministicDraft(input: {
  seed: string;
  draftSlot: number;
  draftHistory: readonly DraftSelection[];
  submittedResult?: unknown;
}): ReplayedDraft {
  const { seed, draftSlot, draftHistory, submittedResult } = input;
  if (!seed || !Number.isInteger(draftSlot) || draftSlot < 1 || draftSlot > 12) {
    throw new Error("Stored simulation seed or draft slot is invalid.");
  }
  if (draftHistory.length !== 204) throw new Error("Draft must contain exactly 204 selections.");

  const order = createSnakeDraftOrder();
  const strategies = assignCpuStrategies(seed, draftSlot);
  const playersById = new Map(SIMULATION_PLAYERS.map((player) => [player.id, player]));
  const rosters = Object.fromEntries(
    Array.from({ length: LEAGUE_CONFIG.teams }, (_, index) => [index + 1, []]),
  ) as Record<number, SimulationPlayer[]>;
  const draftedIds = new Set<string>();

  for (let index = 0; index < order.length; index += 1) {
    const expectedPick = order[index];
    const selection = draftHistory[index];
    if (
      selection.overallPick !== expectedPick.overallPick ||
      selection.round !== expectedPick.round ||
      selection.slot !== expectedPick.slot
    ) {
      throw new Error(`Draft order is invalid at overall pick ${expectedPick.overallPick}.`);
    }
    if (draftedIds.has(selection.playerId)) {
      throw new Error(`Player was drafted more than once at pick ${expectedPick.overallPick}.`);
    }
    const selectedPlayer = playersById.get(selection.playerId);
    if (!selectedPlayer?.active) {
      throw new Error(`Unknown or inactive player at pick ${expectedPick.overallPick}.`);
    }
    const roster = rosters[expectedPick.slot];
    const available = SIMULATION_PLAYERS.filter(
      (player) => player.active && !draftedIds.has(player.id),
    );
    const picksRemaining = LEAGUE_CONFIG.rounds - roster.length;
    const legalIds = new Set(
      getLegalDraftCandidates(available, roster, picksRemaining).map((player) => player.id),
    );
    if (!legalIds.has(selectedPlayer.id)) {
      throw new Error(`Illegal roster construction at pick ${expectedPick.overallPick}.`);
    }

    if (expectedPick.slot === draftSlot) {
      if (selection.source === "cpu") {
        throw new Error(`User selection is labeled as a CPU pick at ${expectedPick.overallPick}.`);
      }
      if (selection.source === "auto") {
        const expectedAutoPick = chooseAutoPick(available, roster, picksRemaining);
        if (expectedAutoPick.id !== selectedPlayer.id) {
          throw new Error(`Auto-pick does not match the engine at pick ${expectedPick.overallPick}.`);
        }
      }
    } else {
      if (selection.source !== "cpu") {
        throw new Error(`CPU selection source is invalid at pick ${expectedPick.overallPick}.`);
      }
      const expectedCpuPick = chooseCpuPlayer({
        availablePlayers: available,
        roster,
        round: expectedPick.round,
        picksRemainingIncludingCurrent: picksRemaining,
        profile: strategies[expectedPick.slot],
        random: new SeededRandom(seed).fork(`cpu-pick-${expectedPick.overallPick}`),
      });
      if (expectedCpuPick.id !== selectedPlayer.id) {
        throw new Error(`CPU selection does not match the engine at pick ${expectedPick.overallPick}.`);
      }
    }

    roster.push(selectedPlayer);
    draftedIds.add(selectedPlayer.id);
  }

  for (let slot = 1; slot <= LEAGUE_CONFIG.teams; slot += 1) {
    if (!isLegalCompletedRoster(rosters[slot])) {
      throw new Error(`Team ${slot} does not have a legal completed roster.`);
    }
  }
  const userRoster = rosters[draftSlot];
  const result = simulateSeason({
    roster: userRoster,
    userSlot: draftSlot,
    allRosters: rosters,
    playerUniverse: SIMULATION_PLAYERS,
    draftedPlayerIds: draftedIds,
    defenseRanks: DEFENSE_POSITION_RANKS,
    opponentNames: OPPONENT_NAMES.map((entry) => entry.name),
    seed,
  });

  if (submittedResult !== undefined && JSON.stringify(submittedResult) !== JSON.stringify(result)) {
    throw new Error("Submitted season result does not match deterministic server replay.");
  }

  return { rosters, userRoster, result };
}
