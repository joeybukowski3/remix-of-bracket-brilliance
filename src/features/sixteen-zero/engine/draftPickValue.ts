import type { DraftSelection, SimulationPlayer } from "../types";

export type DraftPickValue = {
  playerId: string;
  playerName: string;
  team: string;
  round: number;
  overallPick: number;
  consensusOverallRank: number;
  value: number;
};

export type DraftPickValueExtremes = {
  best: DraftPickValue;
  worst: DraftPickValue;
};

/**
 * Deterministic draft-value extremes for a single roster's picks.
 * value = consensusOverallRank - actualDraftPick, so a big positive value is a
 * player who fell well past their consensus rank (best value), and a big
 * negative value is a player taken well ahead of it (worst value). Simulated
 * in-season performance is intentionally excluded from this calculation.
 */
export function computeDraftPickValueExtremes(
  selections: readonly DraftSelection[],
  draftSlot: number,
  playerUniverse: readonly SimulationPlayer[],
): DraftPickValueExtremes | null {
  const playerById = new Map(playerUniverse.map((player) => [player.id, player]));

  const picks: DraftPickValue[] = [];
  for (const selection of selections) {
    if (selection.slot !== draftSlot) continue;
    const player = playerById.get(selection.playerId);
    if (!player) continue;
    picks.push({
      playerId: player.id,
      playerName: player.name,
      team: player.team,
      round: selection.round,
      overallPick: selection.overallPick,
      consensusOverallRank: player.consensusOverallRank,
      value: player.consensusOverallRank - selection.overallPick,
    });
  }

  if (picks.length === 0) return null;

  const best = picks.reduce((current, candidate) =>
    candidate.value > current.value ? candidate : current,
  );
  const worst = picks.reduce((current, candidate) =>
    candidate.value < current.value ? candidate : current,
  );

  return { best, worst };
}
