/**
 * NFL projected game total -- v1 downstream market comparison.
 *
 * Strictly separate from the projection itself (mirrors
 * src/lib/nfl/projectionData.ts's existing spread-vs-market pattern):
 * takes an already-computed `NflTotalPrediction` and a market total
 * observation and computes a neutral difference for DISPLAY ONLY. This
 * module must never be imported by totalsFeatures.ts, totalsModel.ts, or
 * totalsGenerator.ts, and Vegas data must never reach those modules --
 * see totalsMarketComparison.test.ts's explicit "removing Vegas data
 * entirely does not change projectedGameTotal" test for the enforcement
 * proof.
 *
 * Labels are deliberately neutral -- never "+EV", "edge", or anything
 * implying a proven predictive advantage. The research program measured
 * accuracy against actual outcomes, not against the market; no market-
 * beating claim is established here.
 */
import type { NflTotalPrediction } from "./totalsGenerator";

export type NflTotalMarketObservation = {
  vegasTotal: number;
  provider: string;
  sportsbook: string;
  observedAt: string;
};

export type NflTotalMarketComparison = {
  gameId: string;
  projectedGameTotal: number;
  vegasTotal: number;
  /** projectedGameTotal - vegasTotal. Purely descriptive. */
  totalDifference: number;
  /** Neutral label -- never implies a proven edge. */
  lean: "Over Lean" | "Under Lean" | "No Lean";
  label: "JKB Difference";
  provider: string;
  sportsbook: string;
  observedAt: string;
};

const NO_LEAN_THRESHOLD = 0.5; // points; differences smaller than this are reported as "No Lean", not a direction.

export function compareNflTotalToMarket(prediction: NflTotalPrediction, market: NflTotalMarketObservation): NflTotalMarketComparison | null {
  if (prediction.projectedGameTotal === null) return null;
  const totalDifference = prediction.projectedGameTotal - market.vegasTotal;
  const lean: NflTotalMarketComparison["lean"] = Math.abs(totalDifference) < NO_LEAN_THRESHOLD ? "No Lean" : totalDifference > 0 ? "Over Lean" : "Under Lean";
  return {
    gameId: prediction.gameId,
    projectedGameTotal: prediction.projectedGameTotal,
    vegasTotal: market.vegasTotal,
    totalDifference,
    lean,
    label: "JKB Difference",
    provider: market.provider,
    sportsbook: market.sportsbook,
    observedAt: market.observedAt,
  };
}
