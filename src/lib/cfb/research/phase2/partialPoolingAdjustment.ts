import { weightedMean } from "../derived/weightedStats";
import type { GameObservation, OpponentAdjustmentResult, TeamStrength } from "./types";

export type PartialPoolingConfig = {
  /** Prior "equivalent sample size" — larger tau shrinks harder. Distinct per-team, sample-size-adaptive (see module doc). */
  tau: number;
  iterations: number;
  minimumGames: number;
  /** Opponent-strength propagation fraction each iteration, same role as Method A's strength (kept at 1.0 by default — shrinkage is what distinguishes this method, not attenuated propagation). */
  propagation: number;
};

function isFbsVsFbs(row: GameObservation): boolean {
  return (
    (row.teamClassification ?? "").toLowerCase() === "fbs" &&
    (row.opponentClassification ?? "").toLowerCase() === "fbs"
  );
}

/**
 * Method C — true opponent-adjusted partial pooling, NOT a raw-mean-shrink.
 * Same opponent-strength-propagation recurrence as Method A, but each
 * iteration's per-team estimate is explicitly shrunk toward 0 (league
 * mean, since values are already league-mean-centered) by a James-Stein-
 * style factor n/(n+tau) — sparse teams (small n) shrink harder,
 * data-rich teams shrink less. This is what distinguishes it from Method
 * B: ridge applies one global penalty via the design matrix; this applies
 * an explicit, per-team, sample-size-dependent shrinkage weight every
 * iteration. If tau -> 0 this collapses toward Method A's un-shrunk
 * iterative estimate; that convergence is expected and is not a sign the
 * two methods are secretly identical — the shrinkage MECHANISM differs.
 */
export function computePartialPoolingAdjustment(
  teamIds: readonly string[],
  observations: readonly GameObservation[],
  config: PartialPoolingConfig,
): OpponentAdjustmentResult {
  const eligible = observations.filter(
    (row) => isFbsVsFbs(row) && row.offenseValue !== null && row.defenseAllowedValue !== null,
  );
  const { mean: leagueMean } = weightedMean(eligible.map((row) => ({ value: row.offenseValue, weight: row.weight })));
  if (leagueMean === null) {
    return {
      teams: teamIds.map((teamExternalId) => ({ teamExternalId, offense: null, defense: null, gamesCount: 0 })),
      leagueMean: null,
      method: "PARTIAL_POOLING",
    };
  }

  const byTeam = new Map<string, GameObservation[]>();
  for (const row of eligible) {
    const rows = byTeam.get(row.teamExternalId) ?? [];
    rows.push(row);
    byTeam.set(row.teamExternalId, rows);
  }

  const shrinkageWeight = (n: number): number => n / (n + config.tau);

  let offenseStrength = new Map<string, number>(teamIds.map((id) => [id, 0]));
  let defenseStrength = new Map<string, number>(teamIds.map((id) => [id, 0]));

  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const nextOffense = new Map<string, number>();
    const nextDefense = new Map<string, number>();
    for (const teamId of teamIds) {
      const rows = byTeam.get(teamId) ?? [];
      if (rows.length < config.minimumGames) {
        nextOffense.set(teamId, 0);
        nextDefense.set(teamId, 0);
        continue;
      }
      const offenseValues = rows.map((row) => ({
        value:
          (row.offenseValue as number) -
          leagueMean +
          config.propagation * (defenseStrength.get(row.opponentExternalId) ?? 0),
        weight: row.weight,
      }));
      const defenseValues = rows.map((row) => ({
        value:
          leagueMean -
          (row.defenseAllowedValue as number) +
          config.propagation * (offenseStrength.get(row.opponentExternalId) ?? 0),
        weight: row.weight,
      }));
      const rawOffense = weightedMean(offenseValues).mean ?? 0;
      const rawDefense = weightedMean(defenseValues).mean ?? 0;
      const shrink = shrinkageWeight(rows.length);
      nextOffense.set(teamId, rawOffense * shrink);
      nextDefense.set(teamId, rawDefense * shrink);
    }
    const offenseCenter = weightedMean([...nextOffense.values()].map((v) => ({ value: v, weight: 1 }))).mean ?? 0;
    const defenseCenter = weightedMean([...nextDefense.values()].map((v) => ({ value: v, weight: 1 }))).mean ?? 0;
    offenseStrength = new Map([...nextOffense].map(([id, v]) => [id, v - offenseCenter]));
    defenseStrength = new Map([...nextDefense].map(([id, v]) => [id, v - defenseCenter]));
  }

  const teams: TeamStrength[] = teamIds.map((teamId) => {
    const gamesCount = byTeam.get(teamId)?.length ?? 0;
    if (gamesCount < config.minimumGames) {
      return { teamExternalId: teamId, offense: null, defense: null, gamesCount };
    }
    return {
      teamExternalId: teamId,
      offense: leagueMean + (offenseStrength.get(teamId) ?? 0),
      defense: leagueMean + (defenseStrength.get(teamId) ?? 0),
      gamesCount,
    };
  });

  return { teams, leagueMean, method: "PARTIAL_POOLING" };
}
