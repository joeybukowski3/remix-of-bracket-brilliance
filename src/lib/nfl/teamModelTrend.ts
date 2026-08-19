import type { NflProvenanceViewModel } from "@/lib/nfl/provenance";
import type { CurrentRatingBoard, CurrentRatingRow } from "@/lib/nfl/currentRating2026";
import { NFL_V04_MODEL_VERSION } from "@/lib/nfl/v04Projection";
import {
  NFL_V03_MODEL_VERSION,
  publicScaleEquivalent,
  type NflV03FinalEightArtifact,
  type NflV03FullSeasonArtifact,
  type NflV03Meta,
} from "@/lib/nfl/v03Review";

/**
 * The "current" universal OVR/rank/state fields below come ONLY from the
 * canonical current-rating board (currentRating2026.ts / useNflCurrentRating2026),
 * never from the raw v0.3.1 public board -- see Phase 3 migration notes.
 *
 * fullSeasonRating / finalEightRating / delta / trajectory* / l8OpponentStrength
 * are a SEPARATE, unrelated piece of context: the automated v0.3.1 model's own
 * internal 2025-season trajectory (full-season composite vs. its final-eight-
 * games window), used for historical model-review context only. This is not
 * "current OVR movement" and must not be read as one -- it predates the
 * universal 2026 rating entirely and describes a different season.
 */
export type NflTeamModelTrendViewModel = {
  teamSlug: string;
  /** Universal current 2026 OVR (1-99). Null only when the team is absent from the current-rating board. */
  currentUniversalRating: number | null;
  /** Universal current 2026 league rank (1-32). */
  currentUniversalRank: number | null;
  /** 2026, when the universal board has loaded. */
  currentRatingSeason: number | null;
  /** "2026 preseason projection" | "2026 season-to-date" | null. */
  currentUniversalStateLabel: string | null;
  /** The immutable v0.4 preseason anchor this team's current rating is measured against. */
  preseasonV04Rating: number | null;
  /** currentUniversalRating - preseasonV04Rating. Null before there is a current rating to compare. */
  sincePreseasonDelta: number | null;
  comparisonSeason: number | null;
  /** 2025 v0.3.1 full-season composite, public-scale. Historical context only. */
  fullSeasonRating: number | null;
  /** 2025 v0.3.1 final-eight-window composite, public-scale. Historical context only. */
  finalEightRating: number | null;
  /** finalEightRating - fullSeasonRating (2025 internal trajectory, unrelated to sincePreseasonDelta). */
  delta: number | null;
  trajectoryLabel: string | null;
  trajectoryLambda: number | null;
  l8OpponentStrength: number | null;
  provenance: NflProvenanceViewModel | null;
};

export type NflTrajectoryTone = "positive" | "negative" | "caution" | "neutral";

export function getNflTrajectoryPresentation(label: string | null): {
  tone: NflTrajectoryTone;
  description: string;
} {
  if (label === "Late Riser") {
    return {
      tone: "positive",
      description: "Opponent-adjusted final-eight form finished above the full-season baseline.",
    };
  }
  if (label === "Late Decline") {
    return {
      tone: "negative",
      description: "Opponent-adjusted final-eight form finished below the full-season baseline.",
    };
  }
  if (label === "Schedule-Inflated Surge") {
    return {
      tone: "caution",
      description: "Raw late improvement did not clear the riser threshold after schedule adjustment.",
    };
  }
  if (label === "Stable") {
    return {
      tone: "neutral",
      description: "Final-eight form remained within the model's stable range.",
    };
  }
  return {
    tone: "neutral",
    description: label ? "Artifact-supplied trajectory context." : "Trajectory context is unavailable.",
  };
}

type BuildNflTeamModelTrendInput = {
  teamSlug: string;
  teamAbbr: string;
  /** Canonical current-rating board (Phase 1). The only source for "current" OVR/rank. */
  currentRating: CurrentRatingBoard | null | undefined;
  /** 2025 v0.3.1 artifacts -- unrelated historical trajectory context, unchanged by this migration. */
  fullSeason: NflV03FullSeasonArtifact | null | undefined;
  finalEight: NflV03FinalEightArtifact | null | undefined;
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isCurrentPublicScale(meta: NflV03Meta | null | undefined): meta is NflV03Meta {
  return meta?.modelVersion === NFL_V03_MODEL_VERSION && meta.frozenPublicScaleDivisor === 0.733;
}

function sharedString(values: Array<string | null | undefined>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return present.every((value) => value === present[0]) ? present[0] : null;
}

function sharedNumber(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => finiteOrNull(value) !== null);
  if (present.length === 0) return null;
  return present.every((value) => value === present[0]) ? present[0] : null;
}

export function normalizeNflTrendDelta(value: number | null | undefined): number | null {
  const finite = finiteOrNull(value);
  if (finite === null) return null;
  const rounded = Number(finite.toFixed(2));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatNflTrendDelta(value: number | null | undefined): string | null {
  const normalized = normalizeNflTrendDelta(value);
  if (normalized === null) return null;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(2)}`;
}

function currentUniversalStateLabel(row: CurrentRatingRow | null): string | null {
  if (!row) return null;
  return row.state === "live" ? "2026 season-to-date" : "2026 preseason projection";
}

export function buildNflTeamModelTrend({
  teamSlug,
  teamAbbr,
  currentRating,
  fullSeason,
  finalEight,
}: BuildNflTeamModelTrendInput): NflTeamModelTrendViewModel {
  const currentRow = currentRating?.teams.find((team) => team.abbr === teamAbbr) ?? null;
  const stateLabel = currentUniversalStateLabel(currentRow);
  const sincePreseasonDelta = currentRow
    ? normalizeNflTrendDelta(currentRow.rating - currentRow.preseasonV04Rating)
    : null;

  const fullMetaValid = isCurrentPublicScale(fullSeason?._meta);
  const finalMetaValid = isCurrentPublicScale(finalEight?._meta);
  const sameComparisonScale = Boolean(
    fullMetaValid &&
      finalMetaValid &&
      fullSeason!._meta.season === finalEight!._meta.season &&
      fullSeason!._meta.frozenPublicScaleDivisor === finalEight!._meta.frozenPublicScaleDivisor,
  );
  const fullTeam = fullMetaValid
    ? fullSeason.teams.find((team) => team.slug === teamSlug) ?? null
    : null;
  const finalTeam = finalMetaValid
    ? finalEight.teams.find((team) => team.slug === teamSlug) ?? null
    : null;

  const fullSeasonRating = fullTeam
    ? publicScaleEquivalent(finiteOrNull(fullTeam.adjustedComposite))
    : null;
  const finalEightRating = finalTeam
    ? publicScaleEquivalent(finiteOrNull(finalTeam.adjustedComposite))
    : null;
  const delta = sameComparisonScale && fullSeasonRating !== null && finalEightRating !== null
    ? normalizeNflTrendDelta(finalEightRating - fullSeasonRating)
    : null;

  const comparisonMetas = [
    fullMetaValid ? fullSeason._meta : null,
    finalMetaValid ? finalEight._meta : null,
  ].filter((meta): meta is NflV03Meta => meta !== null);
  const metadataGeneratedAt = sharedString(comparisonMetas.map((meta) => meta.generatedAt));
  const metadataValidationStatus = sharedString(comparisonMetas.map((meta) => meta.validationStatus));
  const comparisonSeason = sharedNumber(comparisonMetas.map((meta) => meta.season));
  const sourceLabel = currentRow
    ? `${NFL_V04_MODEL_VERSION} · ${stateLabel}${comparisonSeason ? ` · ${comparisonSeason} comparison windows` : ""}`
    : comparisonMetas[0]
      ? `${comparisonMetas[0].modelVersion} · ${comparisonMetas[0].season} comparison windows`
      : null;

  return {
    teamSlug,
    currentUniversalRating: finiteOrNull(currentRow?.rating),
    currentUniversalRank: finiteOrNull(currentRow?.rank),
    currentRatingSeason: finiteOrNull(currentRating?.season),
    currentUniversalStateLabel: stateLabel,
    preseasonV04Rating: finiteOrNull(currentRow?.preseasonV04Rating),
    sincePreseasonDelta,
    comparisonSeason,
    fullSeasonRating,
    finalEightRating,
    delta,
    trajectoryLabel: finalTeam?.trajectoryLabel?.trim() || null,
    trajectoryLambda: finalMetaValid ? finiteOrNull(finalEight._meta.trajectory.lambda) : null,
    l8OpponentStrength: finiteOrNull(finalTeam?.l8OpponentStrength),
    provenance: sourceLabel
      ? {
          sourceKind: "model",
          sourceLabel,
          generatedAt: metadataGeneratedAt,
          season: currentRating?.season ?? comparisonSeason,
          validationStatus: metadataValidationStatus,
        }
      : null,
  };
}
