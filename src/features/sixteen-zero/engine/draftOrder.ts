import { LEAGUE_CONFIG } from "../data/engineConfig";

export type DraftPick = {
  overallPick: number;
  round: number;
  slot: number;
  pickInRound: number;
};

export function createSnakeDraftOrder(
  teamCount = LEAGUE_CONFIG.teams,
  rounds = LEAGUE_CONFIG.rounds,
): DraftPick[] {
  if (!Number.isInteger(teamCount) || teamCount < 2 || !Number.isInteger(rounds) || rounds < 1) {
    throw new Error("Draft order requires at least two teams and one round.");
  }

  return Array.from({ length: teamCount * rounds }, (_, index) => {
    const round = Math.floor(index / teamCount) + 1;
    const pickInRound = (index % teamCount) + 1;
    const slot = round % 2 === 1 ? pickInRound : teamCount - pickInRound + 1;
    return {
      overallPick: index + 1,
      round,
      slot,
      pickInRound,
    };
  });
}

export function getUserDraftPicks(
  draftSlot: number,
  order = createSnakeDraftOrder(),
) {
  if (!Number.isInteger(draftSlot) || draftSlot < 1 || draftSlot > LEAGUE_CONFIG.teams) {
    throw new Error("Draft slot must be between 1 and 12.");
  }
  return order.filter((pick) => pick.slot === draftSlot);
}

