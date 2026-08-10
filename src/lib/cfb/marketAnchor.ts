import { generateRanks } from "./model/rank";
import { normalizeToDisplayScale } from "./model/normalize";

export const CFB_MARKET_ANCHOR_VERSION = "cfb-preseason-v1.1-market-anchor" as const;

export const CFB_MARKET_FADE_BANDS = Object.freeze([
  { minGames: 0, maxGames: 0, marketWeight: 0.75, jkbWeight: 0.25 },
  { minGames: 1, maxGames: 2, marketWeight: 0.65, jkbWeight: 0.35 },
  { minGames: 3, maxGames: 4, marketWeight: 0.5, jkbWeight: 0.5 },
  { minGames: 5, maxGames: 6, marketWeight: 0.35, jkbWeight: 0.65 },
  { minGames: 7, maxGames: 8, marketWeight: 0.2, jkbWeight: 0.8 },
  { minGames: 9, maxGames: null, marketWeight: 0.1, jkbWeight: 0.9 },
] as const);

export type CfbMarketAnchorInput = {
  teamId: string;
  marketRating: number;
  statisticalOffense: number;
  statisticalDefense: number;
  displayedOffense: number;
  displayedDefense: number;
  apRank: number | null;
};

/** Reserved boundary for real 2026 inputs once games have been played. */
export type CfbCurrentSeasonStatisticalInputs = {
  teamId: string;
  gamesPlayed: number;
  opponentAdjustedOffense: number | null;
  opponentAdjustedDefense: number | null;
  record: { wins: number; losses: number } | null;
  scoringEfficiency: number | null;
  sosPlayed: number | null;
};

export type CfbMarketAnchorRating = CfbMarketAnchorInput & {
  standardizedMarketBaseline: number;
  statisticalPower: number;
  standardizedJkbStatisticalPower: number;
  rawJkbPower: number;
  jkbPowerRating: number;
  marketBaselineRank: number;
  jkbStatisticalRank: number;
  finalJkbRank: number;
  rankDifferenceFromMarket: number;
};

export function getCfbMarketFadeWeights(gamesPlayed: number) {
  if (!Number.isInteger(gamesPlayed) || gamesPlayed < 0) {
    throw new Error(`gamesPlayed must be a non-negative integer, got ${gamesPlayed}`);
  }
  return CFB_MARKET_FADE_BANDS.find((band) =>
    gamesPlayed >= band.minGames && (band.maxGames === null || gamesPlayed <= band.maxGames)
  ) as (typeof CFB_MARKET_FADE_BANDS)[number];
}

export function standardizeLeagueValues(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  if (standardDeviation === 0) return values.map(() => 0);
  return values.map((value) => (value - mean) / standardDeviation);
}

export function buildCfbMarketAnchorRatings(
  inputs: readonly CfbMarketAnchorInput[],
  gamesPlayed = 0,
): CfbMarketAnchorRating[] {
  const weights = getCfbMarketFadeWeights(gamesPlayed);
  const marketZ = standardizeLeagueValues(inputs.map((row) => row.marketRating));
  const statisticalPower = inputs.map((row) =>
    0.5 * row.statisticalOffense + 0.5 * row.statisticalDefense
  );
  const statisticalZ = standardizeLeagueValues(statisticalPower);
  const rawPower = inputs.map((_, index) =>
    weights.marketWeight * marketZ[index] + weights.jkbWeight * statisticalZ[index]
  );
  const displayPower = normalizeToDisplayScale(rawPower, { min: 40, max: 99 });
  const marketRanks = generateRanks(inputs.map((row, index) => ({ teamId: row.teamId, value: marketZ[index] })));
  const statisticalRanks = generateRanks(inputs.map((row, index) => ({ teamId: row.teamId, value: statisticalZ[index] })));
  const finalRanks = generateRanks(inputs.map((row, index) => ({ teamId: row.teamId, value: rawPower[index] })));

  return inputs.map((row, index) => {
    const marketBaselineRank = marketRanks.get(row.teamId) as number;
    const finalJkbRank = finalRanks.get(row.teamId) as number;
    return {
      ...row,
      standardizedMarketBaseline: marketZ[index],
      statisticalPower: statisticalPower[index],
      standardizedJkbStatisticalPower: statisticalZ[index],
      rawJkbPower: rawPower[index],
      jkbPowerRating: displayPower[index] as number,
      marketBaselineRank,
      jkbStatisticalRank: statisticalRanks.get(row.teamId) as number,
      finalJkbRank,
      rankDifferenceFromMarket: marketBaselineRank - finalJkbRank,
    };
  }).sort((a, b) => a.finalJkbRank - b.finalJkbRank);
}
