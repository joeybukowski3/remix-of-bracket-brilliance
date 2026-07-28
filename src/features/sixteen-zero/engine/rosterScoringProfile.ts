import type { SimulationPlayer } from "../types";
import type { DefensePositionRanks } from "./lineupOptimizer";
import { getExpectedPlayerScore, optimizeLineup } from "./lineupOptimizer";
import { buildPlayerTierMap, getVarianceProfile, type VarianceProfile } from "./playerScoreSimulation";
import { computeRosterStrength } from "./rosterStrength";

const REGULAR_SEASON_WEEKS = 14;

/**
 * Directional anchors on a standard normal curve used only to scale the
 * representative high/low multiplier below. These are a modeling constant
 * for a directional indicator, not a claim about a formal percentile.
 */
const HIGH_SIDE_Z = 0.84;
const LOW_SIDE_Z = 0.84;

/** Partial-credit ceiling outcome used for blending, well below the tier's absolute maximum multiplier. */
const CEILING_BLEND_WEIGHT = 0.4;
/** Partial-credit bust outcome used for blending, well above a full collapse. */
const BUST_BLEND_MULTIPLIER = 0.48;

export type RosterScoringProfile = {
  /** "If everything went right" - representative high-side weekly PPG. */
  highSidePPG: number;
  /** "True average points per game" - deterministic projection baseline. */
  baselinePPG: number;
  /** "If everything went wrong" - representative low-side weekly PPG. */
  lowSidePPG: number;
};

/**
 * Representative (not formal-percentile) directional multiplier for a
 * player's variance profile. Mirrors the shape of the real simulated-score
 * model (a log-normal core, blended toward a partial-credit bust/ceiling
 * outcome) but is fully deterministic: it never draws a random number and
 * never uses the tier's absolute maximum multiplier as the answer. Higher
 * volatility and higher bust/ceiling probability widen the multiplier away
 * from 1.0 in the requested direction.
 */
export function representativeMultiplier(profile: VarianceProfile, direction: "high" | "low"): number {
  const z = direction === "high" ? HIGH_SIDE_Z : -LOW_SIDE_Z;
  const lognormalShift = Math.exp(profile.volatility * z);
  if (direction === "high") {
    const ceilingBlend = 1.65 + (profile.maximumMultiplier - 1.65) * CEILING_BLEND_WEIGHT;
    return lognormalShift + profile.ceilingProbability * (ceilingBlend - lognormalShift);
  }
  return Math.max(0, lognormalShift - profile.bustProbability * (lognormalShift - BUST_BLEND_MULTIPLIER));
}

/**
 * Deterministic, non-random roster scoring profile spanning the Week 1-14
 * regular season, regardless of whether the team happened to qualify for
 * playoff games. For each week, builds the same highest-projected legal
 * lineup used elsewhere (optimizeLineup + getExpectedPlayerScore, honoring
 * byes and temporary replacements), then applies a representative high/low
 * multiplier per starter. Consumes zero random numbers, performs no
 * additional simulated seasons, and never mutates a completed SeasonResult.
 */
export function computeRosterScoringProfile(
  roster: readonly SimulationPlayer[],
  playerUniverse: readonly SimulationPlayer[],
  draftedPlayerIds: ReadonlySet<string>,
  defenseRanks: DefensePositionRanks,
): RosterScoringProfile {
  const tiers = buildPlayerTierMap(playerUniverse);
  const temporaryReplacementPool = playerUniverse.filter(
    (player) => player.active && !draftedPlayerIds.has(player.id),
  );

  let highTotal = 0;
  let lowTotal = 0;

  for (let week = 1; week <= REGULAR_SEASON_WEEKS; week += 1) {
    const lineup = optimizeLineup(roster, week, defenseRanks, { temporaryReplacementPool });
    for (const player of Object.values(lineup)) {
      if (!player) continue;
      const expectedMean = getExpectedPlayerScore(player, week, defenseRanks);
      if (expectedMean <= 0) continue; // bye/no-data starter contributes zero to every band
      const tier = tiers.get(player.id) ?? "mid-tier";
      const profile = getVarianceProfile(player.position, tier);
      highTotal += expectedMean * representativeMultiplier(profile, "high");
      lowTotal += expectedMean * representativeMultiplier(profile, "low");
    }
  }

  const baselinePPG = computeRosterStrength(roster, defenseRanks, temporaryReplacementPool);

  return {
    highSidePPG: Math.round((highTotal / REGULAR_SEASON_WEEKS) * 10) / 10,
    baselinePPG: Math.round(baselinePPG * 10) / 10,
    lowSidePPG: Math.round((lowTotal / REGULAR_SEASON_WEEKS) * 10) / 10,
  };
}
