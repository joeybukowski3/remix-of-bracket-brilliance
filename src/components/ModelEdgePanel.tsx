import { formatRoundedPercent } from "@/lib/numberFormat";
import {
  formatMoneyline,
  formatProbabilityValue,
  getModelEdgeIntensity,
  type VegasProbabilityComparison,
} from "@/lib/odds";

function getGlowClass(edgePoints: number) {
  const intensity = getModelEdgeIntensity(edgePoints);
  if (intensity === "high") return "border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]";
  if (intensity === "medium") return "border-primary/20 bg-primary/10 text-primary";
  return "border-border bg-secondary text-muted-foreground";
}

export default function ModelEdgePanel({
  teamAName,
  teamBName,
  modelProbA,
  modelProbB,
  vegas,
}: {
  teamAName: string;
  teamBName: string;
  modelProbA: number;
  modelProbB: number;
  vegas: VegasProbabilityComparison | null;
}) {
  const modelProbAText = formatRoundedPercent(modelProbA * 100);
  const modelProbBText = formatRoundedPercent(modelProbB * 100);

  return (
    <div className="rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Model vs Vegas</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare the current model probability to the active live moneyline and Vegas implied win rate.
          </p>
        </div>
        {vegas?.sportsbook ? (
          <span className="rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {vegas.sportsbook}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-secondary/55 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Model Probability</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {modelProbAText} / {modelProbBText}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {teamAName} / {teamBName}
          </p>
        </div>

        <div className="rounded-xl bg-secondary/55 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Vegas Implied Probability</p>
          {vegas ? (
            <>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatProbabilityValue(vegas.teamA.impliedProbability)} / {formatProbabilityValue(vegas.teamB.impliedProbability)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatMoneyline(vegas.teamA.moneyline)} / {formatMoneyline(vegas.teamB.moneyline)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold text-muted-foreground">Vegas line unavailable</p>
          )}
        </div>

        <div className="rounded-xl bg-secondary/55 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Model Edge</p>
          {vegas && vegas.edge.team !== "even" && vegas.edge.points !== null ? (
            <>
              <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${getGlowClass(vegas.edge.points)}`}>
                {vegas.edge.team === "teamA" ? teamAName : teamBName} {vegas.edge.points > 0 ? "+" : ""}
                {vegas.edge.points.toFixed(1)}%
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/80">
                <div
                  className="h-full rounded-full bg-[hsl(var(--success))] transition-all"
                  style={{ width: `${Math.min(100, Math.max(12, vegas.edge.points * 10))}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {vegas ? "No model edge" : "Unavailable without Vegas line"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
