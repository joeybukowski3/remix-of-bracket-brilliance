import MlbStatComparisonBar from "@/components/mlb/MlbStatComparisonBar";
import { formatMetric } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

export default function MlbStatComparisonRow({
  label,
  leftValue,
  rightValue,
  leagueAverage,
  format,
  scaleKey,
  leftTeam,
  rightTeam,
}: Omit<MlbComparisonMetric, "key"> & { leftTeam?: string; rightTeam?: string }) {
  const leftColor = getMlbTeamColors(leftTeam).primary;
  const rightColor = getMlbTeamColors(rightTeam).primary;
  const leftLabel = formatMetric(leftValue, format);
  const rightLabel = formatMetric(rightValue, format);

  return (
    <div className="rounded-2xl bg-secondary/35 px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        {leagueAverage != null ? (
          <div className="text-[11px] text-muted-foreground">Avg {formatMetric(leagueAverage, format)}</div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[88px_1fr_88px] sm:items-center">
        <div className="text-left text-base font-semibold text-foreground sm:text-sm">
          {leftLabel}
        </div>
        <MlbStatComparisonBar
          leftValue={leftValue}
          rightValue={rightValue}
          leagueAverage={leagueAverage}
          scaleKey={scaleKey}
          leftColor={leftColor}
          rightColor={rightColor}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
        />
        <div className="text-left text-base font-semibold text-foreground sm:text-right sm:text-sm">
          {rightLabel}
        </div>
      </div>
    </div>
  );
}
