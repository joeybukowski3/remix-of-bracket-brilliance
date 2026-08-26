import { useState } from "react";
import type { ComponentType } from "react";
import { CheckCircle2, Flame, Gauge, Percent, Route, Target } from "lucide-react";
import { formatNullableNumber, formatNullablePercent } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge } from "@/lib/cfb/comparison";
import { CFB_SEASON_STAT_RANK_DIRECTIONS, type CfbRankedStatMetric } from "@/lib/cfb/seasonStats/rankSeasonStats";
import type { CfbMatchupSeasonStatsContext } from "@/lib/cfb/seasonStatsPresentation";
import { cn } from "@/lib/utils";
import CollegeFootballComparisonRow from "./CollegeFootballComparisonRow";
import CollegeFootballTeamLogo from "./CollegeFootballTeamLogo";

type Props = {
  awayShortName: string;
  homeShortName: string;
  context: CfbMatchupSeasonStatsContext;
  awayColor: string;
  homeColor: string;
  /** Optional team logos for the dashboard-style card headers. Falls back to initials when absent. */
  awayLogo?: string | null;
  homeLogo?: string | null;
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

/**
 * Matchup mode pairs each offense stat with its equivalent "allowed" defense
 * stat — OFFENSE_ROWS and DEFENSE_ROWS are already parallel/index-matched
 * (e.g. pointsPerGame <-> pointsAllowedPerGame), so this reuses that existing
 * pairing rather than inventing a new metric set.
 */
const MATCHUP_ROWS = OFFENSE_ROWS.map((offenseRow, index) => ({
  label: offenseRow.label,
  icon: offenseRow.icon,
  offenseKey: offenseRow.key,
  defenseKey: DEFENSE_ROWS[index].key,
  format: offenseRow.format,
}));

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

type SectionTab = "offense" | "defense" | "matchup";

const TABS: { key: SectionTab; label: string }[] = [
  { key: "offense", label: "Offense" },
  { key: "defense", label: "Defense" },
  { key: "matchup", label: "Matchup" },
];

/** Category pill styling — visually distinct per mode so it's obvious at a glance which table is showing. */
const CATEGORY_PILL_CLASSES: Record<SectionTab, string> = {
  offense: "bg-orange-600 text-white",
  defense: "bg-sky-600 text-white",
  matchup: "bg-violet-600 text-white",
};

const CATEGORY_ACCENT_COLOR: Record<SectionTab, string> = {
  offense: "#ea580c",
  defense: "#0284c7",
  matchup: "#7c3aed",
};

type TeamHeaderInfo = {
  name: string;
  shortName: string;
  color: string;
  logo?: string | null;
};

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
  awayLogo,
  homeLogo,
}: Props) {
  const { away, home, awayRanks, homeRanks } = context;
  const [tab, setTab] = useState<SectionTab>("offense");

  const awayTeam: TeamHeaderInfo = { name: awayShortName, shortName: awayShortName, color: awayColor, logo: awayLogo };
  const homeTeam: TeamHeaderInfo = { name: homeShortName, shortName: homeShortName, color: homeColor, logo: homeLogo };

  function renderCardHeader(category: SectionTab, left: TeamHeaderInfo, right: TeamHeaderInfo, subtitle?: string) {
    return (
      <div className="flex items-stretch">
        <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background: CATEGORY_ACCENT_COLOR[category] }} />
        <div className="flex-1 bg-slate-50 px-3 py-2.5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex min-w-0 items-center justify-end gap-1.5">
              <span className="truncate text-xs font-black uppercase tracking-wide sm:text-sm" style={{ color: left.color }}>
                {left.shortName}
              </span>
              <CollegeFootballTeamLogo
                name={left.name}
                logo={left.logo}
                abbreviation={left.shortName}
                primaryColor={left.color}
                size="sm"
              />
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide shadow-sm sm:text-[11px]",
                CATEGORY_PILL_CLASSES[category],
              )}
            >
              {TABS.find((t) => t.key === category)?.label}
            </span>
            <div className="flex min-w-0 items-center justify-start gap-1.5">
              <CollegeFootballTeamLogo
                name={right.name}
                logo={right.logo}
                abbreviation={right.shortName}
                primaryColor={right.color}
                size="sm"
              />
              <span className="truncate text-xs font-black uppercase tracking-wide sm:text-sm" style={{ color: right.color }}>
                {right.shortName}
              </span>
            </div>
          </div>
          {subtitle && (
            <p className="mt-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderSection(category: "offense" | "defense", rows: SeasonStatRow[]) {
    return (
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
        {renderCardHeader(category, awayTeam, homeTeam)}
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

  /**
   * Matchup mode always keeps home on the left, away on the right — the
   * opposite screen position from the Offense/Defense cards above, per the
   * explicit orientation rule for this tab. `leftValue`/`rightValue` map onto
   * CollegeFootballComparisonRow's away/home slots purely by screen position
   * (its away slot is always the left-rendered one), not by which team is
   * actually away.
   */
  function renderMatchupSection(
    title: string,
    leftKeyOf: (row: (typeof MATCHUP_ROWS)[number]) => CfbRankedStatMetric,
    rightKeyOf: (row: (typeof MATCHUP_ROWS)[number]) => CfbRankedStatMetric,
    direction: "higher-is-better" | "lower-is-better",
  ) {
    return (
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
        {renderCardHeader("matchup", homeTeam, awayTeam, title)}
        {MATCHUP_ROWS.map((row) => {
          const leftKey = leftKeyOf(row);
          const rightKey = rightKeyOf(row);
          const leftRaw = home[leftKey];
          const rightRaw = away[rightKey];
          const edge =
            direction === "higher-is-better" ? higherIsBetterEdge(leftRaw, rightRaw) : lowerIsBetterEdge(leftRaw, rightRaw);
          return (
            <CollegeFootballComparisonRow
              key={row.label}
              label={row.label}
              icon={row.icon}
              awayValue={row.format(leftRaw)}
              homeValue={row.format(rightRaw)}
              awayRank={leftRaw != null ? rankBadge(homeRanks[leftKey]) : null}
              homeRank={rightRaw != null ? rankBadge(awayRanks[rightKey]) : null}
              awayBarPercent={barShare(leftRaw, rightRaw)}
              homeBarPercent={barShare(rightRaw, leftRaw)}
              awayColor={homeColor}
              homeColor={awayColor}
              edge={edge}
            />
          );
        })}
      </div>
    );
  }

  const offenseCard = renderSection("offense", OFFENSE_ROWS);
  const defenseCard = renderSection("defense", DEFENSE_ROWS);
  const homeOffenseVsAwayDefenseCard = renderMatchupSection(
    "Home Offense vs Away Defense",
    (row) => row.offenseKey,
    (row) => row.defenseKey,
    "higher-is-better",
  );
  const homeDefenseVsAwayOffenseCard = renderMatchupSection(
    "Home Defense vs Away Offense",
    (row) => row.defenseKey,
    (row) => row.offenseKey,
    "lower-is-better",
  );

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
          {tab === "offense" && offenseCard}
          {tab === "defense" && defenseCard}
          {tab === "matchup" && (
            <>
              {homeOffenseVsAwayDefenseCard}
              {homeDefenseVsAwayOffenseCard}
            </>
          )}
        </div>
      </div>

      {/* Desktop: both cards for the active tab, side by side. */}
      <div className="hidden lg:block">
        <div className="mb-2 inline-flex gap-1 rounded-md bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
                tab === t.key ? "bg-slate-900 text-white shadow-sm" : "text-slate-500",
              )}
              aria-pressed={tab === t.key}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className={cn("grid gap-3", tab === "matchup" ? "lg:grid-cols-2" : "lg:grid-cols-1")}>
          {tab === "offense" && offenseCard}
          {tab === "defense" && defenseCard}
          {tab === "matchup" && (
            <>
              {homeOffenseVsAwayDefenseCard}
              {homeDefenseVsAwayOffenseCard}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
