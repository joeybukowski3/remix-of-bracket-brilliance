import { useState } from "react";
import type { ComponentType } from "react";
import { CheckCircle2, Flame, Gauge, Percent, Route, Target } from "lucide-react";
import { formatNullableNumber, formatNullablePercent } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge } from "@/lib/cfb/comparison";
import { CFB_SEASON_STAT_RANK_DIRECTIONS, type CfbRankedStatMetric } from "@/lib/cfb/seasonStats/rankSeasonStats";
import type { CfbMatchupSeasonStatsContext } from "@/lib/cfb/seasonStatsPresentation";
import { cn } from "@/lib/utils";
import CollegeFootballComparisonRow from "./CollegeFootballComparisonRow";

type Props = {
  awayShortName: string;
  homeShortName: string;
  context: CfbMatchupSeasonStatsContext;
  awayColor: string;
  homeColor: string;
};

type SeasonStatRow = {
  key: CfbRankedStatMetric;
  label: string;
  icon: ComponentType<{ className?: string }>;
  format: (value: number | null) => string;
};

const OFFENSE_ROWS: SeasonStatRow[] = [
  { key: "pointsPerGame", label: "Points/Game", icon: Target, format: (v) => formatNullableNumber(v, 1) },
  { key: "yardsPerPlay", label: "Yards/Play", icon: Route, format: (v) => formatNullableNumber(v, 1) },
  { key: "pointsPerPlay", label: "Points/Play", icon: Flame, format: (v) => formatNullableNumber(v, 2) },
  { key: "thirdDownPct", label: "3rd Down %", icon: Percent, format: (v) => formatNullablePercent(v, 1) },
  { key: "completionPct", label: "Completion %", icon: CheckCircle2, format: (v) => formatNullablePercent(v, 1) },
  { key: "yardsPerRush", label: "Rush Yards/Att", icon: Gauge, format: (v) => formatNullableNumber(v, 2) },
  { key: "yardsPerPass", label: "Pass Yards/Att", icon: Gauge, format: (v) => formatNullableNumber(v, 2) },
];

const DEFENSE_ROWS: SeasonStatRow[] = [
  { key: "pointsAllowedPerGame", label: "Opp Points/Game", icon: Target, format: (v) => formatNullableNumber(v, 1) },
  { key: "yardsPerPlayAllowed", label: "Opp Yards/Play", icon: Route, format: (v) => formatNullableNumber(v, 1) },
  { key: "opponentPointsPerPlay", label: "Opp Points/Play", icon: Flame, format: (v) => formatNullableNumber(v, 2) },
  { key: "opponentThirdDownPct", label: "Opp 3rd Down %", icon: Percent, format: (v) => formatNullablePercent(v, 1) },
  {
    key: "opponentCompletionPct",
    label: "Opp Completion %",
    icon: CheckCircle2,
    format: (v) => formatNullablePercent(v, 1),
  },
  { key: "yardsPerRushAllowed", label: "Opp Rush Yards/Att", icon: Gauge, format: (v) => formatNullableNumber(v, 2) },
  { key: "yardsPerPassAllowed", label: "Opp Pass Yards/Att", icon: Gauge, format: (v) => formatNullableNumber(v, 2) },
];

function rankBadge(rank: number | undefined): string | null {
  return rank == null ? null : `#${rank}`;
}

/**
 * Relative-magnitude bar fill (0-100), mirrored as each side's share of the
 * combined total. Null-safe, presentation-only: a value with no real
 * counterpart on the other side (e.g. the NDSU no-prior-season case) still
 * renders its own bar at full width rather than looking empty/broken.
 */
function barShare(value: number | null, other: number | null): number {
  if (value == null) return 0;
  if (other == null) return 100;
  const total = value + other;
  if (total <= 0) return 0;
  return (value / total) * 100;
}

type SectionTab = "offense" | "defense" | "off-vs-def";

const TABS: { key: SectionTab; label: string }[] = [
  { key: "offense", label: "Offense" },
  { key: "defense", label: "Defense" },
  { key: "off-vs-def", label: "Off vs Def" },
];

/**
 * Renders one coherent season's stats (see selectMatchupSeasonStatsContext) —
 * never a mix of two seasons. Ranks come from the generated artifact
 * (context.awayRanks/homeRanks); this component never computes a rank
 * itself. Edge highlighting and bar fills are display-only — never a
 * betting/model signal, and bar width is a same-row relative share, not a
 * new statistic.
 */
export default function CollegeFootballSeasonStatsComparison({
  awayShortName,
  homeShortName,
  context,
  awayColor,
  homeColor,
}: Props) {
  const { away, home, awayRanks, homeRanks } = context;
  const [tab, setTab] = useState<SectionTab>("offense");

  function renderSection(title: string, rows: SeasonStatRow[], accent: "away" | "home" | "neutral") {
    const accentColor = accent === "away" ? awayColor : accent === "home" ? homeColor : "#94a3b8";
    return (
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex items-stretch">
          <span aria-hidden="true" className="w-1 shrink-0" style={{ background: accentColor }} />
          <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide">
            <div className="truncate text-right" style={{ color: awayColor }}>
              {awayShortName}
            </div>
            <div className="text-center text-slate-500">{title}</div>
            <div className="truncate text-left" style={{ color: homeColor }}>
              {homeShortName}
            </div>
          </div>
        </div>
        {rows.map((row) => {
          const direction = CFB_SEASON_STAT_RANK_DIRECTIONS[row.key];
          const awayRaw = away[row.key];
          const homeRaw = home[row.key];
          const edge =
            direction === "higher-is-better"
              ? higherIsBetterEdge(awayRaw, homeRaw)
              : lowerIsBetterEdge(awayRaw, homeRaw);
          return (
            <CollegeFootballComparisonRow
              key={row.key}
              label={row.label}
              icon={row.icon}
              awayValue={row.format(awayRaw)}
              homeValue={row.format(homeRaw)}
              awayRank={awayRaw != null ? rankBadge(awayRanks[row.key]) : null}
              homeRank={homeRaw != null ? rankBadge(homeRanks[row.key]) : null}
              awayBarPercent={barShare(awayRaw, homeRaw)}
              homeBarPercent={barShare(homeRaw, awayRaw)}
              awayColor={awayColor}
              homeColor={homeColor}
              edge={edge}
            />
          );
        })}
      </div>
    );
  }

  const offenseCard = renderSection("Offense", OFFENSE_ROWS, "away");
  const defenseCard = renderSection("Defense", DEFENSE_ROWS, "home");

  return (
    <div>
      {/* Mobile: tabbed single-card view to avoid stacking two full cards. */}
      <div className="lg:hidden">
        <div className="mb-2 grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-sm px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
                tab === t.key ? "bg-slate-900 text-white shadow-sm" : "text-slate-500",
              )}
              aria-pressed={tab === t.key}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {(tab === "offense" || tab === "off-vs-def") && offenseCard}
          {(tab === "defense" || tab === "off-vs-def") && defenseCard}
        </div>
      </div>

      {/* Desktop: both cards side by side, always. */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-2">
        {offenseCard}
        {defenseCard}
      </div>
    </div>
  );
}
