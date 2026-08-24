import { weightedMean } from "../derived/weightedStats";
import type { GameObservation, OpponentAdjustmentResult, TeamStrength } from "./types";

export type IterativeAdjustmentConfig = {
  strength: number;
  iterations: number;
  minimumGames: number;
};

function isFbsVsFbs(row: GameObservation): boolean {
  return (
    (row.teamClassification ?? "").toLowerCase() === "fbs" &&
    (row.opponentClassification ?? "").toLowerCase() === "fbs"
  );
}

/**
 * Method A — generalized reproduction of
 * src/lib/cfb/pipeline/opponentAdjustment.ts's recurrence: mean-center
 * offense/defense strength each iteration, propagate a strength-weighted
 * fraction of the opponent's PRIOR-iteration strength, re-center. Section
 * 10 default: FCS excluded from the network entirely (row must be
 * FBS-vs-FBS to enter `eligible`).
 */
export function computeIterativeAdjustment(
  teamIds: readonly string[],
  observations: readonly GameObservation[],
  config: IterativeAdjustmentConfig,
): OpponentAdjustmentResult {
  const eligible = observations.filter(
    (row) => isFbsVsFbs(row) && row.offenseValue !== null && row.defenseAllowedValue !== null,
  );
  const { mean: leagueMean } = weightedMean(eligible.map((row) => ({ value: row.offenseValue, weight: row.weight })));
  if (leagueMean === null) {
    return {
      teams: teamIds.map((teamExternalId) => ({ teamExternalId, offense: null, defense: null, gamesCount: 0 })),
      leagueMean: null,
      method: "ITERATIVE",
    };
  }

  const byTeam = new Map<string, GameObservation[]>();
  for (const row of eligible) {
    const rows = byTeam.get(row.teamExternalId) ?? [];
    rows.push(row);
    byTeam.set(row.teamExternalId, rows);
  }

  let offenseStrength = new Map<string, number>();
  let defenseStrength = new Map<string, number>();
  for (const teamId of teamIds) {
    const rows = byTeam.get(teamId) ?? [];
    const { mean: offense } = weightedMean(rows.map((r) => ({ value: r.offenseValue, weight: r.weight })));
    const { mean: allowed } = weightedMean(rows.map((r) => ({ value: r.defenseAllowedValue, weight: r.weight })));
    offenseStrength.set(teamId, offense === null ? 0 : offense - leagueMean);
    defenseStrength.set(teamId, allowed === null ? 0 : leagueMean - allowed);
  }

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
          config.strength * (defenseStrength.get(row.opponentExternalId) ?? 0),
        weight: row.weight,
      }));
      const defenseValues = rows.map((row) => ({
        value:
          leagueMean -
          (row.defenseAllowedValue as number) +
          config.strength * (offenseStrength.get(row.opponentExternalId) ?? 0),
        weight: row.weight,
      }));
      nextOffense.set(teamId, weightedMean(offenseValues).mean ?? 0);
      nextDefense.set(teamId, weightedMean(defenseValues).mean ?? 0);
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
      defense: leagueMean + (defenseStrength.get(teamId) ?? 0), // already sign-flipped: higher = better defense
      gamesCount,
    };
  });

  return { teams, leagueMean, method: "ITERATIVE" };
}
