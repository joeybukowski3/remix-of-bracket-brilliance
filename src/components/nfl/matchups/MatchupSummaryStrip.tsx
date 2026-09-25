import { ArrowDown, ArrowUp } from "lucide-react";
import {
  atsPick,
  buildMatchupSummaryStripValues,
  compareSummaryLine,
  compareSummaryTotal,
  mlPickSide,
  SUMMARY_STRIP_MISSING,
  type PickSide,
  type SummaryComparison,
} from "@/lib/nfl/matchupSummaryStrip";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import { nflTeamColorFor } from "@/lib/nfl/nflTeamColor";
import type { NflMatchupTeam } from "@/lib/nfl/matchups";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";

type Field = {
  key: string;
  label: string;
  value?: string;
  comparison?: SummaryComparison;
  pick?: { side: PickSide | null; spread?: string | null };
};

const PICK_CREST_SIZE = 18;

function PickValue({ team, side, spread, label }: { team: NflMatchupTeam; side: PickSide; spread?: string | null; label: string }) {
  const color = nflTeamColorFor(team);
  const abbr = team.abbr.toUpperCase();
  return (
    <dd
      data-summary-pick={side}
      aria-label={`${label}: ${abbr}${spread ? ` ${spread}` : ""}`}
      className="m-0 inline-flex items-center gap-1 whitespace-nowrap rounded-sm border-l-[3px] border-slate-400 bg-white py-0.5 pl-1 pr-1.5 text-xs font-extrabold tabular-nums text-slate-800"
      style={color ? { borderLeftColor: color, backgroundColor: `color-mix(in srgb, ${color} 10%, white)` } : undefined}
    >
      <NflTeamCrest team={team} side={side} size={PICK_CREST_SIZE} />
      <span aria-hidden="true">{abbr}</span>
      {spread && <span aria-hidden="true" className="font-bold text-slate-600">{spread}</span>}
    </dd>
  );
}

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
  awayTeam,
  homeTeam,
}: {
  market: MarketCurrentGame | null;
  projection: GameProjection | null;
  totalProjection: TeamTotalProjection | null;
  awayTeam: NflMatchupTeam;
  homeTeam: NflMatchupTeam;
}) {
  const values = buildMatchupSummaryStripValues(market, projection, totalProjection);
  const ats = atsPick(market, projection);
  const mlSide = mlPickSide(projection);
  const teamFor = (side: PickSide) => (side === "home" ? homeTeam : awayTeam);
  const fields: Field[] = [
    { key: "vegas-line", label: "Vegas Line", value: values.vegasLine },
    { key: "jkb-line", label: "JKB Line", value: values.jkbLine, comparison: compareSummaryLine(market, projection) },
    { key: "vegas-total", label: "Vegas Total", value: values.vegasTotal },
    { key: "jkb-total", label: "JKB Total", value: values.jkbTotal, comparison: compareSummaryTotal(market, totalProjection) },
    { key: "ats-pick", label: "ATS Model Pick", pick: { side: ats?.side ?? null, spread: ats?.spread } },
    { key: "ml-pick", label: "ML Model Pick", pick: { side: mlSide } },
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
          {field.pick?.side ? (
            <PickValue team={teamFor(field.pick.side)} side={field.pick.side} spread={field.pick.spread} label={field.label} />
          ) : (
            <dd className={`m-0 whitespace-nowrap text-xs font-extrabold tabular-nums ${field.comparison ? "text-emerald-800" : "text-slate-800"}`}>
              {field.value ?? SUMMARY_STRIP_MISSING}
            </dd>
          )}
          {field.comparison && <ComparisonSignal comparison={field.comparison} line={field.key === "jkb-line"} />}
        </div>
      ))}
    </dl>
  );
}
