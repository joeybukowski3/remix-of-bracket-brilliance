/**
 * Phase 2 conventional-stat resolver.
 *
 * Consumes the generated, normalized artifact
 * (public/data/nfl/matchup-metrics.json, produced by
 * scripts/generate-nfl-matchup-metrics.mjs) and turns it into the
 * NflMatchupMetricResolver the Phase 1 UI already speaks.
 *
 * No parsing, no aggregation and no network access to a stat provider happens
 * here — the artifact is precomputed for all four sample-control states, so
 * switching Season/Last 5 or the historical blend is a pure lookup.
 *
 * Metrics absent from the artifact (EPA, success rate, first downs, third down,
 * time of possession, line-of-scrimmage win rates, ATS/O-U) resolve to null and
 * keep rendering "N/A", exactly as in Phase 1.
 */

import {
  METRIC_NA,
  getMetricDef,
  type NflMatchupMetricResolver,
  type NflMatchupMetricValue,
} from "@/lib/nfl/matchupMetrics";
import type { NflDataWindow, NflMatchupSampleSettings } from "@/lib/nfl/matchupSampleWindow";

/** `[roundedValue, rank]`; rank is null when the metric could not be ranked. */
export type MatchupMetricTuple = [number, number | null];

export type MatchupMetricsTeamWindow = {
  gamesIncluded: number;
  gameIds: string[];
  seasons: number[];
  through: { season: number; week: number; dateUtc: string | null };
  metrics: Record<string, MatchupMetricTuple>;
};

export type MatchupMetricsWindow = {
  /** Analyzer control-state window ("season"/"last5") or "priorSeasonFull" for the power-ratings 2025 window. */
  mode: NflDataWindow | "priorSeasonFull";
  includePriorSeason: boolean;
  teams: Record<string, MatchupMetricsTeamWindow>;
};

export type MatchupMetricsArtifact = {
  _meta: {
    schemaVersion: string;
    generatedAt: string;
    source: string;
    sourceFiles: { season: number; path: string; rowCount: number }[];
    currentSeason: number;
    priorSeason: number;
    seasonsUsed: number[];
    metricKeys: string[];
    notes: string[];
  };
  windows: Record<string, MatchupMetricsWindow>;
};

export const MATCHUP_METRICS_ARTIFACT_PATH = "/data/nfl/matchup-metrics.json";

/** Artifact key for a control state. Mirrors windowId() in the generator. */
export function artifactWindowId(settings: NflMatchupSampleSettings): string {
  return `${settings.window}-${settings.includePriorSeason ? "blend" : "current"}`;
}

/** Format a raw numeric value using the catalogue's declared format. */
export function formatMetricValue(key: string, value: number): string {
  const def = getMetricDef(key);
  switch (def?.format) {
    case "percent1":
      return `${value.toFixed(1)}%`;
    case "decimal1":
      return value.toFixed(1);
    case "decimal2":
      return value.toFixed(2);
    case "epa":
      return value >= 0 ? `+${value.toFixed(3)}` : value.toFixed(3);
    case "integer":
      return String(Math.round(value));
    case "clock": {
      const total = Math.round(value);
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }
    default:
      return String(value);
  }
}

/**
 * Build a resolver over one window of the artifact.
 *
 * `slugToAbbr` maps the guide model's team slug (what the UI passes) onto the
 * canonical abbreviation the artifact is keyed by. Anything unmapped, or any
 * metric not present for that team/window, resolves to null so the row renders
 * "N/A" rather than a substituted value.
 */
export function createMatchupMetricResolver(
  artifact: MatchupMetricsArtifact | null,
  settings: NflMatchupSampleSettings,
  slugToAbbr: ReadonlyMap<string, string>
): NflMatchupMetricResolver {
  const window = artifact?.windows?.[artifactWindowId(settings)];
  if (!window) return () => null;

  return (teamSlug: string, metricKey: string): NflMatchupMetricValue | null => {
    const abbr = slugToAbbr.get(teamSlug) ?? teamSlug;
    const team = window.teams[abbr];
    if (!team) return null;

    const tuple = team.metrics[metricKey];
    if (!tuple) return null;

    const [value, rank] = tuple;
    if (value === null || value === undefined || !Number.isFinite(value)) return null;

    return {
      key: metricKey,
      value,
      rank: rank ?? null,
      formattedValue: formatMetricValue(metricKey, value),
      source: artifact?._meta.source,
      sampleWindow: settings.window,
      updatedAt: artifact?._meta.generatedAt,
    };
  };
}

export type MatchupSampleSummary = {
  /** Compact label, e.g. "8 games · 2025" or "4 games · 2026 only". */
  label: string;
  /** True when neither team has any completed games for this control state. */
  empty: boolean;
  gameIdsByTeam: Record<string, string[]>;
};

function seasonsLabel(seasons: number[], currentSeason: number): string {
  if (seasons.length === 0) return "no games";
  if (seasons.length > 1) return `${seasons[0]}/${seasons[seasons.length - 1]} blend`;
  return seasons[0] === currentSeason ? `${seasons[0]} only` : String(seasons[0]);
}

/**
 * One compact, section-level description of the active sample.
 *
 * Deliberately summarised across the two teams in the matchup rather than
 * repeated per row. Early in a season the two teams can legitimately differ by
 * a game, which is shown as a range.
 */
export function describeMatchupSample(
  artifact: MatchupMetricsArtifact | null,
  settings: NflMatchupSampleSettings,
  teamAbbrs: readonly string[]
): MatchupSampleSummary {
  const window = artifact?.windows?.[artifactWindowId(settings)];
  const entries = teamAbbrs
    .map((abbr) => window?.teams[abbr])
    .filter((entry): entry is MatchupMetricsTeamWindow => !!entry);

  if (entries.length === 0) {
    return {
      label: settings.includePriorSeason ? "No completed games" : "No completed 2026 games yet",
      empty: true,
      gameIdsByTeam: {},
    };
  }

  const counts = entries.map((entry) => entry.gamesIncluded);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const countLabel = min === max ? `${min} game${min === 1 ? "" : "s"}` : `${min}–${max} games`;

  const seasons = [...new Set(entries.flatMap((entry) => entry.seasons))].sort();
  const currentSeason = artifact?._meta.currentSeason ?? Math.max(...seasons);

  const gameIdsByTeam: Record<string, string[]> = {};
  teamAbbrs.forEach((abbr) => {
    const entry = window?.teams[abbr];
    if (entry) gameIdsByTeam[abbr] = entry.gameIds;
  });

  return {
    label: `${countLabel} · ${seasonsLabel(seasons, currentSeason)}`,
    empty: false,
    gameIdsByTeam,
  };
}

export { METRIC_NA };
