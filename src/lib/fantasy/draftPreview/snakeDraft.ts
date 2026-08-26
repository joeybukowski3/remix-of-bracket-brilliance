/** Pure 12-team snake draft pick-position math. Presentation-only; never touches rankings. */

export const SNAKE_DRAFT_TEAM_COUNT = 12;

/**
 * Overall pick number for `round` (1-based) when drafting from `slot`
 * (1-based, 1-12) in a `teamCount`-team snake draft.
 *
 * Odd rounds run 1 -> teamCount; even rounds reverse teamCount -> 1.
 */
export function computeSnakeOverallPick(
  round: number,
  slot: number,
  teamCount: number = SNAKE_DRAFT_TEAM_COUNT,
): number {
  if (!Number.isInteger(round) || round < 1) {
    throw new Error(`Invalid snake draft round: ${round}.`);
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > teamCount) {
    throw new Error(`Invalid snake draft slot: ${slot}. Must be 1-${teamCount}.`);
  }
  const isOddRound = round % 2 === 1;
  return isOddRound ? (round - 1) * teamCount + slot : round * teamCount - slot + 1;
}

export type SnakeDraftPick = {
  round: number;
  overallPick: number;
};

/**
 * The slot's overall pick number for every round from 1 through `roundCount`,
 * in round order.
 */
export function computeSnakeDraftSlotPicks(
  slot: number,
  roundCount: number,
  teamCount: number = SNAKE_DRAFT_TEAM_COUNT,
): readonly SnakeDraftPick[] {
  return Array.from({ length: roundCount }, (_, index) => {
    const round = index + 1;
    return { round, overallPick: computeSnakeOverallPick(round, slot, teamCount) };
  });
}

/** Rounds needed for a slot's picks to cover `rowCount` total board rows. */
export function roundsToCoverRowCount(rowCount: number, teamCount: number = SNAKE_DRAFT_TEAM_COUNT): number {
  return Math.ceil(rowCount / teamCount);
}
