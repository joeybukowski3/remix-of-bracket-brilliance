import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { kickoffLabel } from "@/pages/NFLSchedule";
import { DenseTableScroller, DENSE_TABLE_ROW, frozenDenseColumn } from "@/components/ui/dense-table";
import { rankBadgeClass, rankCellClass } from "@/lib/nfl/rankTier";
import { formatMatrixRating } from "@/lib/nfl/matchupMatrixRatings";
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
 * both Rankings and Ratings mode, and only the text changes. This is the one
 * place that rule is enforced; see rankTier.ts for the canonical 8-bucket
 * scale itself.
 */
function MatrixCellView({ cell, label, displayMode, isOvr }: { cell: NflMatrixCell; label: string; displayMode: NflMatrixDisplayMode; isOvr: boolean }) {
  const isRankings = displayMode === "rankings";
  const badgeClass = rankBadgeClass(cell.rank);
  const washClass = rankCellClass(cell.rank);
  const badgeText = isRankings
    ? (cell.rank == null ? "—" : String(cell.rank))
    // OVR has no league-relative +/- — Ratings mode still shows the native
    // JKB rating (the same number `formattedValue` already carries), never a
    // computed delta.
    : isOvr
      ? cell.formattedValue
      : formatMatrixRating(cell.rating);

  return (
    <td className={`min-w-[64px] px-1 py-1 text-center align-middle ${washClass}`}>
      <div className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-[11px] font-bold tabular-nums text-slate-800">{cell.formattedValue}</div>
      <div
        className={`mx-auto mt-0.5 inline-flex min-w-[26px] items-center justify-center rounded border px-1 text-[9px] font-bold tabular-nums ${badgeClass}`}
      >
        {badgeText}
      </div>
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
                      isOvr={metricId === "ovr"}
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
