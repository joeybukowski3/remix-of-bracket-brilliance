import MlbStatComparisonBar from "@/components/mlb/MlbStatComparisonBar";
import { formatMetric } from "@/lib/mlb/mlbFormatters";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

export default function MlbStatComparisonRow({
  label,
  leftValue,
  rightValue,
  leagueAverage,
  format,
  scaleKey,
}: Omit<MlbComparisonMetric, "key">) {
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
          {formatMetric(leftValue, format)}
        </div>
        <MlbStatComparisonBar
          leftValue={leftValue}
          rightValue={rightValue}
          leagueAverage={leagueAverage}
          scaleKey={scaleKey}
        />
        <div className="text-left text-base font-semibold text-foreground sm:text-right sm:text-sm">
          {formatMetric(rightValue, format)}
        </div>
      </div>
    </div>
  );
}
