// CFB Model V2 — production SUCCESS block (own SUCCESS / opponent SUCCESS
// allowed), WU3 §8/§28. Zero runtime dependency on src/lib/cfb/research/**.
//
// CARRIED-FORWARD LIMITATION (documented, not silently absorbed): the
// production CFBD refresh pipeline does not yet fetch current-season
// `/plays` data, which is Phase 4/9's own source for
// teamSuccessRate/opponentSuccessRateAllowed (per-play PPA success rate).
// This module's job is therefore currently limited to expressing the
// EXACT validated preseason/zero-games behavior: with zero current-season
// team-games behind a team, its SUCCESS is unavailable — never a
// fabricated/synthetic value (§28). This mirrors
// research/phase4/phase4WalkForwardCore.ts's own `teamPaceAndSecondaryAverages`
// (a team with no completed current-season games so far has no entry in
// that map, so `.get(teamId) ?? null` resolves to null) and
// scripts/cfb-v2-support-export.ts's `teamSuccessSoFar` (same "no games
// yet -> not in the map -> null" behavior) — i.e. THIS is Phase 9's own
// validated preseason fallback: null, causing predictScore to correctly
// return null (§23 "missing SUCCESS where required" -> unavailable, not a
// fabricated projection). General `/plays` ingestion is out of WU3's
// narrow scope; a future work unit must wire it before SUCCESS becomes
// available mid-season.

export type CfbV2TeamGameSuccessObservation = {
  teamId: string;
  /** Per-play PPA success rate for this team in this completed current-season game — the exact Phase 4/9 definition. */
  successRate: number;
};

/**
 * Own-team cumulative SUCCESS so far this season, from already-completed
 * current-season team-game observations (§11/§28 — the API shape a future
 * `/plays`-fed refresh can populate; currently always called with an empty
 * array during the 2026 preseason, since there are zero completed games).
 */
export function computeCfbV2TeamSuccessSoFar(observations: readonly CfbV2TeamGameSuccessObservation[]): ReadonlyMap<string, number> {
  const byTeam = new Map<string, number[]>();
  for (const obs of observations) {
    const arr = byTeam.get(obs.teamId) ?? [];
    arr.push(obs.successRate);
    byTeam.set(obs.teamId, arr);
  }
  const result = new Map<string, number>();
  for (const [teamId, rates] of byTeam) result.set(teamId, rates.reduce((s, v) => s + v, 0) / rates.length);
  return result;
}
