import { getBarScalePosition, getLeagueTickPosition } from "@/lib/mlb/mlbBarScale";
import { formatMetric } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

function CompactBar({
  label, value, barPct, avgPct, color,
}: {
  label: string; value: string; barPct: number; avgPct: number; color: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-14 shrink-0 truncate text-right text-[10px] font-bold text-muted-foreground">{label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-amber-400" style={{ left: `${avgPct}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: color }} />
      </div>
      <span className="w-12 shrink-0 text-[10px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default function MlbStatComparisonRow({
  label,
  leftValue,
  rightValue,
  leagueAverage,
  format,
  scaleKey,
  leftTeam,
  rightTeam,
  leftName,
  rightName,
}: Omit<MlbComparisonMetric, "key"> & {
  leftTeam?: string;
  rightTeam?: string;
  leftName?: string;
  rightName?: string;
}) {
  const leftColor = getMlbTeamColors(leftTeam).primary;
  const rightColor = getMlbTeamColors(rightTeam).primary;
  const leftPct = getBarScalePosition(leftValue, scaleKey);
  const rightPct = getBarScalePosition(rightValue, scaleKey);
  const avgPct = getLeagueTickPosition(leagueAverage, scaleKey);

  return (
    <div className="space-y-1 rounded-lg bg-secondary/30 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
        {leagueAverage != null ? (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-2.5 w-0.5 rounded-full bg-amber-400" />
            Avg {formatMetric(leagueAverage, format)}
          </span>
        ) : null}
      </div>
      <CompactBar
        label={leftName ?? leftTeam ?? ""}
        value={formatMetric(leftValue, format)}
        barPct={leftPct}
        avgPct={avgPct}
        color={leftColor}
      />
      <CompactBar
        label={rightName ?? rightTeam ?? ""}
        value={formatMetric(rightValue, format)}
        barPct={rightPct}
        avgPct={avgPct}
        color={rightColor}
      />
    </div>
  );
}
