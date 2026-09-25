import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { kickoffLabel } from "@/pages/NFLSchedule";
import { DenseTableScroller, DENSE_TABLE_ROW, frozenDenseColumn } from "@/components/ui/dense-table";
import { matrixCellStyle, getMatrixRankTier } from "@/lib/nfl/matchupMatrixRankTier";
import type { NflMatrixBoard, NflMatrixCell, NflMatrixMetricId } from "@/lib/nfl/matchupMatrixData";
import type { NflMatrixDisplayMode } from "@/components/nfl/matchups/MatchupMatrixControls";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import { nflTeamColorFor } from "@/lib/nfl/nflTeamColor";
import MatchupSummaryStrip from "@/components/nfl/matchups/MatchupSummaryStrip";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

/** Identity stays frozen and readable while the wider metric grid scrolls inside its card. */
const DIVIDER_COL_WIDTH_PX = 3;
// Table minima: mobile 100 + 3 + 11*72 = 895px; md 148 + 3 + 11*72 = 943px.
/** Share of the team colour blended over white for the identity cell. */
const TEAM_TINT_RATIO = 0.08;

/**
 * Opaque faint tint: team hex blended over white. Opaque (not alpha) so the
 * sticky identity cell fully hides stat cells scrolling underneath it.
 */
function teamTintBackground(hex: string | null): string {
  if (!hex) return "#ffffff";
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16);
  const rgb = [channel(1), channel(3), channel(5)].map((c) =>
    Math.round(255 * (1 - TEAM_TINT_RATIO) + c * TEAM_TINT_RATIO)
  );
  return `rgb(${rgb.join(", ")})`;
}

type MatrixColumn = {
  id: string;
  /** Metric shown in the away (top) row for this column. */
  topMetricId: NflMatrixMetricId;
  topLabel: string;
  /** Metric shown in the home (bottom) row for this column — deliberately
   *  different from topMetricId for columns 2-11, so offense always lines up
   *  vertically against the opposing defense. */
  bottomMetricId: NflMatrixMetricId;
  bottomLabel: string;
  /** Strong navy divider rendered after the final offensive column. */
  dividerAfter?: boolean;
};

/**
 * Column 1 is each team's own OVR (no swap). Columns 2-6 pair the away team's
 * offense against the home team's defense; columns 7-11 pair the away team's
 * defense against the home team's offense — the away/home metric ids swap
 * between the two rows so the same physical column always reads as one
 * offense vs. the opposing defense.
 */
const MATRIX_COLUMNS: readonly MatrixColumn[] = [
  { id: "ovr", topMetricId: "ovr", topLabel: "OVR", bottomMetricId: "ovr", bottomLabel: "OVR" },
  { id: "epa-1", topMetricId: "offEpa", topLabel: "Off EPA", bottomMetricId: "defEpa", bottomLabel: "Def EPA" },
  { id: "ypp-1", topMetricId: "offYpp", topLabel: "Off YPP", bottomMetricId: "defYpp", bottomLabel: "Def YPP" },
  { id: "sr-1", topMetricId: "offSr", topLabel: "Off SR", bottomMetricId: "defSr", bottomLabel: "Def SR" },
  { id: "pass-trench-1", topMetricId: "passBlock", topLabel: "Pass Block", bottomMetricId: "passRush", bottomLabel: "Pass Rush" },
  { id: "run-trench-1", topMetricId: "runBlock", topLabel: "Run Block", bottomMetricId: "runStop", bottomLabel: "Run Stop", dividerAfter: true },
  { id: "epa-2", topMetricId: "defEpa", topLabel: "Def EPA", bottomMetricId: "offEpa", bottomLabel: "Off EPA" },
  { id: "ypp-2", topMetricId: "defYpp", topLabel: "Def YPP", bottomMetricId: "offYpp", bottomLabel: "Off YPP" },
  { id: "sr-2", topMetricId: "defSr", topLabel: "Def SR", bottomMetricId: "offSr", bottomLabel: "Off SR" },
  { id: "pass-trench-2", topMetricId: "passRush", topLabel: "Pass Rush", bottomMetricId: "passBlock", bottomLabel: "Pass Block" },
  { id: "run-trench-2", topMetricId: "runStop", topLabel: "Run Stop", bottomMetricId: "runBlock", bottomLabel: "Run Block" },
] as const;

/**
 * Compact label-only header cell for a stat column. Rendered in its own row
 * above the value row so the heatmap value cell never carries embedded text —
 * see MatchupMatrixRow for why the away/home stat order swaps per column.
 */
function MatrixHeaderCell({ label, separatorClass = "" }: { label: string; separatorClass?: string }) {
  return (
    <td
      data-matrix-header-cell
      className={`h-6 overflow-hidden border-b border-slate-300 bg-slate-200 px-0.5 text-center align-middle ${separatorClass}`}
    >
      <span className="block truncate text-[10px] font-extrabold uppercase leading-none tracking-normal text-slate-700">
        {label}
      </span>
    </td>
  );
}

/**
 * Heatmap color is ALWAYS derived from the cell's league rank, never from the
 * displayed number — so the same team/metric/window gets the same tier in
 * both Rankings and Values mode, and only the displayed number changes. Tier
 * styling is the exact canonical JKB tier style (matchupMatrixRankTier.ts),
 * applied inline so it can't drift from the K Props / percentile-scale hex
 * and rgba values.
 *
 * Each cell shows exactly ONE number: the rank in Rankings mode, or the raw
 * underlying value in Values mode. The full cell background is the heatmap —
 * there is no separate rank/rating badge, and no embedded stat label; the
 * label lives in the paired MatrixHeaderCell row above.
 */
function MatrixValueCell({ cell, displayMode }: { cell: NflMatrixCell; displayMode: NflMatrixDisplayMode }) {
  const isRankings = displayMode === "rankings";
  const style = matrixCellStyle(cell.rank);
  const displayText = isRankings ? (cell.rank == null ? "—" : String(cell.rank)) : cell.formattedValue;

  return (
    <td
      className="overflow-hidden px-0.5 py-1 text-center align-middle"
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
        boxShadow: style.border.replace("1px solid ", "inset 0 0 0 1px "),
      }}
      data-matrix-rank-tier={getMatrixRankTier(cell.rank)?.id ?? "unknown"}
    >
      <span className="text-[13px] font-extrabold tabular-nums">{displayText}</span>
    </td>
  );
}

/** Interleaves a strong navy divider cell after any column flagged `dividerAfter`. */
function withDividers(
  columns: readonly MatrixColumn[],
  renderCell: (column: MatrixColumn) => ReactNode,
  renderDivider?: (column: MatrixColumn) => ReactNode
): ReactNode[] {
  return columns.reduce<ReactNode[]>((acc, column) => {
    acc.push(renderCell(column));
    if (column.dividerAfter) {
      acc.push(renderDivider ? renderDivider(column) : (<td key={`${column.id}-divider`} data-matrix-divider className="bg-slate-900 p-0" aria-hidden />));
    }
    return acc;
  }, []);
}

function TeamIdentityCell({
  team,
  record,
  matchupSlug,
  side,
  rowSpan,
  separatorClass = "",
}: {
  team: NflMatchupTeam;
  record: string | null;
  matchupSlug: string;
  side: "away" | "home";
  rowSpan: number;
  separatorClass?: string;
}) {
  return (
    <td
      rowSpan={rowSpan}
      data-matrix-team-cell={side}
      style={{ backgroundColor: teamTintBackground(nflTeamColorFor(team)) }}
      className={`${frozenDenseColumn()} overflow-hidden border-r border-slate-300 px-2 py-1.5 text-left align-middle ${separatorClass}`}
    >
      <Link
        to={`/nfl/matchups/${matchupSlug}`}
        className="flex items-center gap-1.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <img src={nflLogoUrl(team.abbr)} alt="" aria-hidden className="h-6 w-6 shrink-0 object-contain" loading="lazy" />
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-bold leading-4 text-slate-900">
            <span className="hidden md:inline">{team.teamName}</span>
            <span className="uppercase md:hidden">{team.abbr}</span>
          </span>
          <span className="block text-[9px] font-semibold tabular-nums text-slate-500">
            <span className="mr-1 text-[8px] font-bold uppercase tracking-wider text-slate-400">
              {side === "away" ? "Away" : "Home"}
            </span>
            {record ?? "—"}
          </span>
        </span>
      </Link>
    </td>
  );
}

/**
 * One game as a compact two-row spreadsheet: team identity (sticky on
 * horizontal scroll) plus eleven metric columns, with the header labels
 * swapping between the away and home rows so offense always lines up
 * against the opposing defense (see MATRIX_COLUMNS).
 *
 * Only the team-identity area is a navigation target — statistic cells never
 * behave like links, per the approved design.
 */
export default function MatchupMatrixRow({
  matchup,
  board,
  displayMode,
  awayRecord,
  homeRecord,
  market = null,
  projection = null,
  totalProjection = null,
}: {
  matchup: NflMatchup;
  board: NflMatrixBoard;
  displayMode: NflMatrixDisplayMode;
  awayRecord: string | null;
  homeRecord: string | null;
  /** Current market, JKB spread and JKB total for THIS game (looked up by gameId by the caller). */
  market?: MarketCurrentGame | null;
  projection?: GameProjection | null;
  totalProjection?: TeamTotalProjection | null;
}) {
  const { away, home } = matchup;

  return (
    <div
      data-matrix-game
      className="overflow-hidden rounded-lg border-2 border-slate-700 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b-2 border-slate-300 bg-slate-100 px-2.5 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
          {kickoffLabel(matchup.kickoffUtc)}
        </span>
        <Link
          to={`/nfl/matchups/${matchup.slug}`}
          aria-label={`${away.teamName} at ${home.teamName} — view matchup breakdown`}
          className="text-[10px] font-bold text-emerald-700 hover:underline"
        >
          Matchup →
        </Link>
      </div>

      <DenseTableScroller label={`${away.teamName} at ${home.teamName} matchup matrix`}>
        <table
          className="w-full min-w-[895px] table-fixed border-separate border-spacing-0 text-[11px] md:min-w-[943px]"
        >
          <colgroup>
            <col data-matrix-col="identity" className="w-[100px] md:w-[148px]" />
            {withDividers(MATRIX_COLUMNS, (column) => (
              <col key={column.id} data-matrix-col="metric" />
            ), (column) => (
              <col key={`${column.id}-divider`} data-matrix-col="divider" style={{ width: DIVIDER_COL_WIDTH_PX }} />
            ))}
          </colgroup>
          <tbody>
            {([
              { team: away, side: "away" as const, useTop: true, record: awayRecord, separatorClass: "" },
              { team: home, side: "home" as const, useTop: false, record: homeRecord, separatorClass: "border-t-2 border-t-slate-400" },
            ]).map(({ team, side, useTop, record, separatorClass }) => (
              <Fragment key={team.abbr}>
                <tr className={DENSE_TABLE_ROW}>
                  <TeamIdentityCell
                    team={team}
                    record={record}
                    matchupSlug={matchup.slug}
                    side={side}
                    rowSpan={2}
                    separatorClass={separatorClass}
                  />
                  {withDividers(MATRIX_COLUMNS, (column) => (
                    <MatrixHeaderCell
                      key={column.id}
                      label={useTop ? column.topLabel : column.bottomLabel}
                      separatorClass={separatorClass}
                    />
                  ))}
                </tr>
                <tr>
                  {withDividers(MATRIX_COLUMNS, (column) => {
                    const metricId = useTop ? column.topMetricId : column.bottomMetricId;
                    const cell = board.getCell(team.abbr, metricId);
                    return <MatrixValueCell key={column.id} cell={cell} displayMode={displayMode} />;
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </DenseTableScroller>

      <MatchupSummaryStrip market={market} projection={projection} totalProjection={totalProjection} />
    </div>
  );
}
