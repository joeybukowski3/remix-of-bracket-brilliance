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
    <div className="rounded-2xl bg-secondary/25 px-2.5 py-2">
      <div className="hidden items-center gap-3 lg:grid lg:grid-cols-[1.2fr_48px_1.2fr]">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,56px)] items-center gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <MlbPlayerHeadshot playerId={away.id} name={away.name} size={34} teamAbbreviation={awayTeamAbbreviation} />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold" style={{ color: awayColors.primary }}>{away.name}</div>
            </div>
          </div>
          <MlbLineupMiniStat label="AVG" value={formatAvgLike(away.avg)} />
          <MlbLineupMiniStat label="OBP" value={formatAvgLike(away.obp)} />
          <MlbLineupMiniStat label="SLG" value={formatAvgLike(away.slg)} />
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground ring-1 ring-border/70">
          {order}
        </div>
        <div className="grid grid-cols-[56px_56px_56px_minmax(0,1fr)] items-center gap-1.5">
          <MlbLineupMiniStat label="AVG" value={formatAvgLike(home.avg)} />
          <MlbLineupMiniStat label="K%" value={formatPercent(home.kPct)} />
          <MlbLineupMiniStat label="SLG" value={formatAvgLike(home.slg)} />
          <div className="flex min-w-0 items-center justify-end gap-2 text-right">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold" style={{ color: homeColors.primary }}>{home.name}</div>
            </div>
            <MlbPlayerHeadshot playerId={home.id} name={home.name} size={34} teamAbbreviation={homeTeamAbbreviation} />
          </div>
        </div>
      </div>

      <div className="space-y-2 lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold text-foreground">#{order}</div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Lineup matchup</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl bg-card/80 p-2">
            <div className="flex items-center gap-2">
              <MlbPlayerHeadshot playerId={away.id} name={away.name} size={30} teamAbbreviation={awayTeamAbbreviation} />
              <div className="text-sm font-semibold" style={{ color: awayColors.primary }}>{away.name}</div>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <MlbLineupMiniStat label="AVG" value={formatAvgLike(away.avg)} />
              <MlbLineupMiniStat label="OBP" value={formatAvgLike(away.obp)} />
              <MlbLineupMiniStat label="SLG" value={formatAvgLike(away.slg)} />
            </div>
          </div>
          <div className="rounded-2xl bg-card/80 p-2">
            <div className="flex items-center gap-2">
              <MlbPlayerHeadshot playerId={home.id} name={home.name} size={30} teamAbbreviation={homeTeamAbbreviation} />
              <div className="text-sm font-semibold" style={{ color: homeColors.primary }}>{home.name}</div>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
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
