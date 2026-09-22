import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { kickoffLabel } from "@/pages/NFLSchedule";
import { DenseTableScroller, DENSE_TABLE_ROW, frozenDenseColumn } from "@/components/ui/dense-table";
import { matrixCellStyle, getMatrixRankTier } from "@/lib/nfl/matchupMatrixRankTier";
import type { NflMatrixBoard, NflMatrixCell, NflMatrixMetricId } from "@/lib/nfl/matchupMatrixData";
import type { NflMatrixDisplayMode } from "@/components/nfl/matchups/MatchupMatrixControls";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

type MatrixColumn = {
  id: string;
  /** Metric shown in the away (top) row for this column. */
  topMetricId: NflMatrixMetricId;
  topLabel: string;
  /** Metric shown in the home (bottom) row for this column — deliberately
   *  different from topMetricId for columns 2-9, so offense always lines up
   *  vertically against the opposing defense. */
  bottomMetricId: NflMatrixMetricId;
  bottomLabel: string;
  /** Strong navy divider rendered after this column (between 5 and 6). */
  dividerAfter?: boolean;
};

/**
 * Column 1 is each team's own OVR (no swap). Columns 2-5 pair the away team's
 * offense against the home team's defense; columns 6-9 pair the away team's
 * defense against the home team's offense — the away/home metric ids swap
 * between the two rows so the same physical column always reads as one
 * offense vs. the opposing defense.
 */
const MATRIX_COLUMNS: readonly MatrixColumn[] = [
  { id: "ovr", topMetricId: "ovr", topLabel: "OVR", bottomMetricId: "ovr", bottomLabel: "OVR" },
  { id: "epa-1", topMetricId: "offEpa", topLabel: "Off EPA", bottomMetricId: "defEpa", bottomLabel: "Def EPA" },
  { id: "ypp-1", topMetricId: "offYpp", topLabel: "Off YPP", bottomMetricId: "defYpp", bottomLabel: "Def YPP" },
  { id: "sr-1", topMetricId: "offSr", topLabel: "Off SR", bottomMetricId: "defSr", bottomLabel: "Def SR" },
  { id: "trench-1", topMetricId: "blocking", topLabel: "Blocking", bottomMetricId: "defRush", bottomLabel: "Def Rush", dividerAfter: true },
  { id: "epa-2", topMetricId: "defEpa", topLabel: "Def EPA", bottomMetricId: "offEpa", bottomLabel: "Off EPA" },
  { id: "ypp-2", topMetricId: "defYpp", topLabel: "Def YPP", bottomMetricId: "offYpp", bottomLabel: "Off YPP" },
  { id: "sr-2", topMetricId: "defSr", topLabel: "Def SR", bottomMetricId: "offSr", bottomLabel: "Off SR" },
  { id: "trench-2", topMetricId: "defRush", topLabel: "Def Rush", bottomMetricId: "blocking", bottomLabel: "Blocking" },
] as const;

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
 * there is no separate rank/rating badge.
 */
function MatrixCellView({ cell, label, displayMode }: { cell: NflMatrixCell; label: string; displayMode: NflMatrixDisplayMode }) {
  const isRankings = displayMode === "rankings";
  const style = matrixCellStyle(cell.rank);
  const displayText = isRankings ? (cell.rank == null ? "—" : String(cell.rank)) : cell.formattedValue;

  return (
    <td
      className="min-w-[64px] px-1 py-1.5 text-center align-middle"
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
        boxShadow: style.border.replace("1px solid ", "inset 0 0 0 1px "),
      }}
      data-matrix-rank-tier={getMatrixRankTier(cell.rank)?.id ?? "unknown"}
    >
      <div className="text-[8px] font-bold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-[13px] font-extrabold tabular-nums">{displayText}</div>
    </td>
  );
}

function TeamIdentityCell({
  team,
  record,
  matchupSlug,
  side,
}: {
  team: NflMatchupTeam;
  record: string | null;
  matchupSlug: string;
  side: "away" | "home";
}) {
  return (
    <td className={`${frozenDenseColumn({ surface: "bg-white" })} min-w-[132px] border-r border-slate-200 px-2 py-1.5 text-left`}>
      <Link
        to={`/nfl/matchups/${matchupSlug}`}
        className="flex items-center gap-1.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <img src={nflLogoUrl(team.abbr)} alt="" aria-hidden className="h-6 w-6 shrink-0 object-contain" loading="lazy" />
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-bold leading-4 text-slate-900">
            <span className="mr-1 text-[8px] font-bold uppercase tracking-wider text-slate-400">
              {side === "away" ? "Away" : "Home"}
            </span>
            {team.teamName}
          </span>
          <span className="block text-[9px] font-semibold tabular-nums text-slate-500">
            {record ?? "—"}
          </span>
        </span>
      </Link>
    </td>
  );
}

/**
 * One game as a compact two-row spreadsheet: team identity (sticky on
 * horizontal scroll) plus nine metric columns, with the header labels
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
}: {
  matchup: NflMatchup;
  board: NflMatrixBoard;
  displayMode: NflMatrixDisplayMode;
  awayRecord: string | null;
  homeRecord: string | null;
}) {
  const { away, home } = matchup;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
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
        <table className="w-full border-separate border-spacing-0 text-[11px]">
          <tbody>
            {([
              { team: away, side: "away" as const, useTop: true, record: awayRecord },
              { team: home, side: "home" as const, useTop: false, record: homeRecord },
            ]).map(({ team, side, useTop, record }) => (
              <tr key={team.abbr} className={DENSE_TABLE_ROW}>
                <TeamIdentityCell team={team} record={record} matchupSlug={matchup.slug} side={side} />
                {MATRIX_COLUMNS.map((column) => {
                  const metricId = useTop ? column.topMetricId : column.bottomMetricId;
                  const label = useTop ? column.topLabel : column.bottomLabel;
                  const cell = board.getCell(team.abbr, metricId);
                  return (
                    <MatrixCellView
                      key={column.id}
                      cell={cell}
                      label={label}
                      displayMode={displayMode}
                    />
                  );
                }).reduce<ReactNode[]>((acc, node, index) => {
                  acc.push(node);
                  if (MATRIX_COLUMNS[index].dividerAfter) {
                    acc.push(<td key={`${MATRIX_COLUMNS[index].id}-divider`} className="w-[3px] bg-slate-900 p-0" aria-hidden />);
                  }
                  return acc;
                }, [])}
              </tr>
            ))}
          </tbody>
        </table>
      </DenseTableScroller>
    </div>
  );
}
