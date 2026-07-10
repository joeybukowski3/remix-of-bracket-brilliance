import type { NflMatchup } from "@/lib/nfl/matchups";
import type { MatchupComparisonRow } from "@/lib/nfl/matchupComparison";

function AdvantageMark({ side, row }: { side: "away" | "home"; row: MatchupComparisonRow }) {
  if (row.advantage !== side) return null;
  return (
    <span className="ml-1.5 inline-flex items-center rounded bg-emerald-100 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-800 align-middle">
      Edge
    </span>
  );
}

/**
 * Side-by-side comparison table. Advantage is indicated with a text "Edge" badge
 * plus a bold value (not color alone) so it is accessible without color.
 */
export default function MatchupComparisonTable({
  matchup,
  rows,
}: {
  matchup: NflMatchup;
  rows: MatchupComparisonRow[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <caption className="sr-only">
          {matchup.away.teamName} versus {matchup.home.teamName} statistical comparison
        </caption>
        <thead>
          <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
            <th scope="col" className="px-2 py-2 text-right">{matchup.away.teamName}</th>
            <th scope="col" className="px-2 py-2 text-center">Metric</th>
            <th scope="col" className="px-2 py-2 text-left">{matchup.home.teamName}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const awayWin = row.advantage === "away";
            const homeWin = row.advantage === "home";
            return (
              <tr key={row.key} className="border-b border-slate-100">
                <td className={`px-2 py-2 text-right tabular-nums ${awayWin ? "font-black text-emerald-800" : "font-semibold text-slate-700"}`}>
                  {row.awayValue}
                  <AdvantageMark side="away" row={row} />
                </td>
                <th scope="row" className="px-2 py-2 text-center text-[11px] font-bold text-slate-500" title={row.explanation}>
                  {row.label}
                </th>
                <td className={`px-2 py-2 text-left tabular-nums ${homeWin ? "font-black text-emerald-800" : "font-semibold text-slate-700"}`}>
                  <AdvantageMark side="home" row={row} />
                  {row.homeValue}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
