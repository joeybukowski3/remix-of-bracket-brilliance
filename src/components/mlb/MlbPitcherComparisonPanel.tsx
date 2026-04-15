import MlbPitcherProfileCard from "@/components/mlb/MlbPitcherProfileCard";
import MlbStatComparisonRow from "@/components/mlb/MlbStatComparisonRow";
import type { MlbComparisonMetric, MlbStarterProfile } from "@/lib/mlb/mlbTypes";

export default function MlbPitcherComparisonPanel({
  awayPitcher,
  homePitcher,
  metrics,
}: {
  awayPitcher: MlbStarterProfile;
  homePitcher: MlbStarterProfile;
  metrics: MlbComparisonMetric[];
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <MlbPitcherProfileCard label="Away starter" pitcher={awayPitcher} />
        <MlbPitcherProfileCard label="Home starter" pitcher={homePitcher} align="right" />
      </div>
      <div className="space-y-3">
        {metrics.map((metric) => (
          <MlbStatComparisonRow key={metric.key} {...metric} />
        ))}
      </div>
    </div>
  );
}
