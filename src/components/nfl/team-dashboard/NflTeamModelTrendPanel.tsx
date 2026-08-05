import { useMemo } from "react";
import NflOptionalValue from "@/components/nfl/provenance/NflOptionalValue";
import NflProvenanceDetails from "@/components/nfl/provenance/NflProvenanceDetails";
import NflSourceTag from "@/components/nfl/provenance/NflSourceTag";
import { useNflV03Artifacts } from "@/hooks/useNflV03Artifacts";
import { useNflV03PublicPowerRatings } from "@/hooks/useNflV03PublicPowerRatings";
import {
  buildNflTeamModelTrend,
  formatNflTrendDelta,
  getNflTrajectoryPresentation,
  type NflTrajectoryTone,
  type NflTeamModelTrendViewModel,
} from "@/lib/nfl/teamModelTrend";
import { cn } from "@/lib/utils";

const CURRENT_RATING_SEASON = 2026;
const COMPARISON_SEASON = 2025;

const TRAJECTORY_CLASSES: Record<NflTrajectoryTone, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  negative: "border-red-200 bg-red-50 text-red-700",
  caution: "border-amber-300 bg-amber-50 text-amber-900",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
};

export default function NflTeamModelTrendPanel({ teamSlug }: { teamSlug: string }) {
  const publicRatings = useNflV03PublicPowerRatings(CURRENT_RATING_SEASON);
  const comparisonArtifacts = useNflV03Artifacts(COMPARISON_SEASON);
  const trend = useMemo(
    () => buildNflTeamModelTrend({
      teamSlug,
      publicBoard: publicRatings.data,
      fullSeason: comparisonArtifacts.data?.artifacts.fullSeason,
      finalEight: comparisonArtifacts.data?.artifacts.finalEight,
    }),
    [comparisonArtifacts.data, publicRatings.data, teamSlug],
  );

  return (
    <NflTeamModelTrendView
      trend={trend}
      loading={publicRatings.loading || comparisonArtifacts.loading}
    />
  );
}

export function NflTeamModelTrendView({
  trend,
  loading = false,
}: {
  trend: NflTeamModelTrendViewModel;
  loading?: boolean;
}) {
  const trajectory = getNflTrajectoryPresentation(trend.trajectoryLabel);
  const missingLabel = loading ? "Loading…" : "Unavailable";
  const ratingStateDetail = [
    trend.currentPublicRank != null ? `Public rank #${trend.currentPublicRank}` : null,
    trend.currentRatingStateLabel,
  ].filter(Boolean).join(" · ") || undefined;
  const comparisonDetail = trend.comparisonSeason
    ? `${trend.comparisonSeason} public-scale equivalent`
    : "Public-scale equivalent";
  const deltaTone = trend.delta == null || trend.delta === 0
    ? "text-slate-900"
    : trend.delta > 0
      ? "text-emerald-700"
      : "text-red-600";

  return (
    <section
      aria-labelledby="nfl-current-model-trend-heading"
      className="overflow-hidden rounded-2xl border border-blue-200 border-l-4 border-l-blue-600 bg-white shadow-sm"
    >
      <div className="border-b border-slate-200 bg-blue-50/60 px-4 py-4 sm:px-6">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">Current model</div>
        <h2 id="nfl-current-model-trend-heading" className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
          Current Model Trend
        </h2>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-600 sm:text-sm sm:leading-6">
          The generated public rating is separate from the curated Guide outlook. Historical windows use the same frozen public scale for a like-for-like comparison.
        </p>
      </div>

      <div className="grid grid-cols-2 border-b border-slate-200 lg:grid-cols-5">
        <TrendMetric
          label="Current public rating"
          value={formatRating(trend.currentPublicRating)}
          unavailableLabel={missingLabel}
          detail={ratingStateDetail}
          className="bg-blue-50/40 text-blue-800"
        />
        <TrendMetric
          label="Full season"
          value={formatRating(trend.fullSeasonRating)}
          unavailableLabel={missingLabel}
          detail={comparisonDetail}
        />
        <TrendMetric
          label="Final eight"
          value={formatRating(trend.finalEightRating)}
          unavailableLabel={missingLabel}
          detail={comparisonDetail}
        />
        <TrendMetric
          label="Full → final 8"
          value={formatNflTrendDelta(trend.delta)}
          unavailableLabel={missingLabel}
          detail="Final eight minus full season"
          valueClassName={deltaTone}
        />
        <TrendMetric
          label="Final-8 opponent strength"
          value={formatNflTrendDelta(trend.l8OpponentStrength)}
          unavailableLabel={missingLabel}
          detail="Mean opponent composite · 0 = league average · higher = tougher"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Trajectory</span>
          <span
            className={cn(
              "inline-flex min-w-0 max-w-full self-start whitespace-normal break-words rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-4 tracking-wider",
              TRAJECTORY_CLASSES[trajectory.tone],
            )}
            data-trajectory-tone={trajectory.tone}
          >
            {trend.trajectoryLabel ?? missingLabel}
          </span>
          <p className="min-w-0 text-xs leading-5 text-slate-600">{trajectory.description}</p>
        </div>

        <p className="text-xs leading-5 text-slate-500">
          {trend.trajectoryLambda === 0
            ? "The artifact reports trajectory lambda = 0, so this label does not independently change the public power rating."
            : "Late-season trajectory is shown as analytical context and is not applied by this presentation layer."}
        </p>

        {trend.provenance ? (
          <NflProvenanceDetails provenance={trend.provenance} />
        ) : (
          <NflSourceTag kind="unavailable" />
        )}
      </div>
    </section>
  );
}

function formatRating(value: number | null): string | null {
  return value == null || !Number.isFinite(value) ? null : value.toFixed(1);
}

function TrendMetric({
  label,
  value,
  unavailableLabel,
  detail,
  className,
  valueClassName,
}: {
  label: string;
  value: string | null;
  unavailableLabel: string;
  detail?: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0 border-b border-r border-slate-100 p-4 last:border-r-0 lg:border-b-0", className)}>
      <div className="text-[9px] font-black uppercase leading-4 tracking-wider text-slate-500">{label}</div>
      <NflOptionalValue
        value={value}
        unavailableLabel={unavailableLabel}
        className={cn("mt-1 block break-words text-xl font-black tabular-nums text-slate-950 sm:text-2xl", valueClassName)}
      />
      {detail ? <div className="mt-1 break-words text-[10px] leading-4 text-slate-500">{detail}</div> : null}
    </div>
  );
}
