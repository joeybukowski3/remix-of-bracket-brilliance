// CFB Model V2 — Ridge opponent adjustment (Phase 10 §5/§10, WU2 §10/§12).
// Faithful port of src/lib/cfb/research/phase2/ridgeAdjustment.ts (plain
// Ridge) and src/lib/cfb/research/phase8/ridgeWithPerTeamLambda.ts
// (per-team-λ, prior-centered Ridge). See ridge.test.ts for numerical
// parity against the research originals (test-only import).

import { solveLinearSystem } from "./linearSolver";
import type { CfbV2Observation } from "./ratingInputs";
import { isFbsVsFbsObservation } from "./ratingInputs";

export type CfbV2TeamStrength = {
  teamId: string;
  offense: number | null;
  defense: number | null; // higher = better (already sign-flipped from "allowed")
  gamesCount: number;
};

export type CfbV2RidgeResult = {
  teams: CfbV2TeamStrength[];
  leagueMean: number | null;
};

/**
 * Method B — weighted ridge regression:
 *   offenseValue = intercept + hfa*homeIndicator + Offense[team] - Defense[opponent] + error
 * A single scalar λ (no prior centering) — used only to establish a raw
 * reference scale for standardization (§12/candidateRatings.ts), never as
 * the final production rating itself.
 */
export function computeCfbV2Ridge(teamIds: readonly string[], observations: readonly CfbV2Observation[], lambda: number, includeHfa: boolean): CfbV2RidgeResult {
  const eligible = observations.filter((row) => isFbsVsFbsObservation(row) && row.offenseValue !== null && row.defenseAllowedValue !== null);
  if (eligible.length === 0 || teamIds.length === 0) {
    return { teams: teamIds.map((teamId) => ({ teamId, offense: null, defense: null, gamesCount: 0 })), leagueMean: null };
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
    const teamIdx = teamIndex.get(row.teamId);
    const oppIdx = teamIndex.get(row.opponentTeamId);
    if (teamIdx === undefined || oppIdx === undefined) continue;
    gamesCount.set(row.teamId, (gamesCount.get(row.teamId) ?? 0) + 1);

    const hfaValue = includeHfa ? (row.isNeutral ? 0 : row.isHome ? 1 : -1) : 0;
    const xIndices = [0, 1, offenseOffset + teamIdx, defenseOffset + oppIdx];
    const xValues = [1, hfaValue, 1, -1];
    const w = row.weight > 0 ? row.weight : 1;
    const y = row.offenseValue as number;

    for (let i = 0; i < xIndices.length; i += 1) {
      atb[xIndices[i]] += w * xValues[i] * y;
      for (let j = 0; j < xIndices.length; j += 1) ata[xIndices[i]][xIndices[j]] += w * xValues[i] * xValues[j];
    }
  }

  for (let i = offenseOffset; i < nParams; i += 1) ata[i][i] += lambda;

  return finishRidge(teamIds, nTeams, offenseOffset, defenseOffset, ata, atb, gamesCount);
}

/**
 * Section 5/8 — same prior-centered Ridge, generalized to a PER-TEAM
 * penalty λ_i. λ_i lets the connectivity-aware multiplier
 * (connectivity.ts) shrink individual teams' ratings toward their prior
 * more or less aggressively than the shared baseline.
 */
export function computeCfbV2RidgeWithPerTeamLambda(
  teamIds: readonly string[],
  observations: readonly CfbV2Observation[],
  lambdaByTeam: ReadonlyMap<string, number>,
  includeHfa: boolean,
  priorOffenseByTeam: ReadonlyMap<string, number>,
  priorDefenseByTeam: ReadonlyMap<string, number>,
): CfbV2RidgeResult {
  const eligible = observations.filter((row) => isFbsVsFbsObservation(row) && row.offenseValue !== null && row.defenseAllowedValue !== null);
  if (eligible.length === 0 || teamIds.length === 0) {
    return { teams: teamIds.map((teamId) => ({ teamId, offense: null, defense: null, gamesCount: 0 })), leagueMean: null };
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
    const teamIdx = teamIndex.get(row.teamId);
    const oppIdx = teamIndex.get(row.opponentTeamId);
    if (teamIdx === undefined || oppIdx === undefined) continue;
    gamesCount.set(row.teamId, (gamesCount.get(row.teamId) ?? 0) + 1);

    const hfaValue = includeHfa ? (row.isNeutral ? 0 : row.isHome ? 1 : -1) : 0;
    const xIndices = [0, 1, offenseOffset + teamIdx, defenseOffset + oppIdx];
    const xValues = [1, hfaValue, 1, -1];
    const w = row.weight > 0 ? row.weight : 1;
    const y = row.offenseValue as number;

    for (let i = 0; i < xIndices.length; i += 1) {
      atb[xIndices[i]] += w * xValues[i] * y;
      for (let j = 0; j < xIndices.length; j += 1) ata[xIndices[i]][xIndices[j]] += w * xValues[i] * xValues[j];
    }
  }

  const defaultLambda = [...lambdaByTeam.values()].reduce((s, v) => s + v, 0) / Math.max(lambdaByTeam.size, 1) || 1;
  for (let i = 0; i < nTeams; i += 1) {
    const teamId = teamIds[i];
    const lambda = lambdaByTeam.get(teamId) ?? defaultLambda;
    ata[offenseOffset + i][offenseOffset + i] += lambda;
    atb[offenseOffset + i] += lambda * (priorOffenseByTeam.get(teamId) ?? 0);
    ata[defenseOffset + i][defenseOffset + i] += lambda;
    atb[defenseOffset + i] += lambda * (priorDefenseByTeam.get(teamId) ?? 0);
  }

  return finishRidge(teamIds, nTeams, offenseOffset, defenseOffset, ata, atb, gamesCount);
}

/**
 * Shared solve + centering step (§12 identifiability): Offense/Defense are
 * only identified up to a constant, so they're post-hoc mean-centered and
 * the constant folded back into leagueMean — never left uncentered, and
 * never re-scaled beyond this centering.
 */
function finishRidge(
  teamIds: readonly string[],
  nTeams: number,
  offenseOffset: number,
  defenseOffset: number,
  ata: number[][],
  atb: number[],
  gamesCount: ReadonlyMap<string, number>,
): CfbV2RidgeResult {
  const beta = solveLinearSystem(ata, atb);
  const intercept = beta[0];
  let offense = new Map(teamIds.map((id, i) => [id, beta[offenseOffset + i]]));
  let defense = new Map(teamIds.map((id, i) => [id, beta[defenseOffset + i]]));

  const offenseMean = [...offense.values()].reduce((s, v) => s + v, 0) / nTeams;
  const defenseMean = [...defense.values()].reduce((s, v) => s + v, 0) / nTeams;
  offense = new Map([...offense].map(([id, v]) => [id, v - offenseMean]));
  defense = new Map([...defense].map(([id, v]) => [id, v - defenseMean]));
  const leagueMean = intercept + offenseMean - defenseMean;

  const teams: CfbV2TeamStrength[] = teamIds.map((teamId) => ({
    teamId,
    offense: leagueMean + (offense.get(teamId) ?? 0),
    defense: leagueMean + (defense.get(teamId) ?? 0),
    gamesCount: gamesCount.get(teamId) ?? 0,
  }));

  return { teams, leagueMean };
}
