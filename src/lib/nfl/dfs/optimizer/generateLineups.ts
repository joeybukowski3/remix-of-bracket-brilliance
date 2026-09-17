/**
 * WU8 generated-lineup orchestration.
 *
 * Builds the strategy candidate pools from an already-enriched slate analysis,
 * scores every candidate under the three v1 objectives, solves each one
 * exactly, and assembles the explainable lineup contract.
 *
 * This module never changes a JKB projection, an optimizer-eligibility
 * decision, a DFS rank, or a DST matchup score. Non-eligible players are never
 * hidden from the board -- they are simply not candidates for a generated
 * lineup, which is a separate, downstream selection decision.
 */

import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { NFL_CLASSIC_RULES } from "@/lib/nfl/dfs/nflClassicRules";
import {
  LINEUP_OBJECTIVE_VERSION,
  LINEUP_STRATEGIES,
  LINEUP_STRATEGY_LABELS,
  LINEUP_STRATEGY_WEIGHTS,
  type LineupStrategy,
  type ObjectiveComponent,
} from "@/lib/nfl/dfs/policies/lineupObjectivesV1";
import type { DfsEnrichedAnalyzerRow, DfsEnrichedOffensiveRow, DfsEnrichedDstRow } from "@/lib/nfl/dfs/slateAnalyzer";
import { isDfsCandidatePoolPlayer } from "@/lib/nfl/dfs/dfsPlayerPool";
import type {
  GeneratedLineup,
  GeneratedLineupSet,
  GeneratedLineupSlotPlayer,
  LineupInfeasibility,
  LineupReason,
  LineupSlot,
} from "./contracts";
import { normalizeCandidates, type OffensiveCandidateInput } from "./features";
import { scoreDstCandidate, scoreOffensiveCandidate } from "./objectives";
import { solveLineup, type SolverPlayer, type SolverRules } from "./solver";

const MICRO = 1_000_000;

const SOLVER_RULES: SolverRules = {
  salaryCap: NFL_CLASSIC_RULES.salaryCap,
  minimumGamesRequired: NFL_CLASSIC_RULES.roster.minimumGamesRequired,
  counts: { QB: 1, RB: 2, WR: 3, TE: 1, DST: 1 },
  flexPositions: ["RB", "WR", "TE"],
};

export type GenerateLineupsInput = {
  rows: readonly DfsEnrichedAnalyzerRow[];
  /** Weekly JKB production projection rows, used only to read scoring-environment context. */
  projectionRows: readonly WeeklyFantasyProjectionProductionRow[];
  asOf: string;
  /** Injectable clock, for deterministic tests. */
  now?: () => number;
};

type Candidate = {
  row: DfsEnrichedAnalyzerRow;
  solver: SolverPlayer;
  slotPlayer: Omit<GeneratedLineupSlotPlayer, "slot">;
};

function isOffense(row: DfsEnrichedAnalyzerRow): row is DfsEnrichedOffensiveRow {
  return row.kind === "offense";
}

function gameKeyOf(row: DfsEnrichedAnalyzerRow): string {
  return row.canonicalGameId ?? row.gameInfoRaw;
}

function identityKeyOf(row: DfsEnrichedAnalyzerRow): string {
  if (isOffense(row)) return row.playerId ?? "dk:" + row.dkId;
  return row.canonicalTeamId ?? "dk:" + row.dkId;
}

/** Ordering inside a position group for slot naming. Never affects the objective. */
function compareForSlot(a: GeneratedLineupSlotPlayer, b: GeneratedLineupSlotPlayer): number {
  const scoreA = a.strategyScore.score ?? -Infinity;
  const scoreB = b.strategyScore.score ?? -Infinity;
  if (scoreA !== scoreB) return scoreB - scoreA;
  if (a.salary !== b.salary) return b.salary - a.salary;
  return a.dkId < b.dkId ? -1 : 1;
}

function buildSlots(
  players: readonly Omit<GeneratedLineupSlotPlayer, "slot">[],
  flexPosition: "RB" | "WR" | "TE",
): GeneratedLineupSlotPlayer[] {
  const byPosition = new Map<string, GeneratedLineupSlotPlayer[]>();
  players.forEach((player) => {
    const list = byPosition.get(player.position) ?? [];
    list.push({ ...player, slot: "QB" });
    byPosition.set(player.position, list);
  });
  byPosition.forEach((list) => list.sort(compareForSlot));

  const take = (position: string): GeneratedLineupSlotPlayer[] => byPosition.get(position) ?? [];
  const rb = take("RB");
  const wr = take("WR");
  const te = take("TE");

  // The lowest-ranked player at the FLEX position occupies the FLEX slot.
  const flexPool = flexPosition === "RB" ? rb : flexPosition === "WR" ? wr : te;
  const flexPlayer = flexPool[flexPool.length - 1];
  const remaining = (list: GeneratedLineupSlotPlayer[]) => list.filter((player) => player !== flexPlayer);

  const assign = (player: GeneratedLineupSlotPlayer | undefined, slot: LineupSlot) =>
    player === undefined ? [] : [{ ...player, slot }];

  return [
    ...assign(take("QB")[0], "QB"),
    ...remaining(rb).slice(0, 2).flatMap((player, index) => assign(player, index === 0 ? "RB1" : "RB2")),
    ...remaining(wr).slice(0, 3).flatMap((player, index) => assign(player, index === 0 ? "WR1" : index === 1 ? "WR2" : "WR3")),
    ...assign(remaining(te)[0], "TE"),
    ...assign(flexPlayer, "FLEX"),
    ...assign(take("DST")[0], "DST"),
  ];
}

/** The three components that contributed most to this lineup's score. */
function topReasons(slots: readonly GeneratedLineupSlotPlayer[], strategy: LineupStrategy): LineupReason[] {
  const offense = slots.filter((slot) => slot.position !== "DST");
  const weights = LINEUP_STRATEGY_WEIGHTS[strategy];
  const contributions = (Object.keys(weights) as ObjectiveComponent[]).map((component) => {
    const values = offense
      .map((slot) => slot.strategyScore.components.find((entry) => entry.component === component))
      .filter((entry): entry is NonNullable<typeof entry> => entry != null && entry.normalized != null);
    const mean = values.length > 0 ? values.reduce((sum, entry) => sum + (entry.normalized as number), 0) / values.length : 0;
    const label = values[0]?.label ?? component;
    return { component, label, mean, covered: values.length, weight: weights[component] ?? 0 };
  });

  const ranked = contributions
    .filter((entry) => entry.covered > 0)
    .sort((a, b) => b.mean * b.weight - a.mean * a.weight || (a.component < b.component ? -1 : 1))
    .slice(0, 3);

  return ranked.map((entry) => ({
    label: entry.label,
    detail:
      "Lineup offense averages the " +
      entry.mean.toFixed(0) +
      "th percentile on this component (policy weight " +
      Math.round(entry.weight * 100) +
      "%), covering " +
      entry.covered +
      " of " +
      offense.length +
      " offensive slots",
  }));
}

function buildCandidates(input: GenerateLineupsInput, strategy: LineupStrategy): {
  candidates: Candidate[];
  counts: Record<"QB" | "RB" | "WR" | "TE" | "DST", number>;
} {
  const projectionByPlayerId = new Map(input.projectionRows.map((row) => [row.playerId, row]));

  const offenseRows = input.rows
    .filter(isOffense)
    // The DFS practical-pool gate sits above base optimizer eligibility: a
    // fringe/backup player who happens to satisfy the eligibility policy is
    // still never a candidate for a generated lineup. See dfsPlayerPool.ts.
    .filter((row) => row.optimizerEligibility === "eligible" && row.projectedFantasyPoints != null && isDfsCandidatePoolPlayer(row));

  const offenseInputs: OffensiveCandidateInput[] = offenseRows.map((row) => ({
    row,
    projection: row.playerId ? projectionByPlayerId.get(row.playerId) ?? null : null,
  }));
  const normalized = normalizeCandidates(offenseInputs);

  const candidates: Candidate[] = [];

  offenseRows.forEach((row, index) => {
    const score = scoreOffensiveCandidate(normalized[index], strategy);
    if (!score.scorable || score.score == null) return;
    candidates.push({
      row,
      solver: {
        dkId: row.dkId,
        position: row.position,
        salary: row.salary,
        scoreMicro: Math.round(score.score * MICRO),
        jkbMicro: Math.round((row.projectedFantasyPoints as number) * MICRO),
        gameKey: gameKeyOf(row),
        identityKey: identityKeyOf(row),
      },
      slotPlayer: {
        dkId: row.dkId,
        canonicalId: row.playerId,
        playerName: row.playerName,
        team: row.team,
        opponent: row.opponent,
        canonicalGameId: row.canonicalGameId,
        position: row.position,
        salary: row.salary,
        projectedFantasyPoints: row.projectedFantasyPoints,
        dkAvgPointsPerGame: row.dkAvgPointsPerGame,
        posRankDiff: row.posRankDiff,
        overallRankDiff: row.overallRankDiff,
        optimizerEligibility: row.optimizerEligibility ?? null,
        roleContext: row.roleContext ?? null,
        dstMatchup: null,
        strategyScore: score,
      },
    });
  });

  input.rows
    .filter((row): row is DfsEnrichedDstRow => row.kind === "dst")
    .filter(isDfsCandidatePoolPlayer)
    .forEach((row) => {
      const score = scoreDstCandidate(row.dstMatchup, strategy);
      if (!score.scorable || score.score == null) return;
      candidates.push({
        row,
        solver: {
          dkId: row.dkId,
          position: "DST",
          salary: row.salary,
          scoreMicro: Math.round(score.score * MICRO),
          jkbMicro: 0,
          gameKey: gameKeyOf(row),
          identityKey: identityKeyOf(row),
        },
        slotPlayer: {
          dkId: row.dkId,
          canonicalId: row.canonicalTeamId,
          playerName: row.playerName,
          team: row.team,
          opponent: row.opponent,
          canonicalGameId: row.canonicalGameId,
          position: "DST",
          salary: row.salary,
          projectedFantasyPoints: null,
          dkAvgPointsPerGame: row.dkAvgPointsPerGame,
          posRankDiff: null,
          overallRankDiff: null,
          optimizerEligibility: null,
          roleContext: null,
          dstMatchup: row.dstMatchup ?? null,
          strategyScore: score,
        },
      });
    });

  const counts = { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0 };
  candidates.forEach((candidate) => {
    counts[candidate.solver.position] += 1;
  });

  return { candidates, counts };
}

/** Generates all three v1 preset lineups for an enriched slate. */
export function generateLineups(input: GenerateLineupsInput): GeneratedLineupSet {
  const clock = input.now ?? (() => Date.now());
  const start = clock();

  const offense = input.rows.filter(isOffense);
  const dstRows = input.rows.filter((row): row is DfsEnrichedDstRow => row.kind === "dst");
  const uploadedDkIds = new Set(input.rows.map((row) => row.dkId));

  const candidatePool: GeneratedLineupSet["candidatePool"] = {
    uploadedRows: input.rows.length,
    offenseEligible: offense.filter((row) => row.optimizerEligibility === "eligible").length,
    offenseIneligible: offense.filter((row) => row.optimizerEligibility === "ineligible").length,
    offenseUnknown: offense.filter((row) => row.optimizerEligibility !== "eligible" && row.optimizerEligibility !== "ineligible").length,
    dstWithUsableContext: dstRows.filter((row) => row.dstMatchup?.dstMatchupScore != null).length,
    dstWithoutUsableContext: dstRows.filter((row) => row.dstMatchup?.dstMatchupScore == null).length,
    byPosition: { QB: 0, RB: 0, WR: 0, TE: 0, DST: 0 },
  };

  const lineups: GeneratedLineup[] = [];
  const infeasible: LineupInfeasibility[] = [];
  const warnings: string[] = [];

  for (const strategy of LINEUP_STRATEGIES) {
    const { candidates, counts } = buildCandidates(input, strategy);
    if (strategy === "balanced") candidatePool.byPosition = counts;

    const byDkId = new Map(candidates.map((candidate) => [candidate.solver.dkId, candidate]));
    const result = solveLineup(
      candidates.map((candidate) => candidate.solver),
      SOLVER_RULES,
    );

    if (result.status === "infeasible") {
      infeasible.push({
        strategy,
        strategyLabel: LINEUP_STRATEGY_LABELS[strategy],
        reasons: [...result.reasons, ...result.warnings],
        candidateCounts: counts,
      });
      continue;
    }

    const chosen = result.solution.players.map((player) => byDkId.get(player.dkId) as Candidate);
    const slots = buildSlots(
      chosen.map((candidate) => candidate.slotPlayer),
      result.solution.flexPosition,
    );

    const offenseSlots = slots.filter((slot) => slot.position !== "DST");
    const benchmarkSlots = slots.filter((slot) => slot.dkAvgPointsPerGame != null);
    const salaryUsed = slots.reduce((sum, slot) => sum + slot.salary, 0);
    const canonicalIds = slots.map((slot) => slot.canonicalId ?? "dk:" + slot.dkId);

    lineups.push({
      strategy,
      strategyLabel: LINEUP_STRATEGY_LABELS[strategy],
      slots,
      salaryCap: NFL_CLASSIC_RULES.salaryCap,
      salaryUsed,
      salaryRemaining: NFL_CLASSIC_RULES.salaryCap - salaryUsed,
      jkbOffenseProjectionSubtotal: offenseSlots.reduce((sum, slot) => sum + (slot.projectedFantasyPoints ?? 0), 0),
      jkbOffensePlayerCount: offenseSlots.length,
      dkBenchmarkSubtotal: benchmarkSlots.reduce((sum, slot) => sum + (slot.dkAvgPointsPerGame as number), 0),
      dkBenchmarkPlayerCount: benchmarkSlots.length,
      objectiveScore: result.solution.objectiveMicro / MICRO,
      objectiveVersion: LINEUP_OBJECTIVE_VERSION,
      rulesVersion: NFL_CLASSIC_RULES.version,
      strategyWeights: LINEUP_STRATEGY_WEIGHTS[strategy],
      topReasons: topReasons(slots, strategy),
      warnings: result.warnings,
      constraintStatus: {
        slotsFilled: slots.length,
        salaryWithinCap: salaryUsed <= NFL_CLASSIC_RULES.salaryCap,
        uniqueDkIds: new Set(slots.map((slot) => slot.dkId)).size === slots.length,
        uniqueCanonicalIdentities: new Set(canonicalIds).size === canonicalIds.length,
        flexPositionLegal: SOLVER_RULES.flexPositions.includes(result.solution.flexPosition),
        distinctGames: result.solution.distinctGames,
        minimumGamesSatisfied: result.solution.distinctGames >= NFL_CLASSIC_RULES.roster.minimumGamesRequired,
        allOffenseOptimizerEligible: offenseSlots.every((slot) => slot.optimizerEligibility === "eligible"),
        allOffenseInDfsPool: chosen.every((candidate) => candidate.slotPlayer.position === "DST" || isDfsCandidatePoolPlayer(candidate.row)),
        dstContextUsable: slots.every((slot) => slot.position !== "DST" || slot.dstMatchup?.dstMatchupScore != null),
        allFromUploadedSlate: slots.every((slot) => uploadedDkIds.has(slot.dkId)),
      },
    });
  }

  if (candidatePool.dstWithoutUsableContext > 0) {
    warnings.push(
      candidatePool.dstWithoutUsableContext +
        " uploaded DST(s) have no usable WU6C matchup context and cannot fill the DST slot",
    );
  }

  return {
    status: lineups.length === LINEUP_STRATEGIES.length ? "ready" : lineups.length > 0 ? "infeasible" : "unavailable",
    lineups,
    infeasible,
    candidatePool,
    objectiveVersion: LINEUP_OBJECTIVE_VERSION,
    rulesVersion: NFL_CLASSIC_RULES.version,
    salaryCap: NFL_CLASSIC_RULES.salaryCap,
    asOf: input.asOf,
    warnings,
    elapsedMs: clock() - start,
  };
}
