import { ArrowDown, ArrowUp } from "lucide-react";
import {
  buildMatchupSummaryStripValues,
  compareSummaryLine,
  compareSummaryTotal,
  type SummaryComparison,
} from "@/lib/nfl/matchupSummaryStrip";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

type Field = { key: string; label: string; value: string; comparison?: SummaryComparison };

function ComparisonSignal({ comparison, line }: { comparison: SummaryComparison; line: boolean }) {
  if (comparison.kind === "unavailable" || comparison.kind === "aligned") return null;

  if (comparison.kind === "pickem") {
    return <span aria-label="Market pick'em; no favorite to compare" className="rounded-sm bg-slate-200 px-1 text-[9px] font-bold text-slate-600">PK</span>;
  }
  if (comparison.kind === "dog") {
    return <span aria-label="Market underdog projected to be favored by JKB" className="rounded-sm bg-amber-100 px-1 text-[9px] font-bold text-amber-800">DOG</span>;
  }

  const higher = comparison.kind === "higher";
  const description = line
    ? `JKB is ${higher ? "more" : "less"} bullish on the market favorite`
    : `JKB total is ${higher ? "higher" : "lower"} than the Vegas total`;
  return (
    <span
      aria-label={`${description} by ${Math.abs(comparison.delta!).toFixed(1)} points`}
      className={`inline-flex items-center gap-0.5 rounded-sm px-1 text-[10px] font-bold tabular-nums ${
        higher ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      {higher ? <ArrowUp aria-hidden="true" className="h-3 w-3" /> : <ArrowDown aria-hidden="true" className="h-3 w-3" />}
      <span aria-hidden="true">{higher ? "+" : "−"}{Math.abs(comparison.delta!).toFixed(1)}</span>
    </span>
  );
}

/** Compact market and JKB comparison, directly below each matchup matrix. */
export default function MatchupSummaryStrip({
  market,
  projection,
  totalProjection,
}: {
  market: MarketCurrentGame | null;
  projection: GameProjection | null;
  totalProjection: TeamTotalProjection | null;
}) {
  const values = buildMatchupSummaryStripValues(market, projection, totalProjection);
  const fields: Field[] = [
    { key: "vegas-line", label: "Vegas Line", value: values.vegasLine },
    { key: "jkb-line", label: "JKB Line", value: values.jkbLine, comparison: compareSummaryLine(market, projection) },
    { key: "vegas-total", label: "Vegas Total", value: values.vegasTotal },
    { key: "jkb-total", label: "JKB Total", value: values.jkbTotal, comparison: compareSummaryTotal(market, totalProjection) },
  ];

  return (
    <dl data-matchup-summary-strip className="m-0 grid min-w-0 grid-cols-2 border-t-[3px] border-slate-400 bg-slate-50 md:flex md:flex-wrap md:justify-start">
      {fields.map((field, index) => (
        <div
          key={field.key}
          data-summary-field={field.key}
          className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0 px-2.5 py-1.5 leading-tight md:py-2 ${
            index % 2 === 1 ? "border-l-2 border-slate-300" : ""
          } ${index >= 2 ? "border-t-2 border-slate-300 md:border-t-0" : ""} ${
            index > 0 ? "md:border-l-2 md:border-slate-300" : ""
          }`}
        >
          <dt className="whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.06em] text-slate-600">{field.label}</dt>
          <dd className={`m-0 whitespace-nowrap text-xs font-extrabold tabular-nums ${field.comparison ? "text-emerald-800" : "text-slate-800"}`}>
            {field.value}
          </dd>
          {field.comparison && <ComparisonSignal comparison={field.comparison} line={field.key === "jkb-line"} />}
        </div>
      ))}
    </dl>
  );
}
