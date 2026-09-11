import { cn } from "@/lib/utils";
import type { KProbabilityShadowRow } from "@/hooks/useMlbKProbabilityShadow";

const DASH = "--";

/**
 * Historical calibration check (scripts/research/mlb-k-probability-calibration.mjs,
 * 906 graded rows) found this model well-calibrated from 50-64% but
 * OVERCONFIDENT above ~65% -- predicted ~67-76% in that range, actual hit
 * rate only ~48-54%. This threshold does NOT change the stored/displayed
 * probability or edge in any way (STEP 5: "Do not arbitrarily cap the
 * underlying stored probability. Preserve raw research output.") -- it only
 * adds a visible caution so a large edge built on a >=65% model probability
 * is never read as a high-confidence claim the calibration data does not
 * support.
 */
const OVERCONFIDENT_TAIL_THRESHOLD = 0.65;

function isOverconfidentTail(probability: number | null): boolean {
  return probability != null && Number.isFinite(probability) && probability >= OVERCONFIDENT_TAIL_THRESHOLD;
}

/** `0.082` -> `"+8.2%"`, `-0.031` -> `"-3.1%"`. */
function formatEdgePercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  const pct = value * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatProbabilityPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Positive value: green. Near-neutral: muted slate. Negative/no-value: cool
 * muted -- STEP 6's suggested interpretation, matching the page's existing
 * heat-treatment vocabulary (see StatScorePill above it in
 * MlbStrikeoutProps.tsx) without introducing a new color language.
 */
function edgeTone(edge: number | null): string {
  if (edge == null || !Number.isFinite(edge)) return "bg-slate-100 text-slate-400";
  if (edge >= 0.08) return "bg-emerald-600 text-white";
  if (edge > 0) return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-500";
}

/**
 * Compact "VALUE" table cell -- the side with the largest positive
 * model-vs-no-vig-market probability edge, or a neutral dash when neither
 * side clears zero (STEP 6: "If neither side has positive edge: display
 * neutral / no value."). This is visual context only; it must never be read
 * as a bet recommendation (KS-007/KS-008 -- same discipline as the rest of
 * this page's projection-edge column).
 */
export function KProbabilityValueBadge({ probabilityRow }: { probabilityRow: KProbabilityShadowRow | null }) {
  if (!probabilityRow || probabilityRow.status !== "computed") {
    const label = probabilityRow?.status === "one_sided_market" ? "1-sided" : DASH;
    return <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-400" title="No two-sided market probability available">{label}</span>;
  }
  const { lean, bestProbabilityEdge } = probabilityRow.edge;
  if (lean === "NEUTRAL" || bestProbabilityEdge == null) {
    return <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-400">Neutral</span>;
  }
  const favoredProbability = lean === "OVER" ? probabilityRow.model.overProbability : probabilityRow.model.underProbability;
  const overconfidentTail = isOverconfidentTail(favoredProbability);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums",
        edgeTone(bestProbabilityEdge),
        // Caution ring only -- the color/value tone above is unchanged, and
        // the number itself is never capped or hidden.
        overconfidentTail && "ring-2 ring-amber-400 ring-offset-1",
      )}
      title={`Model ${lean === "OVER" ? "Over" : "Under"} ${formatProbabilityPercent(favoredProbability)} vs no-vig market ${formatProbabilityPercent(lean === "OVER" ? probabilityRow.market.overNoVigProbability : probabilityRow.market.underNoVigProbability)}${overconfidentTail ? " -- historical calibration check found model probabilities this high are overconfident (predicted ~67-76%, actual hit rate only ~48-54%); treat with extra caution." : ""}`}
    >
      {lean}
      {" "}
      {formatEdgePercent(bestProbabilityEdge)}
      {overconfidentTail && <span aria-hidden="true" className="font-black text-amber-600">*</span>}
    </span>
  );
}

/**
 * Expanded detail block -- Model Over/Under %, no-vig market Over/Under %,
 * probability edge, and the probability-confidence grade (STEP 5: describes
 * confidence in the ESTIMATE, not in a bet). Used in both the desktop
 * expanded row and the mobile detail accordion.
 */
export function KProbabilityDetailBlock({ probabilityRow }: { probabilityRow: KProbabilityShadowRow | null }) {
  if (!probabilityRow) {
    return <p className="text-[11px] text-slate-400">Probability/value layer unavailable for this pitcher.</p>;
  }
  if (probabilityRow.status === "no_market") {
    return <p className="text-[11px] text-slate-400">No sportsbook K line posted -- probability layer needs a market to compare against.</p>;
  }
  if (probabilityRow.status === "insufficient_projection" || probabilityRow.status === "declined") {
    return <p className="text-[11px] text-slate-400">Not enough workload/strikeout-rate history to simulate a distribution yet.</p>;
  }

  const { model, market, edge, confidence } = probabilityRow;
  const oneSided = probabilityRow.status === "one_sided_market";
  const overconfidentTail = isOverconfidentTail(model.overProbability) || isOverconfidentTail(model.underProbability);

  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">Model vs. Market (shadow, informational)</span>
        <span className={cn(
          "rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide",
          confidence.grade === "HIGH" ? "bg-emerald-100 text-emerald-800" : confidence.grade === "MEDIUM" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500",
        )}
        title="Confidence in the shape of the probability estimate itself, not in whether a bet wins."
        >
          {confidence.grade ?? DASH} confidence
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="rounded-md bg-slate-50 px-2 py-1">
          <div className="text-[9px] font-bold uppercase text-slate-400">Model Over</div>
          <div className="font-black tabular-nums text-slate-900">{formatProbabilityPercent(model.overProbability)}</div>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-1">
          <div className="text-[9px] font-bold uppercase text-slate-400">Model Under</div>
          <div className="font-black tabular-nums text-slate-900">{formatProbabilityPercent(model.underProbability)}</div>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-1">
          <div className="text-[9px] font-bold uppercase text-slate-400">Vegas No-Vig Over</div>
          <div className="font-black tabular-nums text-slate-900">{oneSided ? DASH : formatProbabilityPercent(market.overNoVigProbability)}</div>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-1">
          <div className="text-[9px] font-bold uppercase text-slate-400">Vegas No-Vig Under</div>
          <div className="font-black tabular-nums text-slate-900">{oneSided ? DASH : formatProbabilityPercent(market.underNoVigProbability)}</div>
        </div>
      </div>
      {oneSided ? (
        <p className="text-[10px] text-amber-700">Only one side of the market is priced -- no de-vig comparison shown (never fabricated from a single price).</p>
      ) : (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold text-slate-600">Probability Edge</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums", edgeTone(edge.bestProbabilityEdge))}>
            {edge.lean === "NEUTRAL" ? "No value" : `${edge.lean} ${formatEdgePercent(edge.bestProbabilityEdge)}`}
          </span>
        </div>
      )}
      {overconfidentTail && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] leading-tight text-amber-800">
          Calibration check (906 graded historical rows): model probabilities at or above {(OVERCONFIDENT_TAIL_THRESHOLD * 100).toFixed(0)}% predicted ~67-76% but actually hit only ~48-54% of the time. This row's model probability is in that overconfident range -- the number above is the raw, uncapped model output, not a claim that it is well-calibrated at this level.
        </p>
      )}
      <p className="text-[9px] leading-tight text-slate-400">
        Visual context only -- not an automated bet recommendation. Simulated from {probabilityRow.simulationCount.toLocaleString()} deterministic Monte Carlo draws around the published projection; does not affect Proj K, K Score, or Best K Prop Bets.
      </p>
    </div>
  );
}
