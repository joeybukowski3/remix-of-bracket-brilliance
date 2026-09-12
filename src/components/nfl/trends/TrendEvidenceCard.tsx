import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  HistoricalMetricBlock,
  NflTrendTeamIdentity,
  TrendCategoryBadge,
  TrendTierBadge,
} from "@/components/nfl/trends/TrendPresentation";
import { TREND_TIER_PRESENTATION, resolveTrendTeam } from "@/components/nfl/trends/trendPresentationConfig";
import {
  formatTrendPercent,
  formatTrendRecord,
  type ResolvedTrendQualifier,
  type SituationalTrendResearch,
  type SituationalTrendVariant,
} from "@/lib/nfl/situationalTrends";

function VariantDetail({ variant }: { variant: SituationalTrendVariant }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold text-slate-900">{variant.label}</p>
        <p className="text-[10px] text-slate-500">{variant.classification} · {variant.confidence}</p>
      </div>
      {variant.definition && <p className="mt-1 text-[11px] leading-4 text-slate-600">{variant.definition}</p>}
      <p className="mt-1.5 text-[11px] tabular-nums text-slate-700">
        Full {formatTrendRecord(variant.fullHistory)} · {formatTrendPercent(variant.fullHistory.atsWinPct)} · Recent {formatTrendPercent(variant.recentForm.atsWinPct)}
      </p>
    </div>
  );
}

export function TrendEvidenceCard({
  trend,
  team,
  reason,
  variants = [],
  className,
}: {
  trend: SituationalTrendResearch;
  team?: string;
  reason?: string;
  variants?: SituationalTrendVariant[];
  className?: string;
}) {
  const treatment = TREND_TIER_PRESENTATION[trend.tier];
  const teamIdentity = team ? resolveTrendTeam(team) : null;
  const style = teamIdentity ? { borderLeftColor: teamIdentity.color } as CSSProperties : undefined;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-l bg-white",
        treatment.card,
        className,
      )}
      style={style}
      data-tier={trend.tier}
    >
      <div className={cn("relative px-3 py-3 sm:px-4", treatment.header)}>
        {teamIdentity && <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: teamIdentity.color }} aria-hidden />}
        <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
          <div className="min-w-0">
            {team ? (
              <NflTrendTeamIdentity abbr={team} compact inverse={trend.tier === "NOTEWORTHY"} />
            ) : (
              <TrendCategoryBadge category={trend.category} className={trend.tier === "NOTEWORTHY" ? "text-slate-300 [&>span]:bg-slate-800 [&>span]:text-slate-200" : undefined} />
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
            <TrendTierBadge tier={trend.tier} />
            <span className={cn("text-[9px] font-semibold uppercase tracking-[0.08em]", trend.tier === "NOTEWORTHY" ? "text-slate-300" : "text-slate-600")}>{trend.category}</span>
          </div>
        </div>
        <h3 className="mt-3 text-base font-black tracking-tight">{trend.name}</h3>
        <p className={cn("mt-1 text-[10px] font-semibold", trend.tier === "NOTEWORTHY" ? "text-slate-300" : "text-slate-600")}>{trend.classification} · {trend.confidence} confidence</p>
      </div>

      <div className="space-y-4 px-3 py-3 sm:px-4 sm:py-4">
        {reason && (
          <div className="border-b border-slate-200 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">Why it applies</p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-800">{reason}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          <HistoricalMetricBlock window="fullHistory" metrics={trend.fullHistory} />
          <HistoricalMetricBlock window="recentForm" metrics={trend.recentForm} />
        </div>

        <div className="grid gap-2 rounded-lg bg-slate-100/80 p-3 text-[11px] leading-4 text-slate-700 sm:grid-cols-2">
          <p><strong className="font-bold text-slate-950">Evidence:</strong> {trend.robustnessLabel ? `${trend.robustnessLabel} / ` : ""}{trend.classification}</p>
          <p><strong className="font-bold text-slate-950">Confidence:</strong> {trend.confidence}</p>
        </div>

        <p className="text-xs font-medium leading-5 text-slate-700">{trend.articleNote}</p>

        {variants.length > 0 && (
          <details className="group rounded-lg border border-slate-300 bg-white">
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
              Relevant predefined {variants.length === 1 ? "variant" : "variants"} ({variants.length})
            </summary>
            <div className="grid gap-2 border-t border-slate-200 p-2.5 sm:grid-cols-2">
              {variants.map((variant) => <VariantDetail key={variant.id} variant={variant} />)}
            </div>
          </details>
        )}
      </div>
    </article>
  );
}

export function QualifierEvidenceCard({ qualifier }: { qualifier: ResolvedTrendQualifier }) {
  return <TrendEvidenceCard trend={qualifier.trend} team={qualifier.team} reason={qualifier.reason} variants={qualifier.variants} />;
}
