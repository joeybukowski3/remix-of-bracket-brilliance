// CFB Model V2 — iterative opponent adjustment for the PRIOR-SEASON rating
// input (Phase 10 §6, WU2 §6/§7). Faithful port of
// src/lib/cfb/research/phase2/iterativeAdjustment.ts, used ONLY to compute
// `prevSeasonOffense`/`prevSeasonDefense` (Phase 3 §3's frozen method:
// YPP+PPP, gameWeighted, no garbage-time filter, strength=1.0,
// iterations=20 — see prevSeasonRatingConfig.ts). This is a DIFFERENT
// algorithm from the current-season Ridge network (ridge.ts) — the prior
// season's own single-season network is deliberately never pooled with any
// other season (Phase 3 §3).

import { weightedMean } from "./weightedStats";
import type { CfbV2Observation } from "./ratingInputs";
import { isFbsVsFbsObservation } from "./ratingInputs";
import type { CfbV2RidgeResult, CfbV2TeamStrength } from "./ridge";

export type CfbV2IterativeConfig = { strength: number; iterations: number; minimumGames: number };

export function computeCfbV2IterativeAdjustment(teamIds: readonly string[], observations: readonly CfbV2Observation[], config: CfbV2IterativeConfig): CfbV2RidgeResult {
  const eligible = observations.filter((row) => isFbsVsFbsObservation(row) && row.offenseValue !== null && row.defenseAllowedValue !== null);
  const { mean: leagueMean } = weightedMean(eligible.map((row) => ({ value: row.offenseValue, weight: row.weight })));
  if (leagueMean === null) {
    return { teams: teamIds.map((teamId) => ({ teamId, offense: null, defense: null, gamesCount: 0 })), leagueMean: null };
  }

  const byTeam = new Map<string, CfbV2Observation[]>();
  for (const row of eligible) {
    const rows = byTeam.get(row.teamId) ?? [];
    rows.push(row);
    byTeam.set(row.teamId, rows);
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
        value: (row.offenseValue as number) - leagueMean + config.strength * (defenseStrength.get(row.opponentTeamId) ?? 0),
        weight: row.weight,
      }));
      const defenseValues = rows.map((row) => ({
        value: leagueMean - (row.defenseAllowedValue as number) + config.strength * (offenseStrength.get(row.opponentTeamId) ?? 0),
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

  const teams: CfbV2TeamStrength[] = teamIds.map((teamId) => {
    const gamesCount = byTeam.get(teamId)?.length ?? 0;
    if (gamesCount < config.minimumGames) return { teamId, offense: null, defense: null, gamesCount };
    return {
      teamId,
      offense: leagueMean + (offenseStrength.get(teamId) ?? 0),
      defense: leagueMean + (defenseStrength.get(teamId) ?? 0),
      gamesCount,
    };
  });

  return { teams, leagueMean };
}
