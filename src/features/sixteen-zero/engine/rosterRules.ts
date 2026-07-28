import { LEAGUE_CONFIG, ROSTER_SOFT_MAXIMUMS } from "../data/engineConfig";
import type { FantasyPosition, SimulationPlayer } from "../types";

const BASE_REQUIRED: Record<FantasyPosition, number> = {
  QB: LEAGUE_CONFIG.rosterRequirements.QB,
  RB: LEAGUE_CONFIG.rosterRequirements.RB,
  WR: LEAGUE_CONFIG.rosterRequirements.WR,
  TE: LEAGUE_CONFIG.rosterRequirements.TE,
  K: LEAGUE_CONFIG.rosterRequirements.K,
  DST: LEAGUE_CONFIG.rosterRequirements.DST,
};

const ROUND_FIFTEEN_REQUIRED: Record<FantasyPosition, number> = {
  ...BASE_REQUIRED,
  K: 1,
  DST: 1,
};

export function countRosterPositions(roster: readonly SimulationPlayer[]) {
  return roster.reduce<Record<FantasyPosition, number>>(
    (counts, player) => {
      counts[player.position] += 1;
      return counts;
    },
    { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
  );
}

export function minimumPicksNeededForLegalRoster(roster: readonly SimulationPlayer[]) {
  const counts = countRosterPositions(roster);
  const quarterbackDeficit = Math.max(0, BASE_REQUIRED.QB - counts.QB);
  const kickerDeficit = Math.max(0, BASE_REQUIRED.K - counts.K);
  const defenseDeficit = Math.max(0, BASE_REQUIRED.DST - counts.DST);
  const baseSkillDeficit =
    Math.max(0, BASE_REQUIRED.RB - counts.RB) +
    Math.max(0, BASE_REQUIRED.WR - counts.WR) +
    Math.max(0, BASE_REQUIRED.TE - counts.TE);
  const flexEligibleCount = counts.RB + counts.WR + counts.TE;
  const skillDeficitIncludingFlex = Math.max(
    0,
    LEAGUE_CONFIG.rosterRequirements.flexEligible - flexEligibleCount,
  );

  return quarterbackDeficit + kickerDeficit + defenseDeficit + Math.max(baseSkillDeficit, skillDeficitIncludingFlex);
}

export function minimumPicksNeededForRoundFifteenFoundation(
  roster: readonly SimulationPlayer[],
) {
  const counts = countRosterPositions(roster);
  const quarterbackDeficit = Math.max(0, ROUND_FIFTEEN_REQUIRED.QB - counts.QB);
  const kickerDeficit = Math.max(0, ROUND_FIFTEEN_REQUIRED.K - counts.K);
  const defenseDeficit = Math.max(0, ROUND_FIFTEEN_REQUIRED.DST - counts.DST);
  const baseSkillDeficit =
    Math.max(0, ROUND_FIFTEEN_REQUIRED.RB - counts.RB) +
    Math.max(0, ROUND_FIFTEEN_REQUIRED.WR - counts.WR) +
    Math.max(0, ROUND_FIFTEEN_REQUIRED.TE - counts.TE);
  const flexEligibleCount = counts.RB + counts.WR + counts.TE;
  const skillDeficitIncludingFlex = Math.max(
    0,
    LEAGUE_CONFIG.rosterRequirements.flexEligible - flexEligibleCount,
  );

  return quarterbackDeficit + kickerDeficit + defenseDeficit + Math.max(baseSkillDeficit, skillDeficitIncludingFlex);
}

export function canAddPlayer(
  roster: readonly SimulationPlayer[],
  candidate: SimulationPlayer,
  picksRemainingIncludingCurrent: number,
) {
  if (roster.some((player) => player.id === candidate.id)) return false;
  const counts = countRosterPositions(roster);
  const currentRound = roster.length + 1;
  const isReservedBackupRound = currentRound >= 16;

  if (isReservedBackupRound) {
    if (candidate.position !== "K" && candidate.position !== "DST") return false;
  } else if (
    (candidate.position === "K" || candidate.position === "DST") &&
    counts[candidate.position] >= 1
  ) {
    return false;
  }

  if (
    (candidate.position === "K" || candidate.position === "DST") &&
    counts[candidate.position] >= ROSTER_SOFT_MAXIMUMS[candidate.position]
  ) {
    return false;
  }

  const nextRoster = [...roster, candidate];
  const remainingAfterPick = picksRemainingIncludingCurrent - 1;
  if (minimumPicksNeededForLegalRoster(nextRoster) > remainingAfterPick) return false;

  if (currentRound <= 15) {
    const picksRemainingThroughRoundFifteen = 15 - currentRound;
    if (
      minimumPicksNeededForRoundFifteenFoundation(nextRoster) >
      picksRemainingThroughRoundFifteen
    ) {
      return false;
    }
  }

  return true;
}

export function getLegalDraftCandidates(
  availablePlayers: readonly SimulationPlayer[],
  roster: readonly SimulationPlayer[],
  picksRemainingIncludingCurrent: number,
) {
  return availablePlayers.filter((candidate) =>
    canAddPlayer(roster, candidate, picksRemainingIncludingCurrent),
  );
}

export function isLegalCompletedRoster(roster: readonly SimulationPlayer[]) {
  if (roster.length !== LEAGUE_CONFIG.rosterSize) return false;
  if (new Set(roster.map((player) => player.id)).size !== roster.length) return false;
  const counts = countRosterPositions(roster);
  if (
    counts.K !== LEAGUE_CONFIG.rosterRequirements.K ||
    counts.DST !== LEAGUE_CONFIG.rosterRequirements.DST
  ) {
    return false;
  }
  return minimumPicksNeededForLegalRoster(roster) === 0;
}

export function isRoundFifteenFoundationComplete(
  roster: readonly SimulationPlayer[],
) {
  return (
    roster.length === 15 &&
    minimumPicksNeededForRoundFifteenFoundation(roster) === 0
  );
}

export function getRosterNeeds(roster: readonly SimulationPlayer[]) {
  const counts = countRosterPositions(roster);
  const needs: FantasyPosition[] = [];
  for (const position of Object.keys(BASE_REQUIRED) as FantasyPosition[]) {
    if (counts[position] < BASE_REQUIRED[position]) needs.push(position);
  }
  if (
    counts.RB + counts.WR + counts.TE <
    LEAGUE_CONFIG.rosterRequirements.flexEligible
  ) {
    const flexPriorities = (["RB", "WR", "TE"] as const).filter(
      (position) => counts[position] < ROSTER_SOFT_MAXIMUMS[position],
    );
    needs.push(...flexPriorities);
  }
  return [...new Set(needs)];
}

export function isAboveSoftMaximum(roster: readonly SimulationPlayer[], position: FantasyPosition) {
  return countRosterPositions(roster)[position] >= ROSTER_SOFT_MAXIMUMS[position];
}
