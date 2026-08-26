import type { NflReceivingFeatureRow } from "./types/receivingFeatures";
import { coalesceWindow } from "./qbOpportunityEncoding";
import { shrinkTowardLeagueMean } from "./qbPassingBaselines";

export type NflReceivingBaselineConstants = {
  leagueMeanReceivingYards: number;
  leagueMeanYardsPerTarget: number;
  leagueMeanReceptionsPerTarget: number;
  leagueMeanYardsPerReception: number;
};

export function computeReceivingBaselineConstants(trainRows: readonly NflReceivingFeatureRow[]): NflReceivingBaselineConstants {
  const yards = trainRows.map((r) => r.target.receivingYards);
  const mean = (values: number[], fallback: number) => (values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : fallback);
  return {
    leagueMeanReceivingYards: mean(yards, 0),
    leagueMeanYardsPerTarget: mean(trainRows.map((r) => coalesceWindow(r.features.playerEfficiency.yardsPerTarget)).filter((v): v is number => v != null), 6.5),
    leagueMeanReceptionsPerTarget: mean(trainRows.map((r) => coalesceWindow(r.features.playerEfficiency.receptionsPerTarget)).filter((v): v is number => v != null), 0.62),
    leagueMeanYardsPerReception: mean(trainRows.map((r) => coalesceWindow(r.features.playerEfficiency.yardsPerReception)).filter((v): v is number => v != null), 10.5),
  };
}

export function predictReceivingBaselineA(row: NflReceivingFeatureRow, constants: NflReceivingBaselineConstants): number {
  return constants.leagueMeanReceivingYards;
}

/** Raw rolling receiving yards/game, no shrinkage -- the simplest reference. */
export function predictReceivingBaselineB(row: NflReceivingFeatureRow, constants: NflReceivingBaselineConstants): number {
  const targets = coalesceWindow(row.features.playerUsage.targetsPerGame);
  const ypt = coalesceWindow(row.features.playerEfficiency.yardsPerTarget);
  if (targets == null || ypt == null) return constants.leagueMeanReceivingYards;
  return targets * ypt;
}

export const RECEIVING_EFFICIENCY_SHRINKAGE_PRIOR_STRENGTH_GAMES = 4;

export function projectTargets(row: NflReceivingFeatureRow, fallbackTargets: number): number {
  return coalesceWindow(row.features.playerUsage.targetsPerGame) ?? fallbackTargets;
}

function sampleGames(row: NflReceivingFeatureRow): number {
  return row.diagnostics.gamesWithTargetsPriorThisSeason || (row.diagnostics.hasPriorSeasonTargets ? 1 : 0);
}

export function projectYardsPerTarget(row: NflReceivingFeatureRow, constants: NflReceivingBaselineConstants): number {
  const raw = coalesceWindow(row.features.playerEfficiency.yardsPerTarget);
  if (raw == null) return constants.leagueMeanYardsPerTarget;
  return shrinkTowardLeagueMean(raw, sampleGames(row), constants.leagueMeanYardsPerTarget, RECEIVING_EFFICIENCY_SHRINKAGE_PRIOR_STRENGTH_GAMES);
}

export function projectReceptionsPerTarget(row: NflReceivingFeatureRow, constants: NflReceivingBaselineConstants): number {
  const raw = coalesceWindow(row.features.playerEfficiency.receptionsPerTarget);
  if (raw == null) return constants.leagueMeanReceptionsPerTarget;
  return shrinkTowardLeagueMean(raw, sampleGames(row), constants.leagueMeanReceptionsPerTarget, RECEIVING_EFFICIENCY_SHRINKAGE_PRIOR_STRENGTH_GAMES);
}

export function projectYardsPerReception(row: NflReceivingFeatureRow, constants: NflReceivingBaselineConstants): number {
  const raw = coalesceWindow(row.features.playerEfficiency.yardsPerReception);
  if (raw == null) return constants.leagueMeanYardsPerReception;
  return shrinkTowardLeagueMean(raw, sampleGames(row), constants.leagueMeanYardsPerReception, RECEIVING_EFFICIENCY_SHRINKAGE_PRIOR_STRENGTH_GAMES);
}

/** Baseline C: projectedTargets x projectedYardsPerTarget (shrunk). */
export function predictReceivingBaselineC(
  row: NflReceivingFeatureRow,
  constants: NflReceivingBaselineConstants,
  fallbackTargets: number,
): { predicted: number; projectedTargets: number; projectedYpt: number } {
  const targets = projectTargets(row, fallbackTargets);
  const ypt = projectYardsPerTarget(row, constants);
  return { predicted: targets * ypt, projectedTargets: targets, projectedYpt: ypt };
}

/** Baseline D: projectedTargets x projectedCatchRate x projectedYardsPerReception (all shrunk). */
export function predictReceivingBaselineD(
  row: NflReceivingFeatureRow,
  constants: NflReceivingBaselineConstants,
  fallbackTargets: number,
): { predicted: number; projectedTargets: number; projectedCatchRate: number; projectedYpr: number } {
  const targets = projectTargets(row, fallbackTargets);
  const catchRate = projectReceptionsPerTarget(row, constants);
  const ypr = projectYardsPerReception(row, constants);
  return { predicted: targets * catchRate * ypr, projectedTargets: targets, projectedCatchRate: catchRate, projectedYpr: ypr };
}
