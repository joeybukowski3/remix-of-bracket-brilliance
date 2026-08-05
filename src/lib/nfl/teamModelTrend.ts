import type { NflProvenanceViewModel } from "@/lib/nfl/provenance";
import type { NflPublicPowerBoard } from "@/lib/nfl/publicPowerRatings";
import {
  NFL_V03_MODEL_VERSION,
  publicScaleEquivalent,
  type NflV03FinalEightArtifact,
  type NflV03FullSeasonArtifact,
  type NflV03Meta,
} from "@/lib/nfl/v03Review";

export type NflTeamModelTrendViewModel = {
  teamSlug: string;
  modelVersion: string | null;
  currentPublicRating: number | null;
  currentPublicRank: number | null;
  currentRatingSeason: number | null;
  currentSourceSeason: number | null;
  currentRatingStateLabel: string | null;
  comparisonSeason: number | null;
  fullSeasonRating: number | null;
  finalEightRating: number | null;
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
  publicBoard: NflPublicPowerBoard | null | undefined;
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

function ratingStateLabel(board: NflPublicPowerBoard): string {
  return board.selectedState === "preseason"
    ? `${board.season} preseason public board`
    : `${board.season} full-season public board`;
}

export function buildNflTeamModelTrend({
  teamSlug,
  publicBoard,
  fullSeason,
  finalEight,
}: BuildNflTeamModelTrendInput): NflTeamModelTrendViewModel {
  const publicTeam = publicBoard?.teams.find((team) => team.slug === teamSlug) ?? null;
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
  const metadataGeneratedAt = sharedString([
    publicBoard?.generatedAt,
    ...comparisonMetas.map((meta) => meta.generatedAt),
  ]);
  const metadataValidationStatus = sharedString([
    publicBoard?.validationStatus,
    ...comparisonMetas.map((meta) => meta.validationStatus),
  ]);
  const comparisonSeason = sharedNumber(comparisonMetas.map((meta) => meta.season));
  const sourceMeta = publicBoard ?? comparisonMetas[0] ?? null;
  const stateLabel = publicBoard ? ratingStateLabel(publicBoard) : null;
  const sourceLabel = publicBoard
    ? `${publicBoard.modelVersion} · ${stateLabel}${comparisonSeason ? ` · ${comparisonSeason} comparison windows` : ""}`
    : sourceMeta
      ? `${sourceMeta.modelVersion} · ${sourceMeta.season} comparison windows`
      : null;

  return {
    teamSlug,
    modelVersion: publicBoard?.modelVersion ?? comparisonMetas[0]?.modelVersion ?? null,
    currentPublicRating: finiteOrNull(publicTeam?.publicRating),
    currentPublicRank: finiteOrNull(publicTeam?.rank),
    currentRatingSeason: finiteOrNull(publicBoard?.season),
    currentSourceSeason: finiteOrNull(publicBoard?.sourceSeason),
    currentRatingStateLabel: stateLabel,
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
          season: publicBoard?.season ?? comparisonSeason,
          validationStatus: metadataValidationStatus,
        }
      : null,
  };
}
