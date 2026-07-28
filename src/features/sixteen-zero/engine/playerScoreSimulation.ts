import { POSITION_VOLATILITY } from "../data/engineConfig";
import type {
  FantasyPosition,
  LineupSlot,
  PlayerTier,
  SimulationPlayer,
  WeeklyLineup,
} from "../types";
import type { DefensePositionRanks } from "./lineupOptimizer";
import { getExpectedPlayerScore } from "./lineupOptimizer";
import { SeededRandom } from "./seededRandom";

export type VarianceProfile = {
  volatility: number;
  bustProbability: number;
  ceilingProbability: number;
  minimumScore: number;
  maximumMultiplier: number;
};

const TIER_PROFILES: Record<
  PlayerTier,
  Pick<VarianceProfile, "bustProbability" | "ceilingProbability" | "maximumMultiplier">
> = {
  elite: { bustProbability: 0.035, ceilingProbability: 0.035, maximumMultiplier: 3.1 },
  "high-end": { bustProbability: 0.045, ceilingProbability: 0.032, maximumMultiplier: 3.25 },
  "mid-tier": { bustProbability: 0.06, ceilingProbability: 0.028, maximumMultiplier: 3.5 },
  "low-tier": { bustProbability: 0.085, ceilingProbability: 0.025, maximumMultiplier: 3.8 },
};

export function buildPlayerTierMap(players: readonly SimulationPlayer[]) {
  const result = new Map<string, PlayerTier>();
  for (const position of ["QB", "RB", "WR", "TE", "K", "DST"] as FantasyPosition[]) {
    const positionPlayers = players
      .filter((player) => player.position === position)
      .sort((first, second) => second.blendedPPG - first.blendedPPG);
    positionPlayers.forEach((player, index) => {
      const percentile = index / Math.max(1, positionPlayers.length);
      const tier: PlayerTier =
        percentile < 0.1
          ? "elite"
          : percentile < 0.3
            ? "high-end"
            : percentile < 0.7
              ? "mid-tier"
              : "low-tier";
      result.set(player.id, tier);
    });
  }
  return result;
}

export function getVarianceProfile(position: FantasyPosition, tier: PlayerTier): VarianceProfile {
  const tierProfile = TIER_PROFILES[tier];
  return {
    volatility: POSITION_VOLATILITY[position],
    bustProbability: tierProfile.bustProbability,
    ceilingProbability: tierProfile.ceilingProbability,
    minimumScore: position === "K" || position === "DST" ? -6 : 0,
    maximumMultiplier: tierProfile.maximumMultiplier,
  };
}

export type PlayerScoreTrace = {
  score: number;
  outcomeMultiplier: number;
  bustOrDstKCollapse: boolean;
};

/**
 * Core scoring draw shared by simulatePlayerScore and the dev-only scoring
 * trace helper. Kept as a single implementation so the trace can never drift
 * from the score a player actually receives in a real simulated week.
 */
export function simulatePlayerScoreDetailed(
  expectedMean: number,
  player: SimulationPlayer,
  tier: PlayerTier,
  random: SeededRandom,
): PlayerScoreTrace {
  if (expectedMean <= 0) {
    return { score: 0, outcomeMultiplier: 0, bustOrDstKCollapse: false };
  }
  const profile = getVarianceProfile(player.position, tier);
  const branch = random.next();
  let multiplier: number;

  if (branch < profile.bustProbability) {
    const tierFloor = tier === "elite" ? 0.12 : tier === "high-end" ? 0.08 : 0;
    multiplier = tierFloor + random.next() * (0.48 - tierFloor);
  } else if (branch < profile.bustProbability + profile.ceilingProbability) {
    multiplier = 1.65 + Math.pow(random.next(), 0.7) * (profile.maximumMultiplier - 1.65);
  } else {
    const normalProbability = 1 - profile.bustProbability - profile.ceilingProbability;
    const bustMean = tier === "elite" ? 0.3 : tier === "high-end" ? 0.28 : 0.24;
    const ceilingMean = 2.18;
    const targetNormalMean =
      (1 -
        profile.bustProbability * bustMean -
        profile.ceilingProbability * ceilingMean) /
      normalProbability;
    const logNormal =
      Math.exp(
        profile.volatility * random.normal() -
          (profile.volatility * profile.volatility) / 2,
      ) * targetNormalMean;
    multiplier = Math.min(profile.maximumMultiplier, logNormal);
  }

  let score = expectedMean * multiplier;
  let collapsed = false;
  if ((player.position === "K" || player.position === "DST") && random.next() < 0.035) {
    score = -random.next() * 4;
    collapsed = true;
  }
  return {
    score: Math.max(profile.minimumScore, Math.round(score * 10) / 10),
    outcomeMultiplier: multiplier,
    bustOrDstKCollapse: collapsed,
  };
}

export function simulatePlayerScore(
  expectedMean: number,
  player: SimulationPlayer,
  tier: PlayerTier,
  random: SeededRandom,
) {
  return simulatePlayerScoreDetailed(expectedMean, player, tier, random).score;
}

export function simulateLineupScore(
  lineup: WeeklyLineup,
  week: number,
  defenseRanks: DefensePositionRanks,
  tiers: ReadonlyMap<string, PlayerTier>,
  random: SeededRandom,
) {
  const expectedScores = Object.fromEntries(
    (Object.entries(lineup) as Array<[LineupSlot, SimulationPlayer | null]>).map(
      ([slot, player]) => [
        slot,
        player
          ? getExpectedPlayerScore(player, week, defenseRanks)
          : 0,
      ],
    ),
  ) as Record<LineupSlot, number>;
  const expectedTotal = Object.values(expectedScores).reduce(
    (total, score) => total + score,
    0,
  );
  const slotScores = Object.fromEntries(
    (Object.entries(lineup) as Array<[LineupSlot, SimulationPlayer | null]>).map(
      ([slot, player]) => [
        slot,
        player
          ? simulatePlayerScore(
              expectedScores[slot],
              player,
              tiers.get(player.id) ?? "mid-tier",
              random.fork(player.id),
            )
          : 0,
      ],
    ),
  ) as Record<LineupSlot, number>;
  const scores = Object.values(slotScores);
  const rawScore = scores.reduce((total, score) => total + score, 0);
  return {
    rawScore,
    roundedScore: Math.round(rawScore * 10) / 10,
    playerScores: scores,
    slotScores,
    expectedTotal,
  };
}
