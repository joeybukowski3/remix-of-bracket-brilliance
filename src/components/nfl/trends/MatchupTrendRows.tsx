import type { CSSProperties } from "react";
import { ChevronRight, Clock3 } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { HistoricalMetricBlock, RoiSignal, TrendTierBadge } from "@/components/nfl/trends/TrendPresentation";
import { TREND_TIER_PRESENTATION, resolveTrendTeam } from "@/components/nfl/trends/trendPresentationConfig";
import {
  TREND_STATUS_LABELS,
  TREND_TIER_LABELS,
  formatTrendPercent,
  formatTrendRecord,
  type ResolvedTrendQualifier,
  type SituationalTrendEvaluation,
  type SituationalTrendResearch,
  type TrendTier,
} from "@/lib/nfl/situationalTrends";
import { cn } from "@/lib/utils";

const TIERS: TrendTier[] = ["NOTEWORTHY", "CONTEXTUAL", "CLASSIC_ANGLE"];

function TierGroupHeader({ tier, count }: { tier: TrendTier; count: number }) {
  const treatment = TREND_TIER_PRESENTATION[tier];
  const Icon = treatment.Icon;
  return (
    <div className={cn("flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] sm:px-4", treatment.label)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {TREND_TIER_LABELS[tier]} · {count}
    </div>
  );
}

function QualifierExpandedDetail({ qualifier }: { qualifier: ResolvedTrendQualifier }) {
  const { trend } = qualifier;
  return (
    <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 px-3 py-3 text-[11px] leading-5 text-slate-700 sm:px-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">What this means</h4>
          <p className="mt-1 font-medium text-slate-800">{qualifier.reason}</p>
        </div>
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Exact definition</h4>
          <p className="mt-1">{trend.definition}</p>
        </div>
      </div>
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Research interpretation</h4>
        <p className="mt-1">{trend.articleNote}</p>
        {trend.robustnessInterpretation && <p className="mt-1"><strong className="text-slate-800">Robustness:</strong> {trend.robustnessLabel}. {trend.robustnessInterpretation}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <HistoricalMetricBlock window="fullHistory" metrics={trend.fullHistory} />
        <HistoricalMetricBlock window="recentForm" metrics={trend.recentForm} />
      </div>
      {trend.stability && (
        <p>
          <strong className="font-bold text-slate-900">Stability:</strong> {trend.stability.recentChange ?? "Unreported"}
          {trend.stability.eraDirectionReverses ? " · direction reverses across eras" : ""}
          {trend.stability.recentMateriallyDiffersFromFullHistory ? " · recent materially differs from full history" : ""}
        </p>
      )}
      {qualifier.variants.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Predefined variants</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {qualifier.variants.map((variant) => (
              <div key={variant.id} className="rounded-md border border-slate-200 bg-white p-2">
                <p className="text-xs font-bold text-slate-900">{variant.label}</p>
                {variant.definition && <p className="mt-0.5 text-[11px] text-slate-600">{variant.definition}</p>}
                <p className="mt-1 tabular-nums text-[11px] text-slate-700">Full {formatTrendPercent(variant.fullHistory.atsWinPct)} · Recent {formatTrendPercent(variant.recentForm.atsWinPct)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QualifierRow({ qualifier }: { qualifier: ResolvedTrendQualifier }) {
  const { trend } = qualifier;
  const team = resolveTrendTeam(qualifier.team);
  const subLabel = trend.earlySeasonWeek ? `Week ${trend.earlySeasonWeek}` : trend.category;
  const style = { borderLeftColor: team.color } as CSSProperties;

  return (
    <details className="group border-b border-slate-200 border-l-2 last:border-b-0" style={style} data-tier={trend.tier}>
      <summary className="grid min-h-[44px] cursor-pointer list-none items-center gap-x-2 px-2 py-2 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:px-3 [&::-webkit-details-marker]:hidden md:grid-cols-[100px_minmax(0,1.05fr)_100px_84px_84px_92px_78px_minmax(0,1.2fr)_24px]">
        <div className="flex items-start gap-2 md:hidden">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border bg-white" style={{ borderColor: team.color }}>
            <TeamLogo name={team.name} logo={team.logo} fallbackLabel={team.abbr} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black leading-tight text-slate-950">{team.abbr} <span className="font-semibold text-slate-700">{trend.name}</span></p>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{TREND_TIER_LABELS[trend.tier]} · {trend.confidence}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] tabular-nums text-slate-600">
              <span>Full {formatTrendPercent(trend.fullHistory.atsWinPct)}</span>
              <span aria-hidden>|</span>
              <span>Recent {formatTrendPercent(trend.recentForm.atsWinPct)}</span>
              <RoiSignal value={trend.recentForm.atsRoiAtMinus110} />
            </p>
            <p className="mt-1 truncate text-[10px] text-slate-600"><span className="font-semibold text-slate-700">Why:</span> {qualifier.reason}</p>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
        </div>

        <span className="hidden min-w-0 md:block">
          <span className="flex items-center gap-1.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded border bg-white" style={{ borderColor: team.color }}>
              <TeamLogo name={team.name} logo={team.logo} fallbackLabel={team.abbr} className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-black text-slate-950">{team.abbr}</span>
          </span>
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block truncate text-[11px] font-bold text-slate-950">{trend.name}</span>
          <span className="block truncate text-[9px] font-semibold text-slate-500">{subLabel}</span>
        </span>
        <span className="hidden md:block"><TrendTierBadge tier={trend.tier} /></span>
        <span className="hidden md:block">
          <span className="block text-[11px] font-black tabular-nums text-slate-950">{formatTrendPercent(trend.fullHistory.atsWinPct)}</span>
          <span className="block text-[9px] tabular-nums text-slate-500">{formatTrendRecord(trend.fullHistory)}</span>
        </span>
        <span className="hidden md:block">
          <span className="block text-[11px] font-black tabular-nums text-slate-950">{formatTrendPercent(trend.recentForm.atsWinPct)}</span>
          <span className="block text-[9px] tabular-nums text-slate-500">{formatTrendRecord(trend.recentForm)}</span>
        </span>
        <span className="hidden md:block"><RoiSignal value={trend.recentForm.atsRoiAtMinus110} /></span>
        <span className="hidden truncate text-[10px] font-bold text-slate-700 md:block">{trend.confidence}</span>
        <span className="hidden truncate text-[11px] text-slate-600 md:block" title={qualifier.reason}>{qualifier.reason}</span>
        <span className="hidden md:grid md:h-6 md:w-6 md:place-items-center md:rounded md:border md:border-slate-300 md:bg-white md:text-slate-600 group-hover:md:border-slate-400">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
        </span>
      </summary>
      <QualifierExpandedDetail qualifier={qualifier} />
    </details>
  );
}

/**
 * Compact, scan-first presentation of matchup-confirmed trend qualifiers.
 * Reuses the already-resolved directional qualification and research data;
 * this component performs no qualification logic of its own.
 */
export function MatchupQualifierRows({ qualifiers }: { qualifiers: readonly ResolvedTrendQualifier[] }) {
  const groups = TIERS.map((tier) => ({ tier, rows: qualifiers.filter((qualifier) => qualifier.trend.tier === tier) })).filter((group) => group.rows.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      {groups.map(({ tier, rows }) => (
        <div key={tier}>
          <TierGroupHeader tier={tier} count={rows.length} />
          <div>{rows.map((qualifier) => <QualifierRow key={`${qualifier.team}-${qualifier.trendId}`} qualifier={qualifier} />)}</div>
        </div>
      ))}
    </div>
  );
}

export function MatchupPendingRows({
  pending,
  trendById,
}: {
  pending: readonly SituationalTrendEvaluation[];
  trendById: Map<string, SituationalTrendResearch>;
}) {
  if (pending.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-slate-50/60">
      {pending.map((row) => {
        const trend = trendById.get(row.trendId);
        const team = resolveTrendTeam(row.team);
        return (
          <div key={`${row.team}-${row.trendId}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-slate-200 px-2.5 py-1.5 text-[11px] last:border-b-0 sm:px-3">
            <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded border bg-white" style={{ borderColor: team.color }}>
              <TeamLogo name={team.name} logo={team.logo} fallbackLabel={team.abbr} className="h-4 w-4" />
            </span>
            <span className="w-9 shrink-0 text-[10px] font-black text-slate-900">{team.abbr}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{trend?.name ?? row.trendId}</span>
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-500">{TREND_STATUS_LABELS[row.status]}</span>
            <span className="hidden min-w-0 flex-1 basis-full truncate text-slate-500 sm:block sm:basis-auto" title={row.reason}>{row.reason}</span>
          </div>
        );
      })}
    </div>
  );
}
