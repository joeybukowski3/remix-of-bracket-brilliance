import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import { FANTASY_TABLE_BODY_CELL, FANTASY_TABLE_HEADER_CELL, FANTASY_TABLE_SHELL, FantasyExpandControl, FantasyPlayerIdentity, FantasyOpponentIdentity } from "@/components/fantasy/FantasyTable";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, frozenDenseColumn, stickyDenseHeader } from "@/components/ui/dense-table";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import type { FantasyMatchupEdges } from "@/lib/nfl/matchupEdges";
import { POSITION_TAB_TONES } from "@/lib/fantasy/positionTone";
import { DFS_STATUS_BADGE_CLASSES, defaultDfsSortDirection, dfsMatchupValue, filterDfsRows, formatDfsPointsPer1k, formatDfsProjection, formatDfsRank, formatDfsRankDiff, formatDfsSalary, getDfsRankDiffTone, getDfsStatusBadge, selectDfsBoardRows, sortDfsRows, type DfsBoardView, type DfsDirectionFilter, type DfsSortKey, type DfsSortDirection } from "@/lib/nfl/dfs/presentation";
import { dfsOptionalColumnsForView, dfsReviewGroupsForView, type DfsColumnId } from "@/lib/nfl/dfs/columnRegistry";
import { useDfsColumnVisibility } from "@/hooks/useDfsColumnVisibility";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import { playerSurname } from "@/lib/nfl/playerSurname";
import { weeklyHeatStyle } from "@/lib/fantasy/weekly/researchPresentation";
import { weeklyMatchupDifferenceHeatTone, weeklyRankHeatTone, resolvePercentileDisplay } from "@/lib/shared/jkbHeat";
import { cn } from "@/lib/utils";
import NflDfsHistory, { FpaSignal, DefenseSignal, FPA_HELP, DEF_AVG_HELP } from "./NflDfsHistory";
import { DfsHeatLegend, DfsHeatValue, DfsPositionBadge, DfsSortButton, FantasyPpgCell, MatchupCell, SlotWidePctCell, SlotWidePpgAllowedCell, TargetsPerGameCell, TdScoreCell } from "./DfsTableCells";
import DfsColumnMenu from "./DfsColumnMenu";
import { DFS_POSITION_ACCENT, dfsValueStyles } from "@/lib/nfl/dfs/tablePresentation";
import { dfsHistoryLoader, historyCoverage, type DfsHistoryIndex, type HistoryTarget } from "@/lib/nfl/dfs/historyDelivery";
import { resolveDfsDefRank, resolveDfsOppOffRank, type DfsTeamRank } from "@/lib/nfl/dfs/teamRankContext";
import type { DfsTdScoreLookup } from "@/lib/nfl/dfs/tdScoreContext";
import type { DfsSlotWideEntry } from "@/lib/nfl/dfs/slotWideContext";

const MOBILE_QUERY = "(max-width: 767px)";

const BOARD_VIEWS: readonly DfsBoardView[] = ["VALUE", "QB", "RB", "WR", "TE", "DST"];

/**
 * The workspace takeover deliberately paints above `SiteHeader` (`z-[100]`,
 * see `dense-table.tsx`'s layer ladder) -- it is the one place in the app
 * meant to cover the global chrome rather than defer to it.
 */
const DFS_WORKSPACE_Z = "z-[200]";

const WORKSPACE_QUERY_PARAM = "mode";
const WORKSPACE_QUERY_VALUE = "workspace";

function readWorkspaceModeFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(WORKSPACE_QUERY_PARAM) === WORKSPACE_QUERY_VALUE;
  } catch {
    return false;
  }
}

/** Non-registry evidence that supplements the registry-driven Player Review groups (overall ranks, RB/WR raw usage detail). */
function SupplementalResearchReview({ row }: { row: DfsEnrichedAnalyzerRow }) {
  if (row.kind === "dst") return null;
  const research = row.research;
  const context = research && research.status === "available" ? research.context : null;
  const metric = (value: number | null, digits = 1) => (value == null ? "N/A" : value.toFixed(digits));

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Additional Research</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-3">
        <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">DK Overall RK</dt><dd className="font-semibold text-slate-900">{formatDfsRank(row.dkOverallSalaryRank)}</dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">JKB Overall RK</dt><dd className="font-semibold text-slate-900">{formatDfsRank(row.jkbOverallSlateProjectionRank)}</dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Overall Diff</dt><dd className="font-semibold text-slate-900">{formatDfsRankDiff(row.overallRankDiff)}</dd></div>
        {context && row.position === "RB" && <>
          <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Touches</dt><dd className="font-semibold text-slate-900">{metric(context.evidence.touches.value)}</dd></div>
          <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">YPC</dt><dd className="font-semibold text-slate-900">{metric(context.evidence.yardsPerCarry.value, 2)}</dd></div>
          <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Rec Targets</dt><dd className="font-semibold text-slate-900">{metric(context.evidence.receivingTargets.value)}</dd></div>
        </>}
        {context && (row.position === "WR" || row.position === "TE") && <>
          <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Target Share</dt><dd className="font-semibold text-slate-900">{context.evidence.targetShare.value == null ? "N/A" : `${(context.evidence.targetShare.value * 100).toFixed(1)}%`}</dd></div>
          <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Air Yds/Game</dt><dd className="font-semibold text-slate-900">{metric(context.evidence.airYardsPerGame.value)}</dd></div>
        </>}
        {!context && <p className="col-span-2 text-slate-500 sm:col-span-3">No weekly research available for this player.</p>}
      </dl>
    </div>
  );
}

/**
 * Universal "Player Review" panel opened by clicking any player identity
 * (desktop or mobile, offense or DST). Driven entirely by the column
 * registry's review groups plus the same `renderMetric` the board uses, so
 * every applicable field is shown regardless of the user's current visible-
 * column choices, with identical JKB heat cells -- no second heat system.
 */
function PlayerReviewPanel({
  row,
  renderMetric,
  historyTarget,
  historyIndex,
}: {
  row: DfsEnrichedAnalyzerRow;
  renderMetric: (row: DfsEnrichedAnalyzerRow, key: DfsColumnId) => ReactNode;
  historyTarget?: HistoryTarget;
  historyIndex: DfsHistoryIndex | null;
}) {
  const isDstRow = row.kind === "dst";
  const groups = dfsReviewGroupsForView(isDstRow ? "DST" : row.position === "WR" ? "WR" : "VALUE");
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {groups.map(({ group, label, columns: groupColumns }) => (
          <div key={group} className="rounded-md border border-slate-200 bg-white p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <dl className="space-y-1">
              {groupColumns.map((column) => (
                <div key={column.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <dt className="text-slate-500">{column.label}</dt>
                  <dd className="font-semibold text-slate-900">{renderMetric(row, column.id)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {!isDstRow && <SupplementalResearchReview row={row} />}
      {isDstRow
        ? <p className="text-[11px] text-slate-500">JKB projection unavailable for DST; showing team matchup context only.</p>
        : <NflDfsHistory row={row} target={historyTarget} index={historyIndex} />}
    </div>
  );
}

export type NflDfsAnalyzerTableProps = {
  rows: readonly DfsEnrichedAnalyzerRow[];
  historyTarget?: HistoryTarget;
  dstEdges?: ReadonlyMap<string, FantasyMatchupEdges>;
  /** DST view Def Rank / Off Rank — the universal current-season Power Board OFF/DEF ranks. */
  teamRankByAbbr?: ReadonlyMap<string, DfsTeamRank>;
  /** TD Score column join — the canonical Touchdown Preview artifact's default-window JKB TD Score. */
  tdScoreLookup?: DfsTdScoreLookup;
  /** WR-only Opp Slot %/Opp Wide %/Slot PPG Allowed/Wide PPG Allowed — the shared Razzball slot/wide defense artifact, joined by opponent. */
  slotWideByAbbr?: ReadonlyMap<string, DfsSlotWideEntry>;
};

export default function NflDfsAnalyzerTable({ rows, historyTarget, dstEdges, teamRankByAbbr, tdScoreLookup, slotWideByAbbr }: NflDfsAnalyzerTableProps) {
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
  const [reviewDkId, setReviewDkId] = useState<string | null>(null);
  // "Full screen" is a dedicated workspace mode, not a modal: it takes over
  // the whole viewport and hides site chrome instead of floating a dialog
  // over the page. Mirrored into `?mode=workspace` on the current URL so a
  // reload or shared link lands back in the workspace, and so the browser
  // Back button exits it before leaving the page.
  const [isFullScreen, setIsFullScreen] = useState(readWorkspaceModeFromLocation);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const hasWorkspaceParam = url.searchParams.get(WORKSPACE_QUERY_PARAM) === WORKSPACE_QUERY_VALUE;
    if (isFullScreen && !hasWorkspaceParam) {
      url.searchParams.set(WORKSPACE_QUERY_PARAM, WORKSPACE_QUERY_VALUE);
      window.history.pushState({ dfsWorkspace: true }, "", url);
    } else if (!isFullScreen && hasWorkspaceParam) {
      url.searchParams.delete(WORKSPACE_QUERY_PARAM);
      window.history.replaceState({}, "", url);
    }
  }, [isFullScreen]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = () => setIsFullScreen(readWorkspaceModeFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!isFullScreen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsFullScreen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isFullScreen]);
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
  const visibleRows = useMemo(() => sortDfsRows(filterDfsRows(selectDfsBoardRows(rows, view), { search, availableOnly, optimizerEligibleOnly, direction: isDst ? "all" : direction }), sortKey, sortDirection, { historyIndex, dstEdges, teamRankByAbbr, tdScoreLookup, slotWideByAbbr }),
    [rows, view, search, availableOnly, optimizerEligibleOnly, direction, isDst, sortKey, sortDirection, historyIndex, dstEdges, teamRankByAbbr, tdScoreLookup, slotWideByAbbr]);
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
      case "defRank": {
        if (row.kind !== "dst") return "—";
        const rank = resolveDfsDefRank(teamRankByAbbr ?? new Map(), row.team);
        const pool = rows.filter(entry => entry.kind === "dst" && resolveDfsDefRank(teamRankByAbbr ?? new Map(), entry.team) != null).length;
        return <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(rank, pool))} title="This DST's overall JKB defense rank (universal current-season Power Board)">{formatDfsRank(rank)}</DfsHeatValue>;
      }
      case "oppOffRank": {
        if (row.kind !== "dst") return "—";
        const rank = resolveDfsOppOffRank(teamRankByAbbr ?? new Map(), row.opponent);
        const pool = rows.filter(entry => entry.kind === "dst" && resolveDfsOppOffRank(teamRankByAbbr ?? new Map(), entry.opponent) != null).length;
        return <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(rank, pool))} title="Opponent's overall JKB offense rank (universal current-season Power Board)">{formatDfsRank(rank)}</DfsHeatValue>;
      }
      case "targetsPerGame": return <TargetsPerGameCell row={row} period="season" />;
      case "targetsPerGameL5": return <TargetsPerGameCell row={row} period="last5" />;
      case "tdScore": return <TdScoreCell row={row} lookup={tdScoreLookup ?? new Map()} />;
      case "slotPpgAllowed": return <SlotWidePpgAllowedCell row={row} slotWideByAbbr={slotWideByAbbr ?? new Map()} field="slot" />;
      case "widePpgAllowed": return <SlotWidePpgAllowedCell row={row} slotWideByAbbr={slotWideByAbbr ?? new Map()} field="wide" />;
      case "oppSlotPct": return <SlotWidePctCell row={row} slotWideByAbbr={slotWideByAbbr ?? new Map()} field="slot" />;
      case "oppWidePct": return <SlotWidePctCell row={row} slotWideByAbbr={slotWideByAbbr ?? new Map()} field="wide" />;
      default: return null;
    }
  };

  const toolbar = <>
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
      <button type="button" aria-pressed={isFullScreen} onClick={() => setIsFullScreen(value => !value)}
        className="flex min-h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        {isFullScreen ? <Minimize2 aria-hidden className="h-3.5 w-3.5" /> : <Maximize2 aria-hidden className="h-3.5 w-3.5" />}
        {isFullScreen ? "Exit Full Screen" : "Full Screen"}
      </button>
    </div>
  </>;

  const contextNotes = <>
    {coverage && <p className="text-[10px] text-slate-500">Player history: {coverage.covered}/{coverage.total} offensive entries have a sample. Expand a player for yardage history; opponent coverage is independent.</p>}
    {isDst && <p className="text-[11px] text-slate-600">DST scores are matchup composites. EPA, success and trenches show the passing matchup from the defense’s perspective; positive favors the defense. No weekly DST fantasy rank or point projection is published.</p>}
    {!isDst && <p className="text-[10px] text-slate-500">Advantages are unit rank differences: rushing for RB, passing for QB/WR/TE. Positive favors the player’s offense. FPA source season and sample are available on hover.</p>}
  </>;

  const tableSection =
    visibleRows.length === 0 ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">No players match the current filters.</p> :
      <DenseTableScroller label={`${view} DFS analyzer`} className={cn(FANTASY_TABLE_SHELL, "overflow-x-auto", isFullScreen && "h-full overflow-y-auto")}>
        <table className="w-full border-collapse whitespace-nowrap text-[11px] tabular-nums" aria-label={`${view} DFS players`}>
          <thead className={stickyDenseHeader("bg-slate-100")}><tr className={DENSE_TABLE_HEAD_ROW}>
            {columns.map((column, index) => <th key={column.id} scope="col" aria-sort={sortKey === column.sortKey ? sortDirection === "asc" ? "ascending" : "descending" : "none"}
              title={column.id.startsWith("fpa") ? FPA_HELP : column.id === "defenseAvg" ? DEF_AVG_HELP : column.headerHelp}
              className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1", column.align === "left" ? "text-left" : "text-right",
                index === 0 && frozenDenseColumn({ isHeader: true, surface: "bg-slate-100", className: "border-r border-slate-200" }))}>
              <DfsSortButton label={column.label} active={sortKey === column.sortKey} direction={sortDirection} onClick={() => { if (column.sortKey) sort(column.sortKey); }} />
            </th>)}
            {!isDst && <th scope="col" className={cn("px-1", isCompact && "sticky right-0 bg-slate-100")}><span className="sr-only">Details</span></th>}
          </tr></thead>
          <tbody>{visibleRows.map(row => {
            const reviewOpen = reviewDkId === row.dkId;
            const status = getDfsStatusBadge(row.dkStatus);
            const warning = row.identityConflict ? "Multiple DraftKings rows resolved to the same JKB player." : row.identityStatus !== "resolved" ? "Could not match this DraftKings player uniquely to JKB." : row.teamMismatchStatus !== "none" ? "DK team differs from the JKB projection team." : null;
            return <Fragment key={row.dkId}>
              <tr data-dfs-player-row={row.dkId} className={cn(DENSE_TABLE_ROW, "group")}>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "border-l-2 px-2 py-1", DFS_POSITION_ACCENT[row.position],
                  frozenDenseColumn({ surface: "bg-white", className: "border-r border-slate-200 group-hover:bg-slate-50" }))}><div className="flex items-center gap-1.5">
                  <DfsPositionBadge position={row.position} /><FantasyPlayerIdentity player={isCompact ? playerSurname(row.playerName) : row.playerName} team={row.team} compact showTeamAbbreviation={false}
                    onNameClick={() => setReviewDkId(current => current === row.dkId ? null : row.dkId)}
                    nameExpanded={reviewOpen}
                    nameAriaLabel={`${reviewOpen ? "Collapse" : "Expand"} details for ${row.playerName}`} />
                  {status && <span className={cn("rounded border px-1 text-[9px] font-bold", DFS_STATUS_BADGE_CLASSES[status.tone])}>{status.label}</span>}
                  {warning && <span title={warning} aria-label={warning} className="text-[10px] font-semibold text-amber-800">Check identity</span>}
                </div></td>
                <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1")}>{row.opponent ? <FantasyOpponentIdentity opponent={row.opponent} homeAway={row.homeAway ?? "neutral"} compact showAbbreviation={false} /> : "—"}</td>
                {columns.slice(2).map(column => <td key={column.id} className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1 text-right font-semibold")}>{renderMetric(row, column.id)}</td>)}
                {!isDst && <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-0", isCompact && "sticky right-0 bg-white group-hover:bg-slate-50")}><FantasyExpandControl label={`${reviewOpen ? "Collapse" : "Expand"} ${row.playerName}`} expanded={reviewOpen} onClick={() => setReviewDkId(reviewOpen ? null : row.dkId)} /></td>}
              </tr>
              {reviewOpen && <tr data-dfs-player-review={row.dkId}><td colSpan={isDst ? columns.length : columns.length + 1} className="whitespace-normal border-b border-slate-200 bg-slate-50 px-3 py-2">
                <PlayerReviewPanel row={row} renderMetric={renderMetric} historyTarget={historyTarget} historyIndex={historyIndex} />
              </td></tr>}
            </Fragment>;
          })}</tbody>
        </table>
      </DenseTableScroller>;

  if (isFullScreen) {
    // A dedicated full-viewport workspace, not a floating dialog: it is
    // portaled to `document.body` and painted above the site chrome
    // (see `DFS_WORKSPACE_Z`) so nothing about the normal page -- header,
    // nav, page padding -- is reachable while it's open. Position tabs and
    // the filter toolbar are pinned in a `shrink-0` row; only the table
    // region below scrolls, and it keeps its own frozen header/column.
    return createPortal(
      <div role="dialog" aria-modal="true" aria-label={`${view} DFS analyzer, full screen`}
        className={cn("fixed inset-0 flex flex-col gap-2 bg-slate-50 p-3", DFS_WORKSPACE_Z)}>
        <div className="shrink-0 space-y-2">{toolbar}</div>
        <div className="shrink-0 space-y-1">{contextNotes}</div>
        <div className="min-h-0 flex-1">{tableSection}</div>
        <div className="shrink-0"><DfsHeatLegend /></div>
      </div>,
      document.body,
    );
  }

  return <section aria-label="DFS analyzer table" className="min-w-0 space-y-2">
    {toolbar}
    {contextNotes}
    {tableSection}
    <DfsHeatLegend />
  </section>;
}
