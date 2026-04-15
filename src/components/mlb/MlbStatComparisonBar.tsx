import MlbLeagueAverageTick from "@/components/mlb/MlbLeagueAverageTick";
import { getBarScalePosition, getLeagueTickPosition, type MlbScaleKey } from "@/lib/mlb/mlbBarScale";

function getTone(value: number | null, average: number | null) {
  if (value == null || average == null) return "bg-slate-300/70";
  return value >= average ? "bg-[#d46b64]" : "bg-[#5d8fd6]";
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
      <div className="relative h-3 overflow-hidden rounded-full bg-secondary/90">
        <MlbLeagueAverageTick position={tickPosition} />
        <span
          className={`absolute inset-y-0 right-0 rounded-full ${getTone(leftValue, leagueAverage)}`}
          style={{ width: `${leftPosition}%` }}
        />
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-secondary/90">
        <MlbLeagueAverageTick position={tickPosition} />
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${getTone(rightValue, leagueAverage)}`}
          style={{ width: `${rightPosition}%` }}
        />
      </div>
    </div>
  );
}
