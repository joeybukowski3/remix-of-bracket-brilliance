import { useState } from "react";
import type { ComponentType } from "react";
import { CheckCircle2, Flame, Gauge, Percent, Route, Target } from "lucide-react";
import { formatNullableNumber, formatNullablePercent } from "@/lib/cfb/format";
import { higherIsBetterEdge, lowerIsBetterEdge, rankAdvantageEdge } from "@/lib/cfb/comparison";
import { getCfbSharedBarSplit } from "@/lib/cfb/ratingPresentation";
import { CFB_SEASON_STAT_RANK_DIRECTIONS, type CfbRankedStatMetric } from "@/lib/cfb/seasonStats/rankSeasonStats";
import type { CfbMatchupSeasonStatsContext } from "@/lib/cfb/seasonStatsPresentation";
import { cn } from "@/lib/utils";
import CollegeFootballSharedBarRow from "./CollegeFootballSharedBarRow";
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

type SectionTab = "offense" | "defense" | "matchup";

/**
 * Icon-tile accent per section — same border/bg-50/text-600 language as
 * Power Comparison's metric icons, so both sections read as one system.
 */
const ICON_TILE_CLASSES: Record<SectionTab, string> = {
  offense: "border-orange-200 bg-orange-50 text-orange-600",
  defense: "border-sky-200 bg-sky-50 text-sky-600",
  matchup: "border-violet-200 bg-violet-50 text-violet-600",
};

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

  function renderCardHeader(
    category: SectionTab,
    left: TeamHeaderInfo,
    right: TeamHeaderInfo,
    descriptors?: { left: string; right: string },
  ) {
    return (
      <div className="flex items-stretch">
        <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background: CATEGORY_ACCENT_COLOR[category] }} />
        <div className="flex-1 bg-slate-50 px-3 py-2.5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex min-w-0 flex-col items-end gap-0.5">
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
              {descriptors && (
                <span className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                  {descriptors.left}
                </span>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide shadow-sm sm:text-[11px]",
                CATEGORY_PILL_CLASSES[category],
              )}
            >
              {TABS.find((t) => t.key === category)?.label}
            </span>
            <div className="flex min-w-0 flex-col items-start gap-0.5">
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
              {descriptors && (
                <span className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                  {descriptors.right}
                </span>
              )}
            </div>
          </div>
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
            <CollegeFootballSharedBarRow
              key={row.key}
              label={row.label}
              icon={row.icon}
              iconClassName={ICON_TILE_CLASSES[category]}
              awayValue={row.format(awayRaw)}
              homeValue={row.format(homeRaw)}
              awayRank={awayRaw != null ? rankBadge(awayRanks[row.key]) : null}
              homeRank={homeRaw != null ? rankBadge(homeRanks[row.key]) : null}
              {...getCfbSharedBarSplit(awayRaw, homeRaw)}
              awayColor={awayColor}
              homeColor={homeColor}
              edge={edge}
              awayTeam={awayTeam}
              homeTeam={homeTeam}
            />
          );
        })}
      </div>
    );
  }

  /**
   * Matchup mode follows the same away-left/home-right orientation as every
   * other section on the page — `awayKeyOf`/`homeKeyOf` pick which stat each
   * real team contributes to the row (e.g. away's defense vs. home's
   * offense), but the screen position always matches the real team.
   *
   * Advantage here is decided by NATIONAL RANK, not raw value: a defensive
   * unit's rank and an offensive unit's rank already encode "how good is
   * this unit nationally" on a common, comparable scale (lower rank =
   * stronger), which raw values do not — a defense allowing 3.5 YPP and an
   * offense gaining 3.2 YPP are not directly comparable on strength without
   * knowing where each ranks nationally. Raw values still drive the
   * displayed numbers and the shared-bar proportions; only the edge
   * (stronger-side badge, bar-junction logo marker) comes from
   * rankAdvantageEdge over the existing generated rank maps.
   */
  function renderMatchupSection(
    descriptors: { left: string; right: string },
    awayKeyOf: (row: (typeof MATCHUP_ROWS)[number]) => CfbRankedStatMetric,
    homeKeyOf: (row: (typeof MATCHUP_ROWS)[number]) => CfbRankedStatMetric,
  ) {
    return (
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
        {renderCardHeader("matchup", awayTeam, homeTeam, descriptors)}
        {MATCHUP_ROWS.map((row) => {
          const awayKey = awayKeyOf(row);
          const homeKey = homeKeyOf(row);
          const awayRaw = away[awayKey];
          const homeRaw = home[homeKey];
          const edge = rankAdvantageEdge(awayRanks[awayKey], homeRanks[homeKey]);
          return (
            <CollegeFootballSharedBarRow
              key={row.label}
              label={row.label}
              icon={row.icon}
              iconClassName={ICON_TILE_CLASSES.matchup}
              awayValue={row.format(awayRaw)}
              homeValue={row.format(homeRaw)}
              awayRank={awayRaw != null ? rankBadge(awayRanks[awayKey]) : null}
              homeRank={homeRaw != null ? rankBadge(homeRanks[homeKey]) : null}
              {...getCfbSharedBarSplit(awayRaw, homeRaw)}
              awayColor={awayColor}
              homeColor={homeColor}
              edge={edge}
              awayTeam={awayTeam}
              homeTeam={homeTeam}
            />
          );
        })}
      </div>
    );
  }

  const offenseCard = renderSection("offense", OFFENSE_ROWS);
  const defenseCard = renderSection("defense", DEFENSE_ROWS);
  const awayDefenseVsHomeOffenseCard = renderMatchupSection(
    { left: "Away Defense", right: "Home Offense" },
    (row) => row.defenseKey,
    (row) => row.offenseKey,
  );
  const awayOffenseVsHomeDefenseCard = renderMatchupSection(
    { left: "Away Offense", right: "Home Defense" },
    (row) => row.offenseKey,
    (row) => row.defenseKey,
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
              {awayDefenseVsHomeOffenseCard}
              {awayOffenseVsHomeDefenseCard}
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
              {awayDefenseVsHomeOffenseCard}
              {awayOffenseVsHomeDefenseCard}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
