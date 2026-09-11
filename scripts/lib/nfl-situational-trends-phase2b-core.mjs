/**
 * Pure deterministic helpers for NFL Situational Trends Study v1, Phase 2B.
 *
 * Phase 2B expands the descriptive reference library. It consumes the locked
 * Phase 1 team-game rows and never changes a production model or Phase 1/2
 * qualification rule.
 */

import {
  FIXED_ERA_WINDOWS,
  REPORTING_WINDOWS,
  classifyEvidence,
  classifyRecentEvidence,
  summarizeRows,
  summarizeStability,
} from "./nfl-situational-trends-core.mjs";
import { sampleSizeLabel } from "./nfl-situational-trends-phase2-core.mjs";

export const PHASE2B_STUDY_VERSION = "nfl-situational-trends-phase2b-v1";
export const PHASE2B_DEFINITION_VERSION = "nfl-situational-trend-definitions-phase2b-v1";
export const PHASE2B_SCHEMA_VERSION = "nfl-situational-trends-phase2b-report-v1";
export const PHASE2B_TREND_IDS = [
  "home-underdogs",
  "road-favorites",
  "double-digit-favorites",
  "double-digit-underdogs",
  "after-outright-upset-win",
  "after-outright-upset-loss",
  "coming-off-overtime",
  "coming-off-monday-night-football",
  "coming-off-sunday-night-football",
  "second-divisional-meeting",
  "after-scoring-40-plus",
  "after-allowing-40-plus",
];

export function marketRole(teamSpread) {
  if (!Number.isFinite(teamSpread)) return "unavailable";
  if (teamSpread < 0) return "favorite";
  if (teamSpread > 0) return "underdog";
  return "pickem";
}

export function homeUnderdog(row) {
  return row?.venue === "home" && Number.isFinite(row.teamSpread) && row.teamSpread > 0;
}

export function roadFavorite(row) {
  return row?.venue === "away" && Number.isFinite(row.teamSpread) && row.teamSpread < 0;
}

export function favoriteSpreadBand(teamSpread) {
  if (!Number.isFinite(teamSpread) || teamSpread >= 0) return null;
  if (teamSpread >= -3) return "favorite-0.5-to-3";
  if (teamSpread >= -6.5) return "favorite-3.5-to-6.5";
  return "favorite-7-plus";
}

export function underdogSpreadBand(teamSpread) {
  if (!Number.isFinite(teamSpread) || teamSpread <= 0) return null;
  if (teamSpread <= 3) return "underdog-0.5-to-3";
  if (teamSpread <= 6.5) return "underdog-3.5-to-6.5";
  return "underdog-7-plus";
}

export function doubleDigitClassification(teamSpread) {
  if (!Number.isFinite(teamSpread)) return null;
  if (teamSpread <= -10) return "favorite";
  if (teamSpread >= 10) return "underdog";
  return null;
}

export function doubleDigitMarginBand(teamSpread) {
  const role = doubleDigitClassification(teamSpread);
  if (!role) return null;
  const magnitude = Math.abs(teamSpread);
  return magnitude <= 13.5 ? "10-to-13.5" : "14-plus";
}

export function priorUpsetClassification(previousGame) {
  if (!previousGame || !Number.isFinite(previousGame.pointMargin) || !Number.isFinite(previousGame.teamSpread)) return null;
  if (previousGame.pointMargin > 0 && previousGame.teamSpread > 0) return "upset-win";
  if (previousGame.pointMargin < 0 && previousGame.teamSpread < 0) return "upset-loss";
  return null;
}

export function isOvertimeValue(value) {
  return value === 1 || value === "1" || value === true;
}

export function previousScoreBand(points) {
  if (!Number.isFinite(points) || points < 40) return null;
  return points < 50 ? "40-to-49" : "50-plus";
}

function easternParts(kickoffUtc) {
  if (!kickoffUtc) return null;
  const date = new Date(kickoffUtc);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { weekday: values.weekday, hour: Number(values.hour), minute: Number(values.minute) };
}

export function kickoffContext(kickoffUtc) {
  return easternParts(kickoffUtc);
}

export function isMondayNight(kickoffUtc) {
  const parts = easternParts(kickoffUtc);
  return Boolean(parts && parts.weekday === "Mon" && parts.hour >= 19);
}

export function isSundayNight(kickoffUtc) {
  const parts = easternParts(kickoffUtc);
  return Boolean(parts && parts.weekday === "Sun" && parts.hour >= 20);
}

/**
 * Same-season divisional head-to-head chronology. The second-meeting row also
 * receives the current team's result from the first meeting.
 */
export function attachSecondDivisionalMeetingContext(rows) {
  const annotated = rows.map((row) => ({ ...row }));
  const rowById = new Map(annotated.map((row) => [row.rowId, row]));
  const gamesByPair = new Map();
  for (const row of annotated) {
    if (!row.divisional) continue;
    const pair = [row.team, row.opponent].sort().join("-");
    const key = `${row.season}:${pair}`;
    const games = gamesByPair.get(key) ?? new Map();
    games.set(row.gameId, { gameId: row.gameId, kickoffUtc: row.kickoffUtc });
    gamesByPair.set(key, games);
  }
  for (const games of gamesByPair.values()) {
    const ordered = [...games.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.gameId.localeCompare(b.gameId));
    ordered.forEach((game, index) => {
      for (const row of annotated.filter((item) => item.gameId === game.gameId)) {
        row.divisionalMeetingNumber = index + 1;
        row.firstMeetingGameId = index > 0 ? ordered[0].gameId : null;
        row.firstMeetingSuResult = index > 0 ? rowById.get(`${ordered[0].gameId}:${row.team}`)?.suResult ?? null : null;
      }
    });
  }
  return annotated;
}

export function windowAssignments(season) {
  return {
    fullHistory: season >= REPORTING_WINDOWS.fullHistory.startSeason && season <= REPORTING_WINDOWS.fullHistory.endSeason,
    recentForm: season >= REPORTING_WINDOWS.recentForm.startSeason && season <= REPORTING_WINDOWS.recentForm.endSeason,
    olderEra: season >= FIXED_ERA_WINDOWS.olderEra.startSeason && season <= FIXED_ERA_WINDOWS.olderEra.endSeason,
    newerEra: season >= FIXED_ERA_WINDOWS.newerEra.startSeason && season <= FIXED_ERA_WINDOWS.newerEra.endSeason,
  };
}

function withSampleLabel(metrics) {
  return { ...metrics, sampleSizeLabel: sampleSizeLabel(metrics.qualifyingTeamGames) };
}

function direction(value) {
  if (!Number.isFinite(value) || value === 0.5) return "NEUTRAL";
  return value > 0.5 ? "ABOVE_50" : "BELOW_50";
}

export function buildPhase2bVariant({ trendId, id, label, definition, rows, overlapPolicy }) {
  const fullRows = rows.filter((row) => windowAssignments(row.season).fullHistory);
  const recentRows = rows.filter((row) => windowAssignments(row.season).recentForm);
  const olderRows = rows.filter((row) => windowAssignments(row.season).olderEra);
  const newerRows = rows.filter((row) => windowAssignments(row.season).newerEra);
  const fullHistoryMetrics = withSampleLabel(summarizeRows(fullRows));
  const recentFormMetrics = withSampleLabel(summarizeRows(recentRows));
  const eraMetrics = {
    olderEra: withSampleLabel(summarizeRows(olderRows)),
    newerEra: withSampleLabel(summarizeRows(newerRows)),
  };
  const stability = summarizeStability(fullRows);
  const evidence = classifyEvidence(fullHistoryMetrics, recentFormMetrics, stability);
  return {
    trendId,
    id,
    label,
    definition,
    overlapPolicy,
    fullHistoryMetrics,
    recentFormMetrics,
    eraMetrics,
    evidenceClassification: evidence.classification,
    confidence: evidence.confidence,
    evidenceExplanation: evidence.explanation,
    recentEvidenceClassification: classifyRecentEvidence(recentFormMetrics),
    stabilityFlags: {
      olderEraDirection: direction(eraMetrics.olderEra.atsWinPct),
      newerEraDirection: direction(eraMetrics.newerEra.atsWinPct),
      eraDirectionReverses: stability.comparison.directionReverses,
      recentVsFullHistoryAtsPctDelta: stability.comparison.recentVsFullHistoryAtsPctDelta,
      recentMateriallyDiffersFromFullHistory: stability.comparison.recentMateriallyDiffersFromFullHistory,
      recentChange: stability.comparison.recentChange,
    },
  };
}

export function articleRelevanceFor(baseVariant) {
  if (baseVariant.evidenceClassification === "INSUFFICIENT DATA") return "Classic angle with insufficient data; worth contextual mention only.";
  if (baseVariant.evidenceClassification === "LITTLE/NO EVIDENCE") return "Classic angle with no broad ATS edge; retain as a reference/context angle.";
  if (baseVariant.evidenceClassification === "HISTORICALLY MEANINGFUL") {
    return baseVariant.stabilityFlags.recentChange === "STABLE"
      ? "Historically stable broad pattern, still descriptive rather than predictive."
      : `Historically meaningful pattern with recent ${baseVariant.stabilityFlags.recentChange.toLowerCase()}; flag the change prominently.`;
  }
  if (baseVariant.stabilityFlags.eraDirectionReverses) return "Context-dependent classic angle with a fixed-era direction reversal.";
  if (baseVariant.stabilityFlags.recentChange !== "STABLE") return `Context-dependent angle with recent ${baseVariant.stabilityFlags.recentChange.toLowerCase()}.`;
  return "Context-dependent classic angle; worth contextual mention rather than a broad betting claim.";
}
