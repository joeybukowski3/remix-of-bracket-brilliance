import { numOrDash } from "./format";

export interface BoxScoreAggregate {
  atBats: number | null;
  hits: number | null;
  avg: number | null;
  homeRuns: number | null;
  doubles: number | null;
  totalBases: number | null;
  rbi: number | null;
  runs: number | null;
  baseOnBalls: number | null;
  strikeOuts: number | null;
  sampleSize: number;
}

const CELLS: { key: keyof BoxScoreAggregate; label: string; digits: number }[] = [
  { key: "atBats", label: "AB", digits: 0 },
  { key: "hits", label: "H", digits: 0 },
  { key: "avg", label: "AVG", digits: 3 },
  { key: "homeRuns", label: "HR", digits: 0 },
  { key: "doubles", label: "2B", digits: 0 },
  { key: "totalBases", label: "TB", digits: 0 },
  { key: "rbi", label: "RBI", digits: 0 },
  { key: "runs", label: "R", digits: 0 },
  { key: "baseOnBalls", label: "BB", digits: 0 },
  { key: "strikeOuts", label: "K", digits: 0 },
];

function formatAvg(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(3).replace(/^0/, "");
}

/**
 * Compact box-score-style stat strip. Any field the underlying data doesn't
 * carry (e.g. doubles) renders "—" instead of breaking the layout.
 *
 * Below the sm breakpoint this wraps into a 5x2 grid so all 10 stats stay
 * visible with no horizontal scrolling -- at sm and up it lays out as a
 * single horizontal row (the original box-score presentation).
 */
export default function BoxScoreStrip({ aggregate, accentClassName = "border-slate-200" }: { aggregate: BoxScoreAggregate; accentClassName?: string }) {
  return (
    <div className={`rounded-xl border ${accentClassName} bg-white/70`}>
      <div className="grid grid-cols-5 gap-px overflow-hidden rounded-t-xl bg-slate-100 text-center sm:grid-cols-10">
        {CELLS.map((cell) => (
          <div key={cell.key} className="bg-white px-1.5 py-2">
            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{cell.label}</div>
            <div className="mt-0.5 text-sm font-black tabular-nums text-slate-900">
              {cell.key === "avg" ? formatAvg(aggregate.avg) : numOrDash(aggregate[cell.key] as number | null, cell.digits)}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-2 py-1 text-[10px] text-slate-400">Sample: {aggregate.sampleSize} tracked plate appearance{aggregate.sampleSize === 1 ? "" : "s"}</div>
    </div>
  );
}
