import type { PlayoffQualification } from "../types";
import { CPU_STANDINGS_CONFIG } from "../data/engineConfig";
import type { CpuRosterStrength } from "./rosterStrength";
import { SeededRandom } from "./seededRandom";

type QualificationInput = {
  userWins: number;
  userLosses: number;
  userAverageScore: number;
  cpuStrengths: readonly CpuRosterStrength[];
  random: SeededRandom;
};

export type SyntheticStanding = {
  id: string;
  wins: number;
  losses: number;
  averageScore: number;
  isUser: boolean;
};

/**
 * Converts a CPU roster's real, projection-based strength into a weekly win
 * probability relative to the league. Bounds only (see CPU_STANDINGS_CONFIG);
 * not tuned to hit any target qualification/championship rate.
 */
export function deriveCpuWinProbability(
  strength: number,
  leagueMean: number,
  leagueStandardDeviation: number,
): number {
  const zScore = (strength - leagueMean) / leagueStandardDeviation;
  return Math.max(
    CPU_STANDINGS_CONFIG.minimumWeeklyWinProbability,
    Math.min(
      CPU_STANDINGS_CONFIG.maximumWeeklyWinProbability,
      0.5 + zScore * CPU_STANDINGS_CONFIG.winProbabilitySlope,
    ),
  );
}

/**
 * Builds synthetic standings for the 11 CPU teams so the user's record can be
 * seeded against a full 12-team league. Each CPU team's weekly win
 * probability and average score are derived from that team's own drafted
 * roster strength (see rosterStrength.ts) relative to the league, not from a
 * distribution hand-tuned to hit a target qualification rate.
 */
export function deriveCpuStandings(
  cpuStrengths: readonly CpuRosterStrength[],
  random: SeededRandom,
): SyntheticStanding[] {
  const strengths = cpuStrengths.map((entry) => entry.strength);
  const leagueMean =
    strengths.reduce((total, value) => total + value, 0) / strengths.length;
  const leagueVariance =
    strengths.reduce((total, value) => total + (value - leagueMean) ** 2, 0) /
    strengths.length;
  const leagueStandardDeviation = Math.sqrt(leagueVariance) || 1;

  return cpuStrengths.map(({ slot, strength }) => {
    const winProbability = deriveCpuWinProbability(
      strength,
      leagueMean,
      leagueStandardDeviation,
    );
    const teamRandom = random.fork(`cpu-standing-${slot}`);
    let wins = 0;
    for (let week = 1; week <= 14; week += 1) {
      if (teamRandom.next() < winProbability) wins += 1;
    }
    return {
      id: `cpu-${slot}`,
      wins,
      losses: 14 - wins,
      averageScore:
        Math.round(
          (strength +
            teamRandom.normal(0, CPU_STANDINGS_CONFIG.averageScoreNoiseStandardDeviation)) *
            10,
        ) / 10,
      isUser: false,
    };
  });
}

/** Sorts the 11 CPU standings plus the user's own standing into final league order. */
export function buildLeagueStandings(
  cpuStandings: readonly SyntheticStanding[],
  userStanding: SyntheticStanding,
): SyntheticStanding[] {
  return [...cpuStandings, userStanding].sort(
    (first, second) =>
      second.wins - first.wins ||
      Number(second.isUser) - Number(first.isUser) ||
      second.averageScore - first.averageScore ||
      first.id.localeCompare(second.id),
  );
}

export function determinePlayoffQualification({
  userWins,
  userLosses,
  userAverageScore,
  cpuStrengths,
  random,
}: QualificationInput): PlayoffQualification {
  if (userWins + userLosses !== 14) {
    throw new Error("Playoff qualification requires a 14-game regular-season record.");
  }
  if (cpuStrengths.length !== 11) {
    throw new Error("Playoff qualification requires exactly 11 CPU roster strengths.");
  }

  const cpuStandings = deriveCpuStandings(cpuStrengths, random);
  const userStanding: SyntheticStanding = {
    id: "user",
    wins: userWins,
    losses: userLosses,
    averageScore: userAverageScore,
    isUser: true,
  };
  const standings = buildLeagueStandings(cpuStandings, userStanding);
  let seed = standings.findIndex((standing) => standing.isUser) + 1;
  if (userWins === 14) seed = Math.min(seed, 2);
  const qualified = seed <= 6;

  return {
    qualified,
    seed: qualified ? (seed as 1 | 2 | 3 | 4 | 5 | 6) : null,
    hasBye: qualified && seed <= 2,
  };
}
