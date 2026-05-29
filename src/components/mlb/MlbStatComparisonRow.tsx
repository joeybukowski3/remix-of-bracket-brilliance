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
  label, value, barPct, avgPct, color, isAway,
}: {
  label: string; value: string; barPct: number; avgPct: number; color: string; isAway?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="w-12 shrink-0 truncate text-right text-[9px] font-bold text-muted-foreground">{label}</span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-amber-400" style={{ left: `${avgPct}%` }} />
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{
            width: `${barPct}%`,
            backgroundColor: color,
            ...(isAway ? { outline: "1px solid rgba(0,0,0,0.12)" } : {}),
          }}
        />
      </div>
      <span className="w-10 shrink-0 text-[10px] font-semibold tabular-nums text-foreground">{value}</span>
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

  // If colors are too similar, use white for the away (left) bar so they're distinguishable
  const leftColor  = colorsTooSimilar(rawLeft, rawRight) ? "#ffffff" : rawLeft;
  const rightColor = rawRight;

  const leftPct  = getBarScalePosition(leftValue, scaleKey);
  const rightPct = getBarScalePosition(rightValue, scaleKey);
  const avgPct   = getLeagueTickPosition(leagueAverage, scaleKey);

  return (
    <div className="space-y-0.5 rounded-md bg-secondary/30 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {leagueAverage != null ? (
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="inline-block h-2 w-0.5 rounded-full bg-amber-400" />
            Avg {formatMetric(leagueAverage, format)}
          </span>
        ) : null}
      </div>
      <CompactBar
        label={leftName ?? leftTeam ?? ""}
        value={formatMetric(leftValue, format)}
        barPct={leftPct}
        avgPct={avgPct}
        color={leftColor}
        isAway={leftColor === "#ffffff"}
      />
      <CompactBar
        label={rightName ?? rightTeam ?? ""}
        value={formatMetric(rightValue, format)}
        barPct={rightPct}
        avgPct={avgPct}
        color={rightColor}
      />
    </div>
  );
}
