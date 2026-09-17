/**
 * Pure deterministic helpers for NFL Situational Trends Study v1, Phase 2.
 *
 * Phase 2 is a descriptive robustness layer over the locked Phase 1 team-game
 * dataset. Nothing in this module is a production-model feature or betting
 * recommendation.
 */

import {
  FIXED_ERA_WINDOWS,
  REPORTING_WINDOWS,
  summarizeRows,
} from "./nfl-situational-trends-core.mjs";

export const PHASE2_STUDY_VERSION = "nfl-situational-trends-phase2-v1";
export const PHASE2_SCHEMA_VERSION = "nfl-situational-trends-phase2-report-v1";

export const SPREAD_BUCKETS = [
  { id: "favorite-7-plus", label: "Favorite 7+", definition: "teamSpread <= -7", matches: (value) => value <= -7 },
  { id: "favorite-3.5-to-6.5", label: "Favorite 3.5 to 6.5", definition: "-6.5 <= teamSpread <= -3.5", matches: (value) => value >= -6.5 && value <= -3.5 },
  { id: "favorite-0.5-to-3", label: "Favorite 0.5 to 3", definition: "-3 <= teamSpread <= -0.5", matches: (value) => value >= -3 && value <= -0.5 },
  { id: "pickem", label: "Pick'em", definition: "teamSpread = 0", matches: (value) => value === 0 },
  { id: "underdog-0.5-to-3", label: "Underdog 0.5 to 3", definition: "0.5 <= teamSpread <= 3", matches: (value) => value >= 0.5 && value <= 3 },
  { id: "underdog-3.5-to-6.5", label: "Underdog 3.5 to 6.5", definition: "3.5 <= teamSpread <= 6.5", matches: (value) => value >= 3.5 && value <= 6.5 },
  { id: "underdog-7-plus", label: "Underdog 7+", definition: "teamSpread >= 7", matches: (value) => value >= 7 },
];

export const DOG_SPREAD_BUCKETS = SPREAD_BUCKETS.filter((bucket) => bucket.id.startsWith("underdog-"));

export function marketRole(teamSpread) {
  if (!Number.isFinite(teamSpread)) return "unavailable";
  if (teamSpread < 0) return "favorite";
  if (teamSpread > 0) return "underdog";
  return "pickem";
}

export function spreadBucket(teamSpread) {
  if (!Number.isFinite(teamSpread)) return "unavailable";
  return SPREAD_BUCKETS.find((bucket) => bucket.matches(teamSpread))?.id ?? "unavailable";
}

export function sampleSizeLabel(n) {
  if (n < 50) return "VERY SMALL";
  if (n < 100) return "LIMITED";
  if (n < 200) return "MODERATE";
  return "LARGER";
}

function round(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function qualityBucket(quality) {
  if (!quality || quality.gamesPlayed === 0 || !Number.isFinite(quality.winPct)) return "no-prior-games";
  if (quality.winPct > 0.5) return "winning-record";
  if (quality.winPct < 0.5) return "losing-record";
  return "even-record";
}

/**
 * Adds current-season, strictly pregame quality. Games are ordered by kickoff
 * then game ID; the target row is annotated before its result updates state.
 */
export function attachPregameQuality(rows) {
  const annotated = rows.map((row) => ({ ...row }));
  const byTeamSeason = new Map();
  for (const row of annotated) {
    const key = `${row.season}:${row.team}`;
    const group = byTeamSeason.get(key) ?? [];
    group.push(row);
    byTeamSeason.set(key, group);
  }
  for (const group of byTeamSeason.values()) {
    group.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.gameId.localeCompare(b.gameId));
    let gamesPlayed = 0;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let pointDifferential = 0;
    for (const row of group) {
      row.teamPregameQuality = {
        gamesPlayed,
        wins,
        losses,
        ties,
        winPct: gamesPlayed ? round((wins + ties * 0.5) / gamesPlayed) : null,
        averagePointDifferential: gamesPlayed ? round(pointDifferential / gamesPlayed) : null,
        bucket: gamesPlayed ? qualityBucket({ gamesPlayed, winPct: (wins + ties * 0.5) / gamesPlayed }) : "no-prior-games",
      };
      gamesPlayed += 1;
      if (row.suResult === "W") wins += 1;
      else if (row.suResult === "L") losses += 1;
      else ties += 1;
      pointDifferential += row.pointMargin;
    }
  }
  const byRowId = new Map(annotated.map((row) => [row.rowId, row]));
  for (const row of annotated) {
    const opponent = byRowId.get(`${row.gameId}:${row.opponent}`);
    row.opponentPregameQuality = opponent ? { ...opponent.teamPregameQuality } : null;
  }
  return annotated.sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team));
}

/** Same-season head-to-head game order; both team rows receive the same order. */
export function attachDivisionalMeetingOrder(rows) {
  const gameByKey = new Map();
  for (const row of rows) {
    if (!row.divisional) continue;
    const pair = [row.team, row.opponent].sort().join("-");
    const key = `${row.season}:${pair}`;
    const games = gameByKey.get(key) ?? new Map();
    games.set(row.gameId, { gameId: row.gameId, kickoffUtc: row.kickoffUtc });
    gameByKey.set(key, games);
  }
  const orderBySeasonGame = new Map();
  for (const games of gameByKey.values()) {
    [...games.values()]
      .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.gameId.localeCompare(b.gameId))
      .forEach((game, index) => orderBySeasonGame.set(game.gameId, index + 1));
  }
  return rows.map((row) => ({ ...row, divisionalMeetingNumber: row.divisional ? orderBySeasonGame.get(row.gameId) ?? null : null }));
}

function easternWeekday(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(date);
}

export function restStructureFlags(row) {
  const currentDay = easternWeekday(row.kickoffUtc);
  const previousDay = easternWeekday(row.previousGame?.kickoffUtc);
  const differential = row.restDifferential;
  return {
    thursdayAfterSunday: currentDay === "Thu" && previousDay === "Sun" && row.restDays === 4,
    mondayToSunday: currentDay === "Sun" && previousDay === "Mon" && row.restDays === 6,
    normalRestOpponentExtra: row.restDays === 7 && Number.isFinite(row.opponentRestDays) && row.opponentRestDays >= 8,
    postByeRestEdge: row.postBye === true && Number.isFinite(differential) && differential >= 3,
    miniByeRestEdge: previousDay === "Thu" && row.restDays >= 9 && row.restDays <= 11 && Number.isFinite(differential) && differential >= 3,
    equalRest: differential === 0,
    meaningfulRestDisadvantage: Number.isFinite(differential) && differential <= -3,
    meaningfulRestAdvantage: Number.isFinite(differential) && differential >= 3,
  };
}

export function restDifferentialBucket(differential) {
  if (!Number.isFinite(differential)) return "unavailable";
  if (differential <= -3) return "meaningful-disadvantage";
  if (differential < 0) return "small-disadvantage";
  if (differential === 0) return "equal-rest";
  if (differential < 3) return "small-advantage";
  return "meaningful-advantage";
}

export function shortRestCadence(row) {
  const flags = restStructureFlags(row);
  if (flags.thursdayAfterSunday) return "thursday-after-sunday";
  if (flags.mondayToSunday) return "monday-to-sunday";
  return "other-short-turnaround";
}

export function restAdvantageSource(row) {
  const flags = restStructureFlags(row);
  if (flags.postByeRestEdge) return "post-bye-edge";
  if (flags.miniByeRestEdge) return "mini-bye-edge";
  return "other-rest-edge";
}

export function currentRestDaysBucket(restDays) {
  if (!Number.isFinite(restDays)) return "no-prior-game";
  if (restDays <= 6) return "short-6-or-fewer";
  if (restDays === 7) return "normal-7";
  if (restDays <= 9) return "extended-8-to-9";
  if (restDays <= 17) return "bye-range-10-to-17";
  return "very-extended-18-plus";
}

/** Great-circle miles, appropriate only for coarse descriptive buckets. */
export function greatCircleMiles(origin, destination) {
  if (![origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude].every(Number.isFinite)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return round(3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)), 1);
}

export function travelDistanceBucket(miles) {
  if (!Number.isFinite(miles)) return "unavailable";
  if (miles < 2000) return "under-2000";
  if (miles < 2500) return "2000-to-2499";
  return "2500-plus";
}

export function summarizePhase2Rows(rows) {
  return {
    ...summarizeRows(rows),
    sampleSizeLabel: sampleSizeLabel(rows.length),
    averageTeamPregameWinPct: round(mean(rows.map((row) => row.teamPregameQuality?.winPct))),
    averageTeamPregamePointDifferential: round(mean(rows.map((row) => row.teamPregameQuality?.averagePointDifferential))),
    averageOpponentPregameWinPct: round(mean(rows.map((row) => row.opponentPregameQuality?.winPct))),
    averageOpponentPregamePointDifferential: round(mean(rows.map((row) => row.opponentPregameQuality?.averagePointDifferential))),
    averageRestDays: round(mean(rows.map((row) => row.restDays))),
    averageOpponentRestDays: round(mean(rows.map((row) => row.opponentRestDays))),
    averageRestDifferential: round(mean(rows.map((row) => row.restDifferential))),
    averageTravelMiles: round(mean(rows.map((row) => row.travelMiles))),
  };
}

function inWindow(row, window) {
  return row.season >= window.startSeason && row.season <= window.endSeason;
}

export function buildSplitRecord({ trendId, parentRule, splitId, splitLabel, splitDefinition, rows, overlapPolicy = "mutually exclusive siblings", interpretationNotes = [] }) {
  const fullRows = rows.filter((row) => inWindow(row, REPORTING_WINDOWS.fullHistory));
  const recentRows = rows.filter((row) => inWindow(row, REPORTING_WINDOWS.recentForm));
  const olderRows = rows.filter((row) => inWindow(row, FIXED_ERA_WINDOWS.olderEra));
  const newerRows = rows.filter((row) => inWindow(row, FIXED_ERA_WINDOWS.newerEra));
  const fullHistoryMetrics = summarizePhase2Rows(fullRows);
  const recentFormMetrics = summarizePhase2Rows(recentRows);
  const olderEraMetrics = summarizePhase2Rows(olderRows);
  const newerEraMetrics = summarizePhase2Rows(newerRows);
  const fullPct = fullHistoryMetrics.atsWinPct;
  const recentPct = recentFormMetrics.atsWinPct;
  const olderPct = olderEraMetrics.atsWinPct;
  const newerPct = newerEraMetrics.atsWinPct;
  return {
    trendId,
    parentDefinitionVersion: "nfl-situational-trend-definitions-v1",
    parentRule,
    splitId,
    splitLabel,
    splitDefinition,
    overlapPolicy,
    fullHistoryMetrics,
    recentFormMetrics,
    eraMetrics: { olderEra: olderEraMetrics, newerEra: newerEraMetrics },
    sampleSizeLabel: fullHistoryMetrics.sampleSizeLabel,
    stabilityFlags: {
      recentVsFullHistoryAtsPctDelta: Number.isFinite(fullPct) && Number.isFinite(recentPct) ? round(recentPct - fullPct) : null,
      recentMateriallyDiffersFromFullHistory: Number.isFinite(fullPct) && Number.isFinite(recentPct) ? Math.abs(recentPct - fullPct) >= 0.03 : false,
      eraDirectionReverses: Number.isFinite(olderPct) && Number.isFinite(newerPct) && olderPct !== 0.5 && newerPct !== 0.5 && (olderPct > 0.5) !== (newerPct > 0.5),
    },
    interpretationNotes: [
      fullHistoryMetrics.qualifyingTeamGames < 50 ? "Very small full-history sample; do not emphasize." : null,
      fullHistoryMetrics.qualifyingTeamGames >= 50 && fullHistoryMetrics.qualifyingTeamGames < 100 ? "Limited full-history sample; interpret cautiously." : null,
      Number.isFinite(fullPct) && Number.isFinite(recentPct) && Math.abs(recentPct - fullPct) >= 0.03
        ? `Recent ATS rate differs from full history by ${round((recentPct - fullPct) * 100, 1)} percentage points.` : null,
      Number.isFinite(olderPct) && Number.isFinite(newerPct) && olderPct !== 0.5 && newerPct !== 0.5 && (olderPct > 0.5) !== (newerPct > 0.5)
        ? "ATS direction reverses across the fixed older/newer eras." : null,
      ...interpretationNotes,
    ].filter(Boolean),
  };
}
