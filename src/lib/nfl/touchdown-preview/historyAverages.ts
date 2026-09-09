import type { TouchdownOpponentGame, TouchdownPlayerGame, TouchdownPosition } from "./types";

/** Averages of the exact sample rows displayed in the Player Game History table -- never the full history. */
export type PlayerHistoryAverages = {
  touchdowns: number | null;
  rushingTds: number | null;
  receivingTds: number | null;
  rzOpportunities: number | null;
  inside10Opportunities: number | null;
  goalLineOpportunities: number | null;
  scorerOpportunities: number | null;
};

/** Averages of the exact sample rows displayed in the Opponent Game History table -- never the full history. */
export type OpponentHistoryAverages = {
  offensiveTdsAllowed: number | null;
  rzOpportunitiesAllowed: number | null;
  inside10OpportunitiesAllowed: number | null;
  goalLineOpportunitiesAllowed: number | null;
  positionTdsAllowed: number | null;
};

const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);

function average(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter(finite);
  return known.length ? known.reduce((total, value) => total + value, 0) / known.length : null;
}

/** "N-Game Avg" for the displayed sample size; falls back to a generic label when the sample is empty. */
export function historyAverageRowLabel(displayedGameCount: number): string {
  return displayedGameCount > 0 ? `${displayedGameCount}-Game Avg` : "Sample Avg";
}

export function computePlayerHistoryAverages(displayedGames: readonly TouchdownPlayerGame[]): PlayerHistoryAverages {
  return {
    touchdowns: average(displayedGames.map((game) => game.touchdowns)),
    rushingTds: average(displayedGames.map((game) => game.rushingTds)),
    receivingTds: average(displayedGames.map((game) => game.receivingTds)),
    rzOpportunities: average(displayedGames.map((game) => game.rzOpportunities)),
    inside10Opportunities: average(displayedGames.map((game) => game.inside10Opportunities)),
    goalLineOpportunities: average(displayedGames.map((game) => game.goalLineOpportunities)),
    scorerOpportunities: average(displayedGames.map((game) => game.scorerOpportunities)),
  };
}

export function computeOpponentHistoryAverages(displayedGames: readonly TouchdownOpponentGame[], position: TouchdownPosition): OpponentHistoryAverages {
  return {
    offensiveTdsAllowed: average(displayedGames.map((game) => game.offensiveTdsAllowed)),
    rzOpportunitiesAllowed: average(displayedGames.map((game) => game.rzOpportunitiesAllowed)),
    inside10OpportunitiesAllowed: average(displayedGames.map((game) => game.inside10OpportunitiesAllowed)),
    goalLineOpportunitiesAllowed: average(displayedGames.map((game) => game.goalLineOpportunitiesAllowed)),
    positionTdsAllowed: average(displayedGames.map((game) => game.touchdownsAllowedByPosition[position])),
  };
}

/** Signed difference of a single game's value from the displayed-sample average; null when either side is missing. */
export function opportunityDelta(value: number | null | undefined, sampleAverage: number | null): number | null {
  return finite(value) && finite(sampleAverage) ? value - sampleAverage : null;
}

/** Dense inline delta text, e.g. "(+1.2)" / "(-0.4)"; null when there is nothing truthful to show. */
export function formatOpportunityDelta(delta: number | null): string | null {
  if (delta == null) return null;
  const rounded = Math.round(delta * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "" : "+";
  return `(${sign}${rounded.toFixed(1)})`;
}

export type DeltaTone = "positive" | "negative" | "neutral";

/** Below this absolute delta, treat the row as at-average and mute the styling instead of implying a signal. */
const NEUTRAL_DELTA_THRESHOLD = 0.15;

export function deltaTone(delta: number | null): DeltaTone {
  if (delta == null || Math.abs(delta) < NEUTRAL_DELTA_THRESHOLD) return "neutral";
  return delta > 0 ? "positive" : "negative";
}
