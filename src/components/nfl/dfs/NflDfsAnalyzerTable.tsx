import { Fragment, useMemo, useState } from "react";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FANTASY_TABLE_SHELL,
  FantasyExpandControl,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
import {
  DENSE_TABLE_HEAD_ROW,
  DENSE_TABLE_ROW,
  DenseTableScroller,
  stickyDenseHeader,
} from "@/components/ui/dense-table";
import useIsCompactLayout from "@/hooks/useIsCompactLayout";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import {
  DFS_STATUS_BADGE_CLASSES,
  filterDfsRows,
  formatDfsPointsPer1k,
  formatDfsProjection,
  formatDfsRank,
  formatDfsRankDiff,
  formatDfsSalary,
  getDfsRankDiffTone,
  getDfsStatusBadge,
  selectDfsBoardRows,
  sortDfsRows,
  type DfsBoardView,
  type DfsDirectionFilter,
  type DfsSortKey,
} from "@/lib/nfl/dfs/presentation";
import { matchupGradeHeatClass, weeklyHeatStyle } from "@/lib/fantasy/weekly/researchPresentation";
import { cn } from "@/lib/utils";

const BOARD_VIEWS: readonly DfsBoardView[] = ["VALUE", "QB", "RB", "WR", "TE", "DST"];

const SORT_OPTIONS: Array<{ key: DfsSortKey; label: string }> = [
  { key: "rankDiff", label: "Rank Diff" },
  { key: "proj", label: "JKB Proj" },
  { key: "pts1k", label: "JKB Pts/$1K" },
  { key: "salary", label: "Salary" },
  { key: "dkPosRank", label: "DK Pos RK" },
  { key: "jkbSlateRank", label: "JKB Slate RK" },
];

const DIRECTION_OPTIONS: Array<{ key: DfsDirectionFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "jkb-higher", label: "JKB Higher" },
  { key: "dk-higher", label: "DK Higher" },
  { key: "agreement", label: "Agreement" },
];

function StatusBadge({ status }: { status: string | null }) {
  const badge = getDfsStatusBadge(status);
  if (!badge) return null;
  return (
    <span className={cn("ml-1 inline-flex items-center rounded border px-1 py-0.5 text-[9px] font-black uppercase leading-none", DFS_STATUS_BADGE_CLASSES[badge.tone])}>
      {badge.label}
    </span>
  );
}

function RankDiffCell({ diff, size = "normal" }: { diff: number | null; size?: "normal" | "large" }) {
  const tone = getDfsRankDiffTone(diff);
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.75rem] items-center justify-center rounded px-1.5 py-0.5 font-black tabular-nums",
        size === "large" ? "text-sm" : "text-xs",
      )}
      style={weeklyHeatStyle(tone)}
    >
      {formatDfsRankDiff(diff)}
    </span>
  );
}

function IdentityWarning({ row }: { row: DfsEnrichedAnalyzerRow }) {
  if (row.identityConflict) {
    return (
      <p className="mt-1 text-[10px] font-semibold text-rose-700">
        Multiple DraftKings rows resolved to the same JKB player -- JKB metrics unavailable for this row.
      </p>
    );
  }
  if (row.identityStatus !== "resolved") {
    return (
      <p className="mt-1 text-[10px] font-semibold text-amber-700">
        Could not match this DraftKings player uniquely to the JKB weekly projection universe.
      </p>
    );
  }
  if (row.teamMismatchStatus === "unexplained") {
    return (
      <p className="mt-1 text-[10px] font-semibold text-rose-700">
        DK team differs from the JKB projection team and is not explained by a known team change. Verify before using this row.
      </p>
    );
  }
  if (row.teamMismatchStatus === "audited") {
    return <p className="mt-1 text-[10px] font-semibold text-amber-700">DK team differs from the JKB projection team, consistent with a known team change.</p>;
  }
  return null;
}

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
      <div>
        <span className="text-slate-400">Matchup</span>{" "}
        <strong className={cn("rounded px-1 py-0.5", matchupGradeHeatClass(research.matchupGrade?.id ?? null))}>{research.matchupGrade?.label ?? "N/A"}</strong>
      </div>
      <div><span className="text-slate-400">Opp Allowed (Season)</span> <strong className="text-slate-900">{metric(context.opponentFpaSeason.value)}</strong></div>
      <div><span className="text-slate-400">Opp Allowed (L5)</span> <strong className="text-slate-900">{metric(context.opponentFpaLast5.value)}</strong></div>
      <div><span className="text-slate-400">Trenches</span> <strong className="text-slate-900">{research.matchupEdges?.trenches.rankDifference ?? "N/A"}</strong></div>
      <div><span className="text-slate-400">EPA Advantage</span> <strong className="text-slate-900">{research.matchupEdges?.epa.rankDifference ?? "N/A"}</strong></div>
      <div><span className="text-slate-400">Success Advantage</span> <strong className="text-slate-900">{research.matchupEdges?.success.rankDifference ?? "N/A"}</strong></div>
      <div><span className="text-slate-400">DK Overall RK</span> <strong className="text-slate-900">{formatDfsRank(row.dkOverallSalaryRank)}</strong></div>
      <div><span className="text-slate-400">JKB Overall RK</span> <strong className="text-slate-900">{formatDfsRank(row.jkbOverallSlateProjectionRank)}</strong></div>
      <div><span className="text-slate-400">Overall Diff</span> <RankDiffCell diff={row.overallRankDiff} /></div>
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
};

export default function NflDfsAnalyzerTable({ rows }: NflDfsAnalyzerTableProps) {
  const compact = useIsCompactLayout();
  const [view, setView] = useState<DfsBoardView>("VALUE");
  const [search, setSearch] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [direction, setDirection] = useState<DfsDirectionFilter>("all");
  const [sortKey, setSortKey] = useState<DfsSortKey>("rankDiff");
  const [expandedDkId, setExpandedDkId] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    const boardRows = selectDfsBoardRows(rows, view);
    const filtered = filterDfsRows(boardRows, { search, availableOnly, direction });
    return sortDfsRows(filtered, sortKey);
  }, [rows, view, search, availableOnly, direction, sortKey]);

  const isDst = view === "DST";

  return (
    <section aria-label="DFS analyzer table" className="space-y-2">
      <div role="tablist" aria-label="Board view" className="grid grid-cols-3 gap-1 rounded-lg bg-slate-200 p-1 sm:grid-cols-6">
        {BOARD_VIEWS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
            onClick={() => setView(option)}
            className={cn(
              "min-h-9 rounded-md px-2 text-[11px] font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
              view === option ? "bg-slate-950 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100",
            )}
          >
            {option === "VALUE" ? "Value Board" : option}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search player"
          aria-label="Search player"
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-xs sm:max-w-[220px]"
        />
        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
          <input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} aria-label="Available only" />
          Available Only
        </label>
        {!isDst && (
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
            Direction
            <select aria-label="Direction filter" value={direction} onChange={(event) => setDirection(event.target.value as DfsDirectionFilter)} className="h-8 rounded-md border border-slate-300 px-1 text-[11px]">
              {DIRECTION_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
          Sort
          <select aria-label="Sort by" value={sortKey} onChange={(event) => setSortKey(event.target.value as DfsSortKey)} className="h-8 rounded-md border border-slate-300 px-1 text-[11px]">
            {SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {visibleRows.length === 0 && (
        <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">
          No players match the current filters.
        </p>
      )}

      {visibleRows.length > 0 && !compact && (
        <DenseTableScroller
          label={`${view} DFS analyzer`}
          className={cn(FANTASY_TABLE_SHELL, "overflow-x-auto")}
        >
          <table className="w-full min-w-[860px] border-collapse text-[11px]">
            <thead className={stickyDenseHeader("bg-slate-50")}>
              <tr className={DENSE_TABLE_HEAD_ROW}>
                {["Player", "Team/Opp", "Salary", "DK Pos RK", "JKB Slate RK", "JKB Week RK", "Rank Diff", "JKB Proj", "JKB Pts/$1K", "Matchup", ""].map((label) => (
                  <th key={label} scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "px-2 py-1.5 text-left font-black uppercase tracking-wide text-slate-500")}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const expanded = expandedDkId === row.dkId;
                return (
                  <Fragment key={row.dkId}>
                    <tr className={cn(DENSE_TABLE_ROW, "group")}>
                      <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5")}>
                        <FantasyPlayerIdentity player={row.playerName} team={row.team} compact />
                        <StatusBadge status={row.dkStatus} />
                        <IdentityWarning row={row} />
                      </td>
                      <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 font-bold text-slate-700")}>
                        {row.opponent ? `${row.homeAway === "away" ? "@" : "vs"} ${row.opponent.toUpperCase()}` : "—"}
                      </td>
                      <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 font-bold tabular-nums text-slate-900")}>{formatDfsSalary(row.salary)}</td>
                      <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 tabular-nums")}>{formatDfsRank(row.dkPositionSalaryRank)}</td>
                      {isDst ? (
                        <td colSpan={5} className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 text-[10px] font-semibold italic text-slate-400")}>
                          No JKB DST projection — DraftKings context only
                        </td>
                      ) : (
                        <>
                          <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 tabular-nums")}>{formatDfsRank(row.kind === "offense" ? row.jkbSlatePositionRank : null)}</td>
                          <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 tabular-nums")}>{formatDfsRank(row.kind === "offense" ? row.jkbWeeklyPositionRank : null)}</td>
                          <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5")}><RankDiffCell diff={row.kind === "offense" ? row.posRankDiff : null} /></td>
                          <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 tabular-nums")}>{formatDfsProjection(row.kind === "offense" ? row.projectedFantasyPoints : null)}</td>
                          <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5 tabular-nums")}>{formatDfsPointsPer1k(row.kind === "offense" ? row.pointsPer1k : null)}</td>
                        </>
                      )}
                      <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-1.5")}>
                        {row.kind === "offense" && row.research?.matchupGrade ? (
                          <span className={cn("rounded px-1.5 py-0.5 font-bold", matchupGradeHeatClass(row.research.matchupGrade.id))}>{row.research.matchupGrade.label}</span>
                        ) : "—"}
                      </td>
                      <td className={cn(FANTASY_TABLE_BODY_CELL, "px-1 py-1.5")}>
                        <FantasyExpandControl label={`${expanded ? "Collapse" : "Expand"} ${row.playerName}`} expanded={expanded} onClick={() => setExpandedDkId(expanded ? null : row.dkId)} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={11} className="border-b border-slate-100 bg-slate-50/60 px-3 py-2">
                          <ResearchDetail row={row} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </DenseTableScroller>
      )}

      {visibleRows.length > 0 && compact && (
        <ul className="space-y-1.5">
          {visibleRows.map((row) => {
            const expanded = expandedDkId === row.dkId;
            return (
              <li key={row.dkId} className="rounded-lg border border-slate-200 bg-white p-2">
                <button type="button" onClick={() => setExpandedDkId(expanded ? null : row.dkId)} aria-expanded={expanded} className="flex w-full items-start justify-between gap-2 text-left">
                  <div className="min-w-0 flex-1">
                    <FantasyPlayerIdentity player={row.playerName} team={row.team} compact />
                    <StatusBadge status={row.dkStatus} />
                    <p className="mt-1 text-[10px] font-semibold text-slate-500">
                      {row.opponent ? `${row.homeAway === "away" ? "@" : "vs"} ${row.opponent.toUpperCase()}` : "No matched game"} &middot; {formatDfsSalary(row.salary)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold text-slate-600">
                      DK {row.position}{formatDfsRank(row.dkPositionSalaryRank)} {!isDst && `→ JKB ${row.position}${formatDfsRank(row.kind === "offense" ? row.jkbSlatePositionRank : null)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {!isDst && <RankDiffCell diff={row.kind === "offense" ? row.posRankDiff : null} />}
                    <span className="text-[10px] font-bold text-slate-500">{isDst ? "No JKB proj" : `Proj ${formatDfsProjection(row.kind === "offense" ? row.projectedFantasyPoints : null)}`}</span>
                  </div>
                </button>
                <IdentityWarning row={row} />
                {expanded && (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    {!isDst && (
                      <p className="mb-1.5 text-[10px] font-semibold text-slate-500">
                        JKB Week RK {formatDfsRank(row.kind === "offense" ? row.jkbWeeklyPositionRank : null)} &middot; JKB Pts/$1K {formatDfsPointsPer1k(row.kind === "offense" ? row.pointsPer1k : null)}
                      </p>
                    )}
                    <ResearchDetail row={row} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
