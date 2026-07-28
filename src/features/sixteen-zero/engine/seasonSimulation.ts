import type {
  LineupSlot,
  MatchupBoxScore,
  PlayoffResult,
  ScheduleGame,
  SeasonResult,
  SimulationPlayer,
  WeeklyLineup,
} from "../types";
import type { DefensePositionRanks } from "./lineupOptimizer";
import {
  LINEUP_SLOTS,
  getEmptyLineupSlots,
  optimizeLineup,
  optimizeProjectedStartingRoster,
} from "./lineupOptimizer";
import {
  assertDraftIntegrity,
  assertLineupIntegrity,
  assertNflMatchupConsistency,
  assertNoLineupOverlap,
  assertScoreReconciliation,
} from "./integrityChecks";
import { buildMatchupLineupEntries } from "./matchupBoxScore";
import { buildPlayerTierMap, simulateLineupScore } from "./playerScoreSimulation";
import { determinePlayoffQualification } from "./playoffQualification";
import { computeRosterStrength, selectPlayoffOpponents } from "./rosterStrength";
import { SeededRandom } from "./seededRandom";

type SeasonSimulationInput = {
  /** The user's completed 17-player drafted roster. */
  roster: readonly SimulationPlayer[];
  /** The user's draft slot (1-12). */
  userSlot: number;
  /** All 12 drafted rosters from the same draft, keyed by slot. */
  allRosters: Record<number, readonly SimulationPlayer[]>;
  playerUniverse: readonly SimulationPlayer[];
  draftedPlayerIds: ReadonlySet<string>;
  defenseRanks: DefensePositionRanks;
  opponentNames: readonly string[];
  seed: string;
  overrides?: SeasonSimulationOverrides;
};

export type SeasonSimulationOverrides = {
  regularOpponentScores?: readonly number[];
  playoffOpponentScores?: Partial<Record<15 | 16 | 17, number>>;
  qualification?: {
    qualified: boolean;
    seed: 1 | 2 | 3 | 4 | 5 | 6 | null;
    hasBye: boolean;
  };
};

function getGameResult(userRawScore: number, opponentRawScore: number): "W" | "L" {
  return userRawScore >= opponentRawScore ? "W" : "L";
}

function overriddenScore(
  override: number | undefined,
  computed: { rawScore: number; roundedScore: number },
) {
  if (override === undefined) return computed;
  if (!Number.isFinite(override) || override < 0) {
    throw new Error("Opponent score overrides must be finite and non-negative.");
  }
  return {
    rawScore: override,
    roundedScore: Math.round(override * 10) / 10,
  };
}

export function simulateSeason({
  roster,
  userSlot,
  allRosters,
  playerUniverse,
  draftedPlayerIds,
  defenseRanks,
  opponentNames,
  seed,
  overrides,
}: SeasonSimulationInput): SeasonResult {
  if (opponentNames.length < 17) {
    throw new Error("Season simulation requires at least 17 opponent names.");
  }
  if (draftedPlayerIds.size !== 204) {
    throw new Error("Season simulation requires all 204 drafted player IDs.");
  }
  if (roster.some((player) => !draftedPlayerIds.has(player.id))) {
    throw new Error("The user roster must be included in the completed draft.");
  }

  const cpuEntries = Object.entries(allRosters)
    .map(([slot, cpuRoster]) => ({ slot: Number(slot), roster: cpuRoster }))
    .filter((entry) => entry.slot !== userSlot);
  if (cpuEntries.length !== 11) {
    throw new Error(
      "Season simulation requires exactly 11 drafted CPU rosters (all 12 league teams minus the user).",
    );
  }
  assertDraftIntegrity(allRosters, draftedPlayerIds);

  const rootRandom = new SeededRandom(seed).fork("season");
  const scheduleNames = rootRandom.fork("names").shuffle(opponentNames);
  const tiers = buildPlayerTierMap(playerUniverse);
  const temporaryReplacementPool = playerUniverse.filter(
    (player) => player.active && !draftedPlayerIds.has(player.id),
  );

  const cpuRosterBySlot = new Map(cpuEntries.map((entry) => [entry.slot, entry.roster]));
  const cpuRosterIdsBySlot = new Map(
    cpuEntries.map((entry) => [entry.slot, new Set(entry.roster.map((player) => player.id))]),
  );
  const userRosterIds = new Set(roster.map((player) => player.id));
  const cpuStrengths = cpuEntries.map((entry) => ({
    slot: entry.slot,
    strength: computeRosterStrength(entry.roster, defenseRanks, temporaryReplacementPool),
  }));
  const playoffOpponents = selectPlayoffOpponents(cpuStrengths);
  const regularSeasonRotation = rootRandom
    .fork("opponent-rotation")
    .shuffle(cpuEntries.map((entry) => entry.slot));

  function simulateCpuLineupScore(
    slot: number,
    week: number,
    randomLabel: string,
    excludeTemporaryReplacementIds?: ReadonlySet<string>,
  ) {
    const cpuRoster = cpuRosterBySlot.get(slot)!;
    const lineup = optimizeLineup(cpuRoster, week, defenseRanks, {
      temporaryReplacementPool,
      excludeTemporaryReplacementIds,
    });
    if (getEmptyLineupSlots(lineup).length > 0) {
      throw new Error(`Unable to form a complete CPU lineup for Week ${week}.`);
    }
    const score = simulateLineupScore(lineup, week, defenseRanks, tiers, rootRandom.fork(randomLabel));
    return { lineup, score };
  }

  function buildVerifiedBoxScore(
    userLineup: WeeklyLineup,
    userSlotScores: Record<LineupSlot, number>,
    userTeamScore: number,
    opponentLineup: WeeklyLineup,
    opponentSlotScores: Record<LineupSlot, number>,
    opponentTeamScore: number,
    opponentSlot: number,
    week: number,
  ): MatchupBoxScore {
    const opponentRosterIds = cpuRosterIdsBySlot.get(opponentSlot)!;
    assertLineupIntegrity(userLineup, userRosterIds, draftedPlayerIds, `Week ${week} user lineup`);
    assertLineupIntegrity(
      opponentLineup,
      opponentRosterIds,
      draftedPlayerIds,
      `Week ${week} opponent lineup`,
    );
    assertNoLineupOverlap(userLineup, opponentLineup, `Week ${week} matchup`);

    const userEntries = buildMatchupLineupEntries(userLineup, userSlotScores, week, userRosterIds);
    const opponentEntries = buildMatchupLineupEntries(
      opponentLineup,
      opponentSlotScores,
      week,
      opponentRosterIds,
    );

    assertScoreReconciliation(userEntries, userTeamScore, `Week ${week} user score`);
    assertScoreReconciliation(opponentEntries, opponentTeamScore, `Week ${week} opponent score`);

    for (const slot of LINEUP_SLOTS) {
      assertNflMatchupConsistency(
        userEntries.find((entry) => entry.slot === slot)!,
        userLineup[slot]!,
        week,
        `Week ${week} user ${slot}`,
      );
      assertNflMatchupConsistency(
        opponentEntries.find((entry) => entry.slot === slot)!,
        opponentLineup[slot]!,
        week,
        `Week ${week} opponent ${slot}`,
      );
    }

    return {
      userLineup: userEntries,
      opponentLineup: opponentEntries,
      opponentRosterSlot: opponentSlot,
    };
  }

  const schedule: ScheduleGame[] = [];
  let regularWins = 0;

  for (let week = 1; week <= 14; week += 1) {
    const lineup = optimizeLineup(roster, week, defenseRanks, {
      temporaryReplacementPool,
    });
    if (getEmptyLineupSlots(lineup).length > 0) {
      throw new Error(`Unable to form a complete lineup for Week ${week}.`);
    }
    const userScore = simulateLineupScore(
      lineup,
      week,
      defenseRanks,
      tiers,
      rootRandom.fork(`user-week-${week}`),
    );
    const userLineupIds = new Set(
      LINEUP_SLOTS.map((slot) => lineup[slot]?.id).filter((id): id is string => id !== undefined),
    );
    const opponentSlot = regularSeasonRotation[(week - 1) % regularSeasonRotation.length];
    const { lineup: opponentLineup, score: computedOpponentScore } = simulateCpuLineupScore(
      opponentSlot,
      week,
      `opponent-week-${week}`,
      userLineupIds,
    );
    const regularOverride = overrides?.regularOpponentScores?.[week - 1];
    const opponentScore = overriddenScore(regularOverride, computedOpponentScore);
    const result = getGameResult(userScore.rawScore, opponentScore.rawScore);
    if (result === "W") regularWins += 1;
    schedule.push({
      fantasyWeek: week,
      nflWeek: week,
      opponentName: scheduleNames[week - 1],
      userScore: userScore.roundedScore,
      opponentScore: opponentScore.roundedScore,
      result,
      boxScore:
        regularOverride === undefined
          ? buildVerifiedBoxScore(
              lineup,
              userScore.slotScores,
              userScore.roundedScore,
              opponentLineup,
              computedOpponentScore.slotScores,
              computedOpponentScore.roundedScore,
              opponentSlot,
              week,
            )
          : undefined,
    });
  }

  const regularLosses = 14 - regularWins;
  const averageWeeklyScore =
    Math.round(
      (schedule.reduce((total, game) => total + (game.userScore ?? 0), 0) / 14) * 10,
    ) / 10;
  const qualification =
    overrides?.qualification ??
    determinePlayoffQualification({
      userWins: regularWins,
      userLosses: regularLosses,
      userAverageScore: averageWeeklyScore,
      cpuStrengths,
      random: rootRandom.fork("playoff-qualification"),
    });
  if (
    qualification.qualified !== (qualification.seed !== null) ||
    qualification.hasBye !==
      (qualification.seed !== null && qualification.seed <= 2)
  ) {
    throw new Error("Playoff qualification override is internally inconsistent.");
  }

  let playoffWins = 0;
  let playoffLosses = 0;
  let playoffResult: PlayoffResult = "Missed Playoffs";
  let nextNameIndex = 14;

  const playPlayoffGame = (week: 15 | 16 | 17, opponentSlot: number) => {
    const lineup = optimizeLineup(roster, week, defenseRanks, {
      temporaryReplacementPool,
    });
    if (getEmptyLineupSlots(lineup).length > 0) {
      throw new Error(`Unable to form a complete lineup for Week ${week}.`);
    }
    const userScore = simulateLineupScore(
      lineup,
      week,
      defenseRanks,
      tiers,
      rootRandom.fork(`user-week-${week}`),
    );
    const userLineupIds = new Set(
      LINEUP_SLOTS.map((slot) => lineup[slot]?.id).filter((id): id is string => id !== undefined),
    );
    const { lineup: opponentLineup, score: computedOpponentScore } = simulateCpuLineupScore(
      opponentSlot,
      week,
      `opponent-week-${week}`,
      userLineupIds,
    );
    const playoffOverride = overrides?.playoffOpponentScores?.[week];
    const opponentScore = overriddenScore(playoffOverride, computedOpponentScore);
    const result = getGameResult(userScore.rawScore, opponentScore.rawScore);
    schedule.push({
      fantasyWeek: week,
      nflWeek: week,
      opponentName: scheduleNames[nextNameIndex],
      userScore: userScore.roundedScore,
      opponentScore: opponentScore.roundedScore,
      result,
      boxScore:
        playoffOverride === undefined
          ? buildVerifiedBoxScore(
              lineup,
              userScore.slotScores,
              userScore.roundedScore,
              opponentLineup,
              computedOpponentScore.slotScores,
              computedOpponentScore.roundedScore,
              opponentSlot,
              week,
            )
          : undefined,
    });
    nextNameIndex += 1;
    if (result === "W") playoffWins += 1;
    else playoffLosses += 1;
    return result;
  };

  if (qualification.qualified) {
    if (qualification.hasBye) {
      schedule.push({
        fantasyWeek: 15,
        nflWeek: 15,
        opponentName: "First-Round Bye",
        userScore: null,
        opponentScore: null,
        result: null,
        isBye: true,
      });
    } else if (playPlayoffGame(15, playoffOpponents.week15.slot) === "L") {
      playoffResult = "Eliminated in First Round";
    }

    if (playoffLosses === 0) {
      if (playPlayoffGame(16, playoffOpponents.week16.slot) === "L") {
        playoffResult = "Eliminated in Semifinal";
      } else if (playPlayoffGame(17, playoffOpponents.week17.slot) === "L") {
        playoffResult = "Lost Championship";
      } else {
        playoffResult = "League Champion";
      }
    }
  }

  return {
    schedule,
    regularWins,
    regularLosses,
    playoffWins,
    playoffLosses,
    finalWins: regularWins + playoffWins,
    finalLosses: regularLosses + playoffLosses,
    averageWeeklyScore,
    qualification,
    playoffResult,
    startingRoster: optimizeProjectedStartingRoster(roster),
  };
}
