import { solveLinearSystem } from "./linearSolver";
import type { GameObservation, OpponentAdjustmentResult, TeamStrength } from "./types";

export type RidgeAdjustmentConfig = { lambda: number; includeHfa: boolean };

function isFbsVsFbs(row: GameObservation): boolean {
  return (
    (row.teamClassification ?? "").toLowerCase() === "fbs" &&
    (row.opponentClassification ?? "").toLowerCase() === "fbs"
  );
}

/**
 * Method B — weighted ridge regression:
 *   offenseValue = intercept + hfa*homeIndicator + Offense[team] - Defense[opponent] + error
 * Ridge (λ > 0) on the Offense/Defense block only (never on intercept/HFA)
 * is what makes the normal equations invertible without dropping a
 * reference team — the exact offense/defense split is only identified up
 * to a constant, and the penalty breaks that collinearity. Offense/Defense
 * are then post-hoc centered (mean subtracted, intercept adjusted to
 * compensate) purely so the output convention matches Method A/C.
 */
export function computeRidgeAdjustment(
  teamIds: readonly string[],
  observations: readonly GameObservation[],
  config: RidgeAdjustmentConfig,
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
  // param layout: [intercept, hfa, offense_1..offense_T, defense_1..defense_T]
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

  for (let i = offenseOffset; i < nParams; i += 1) ata[i][i] += config.lambda;

  const beta = solveLinearSystem(ata, atb);
  const intercept = beta[0];
  let offense = new Map(teamIds.map((id, i) => [id, beta[offenseOffset + i]]));
  let defense = new Map(teamIds.map((id, i) => [id, beta[defenseOffset + i]]));

  const offenseMean = [...offense.values()].reduce((s, v) => s + v, 0) / nTeams;
  const defenseMean = [...defense.values()].reduce((s, v) => s + v, 0) / nTeams;
  offense = new Map([...offense].map(([id, v]) => [id, v - offenseMean]));
  defense = new Map([...defense].map(([id, v]) => [id, v - defenseMean]));
  const leagueMean = intercept + offenseMean - defenseMean;

  // The fitted model is offenseValue = intercept + hfa + Offense[team] - Defense[opponent],
  // so Defense as fit is ALREADY higher-is-better (a stingier defense has a
  // larger Defense value, which subtracts more from the opponent's
  // predicted offense) — no sign flip needed, only the same centering
  // convention as Offense for a comparable scale.
  const teams: TeamStrength[] = teamIds.map((teamId) => ({
    teamExternalId: teamId,
    offense: leagueMean + (offense.get(teamId) ?? 0),
    defense: leagueMean + (defense.get(teamId) ?? 0),
    gamesCount: gamesCount.get(teamId) ?? 0,
  }));

  return { teams, leagueMean, method: "RIDGE" };
}
