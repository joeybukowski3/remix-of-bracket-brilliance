import {
  CPU_DRAFT_WEIGHTS,
  CPU_STRATEGIES,
  LEAGUE_CONFIG,
  ROSTER_SOFT_MAXIMUMS,
} from "../data/engineConfig";
import type {
  CpuStrategyProfile,
  DraftSelection,
  FantasyPosition,
  SimulationPlayer,
} from "../types";
import { createSnakeDraftOrder } from "./draftOrder";
import {
  countRosterPositions,
  getLegalDraftCandidates,
  getRosterNeeds,
  isAboveSoftMaximum,
} from "./rosterRules";
import { SeededRandom } from "./seededRandom";

type CpuPickInput = {
  availablePlayers: readonly SimulationPlayer[];
  roster: readonly SimulationPlayer[];
  round: number;
  picksRemainingIncludingCurrent: number;
  profile: CpuStrategyProfile;
  random: SeededRandom;
};

function rankValue(rank: number, universeSize: number) {
  return Math.max(0, 1 - (Math.max(1, rank) - 1) / Math.max(1, universeSize));
}

function positionalNeedValue(
  position: FantasyPosition,
  roster: readonly SimulationPlayer[],
  round: number,
) {
  const counts = countRosterPositions(roster);
  const specialTeamsTarget = round <= 15 ? 1 : 2;
  const starterTargets: Record<FantasyPosition, number> = {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    K: specialTeamsTarget,
    DST: specialTeamsTarget,
  };
  const depthTargets: Record<FantasyPosition, number> = {
    QB: 2,
    RB: 5,
    WR: 5,
    TE: 2,
    K: 2,
    DST: 2,
  };

  if (counts[position] < starterTargets[position]) {
    if ((position === "K" || position === "DST") && round < 13) return 0.05;
    return Math.min(1, 0.58 + round * 0.035);
  }
  if (counts[position] < depthTargets[position]) return 0.35;
  if (counts[position] >= ROSTER_SOFT_MAXIMUMS[position]) return 0;
  return 0.12;
}

function strategyValue(
  player: SimulationPlayer,
  profile: CpuStrategyProfile,
  round: number,
) {
  const position = player.position;
  switch (profile) {
    case "rb-heavy":
      return position === "RB" ? 1 : 0.35;
    case "wr-heavy":
      return position === "WR" ? 1 : 0.35;
    case "early-qb":
      return position === "QB" && round <= 5 ? 1 : 0.42;
    case "elite-te":
      return position === "TE" && player.consensusPositionRank <= 4 ? 1 : 0.4;
    case "zero-rb":
      if (round <= 5) return position === "RB" ? 0 : position === "WR" || position === "TE" ? 1 : 0.4;
      return position === "RB" ? 0.75 : 0.45;
    case "late-qb":
      return position === "QB" && round < 8 ? 0 : 0.5;
    case "value-drafter":
      return rankValue(player.blendedPositionRank, 100);
    case "best-player-available":
      return rankValue(player.consensusOverallRank, 300);
    case "balanced":
    default:
      return 0.5;
  }
}

function constructionValue(
  player: SimulationPlayer,
  roster: readonly SimulationPlayer[],
  round: number,
) {
  const counts = countRosterPositions(roster);
  if (round >= 16) {
    return player.position === "K" || player.position === "DST" ? 1 : 0;
  }
  if ((player.position === "K" || player.position === "DST") && round < 13) return 0;
  if (counts[player.position] >= ROSTER_SOFT_MAXIMUMS[player.position]) return 0;
  if (getRosterNeeds(roster).includes(player.position)) return 1;
  if (player.position === "RB" || player.position === "WR") return 0.7;
  if (player.position === "QB" && counts.QB === 0 && round >= 7) return 0.9;
  if (player.position === "TE" && counts.TE === 0 && round >= 8) return 0.85;
  return 0.45;
}

export function chooseCpuPlayer({
  availablePlayers,
  roster,
  round,
  picksRemainingIncludingCurrent,
  profile,
  random,
}: CpuPickInput) {
  const legal = getLegalDraftCandidates(availablePlayers, roster, picksRemainingIncludingCurrent);
  if (legal.length === 0) throw new Error("CPU drafter has no legal candidates.");
  const belowSoftMaximum = legal.filter(
    (player) => !isAboveSoftMaximum(roster, player.position),
  );
  const candidates = belowSoftMaximum.length > 0 ? belowSoftMaximum : legal;
  const universeSize = Math.max(...availablePlayers.map((player) => player.consensusOverallRank), 275);

  return candidates
    .map((player) => {
      const consensus = rankValue(player.consensusOverallRank, universeSize);
      const projection = rankValue(player.blendedPositionRank, 110);
      const positionalNeed = positionalNeedValue(player.position, roster, round);
      const strategy = strategyValue(player, profile, round);
      const rosterConstruction = constructionValue(player, roster, round);
      const controlledRandomness = Math.max(-1, Math.min(1, random.normal(0, 0.42)));
      const score =
        consensus * CPU_DRAFT_WEIGHTS.consensus +
        projection * CPU_DRAFT_WEIGHTS.projection +
        positionalNeed * CPU_DRAFT_WEIGHTS.positionalNeed +
        strategy * CPU_DRAFT_WEIGHTS.strategy +
        rosterConstruction * CPU_DRAFT_WEIGHTS.rosterConstruction +
        controlledRandomness * CPU_DRAFT_WEIGHTS.randomness;
      return { player, score };
    })
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.player.consensusOverallRank - second.player.consensusOverallRank,
    )[0].player;
}

export function chooseAutoPick(
  availablePlayers: readonly SimulationPlayer[],
  roster: readonly SimulationPlayer[],
  picksRemainingIncludingCurrent: number,
) {
  const legal = getLegalDraftCandidates(availablePlayers, roster, picksRemainingIncludingCurrent);
  if (legal.length === 0) throw new Error("Auto-pick has no legal candidates.");
  const needs = new Set(getRosterNeeds(roster));
  const maximumRank = Math.max(...availablePlayers.map((player) => player.consensusOverallRank), 275);

  return legal
    .map((player) => ({
      player,
      score:
        rankValue(player.consensusOverallRank, maximumRank) * 0.55 +
        rankValue(player.blendedPositionRank, 110) * 0.3 +
        (needs.has(player.position) ? 1 : 0) * 0.15,
    }))
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.player.consensusOverallRank - second.player.consensusOverallRank,
    )[0].player;
}

export function assignCpuStrategies(seed: string, userSlot: number) {
  const random = new SeededRandom(seed).fork("cpu-strategies");
  const slots = Array.from({ length: LEAGUE_CONFIG.teams }, (_, index) => index + 1).filter(
    (slot) => slot !== userSlot,
  );
  const shuffledProfiles = random.shuffle([
    ...CPU_STRATEGIES,
    ...random.shuffle(CPU_STRATEGIES),
  ]);

  return Object.fromEntries(
    slots.map((slot, index) => [slot, shuffledProfiles[index]]),
  ) as Record<number, CpuStrategyProfile>;
}

export function simulateAutomaticDraft(
  players: readonly SimulationPlayer[],
  userSlot: number,
  seed: string,
) {
  const order = createSnakeDraftOrder();
  const strategies = assignCpuStrategies(seed, userSlot);
  const rosters = new Map<number, SimulationPlayer[]>(
    Array.from({ length: LEAGUE_CONFIG.teams }, (_, index) => [index + 1, []]),
  );
  const draftedIds = new Set<string>();
  const selections: DraftSelection[] = [];

  for (const pick of order) {
    const roster = rosters.get(pick.slot) ?? [];
    const available = players.filter((player) => player.active && !draftedIds.has(player.id));
    const picksRemainingIncludingCurrent = LEAGUE_CONFIG.rounds - roster.length;
    const player =
      pick.slot === userSlot
        ? chooseAutoPick(available, roster, picksRemainingIncludingCurrent)
        : chooseCpuPlayer({
            availablePlayers: available,
            roster,
            round: pick.round,
            picksRemainingIncludingCurrent,
            profile: strategies[pick.slot],
            random: new SeededRandom(seed).fork(`cpu-pick-${pick.overallPick}`),
          });
    roster.push(player);
    rosters.set(pick.slot, roster);
    draftedIds.add(player.id);
    selections.push({
      overallPick: pick.overallPick,
      round: pick.round,
      slot: pick.slot,
      playerId: player.id,
      source: pick.slot === userSlot ? "auto" : "cpu",
    });
  }

  return { selections, rosters, strategies };
}
