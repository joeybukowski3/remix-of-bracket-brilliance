import { getBarScalePosition, getLeagueTickPosition } from "@/lib/mlb/mlbBarScale";
import { formatMetric } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

function colorsTooSimilar(c1: string, c2: string): boolean {
  const parse = (h: string) => { const s = h.replace("#",""); return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]; };
  try { const [r1,g1,b1]=parse(c1); const [r2,g2,b2]=parse(c2); return Math.sqrt((r1-r2)**2+(g1-g2)**2+(b1-b2)**2)<80; } catch { return false; }
}

function CompactBar({ label, value, barPct, avgPct, color }: { label: string; value: string; barPct: number; avgPct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-10 shrink-0 truncate text-right text-[10px] font-bold text-foreground/70">{label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200/80">
        <span className="pointer-events-none absolute inset-y-0 z-20 w-[2px] bg-amber-400 opacity-90" style={{ left: `${avgPct}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-md transition-all" style={{ width: `${barPct}%`, backgroundColor: color }} />
      </div>
      <span className="w-13 shrink-0 text-[10.5px] font-bold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default function MlbSplitComparisonPanel({ awayMetrics, homeMetrics, awayAbbreviation, homeAbbreviation }: {
  context?: string; note?: string; metrics?: MlbComparisonMetric[];
  awayMetrics: MlbComparisonMetric[]; homeMetrics: MlbComparisonMetric[];
  awayAbbreviation: string; homeAbbreviation: string;
}) {
  const rawAway = getMlbTeamColors(awayAbbreviation).primary;
  const rawHome = getMlbTeamColors(homeAbbreviation).primary;
  const awayColor = colorsTooSimilar(rawAway, rawHome) ? "#374151" : rawAway;
  const homeColor = rawHome;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end gap-1 pr-1 text-[9px] text-muted-foreground">
        <span className="inline-block h-2.5 w-0.5 rounded-full bg-amber-400" />
        Avg marker
      </div>
      {awayMetrics.map((awayM, i) => {
        const homeM = homeMetrics[i];
        const avgPct = getLeagueTickPosition(awayM.leagueAverage, awayM.scaleKey);
        const awayPct = getBarScalePosition(awayM.leftValue, awayM.scaleKey);
        const homePct = getBarScalePosition(homeM?.leftValue ?? null, homeM?.scaleKey ?? awayM.scaleKey);
        return (
          <div key={awayM.key} className="space-y-1 rounded-lg border border-border/40 bg-secondary/20 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-foreground/70">{awayM.label}</span>
              {awayM.leagueAverage != null && (
                <span className="flex items-center gap-1 text-[9px] font-semibold text-amber-600">
                  <span className="inline-block h-2 w-[2px] rounded-full bg-amber-400" />
                  Avg {formatMetric(awayM.leagueAverage, awayM.format)}
                </span>
              )}
            </div>
            <CompactBar label={awayAbbreviation} value={formatMetric(awayM.leftValue, awayM.format)} barPct={awayPct} avgPct={avgPct} color={awayColor} />
            {homeM && <CompactBar label={homeAbbreviation} value={formatMetric(homeM.leftValue, homeM.format)} barPct={homePct} avgPct={avgPct} color={homeColor} />}
          </div>
        );
      })}
    </div>
  );
}
