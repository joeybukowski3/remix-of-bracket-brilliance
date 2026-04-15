import MlbLeagueAverageTick from "@/components/mlb/MlbLeagueAverageTick";
import { getBarScalePosition, getLeagueTickPosition, type MlbScaleKey } from "@/lib/mlb/mlbBarScale";

function getTone(value: number | null, average: number | null, scaleKey: MlbScaleKey) {
  if (value == null || average == null) return "bg-slate-300/70";
  // For ERA, WHIP, BB%, HR/9: lower is better — blue when good (below avg), red when bad (above avg)
  const lowerIsBetter = ["era", "whip", "bbPercent", "hr9"].includes(scaleKey);
  const isGood = lowerIsBetter ? value <= average : value >= average;
  return isGood ? "bg-[#378ADD]" : "bg-[#E24B4A]";
}

export default function MlbStatComparisonBar({
  leftValue,
  rightValue,
  leagueAverage,
  scaleKey,
}: {
  leftValue: number | null;
  rightValue: number | null;
  leagueAverage: number | null;
  scaleKey: MlbScaleKey;
}) {
  const leftPosition = getBarScalePosition(leftValue, scaleKey);
  const rightPosition = getBarScalePosition(rightValue, scaleKey);
  const tickPosition = getLeagueTickPosition(leagueAverage, scaleKey);

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-2">
      <div className="relative h-3 overflow-hidden rounded-full bg-secondary/90 ring-1 ring-border/40">
        <MlbLeagueAverageTick position={tickPosition} />
        <span
          className={`absolute inset-y-0 right-0 rounded-full ${getTone(leftValue, leagueAverage, scaleKey)}`}
          style={{ width: `${leftPosition}%` }}
        />
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-secondary/90 ring-1 ring-border/40">
        <MlbLeagueAverageTick position={tickPosition} />
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${getTone(rightValue, leagueAverage, scaleKey)}`}
          style={{ width: `${rightPosition}%` }}
        />
      </div>
    </div>
  );
}
