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
  isDoubleheaderCode,
  matchesCurrentStarter,
  normalizeBoxscoreLineup,
} from "./mlb-x-confirmation.mjs";

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

/**
 * Find the snapshot game (and which side the team is on) for a team
 * abbreviation, optionally narrowed by opponent abbreviation.
 *
 * On a doubleheader the same team appears in TWO snapshot games (same two
 * abbreviations, different gamePk), so a team-only lookup is ambiguous.
 * Passing `opponentAbbr` narrows to games where the other side also matches,
 * which resolves the normal case (one game) and the doubleheader case down
 * to its two legs -- but a team+opponent pair still can't tell leg 1 from
 * leg 2 (both share team/opponent), so if more than one game still matches
 * after narrowing, this returns `null` (fail closed) rather than guessing
 * via first-match. Callers that also have a reliable `gamePk` should use
 * `findGameById` first and only fall back to this for legs it can't tell
 * apart, which is a defer to "no live signal" the same way an unknown team
 * already does.
 */
export function findGameForTeam(snapshot, teamAbbr, { opponentAbbr = null } = {}) {
  const matches = [];
  for (const game of snapshot?.games ?? []) {
    if (abbrEq(game.awayAbbr, teamAbbr)) {
      if (opponentAbbr == null || abbrEq(game.homeAbbr, opponentAbbr)) matches.push({ game, side: "away" });
      continue;
    }
    if (abbrEq(game.homeAbbr, teamAbbr)) {
      if (opponentAbbr == null || abbrEq(game.awayAbbr, opponentAbbr)) matches.push({ game, side: "home" });
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

/** Find the snapshot game (and which side `teamAbbr` is on) by exact gamePk -- the preferred, unambiguous lookup when a row already carries one. */
export function findGameById(snapshot, gamePk, teamAbbr) {
  const pk = toFiniteNumber(gamePk);
  if (pk == null) return null;
  for (const game of snapshot?.games ?? []) {
    if (toFiniteNumber(game.gamePk) !== pk) continue;
    if (abbrEq(game.awayAbbr, teamAbbr)) return { game, side: "away" };
    if (abbrEq(game.homeAbbr, teamAbbr)) return { game, side: "home" };
    return null;
  }
  return null;
}

/** Resolve a row's snapshot game: prefer an exact `gameId`/gamePk match, else fall back to team(+opponent) lookup. Fails closed (null) on ambiguity. */
function locateRowGame(snapshot, { team, opponent, gameId } = {}) {
  const byId = findGameById(snapshot, gameId, team);
  if (byId) return byId;
  return findGameForTeam(snapshot, team, { opponentAbbr: opponent });
}

function otherSide(side) {
  return side === "away" ? "home" : "away";
}

function emptyGameContext() {
  return { gamePk: null, gameNumber: null, gameDate: null, isDoubleheader: false };
}

function gameContext(game) {
  return {
    gamePk: game.gamePk ?? null,
    gameNumber: game.gameNumber ?? null,
    gameDate: game.gameDate ?? null,
    isDoubleheader: Boolean(game.isDoubleheader),
  };
}

/**
 * HR facts: is the hitter's game started, and does the live boxscore confirm
 * the hitter in the batting order? Returns `liveConfirmed:false` only when we
 * positively have a confirmed lineup that does NOT contain the hitter (a
 * fail-closed veto); `null` means "no live signal -- defer to generated data".
 */
export function resolveHrRowFacts(snapshot, row) {
  const located = locateRowGame(snapshot, { team: row?.team, opponent: row?.opponent, gameId: row?.gameId });
  if (!located) return { gameStarted: false, liveConfirmed: null, ...emptyGameContext() };
  const { game, side } = located;
  const lineup = game[`${side}Lineup`];
  if (!lineup?.confirmed) return { gameStarted: game.started, liveConfirmed: null, ...gameContext(game) };
  const match = findConfirmedBatter(lineup, { playerId: row?.playerId, playerName: row?.player });
  return { gameStarted: game.started, liveConfirmed: Boolean(match), ...gameContext(game) };
}

/**
 * K facts: is the row's pitcher the current listed starter for that game, has
 * the game started, and is the OPPOSING batting order confirmed?
 */
export function resolveKRowFacts(snapshot, row) {
  const located = locateRowGame(snapshot, { team: row?.team, opponent: row?.opponent, gameId: row?.gameId });
  if (!located) {
    return {
      isCurrentStarter: false,
      gameStarted: false,
      opposingLineupConfirmed: false,
      starterId: null,
      ...emptyGameContext(),
    };
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
    starterId: starter?.id ?? null,
    ...gameContext(game),
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
 *
 * `computeTiming` defaults to the HR/K window (computeSlateTiming) so every
 * existing caller is unaffected; Numerology's poll gate passes
 * computeNumerologySlateTiming to get the first-pitch-relative 120/75/30
 * window instead, without duplicating the fetch/compose logic here.
 */
export async function buildConfirmationSnapshot({ date, now = new Date(), fetchImpl = fetch, computeTiming = computeSlateTiming } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const asOf = new Date(nowMs).toISOString();
  try {
    const schedule = await fetchScheduleWithStarters({ date, fetchImpl });
    const timing = computeTiming({
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
        gameNumber: g.gameNumber ?? null,
        doubleHeader: g.doubleHeader ?? null,
        isDoubleheader: isDoubleheaderCode(g.doubleHeader),
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
      timing: computeTiming({ games: [], now, slateDate: date }),
      games: [],
    };
  }
}
