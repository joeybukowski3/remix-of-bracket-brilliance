import type { CSSProperties } from "react";
import {
  CalendarClock,
  ChartNoAxesCombined,
  CircleGauge,
  Clock3,
  Handshake,
  Minus,
  MoonStar,
  Plane,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { TREND_TIER_PRESENTATION, resolveTrendTeam } from "@/components/nfl/trends/trendPresentationConfig";
import {
  TREND_TIER_LABELS,
  formatTrendPercent,
  formatTrendRecord,
  formatTrendRoi,
  type SituationalTrendMetrics,
  type TrendTier,
} from "@/lib/nfl/situationalTrends";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Bye Context": MoonStar,
  "Divisional / Familiarity": Handshake,
  "Market Role": CircleGauge,
  "Previous-Game Result": RotateCcw,
  "Prime Time / Scheduling": Clock3,
  "Schedule & Rest": CalendarClock,
  "Scoring / Momentum": ChartNoAxesCombined,
  Travel: Plane,
};

export function TrendTierBadge({ tier, className }: { tier: TrendTier; className?: string }) {
  const treatment = TREND_TIER_PRESENTATION[tier];
  const Icon = treatment.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.11em]", treatment.badge, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {TREND_TIER_LABELS[tier]}
    </span>
  );
}

export function TrendCategoryBadge({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICONS[category] ?? ChartNoAxesCombined;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600", className)}>
      <span className="inline-grid h-6 w-6 place-items-center rounded-md bg-slate-200/80 text-slate-700" aria-hidden>
        <Icon className="h-3.5 w-3.5" />
      </span>
      {category}
    </span>
  );
}

export function NflTrendTeamIdentity({
  abbr,
  name,
  side,
  compact = false,
  align = "left",
  inverse = false,
}: {
  abbr: string;
  name?: string;
  side?: "Away" | "Home";
  compact?: boolean;
  align?: "left" | "right";
  inverse?: boolean;
}) {
  const team = resolveTrendTeam(abbr, name);
  const style = { "--trend-team-color": team.color } as CSSProperties;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2.5",
        align === "right" && "flex-row-reverse text-right",
      )}
      style={style}
      data-team={team.abbr}
    >
      <span
        className={cn("grid shrink-0 place-items-center rounded-lg border bg-white", compact ? "h-9 w-9" : "h-11 w-11")}
        style={{ borderColor: team.color }}
      >
        <TeamLogo name={team.name} logo={team.logo} fallbackLabel={team.abbr} className={compact ? "h-7 w-7" : "h-9 w-9"} />
      </span>
      <span className="min-w-0">
        {side && <span className={cn("block text-[9px] font-bold uppercase tracking-[0.14em]", inverse ? "text-slate-300" : "text-slate-500")}>{side}</span>}
        <span className={cn("block font-black uppercase leading-none", inverse ? "text-white" : "text-slate-950", compact ? "text-sm" : "text-base")}>{team.abbr}</span>
        <span className={cn("mt-1 block truncate font-semibold", inverse ? "text-slate-300" : "text-slate-600", compact ? "text-[10px]" : "text-xs")}>{team.name}</span>
      </span>
    </div>
  );
}

export function NflTrendMatchupIdentity({
  away,
  home,
  compact = false,
}: {
  away: { abbr: string; name?: string };
  home: { abbr: string; name?: string };
  compact?: boolean;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
      <NflTrendTeamIdentity abbr={away.abbr} name={away.name} side="Away" compact={compact} />
      <span className="rounded-md bg-slate-200 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">at</span>
      <NflTrendTeamIdentity abbr={home.abbr} name={home.name} side="Home" compact={compact} align="right" />
    </div>
  );
}

export function RoiSignal({ value }: { value: number | null }) {
  const positive = (value ?? 0) > 0;
  const negative = (value ?? 0) < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
  const label = positive ? "Positive historical ROI" : negative ? "Negative historical ROI" : "Neutral historical ROI";
  return (
    <span
      aria-label={label}
      title={`${label}; descriptive, not a recommendation`}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        positive && "border-emerald-200 bg-emerald-50 text-emerald-800",
        negative && "border-red-200 bg-red-50 text-red-800",
        !positive && !negative && "border-slate-200 bg-slate-100 text-slate-700",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {formatTrendRoi(value)} ROI
    </span>
  );
}

export function HistoricalMetricBlock({
  window,
  metrics,
  compact = false,
}: {
  window: "fullHistory" | "recentForm";
  metrics: SituationalTrendMetrics;
  compact?: boolean;
}) {
  const isRecent = window === "recentForm";
  const label = isRecent ? "Recent form" : "Full history";
  const range = isRecent ? "2021–2025" : "2011–2025";

  if (compact) {
    return (
      <div className={cn("min-w-0 border-l pl-3", isRecent ? "border-sky-300" : "border-slate-400")}>
        <p className={cn("text-[9px] font-bold uppercase tracking-[0.11em]", isRecent ? "text-sky-800" : "text-slate-600")}>{label}</p>
        <p className="text-[10px] font-semibold text-slate-500">{range}</p>
        <p className="mt-1 text-xl font-black tabular-nums tracking-tight text-slate-950">{formatTrendPercent(metrics.atsWinPct)}</p>
        <p className="text-[10px] tabular-nums text-slate-600">{formatTrendRecord(metrics)} ATS</p>
        <div className="mt-1.5"><RoiSignal value={metrics.atsRoiAtMinus110} /></div>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 rounded-lg border border-t-2 p-3", isRecent ? "border-sky-300 bg-sky-50/60" : "border-slate-300 bg-slate-50")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={cn("text-[10px] font-black uppercase tracking-[0.12em]", isRecent ? "text-sky-800" : "text-slate-700")}>{label}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{range}</p>
        </div>
        <RoiSignal value={metrics.atsRoiAtMinus110} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-black tabular-nums tracking-tight text-slate-950">{formatTrendPercent(metrics.atsWinPct)}</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">ATS win rate</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold tabular-nums text-slate-900">{formatTrendRecord(metrics)}</p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">W-L-P · n={metrics.qualifyingTeamGames}</p>
        </div>
      </div>
    </div>
  );
}
