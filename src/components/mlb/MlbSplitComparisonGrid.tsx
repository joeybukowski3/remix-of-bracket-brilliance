import MlbStatComparisonRow from "@/components/mlb/MlbStatComparisonRow";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

export default function MlbSplitComparisonGrid({ metrics }: { metrics: MlbComparisonMetric[] }) {
  return (
    <div className="space-y-3">
      {metrics.map((metric) => (
        <MlbStatComparisonRow key={metric.key} {...metric} />
      ))}
    </div>
  );
}
