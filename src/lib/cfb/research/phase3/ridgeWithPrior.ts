import { solveLinearSystem } from "../phase2/linearSolver";
import type { GameObservation, OpponentAdjustmentResult, TeamStrength } from "../phase2/types";

export type RidgeWithPriorConfig = { lambda: number; includeHfa: boolean };

function isFbsVsFbs(row: GameObservation): boolean {
  return (
    (row.teamClassification ?? "").toLowerCase() === "fbs" &&
    (row.opponentClassification ?? "").toLowerCase() === "fbs"
  );
}

/**
 * Section 7 — Method B with a prior-centered penalty:
 *   minimize ||y - Xβ||² + λ||β - priorMean||²
 * which shifts the ridge normal equations' RHS by λ*priorMean instead of
 * penalizing toward 0 (src/lib/cfb/research/phase2/ridgeAdjustment.ts).
 * A team with no prior value falls back to a 0 (standardized-scale)
 * prior — i.e. ordinary ridge-toward-league-average for that team only,
 * not an error.
 */
export function computeRidgeAdjustmentWithPrior(
  teamIds: readonly string[],
  observations: readonly GameObservation[],
  config: RidgeWithPriorConfig,
  priorOffenseByTeam: ReadonlyMap<string, number>,
  priorDefenseByTeam: ReadonlyMap<string, number>,
): OpponentAdjustmentResult {
  const eligible = observations.filter(
    (row) => isFbsVsFbs(row) && row.offenseValue !== null && row.defenseAllowedValue !== null,
  );
  if (eligible.length === 0 || teamIds.length === 0) {
    return {
      teams: teamIds.map((teamExternalId) => ({ teamExternalId, offense: null, defense: null, gamesCount: 0 })),
      leagueMean: null,
      method: "RIDGE",
    };
  }

  const teamIndex = new Map(teamIds.map((id, i) => [id, i]));
  const nTeams = teamIds.length;
  const nParams = 2 + nTeams * 2;
  const offenseOffset = 2;
  const defenseOffset = 2 + nTeams;

  const ata = Array.from({ length: nParams }, () => new Array(nParams).fill(0));
  const atb = new Array(nParams).fill(0);
  const gamesCount = new Map<string, number>();

  for (const row of eligible) {
    const teamIdx = teamIndex.get(row.teamExternalId);
    const oppIdx = teamIndex.get(row.opponentExternalId);
    if (teamIdx === undefined || oppIdx === undefined) continue;
    gamesCount.set(row.teamExternalId, (gamesCount.get(row.teamExternalId) ?? 0) + 1);

    const hfaValue = config.includeHfa ? (row.isNeutral ? 0 : row.isHome ? 1 : -1) : 0;
    const xIndices = [0, 1, offenseOffset + teamIdx, defenseOffset + oppIdx];
    const xValues = [1, hfaValue, 1, -1];
    const w = row.weight > 0 ? row.weight : 1;
    const y = row.offenseValue as number;

    for (let i = 0; i < xIndices.length; i += 1) {
      atb[xIndices[i]] += w * xValues[i] * y;
      for (let j = 0; j < xIndices.length; j += 1) {
        ata[xIndices[i]][xIndices[j]] += w * xValues[i] * xValues[j];
      }
    }
  }

  for (let i = 0; i < nTeams; i += 1) {
    const teamId = teamIds[i];
    ata[offenseOffset + i][offenseOffset + i] += config.lambda;
    atb[offenseOffset + i] += config.lambda * (priorOffenseByTeam.get(teamId) ?? 0);
    ata[defenseOffset + i][defenseOffset + i] += config.lambda;
    atb[defenseOffset + i] += config.lambda * (priorDefenseByTeam.get(teamId) ?? 0);
  }

  const beta = solveLinearSystem(ata, atb);
  const intercept = beta[0];
  let offense = new Map(teamIds.map((id, i) => [id, beta[offenseOffset + i]]));
  let defense = new Map(teamIds.map((id, i) => [id, beta[defenseOffset + i]]));

  const offenseMean = [...offense.values()].reduce((s, v) => s + v, 0) / nTeams;
  const defenseMean = [...defense.values()].reduce((s, v) => s + v, 0) / nTeams;
  offense = new Map([...offense].map(([id, v]) => [id, v - offenseMean]));
  defense = new Map([...defense].map(([id, v]) => [id, v - defenseMean]));
  const leagueMean = intercept + offenseMean - defenseMean;

  const teams: TeamStrength[] = teamIds.map((teamId) => ({
    teamExternalId: teamId,
    offense: leagueMean + (offense.get(teamId) ?? 0),
    defense: leagueMean + (defense.get(teamId) ?? 0),
    gamesCount: gamesCount.get(teamId) ?? 0,
  }));

  return { teams, leagueMean, method: "RIDGE" };
}
