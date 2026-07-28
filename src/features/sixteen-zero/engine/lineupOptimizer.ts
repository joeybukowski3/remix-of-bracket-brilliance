import type {
  FantasyPosition,
  LineupSlot,
  OptimizedLineup,
  SimulationPlayer,
  WeeklyLineup,
} from "../types";
import { applyMatchupAdjustment } from "./matchupAdjustment";

export type DefensePositionRanks = Record<
  string,
  Partial<Record<FantasyPosition, number>>
>;

export const LINEUP_SLOTS: LineupSlot[] = [
  "QB",
  "RB1",
  "RB2",
  "WR1",
  "WR2",
  "TE",
  "FLEX",
  "K",
  "DST",
];

type LineupOptimizationOptions = {
  temporaryReplacementPool?: readonly SimulationPlayer[];
};

export function normalizeOpponent(opponent: string | null | undefined) {
  return opponent?.replace(/^@/, "").trim().toUpperCase() ?? null;
}

export function getExpectedPlayerScore(
  player: SimulationPlayer,
  week: number | null,
  defenseRanks: DefensePositionRanks = {},
) {
  if (week !== null && player.byeWeek === week) return 0;
  if (week === null) return player.blendedPPG;
  const opponent = normalizeOpponent(player.weeklyOpponents[week]);
  const defenseRank = opponent ? defenseRanks[opponent]?.[player.position] : null;
  return applyMatchupAdjustment(player.blendedPPG, defenseRank);
}

function bestAtPosition(
  players: readonly SimulationPlayer[],
  position: FantasyPosition,
  count: number,
  week: number | null,
  defenseRanks: DefensePositionRanks,
) {
  return players
    .filter((player) => player.position === position && (week === null || player.byeWeek !== week))
    .sort(
      (first, second) =>
        getExpectedPlayerScore(second, week, defenseRanks) -
          getExpectedPlayerScore(first, week, defenseRanks) ||
        first.consensusOverallRank - second.consensusOverallRank,
    )
    .slice(0, count);
}

function isEligibleForSlot(player: SimulationPlayer, slot: LineupSlot) {
  if (slot === "RB1" || slot === "RB2") return player.position === "RB";
  if (slot === "WR1" || slot === "WR2") return player.position === "WR";
  if (slot === "FLEX") {
    return player.position === "RB" || player.position === "WR" || player.position === "TE";
  }
  return player.position === slot;
}

function fillEmptySlotsWithTemporaryReplacements(
  lineup: WeeklyLineup,
  week: number,
  defenseRanks: DefensePositionRanks,
  temporaryReplacementPool: readonly SimulationPlayer[],
) {
  const usedIds = new Set(
    Object.values(lineup)
      .filter((player): player is SimulationPlayer => player !== null)
      .map((player) => player.id),
  );

  for (const slot of LINEUP_SLOTS) {
    if (lineup[slot] !== null) continue;
    const replacement = temporaryReplacementPool
      .filter(
        (player) =>
          player.active &&
          player.byeWeek !== week &&
          !usedIds.has(player.id) &&
          isEligibleForSlot(player, slot),
      )
      .sort(
        (first, second) =>
          getExpectedPlayerScore(second, week, defenseRanks) -
            getExpectedPlayerScore(first, week, defenseRanks) ||
          first.consensusOverallRank - second.consensusOverallRank,
      )[0];
    if (!replacement) continue;
    lineup[slot] = replacement;
    usedIds.add(replacement.id);
  }

  return lineup;
}

export function optimizeLineup(
  roster: readonly SimulationPlayer[],
  week: number,
  defenseRanks: DefensePositionRanks = {},
  options: LineupOptimizationOptions = {},
): WeeklyLineup {
  const quarterbacks = bestAtPosition(roster, "QB", 1, week, defenseRanks);
  const runningBacks = bestAtPosition(roster, "RB", 2, week, defenseRanks);
  const wideReceivers = bestAtPosition(roster, "WR", 2, week, defenseRanks);
  const tightEnds = bestAtPosition(roster, "TE", 1, week, defenseRanks);
  const kickers = bestAtPosition(roster, "K", 1, week, defenseRanks);
  const defenses = bestAtPosition(roster, "DST", 1, week, defenseRanks);

  const usedIds = new Set(
    [...quarterbacks, ...runningBacks, ...wideReceivers, ...tightEnds, ...kickers, ...defenses].map(
      (player) => player.id,
    ),
  );
  const flex = roster
    .filter(
      (player) =>
        (player.position === "RB" || player.position === "WR" || player.position === "TE") &&
        !usedIds.has(player.id) &&
        (week === null || player.byeWeek !== week),
    )
    .sort(
      (first, second) =>
        getExpectedPlayerScore(second, week, defenseRanks) -
          getExpectedPlayerScore(first, week, defenseRanks) ||
        first.consensusOverallRank - second.consensusOverallRank,
    )[0];

  const lineup: WeeklyLineup = {
    QB: quarterbacks[0] ?? null,
    RB1: runningBacks[0] ?? null,
    RB2: runningBacks[1] ?? null,
    WR1: wideReceivers[0] ?? null,
    WR2: wideReceivers[1] ?? null,
    TE: tightEnds[0] ?? null,
    FLEX: flex ?? null,
    K: kickers[0] ?? null,
    DST: defenses[0] ?? null,
  };

  return options.temporaryReplacementPool
    ? fillEmptySlotsWithTemporaryReplacements(
        lineup,
        week,
        defenseRanks,
        options.temporaryReplacementPool,
      )
    : lineup;
}

export function getEmptyLineupSlots(lineup: WeeklyLineup) {
  return LINEUP_SLOTS.filter((slot) => lineup[slot] === null);
}

export function optimizeProjectedStartingRoster(roster: readonly SimulationPlayer[]): OptimizedLineup {
  const quarterbacks = bestAtPosition(roster, "QB", 1, null, {});
  const runningBacks = bestAtPosition(roster, "RB", 2, null, {});
  const wideReceivers = bestAtPosition(roster, "WR", 2, null, {});
  const tightEnds = bestAtPosition(roster, "TE", 1, null, {});
  const kickers = bestAtPosition(roster, "K", 1, null, {});
  const defenses = bestAtPosition(roster, "DST", 1, null, {});
  const usedIds = new Set(
    [...quarterbacks, ...runningBacks, ...wideReceivers, ...tightEnds, ...kickers, ...defenses].map(
      (player) => player.id,
    ),
  );
  const flex = roster
    .filter(
      (player) =>
        (player.position === "RB" || player.position === "WR" || player.position === "TE") &&
        !usedIds.has(player.id),
    )
    .sort(
      (first, second) =>
        second.blendedPPG - first.blendedPPG ||
        first.consensusOverallRank - second.consensusOverallRank,
    )[0];

  if (
    quarterbacks.length < 1 ||
    runningBacks.length < 2 ||
    wideReceivers.length < 2 ||
    tightEnds.length < 1 ||
    !flex ||
    kickers.length < 1 ||
    defenses.length < 1
  ) {
    throw new Error("Roster cannot form a legal projected starting lineup.");
  }

  return {
    QB: quarterbacks[0],
    RB1: runningBacks[0],
    RB2: runningBacks[1],
    WR1: wideReceivers[0],
    WR2: wideReceivers[1],
    TE: tightEnds[0],
    FLEX: flex,
    K: kickers[0],
    DST: defenses[0],
  };
}
