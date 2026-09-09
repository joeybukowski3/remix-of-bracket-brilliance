import { Fragment, useEffect, useMemo, useState } from "react";
import { FANTASY_TABLE_BODY_CELL, FANTASY_TABLE_HEADER_CELL, FANTASY_TABLE_SHELL, FantasyExpandControl, FantasyPlayerIdentity, FantasyOpponentIdentity } from "@/components/fantasy/FantasyTable";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, stickyDenseHeader } from "@/components/ui/dense-table";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import type { FantasyMatchupEdges } from "@/lib/nfl/matchupEdges";
import { POSITION_TAB_TONES } from "@/lib/fantasy/positionTone";
import { DFS_STATUS_BADGE_CLASSES, defaultDfsSortDirection, dfsMatchupValue, filterDfsRows, formatDfsPointsPer1k, formatDfsProjection, formatDfsRank, formatDfsRankDiff, formatDfsSalary, getDfsRankDiffTone, getDfsStatusBadge, selectDfsBoardRows, sortDfsRows, type DfsBoardView, type DfsDirectionFilter, type DfsSortKey, type DfsSortDirection } from "@/lib/nfl/dfs/presentation";
import { weeklyHeatStyle } from "@/lib/fantasy/weekly/researchPresentation";
import { matchupGradeHeatTone, weeklyMatchupDifferenceHeatTone, weeklyRankHeatTone, resolvePercentileDisplay } from "@/lib/shared/jkbHeat";
import { cn } from "@/lib/utils";
import NflDfsHistory, { FpaSignal, DefenseSignal, FPA_HELP, DEF_AVG_HELP } from "./NflDfsHistory";
import { DfsHeatLegend, DfsHeatValue, DfsPositionBadge, DfsSortButton } from "./DfsTableCells";
import { DFS_POSITION_ACCENT, dfsValueStyles, dfsWeeklyRankStyle } from "@/lib/nfl/dfs/tablePresentation";
import { dfsHistoryLoader, historyCoverage, type DfsHistoryIndex, type HistoryTarget } from "@/lib/nfl/dfs/historyDelivery";

const BOARD_VIEWS: readonly DfsBoardView[] = ["VALUE", "QB", "RB", "WR", "TE", "DST"];
const BASE_COLUMNS: { key: DfsSortKey; label: string }[] = [
  { key: "player", label: "Player" }, { key: "teamOpp", label: "Team/Opp" }, { key: "salary", label: "Salary" }, { key: "dkPosRank", label: "DK Pos RK" },
];
const OFFENSE_COLUMNS: { key: DfsSortKey; label: string }[] = [
  { key: "jkbSlateRank", label: "JKB Slate RK" }, { key: "weeklyRank", label: "JKB Week RK" }, { key: "rankDiff", label: "Rank Diff" },
  { key: "proj", label: "JKB Proj" }, { key: "pts1k", label: "JKB Pts/$1K" }, { key: "matchup", label: "Matchup" },
  { key: "fpaSeason", label: "FPA SZN" }, { key: "fpaLast5", label: "FPA L5" },
];
const EDGE_COLUMNS: { key: DfsSortKey; label: string }[] = [
  { key: "epa", label: "EPA ADV" }, { key: "success", label: "SUCCESS ADV" }, { key: "trenches", label: "TRENCHES" },
];
const EMPTY_PROJECTIONS: readonly WeeklyFantasyProjectionProductionRow[] = [];

function ResearchDetail({ row }: { row: DfsEnrichedAnalyzerRow }) {
  if (row.kind === "dst") {
    return <p className="text-[11px] text-slate-500">JKB projection unavailable for DST.</p>;
  }
  const research = row.research;
  if (!research || research.status !== "available" || !research.context) {
    return <p className="text-[11px] text-slate-500">No weekly research available for this player.</p>;
  }
  const context = research.context;
  const metric = (value: number | null, digits = 1) => (value == null ? "N/A" : value.toFixed(digits));

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-700 sm:grid-cols-3">
      <div><span className="text-slate-400">Season PPG</span> <strong className="text-slate-900">{metric(context.seasonPpg.value)}</strong></div>
      <div><span className="text-slate-400">L5 PPG</span> <strong className="text-slate-900">{metric(context.last5Ppg.value)}</strong></div>
      <div><span className="text-slate-400">DK Overall RK</span> <strong className="text-slate-900">{formatDfsRank(row.dkOverallSalaryRank)}</strong></div>
      <div><span className="text-slate-400">JKB Overall RK</span> <strong className="text-slate-900">{formatDfsRank(row.jkbOverallSlateProjectionRank)}</strong></div>
      <div><span className="text-slate-400">Overall Diff</span> <strong>{formatDfsRankDiff(row.overallRankDiff)}</strong></div>
      {row.position === "RB" && (
        <>
          <div><span className="text-slate-400">Touches</span> <strong className="text-slate-900">{metric(context.evidence.touches.value)}</strong></div>
          <div><span className="text-slate-400">YPC</span> <strong className="text-slate-900">{metric(context.evidence.yardsPerCarry.value, 2)}</strong></div>
          <div><span className="text-slate-400">Rec Targets</span> <strong className="text-slate-900">{metric(context.evidence.receivingTargets.value)}</strong></div>
        </>
      )}
      {(row.position === "WR" || row.position === "TE") && (
        <>
          <div><span className="text-slate-400">Target Share</span> <strong className="text-slate-900">{context.evidence.targetShare.value == null ? "N/A" : `${(context.evidence.targetShare.value * 100).toFixed(1)}%`}</strong></div>
          <div><span className="text-slate-400">Air Yds/Game</span> <strong className="text-slate-900">{metric(context.evidence.airYardsPerGame.value)}</strong></div>
          <div><span className="text-slate-400">Targets/Game</span> <strong className="text-slate-900">{metric(context.evidence.targetsPerGame.value, 1)}</strong></div>
        </>
      )}
    </div>
  );
}

export type NflDfsAnalyzerTableProps = {
  rows: readonly DfsEnrichedAnalyzerRow[];
  historyTarget?: HistoryTarget;
  dstEdges?: ReadonlyMap<string, FantasyMatchupEdges>;
  projectionRows?: readonly WeeklyFantasyProjectionProductionRow[];
};

export default function NflDfsAnalyzerTable({ rows, historyTarget, dstEdges, projectionRows = EMPTY_PROJECTIONS }: NflDfsAnalyzerTableProps) {
  const [historyState, setHistoryState] = useState<{ target: HistoryTarget; index: DfsHistoryIndex | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (historyTarget) void dfsHistoryLoader.index(historyTarget).then(
      index => { if (active) setHistoryState({ target: historyTarget, index }); },
      () => { if (active) setHistoryState({ target: historyTarget, index: null }); },
    );
    return () => { active = false; };
  }, [historyTarget]);
  const currentHistory = historyState?.target === historyTarget ? historyState : null;
  const historyIndex = currentHistory?.index ?? null;
  const historyLoading = !!historyTarget && !currentHistory;
  const coverage = historyIndex ? historyCoverage(historyIndex, rows) : null;
  const [view, setView] = useState<DfsBoardView>("VALUE");
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [optimizerEligibleOnly, setOptimizerEligibleOnly] = useState(false);
  const [direction, setDirection] = useState<DfsDirectionFilter>("all");
  const [sortKey, setSortKey] = useState<DfsSortKey>("rankDiff");
  const [sortDirection, setSortDirection] = useState<DfsSortDirection>("desc");
  const [expandedDkId, setExpandedDkId] = useState<string | null>(null);
  const isDst = view === "DST";
  const columns = [...BASE_COLUMNS, ...(isDst ? [{ key: "dstRank" as const, label: "DST Matchup RK" }, { key: "dstScore" as const, label: "DST Score" }] : OFFENSE_COLUMNS), ...EDGE_COLUMNS,
    ...(!isDst ? [{ key: "defenseAvg" as const, label: "DEF VS AVG" }] : [])];
  const visibleRows = useMemo(() => sortDfsRows(filterDfsRows(selectDfsBoardRows(rows, view), { search, availableOnly, optimizerEligibleOnly, direction: isDst ? "all" : direction }), sortKey, sortDirection, { historyIndex, dstEdges }),
    [rows, view, search, availableOnly, optimizerEligibleOnly, direction, isDst, sortKey, sortDirection, historyIndex, dstEdges]);
  const projectionStyles = useMemo(() => dfsValueStyles(rows, row => row.projectedFantasyPoints), [rows]);
  const valueStyles = useMemo(() => dfsValueStyles(rows, row => row.pointsPer1k), [rows]);
  const sort = (key: DfsSortKey) => {
    setSortDirection(key === sortKey ? sortDirection === "asc" ? "desc" : "asc" : defaultDfsSortDirection(key));
    setSortKey(key);
  };
  const renderMetric = (row: DfsEnrichedAnalyzerRow, key: DfsSortKey) => {
    switch (key) {
      case "salary": return formatDfsSalary(row.salary);
      case "dkPosRank": return formatDfsRank(row.dkPositionSalaryRank);
      case "jkbSlateRank": return <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(row.jkbSlatePositionRank, rows.filter(entry => entry.position === row.position && entry.jkbSlatePositionRank != null).length))}>{formatDfsRank(row.jkbSlatePositionRank)}</DfsHeatValue>;
      case "weeklyRank": return <DfsHeatValue style={dfsWeeklyRankStyle(row, projectionRows)}>{row.jkbWeeklyPositionRank == null ? "—" : `${row.position}${row.jkbWeeklyPositionRank}`}</DfsHeatValue>;
      case "rankDiff": return <DfsHeatValue style={weeklyHeatStyle(getDfsRankDiffTone(row.posRankDiff))}>{formatDfsRankDiff(row.posRankDiff)}</DfsHeatValue>;
      case "proj": return <DfsHeatValue style={projectionStyles.get(row.dkId)}>{formatDfsProjection(row.projectedFantasyPoints)}</DfsHeatValue>;
      case "pts1k": return <DfsHeatValue style={valueStyles.get(row.dkId)}>{formatDfsPointsPer1k(row.pointsPer1k)}</DfsHeatValue>;
      case "matchup": return <DfsHeatValue style={weeklyHeatStyle(matchupGradeHeatTone(row.research?.matchupGrade?.id))}>{row.research?.matchupGrade?.label ?? "—"}</DfsHeatValue>;
      case "fpaSeason": case "fpaLast5": return <FpaSignal row={row} period={key === "fpaSeason" ? "season" : "last5"} />;
      case "epa": case "success": case "trenches": {
        const value = dfsMatchupValue(row, key, { dstEdges });
        const edge = (row.kind === "dst" ? dstEdges?.get(row.dkId) : row.research?.matchupEdges)?.[key];
        const title = edge ? `${edge.offense?.label ?? "Offense"} #${edge.offenseRank ?? "—"} vs ${edge.defense?.label ?? "Defense"} #${edge.defenseRank ?? "—"}; ${edge.sampleLabel}; ${edge.source}` : "Canonical matchup context unavailable";
        return <DfsHeatValue style={weeklyHeatStyle(weeklyMatchupDifferenceHeatTone(value))} title={title}>{value == null ? "—" : `${value > 0 ? "+" : ""}${value}`}</DfsHeatValue>;
      }
      case "defenseAvg": return <DefenseSignal row={row} index={historyIndex} loading={historyLoading} />;
      case "dstRank": if (row.kind !== "dst") return "—"; return <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(row.dstMatchup?.dstMatchupRank, rows.filter(entry => entry.kind === "dst" && entry.dstMatchup?.dstMatchupRank != null).length))}>{formatDfsRank(row.dstMatchup?.dstMatchupRank)}</DfsHeatValue>;
      case "dstScore": if (row.kind !== "dst") return "—"; return <DfsHeatValue style={resolvePercentileDisplay({ value: row.dstMatchup?.dstMatchupScore, percentile: row.dstMatchup?.dstMatchupPercentile, direction: "higherBetter", bypassSampleGate: true }).style ?? undefined}>{formatDfsProjection(row.dstMatchup?.dstMatchupScore)}</DfsHeatValue>;
      default: return null;
    }
  };

  return <section aria-label="DFS analyzer table" className="min-w-0 space-y-2">
    <div role="tablist" aria-label="Board view" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200 p-1 sm:grid-cols-6">
      {BOARD_VIEWS.map(option => <button key={option} type="button" role="tab" aria-selected={view === option}
        onClick={() => { setView(option); setSortKey(option === "DST" ? "dstRank" : "rankDiff"); setSortDirection(option === "DST" ? "asc" : "desc"); }}
        className={cn("min-h-9 rounded-md px-2 text-[11px] font-bold focus-visible:ring-2 focus-visible:ring-sky-500",
          option !== "VALUE" && option !== "DST" ? POSITION_TAB_TONES[option][view === option ? "active" : "inactive"] : view === option ? "bg-slate-950 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}>
        {option === "VALUE" ? "Value Board" : option}
      </button>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search player" aria-label="Search player" className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-xs sm:max-w-[220px]" />
      <label className="flex min-h-8 items-center gap-1 text-[11px] font-semibold text-slate-700"><input type="checkbox" checked={availableOnly} onChange={event => setAvailableOnly(event.target.checked)} aria-label="Available only" />Available Only</label>
      <label className="flex min-h-8 items-center gap-1 text-[11px] font-semibold text-slate-700"><input type="checkbox" checked={optimizerEligibleOnly} onChange={event => setOptimizerEligibleOnly(event.target.checked)} aria-label="Optimizer Eligible" />Optimizer Eligible</label>
      {!isDst && <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">Direction
        <select aria-label="Direction filter" value={direction} onChange={event => setDirection(event.target.value as DfsDirectionFilter)} className="h-8 rounded-md border border-slate-300 px-1 text-[11px]">
          <option value="all">All</option><option value="jkb-higher">JKB Higher</option><option value="dk-higher">DK Higher</option><option value="agreement">Agreement</option>
        </select></label>}
      <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">Sort
        <select aria-label="Sort by" value={sortKey} onChange={event => { const key = event.target.value as DfsSortKey; setSortKey(key); setSortDirection(defaultDfsSortDirection(key)); }} className="h-8 rounded-md border border-slate-300 px-1 text-[11px]">
          {columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}
        </select></label>
    </div>
    {coverage && <p className="text-[10px] text-slate-500">Player history: {coverage.covered}/{coverage.total} offensive entries have a sample. Expand a player for yardage history; opponent coverage is independent.</p>}
    {isDst && <p className="text-[11px] text-slate-600">DST scores are matchup composites. EPA, success and trenches show the passing matchup from the defense’s perspective; positive favors the defense. No weekly DST fantasy rank or point projection is published.</p>}
    {!isDst && <p className="text-[10px] text-slate-500">Advantages are unit rank differences: rushing for RB, passing for QB/WR/TE. Positive favors the player’s offense. FPA source season and sample are available on hover.</p>}
    {visibleRows.length === 0 ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">No players match the current filters.</p> :
      <DenseTableScroller label={`${view} DFS analyzer`} className={cn(FANTASY_TABLE_SHELL, "overflow-x-auto")}>
        <table className="w-full border-collapse whitespace-nowrap text-[11px] tabular-nums" aria-label={`${view} DFS players`}>
          <thead className={stickyDenseHeader("bg-slate-100")}><tr className={DENSE_TABLE_HEAD_ROW}>
            {columns.map(column => <th key={column.key} scope="col" aria-sort={sortKey === column.key ? sortDirection === "asc" ? "ascending" : "descending" : "none"}
              title={column.key.startsWith("fpa") ? FPA_HELP : column.key === "defenseAvg" ? DEF_AVG_HELP : undefined}
              className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1 text-right")}>
              <DfsSortButton label={column.label} active={sortKey === column.key} direction={sortDirection} onClick={() => sort(column.key)} />
            </th>)}
            {!isDst && <th scope="col" className="px-1"><span className="sr-only">Details</span></th>}
          </tr></thead>
          <tbody>{visibleRows.map(row => {
            const expanded = expandedDkId === row.dkId;
            const status = getDfsStatusBadge(row.dkStatus);
            const warning = row.identityConflict ? "Multiple DraftKings rows resolved to the same JKB player." : row.identityStatus !== "resolved" ? "Could not match this DraftKings player uniquely to JKB." : row.teamMismatchStatus !== "none" ? "DK team differs from the JKB projection team." : null;
            return <Fragment key={row.dkId}>
              <tr data-dfs-player-row={row.dkId} className={cn(DENSE_TABLE_ROW, "group")}>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "border-l-2 px-2 py-1", DFS_POSITION_ACCENT[row.position])}><div className="flex items-center gap-1.5">
                  <DfsPositionBadge position={row.position} /><FantasyPlayerIdentity player={row.playerName} team={row.team} compact
                    onNameClick={isDst ? undefined : () => setExpandedDkId(expanded ? null : row.dkId)}
                    nameExpanded={expanded} nameAriaLabel={`${expanded ? "Collapse" : "Expand"} details for ${row.playerName}`} />
                  {status && <span className={cn("rounded border px-1 text-[9px] font-bold", DFS_STATUS_BADGE_CLASSES[status.tone])}>{status.label}</span>}
                  {warning && <span title={warning} aria-label={warning} className="text-[10px] font-semibold text-amber-800">Check identity</span>}
                </div></td>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1")}>{row.opponent ? <FantasyOpponentIdentity opponent={row.opponent} homeAway={row.homeAway ?? "neutral"} compact /> : "—"}</td>
                {columns.slice(2).map(column => <td key={column.key} className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1 text-right font-semibold")}>{renderMetric(row, column.key)}</td>)}
                {!isDst && <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-0")}><FantasyExpandControl label={`${expanded ? "Collapse" : "Expand"} ${row.playerName}`} expanded={expanded} onClick={() => setExpandedDkId(expanded ? null : row.dkId)} /></td>}
              </tr>
              {!isDst && expanded && <tr><td colSpan={columns.length + 1} className="whitespace-normal border-b border-slate-200 bg-slate-50 px-3 py-2">
                <ResearchDetail row={row} /><NflDfsHistory key={row.dkId} row={row} target={historyTarget} index={historyIndex} />
              </td></tr>}
            </Fragment>;
          })}</tbody>
        </table>
      </DenseTableScroller>}
    <DfsHeatLegend />
  </section>;
}
