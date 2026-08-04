/**
 * Exact-ID join of injury status, roster/reserve state and snap participation.
 *
 * The join path is:
 *
 *   injuries.gsis_id -> weekly_rosters.gsis_id -> weekly_rosters.pfr_id
 *                    -> snap_counts.pfr_player_id
 *
 * Player-name matching is never used, in any direction, for any fallback. Names
 * are carried for display only. A player whose gsis_id does not resolve to a
 * pfr_id keeps his injury record in full and reports null snap shares — an
 * unresolved join is surfaced as missing data, never papered over with a guess.
 * Measured 2025 resolution was 99.74% (15 of 5,783 regular-season rows
 * unresolved, all fringe players with no Pro-Football-Reference page).
 */

import { GAME_STATUS, RESERVE_STATUS } from "./nfl-injury-sources.mjs";
import { aggregateSeasonSnaps, lastGameSnapPct } from "./nfl-snap-denominator.mjs";

/**
 * Minimum offensive/defensive snap share for a RESERVE player to appear.
 *
 * Reserve lists carry long-term absences that include genuine starters and a
 * long tail of fringe roster churn. Players with an active game designation
 * (OUT/DOUBTFUL/QUESTIONABLE) are always shown, because the team itself judged
 * them worth listing this week; reserve players need evidence they materially
 * play. Tuned against the full 2025 Week 12 slate — see the redesign spec for
 * the threshold comparison.
 *
 * Special-teams share is deliberately not part of this test.
 */
export const RESERVE_RELEVANCE_MIN_SNAP_PCT = 25;

/** Depth-chart positions that carry starter relevance regardless of snaps. */
const STATUS_SORT_ORDER = new Map([
  [GAME_STATUS.OUT, 0],
  [GAME_STATUS.DOUBTFUL, 1],
  [GAME_STATUS.QUESTIONABLE, 2],
  [RESERVE_STATUS.RESERVE, 3],
]);

/**
 * Game injury description.
 *
 * report_primary_injury is preferred. When there is no game designation the
 * practice note is NOT promoted: "Not injury related - resting player" against
 * a blank report_status is a rest day, not an injury, and must never render as
 * one.
 */
export function resolveInjuryDescription(injury) {
  if (injury.gameStatus != null) {
    return injury.reportPrimaryInjury ?? injury.practicePrimaryInjury ?? null;
  }
  return null;
}

/**
 * Is this record worth showing at all?
 *
 * A row exists in the injury file for every player the team reported on,
 * including full-participation rest notes with no designation. Those are not
 * injuries and are dropped.
 */
export function isDisplayableRecord(entry) {
  if (entry.gameStatus != null) return true;
  if (entry.reserveStatus === RESERVE_STATUS.RESERVE) return true;
  return false;
}

/** Best available offensive/defensive exposure for relevance and ordering. */
export function unitExposure(entry) {
  const season = entry.snaps.season[entry.unit === "offense" ? "offensePct" : "defensePct"];
  const lastGame = entry.snaps.lastGame[entry.unit === "offense" ? "offensePct" : "defensePct"];
  return { season, lastGame };
}

/**
 * Conservative first-pass relevance rule.
 *
 * 1. Any active game designation (OUT / DOUBTFUL / QUESTIONABLE) is shown —
 *    K/P/LS are already excluded upstream at parse time.
 * 2. RESERVE players are shown only with evidence of real offensive/defensive
 *    participation: season share, last-game share, or a depth-chart position
 *    when no snap data exists at all (a starter who has been on reserve since
 *    Week 1 has no snaps to measure and would otherwise vanish).
 */
export function isRelevant(entry, { minSnapPct = RESERVE_RELEVANCE_MIN_SNAP_PCT } = {}) {
  if (!isDisplayableRecord(entry)) return false;
  if (entry.gameStatus != null) return true;

  const { season, lastGame } = unitExposure(entry);
  if (Number.isFinite(season) && season >= minSnapPct) return true;
  if (Number.isFinite(lastGame) && lastGame >= minSnapPct) return true;
  if (season == null && lastGame == null && entry.depthChartPosition != null) return true;
  return false;
}

/**
 * Display order within a team: designation severity first, then how much the
 * player actually plays. Special-teams share is never an input.
 */
export function compareEntries(a, b) {
  const rankA = STATUS_SORT_ORDER.get(a.gameStatus ?? a.reserveStatus) ?? 99;
  const rankB = STATUS_SORT_ORDER.get(b.gameStatus ?? b.reserveStatus) ?? 99;
  if (rankA !== rankB) return rankA - rankB;

  const exposureA = unitExposure(a);
  const exposureB = unitExposure(b);
  const seasonA = Number.isFinite(exposureA.season) ? exposureA.season : -1;
  const seasonB = Number.isFinite(exposureB.season) ? exposureB.season : -1;
  if (seasonA !== seasonB) return seasonB - seasonA;

  const lastA = Number.isFinite(exposureA.lastGame) ? exposureA.lastGame : -1;
  const lastB = Number.isFinite(exposureB.lastGame) ? exposureB.lastGame : -1;
  if (lastA !== lastB) return lastB - lastA;

  return a.playerName.localeCompare(b.playerName);
}

function indexBy(rows, keyFn) {
  const index = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

/**
 * Build normalized entries for one reporting week.
 *
 * @param {object} input
 * @param {Array} input.injuryRows   parsed regular-season injury rows
 * @param {Array} input.rosterRows   parsed regular-season roster rows
 * @param {Array} input.snapRows     parsed regular-season snap rows
 * @param {Map}   input.crosswalk    gsis_id -> { pfrId, espnId }
 * @param {Map}   input.denominators `${gameId}|${team}` -> { offense, defense }
 * @param {number} input.week        the week being analyzed
 */
export function buildInjuryEntries({
  injuryRows,
  rosterRows,
  snapRows,
  crosswalk,
  denominators,
  week,
}) {
  const weekInjuries = injuryRows.filter((row) => row.week === week);
  const rosterByPlayerWeek = new Map(
    rosterRows.filter((row) => row.week === week).map((row) => [`${row.gsisId}`, row])
  );
  const snapsByPlayer = indexBy(snapRows, (row) => row.pfrId);
  const snapsByTeam = indexBy(snapRows, (row) => row.team);

  const entries = [];
  const join = { total: 0, resolved: 0, unresolved: 0, unresolvedPlayers: [] };

  for (const injury of weekInjuries) {
    join.total += 1;

    const mapped = crosswalk.get(injury.gsisId) ?? null;
    const pfrId = mapped?.pfrId ?? null;
    if (pfrId) join.resolved += 1;
    else {
      join.unresolved += 1;
      join.unresolvedPlayers.push({
        gsisId: injury.gsisId,
        playerName: injury.playerName,
        team: injury.team,
        position: injury.position,
      });
    }

    const roster = rosterByPlayerWeek.get(injury.gsisId) ?? null;
    const playerSnapRows = pfrId ? (snapsByPlayer.get(pfrId) ?? []) : [];
    const teamSnapRows = snapsByTeam.get(injury.team) ?? [];

    // Last game is the TEAM's most recent completed regular-season game before
    // this week, so a player who did not dress is correctly absent from it
    // rather than silently resolving to some earlier game he did play.
    let lastGame = { gameId: null, week: null, offensePct: null, defensePct: null, played: false };
    let lastTeamGame = null;
    for (const row of teamSnapRows) {
      if (row.week >= week) continue;
      if (!lastTeamGame || row.week > lastTeamGame.week) {
        lastTeamGame = { week: row.week, gameId: row.gameId };
      }
    }
    if (lastTeamGame) {
      const playerRow = playerSnapRows.find((row) => row.gameId === lastTeamGame.gameId) ?? null;
      lastGame = {
        gameId: lastTeamGame.gameId,
        week: lastTeamGame.week,
        offensePct: lastGameSnapPct(playerRow, "offense"),
        defensePct: lastGameSnapPct(playerRow, "defense"),
        played: playerRow != null,
      };
    }

    const season = aggregateSeasonSnaps(playerSnapRows, denominators, { beforeWeek: week });

    entries.push({
      playerId: injury.gsisId,
      gsisId: injury.gsisId,
      pfrId,
      espnId: mapped?.espnId ?? null,
      playerName: injury.playerName,
      team: injury.team,
      position: injury.position,
      depthChartPosition: roster?.depthChartPosition ?? null,
      unit: injury.unit,

      gameStatus: injury.gameStatus,
      practiceStatus: injury.practiceStatus,
      reserveStatus: roster?.reserveStatus ?? null,
      injuryDescription: resolveInjuryDescription(injury),

      snaps: {
        lastGame,
        season: {
          offensePct: season.offensePct,
          defensePct: season.defensePct,
          gamesIncluded: season.gamesIncluded,
          gameIds: season.gameIds,
        },
      },

      provenance: {
        sourceSeason: injury.season,
        sourceWeek: injury.week,
        rawReportStatus: injury.rawReportStatus,
        rawPracticeStatus: injury.rawPracticeStatus,
        rosterStatus: roster?.rosterStatus ?? null,
        rosterStatusCode: roster?.rosterStatusCode ?? null,
        reportSecondaryInjury: injury.reportSecondaryInjury,
        practicePrimaryInjury: injury.practicePrimaryInjury,
        practiceSecondaryInjury: injury.practiceSecondaryInjury,
        seasonOffenseSnaps: season.offenseSnaps,
        seasonOffenseTeamSnaps: season.offenseTeamSnaps,
        seasonDefenseSnaps: season.defenseSnaps,
        seasonDefenseTeamSnaps: season.defenseTeamSnaps,
      },
    });
  }

  return { entries, join };
}

/** Group relevant entries by team, sorted for display. */
export function groupRelevantByTeam(entries, options = {}) {
  const byTeam = new Map();
  for (const entry of entries) {
    if (!isRelevant(entry, options)) continue;
    if (!byTeam.has(entry.team)) byTeam.set(entry.team, []);
    byTeam.get(entry.team).push(entry);
  }
  for (const list of byTeam.values()) list.sort(compareEntries);
  return byTeam;
}

/** Per-team designation counts for the compact card summary. */
export function summarizeTeam(entries) {
  const summary = { out: 0, doubtful: 0, questionable: 0, reserve: 0 };
  for (const entry of entries) {
    if (entry.gameStatus === GAME_STATUS.OUT) summary.out += 1;
    else if (entry.gameStatus === GAME_STATUS.DOUBTFUL) summary.doubtful += 1;
    else if (entry.gameStatus === GAME_STATUS.QUESTIONABLE) summary.questionable += 1;
    else if (entry.reserveStatus === RESERVE_STATUS.RESERVE) summary.reserve += 1;
  }
  return summary;
}
