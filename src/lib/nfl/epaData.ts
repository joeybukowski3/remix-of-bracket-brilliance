/**
 * EPA efficiency resolver (Phase 6).
 *
 * Consumes the generated public/data/nfl/matchup-epa.json artifact, produced by
 * scripts/generate-nfl-matchup-epa.mjs from nflverse play-by-play. Play-by-play
 * is never fetched, parsed or bundled in the browser — the artifact is
 * precomputed for all four sample-control states, so switching Season / Last 5
 * or the historical blend is a pure lookup.
 *
 * The window ids are the same four the Phase 2 conventional artifact uses, and
 * the generator selects games with the same shared helper, so a given control
 * state resolves the same games for EPA as for yards per play.
 *
 * EPA is nflfastR's play-level value, aggregated exactly:
 * sum(EPA) / sum(eligible plays). Defensive values are the opponents'
 * offensive production in the same games.
 *
 * Success Rate is unaffected by this module and remains RBSDM-sourced.
 *
 * Attribution: nflverse / nflfastR.
 */

import {
  type NflMatchupMetricResolver,
  type NflMatchupMetricValue,
} from "@/lib/nfl/matchupMetrics";
import type { NflMatchupSampleSettings } from "@/lib/nfl/matchupSampleWindow";

export const EPA_ARTIFACT_PATH = "/data/nfl/matchup-epa.json";

/** The six metrics this pipeline supplies. Nothing else is sourced from it. */
export const EPA_METRIC_KEYS: readonly string[] = [
  "off.epaPerPlay",
  "off.epaPerPass",
  "off.epaPerRush",
  "def.epaPerPlayAllowed",
  "def.epaPerPassAllowed",
  "def.epaPerRushAllowed",
] as const;

export function isEpaMetric(metricKey: string): boolean {
  return EPA_METRIC_KEYS.includes(metricKey);
}

/** `[roundedValue, rank]`; rank is null when the metric could not be ranked. */
export type EpaMetricTuple = [number | null, number | null];

export type EpaWindowTotals = {
  offEpa: number;
  offPlays: number;
  passEpa: number;
  passPlays: number;
  rushEpa: number;
  rushPlays: number;
};

export type EpaTeamWindow = {
  gamesIncluded: number;
  gameIds: string[];
  seasons: number[];
  through: { season: number; week: number; dateUtc: string | null };
  metrics: Record<string, EpaMetricTuple>;
  totals: { offense: EpaWindowTotals; defense: EpaWindowTotals };
};

export type EpaWindow = {
  /** "season" | "last5" for analyzer control states; "priorSeasonFull" for the power-ratings 2025 window. */
  mode: string;
  includePriorSeason: boolean;
  teams: Record<string, EpaTeamWindow>;
};

export type EpaArtifact = {
  _meta: { schemaVersion: string; generatedAt: string; source: string; notes: string[] };
  schemaVersion: string;
  attribution: string;
  currentSeason: number;
  priorSeason: number;
  seasonsUsed: number[];
  metricKeys: string[];
  metricDirections: Record<string, string>;
  displayDecimals: number;
  windows: Record<string, EpaWindow>;
  provenance: unknown;
};

/** Artifact key for a control state. Mirrors windowId() in the generators. */
export function epaWindowId(settings: NflMatchupSampleSettings): string {
  return `${settings.window}-${settings.includePriorSeason ? "blend" : "current"}`;
}

/**
 * Signed three-decimal EPA, e.g. "+0.128" / "-0.043" / "0.000".
 *
 * Zero is rendered unsigned because "+0.000" reads as a rounded positive when
 * it may not be one.
 */
export function formatEpa(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  const fixed = value.toFixed(3);
  if (Number(fixed) === 0) return "0.000";
  return value > 0 ? `+${fixed}` : fixed;
}

/**
 * Build an EPA resolver for the active control state.
 *
 * Returns null for any non-EPA metric key so this resolver can be safely
 * composed ahead of the conventional one without shadowing it.
 */
export function createEpaResolver(
  artifact: EpaArtifact | null,
  settings: NflMatchupSampleSettings,
  slugToAbbr: ReadonlyMap<string, string>
): NflMatchupMetricResolver {
  const window = artifact?.windows?.[epaWindowId(settings)];
  if (!window) return () => null;

  return (teamSlug: string, metricKey: string): NflMatchupMetricValue | null => {
    if (!isEpaMetric(metricKey)) return null;

    const abbr = slugToAbbr.get(teamSlug) ?? teamSlug;
    const team = window.teams[abbr];
    if (!team) return null;

    const tuple = team.metrics[metricKey];
    if (!tuple) return null;

    const [value, rank] = tuple;
    if (value == null || !Number.isFinite(value)) return null;

    return {
      key: metricKey,
      value,
      rank: rank ?? null,
      formattedValue: formatEpa(value),
      source: artifact?._meta.source,
      sampleWindow: settings.window,
      updatedAt: artifact?._meta.generatedAt,
    };
  };
}

/**
 * Compose resolvers, first non-null wins.
 *
 * Lets the EPA pipeline fill its six rows without any component learning that a
 * second artifact exists, and without the conventional resolver changing.
 */
export function composeMetricResolvers(
  ...resolvers: readonly NflMatchupMetricResolver[]
): NflMatchupMetricResolver {
  return (teamSlug: string, metricKey: string) => {
    for (const resolve of resolvers) {
      const value = resolve(teamSlug, metricKey);
      if (value) return value;
    }
    return null;
  };
}

/** Games backing a team's EPA value, for auditability in tests and debugging. */
export function epaGameIds(
  artifact: EpaArtifact | null,
  settings: NflMatchupSampleSettings,
  teamAbbr: string
): string[] {
  return artifact?.windows?.[epaWindowId(settings)]?.teams?.[teamAbbr]?.gameIds ?? [];
}
