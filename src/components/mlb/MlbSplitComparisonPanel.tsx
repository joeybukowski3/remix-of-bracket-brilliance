import { getBarScalePosition, getLeagueTickPosition } from "@/lib/mlb/mlbBarScale";
import { formatMetric } from "@/lib/mlb/mlbFormatters";
import { getMlbTeamColors } from "@/lib/mlbTeamColors";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

function CompactBar({ label, value, barPct, avgPct, color }: { label: string; value: string; barPct: number; avgPct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-10 shrink-0 truncate text-right text-[10px] font-bold text-muted-foreground">{label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
        <span className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-amber-400" style={{ left: `${avgPct}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${barPct}%`, backgroundColor: color }} />
      </div>
      <span className="w-12 shrink-0 text-[10px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default function MlbSplitComparisonPanel({
  awayMetrics,
  homeMetrics,
  awayAbbreviation,
  homeAbbreviation,
}: {
  context?: string;
  note?: string;
  metrics?: MlbComparisonMetric[];
  awayMetrics: MlbComparisonMetric[];
  homeMetrics: MlbComparisonMetric[];
  awayAbbreviation: string;
  homeAbbreviation: string;
}) {
  const awayColors = getMlbTeamColors(awayAbbreviation);
  const homeColors = getMlbTeamColors(homeAbbreviation);

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
          <div key={awayM.key} className="space-y-1 rounded-lg bg-secondary/30 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{awayM.label}</span>
              {awayM.leagueAverage != null && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2.5 w-0.5 rounded-full bg-amber-400" />
                  {formatMetric(awayM.leagueAverage, awayM.format)}
                </span>
              )}
            </div>
            <CompactBar label={awayAbbreviation} value={formatMetric(awayM.leftValue, awayM.format)} barPct={awayPct} avgPct={avgPct} color={awayColors.primary} />
            {homeM && (
              <CompactBar label={homeAbbreviation} value={formatMetric(homeM.leftValue, homeM.format)} barPct={homePct} avgPct={avgPct} color={homeColors.primary} />
            )}
          </div>
        );
      })}
    </div>
  );
}
