import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NflTableScroller } from "@/components/nfl/ui/NflTable";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { PAR_POSITION_LIMITS } from "@/lib/fantasy/parRankings";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import {
  POSITION_BOARD_CONFIGS,
  type PositionBoardConfig,
} from "@/lib/fantasy/positionBoardConfig";
import {
  buildScales,
  filterRows,
  getOutsideRows,
  getTieredRows,
  type PositionBoardRow,
  type PositionBoardScales,
} from "@/lib/fantasy/positionBoardModel";
import { cn } from "@/lib/utils";
import {
  BODY_CELL_BORDER,
  ExpandControl,
  GradientRankCell,
  MatchupOpponentCell,
  MatchupOpponentChip,
  ParDetail,
  ParPerGameValue,
  PlayerIdentity,
  SeasonFinish2025,
  SeasonParStack,
  TierBadge,
} from "@/components/fantasy/ParBoardCells";
import { formatRank, formatSigned } from "@/lib/fantasy/formatBoardValue";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";

const COLUMN_COUNT = 16;

/** How tier boundaries are drawn. Purely a rendering choice — same tier data. */
export type TierDisplay = "compact" | "full";

const TIER_DISPLAYS: ReadonlyArray<{ value: TierDisplay; label: string }> = [
  { value: "compact", label: "Compact tiers" },
  { value: "full", label: "Full tier breaks" },
];
/** Below Tailwind's `md`, the board renders as two-line cards instead of a grid. */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * PAR-first research board, shared by every PAR position. PAR/G is the headline
 * column and drives row order; every other column is secondary context.
 *
 * All colour scales and the PAR/G elite cutoff are computed from the given
 * position's own pool by `buildScales`, so no cutoff is shared between
 * positions. Tier membership comes from the approved boundaries, untouched.
 */
export default function PositionParBoard({
  position,
  query,
}: {
  position: FantasyPosition;
  query: string;
}) {
  const config = POSITION_BOARD_CONFIGS[position];
  const [tierDisplay, setTierDisplay] = useState<TierDisplay>("compact");
  const isCompact = useIsCompactLayout(MOBILE_QUERY);
  const tiered = useMemo(() => getTieredRows(position), [position]);
  const outside = useMemo(() => getOutsideRows(position), [position]);
  const scales = useMemo(() => buildScales(tiered), [tiered]);

  const tieredRows = useMemo(() => filterRows(tiered, query), [tiered, query]);
  const outsideRows = useMemo(() => filterRows(outside, query), [outside, query]);
  const visibleCount = tieredRows.length + outsideRows.length;
  const baseline = tiered[0]?.row.par?.replacementPpg;
  const headingId = `${position.toLowerCase()}-board-heading`;

  if (visibleCount === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm font-semibold text-slate-700">
        No players match “{query}”
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div>
          <h3 id={headingId} className="text-sm font-bold text-slate-950 sm:text-base">
            {config.name}
          </h3>
          <p className="mt-1 text-[11px] leading-4 text-slate-600">
            PAR baseline: {config.baselineLabel} = {baseline?.toFixed(2)} PPG · Board sorted by
            projected PAR/G
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
            Playoff weeks shaded by 2025 fantasy points allowed to {config.position} —{" "}
            <Link to="/fantasy-football/points-allowed" className="font-semibold text-sky-700 underline">
              full 2025 table
            </Link>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs tabular-nums text-slate-500">
            {visibleCount} visible · {PAR_POSITION_LIMITS[position]} tier eligible
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Tiers
            </span>
            <div className="inline-flex gap-1 rounded-lg bg-slate-200 p-1" role="group" aria-label="Tier display">
              {TIER_DISPLAYS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={tierDisplay === option.value}
                  onClick={() => setTierDisplay(option.value)}
                  className={cn(
                    "min-h-8 rounded-md px-2.5 text-[11px] font-semibold",
                    tierDisplay === option.value
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-600",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isCompact ? (
        <NflTableScroller label={`${config.name} research board`}>
          <table className="w-full min-w-[300px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "w-7 px-1.5 py-1.5 text-center")}>
                  Tier
                </th>
                <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "w-9 px-1.5 py-1.5 text-center")}>
                  Rk
                </th>
                <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "px-1.5 py-1.5 text-left")}>
                  Player
                </th>
                <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "w-14 px-1.5 py-1.5 text-center")}>
                  PAR/G
                </th>
                <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "w-6 px-1 py-1.5")}>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tieredRows.map((entry) => (
                <CompactRow key={entry.row.key} entry={entry} scales={scales} config={config} />
              ))}
              {outsideRows.length > 0 && (
                <>
                  <tr className="bg-slate-200/80">
                    <th
                      scope="colgroup"
                      colSpan={5}
                      className="border-y border-slate-300 px-2 py-1 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-slate-700"
                    >
                      Outside Draft Pool
                    </th>
                  </tr>
                  {outsideRows.map((entry) => (
                    <CompactRow key={entry.row.key} entry={entry} scales={scales} config={config} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </NflTableScroller>
      ) : (
        <NflTableScroller label={`${config.name} research board`} className="max-h-[72vh]">
          <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left text-xs">
            <TableHeader config={config} />
            <tbody>
              {tieredRows.map((entry) => (
                <Fragment key={entry.row.key}>
                  {tierDisplay === "full" && (entry.isTierStart || entry === tieredRows[0]) && (
                    <TierBreakRow tier={entry.row.tier} rows={tieredRows} />
                  )}
                  <TableRow entry={entry} scales={scales} tierDisplay={tierDisplay} />
                </Fragment>
              ))}
              {outsideRows.length > 0 && (
                <>
                  <tr className="bg-slate-200/80">
                    <th
                      colSpan={COLUMN_COUNT}
                      className="border-y border-slate-300 px-4 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700"
                    >
                      Outside Draft Pool
                    </th>
                  </tr>
                  {outsideRows.map((entry) => (
                    <TableRow
                      key={entry.row.key}
                      entry={entry}
                      scales={scales}
                      tierDisplay={tierDisplay}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </NflTableScroller>
      )}
    </section>
  );
}

/**
 * Full-width tier divider, matching the legacy board's row style. The PAR/G
 * span is read off the rows currently visible in that tier, so it stays honest
 * under an active search filter.
 */
function TierBreakRow({ tier, rows }: { tier?: number; rows: readonly PositionBoardRow[] }) {
  const parValues = rows
    .filter((entry) => entry.row.tier === tier)
    .flatMap((entry) => (entry.row.par ? [entry.row.par.parPerGame] : []));
  if (!tier || parValues.length === 0) return null;

  return (
    <tr className="bg-slate-100">
      <th
        colSpan={COLUMN_COUNT}
        className="border-y border-slate-300 px-4 py-1.5 text-left"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800">
          Tier {tier}
        </span>
        <span className="ml-3 text-[10px] font-medium normal-case tracking-normal text-slate-500">
          PAR/G {formatSigned(Math.max(...parValues), 2)} to {formatSigned(Math.min(...parValues), 2)}
        </span>
      </th>
    </tr>
  );
}

function TableHeader({ config }: { config: PositionBoardConfig }) {
  return (
    <thead className="sticky top-0 z-30 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
      <tr className="bg-slate-200">
        <th colSpan={5} className="border-b border-r border-slate-300 px-2 py-1 text-left">
          <span className="sr-only">Primary</span>
        </th>
        <th colSpan={1} className="border-b border-r border-slate-300 px-2 py-1 text-center">
          Season
        </th>
        <th colSpan={4} className="border-b border-r border-slate-300 px-2 py-1 text-center">
          Position evidence
        </th>
        <th colSpan={5} className="border-b border-r border-slate-300 px-2 py-1 text-center">
          Team context / playoffs
        </th>
        <th className="border-b border-slate-300 px-2 py-1">
          <span className="sr-only">Details</span>
        </th>
      </tr>
      <tr className="bg-slate-100">
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "w-10 px-2 py-1.5 text-center")}>Tier</th>
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "w-14 px-2 py-1.5 text-center")}>Rk</th>
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "min-w-56 px-2 py-1.5")}>Player</th>
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "w-20 px-2 py-1.5 text-center text-slate-800")}>PAR/G</th>
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "w-20 border-r-slate-300 px-2 py-1.5 text-center")}>Proj PPG</th>
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "w-20 border-r-slate-300 px-2 py-1.5 text-center")}>Season PAR</th>
        {config.metricLabels.map((label) => (
          <th key={label} className={cn(FANTASY_TABLE_HEADER_CELL, "min-w-20 px-2 py-1.5 text-center leading-4")}>
            {label}
          </th>
        ))}
        <th
          title="Rank over the closing stretch of the prior season (weeks 11-17)"
          className={cn(FANTASY_TABLE_HEADER_CELL, "min-w-16 border-r-slate-300 px-2 py-1.5 text-center leading-4")}
        >
          Last 8 Rk
        </th>
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "min-w-20 px-2 py-1.5 text-center leading-4")}>
          Strength of Schedule
        </th>
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "min-w-16 px-2 py-1.5 text-center leading-4")}>O-Line Rank</th>
        {["W15", "W16", "W17"].map((week) => (
          <th
            key={week}
            title={`${week} opponent, shaded by that defense's 2025 fantasy points allowed to ${config.position}`}
            className={cn(FANTASY_TABLE_HEADER_CELL, "min-w-14 px-2 py-1.5 text-center leading-tight")}
          >
            {week}
            <span className="block text-[8px] font-medium normal-case tracking-normal text-slate-400">
              2025 PA
            </span>
          </th>
        ))}
        <th className={cn(FANTASY_TABLE_HEADER_CELL, "w-10 px-2 py-1.5")}>
          <span className="sr-only">Details</span>
        </th>
      </tr>
    </thead>
  );
}

function TableRow({
  entry,
  scales,
  tierDisplay,
}: {
  entry: PositionBoardRow;
  scales: PositionBoardScales;
  tierDisplay: TierDisplay;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded((value) => !value);
  const { row, metrics, positionRankLabel, isTierStart, actual2025, teamContext, lateSeasonRank } =
    entry;
  // In full-break mode a header row already separates tiers, so the thin rule
  // would double up.
  //
  // The border must sit on the cells, not the row: the table uses
  // `border-separate`, and CSS ignores borders declared on a <tr> in that mode.
  const tierEdge =
    isTierStart && tierDisplay === "compact" && "[&>td]:border-t-2 [&>td]:border-t-slate-300";

  return (
    <>
      {/* Whole-row click is a mouse convenience only. The row keeps its native
          table-row semantics — overriding them with role="button" would drop the
          grid structure for screen readers — so the chevron stays the real
          focusable control that carries the accessible name and state. The
          handler no-ops mid-selection so a player name stays copyable. */}
      <tr
        onClick={(event) => {
          if (isTextSelection(event)) return;
          toggle();
        }}
        className={cn("group cursor-pointer hover:bg-slate-50", tierEdge)}
      >
        <td className={cn(BODY_CELL_BORDER, "px-2 py-1.5 text-center")}>
          <TierBadge tier={row.tier} />
        </td>
        <td className={cn(BODY_CELL_BORDER, "px-2 py-1.5 text-center text-[11px] font-bold tabular-nums text-slate-800")}>
          {positionRankLabel ?? "—"}
        </td>
        <td className={cn(BODY_CELL_BORDER, "px-2 py-1.5")}>
          <PlayerIdentity player={row.player} team={row.team} />
        </td>
        <td className={cn(BODY_CELL_BORDER, "px-2 py-1.5 text-center")}>
          <ParPerGameValue value={row.par?.parPerGame} thresholds={scales.par} />
        </td>
        <td className="border-b border-r border-slate-200 px-2 py-1.5 text-center text-[11px] font-bold tabular-nums text-slate-800">
          {row.par ? row.par.projectedPpg.toFixed(2) : "—"}
        </td>
        <td className="border-b border-r border-slate-200 px-2 py-1.5">
          <SeasonParStack
            projectedSeasonPar={row.par?.projectedSeasonPar}
            actualSeasonPar={actual2025?.seasonPar}
          />
        </td>
        <GradientRankCell value={metrics[0]} maxRank={scales.metric0} />
        <GradientRankCell value={metrics[1]} maxRank={scales.metric1} />
        <GradientRankCell value={metrics[2]} maxRank={scales.metric2} />
        <GradientRankCell value={lateSeasonRank} maxRank={scales.late} className="border-r-slate-300" />
        <GradientRankCell value={teamContext.strengthOfSchedule} maxRank={scales.sos} />
        <GradientRankCell value={teamContext.offensiveLineRank} maxRank={scales.oline} />
        <MatchupOpponentCell opponent={teamContext.playoffWeek15Opponent} position={row.position} />
        <MatchupOpponentCell opponent={teamContext.playoffWeek16Opponent} position={row.position} />
        <MatchupOpponentCell opponent={teamContext.playoffWeek17Opponent} position={row.position} />
        <td className={cn(BODY_CELL_BORDER, "px-1 py-1 text-center")}>
          <ExpandControl
            label={`${expanded ? "Hide" : "Show"} details for ${row.player}`}
            expanded={expanded}
            onClick={toggle}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={COLUMN_COUNT} className="px-4 py-2 text-[11px] leading-5 text-slate-600">
            <SeasonFinish2025 rank={entry.seasonRank2025} />
            <ParDetail row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

/** True when the click ended a text selection rather than being a plain click. */
function isTextSelection(event: { currentTarget: HTMLElement }): boolean {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return false;
  return event.currentTarget.contains(selection.anchorNode);
}

/**
 * Mobile row for the dense spreadsheet-style table: Tier | Rk | Player | PAR/G,
 * one line, ~36px tall. Everything else (season PAR, evidence metrics, team
 * context, playoff weeks, 2025 finish) moves behind the same tap-to-expand
 * detail panel the desktop grid uses, just rendered as a full-width row.
 */
function CompactRow({
  entry,
  scales,
  config,
}: {
  entry: PositionBoardRow;
  scales: PositionBoardScales;
  config: PositionBoardConfig;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => setExpanded((value) => !value);
  const { row, metrics, positionRankLabel, isTierStart, actual2025, teamContext, lateSeasonRank } =
    entry;

  return (
    <>
      <tr
        onClick={(event) => {
          if (isTextSelection(event)) return;
          toggle();
        }}
        className={cn(
          "group cursor-pointer hover:bg-slate-50",
          isTierStart && "[&>td]:border-t-2 [&>td]:border-t-slate-300",
        )}
      >
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-1 text-center")}>
          <TierBadge tier={row.tier} />
        </td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-1 text-center text-[10px] font-bold tabular-nums text-slate-800")}>
          {positionRankLabel ?? "—"}
        </td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "max-w-0 px-1.5 py-1")}>
          <FantasyPlayerIdentity player={row.player} team={row.team} compact />
        </td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1.5 py-1 text-center")}>
          <ParPerGameValue value={row.par?.parPerGame} thresholds={scales.par} />
        </td>
        <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-1 text-center")}>
          <ExpandControl
            label={`${expanded ? "Hide" : "Show"} details for ${row.player}`}
            expanded={expanded}
            onClick={toggle}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={5} className="border-b border-slate-200 px-3 py-2">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600">
              <div className="flex items-start justify-between gap-2">
                <dt className="text-slate-500">Proj PPG</dt>
                <dd className="font-semibold tabular-nums text-slate-800">
                  {row.par ? row.par.projectedPpg.toFixed(2) : "—"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className="text-slate-500">Season PAR</dt>
                <dd>
                  <SeasonParStack
                    projectedSeasonPar={row.par?.projectedSeasonPar}
                    actualSeasonPar={actual2025?.seasonPar}
                  />
                </dd>
              </div>
              {config.metricLabels.map((label, index) => (
                <MobileDetail key={label} label={label} value={formatRank(metrics[index])} />
              ))}
              <MobileDetail label="Last 8 Rk" value={formatRank(lateSeasonRank)} />
              <MobileDetail label="Strength of Schedule" value={formatRank(teamContext.strengthOfSchedule)} />
              <MobileDetail label="O-Line Rank" value={formatRank(teamContext.offensiveLineRank)} />
              {(["playoffWeek15Opponent", "playoffWeek16Opponent", "playoffWeek17Opponent"] as const).map(
                (field, index) => (
                  <div key={field} className="flex items-baseline justify-between gap-2">
                    <dt className="truncate text-slate-500">{`W1${5 + index}`}</dt>
                    <dd>
                      <MatchupOpponentChip opponent={teamContext[field]} position={row.position} />
                    </dd>
                  </div>
                ),
              )}
              <div className="col-span-2 border-t border-slate-200 pt-1 leading-5">
                <SeasonFinish2025 rank={entry.seasonRank2025} />
                <ParDetail row={row} />
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function MobileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="truncate text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}
