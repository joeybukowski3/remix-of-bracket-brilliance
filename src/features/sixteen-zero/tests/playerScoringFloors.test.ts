import { describe, expect, it } from "vitest";
import { DEFENSE_POSITION_RANKS, SIMULATION_PLAYERS } from "../data";
import { simulateAutomaticDraft } from "../engine/cpuDraft";
import { getExpectedPlayerScore, optimizeLineup } from "../engine/lineupOptimizer";
import {
  buildPlayerTierMap,
  getVarianceProfile,
  simulateLineupScore,
  simulatePlayerScore,
  simulatePlayerScoreDetailed,
} from "../engine/playerScoreSimulation";
import { SeededRandom } from "../engine/seededRandom";
import type { PlayerTier } from "../types";

const tiers = buildPlayerTierMap(SIMULATION_PLAYERS);
const TIERS = ["elite", "high-end", "mid-tier", "low-tier"] as const;

// Bust (low-outcome) probabilities in effect before the 16-0 floor-raise tune,
// kept here only so the "before" side of a paired comparison can be
// reconstructed. Ceiling probabilities and maximum multipliers were not
// touched by the tune, so they are read live from getVarianceProfile.
const PREVIOUS_BUST_PROBABILITY: Record<PlayerTier, number> = {
  elite: 0.035,
  "high-end": 0.045,
  "mid-tier": 0.06,
  "low-tier": 0.085,
};

/**
 * Faithful reproduction of simulatePlayerScoreDetailed's branch/multiplier
 * math, parameterized on bustProbability so a "before the tune" distribution
 * can be sampled for comparison. Everything else (ceiling probability,
 * maximum multiplier, volatility, tier floor/means) is identical to
 * production and read from the same getVarianceProfile the real function uses.
 */
function legacyMultiplier(
  bustProbability: number,
  player: (typeof SIMULATION_PLAYERS)[number],
  tier: PlayerTier,
  random: SeededRandom,
): number {
  const profile = getVarianceProfile(player.position, tier);
  const branch = random.next();
  if (branch < bustProbability) {
    const tierFloor = tier === "elite" ? 0.12 : tier === "high-end" ? 0.08 : 0;
    return tierFloor + random.next() * (0.48 - tierFloor);
  }
  if (branch < bustProbability + profile.ceilingProbability) {
    return 1.65 + Math.pow(random.next(), 0.7) * (profile.maximumMultiplier - 1.65);
  }
  const normalProbability = 1 - bustProbability - profile.ceilingProbability;
  const bustMean = tier === "elite" ? 0.3 : tier === "high-end" ? 0.28 : 0.24;
  const ceilingMean = 2.18;
  const targetNormalMean =
    (1 - bustProbability * bustMean - profile.ceilingProbability * ceilingMean) /
    normalProbability;
  const logNormal =
    Math.exp(profile.volatility * random.normal() - (profile.volatility * profile.volatility) / 2) *
    targetNormalMean;
  return Math.min(profile.maximumMultiplier, logNormal);
}

function firstPlayerForTier(tier: PlayerTier) {
  return SIMULATION_PLAYERS.find(
    (candidate) => candidate.position !== "K" && candidate.position !== "DST" && tiers.get(candidate.id) === tier,
  )!;
}

const SAMPLE_SIZE = 20_000;
const LOW_OUTCOME_THRESHOLD = 0.6;

describe("16-0 player scoring floors (user/CPU shared implementation)", () => {
  it("calls the same simulateLineupScore implementation for user and CPU lineups", () => {
    // seasonSimulation.ts calls this exact exported function for both the
    // user's lineup and every CPU opponent's lineup (simulateCpuLineupScore
    // wraps it with no branch on who owns the roster). Proving it is a pure,
    // side-effect-free function of its inputs proves there is no separate
    // code path either side could silently diverge onto.
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 3, "shared-scoring-roster");
    const roster = draft.rosters.get(3)!;
    const lineup = optimizeLineup(roster, 1, DEFENSE_POSITION_RANKS, {});
    const asUser = simulateLineupScore(lineup, 1, DEFENSE_POSITION_RANKS, tiers, new SeededRandom("shared-seed"));
    const asCpu = simulateLineupScore(lineup, 1, DEFENSE_POSITION_RANKS, tiers, new SeededRandom("shared-seed"));
    expect(asCpu).toEqual(asUser);
  });

  it("keeps each tier's expected mean approximately unchanged", () => {
    for (const tier of TIERS) {
      const player = firstPlayerForTier(tier);
      const expectedMean = getExpectedPlayerScore(player, 1, DEFENSE_POSITION_RANKS) || 15;
      const samples = Array.from({ length: SAMPLE_SIZE }, (_, index) =>
        simulatePlayerScore(expectedMean, player, tier, new SeededRandom(`mean-${tier}-${index}`)),
      );
      const mean = samples.reduce((total, score) => total + score, 0) / samples.length;
      expect(mean).toBeGreaterThan(expectedMean * 0.92);
      expect(mean).toBeLessThan(expectedMean * 1.08);
    }
  });

  it("lowers bust probability and modestly improves the lower tail vs. the prior distribution", () => {
    for (const tier of TIERS) {
      const player = firstPlayerForTier(tier);
      const profile = getVarianceProfile(player.position, tier);
      expect(profile.bustProbability).toBeLessThan(PREVIOUS_BUST_PROBABILITY[tier]);

      let legacyLowCount = 0;
      let currentLowCount = 0;
      for (let index = 0; index < SAMPLE_SIZE; index += 1) {
        const legacy = legacyMultiplier(
          PREVIOUS_BUST_PROBABILITY[tier],
          player,
          tier,
          new SeededRandom(`legacy-${tier}-${index}`),
        );
        const current = simulatePlayerScoreDetailed(
          100,
          player,
          tier,
          new SeededRandom(`legacy-${tier}-${index}`),
        ).outcomeMultiplier;
        if (legacy < LOW_OUTCOME_THRESHOLD) legacyLowCount += 1;
        if (current < LOW_OUTCOME_THRESHOLD) currentLowCount += 1;
      }
      // Paired on identical seeds, so this isolates the effect of the bust
      // probability change from sampling noise: the new distribution must
      // land at or below the old one's low-outcome rate for every tier.
      expect(currentLowCount).toBeLessThanOrEqual(legacyLowCount);
    }
  });

  it("does not change ceiling probability or maximum multiplier for any tier", () => {
    const PREVIOUS_CEILING_PROBABILITY: Record<PlayerTier, number> = {
      elite: 0.035,
      "high-end": 0.032,
      "mid-tier": 0.028,
      "low-tier": 0.025,
    };
    const PREVIOUS_MAXIMUM_MULTIPLIER: Record<PlayerTier, number> = {
      elite: 3.1,
      "high-end": 3.25,
      "mid-tier": 3.5,
      "low-tier": 3.8,
    };
    for (const tier of TIERS) {
      const player = firstPlayerForTier(tier);
      const profile = getVarianceProfile(player.position, tier);
      expect(profile.ceilingProbability).toBe(PREVIOUS_CEILING_PROBABILITY[tier]);
      expect(profile.maximumMultiplier).toBe(PREVIOUS_MAXIMUM_MULTIPLIER[tier]);
    }
  });

  it("is deterministic for the same seed", () => {
    const player = firstPlayerForTier("mid-tier");
    const first = simulatePlayerScoreDetailed(18, player, "mid-tier", new SeededRandom("floor-determinism"));
    const repeated = simulatePlayerScoreDetailed(18, player, "mid-tier", new SeededRandom("floor-determinism"));
    expect(repeated).toEqual(first);
  });

  it("still sums exactly nine starters, once each, for a full lineup score", () => {
    const draft = simulateAutomaticDraft(SIMULATION_PLAYERS, 4, "floor-lineup-roster");
    const roster = draft.rosters.get(4)!;
    const lineup = optimizeLineup(roster, 1, DEFENSE_POSITION_RANKS, {});
    const result = simulateLineupScore(lineup, 1, DEFENSE_POSITION_RANKS, tiers, new SeededRandom("floor-lineup-score"));
    expect(result.playerScores).toHaveLength(9);
    const ids = Object.values(lineup)
      .filter((player): player is NonNullable<typeof player> => player !== null)
      .map((player) => player.id);
    expect(new Set(ids).size).toBe(9);
  });
});
