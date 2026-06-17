import { getBarScalePosition, getLeagueTickPosition } from "@/lib/mlb/mlbBarScale";
import { formatMetric } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

/** Returns true if two hex colors are perceptually too similar to distinguish */
function colorsTooSimilar(c1: string, c2: string): boolean {
  const parse = (h: string) => {
    const s = h.replace("#", "");
    return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
  };
  try {
    const [r1,g1,b1] = parse(c1);
    const [r2,g2,b2] = parse(c2);
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2) < 80;
  } catch { return false; }
}

function CompactBar({
  label, value, barPct, avgPct, color, percentile,
}: {
  label: string; value: string; barPct: number; avgPct: number; color: string;
  percentile?: number | null;
}) {
  // Color the bar by percentile tier when we have real percentile data
  const barColor = percentile != null
    ? percentile >= 70 ? "#16a34a"   // green — elite
    : percentile >= 45 ? color        // team color — average
    : "#ef4444"                       // red — poor
    : color;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="w-12 shrink-0 truncate text-right text-[10px] font-bold text-foreground/70">{label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200/80">
        <span className="pointer-events-none absolute inset-y-0 z-20 w-[2px] bg-amber-400 opacity-90" style={{ left: `${avgPct}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-md transition-all" style={{ width: `${barPct}%`, backgroundColor: barColor }} />
        {/* Percentile label inside bar when available */}
        {percentile != null && barPct > 18 && (
          <span className="absolute inset-y-0 left-1.5 flex items-center text-[9px] font-black text-white/90 z-10 leading-none">
            {percentile}th
          </span>
        )}
      </div>
      <span className="w-10 shrink-0 text-[10.5px] font-bold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default function MlbStatComparisonRow({
  label,
  leftValue,
  rightValue,
  leagueAverage,
  format,
  scaleKey,
  leftPct,
  rightPct,
  leftTeam,
  rightTeam,
  leftName,
  rightName,
}: Omit<MlbComparisonMetric, "key"> & {
  leftTeam?: string;
  rightTeam?: string;
  leftName?: string;
  rightName?: string;
}) {
  const rawLeft  = getMlbTeamColors(leftTeam).primary;
  const rawRight = getMlbTeamColors(rightTeam).primary;
  const leftColor  = colorsTooSimilar(rawLeft, rawRight) ? "#374151" : rawLeft;
  const rightColor = rawRight;

  // Use true percentile for bar width when available, else fall back to scale position
  const leftBarPct  = leftPct  != null ? leftPct  : getBarScalePosition(leftValue,  scaleKey);
  const rightBarPct = rightPct != null ? rightPct : getBarScalePosition(rightValue, scaleKey);

  // League average tick: when using percentiles, 50th pct = 50%
  const avgPct = leftPct != null || rightPct != null
    ? 50
    : getLeagueTickPosition(leagueAverage, scaleKey);

  return (
    <div className="space-y-1 rounded-lg border border-border/40 bg-secondary/20 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-foreground/70">{label}</span>
        {leagueAverage != null && leftPct == null ? (
          <span className="flex items-center gap-1 text-[9px] font-semibold text-amber-600">
            <span className="inline-block h-2 w-[2px] rounded-full bg-amber-400" />
            Avg {formatMetric(leagueAverage, format)}
          </span>
        ) : leftPct != null ? (
          <span className="flex items-center gap-1 text-[9px] font-semibold text-amber-600">
            <span className="inline-block h-2 w-[2px] rounded-full bg-amber-400" />
            50th pct
          </span>
        ) : null}
      </div>
      <CompactBar
        label={leftName ?? leftTeam ?? ""}
        value={formatMetric(leftValue, format)}
        barPct={leftBarPct}
        avgPct={avgPct}
        color={leftColor}
        percentile={leftPct}
      />
      <CompactBar
        label={rightName ?? rightTeam ?? ""}
        value={formatMetric(rightValue, format)}
        barPct={rightBarPct}
        avgPct={avgPct}
        color={rightColor}
        percentile={rightPct}
      />
    </div>
  );
}
