/**
 * Phase 9: live current-week candidate universe. Unlike
 * `playerGameUniverse.ts` (Phase 5.5), which is built FROM already-played
 * games' `stats_player_week` rows, a future/current week has no outcome
 * rows yet -- membership here comes entirely from the live weekly-rosters
 * "ACT" snapshot (the same source `playerGameUniverse.ts` uses as its own
 * Tier 2), joined to the target week's schedule.
 *
 * Rushing/receiving eligibility (Phase 9.2 hierarchy):
 * 1. **Primary -- sourced depth chart** (`currentWeekDepthChart.ts`): a
 *    player at RB with `depthRank <= RB_DEPTH_CHART_THRESHOLD`, or WR/TE
 *    with `depthRank <= RECEIVER_DEPTH_CHART_THRESHOLD`, enters on that
 *    evidence alone -- no historical volume required. This is how a
 *    legitimate rookie/new starter enters with zero prior NFL usage.
 * 2. **Secondary -- historical volume** (Phase 5.5's `isMarketPregameEligible`
 *    rule, unchanged): a player who cleared the prior-season/current-season
 *    activity threshold is eligible regardless of what the depth chart says
 *    (or whether it has data for them at all) -- an established veteran
 *    never disappears merely because a depth-chart source temporarily
 *    omits him.
 * 3. **Final fallback -- roster-scarcity floor** (Phase 9.1,
 *    `applyRoleScarcityFallback`): only reached when a team is STILL below
 *    the position floor after steps 1-2 combined.
 *
 * Passing candidacy is decided separately by `qbStarterResolution.ts`
 * (which implements its own depth-chart-first hierarchy), not by
 * `passingEligiblePregame` on this module's candidates (that flag stays
 * historical-volume-only and informational).
 */
import { normalizeNflPropTeamAbbr, resolveNflPropPlayerIdentity, type NflPropPosition } from "./types/identity";
import { gameJoinKey, type NflGameJoinRecord, type NflPropRawGameRecord } from "./historicalOutcomes";
import { isMarketPregameEligible, PRIOR_SEASON_ELIGIBILITY_THRESHOLD, UNIVERSE_POSITIONS } from "./playerGameUniverse";
import type { NflPlayerGameUniverseRow } from "./types/playerGameUniverse";
import { fallbackRoleEvidence, lookupDepthChartEntry, sourcedRoleEvidence, type NflDepthChartIndex, type NflRoleEvidence } from "./currentWeekDepthChart";

export type NflCurrentWeekRosterSourceRow = {
  season: number;
  week: number;
  team: string;
  gsisId: string;
  playerName: string;
  position: string;
  status: string;
};

export type NflCurrentWeekCandidate = {
  season: number;
  week: number;
  gameId: string;
  gameDateUtc: string;
  homeAway: "home" | "away";
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  position: NflPropPosition;
  /** EFFECTIVE eligibility (historical volume OR roster-scarcity-floor fallback -- see `applyRoleScarcityFallback`). */
  rushingEligiblePregame: boolean;
  receivingEligiblePregame: boolean;
  /** Historical-volume eligibility only (Phase 5.5 rule) -- informational; passing candidacy is decided by `qbStarterResolution.ts`, not this flag. */
  passingEligiblePregame: boolean;
  /** True only when admission rests on the roster-scarcity-floor tie-break (the weakest evidence tier) -- false for historical-volume OR sourced-depth-chart admits, both of which are real evidence. */
  rushingRoleUncertain: boolean;
  receivingRoleUncertain: boolean;
  /** Which evidence tier actually admitted this candidate for each market. Disclosed, never hidden. */
  rushingFallbackProvenance: "historicalVolume" | "depthChart" | "rosterScarcityFloor" | null;
  receivingFallbackProvenance: "historicalVolume" | "depthChart" | "rosterScarcityFloor" | null;
  rushingRoleEvidence: NflRoleEvidence | null;
  receivingRoleEvidence: NflRoleEvidence | null;
};

export type NflCurrentWeekUnresolvedRosterRow = {
  season: number;
  week: number;
  team: string;
  gsisId: string;
  playerName: string;
  reason: "missing-gsis-id" | "unsupported-position" | "invalid-name" | "unresolved-team" | "no-schedule-entry";
};

type ActivityLogEntry = { playerId: string; season: number; gameDateUtc: string; activityCount: number };

/** Activity log built from the historical (already-played) universe -- exactly the source `attachEligibility` uses, just built once and reused across a whole current-week run rather than per-row. */
export function buildActivityLogFromUniverse(
  rows: readonly NflPlayerGameUniverseRow[],
  statKey: "carries" | "targets" | "passAttempts",
): ActivityLogEntry[] {
  return rows
    .filter((r) => r.gameDateUtc != null && r.outcomes[statKey] != null)
    .map((r) => ({ playerId: r.playerId, season: r.season, gameDateUtc: r.gameDateUtc as string, activityCount: r.outcomes[statKey] as number }));
}

/**
 * Builds the live current-week candidate pool: every QB/RB/WR/TE with a
 * confirmed ACT roster status for the target (season, week), joined to that
 * week's schedule, with the three Phase 5.5 eligibility flags attached
 * using activity logs built from historical (strictly-prior) data only.
 * A roster row with no schedule entry (bye week, or a team code the
 * schedule join cannot resolve) is reported, never silently dropped.
 */
/**
 * Phase 9.2: minimum sourced depth-chart rank a player must hold to enter
 * the rushing/receiving candidate universe on depth evidence alone (no
 * historical volume required). Calibrated against the real 2026 Week 1
 * depth-chart snapshot (`docs/nfl-depth-chart-role-integration.md`):
 * every position has EXACTLY 32 rows at each rank through at least rank 4
 * (perfectly clean, one player per team per rank -- no ties/gaps observed),
 * so these thresholds admit a small, conservative, evidence-backed slice
 * per team, not the ~90-man camp roster. Never tuned against any
 * current/future-week outcome -- these are pregame roster-construction
 * priors only.
 */
export const RB_DEPTH_CHART_THRESHOLD = 3;
export const RECEIVER_DEPTH_CHART_THRESHOLD = 4;

export function buildCurrentWeekRosterUniverse(
  rosterRows: readonly NflCurrentWeekRosterSourceRow[],
  season: number,
  week: number,
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
  games: readonly NflPropRawGameRecord[],
  rushLog: readonly ActivityLogEntry[],
  targetLog: readonly ActivityLogEntry[],
  attemptLog: readonly ActivityLogEntry[],
  depthChartIndex: NflDepthChartIndex | null,
): { candidates: NflCurrentWeekCandidate[]; unresolved: NflCurrentWeekUnresolvedRosterRow[] } {
  const candidates: NflCurrentWeekCandidate[] = [];
  const unresolved: NflCurrentWeekUnresolvedRosterRow[] = [];
  const seen = new Set<string>();

  for (const row of rosterRows) {
    if (row.status !== "ACT" || row.season !== season || row.week !== week) continue;
    if (!UNIVERSE_POSITIONS.includes(row.position as NflPropPosition)) continue;

    const identity = resolveNflPropPlayerIdentity({ gsisId: row.gsisId, playerName: row.playerName, position: row.position });
    if (identity.resolved === false) {
      unresolved.push({ season, week, team: row.team, gsisId: row.gsisId, playerName: row.playerName, reason: identity.reason });
      continue;
    }

    const team = normalizeNflPropTeamAbbr(row.team);
    if (!team) {
      unresolved.push({ season, week, team: row.team, gsisId: row.gsisId, playerName: row.playerName, reason: "unresolved-team" });
      continue;
    }

    const dedupeKey = `${identity.identity.playerId}|${team}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const join = gameJoinIndex.get(gameJoinKey(season, week, team));
    if (!join) {
      // A team with no schedule entry this week (bye, or an unmapped team code) is not a candidate -- not a data failure, just no game to project.
      continue;
    }
    const game = games.find((g) => g.gameId === join.gameId);
    const opponent = game ? (join.homeAway === "home" ? normalizeNflPropTeamAbbr(game.awayAbbr) : normalizeNflPropTeamAbbr(game.homeAbbr)) : null;
    if (!opponent) {
      unresolved.push({ season, week, team: row.team, gsisId: row.gsisId, playerName: row.playerName, reason: "no-schedule-entry" });
      continue;
    }

    const playerId = identity.identity.playerId;
    const position = identity.identity.position as NflPropPosition;
    const historicalRushing = isMarketPregameEligible(rushLog, playerId, season, join.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.carries);
    const historicalReceiving = isMarketPregameEligible(targetLog, playerId, season, join.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.targets);

    const depthEntry = depthChartIndex ? lookupDepthChartEntry(depthChartIndex, team, position, playerId) : null;
    const depthAdmitsRushing = position === "RB" && depthEntry != null && depthEntry.depthRank <= RB_DEPTH_CHART_THRESHOLD;
    const depthAdmitsReceiving = (position === "WR" || position === "TE") && depthEntry != null && depthEntry.depthRank <= RECEIVER_DEPTH_CHART_THRESHOLD;

    // Evidence hierarchy: sourced depth chart is shown whenever available
    // (strongest signal), even for an already historically-eligible
    // veteran -- it is still real, current, corroborating evidence.
    // Provenance reflects what actually admitted the candidate.
    const rushingEligiblePregame = historicalRushing || depthAdmitsRushing;
    const receivingEligiblePregame = historicalReceiving || depthAdmitsReceiving;
    const rushingFallbackProvenance: NflCurrentWeekCandidate["rushingFallbackProvenance"] = !rushingEligiblePregame
      ? null : depthEntry != null ? "depthChart" : "historicalVolume";
    const receivingFallbackProvenance: NflCurrentWeekCandidate["receivingFallbackProvenance"] = !receivingEligiblePregame
      ? null : depthEntry != null ? "depthChart" : "historicalVolume";
    const rushingRoleEvidence = !rushingEligiblePregame ? null
      : depthEntry != null ? sourcedRoleEvidence(depthEntry)
      : fallbackRoleEvidence("historicalVolume", "Cleared the historical prior-season/current-season carry-volume threshold.");
    const receivingRoleEvidence = !receivingEligiblePregame ? null
      : depthEntry != null ? sourcedRoleEvidence(depthEntry)
      : fallbackRoleEvidence("historicalVolume", "Cleared the historical prior-season/current-season target-volume threshold.");

    candidates.push({
      season, week, gameId: join.gameId, gameDateUtc: join.gameDateUtc, homeAway: join.homeAway,
      playerId, playerName: identity.identity.playerName, team, opponent, position,
      rushingEligiblePregame, receivingEligiblePregame,
      passingEligiblePregame: position === "QB" && isMarketPregameEligible(attemptLog, playerId, season, join.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.passAttempts),
      rushingRoleUncertain: false, receivingRoleUncertain: false,
      rushingFallbackProvenance, receivingFallbackProvenance, rushingRoleEvidence, receivingRoleEvidence,
    });
  }

  return { candidates: applyRoleScarcityFallback(candidates), unresolved };
}

/**
 * Phase 9.1: closes the "legitimate no-history player disappears" gap for
 * rushing/receiving. Historical-volume eligibility (Phase 5.5) remains the
 * PRIMARY path and is left untouched -- this is a strictly ADDITIVE,
 * per-team, per-position floor: if a team has fewer than `RB_FLOOR`
 * historically-eligible RBs (or fewer than `RECEIVER_FLOOR` historically-
 * eligible WR/TE), admit additional ACT candidates at that position/team,
 * up to the floor, using a deterministic (not depth-chart-informed)
 * tie-break -- this repository has no depth-chart-order or snap-share
 * source (verified: `weekly_rosters`' `depth_chart_position` equals the
 * position group for every player, carrying no ordinal information), so
 * WHICH specific no-history player fills the floor is disclosed as
 * `roleUncertain: true` / `fallbackProvenance: "rosterScarcityFloor"`
 * rather than presented as a confident individual pick. This deliberately
 * does NOT admit every ACT player (which would flood the artifact with
 * players who will not make the eventual 53-man roster -- the live
 * `weekly_rosters` snapshot observed this phase carries ~90 ACT players per
 * team, a pre-cutdown camp roster, not a final 53).
 */
export const RB_ELIGIBLE_FLOOR = 2;
export const RECEIVER_ELIGIBLE_FLOOR = 3;

export function applyRoleScarcityFallback(candidates: readonly NflCurrentWeekCandidate[]): NflCurrentWeekCandidate[] {
  const byTeam = new Map<string, NflCurrentWeekCandidate[]>();
  for (const c of candidates) {
    const list = byTeam.get(c.team) ?? [];
    list.push(c);
    byTeam.set(c.team, list);
  }

  const admittedRushing = new Set<string>();
  const admittedReceiving = new Set<string>();
  for (const [, list] of byTeam) {
    const rbEligibleCount = list.filter((c) => c.position === "RB" && c.rushingEligiblePregame).length;
    if (rbEligibleCount < RB_ELIGIBLE_FLOOR) {
      const shortfall = RB_ELIGIBLE_FLOOR - rbEligibleCount;
      const candidatesForFloor = list.filter((c) => c.position === "RB" && !c.rushingEligiblePregame).sort((a, b) => a.playerId.localeCompare(b.playerId));
      for (const c of candidatesForFloor.slice(0, shortfall)) admittedRushing.add(`${c.team}|${c.playerId}`);
    }
    const receiverEligibleCount = list.filter((c) => (c.position === "WR" || c.position === "TE") && c.receivingEligiblePregame).length;
    if (receiverEligibleCount < RECEIVER_ELIGIBLE_FLOOR) {
      const shortfall = RECEIVER_ELIGIBLE_FLOOR - receiverEligibleCount;
      const candidatesForFloor = list.filter((c) => (c.position === "WR" || c.position === "TE") && !c.receivingEligiblePregame).sort((a, b) => a.playerId.localeCompare(b.playerId));
      for (const c of candidatesForFloor.slice(0, shortfall)) admittedReceiving.add(`${c.team}|${c.playerId}`);
    }
  }

  return candidates.map((c) => {
    const key = `${c.team}|${c.playerId}`;
    const rushingAdmitted = admittedRushing.has(key);
    const receivingAdmitted = admittedReceiving.has(key);
    if (!rushingAdmitted && !receivingAdmitted) return c;
    return {
      ...c,
      rushingEligiblePregame: c.rushingEligiblePregame || rushingAdmitted,
      receivingEligiblePregame: c.receivingEligiblePregame || receivingAdmitted,
      rushingRoleUncertain: rushingAdmitted,
      receivingRoleUncertain: receivingAdmitted,
      rushingFallbackProvenance: rushingAdmitted ? "rosterScarcityFloor" : c.rushingFallbackProvenance,
      receivingFallbackProvenance: receivingAdmitted ? "rosterScarcityFloor" : c.receivingFallbackProvenance,
      rushingRoleEvidence: rushingAdmitted ? fallbackRoleEvidence("rosterScarcityFloor", `Admitted via the roster-scarcity floor (team had fewer than ${RB_ELIGIBLE_FLOOR} historically/depth-eligible RBs) -- a deterministic tie-break among equally-unknown roster candidates, not a depth-chart-informed pick.`) : c.rushingRoleEvidence,
      receivingRoleEvidence: receivingAdmitted ? fallbackRoleEvidence("rosterScarcityFloor", `Admitted via the roster-scarcity floor (team had fewer than ${RECEIVER_ELIGIBLE_FLOOR} historically/depth-eligible WR/TE) -- a deterministic tie-break among equally-unknown roster candidates, not a depth-chart-informed pick.`) : c.receivingRoleEvidence,
    };
  });
}
