import { getRankColor } from "@/lib/pga/rankColors";
import { getPlayerModelStatRank } from "@/lib/pga/tournamentUi";
import type { PlayerModelRow } from "@/lib/pga/pgaTypes";
import type { PgaModelStatColumn } from "@/lib/pga/tournamentConfig";

export default function PgaLeaderboardPreviewTable({
  rows,
  statColumns,
  totalRankCount,
}: {
  rows: PlayerModelRow[];
  statColumns: PgaModelStatColumn[];
  totalRankCount: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[color:var(--pga-border)] text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="px-4 py-3">Rank</th>
            <th className="px-4 py-3">Player</th>
            <th className="px-4 py-3">Score</th>
            {statColumns.map((stat) => (
              <th key={stat.key} className="px-4 py-3">{stat.abbr}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[color:var(--pga-border)] first:border-t-0">
              <td className="px-4 py-3 font-semibold text-foreground">#{row.rank}</td>
              <td className="px-4 py-3 font-medium text-foreground">{row.player}</td>
              <td className="px-4 py-3 text-muted-foreground">{row.score.toFixed(2)}</td>
              {statColumns.map((stat) => {
                const rank = getPlayerModelStatRank(row, stat.key);
                const tone = getRankColor(rank, totalRankCount);
                return (
                  <td key={`${row.id}-${stat.key}`} className="px-4 py-3">
                    <span
                      className="inline-flex min-w-[38px] items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold"
                      style={{ background: tone.bg, color: tone.text }}
                    >
                      {rank == null ? "-" : `#${rank}`}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
