// CFB Model V2 — production SUCCESS derivation from raw current-season
// plays (WU5 §5/§6). Converts CFBD `/plays` rows into
// CfbV2TeamGameSuccessObservation[] using the exact frozen Phase 4/9
// definition: ppaSuccess = providerPpa > 0 (research/derived/successMetrics.ts
// §6 "jkbPpaSuccess", CFB_PHASE1_METRICS_CONFIG.ppaSuccessThreshold = 0).
// Zero runtime dependency on src/lib/cfb/research/** — parity with that
// definition is enforced by successDerivation.test.ts's test-only import.
//
// This module never computes downDistanceSuccess or any early/passing-down
// qualified variant — the frozen production scoring config's secondary
// block is the plain, unqualified SUCCESS feature only (see config.ts's
// CFB_V2_SCORING_CONFIG.secondaryBlock = ["SUCCESS"]).

import { getJkbTeamIdForCfbdName } from "@/data/cfb/externalTeamMapping";
import type { CfbV2TeamGameSuccessObservation } from "./successFeature";

/**
 * Minimal production-owned play shape (WU5 §4) — only the fields the
 * frozen SUCCESS definition actually needs. Deliberately excludes down/
 * distance/yardsGained: the frozen config never uses the down-distance-
 * qualified SUCCESS variant, and garbageTimeFilter is "NONE" so no
 * score/period/clock filtering fields are needed either.
 */
export type CfbV2RawPlay = {
  gameId: number;
  /** CFBD school name (e.g. "Alabama") — resolved to a JKB team id via getJkbTeamIdForCfbdName, the same mapping WU2's ratingInputs.ts already uses. */
  offense: string;
  defense: string;
  ppa: number | null;
};

/**
 * Derives one CfbV2TeamGameSuccessObservation per (team, game) — i.e. the
 * offense side's average ppaSuccess rate for that single game — matching
 * the exact granularity computeCfbV2TeamSuccessSoFar (successFeature.ts)
 * expects: it averages whatever per-game observations the caller passes
 * it, so cutoff filtering (which games are "before" the as-of point) must
 * happen in the CALLER, before this function is invoked (§7 — this module
 * has no season/week/cutoff awareness by design).
 *
 * Plays with a null `ppa` are excluded from both numerator and denominator
 * (never treated as a failure) — matches weightedRate's null-exclusion
 * behavior in research/derived/weightedStats.ts. Plays whose `offense`
 * name does not resolve to a known JKB team id are skipped rather than
 * fabricating an observation (mirrors ratingInputs.ts's own "skip rather
 * than fabricate" convention for unresolved opponents).
 */
export function deriveCfbV2SuccessObservations(plays: readonly CfbV2RawPlay[]): CfbV2TeamGameSuccessObservation[] {
  const byGameTeam = new Map<string, { teamId: string; successes: number; total: number }>();
  for (const play of plays) {
    if (play.ppa === null || play.ppa === undefined) continue;
    const teamId = getJkbTeamIdForCfbdName(play.offense);
    if (!teamId) continue;
    const key = `${play.gameId}:${teamId}`;
    const entry = byGameTeam.get(key) ?? { teamId, successes: 0, total: 0 };
    entry.successes += play.ppa > 0 ? 1 : 0;
    entry.total += 1;
    byGameTeam.set(key, entry);
  }

  const observations: CfbV2TeamGameSuccessObservation[] = [];
  for (const { teamId, successes, total } of byGameTeam.values()) {
    if (total === 0) continue;
    observations.push({ teamId, successRate: successes / total });
  }
  return observations;
}
