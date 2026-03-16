import { formatRoundedPercent } from "@/lib/numberFormat";
import {
  formatMoneyline,
  formatProbabilityValue,
  getModelEdgeIntensity,
  type VegasProbabilityComparison,
} from "@/lib/odds";

function getGlowClass(edgePoints: number) {
  const intensity = getModelEdgeIntensity(edgePoints);
  if (intensity === "high") return "border-[#7CFF6B] bg-[#7CFF6B]/20 text-[#D8FFD2] shadow-[0_0_18px_rgba(124,255,107,0.45)]";
  if (intensity === "medium") return "border-[#6AF15A] bg-[#6AF15A]/15 text-[#D8FFD2] shadow-[0_0_14px_rgba(106,241,90,0.28)]";
  return "border-[#59D84A] bg-[#59D84A]/10 text-[#D8FFD2]";
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
              <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${getGlowClass(vegas.edge.points)}`}>
                {vegas.edge.team === "teamA" ? teamAName : teamBName} {vegas.edge.points > 0 ? "+" : ""}
                {vegas.edge.points.toFixed(1)}%
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/80">
                <div
                  className="h-full rounded-full bg-[#7CFF6B] transition-all"
                  style={{ width: `${Math.min(100, Math.max(12, vegas.edge.points * 10))}%`, boxShadow: "0 0 14px rgba(124,255,107,0.45)" }}
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
