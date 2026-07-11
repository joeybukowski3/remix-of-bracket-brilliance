/**
 * mlb-x-confirmation-snapshot.mjs
 *
 * The "focused confirmation refresh" the posting poll runs each attempt. It
 * fetches ONLY what X eligibility needs -- today's schedule (current listed
 * starters + game status) and each not-yet-started game's boxscore (official
 * batting order) -- and never regenerates model inputs or unrelated data.
 *
 * Source of truth:
 *   - official batting orders : StatsAPI game/{gamePk}/boxscore battingOrder
 *   - current starters        : StatsAPI schedule ...probablePitcher
 *   - game start / status     : StatsAPI schedule status + gameDate
 * Freshness: the snapshot is built live at attempt time; `asOf` records when.
 * Maximum acceptable data age: one poll interval (~15 min) -- each attempt
 * rebuilds it, so a post never runs against a snapshot older than its own run.
 * On any fetch/parse failure the snapshot is marked `ok:false` and callers
 * fail closed (treat everything as unconfirmed; never post).
 *
 * The per-row resolvers (resolveHrRowFacts / resolveKRowFacts /
 * resolveNumerologyFacts) are pure over a snapshot object and unit-tested
 * with canned data; buildConfirmationSnapshot is the thin fetch/compose layer.
 */

import { computeSlateTiming, isGameExcluded, isGameStarted } from "./mlb-x-slate-timing.mjs";
import {
  fetchBoxscore,
  fetchScheduleWithStarters,
  findConfirmedBatter,
  matchesCurrentStarter,
  normalizeBoxscoreLineup,
} from "./mlb-x-confirmation.mjs";

// StatsAPI abbreviation quirks vs. what generated data / the site may use.
const TEAM_ALIASES = new Map([
  ["ARI", "AZ"],
  ["CHW", "CWS"],
  ["SD", "SDP"],
  ["SF", "SFG"],
  ["TB", "TBR"],
  ["WSH", "WSN"],
  ["KC", "KCR"],
]);

function normAbbr(value) {
  const up = String(value ?? "").trim().toUpperCase();
  return TEAM_ALIASES.get(up) ?? up;
}

function abbrEq(a, b) {
  return normAbbr(a) === normAbbr(b);
}

/** Find the snapshot game (and which side the team is on) for a team abbreviation. */
export function findGameForTeam(snapshot, teamAbbr) {
  for (const game of snapshot?.games ?? []) {
    if (abbrEq(game.awayAbbr, teamAbbr)) return { game, side: "away" };
    if (abbrEq(game.homeAbbr, teamAbbr)) return { game, side: "home" };
  }
  return null;
}

function otherSide(side) {
  return side === "away" ? "home" : "away";
}

/**
 * HR facts: is the hitter's game started, and does the live boxscore confirm
 * the hitter in the batting order? Returns `liveConfirmed:false` only when we
 * positively have a confirmed lineup that does NOT contain the hitter (a
 * fail-closed veto); `null` means "no live signal -- defer to generated data".
 */
export function resolveHrRowFacts(snapshot, row) {
  const located = findGameForTeam(snapshot, row?.team);
  if (!located) return { gameStarted: false, liveConfirmed: null };
  const { game, side } = located;
  const lineup = game[`${side}Lineup`];
  if (!lineup?.confirmed) return { gameStarted: game.started, liveConfirmed: null };
  const match = findConfirmedBatter(lineup, { playerId: row?.playerId, playerName: row?.player });
  return { gameStarted: game.started, liveConfirmed: Boolean(match) };
}

/**
 * K facts: is the row's pitcher the current listed starter for that game, has
 * the game started, and is the OPPOSING batting order confirmed?
 */
export function resolveKRowFacts(snapshot, row) {
  const located = findGameForTeam(snapshot, row?.team);
  if (!located) {
    return { isCurrentStarter: false, gameStarted: false, opposingLineupConfirmed: false, gamePk: null, starterId: null };
  }
  const { game, side } = located;
  const starter = game[`${side}Starter`];
  const isCurrentStarter = matchesCurrentStarter({
    rowPitcher: row?.pitcher,
    rowPitcherId: row?.pitcherId,
    currentStarterName: starter?.name,
    currentStarterId: starter?.id,
  });
  const opposingLineup = game[`${otherSide(side)}Lineup`];
  return {
    isCurrentStarter,
    gameStarted: game.started,
    opposingLineupConfirmed: Boolean(opposingLineup?.confirmed),
    gamePk: game.gamePk ?? null,
    starterId: starter?.id ?? null,
  };
}

/** Numerology facts: works for hitter or pitcher plays keyed by the play's team. */
export function resolveNumerologyFacts(snapshot, play) {
  const located = findGameForTeam(snapshot, play?.team);
  if (!located) return { gameStarted: false, hitterLiveConfirmed: null, isCurrentStarter: false };
  const { game, side } = located;
  const lineup = game[`${side}Lineup`];
  const starter = game[`${side}Starter`];
  const hitterLiveConfirmed = lineup?.confirmed
    ? Boolean(findConfirmedBatter(lineup, { playerId: play?.playerId, playerName: play?.playerName }))
    : null;
  const isCurrentStarter = matchesCurrentStarter({
    rowPitcher: play?.playerName,
    rowPitcherId: play?.playerId,
    currentStarterName: starter?.name,
    currentStarterId: starter?.id,
  });
  return { gameStarted: game.started, hitterLiveConfirmed, isCurrentStarter };
}

/**
 * Build the live confirmation snapshot. Thin fetch/compose over the pure
 * timing + confirmation cores. `fetchImpl` is injectable for tests.
 */
export async function buildConfirmationSnapshot({ date, now = new Date(), fetchImpl = fetch } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const asOf = new Date(nowMs).toISOString();
  try {
    const schedule = await fetchScheduleWithStarters({ date, fetchImpl });
    const timing = computeSlateTiming({
      games: schedule.map((g) => ({ gameDate: g.gameDate, status: g.status })),
      now,
      slateDate: date,
    });

    const games = [];
    for (const g of schedule) {
      const started = isGameStarted({ gameDate: g.gameDate, status: g.status }, nowMs);
      const excluded = isGameExcluded({ status: g.status });
      let awayLineup = { confirmed: false, batters: [] };
      let homeLineup = { confirmed: false, batters: [] };
      if (!started && !excluded && g.gamePk != null) {
        try {
          const box = await fetchBoxscore({ gamePk: g.gamePk, fetchImpl });
          awayLineup = normalizeBoxscoreLineup(box?.teams?.away);
          homeLineup = normalizeBoxscoreLineup(box?.teams?.home);
        } catch {
          // A single boxscore failure just leaves that game's lineups
          // unconfirmed (fail closed for those rows), not the whole snapshot.
        }
      }
      games.push({
        gamePk: g.gamePk,
        gameDate: g.gameDate,
        started,
        excluded,
        awayAbbr: g.away.abbreviation,
        homeAbbr: g.home.abbreviation,
        awayStarter: g.away.starter,
        homeStarter: g.home.starter,
        awayLineup,
        homeLineup,
      });
    }

    return { ok: true, error: null, slateDate: date, asOf, timing, games };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      slateDate: date,
      asOf,
      timing: computeSlateTiming({ games: [], now, slateDate: date }),
      games: [],
    };
  }
}
