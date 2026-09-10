import { Fragment, useEffect, useMemo, useState } from "react";
import { FANTASY_TABLE_BODY_CELL, FANTASY_TABLE_HEADER_CELL, FANTASY_TABLE_SHELL, FantasyExpandControl, FantasyPlayerIdentity, FantasyOpponentIdentity } from "@/components/fantasy/FantasyTable";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, frozenDenseColumn, stickyDenseHeader } from "@/components/ui/dense-table";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import type { FantasyMatchupEdges } from "@/lib/nfl/matchupEdges";
import { POSITION_TAB_TONES } from "@/lib/fantasy/positionTone";
import { DFS_STATUS_BADGE_CLASSES, defaultDfsSortDirection, dfsMatchupValue, filterDfsRows, formatDfsPointsPer1k, formatDfsProjection, formatDfsRank, formatDfsRankDiff, formatDfsSalary, getDfsRankDiffTone, getDfsStatusBadge, selectDfsBoardRows, sortDfsRows, type DfsBoardView, type DfsDirectionFilter, type DfsSortKey, type DfsSortDirection } from "@/lib/nfl/dfs/presentation";
import { dfsOptionalColumnsForView, type DfsColumnId } from "@/lib/nfl/dfs/columnRegistry";
import { useDfsColumnVisibility } from "@/hooks/useDfsColumnVisibility";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { playerSurname } from "@/lib/nfl/playerSurname";
import { weeklyHeatStyle } from "@/lib/fantasy/weekly/researchPresentation";
import { weeklyMatchupDifferenceHeatTone, weeklyRankHeatTone, resolvePercentileDisplay } from "@/lib/shared/jkbHeat";
import { cn } from "@/lib/utils";
import NflDfsHistory, { FpaSignal, DefenseSignal, FPA_HELP, DEF_AVG_HELP } from "./NflDfsHistory";
import { DfsHeatLegend, DfsHeatValue, DfsPositionBadge, DfsSortButton, FantasyPpgCell, MatchupCell } from "./DfsTableCells";
import DfsColumnMenu from "./DfsColumnMenu";
import { DFS_POSITION_ACCENT, dfsValueStyles } from "@/lib/nfl/dfs/tablePresentation";
import { dfsHistoryLoader, historyCoverage, type DfsHistoryIndex, type HistoryTarget } from "@/lib/nfl/dfs/historyDelivery";

const MOBILE_QUERY = "(max-width: 767px)";

const BOARD_VIEWS: readonly DfsBoardView[] = ["VALUE", "QB", "RB", "WR", "TE", "DST"];

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
};

export default function NflDfsAnalyzerTable({ rows, historyTarget, dstEdges }: NflDfsAnalyzerTableProps) {
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
  const [mobileDetailDkId, setMobileDetailDkId] = useState<string | null>(null);
  const isDst = view === "DST";
  const isCompact = useIsCompactLayout(MOBILE_QUERY);
  const visibility = useDfsColumnVisibility(isCompact ? "mobile" : "desktop");
  const columns = useMemo(() => visibility.columnsForView(view), [visibility, view]);
  const optionalColumns = useMemo(() => dfsOptionalColumnsForView(view), [view]);
  const defaultSortKey: DfsSortKey = isDst ? "dstRank" : "rankDiff";
  // Section 14: if the active sort key is not a *visible* column of the current
  // view (the user hid it, or it is stale after a view switch), fall back to the
  // view default sort when that is still visible, otherwise to the first visible
  // sortable column. Visible-but-reordered columns keep their sort.
  useEffect(() => {
    if (columns.some((column) => column.sortKey === sortKey)) return;
    const fallback =
      columns.find((column) => column.sortKey === defaultSortKey)?.sortKey
      ?? columns.find((column) => column.sortable && column.sortKey)?.sortKey
      ?? defaultSortKey;
    setSortKey(fallback);
    setSortDirection(defaultDfsSortDirection(fallback));
  }, [columns, defaultSortKey, sortKey]);
  const visibleRows = useMemo(() => sortDfsRows(filterDfsRows(selectDfsBoardRows(rows, view), { search, availableOnly, optimizerEligibleOnly, direction: isDst ? "all" : direction }), sortKey, sortDirection, { historyIndex, dstEdges }),
    [rows, view, search, availableOnly, optimizerEligibleOnly, direction, isDst, sortKey, sortDirection, historyIndex, dstEdges]);
  const projectionStyles = useMemo(() => dfsValueStyles(rows, row => row.projectedFantasyPoints), [rows]);
  const valueStyles = useMemo(() => dfsValueStyles(rows, row => row.pointsPer1k), [rows]);
  const sort = (key: DfsSortKey) => {
    setSortDirection(key === sortKey ? sortDirection === "asc" ? "desc" : "asc" : defaultDfsSortDirection(key));
    setSortKey(key);
  };
  const renderMetric = (row: DfsEnrichedAnalyzerRow, key: DfsColumnId) => {
    switch (key) {
      case "salary": return formatDfsSalary(row.salary);
      case "dkPosRank": {
        const pool = rows.filter(entry => entry.position === row.position).length;
        return <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(row.dkPositionSalaryRank, pool))}>{formatDfsRank(row.dkPositionSalaryRank)}</DfsHeatValue>;
      }
      case "jkbSlateRank": return <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(row.jkbSlatePositionRank, rows.filter(entry => entry.position === row.position && entry.jkbSlatePositionRank != null).length))}>{formatDfsRank(row.jkbSlatePositionRank)}</DfsHeatValue>;
      case "rankDiff": return <DfsHeatValue style={weeklyHeatStyle(getDfsRankDiffTone(row.posRankDiff))}>{formatDfsRankDiff(row.posRankDiff)}</DfsHeatValue>;
      case "proj": return <DfsHeatValue style={projectionStyles.get(row.dkId)}>{formatDfsProjection(row.projectedFantasyPoints)}</DfsHeatValue>;
      case "pts1k": return <DfsHeatValue style={valueStyles.get(row.dkId)}>{formatDfsPointsPer1k(row.pointsPer1k)}</DfsHeatValue>;
      case "fantasyPpg": return <FantasyPpgCell row={row} period="season" />;
      case "fantasyPpgL5": return <FantasyPpgCell row={row} period="last5" />;
      case "matchup": return <MatchupCell row={row} />;
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
          {columns.filter(column => column.sortable && column.sortKey).map(column => <option key={column.id} value={column.sortKey as string}>{column.label}</option>)}
        </select></label>
      <DfsColumnMenu
        optionalColumns={optionalColumns}
        isVisible={visibility.isVisible}
        onToggle={visibility.toggle}
        onReset={visibility.reset}
        isCustomized={visibility.isCustomized}
      />
    </div>
    {coverage && <p className="text-[10px] text-slate-500">Player history: {coverage.covered}/{coverage.total} offensive entries have a sample. Expand a player for yardage history; opponent coverage is independent.</p>}
    {isDst && <p className="text-[11px] text-slate-600">DST scores are matchup composites. EPA, success and trenches show the passing matchup from the defense’s perspective; positive favors the defense. No weekly DST fantasy rank or point projection is published.</p>}
    {!isDst && <p className="text-[10px] text-slate-500">Advantages are unit rank differences: rushing for RB, passing for QB/WR/TE. Positive favors the player’s offense. FPA source season and sample are available on hover.</p>}
    {visibleRows.length === 0 ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">No players match the current filters.</p> :
      <DenseTableScroller label={`${view} DFS analyzer`} className={cn(FANTASY_TABLE_SHELL, "overflow-x-auto")}>
        <table className="w-full border-collapse whitespace-nowrap text-[11px] tabular-nums" aria-label={`${view} DFS players`}>
          <thead className={stickyDenseHeader("bg-slate-100")}><tr className={DENSE_TABLE_HEAD_ROW}>
            {columns.map((column, index) => <th key={column.id} scope="col" aria-sort={sortKey === column.sortKey ? sortDirection === "asc" ? "ascending" : "descending" : "none"}
              title={column.id.startsWith("fpa") ? FPA_HELP : column.id === "defenseAvg" ? DEF_AVG_HELP : column.headerHelp}
              className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1", column.align === "left" ? "text-left" : "text-right",
                isCompact && index === 0 && frozenDenseColumn({ isHeader: true, surface: "bg-slate-100", className: "border-r border-slate-200" }))}>
              <DfsSortButton label={column.label} active={sortKey === column.sortKey} direction={sortDirection} onClick={() => { if (column.sortKey) sort(column.sortKey); }} />
            </th>)}
            {!isDst && <th scope="col" className={cn("px-1", isCompact && "sticky right-0 bg-slate-100")}><span className="sr-only">Details</span></th>}
          </tr></thead>
          <tbody>{visibleRows.map(row => {
            const expanded = expandedDkId === row.dkId;
            const mobileDetailOpen = mobileDetailDkId === row.dkId;
            const status = getDfsStatusBadge(row.dkStatus);
            const warning = row.identityConflict ? "Multiple DraftKings rows resolved to the same JKB player." : row.identityStatus !== "resolved" ? "Could not match this DraftKings player uniquely to JKB." : row.teamMismatchStatus !== "none" ? "DK team differs from the JKB projection team." : null;
            return <Fragment key={row.dkId}>
              <tr data-dfs-player-row={row.dkId} className={cn(DENSE_TABLE_ROW, "group")}>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "border-l-2 px-2 py-1", DFS_POSITION_ACCENT[row.position],
                  isCompact && frozenDenseColumn({ surface: "bg-white", className: "border-r border-slate-200 group-hover:bg-slate-50" }))}><div className="flex items-center gap-1.5">
                  <DfsPositionBadge position={row.position} /><FantasyPlayerIdentity player={isCompact ? playerSurname(row.playerName) : row.playerName} team={row.team} compact showTeamAbbreviation={false}
                    onNameClick={isDst ? undefined : () => (isCompact
                      ? setMobileDetailDkId(current => current === row.dkId ? null : row.dkId)
                      : setExpandedDkId(current => current === row.dkId ? null : row.dkId))}
                    nameExpanded={isCompact ? mobileDetailOpen : expanded}
                    nameAriaLabel={isCompact
                      ? `${mobileDetailOpen ? "Hide" : "Show"} row details for ${row.playerName}`
                      : `${expanded ? "Collapse" : "Expand"} details for ${row.playerName}`} />
                  {status && <span className={cn("rounded border px-1 text-[9px] font-bold", DFS_STATUS_BADGE_CLASSES[status.tone])}>{status.label}</span>}
                  {warning && <span title={warning} aria-label={warning} className="text-[10px] font-semibold text-amber-800">Check identity</span>}
                </div></td>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1")}>{row.opponent ? <FantasyOpponentIdentity opponent={row.opponent} homeAway={row.homeAway ?? "neutral"} compact showAbbreviation={false} /> : "—"}</td>
                {columns.slice(2).map(column => <td key={column.id} className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1 text-right font-semibold")}>{renderMetric(row, column.id)}</td>)}
                {!isDst && <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-0", isCompact && "sticky right-0 bg-white group-hover:bg-slate-50")}><FantasyExpandControl label={`${expanded ? "Collapse" : "Expand"} ${row.playerName}`} expanded={expanded} onClick={() => setExpandedDkId(expanded ? null : row.dkId)} /></td>}
              </tr>
              {!isDst && isCompact && mobileDetailOpen && <tr data-dfs-mobile-detail={row.dkId}><td colSpan={columns.length + 1} className="whitespace-normal border-b border-slate-200 bg-slate-50 px-3 py-2">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  {columns.slice(2).map(column => <div key={column.id} className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">{column.label}</dt>
                    <dd className="font-semibold text-slate-900">{renderMetric(row, column.id)}</dd>
                  </div>)}
                  {columns.length <= 2 && <p className="col-span-2 text-slate-500">All optional columns are hidden. Use “Columns” to add metrics.</p>}
                </dl>
              </td></tr>}
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
