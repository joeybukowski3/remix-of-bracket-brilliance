import MlbLineupMiniStat from "@/components/mlb/MlbLineupMiniStat";
import MlbPlayerHeadshot from "@/components/mlb/MlbPlayerHeadshot";
import { formatAvgLike, formatPercent } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbLineupRow as MlbLineupRowType } from "@/lib/mlb/mlbTypes";

export default function MlbLineupRow({
  order,
  away,
  home,
  awayTeamAbbreviation,
  homeTeamAbbreviation,
}: {
  order: number;
  away: MlbLineupRowType;
  home: MlbLineupRowType;
  awayTeamAbbreviation: string;
  homeTeamAbbreviation: string;
}) {
  const awayColors = getMlbTeamColors(awayTeamAbbreviation);
  const homeColors = getMlbTeamColors(homeTeamAbbreviation);

  return (
    <div className="rounded-lg bg-secondary/20 px-2 py-1.5">
      <div className="hidden items-center gap-3 lg:grid lg:grid-cols-[1.2fr_36px_1.2fr]">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,44px)] items-center gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <MlbPlayerHeadshot playerId={away.id} name={away.name} size={26} teamAbbreviation={awayTeamAbbreviation} />
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold" style={{ color: awayColors.primary }}>{away.name}</div>
            </div>
          </div>
          <MlbLineupMiniStat label="AVG" value={formatAvgLike(away.avg)} />
          <MlbLineupMiniStat label="OBP" value={formatAvgLike(away.obp)} />
          <MlbLineupMiniStat label="SLG" value={formatAvgLike(away.slg)} />
        </div>
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-card text-[10px] font-bold text-foreground ring-1 ring-border/70">
          {order}
        </div>
        <div className="grid grid-cols-[44px_44px_44px_minmax(0,1fr)] items-center gap-1">
          <MlbLineupMiniStat label="AVG" value={formatAvgLike(home.avg)} />
          <MlbLineupMiniStat label="K%" value={formatPercent(home.kPct)} />
          <MlbLineupMiniStat label="SLG" value={formatAvgLike(home.slg)} />
          <div className="flex min-w-0 items-center justify-end gap-1.5 text-right">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold" style={{ color: homeColors.primary }}>{home.name}</div>
            </div>
            <MlbPlayerHeadshot playerId={home.id} name={home.name} size={26} teamAbbreviation={homeTeamAbbreviation} />
          </div>
        </div>
      </div>

      <div className="space-y-1.5 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs font-bold text-foreground">#{order}</div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Lineup matchup</div>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <div className="rounded-xl bg-card/80 p-2">
            <div className="flex items-center gap-1.5">
              <MlbPlayerHeadshot playerId={away.id} name={away.name} size={24} teamAbbreviation={awayTeamAbbreviation} />
              <div className="text-xs font-semibold" style={{ color: awayColors.primary }}>{away.name}</div>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <MlbLineupMiniStat label="AVG" value={formatAvgLike(away.avg)} />
              <MlbLineupMiniStat label="OBP" value={formatAvgLike(away.obp)} />
              <MlbLineupMiniStat label="SLG" value={formatAvgLike(away.slg)} />
            </div>
          </div>
          <div className="rounded-xl bg-card/80 p-2">
            <div className="flex items-center gap-1.5">
              <MlbPlayerHeadshot playerId={home.id} name={home.name} size={24} teamAbbreviation={homeTeamAbbreviation} />
              <div className="text-xs font-semibold" style={{ color: homeColors.primary }}>{home.name}</div>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1">
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
