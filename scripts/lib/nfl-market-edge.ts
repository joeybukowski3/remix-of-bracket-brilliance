/**
 * WU4.5 -- pure, deterministic computation of a handicapper's market edge
 * from its OWN independent prediction (nfl-snapshot-types.ts's
 * IndependentPrediction) against the deterministic current market. Never
 * asked of the model: "compare your number to the market" is simple
 * arithmetic, and simple arithmetic is never trusted from an LLM when
 * deterministic code can do it exactly.
 *
 * Sign convention:
 *   - sideEdgePoints is HOME-oriented: positive means the home team is
 *     getting more points from the market than the model's fair line says
 *     it should (i.e. value is on the HOME team); negative means value is
 *     on the AWAY team. Zero means no edge.
 *   - totalEdgePoints is OVER-oriented: positive means the model's
 *     projected total is higher than the market total (value on OVER);
 *     negative means value on UNDER.
 *
 * Both return null when the required market value is unavailable --
 * "unknown" is never coerced to zero.
 */

import type { IndependentPrediction, PredictedFairSpread } from "./nfl-snapshot-types";

/** Converts a team-labeled fair spread into a home-oriented line (negative = home favored), regardless of which team the model favored. */
export function fairSpreadToHomeLine(fairSpread: PredictedFairSpread, homeTeam: string): number {
  return fairSpread.team === homeTeam ? fairSpread.line : -fairSpread.line;
}

export function computeSideEdgePoints(prediction: Pick<IndependentPrediction, "fairSpread">, homeTeam: string, marketHomeLine: number | null): number | null {
  if (marketHomeLine == null) return null;
  const modelHomeLine = fairSpreadToHomeLine(prediction.fairSpread, homeTeam);
  return marketHomeLine - modelHomeLine;
}

export function computeTotalEdgePoints(prediction: Pick<IndependentPrediction, "projectedTotal">, marketTotal: number | null): number | null {
  if (marketTotal == null) return null;
  return prediction.projectedTotal - marketTotal;
}
