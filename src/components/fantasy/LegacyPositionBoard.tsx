/**
 * Pre-redesign position research board, restored verbatim from commit 083aeb81
 * (the last state before the PAR-first redesign) for side-by-side review
 * against `PositionParBoard`.
 *
 * This file is a temporary review aid. It is a self-contained copy: it shares no
 * helpers with the new board, so the new board's code is untouched by its
 * presence. Delete this file and its toggle once a board is chosen.
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import {
  DENSE_TABLE_HEAD_ROW,
  DENSE_TABLE_ROW,
  DenseTableScroller,
  stickyDenseHeader,
} from "@/components/ui/dense-table";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { cn } from "@/lib/utils";
import {
  FANTASY_POSITION_RESEARCH_BOARDS,
  PAR_POSITION_LIMITS,
  type FantasyResearchBoardRow,
} from "@/lib/fantasy/parRankings";
import {
  FANTASY_RANKINGS,
  getFantasyMetricValues,
  type FantasyPosition,
  type FantasyRankingRow,
} from "@/lib/fantasy/rankings";
import {
  getQuantileRankTone,
  getRankQuantileThresholds,
  getSosRankTone,
  rankToneStyle,
  type RankQuantileThresholds,
  type RankTone,
} from "@/lib/fantasy/rankingPresentation";

export type MobileGroup = "Metrics" | "Model" | "Context" | "Playoffs";
type RankColumnKey = "metric0" | "metric1" | "metric2" | "late" | "projection" | "vegas" | "average" | "sos" | "oline";

const MOBILE_GROUPS: readonly MobileGroup[] = ["Metrics", "Model", "Context", "Playoffs"];
const POSITION_NAMES: Record<FantasyPosition, string> = {
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Wide receivers",
  TE: "Tight ends",
};
const BASELINE_LABELS: Record<FantasyPosition, string> = { QB: "QB13", RB: "RB25", WR: "WR37", TE: "TE13" };
const METRIC_LABELS: Record<FantasyPosition, readonly [string, string, string]> = {
  QB: ["Passer Rating Rk", "Rush Yds/Game Rk", "Pass TD/Attempt Rk"],
  RB: ["Touches Rk", "Red Zone Touches Rk", "YPC Rk"],
  WR: ["Target % Rk", "Air Yds/Game Rk", "Targets/Game Rk"],
  TE: ["Target Share Rk", "Targets/Route Run Rk", "YPRR Rk"],
};


export default function PositionBoard({ position, query, mobileGroup }: { position: FantasyPosition; query: string; mobileGroup: MobileGroup }) {
  const isCompact = useIsCompactLayout("(max-width: 767px)");
  const board = FANTASY_POSITION_RESEARCH_BOARDS[position];
  const allJkbRows = useMemo(
    () => FANTASY_RANKINGS.rows.filter((row) => row.position === position),
    [position],
  );
  const thresholds = useMemo(() => buildThresholds(allJkbRows), [allJkbRows]);
  const tierGroups = board.tierGroups
    .map((group) => ({ ...group, rows: group.rows.filter((row) => matchesQuery(row.player, row.team, query)) }))
    .filter((group) => group.rows.length > 0);
  const outsideRows = board.outsideDraftPool.filter((row) => matchesQuery(row.player, row.team, query));
  const visibleCount = tierGroups.reduce((total, group) => total + group.rows.length, 0) + outsideRows.length;
  const baseline = board.tierGroups[0]?.rows[0]?.par?.replacementPpg;
  const hasVegas = position === "QB" || position === "RB";
  const columnCount = 2 + 3 + 3 + Number(hasVegas) + 3 + 3;

  if (visibleCount === 0) return <EmptyState query={query} />;

  return (
    <section aria-labelledby={`${position.toLowerCase()}-board-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
        <div>
          <h3 id={`${position.toLowerCase()}-board-heading`} className="text-sm font-bold text-slate-950 sm:text-base">{POSITION_NAMES[position]}</h3>
          <p className="mt-1 text-[11px] leading-4 text-slate-600">
            PAR baseline: {BASELINE_LABELS[position]} = {baseline?.toFixed(2)} PPG · Draft tiers derived from projected PAR/G
          </p>
        </div>
        <span className="text-xs tabular-nums text-slate-500">{visibleCount} visible · {PAR_POSITION_LIMITS[position]} tier eligible</span>
      </div>

      {isCompact ? (
        <LegacyCompactTable
          position={position}
          tierGroups={tierGroups}
          outsideRows={outsideRows}
        />
      ) : (
      <DenseTableScroller label={`${POSITION_NAMES[position]} research board`} className="max-h-[72vh]">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs md:min-w-[1320px]">
          <PositionTableHeader position={position} mobileGroup={mobileGroup} hasVegas={hasVegas} />
          <tbody>
            {tierGroups.map((group) => (
              <TierSection
                key={group.tier}
                tier={group.tier}
                rows={group.rows}
                columnCount={columnCount}
                position={position}
                mobileGroup={mobileGroup}
                thresholds={thresholds}
                hasVegas={hasVegas}
              />
            ))}
            {outsideRows.length > 0 && (
              <>
                <tr className="bg-slate-200/80">
                  <th colSpan={columnCount} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-700">Outside Draft Pool</th>
                </tr>
                {outsideRows.map((row) => (
                  <ResearchRow key={row.key} row={row} position={position} mobileGroup={mobileGroup} thresholds={thresholds} hasVegas={hasVegas} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </DenseTableScroller>
      )}
    </section>
  );
}

function LegacyCompactTable({
  position,
  tierGroups,
  outsideRows,
}: {
  position: FantasyPosition;
  tierGroups: ReadonlyArray<{ tier: number; rows: readonly FantasyResearchBoardRow[] }>;
  outsideRows: readonly FantasyResearchBoardRow[];
}) {
  return (
    <DenseTableScroller label={`${POSITION_NAMES[position]} legacy research board`}>
      <table className="w-full table-fixed border-collapse text-left text-[11px]">
        <thead>
          <tr className={cn(DENSE_TABLE_HEAD_ROW, "text-[9px]")}>
            <th scope="col" className="w-8 px-1 py-1.5 text-center">Rk</th>
            <th scope="col" className="px-1 py-1.5">Player</th>
            <th scope="col" title="Projection rank" className="w-10 px-1 py-1.5 text-center">Proj</th>
            <th scope="col" title="Average model rank" className="w-10 px-1 py-1.5 text-center">AVG</th>
            <th scope="col" className="w-7 px-1 py-1.5"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {tierGroups.map((group) => (
            <LegacyCompactTier key={group.tier} tier={group.tier} rows={group.rows} position={position} />
          ))}
          {outsideRows.length > 0 && (
            <>
              <tr className="bg-slate-200/80">
                <th scope="colgroup" colSpan={5} className="border-y border-slate-300 px-2 py-1 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-slate-700">
                  Outside Draft Pool
                </th>
              </tr>
              {outsideRows.map((row) => <LegacyCompactRow key={row.key} row={row} position={position} />)}
            </>
          )}
        </tbody>
      </table>
    </DenseTableScroller>
  );
}

function LegacyCompactTier({ tier, rows, position }: { tier: number; rows: readonly FantasyResearchBoardRow[]; position: FantasyPosition }) {
  return (
    <>
      <tr className="bg-slate-100">
        <th scope="colgroup" colSpan={5} className="border-y border-slate-200 px-2 py-1 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-slate-700">
          Tier {tier}
        </th>
      </tr>
      {rows.map((row) => <LegacyCompactRow key={row.key} row={row} position={position} />)}
    </>
  );
}

function LegacyCompactRow({ row, position }: { row: FantasyResearchBoardRow; position: FantasyPosition }) {
  const [expanded, setExpanded] = useState(false);
  const jkb = row.jkb;
  const metrics = jkb ? getFantasyMetricValues(jkb) : [undefined, undefined, undefined];
  const labels = METRIC_LABELS[position];

  return (
    <>
      <tr className="h-8 border-b border-slate-100 hover:bg-slate-50">
        <td className="px-1 py-1 text-center font-bold tabular-nums text-slate-700">{formatRank(jkb?.positionRank)}</td>
        <td className="max-w-0 px-1 py-1"><PlayerIdentity player={row.player} team={row.team} /></td>
        <td className="px-1 py-1 text-center font-semibold tabular-nums text-slate-700">{formatRank(jkb?.projectionRank)}</td>
        <td className="bg-slate-50 px-1 py-1 text-center font-bold tabular-nums text-slate-900">{formatRank(jkb?.averageRank)}</td>
        <td className="px-0.5 py-1">
          <ExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.player}`} expanded={expanded} onClick={() => setExpanded((value) => !value)} compact />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={5} className="px-3 py-2">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-600">
              {labels.map((label, index) => <MobileDetail key={label} label={label} value={formatRank(metrics[index])} />)}
              <MobileDetail label="Late / Last 8 Rk" value={formatRank(jkb?.lateSeasonRank)} />
              {(position === "QB" || position === "RB") && <MobileDetail label="Vegas Rk" value={formatRank(jkb?.vegasRank)} />}
              <MobileDetail label="Strength of Schedule" value={formatRank(jkb?.strengthOfSchedule)} />
              <MobileDetail label="O-Line Rk" value={formatRank(jkb?.offensiveLineRank)} />
              <MobileDetail label="W15" value={jkb?.playoffWeek15Opponent || "—"} />
              <MobileDetail label="W16" value={jkb?.playoffWeek16Opponent || "—"} />
              <MobileDetail label="W17" value={jkb?.playoffWeek17Opponent || "—"} />
              <div className="col-span-2 border-t border-slate-200 pt-1 leading-5">
                {row.par ? (
                  <span>
                    PAR rank <strong className="text-slate-900">#{row.par.parRank}</strong> · Projected PPG{" "}
                    <strong className="text-slate-900">{row.par.projectedPpg.toFixed(2)}</strong>
                  </span>
                ) : (
                  <span>{position} player remains outside the approved PAR tier universe.</span>
                )}
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function PositionTableHeader({ position, mobileGroup, hasVegas }: { position: FantasyPosition; mobileGroup: MobileGroup; hasVegas: boolean }) {
  const metricLabels = METRIC_LABELS[position];
  return (
    <thead className={stickyDenseHeader("text-[10px] font-semibold uppercase tracking-wider text-slate-600")}>
      <tr className="bg-slate-200">
        <th rowSpan={2} className="sticky left-0 z-40 w-14 border-b border-r border-slate-300 bg-slate-200 px-2 py-2 text-center">JKB Rk</th>
        <th rowSpan={2} className="sticky left-14 z-40 min-w-64 border-b border-r border-slate-300 bg-slate-200 px-3 py-2">Player</th>
        <GroupHeader label="Position Evidence" span={3} active={mobileGroup === "Metrics"} />
        <GroupHeader label="Model" span={hasVegas ? 4 : 3} active={mobileGroup === "Model"} />
        <GroupHeader label="Team Context" span={2} active={mobileGroup === "Context"} />
        <GroupHeader label="Fantasy Playoffs" span={3} active={mobileGroup === "Playoffs"} />
      </tr>
      <tr className="bg-slate-100">
        {metricLabels.map((label) => <ColumnHeader key={label} label={label} group="Metrics" active={mobileGroup} />)}
        <ColumnHeader label="Late / Last 8 Rk" group="Model" active={mobileGroup} />
        <ColumnHeader label="Projection Rk" group="Model" active={mobileGroup} />
        {hasVegas && <ColumnHeader label="Vegas Rk" group="Model" active={mobileGroup} />}
        <ColumnHeader label="AVG Rk" group="always" active={mobileGroup} emphasis />
        <ColumnHeader label="Strength of Schedule" group="Context" active={mobileGroup} />
        <ColumnHeader label="O-Line Rk" group="Context" active={mobileGroup} />
        <ColumnHeader label="W15" group="Playoffs" active={mobileGroup} />
        <ColumnHeader label="W16" group="Playoffs" active={mobileGroup} />
        <ColumnHeader label="W17" group="Playoffs" active={mobileGroup} />
      </tr>
    </thead>
  );
}

function GroupHeader({ label, span, active }: { label: string; span: number; active: boolean }) {
  return <th colSpan={span} className={cn("border-b border-r border-slate-300 px-3 py-1.5 text-center", !active && "max-md:hidden")}>{label}</th>;
}

function ColumnHeader({ label, group, active, emphasis = false }: { label: string; group: MobileGroup | "always"; active: MobileGroup; emphasis?: boolean }) {
  return <th className={cn("min-w-20 border-b border-r border-slate-200 px-2 py-2 text-center leading-4", group !== "always" && group !== active && "max-md:hidden", emphasis && "bg-slate-200 text-slate-800")}>{label}</th>;
}

function TierSection({ tier, rows, columnCount, position, mobileGroup, thresholds, hasVegas }: { tier: number; rows: readonly FantasyResearchBoardRow[]; columnCount: number; position: FantasyPosition; mobileGroup: MobileGroup; thresholds: Record<RankColumnKey, RankQuantileThresholds | null>; hasVegas: boolean }) {
  const parValues = rows.flatMap((row) => row.par ? [row.par.parPerGame] : []);
  const high = Math.max(...parValues);
  const low = Math.min(...parValues);
  return (
    <>
      <tr className="bg-slate-100">
        <th colSpan={columnCount} className="border-b border-slate-200 px-4 py-2 text-left">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800">Tier {tier}</span>
          <span className="ml-3 text-[10px] font-medium normal-case tracking-normal text-slate-500">PAR/G {formatSigned(high, 2)} to {formatSigned(low, 2)}</span>
        </th>
      </tr>
      {rows.map((row) => <ResearchRow key={row.key} row={row} position={position} mobileGroup={mobileGroup} thresholds={thresholds} hasVegas={hasVegas} />)}
    </>
  );
}

function ResearchRow({ row, position, mobileGroup, thresholds, hasVegas }: { row: FantasyResearchBoardRow; position: FantasyPosition; mobileGroup: MobileGroup; thresholds: Record<RankColumnKey, RankQuantileThresholds | null>; hasVegas: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const jkb = row.jkb;
  const metrics = jkb ? getFantasyMetricValues(jkb) : [undefined, undefined, undefined];
  return (
    <>
      <tr className={cn(DENSE_TABLE_ROW, "group")}>
        <td className="sticky left-0 z-10 w-14 border-b border-r border-slate-100 bg-white px-2 py-2 text-center font-bold tabular-nums text-slate-700 group-hover:bg-slate-50">{formatRank(jkb?.positionRank)}</td>
        <td className="sticky left-14 z-10 min-w-64 border-b border-r border-slate-100 bg-white px-3 py-2 group-hover:bg-slate-50">
          <div className="flex items-center gap-2">
            <PlayerIdentity player={row.player} team={row.team} />
            {row.tier && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-700 md:hidden">T{row.tier}</span>}
            <ExpandControl label={`${expanded ? "Hide" : "Show"} details for ${row.player}`} expanded={expanded} onClick={() => setExpanded((value) => !value)} />
          </div>
        </td>
        {metrics.map((value, index) => <RankCell key={index} value={value} tone={getQuantileRankTone(value, thresholds[`metric${index}` as RankColumnKey])} group="Metrics" active={mobileGroup} />)}
        <RankCell value={jkb?.lateSeasonRank} tone={getQuantileRankTone(jkb?.lateSeasonRank, thresholds.late)} group="Model" active={mobileGroup} />
        <RankCell value={jkb?.projectionRank} tone={getQuantileRankTone(jkb?.projectionRank, thresholds.projection)} group="Model" active={mobileGroup} />
        {hasVegas && <RankCell value={jkb?.vegasRank} tone={getQuantileRankTone(jkb?.vegasRank, thresholds.vegas)} group="Model" active={mobileGroup} />}
        <RankCell value={jkb?.averageRank} tone={getQuantileRankTone(jkb?.averageRank, thresholds.average)} group="always" active={mobileGroup} emphasis />
        <RankCell value={jkb?.strengthOfSchedule} tone={getSosRankTone(jkb?.strengthOfSchedule)} group="Context" active={mobileGroup} />
        <RankCell value={jkb?.offensiveLineRank} tone={getQuantileRankTone(jkb?.offensiveLineRank, thresholds.oline)} group="Context" active={mobileGroup} />
        <TextCell value={jkb?.playoffWeek15Opponent} group="Playoffs" active={mobileGroup} />
        <TextCell value={jkb?.playoffWeek16Opponent} group="Playoffs" active={mobileGroup} />
        <TextCell value={jkb?.playoffWeek17Opponent} group="Playoffs" active={mobileGroup} />
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={20} className="px-4 py-3 text-[11px] leading-5 text-slate-600">
            {row.par ? (
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span>PAR rank <strong className="text-slate-900">#{row.par.parRank}</strong></span>
                <span>PAR/G <strong className="text-slate-900">{formatSigned(row.par.parPerGame, 2)}</strong></span>
                <span>Projected PPG <strong className="text-slate-900">{row.par.projectedPpg.toFixed(2)}</strong></span>
                <span>Historical replacement <strong className="text-slate-900">{row.par.replacementPpg.toFixed(2)}</strong></span>
                <span>Season PAR <strong className="text-slate-900">{formatSigned(row.par.projectedSeasonPar, 1)}</strong></span>
                <span>Projected points <strong className="text-slate-900">{row.par.projectedFantasyPoints.toFixed(1)}</strong></span>
              </div>
            ) : (
              <span>{position} player remains in JKB position-rank order and is outside the approved PAR tier universe.</span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function PlayerIdentity({ player, team }: { player: string; team?: string }) {
  const normalizedTeam = team?.toUpperCase();
  const hasTeam = Boolean(normalizedTeam && normalizedTeam !== "FA");
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamLogo name={normalizedTeam ?? "FA"} logo={hasTeam ? nflLogoUrl(normalizedTeam!) : undefined} className="h-6 w-6" />
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-slate-950 sm:text-[13px]">{player}</div>
        <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{normalizedTeam ?? "FA"}</div>
      </div>
    </div>
  );
}

function ExpandControl({ label, expanded, onClick, compact = false }: { label: string; expanded: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" aria-label={label} aria-expanded={expanded} onClick={onClick} className={cn("ml-auto inline-flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500", compact ? "h-6 w-6" : "min-h-8 min-w-8")}>
      <ChevronDown aria-hidden className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "transition-transform", expanded && "rotate-180")} />
    </button>
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

function RankCell({ value, tone, group, active, emphasis = false }: { value?: number; tone: RankTone; group: MobileGroup | "always"; active: MobileGroup; emphasis?: boolean }) {
  return (
    <td
      data-rank-tone={tone}
      style={rankToneStyle(tone)}
      className={cn("border-b border-r border-slate-100 px-2 py-2 text-center font-semibold tabular-nums", tone === "missing" && "bg-white text-slate-400", group !== "always" && group !== active && "max-md:hidden", emphasis && "font-bold ring-1 ring-inset ring-slate-200/70")}
    >
      {formatRank(value)}
    </td>
  );
}

function TextCell({ value, group, active }: { value?: string; group: MobileGroup; active: MobileGroup }) {
  return <td className={cn("border-b border-r border-slate-100 bg-white px-2 py-2 text-center font-semibold text-slate-700", group !== active && "max-md:hidden")}>{value || "—"}</td>;
}

function EmptyState({ query }: { query: string }) {
  return <div className="px-4 py-12 text-center text-sm font-semibold text-slate-700">No players match “{query}”</div>;
}

function buildThresholds(rows: readonly FantasyRankingRow[]): Record<RankColumnKey, RankQuantileThresholds | null> {
  const metrics = rows.map(getFantasyMetricValues);
  return {
    metric0: getRankQuantileThresholds(metrics.map((values) => values[0])),
    metric1: getRankQuantileThresholds(metrics.map((values) => values[1])),
    metric2: getRankQuantileThresholds(metrics.map((values) => values[2])),
    late: getRankQuantileThresholds(rows.map((row) => row.lateSeasonRank)),
    projection: getRankQuantileThresholds(rows.map((row) => row.projectionRank)),
    vegas: getRankQuantileThresholds(rows.map((row) => row.vegasRank)),
    average: getRankQuantileThresholds(rows.map((row) => row.averageRank)),
    sos: null,
    oline: getRankQuantileThresholds(rows.map((row) => row.offensiveLineRank)),
  };
}

function matchesQuery(player: string, team: string | undefined, query: string): boolean {
  return !query || player.toLowerCase().includes(query) || team?.toLowerCase().includes(query) === true;
}

function formatRank(value: number | undefined): string {
  return Number.isFinite(value) ? String(value) : "—";
}

function formatSigned(value: number, digits: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}
