import type { CfbDerivedTeamGameMetrics, CfbGarbageTimePolicyName } from "../types";

export type Phase1SeasonCoverageReport = {
  season: number;
  fbsGames: number;
  fbsTeamGames: number;
  eligibleScrimmagePlays: number;
  ppaCoveragePct: number;
  downDistanceSuccessCoveragePct: number;
  explosiveCoveragePct: number;
  paceCoveragePct: number;
  unknownPlayTypeCount: number;
  invalidClockCount: number;
  unresolvedTeamIdentityCount: number;
  policyPlayCounts: Record<
    Exclude<CfbGarbageTimePolicyName, "LEVERAGE">,
    { includedPlayCount: number; totalWeight: number }
  >;
};

export type Phase1CoverageInputs = {
  season: number;
  teamGames: readonly CfbDerivedTeamGameMetrics[];
  unknownPlayTypeCount: number;
  invalidClockCount: number;
  unresolvedTeamIdentityCount: number;
};

function pct(covered: number, total: number): number {
  return total === 0 ? 0 : Math.round((covered / total) * 10_000) / 100;
}

export function buildPhase1SeasonCoverageReport(input: Phase1CoverageInputs): Phase1SeasonCoverageReport {
  const fbsTeamGames = input.teamGames.filter((game) => (game.classification ?? "").toLowerCase() === "fbs");
  const fbsGameIds = new Set(fbsTeamGames.map((game) => game.gameId));
  const eligiblePlays = fbsTeamGames.reduce((sum, game) => sum + game.eligibleScrimmagePlays, 0);
  const ppaCovered = fbsTeamGames.reduce((sum, game) => sum + game.ppaCoveredEligiblePlays, 0);

  const withDownDistance = fbsTeamGames.filter(
    (game) => game.policyVariants.NONE.downDistanceSuccessRate !== null,
  ).length;
  const withExplosive = fbsTeamGames.filter(
    (game) => game.policyVariants.NONE.explosivePlayRate !== null,
  ).length;
  const withPace = fbsTeamGames.filter((game) => game.policyVariants.NONE.secondsPerPlay !== null).length;

  const policies: Exclude<CfbGarbageTimePolicyName, "LEVERAGE">[] = ["NONE", "SCORE_QUARTER", "SOFT_WEIGHT"];
  const policyPlayCounts = Object.fromEntries(
    policies.map((policy) => [
      policy,
      {
        includedPlayCount: fbsTeamGames.reduce(
          (sum, game) => sum + game.policyVariants[policy].includedPlayCount,
          0,
        ),
        totalWeight: fbsTeamGames.reduce((sum, game) => sum + game.policyVariants[policy].totalWeight, 0),
      },
    ]),
  ) as Phase1SeasonCoverageReport["policyPlayCounts"];

  return {
    season: input.season,
    fbsGames: fbsGameIds.size,
    fbsTeamGames: fbsTeamGames.length,
    eligibleScrimmagePlays: eligiblePlays,
    ppaCoveragePct: pct(ppaCovered, eligiblePlays),
    downDistanceSuccessCoveragePct: pct(withDownDistance, fbsTeamGames.length),
    explosiveCoveragePct: pct(withExplosive, fbsTeamGames.length),
    paceCoveragePct: pct(withPace, fbsTeamGames.length),
    unknownPlayTypeCount: input.unknownPlayTypeCount,
    invalidClockCount: input.invalidClockCount,
    unresolvedTeamIdentityCount: input.unresolvedTeamIdentityCount,
    policyPlayCounts,
  };
}
