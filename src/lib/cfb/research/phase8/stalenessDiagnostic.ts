import { STALENESS_RELIABILITY_GAMES_K } from "./config";

export type StalenessResult = {
  staleness: number | null; // |currentEvidencePower - priorPower|
  reliability: number; // 0..1, games-played-based evidence strength
  adjustedStaleness: number | null; // staleness * reliability
};

/**
 * Section 7/9 — market-free staleness signal. Never fabricated: staleness
 * is null whenever currentEvidencePower is unavailable (zero games played
 * yet), and reliability is 0 at zero games, so adjustedStaleness collapses
 * to 0 rather than treating a single Week-1 game as strong evidence
 * against the prior (Section 9 safety requirement).
 */
export function computeStaleness(currentEvidencePower: number | null, priorPower: number | null, gamesPlayed: number): StalenessResult {
  const reliability = Math.min(1, Math.max(0, gamesPlayed / STALENESS_RELIABILITY_GAMES_K));
  if (currentEvidencePower === null || priorPower === null) {
    return { staleness: null, reliability, adjustedStaleness: null };
  }
  const staleness = Math.abs(currentEvidencePower - priorPower);
  return { staleness, reliability, adjustedStaleness: staleness * reliability };
}
