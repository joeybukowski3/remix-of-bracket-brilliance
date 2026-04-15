import MlbLineupMiniStat from "@/components/mlb/MlbLineupMiniStat";
import { formatAvgLike, formatPercent } from "@/lib/mlb/mlbFormatters";
import type { MlbLineupRow as MlbLineupRowType } from "@/lib/mlb/mlbTypes";

export default function MlbLineupRow({
  order,
  away,
  home,
}: {
  order: number;
  away: MlbLineupRowType;
  home: MlbLineupRowType;
}) {
  return (
    <div className="rounded-[24px] bg-secondary/25 px-3 py-3">
      <div className="hidden items-center gap-4 lg:grid lg:grid-cols-[1.2fr_56px_1.2fr]">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,64px)] items-center gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{away.name}</div>
          </div>
          <MlbLineupMiniStat label="AVG" value={formatAvgLike(away.avg)} />
          <MlbLineupMiniStat label="OBP" value={formatAvgLike(away.obp)} />
          <MlbLineupMiniStat label="SLG" value={formatAvgLike(away.slg)} />
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-sm font-semibold text-foreground ring-1 ring-border/70">
          {order}
        </div>
        <div className="grid grid-cols-[64px_64px_64px_minmax(0,1fr)] items-center gap-2">
          <MlbLineupMiniStat label="AVG" value={formatAvgLike(home.avg)} />
          <MlbLineupMiniStat label="K%" value={formatPercent(home.kPct)} />
          <MlbLineupMiniStat label="SLG" value={formatAvgLike(home.slg)} />
          <div className="min-w-0 text-right">
            <div className="truncate text-sm font-semibold text-foreground">{home.name}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold text-foreground">#{order}</div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Lineup matchup</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-card/80 p-3">
            <div className="text-sm font-semibold text-foreground">{away.name}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MlbLineupMiniStat label="AVG" value={formatAvgLike(away.avg)} />
              <MlbLineupMiniStat label="OBP" value={formatAvgLike(away.obp)} />
              <MlbLineupMiniStat label="SLG" value={formatAvgLike(away.slg)} />
            </div>
          </div>
          <div className="rounded-2xl bg-card/80 p-3">
            <div className="text-sm font-semibold text-foreground">{home.name}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MlbLineupMiniStat label="AVG" value={formatAvgLike(home.avg)} />
              <MlbLineupMiniStat label="K%" value={formatPercent(home.kPct)} />
              <MlbLineupMiniStat label="SLG" value={formatAvgLike(home.slg)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
