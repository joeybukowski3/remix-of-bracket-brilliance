import MlbStatComparisonBar from "@/components/mlb/MlbStatComparisonBar";
import { getBarScalePosition } from "@/lib/mlb/mlbBarScale";
import { getStatToneClasses, getStatToneFromPercentile } from "@/lib/mlb/mlbDisplayHelpers";
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
  const leftLabel = formatMetric(leftValue, format);
  const rightLabel = formatMetric(rightValue, format);
  const leftTone = getStatToneClasses(getStatToneFromPercentile(getPositivePercentile(leftValue, scaleKey)));
  const rightTone = getStatToneClasses(getStatToneFromPercentile(getPositivePercentile(rightValue, scaleKey)));

  return (
    <div className="rounded-2xl bg-secondary/35 px-3 py-2 sm:px-3.5">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        {leagueAverage != null ? (
          <div className="text-[11px] text-muted-foreground">Avg {formatMetric(leagueAverage, format)}</div>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-[80px_1fr_80px] sm:items-center">
        <div className={`rounded-full border px-2 py-0.5 text-left text-sm font-semibold sm:text-center sm:text-sm ${leftTone}`}>
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
        <div className={`rounded-full border px-2 py-0.5 text-left text-sm font-semibold sm:text-center sm:text-sm ${rightTone}`}>
          {rightLabel}
        </div>
      </div>
    </div>
  );
}
