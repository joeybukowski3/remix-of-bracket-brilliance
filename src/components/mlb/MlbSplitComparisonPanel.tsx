import MlbValuePill from "@/components/mlb/MlbValuePill";
import { formatMetric } from "@/lib/mlb/mlbFormatters";
import type { MlbComparisonMetric } from "@/lib/mlb/mlbTypes";

// Stats where lower team value = better (e.g. K% is bad for batters)
const LOWER_IS_WORSE_FOR_BATTER = new Set(["kPct"]);

function pctDiff(team: number, avg: number): number {
  if (avg === 0) return 0;
  return ((team - avg) / avg) * 100;
}

function DiffCell({ value, metricKey }: { value: number | null; avg: number | null; metricKey: string }) {
  // not used directly but kept for clarity
  return null;
}

function SplitTable({ label, note, metrics }: { label: string; note: string; metrics: MlbComparisonMetric[] }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-secondary/50">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stat</th>
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Team</th>
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avg</th>
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">vs Avg</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, i) => {
              const teamVal = m.leftValue;
              const avg = m.leagueAverage;
              let diffEl: React.ReactNode = <span className="text-muted-foreground">—</span>;

              if (teamVal != null && avg != null) {
                const diff = pctDiff(teamVal, avg);
                const isPositive = diff >= 0;
                // For K%, positive diff (more Ks) is bad for batter
                const isGood = LOWER_IS_WORSE_FOR_BATTER.has(m.key) ? !isPositive : isPositive;
                const negligible = Math.abs(diff) < 0.5;
                const cls = negligible
                  ? "text-muted-foreground"
                  : isGood
                  ? "font-semibold text-emerald-700 dark:text-emerald-400"
                  : "font-semibold text-red-600 dark:text-red-400";
                const arrow = isPositive ? "▲" : "▼";
                diffEl = (
                  <span className={cls}>
                    {arrow} {isPositive ? "+" : ""}{diff.toFixed(1)}%
                  </span>
                );
              }

              return (
                <tr key={m.key} className={i % 2 === 1 ? "bg-secondary/30" : ""}>
                  <td className="px-4 py-3 font-medium text-foreground">{m.label}</td>
                  <td className="px-4 py-3 text-center text-foreground">{formatMetric(m.leftValue, m.format)}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{formatMetric(m.leagueAverage, m.format)}</td>
                  <td className="px-4 py-3 text-center">{diffEl}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
      <SplitTable label={context} note={note} metrics={metrics} />
    </div>
  );
}
