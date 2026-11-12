/**
 * Calendar-aware NFL current-week resolution for the data pipelines.
 *
 * The status rule ("earliest week that still has a `scheduled` game") is
 * correct while upstream results land on time, but it has a failure mode: if
 * the results refresh stops publishing, finished games stay `scheduled`
 * forever and every downstream job stays pinned to a week that ended days ago
 * (2026-11-12: Week 9 games stuck as `scheduled` pinned yardage projections,
 * fantasy-points-allowed, TDs allowed, DFS and TD preview to Week 9 during
 * Week 10).
 *
 * This resolver keeps the status rule as the primary signal and adds a
 * calendar guard: a `scheduled` game whose kickoff is more than
 * OVERDUE_GRACE_MS in the past is "overdue" -- it cannot really still be
 * pending, so it must not hold the week. When every scheduled game of the
 * status-derived week is overdue, the resolver advances to the first week
 * that still has a genuinely pending game, and says so (`source:
 * "calendar-fallback"`, with the overdue games listed) so the caller can raise
 * a visible warning instead of silently publishing.
 *
 * Everything is UTC instant arithmetic, so DST changes cannot shift a
 * turnover. The fallback agrees with the website's own Eastern-calendar rule
 * (src/lib/nfl/weekSelection.ts) at midday ET; see the parity test.
 */

/** A real game cannot run this long past kickoff, even with long weather delays. */
export const OVERDUE_GRACE_MS = 12 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

function ownKickoffMs(game) {
  const ms = game?.dateUtc ? Date.parse(game.dateUtc) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Returns `kickoff(game) -> ms | null`. A game with no kickoff time (nflverse
 * leaves `gametime` blank for TBD slots, so `dateUtc` is null) takes the latest
 * dated kickoff of its own week as an upper bound, so it can never pin a week
 * forever. A week with no dated games at all stays undatable (null = pending).
 */
export function kickoffResolver(games) {
  const latestByWeek = new Map();
  for (const game of Array.isArray(games) ? games : []) {
    const ms = ownKickoffMs(game);
    if (ms != null) latestByWeek.set(game.week, Math.max(latestByWeek.get(game.week) ?? -Infinity, ms));
  }
  return (game) => ownKickoffMs(game) ?? latestByWeek.get(game?.week) ?? null;
}

function isOverdue(game, nowMs, graceMs, kickoff) {
  const ms = kickoff(game);
  return ms != null && ms + graceMs <= nowMs;
}

function describeOverdue(game, nowMs, graceMs, kickoff) {
  const ms = kickoff(game);
  return {
    gameId: game.gameId ?? null,
    week: game.week,
    dateUtc: game.dateUtc ?? new Date(ms).toISOString(),
    hoursOverdue: Number(((nowMs - (ms + graceMs)) / HOUR_MS).toFixed(1)),
  };
}

/**
 * @param {readonly {gameId?:string, week:number, dateUtc?:string, status:string}[]} games
 * @param {{ now?: Date, graceMs?: number }} [options]
 * @returns {{
 *   week: number|null,
 *   source: "status"|"calendar-fallback"|"unavailable",
 *   statusWeek: number|null,
 *   overdueGames: {gameId:string|null, week:number, dateUtc:string, hoursOverdue:number}[],
 *   reason: string
 * }}
 */
export function resolveCurrentWeekDetailed(games, { now = new Date(), graceMs = OVERDUE_GRACE_MS } = {}) {
  const nowMs = now.getTime();
  const scheduled = (Array.isArray(games) ? games : []).filter((g) => g.status === "scheduled" && Number.isFinite(g.week));
  if (scheduled.length === 0) {
    return { week: null, source: "unavailable", statusWeek: null, overdueGames: [], reason: "no scheduled (not-yet-final) game in the schedule" };
  }

  const kickoff = kickoffResolver(games);
  const overdue = scheduled.filter((g) => isOverdue(g, nowMs, graceMs, kickoff));
  const overdueGames = overdue
    .map((g) => describeOverdue(g, nowMs, graceMs, kickoff))
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc) || String(a.gameId).localeCompare(String(b.gameId)));
  const pending = scheduled.filter((g) => !isOverdue(g, nowMs, graceMs, kickoff));
  const statusWeek = Math.min(...scheduled.map((g) => g.week));

  if (pending.length === 0) {
    return {
      week: null,
      source: "unavailable",
      statusWeek,
      overdueGames,
      reason: `every remaining scheduled game is overdue (${overdueGames.length} games past kickoff + ${graceMs / HOUR_MS}h) -- the schedule/results data is stale or the season is over`,
    };
  }

  const pendingInStatusWeek = pending.some((g) => g.week === statusWeek);
  if (pendingInStatusWeek) {
    return { week: statusWeek, source: "status", statusWeek, overdueGames, reason: "earliest week with a scheduled game that has not passed its kickoff window" };
  }

  const week = Math.min(...pending.map((g) => g.week));
  return {
    week,
    source: "calendar-fallback",
    statusWeek,
    overdueGames,
    reason: `week ${statusWeek} has ${overdueGames.filter((g) => g.week === statusWeek).length} games still marked scheduled but all are overdue (kickoff + ${graceMs / HOUR_MS}h in the past); results data is stale -- advanced to week ${week}`,
  };
}

/** `key=value` lines for `>> $GITHUB_OUTPUT`. season/week stay first so existing consumers are unaffected. */
export function formatCurrentWeekOutput(season, result) {
  return [
    `season=${season}`,
    `week=${result.week}`,
    `week_source=${result.source}`,
    `status_week=${result.statusWeek ?? ""}`,
    `overdue_games=${result.overdueGames.length}`,
  ];
}
