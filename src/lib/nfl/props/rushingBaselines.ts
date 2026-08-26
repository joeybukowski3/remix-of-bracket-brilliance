import type { NflRushingFeatureRow } from "./types/rushingFeatures";
import { coalesceWindow } from "./qbOpportunityEncoding";
import { shrinkTowardLeagueMean } from "./qbPassingBaselines";

export type NflRushingBaselineConstants = {
  leagueMeanRushingYards: number;
  leagueMeanYardsPerCarry: number;
};

export function computeRushingBaselineConstants(trainRows: readonly NflRushingFeatureRow[]): NflRushingBaselineConstants {
  const yards = trainRows.map((r) => r.target.rushingYards);
  const leagueMeanRushingYards = yards.length > 0 ? yards.reduce((s, v) => s + v, 0) / yards.length : 0;
  const ypcValues = trainRows.map((r) => coalesceWindow(r.features.playerEfficiency.yardsPerCarry)).filter((v): v is number => v != null);
  const leagueMeanYardsPerCarry = ypcValues.length > 0 ? ypcValues.reduce((s, v) => s + v, 0) / ypcValues.length : 4.2;
  return { leagueMeanRushingYards, leagueMeanYardsPerCarry };
}

export function predictRushingBaselineA(row: NflRushingFeatureRow, constants: NflRushingBaselineConstants): number {
  return constants.leagueMeanRushingYards;
}

export function predictRushingBaselineB(row: NflRushingFeatureRow, constants: NflRushingBaselineConstants): number {
  const carries = coalesceWindow(row.features.playerUsage.carriesPerGame);
  const ypc = coalesceWindow(row.features.playerEfficiency.yardsPerCarry);
  if (carries == null || ypc == null) return constants.leagueMeanRushingYards;
  return carries * ypc; // simplest possible rolling-mean reference: raw rolling carries x raw rolling YPC, no shrinkage
}

export const YPC_SHRINKAGE_PRIOR_STRENGTH_GAMES = 4;

export function projectYpc(row: NflRushingFeatureRow, constants: NflRushingBaselineConstants): number {
  const rawYpc = coalesceWindow(row.features.playerEfficiency.yardsPerCarry);
  if (rawYpc == null) return constants.leagueMeanYardsPerCarry;
  const games = row.diagnostics.gamesWithCarriesPriorThisSeason || (row.diagnostics.hasPriorSeasonCarries ? 1 : 0);
  return shrinkTowardLeagueMean(rawYpc, games, constants.leagueMeanYardsPerCarry, YPC_SHRINKAGE_PRIOR_STRENGTH_GAMES);
}

export function projectCarries(row: NflRushingFeatureRow, fallbackCarries: number): number {
  return coalesceWindow(row.features.playerUsage.carriesPerGame) ?? fallbackCarries;
}

/** Baseline C: projectedCarries x projectedYPC (shrunk). Reports each leg. */
export function predictRushingBaselineC(
  row: NflRushingFeatureRow,
  constants: NflRushingBaselineConstants,
  fallbackCarries: number,
): { predicted: number; projectedCarries: number; projectedYpc: number } {
  const carries = projectCarries(row, fallbackCarries);
  const ypc = projectYpc(row, constants);
  return { predicted: carries * ypc, projectedCarries: carries, projectedYpc: ypc };
}
