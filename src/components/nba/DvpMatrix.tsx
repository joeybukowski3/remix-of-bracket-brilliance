import { useMemo } from "react";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, frozenDenseColumn } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { viewLabel } from "./dvpViews";
import { CANONICAL_TEAM_CODES } from "@/lib/nba/props/canonical";
import { DVP_POSITIONS, dvpMatrixColumn, tierForRank, type DvpMatrixCell, type DvpPosition, type DvpRow, type DvpStat, type DvpView } from "@/lib/nba/props/dvp";


const RANK_CLASS = { favorable: "bg-emerald-100 text-emerald-900", neutral: "", tough: "bg-rose-100 text-rose-900" } as const;

interface DvpMatrixProps {
  rows: readonly DvpRow[];
  view: DvpView;
  stat: DvpStat;
  /** Null shows every position side by side. */
  position: DvpPosition | null;
  sourceLabel: string | null;
}

function Cell({ cell, view }: { cell: DvpMatrixCell | undefined; view: DvpView }) {
  if (!cell || cell.allowedPerGame === null) return <td className="px-3 py-1.5 text-right text-slate-400">N/A</td>;
  const tier = tierForRank(cell.rank);
  const title =
    view === "blended"
      ? `${Math.round((cell.currentWeight ?? 0) * 100)}% from this season (${cell.gamesSampled ?? 0} games)`
      : `${cell.gamesSampled ?? 0} games sampled`;
  return (
    <td className={cn("px-3 py-1.5 text-right tabular-nums", tier ? RANK_CLASS[tier] : "")} title={title}>
      {cell.allowedPerGame.toFixed(1)}
      <span className="ml-1 text-[10px] opacity-70">{cell.rank === null ? "#–" : `#${cell.rank}`}</span>
    </td>
  );
}

export default function DvpMatrix({ rows, view, stat, position, sourceLabel }: DvpMatrixProps) {
  const positions = useMemo<readonly DvpPosition[]>(() => (position ? [position] : DVP_POSITIONS), [position]);
  const columns = useMemo(() => new Map(positions.map((p) => [p, new Map(dvpMatrixColumn(rows, view, p, stat).map((c) => [c.team, c]))])), [rows, view, stat, positions]);
  // Row order follows the first shown position: easiest matchup first, teams without data last.
  const order = useMemo(() => dvpMatrixColumn(rows, view, positions[0], stat).map((c) => c.team), [rows, view, stat, positions]);
  const hasData = rows.length > 0;
  return (
    <div>
      {!hasData ? (
        <p className="mb-2 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          No Defense vs. Position data is loaded. Every cell reads N/A until a box-score source with a position split and a permitting license is connected.
        </p>
      ) : null}
      <DenseTableScroller label={`${viewLabel(view)} ${stat} allowed per game by team and position`} className="rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[420px] border-separate border-spacing-0 text-[11px] sm:text-[12px]">
          <caption className="sr-only">
            {stat} allowed per game to each position, {viewLabel(view)} view. Rank 1 allows the most.
          </caption>
          <thead>
            <tr className={DENSE_TABLE_HEAD_ROW}>
              <th scope="col" className={frozenDenseColumn({ isHeader: true, surface: "bg-slate-100", className: "border-b border-r border-slate-200 px-3 py-2 text-left" })}>
                Defense
              </th>
              {positions.map((p) => (
                <th key={p} scope="col" className="border-b border-slate-200 px-3 py-2 text-right">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((team) => (
              <tr key={team} className={DENSE_TABLE_ROW}>
                <th scope="row" className={frozenDenseColumn({ surface: "bg-white", className: "border-r border-slate-100 px-3 py-1.5 text-left font-medium text-slate-900" })}>
                  {team}
                </th>
                {positions.map((p) => (
                  <Cell key={p} cell={columns.get(p)?.get(team)} view={view} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </DenseTableScroller>
      <p className="mt-2 text-[11px] text-slate-500">
        {stat} allowed per game to the position. Rank 1 allows the most (easiest matchup); green is ranks 1–10, red is 21–30. Multi-position players are split by weight.
        {sourceLabel ? ` Source: ${sourceLabel}.` : ""} {CANONICAL_TEAM_CODES.length} teams.
      </p>
    </div>
  );
}

