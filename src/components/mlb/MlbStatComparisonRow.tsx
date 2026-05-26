import MlbStatComparisonBar from "@/components/mlb/MlbStatComparisonBar";
import { getBarScalePosition } from "@/lib/mlb/mlbBarScale";
import { getStatToneFromPercentile } from "@/lib/mlb/mlbDisplayHelpers";
import { formatMetric } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

function getPositivePercentile(value: number | null, scaleKey: MlbComparisonMetric["scaleKey"]) {
  if (value == null) return null;
  const raw = getBarScalePosition(value, scaleKey);
  const lowerIsBetter = scaleKey === "era" || scaleKey === "bbPercent" || scaleKey === "hr9";
  return lowerIsBetter ? 100 - raw : raw;
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
}: Omit<MlbComparisonMetric, "key"> & { leftTeam?: string; rightTeam?: string }) {
  const leftColor = getMlbTeamColors(leftTeam).primary;
  const rightColor = getMlbTeamColors(rightTeam).primary;
  const leftFormatted = formatMetric(leftValue, format);
  const rightFormatted = formatMetric(rightValue, format);

  // Label inside bar shows team abbr + value for scroll context
  const leftBarLabel = leftTeam ? `${leftTeam} ${leftFormatted}` : leftFormatted;
  const rightBarLabel = rightTeam ? `${rightTeam} ${rightFormatted}` : rightFormatted;

  return (
    <div className="space-y-1 rounded-lg bg-secondary/30 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        {leagueAverage != null ? (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-2.5 w-0.5 rounded-full bg-amber-400" />
            Avg {formatMetric(leagueAverage, format)}
          </div>
        ) : null}
      </div>
      <MlbStatComparisonBar
        leftValue={leftValue}
        rightValue={rightValue}
        leagueAverage={leagueAverage}
        scaleKey={scaleKey}
        leftColor={leftColor}
        rightColor={rightColor}
        leftLabel={leftBarLabel}
        rightLabel={rightBarLabel}
      />
    </div>
  );
}
