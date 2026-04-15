import MlbLineupRow from "@/components/mlb/MlbLineupRow";
import type { MlbLineupRow as MlbLineupRowType } from "@/lib/mlb/mlbTypes";

export default function MlbProjectedLineupPanel({
  away,
  home,
}: {
  away: MlbLineupRowType[];
  home: MlbLineupRowType[];
}) {
  const rows = Array.from({ length: 9 }, (_, index) => ({
    order: index + 1,
    away: away[index] ?? { name: "—", avg: null, obp: null, slg: null, ops: null, kPct: null, hr: null },
    home: home[index] ?? { name: "—", avg: null, obp: null, slg: null, ops: null, kPct: null, hr: null },
  }));

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-[1.2fr_56px_1.2fr] items-center gap-4 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:grid">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,64px)] items-center gap-2">
          <span>Player</span>
          <span className="text-center">AVG</span>
          <span className="text-center">OBP</span>
          <span className="text-center">SLG</span>
        </div>
        <div className="text-center">Order</div>
        <div className="grid grid-cols-[64px_64px_64px_minmax(0,1fr)] items-center gap-2 text-right">
          <span className="text-center">AVG</span>
          <span className="text-center">K%</span>
          <span className="text-center">SLG</span>
          <span>Player</span>
        </div>
      </div>
      {rows.map((row) => (
        <MlbLineupRow key={row.order} order={row.order} away={row.away} home={row.home} />
      ))}
    </div>
  );
}
