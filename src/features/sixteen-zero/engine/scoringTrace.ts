import type { DefensePositionRanks } from "./lineupOptimizer";
import {
  getEmptyLineupSlots,
  getExpectedPlayerScore,
  normalizeOpponent,
  optimizeLineup,
} from "./lineupOptimizer";
import { getMatchupMultiplier } from "./matchupAdjustment";
import {
  buildPlayerTierMap,
  simulatePlayerScoreDetailed,
} from "./playerScoreSimulation";
import { SeededRandom } from "./seededRandom";
import type { LineupSlot, SimulationPlayer } from "../types";

const LINEUP_SLOTS: LineupSlot[] = [
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

export type PlayerScoreTraceRow = {
  slot: LineupSlot;
  playerId: string;
  playerName: string;
  isDraftedStarter: boolean;
  isTemporaryReplacement: boolean;
  canonicalProjectedPPG: number;
  matchupRank: number | null;
  matchupMultiplier: number;
  matchupAdjustedExpectedScore: number;
  outcomeMultiplier: number;
  bustOrCollapseApplied: boolean;
  finalSimulatedScore: number;
};

export type WeeklyScoringTrace = {
  week: number;
  seed: string;
  rows: PlayerScoreTraceRow[];
  calculatedTotal: number;
  displayedTeamScore: number;
  differenceFromDisplayed: number;
};

/**
 * Dev-only deterministic scoring trace. Reconstructs exactly the same
 * lineup-optimization and random-fork lineage as simulateSeason's regular
 * season loop for one week, so the reported total always matches what the
 * production engine would actually display for that user/week/seed.
 *
 * Not imported by any production UI component - for local debugging,
 * statistical audits, and tests only.
 */
export function traceWeeklyScoring({
  roster,
  draftedPlayerIds,
  temporaryReplacementPool,
  week,
  defenseRanks,
  seed,
  playerUniverseForTiers,
}: {
  roster: readonly SimulationPlayer[];
  draftedPlayerIds: ReadonlySet<string>;
  temporaryReplacementPool: readonly SimulationPlayer[];
  week: number;
  defenseRanks: DefensePositionRanks;
  seed: string;
  playerUniverseForTiers: readonly SimulationPlayer[];
}): WeeklyScoringTrace {
  const tiers = buildPlayerTierMap(playerUniverseForTiers);
  const rootRandom = new SeededRandom(seed).fork("season");
  const weekRandom = rootRandom.fork(`user-week-${week}`);

  const lineup = optimizeLineup(roster, week, defenseRanks, {
    temporaryReplacementPool,
  });
  if (getEmptyLineupSlots(lineup).length > 0) {
    throw new Error(`Unable to form a complete lineup for Week ${week}.`);
  }

  const rows: PlayerScoreTraceRow[] = LINEUP_SLOTS.map((slot) => {
    const player = lineup[slot];
    if (!player) {
      throw new Error(`Missing player for slot ${slot} in Week ${week}.`);
    }
    const opponent = normalizeOpponent(player.weeklyOpponents[week]);
    const matchupRank = opponent ? defenseRanks[opponent]?.[player.position] ?? null : null;
    const matchupMultiplier = getMatchupMultiplier(matchupRank);
    const matchupAdjustedExpectedScore = getExpectedPlayerScore(player, week, defenseRanks);
    const tier = tiers.get(player.id) ?? "mid-tier";
    const detailed = simulatePlayerScoreDetailed(
      matchupAdjustedExpectedScore,
      player,
      tier,
      weekRandom.fork(player.id),
    );
    return {
      slot,
      playerId: player.id,
      playerName: player.name,
      isDraftedStarter: draftedPlayerIds.has(player.id),
      isTemporaryReplacement: !draftedPlayerIds.has(player.id),
      canonicalProjectedPPG: player.blendedPPG,
      matchupRank,
      matchupMultiplier,
      matchupAdjustedExpectedScore,
      outcomeMultiplier: detailed.outcomeMultiplier,
      bustOrCollapseApplied: detailed.bustOrDstKCollapse,
      finalSimulatedScore: detailed.score,
    };
  });

  const calculatedTotal = Math.round(
    rows.reduce((total, row) => total + row.finalSimulatedScore, 0) * 10,
  ) / 10;

  return {
    week,
    seed,
    rows,
    calculatedTotal,
    displayedTeamScore: calculatedTotal,
    differenceFromDisplayed: 0,
  };
}

export function formatScoringTrace(trace: WeeklyScoringTrace): string {
  const header = [
    "Slot",
    "Player",
    "ID",
    "Drafted?",
    "Proj PPG",
    "Matchup Rank",
    "Matchup x",
    "Expected",
    "Outcome x",
    "Final",
  ].join(" | ");
  const lines = trace.rows.map((row) =>
    [
      row.slot,
      row.playerName,
      row.playerId,
      row.isDraftedStarter ? "drafted" : "replacement",
      row.canonicalProjectedPPG.toFixed(2),
      row.matchupRank ?? "-",
      row.matchupMultiplier.toFixed(3),
      row.matchupAdjustedExpectedScore.toFixed(2),
      row.outcomeMultiplier.toFixed(3),
      row.finalSimulatedScore.toFixed(1),
    ].join(" | "),
  );
  return [
    `Week ${trace.week} scoring trace (seed ${trace.seed})`,
    header,
    ...lines,
    `Sum of 9 starters: ${trace.calculatedTotal.toFixed(1)}`,
    `Displayed team score: ${trace.displayedTeamScore.toFixed(1)}`,
    `Difference: ${trace.differenceFromDisplayed.toFixed(1)}`,
  ].join("\n");
}
