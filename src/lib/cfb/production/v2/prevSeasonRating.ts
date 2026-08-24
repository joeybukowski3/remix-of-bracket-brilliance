// CFB Model V2 — previous-season opponent-adjusted offense/defense (Phase 3
// §3, WU2 §6/§7). Frozen method, copied verbatim from
// src/lib/cfb/research/phase3/loadPreseasonInputs.ts's computePrevSeasonRatings
// doc comment: "the SAME Iterative recurrence as Phase 2 ... run on ONLY
// the prior season's own games ... strength=1.0, iterations=20 ... YPP+PPP
// ... standardized the same way Phase 2's compositeRating does."
//
// This is the Prior D "prevSeasonOffense"/"prevSeasonDefense" input —
// computed once per prior season from production's own cached CFBD data,
// never from data/cfb/research/**.

import { computeCfbV2IterativeAdjustment } from "./iterativeAdjustment";
import { fitStandardizer, applyStandardizer } from "./standardize";
import { buildV2Observations, type CfbV2MetricName, type CfbV2Observation } from "./ratingInputs";
import type { CfbNormalizedHistoricalGame, CfbTeamGamePerformance } from "../../pipeline/types";

/** Frozen prior-season Iterative config (Phase 3 §3 — "tuned" Phase 2 setting). Never retuned in production. */
export const CFB_V2_PREV_SEASON_RATING_CONFIG = Object.freeze({
  strength: 1.0,
  iterations: 20,
  minimumGames: 1,
  metrics: ["ypp", "ppp"] as const satisfies readonly CfbV2MetricName[],
});

export type CfbV2PrevSeasonRating = { teamId: string; offense: number; defense: number };

/**
 * Computes each team's standardized-and-averaged (YPP+PPP) prior-season
 * rating from that season's own completed FBS-vs-FBS games only — a fresh
 * single-season network, never pooled across seasons (Phase 3 §3).
 */
export function computeCfbV2PrevSeasonRatings(
  teamIds: readonly string[],
  performances: readonly CfbTeamGamePerformance[],
  games: readonly CfbNormalizedHistoricalGame[],
): Map<string, CfbV2PrevSeasonRating> {
  const metricResults = CFB_V2_PREV_SEASON_RATING_CONFIG.metrics.map((metric) => {
    const observations: CfbV2Observation[] = buildV2Observations(performances, games, metric);
    return computeCfbV2IterativeAdjustment(teamIds, observations, CFB_V2_PREV_SEASON_RATING_CONFIG);
  });

  const standardizeValues = (values: (number | null)[]) => {
    const std = fitStandardizer(values.filter((v): v is number => v !== null));
    return (v: number | null) => (v === null ? null : applyStandardizer(v, std));
  };

  const offenseStdFns = metricResults.map((r) => standardizeValues(r.teams.map((t) => t.offense)));
  const defenseStdFns = metricResults.map((r) => standardizeValues(r.teams.map((t) => t.defense)));

  const result = new Map<string, CfbV2PrevSeasonRating>();
  for (const teamId of teamIds) {
    const offenseParts: number[] = [];
    const defenseParts: number[] = [];
    metricResults.forEach((r, i) => {
      const team = r.teams.find((t) => t.teamId === teamId);
      const off = offenseStdFns[i](team?.offense ?? null);
      const def = defenseStdFns[i](team?.defense ?? null);
      if (off !== null) offenseParts.push(off);
      if (def !== null) defenseParts.push(def);
    });
    if (offenseParts.length === 0 || defenseParts.length === 0) continue;
    result.set(teamId, {
      teamId,
      offense: offenseParts.reduce((s, v) => s + v, 0) / offenseParts.length,
      defense: defenseParts.reduce((s, v) => s + v, 0) / defenseParts.length,
    });
  }
  return result;
}
