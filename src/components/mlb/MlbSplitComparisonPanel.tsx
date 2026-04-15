import MlbSplitComparisonGrid from "@/components/mlb/MlbSplitComparisonGrid";
import MlbValuePill from "@/components/mlb/MlbValuePill";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

export default function MlbSplitComparisonPanel({
  context,
  note,
  metrics,
}: {
  context: string;
  note: string;
  metrics: MlbComparisonMetric[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MlbValuePill>{context}</MlbValuePill>
        <span className="text-sm text-muted-foreground">{note}</span>
      </div>
      <MlbSplitComparisonGrid metrics={metrics} />
    </div>
  );
}
