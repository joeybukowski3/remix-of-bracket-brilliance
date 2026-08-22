export type DecayConfig =
  | { method: "NONE" }
  | { method: "FIXED_GAME_COUNT"; rampGames: number }
  | { method: "PRECISION_WEIGHTED"; priorGamesWeight: number };

/**
 * Section 5: blends a preseason prior value with a current-season-only
 * estimate. `currentGamesPlayed` is the count of usable current-season
 * team-game observations behind `currentValue` (0 when currentValue is
 * null). Never fabricates a current-season value from nothing — with 0
 * games played, every method here reduces to the prior (or null if no
 * prior either).
 */
export function blendPriorAndCurrent(
  priorValue: number | null,
  currentValue: number | null,
  currentGamesPlayed: number,
  config: DecayConfig,
): number | null {
  if (config.method === "NONE") return currentValue; // "no prior" comparison arm
  if (currentValue === null || currentGamesPlayed <= 0) return priorValue;
  if (priorValue === null) return currentValue;

  if (config.method === "FIXED_GAME_COUNT") {
    const priorWeight = Math.max(0, 1 - currentGamesPlayed / config.rampGames);
    return priorWeight * priorValue + (1 - priorWeight) * currentValue;
  }

  // PRECISION_WEIGHTED: posterior = (K*prior + n*current) / (K+n)
  const k = config.priorGamesWeight;
  return (k * priorValue + currentGamesPlayed * currentValue) / (k + currentGamesPlayed);
}
