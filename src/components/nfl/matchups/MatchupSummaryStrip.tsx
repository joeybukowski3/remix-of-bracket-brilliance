import { buildMatchupSummaryStripValues } from "@/lib/nfl/matchupSummaryStrip";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

type Field = { key: string; label: string; value: string; isJkb: boolean };

/**
 * Compact Vegas-vs-JKB line and total strip under a matchup's rankings matrix.
 * Market values read slate, JKB values read emerald — the same two tones the
 * matrix already uses for neutral text and the "Matchup →" link.
 */
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
    { key: "vegas-line", label: "Vegas Line", value: values.vegasLine, isJkb: false },
    { key: "jkb-line", label: "JKB Line", value: values.jkbLine, isJkb: true },
    { key: "vegas-total", label: "Vegas Total", value: values.vegasTotal, isJkb: false },
    { key: "jkb-total", label: "JKB Total", value: values.jkbTotal, isJkb: true },
  ];

  return (
    <dl
      data-matchup-summary-strip
      className="m-0 grid grid-cols-2 border-t-2 border-slate-300 bg-slate-50 md:grid-cols-4"
    >
      {fields.map((field, index) => (
        <div
          key={field.key}
          data-summary-field={field.key}
          className={`min-w-0 px-2.5 py-1.5 text-center ${index % 2 === 1 ? "border-l border-slate-200" : ""} ${
            index >= 2 ? "border-t border-slate-200 md:border-t-0" : ""
          } ${index > 0 ? "md:border-l md:border-slate-200" : ""}`}
        >
          <dt className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">{field.label}</dt>
          <dd
            className={`m-0 truncate text-[13px] font-extrabold tabular-nums ${
              field.isJkb ? "text-emerald-700" : "text-slate-900"
            }`}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
