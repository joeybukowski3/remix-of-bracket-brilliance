import type { NflYardagePlayerHistoryGame } from "@/lib/nfl/props/types/yardageHistory";
import type { PropsPerformanceRow } from "@/types/nfl/performance";
import { formatMetric } from "@/lib/nfl/performance/format";

type Cell = { label: string; value: string };

function statValue(stat: object | undefined, key: string): string {
  if (!stat || !(key in stat)) return "—";
  const value = (stat as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

export default function NflPerformancePropsBoxScore({ row, game, loading = false }: { row: PropsPerformanceRow; game: NflYardagePlayerHistoryGame | null; loading?: boolean }) {
  const stat = game?.stat;
  const yards = formatMetric(row.actual, 0);
  const cells: Cell[] = row.market === "passing_yards"
    ? [
        { label: "Cmp/Att", value: statValue(stat, "completions") === "—" ? "—" : `${statValue(stat, "completions")}/${statValue(stat, "attempts")}` },
        { label: "Pass yds", value: yards },
        { label: "Pass TD", value: statValue(stat, "passingTds") },
        { label: "INT", value: statValue(stat, "interceptions") },
      ]
    : row.market === "rushing_yards"
      ? [
          { label: "Carries", value: statValue(stat, "rushAttempts") },
          { label: "Rush yds", value: yards },
          { label: "Rush TD", value: statValue(stat, "rushTds") },
        ]
      : [
          { label: "Targets", value: statValue(stat, "targets") },
          { label: "Rec", value: statValue(stat, "receptions") },
          { label: "Rec yds", value: yards },
          { label: "Rec TD", value: statValue(stat, "recTds") },
        ];

  return (
    <div className="mt-3 border-t border-slate-200/80 pt-3">
      <h5 className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Box score</h5>
      <table className="mt-1 w-full table-fixed text-left text-xs tabular-nums" aria-label={`${row.market.replace("_yards", "")} box score`}>
        <thead><tr>{cells.map((cell) => <th key={cell.label} scope="col" className="border-r border-slate-200/70 px-1.5 py-1 font-medium text-slate-500 first:pl-0 last:border-r-0">{cell.label}</th>)}</tr></thead>
        <tbody><tr>{cells.map((cell) => <td key={cell.label} className="border-r border-slate-200/70 px-1.5 py-1 font-semibold text-slate-900 first:pl-0 last:border-r-0">{cell.value}</td>)}</tr></tbody>
      </table>
      {!game && <p className="mt-1 text-[11px] text-slate-500">{loading ? "Loading additional game stats…" : "Additional game stats unavailable; graded yards shown."}</p>}
    </div>
  );
}
