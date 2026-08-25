/**
 * Phase 9: live current-week candidate universe. Unlike
 * `playerGameUniverse.ts` (Phase 5.5), which is built FROM already-played
 * games' `stats_player_week` rows, a future/current week has no outcome
 * rows yet -- membership here comes entirely from the live weekly-rosters
 * "ACT" snapshot (the same source `playerGameUniverse.ts` uses as its own
 * Tier 2), joined to the target week's schedule. Eligibility PRIMARILY
 * reuses the exact Phase 5.5 rule (`isMarketPregameEligible`) against an
 * activity log built from historical outcome rows, plus (Phase 9.1) an
 * additive roster-scarcity-floor fallback -- see `applyRoleScarcityFallback`
 * -- so a legitimate rookie/new-starter with zero qualifying prior-season
 * volume is not unconditionally invisible. Passing candidacy is decided
 * separately by `qbStarterResolution.ts`, not by `passingEligiblePregame`
 * on this module's candidates (that flag is historical-volume-only and
 * informational).
 */
import { normalizeNflPropTeamAbbr, resolveNflPropPlayerIdentity, type NflPropPosition } from "./types/identity";
import { gameJoinKey, type NflGameJoinRecord, type NflPropRawGameRecord } from "./historicalOutcomes";
import { isMarketPregameEligible, PRIOR_SEASON_ELIGIBILITY_THRESHOLD, UNIVERSE_POSITIONS } from "./playerGameUniverse";
import type { NflPlayerGameUniverseRow } from "./types/playerGameUniverse";

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
  /** True iff `rushingEligiblePregame`/`receivingEligiblePregame` is true ONLY because of the roster-scarcity-floor fallback, not historical volume. */
  rushingRoleUncertain: boolean;
  receivingRoleUncertain: boolean;
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
export function buildCurrentWeekRosterUniverse(
  rosterRows: readonly NflCurrentWeekRosterSourceRow[],
  season: number,
  week: number,
  gameJoinIndex: ReadonlyMap<string, NflGameJoinRecord>,
  games: readonly NflPropRawGameRecord[],
  rushLog: readonly ActivityLogEntry[],
  targetLog: readonly ActivityLogEntry[],
  attemptLog: readonly ActivityLogEntry[],
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
    const rushingEligiblePregame = isMarketPregameEligible(rushLog, playerId, season, join.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.carries);
    const receivingEligiblePregame = isMarketPregameEligible(targetLog, playerId, season, join.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.targets);
    candidates.push({
      season, week, gameId: join.gameId, gameDateUtc: join.gameDateUtc, homeAway: join.homeAway,
      playerId, playerName: identity.identity.playerName, team, opponent, position: identity.identity.position as NflPropPosition,
      rushingEligiblePregame, receivingEligiblePregame,
      passingEligiblePregame: identity.identity.position === "QB" && isMarketPregameEligible(attemptLog, playerId, season, join.gameDateUtc, PRIOR_SEASON_ELIGIBILITY_THRESHOLD.passAttempts),
      rushingRoleUncertain: false, receivingRoleUncertain: false,
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
    };
  });
}
