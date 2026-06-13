import MlbLeagueAverageTick from "@/components/mlb/MlbLeagueAverageTick";
import { getBarScalePosition, getLeagueTickPosition, type MlbScaleKey } from "@/lib/mlb/mlbBarScale";

function isLowerBetter(scaleKey: MlbScaleKey) {
  return ["era", "whip", "bbPercent", "hr9"].includes(scaleKey);
}

function hasGlow(value: number | null, average: number | null, scaleKey: MlbScaleKey) {
  if (value == null || average == null || average === 0) return false;
  const favorableDelta = isLowerBetter(scaleKey) ? average - value : value - average;
  return favorableDelta / Math.abs(average) >= 0.15;
}

export default function MlbStatComparisonBar({
  leftValue,
  rightValue,
  leagueAverage,
  scaleKey,
  leftColor,
  rightColor,
  leftLabel,
  rightLabel,
}: {
  leftValue: number | null;
  rightValue: number | null;
  leagueAverage: number | null;
  scaleKey: MlbScaleKey;
  leftColor: string;
  rightColor: string;
  leftLabel: string;
  rightLabel: string;
}) {
  const leftPosition = getBarScalePosition(leftValue, scaleKey);
  const rightPosition = getBarScalePosition(rightValue, scaleKey);
  const tickPosition = getLeagueTickPosition(leagueAverage, scaleKey);
  const leftGlow = hasGlow(leftValue, leagueAverage, scaleKey);
  const rightGlow = hasGlow(rightValue, leagueAverage, scaleKey);

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-2">
      <div className="relative h-5 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200/80">
        <MlbLeagueAverageTick position={tickPosition} />
        <span
          className="absolute inset-y-0 right-0 rounded-md transition-all"
          style={{
            width: `${leftPosition}%`,
            backgroundColor: leftColor,
            boxShadow: leftGlow ? `0 0 12px ${leftColor}80` : undefined,
          }}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white drop-shadow-sm">
          {leftLabel}
        </span>
      </div>
      <div className="relative h-5 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200/80">
        <MlbLeagueAverageTick position={tickPosition} />
        <span
          className="absolute inset-y-0 left-0 rounded-md transition-all"
          style={{
            width: `${rightPosition}%`,
            backgroundColor: rightColor,
            boxShadow: rightGlow ? `0 0 12px ${rightColor}80` : undefined,
          }}
        />
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white drop-shadow-sm">
          {rightLabel}
        </span>
      </div>
    </div>
  );
}
