/**
 * Small shared presentation cells for the Yardage Props Review Last-10
 * history tables (player and opponent-defense). Pure formatting over
 * already-resolved values from `yardageHistoryView.ts` -- no data lookups.
 */
import { cn } from "@/lib/utils";
import {
  classifyVsCurrentLine,
  formatGameScore,
  formatHomeAway,
  formatRank,
  type NflYardageLast10Summary,
} from "@/lib/nfl/props/review/yardageHistoryView";

export function NflYardageHomeAwayPill({ homeAway }: { homeAway: "home" | "away" | null }) {
  const label = formatHomeAway(homeAway);
  if (homeAway == null) return <span className="text-slate-400">{label}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        homeAway === "home" ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-violet-50 text-violet-700 ring-violet-200",
      )}
    >
      {label}
    </span>
  );
}

export function NflYardageGameScoreCell({
  score,
}: {
  score: { result: "W" | "L" | "T" | null; teamScore: number | null; oppScore: number | null } | null;
}) {
  const text = formatGameScore(score);
  if (!score || score.result == null) return <span className="text-slate-400">{text}</span>;
  const tone =
    score.result === "W"
      ? "text-emerald-700"
      : score.result === "L"
        ? "text-rose-700"
        : "text-slate-600";
  return <span className={cn("font-semibold tabular-nums", tone)}>{text}</span>;
}

/** Actual yardage cell colored against TODAY's current line -- never the historical Vegas Line for that game. */
export function NflYardageActualYardsCell({ actualYards, currentLine }: { actualYards: number; currentLine: number | null }) {
  const result = classifyVsCurrentLine(actualYards, currentLine);
  const tone =
    result === "over"
      ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
      : result === "under"
        ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
        : "text-slate-800";
  return (
    <span data-result={result} className={cn("inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums", tone)}>
      {actualYards}
    </span>
  );
}

export function NflYardageRankCell({ rank }: { rank: number | null }) {
  return <span className="tabular-nums text-slate-700">{formatRank(rank)}</span>;
}

export function NflYardageVegasLineCell({ line }: { line: number | null }) {
  return <span className="tabular-nums text-slate-500">{line != null ? line.toFixed(1) : "—"}</span>;
}

export function NflYardageLast10SummaryStrip({
  summary,
  allowedLabel = false,
}: {
  summary: NflYardageLast10Summary;
  /** True for the Opponent Last-10 strip ("ALLOWED OVER" vs "OVER"). */
  allowedLabel?: boolean;
}) {
  const overLabel = allowedLabel ? "Allowed Over" : "Over";
  const underLabel = allowedLabel ? "Allowed Under" : "Under";
  const avgLabel = allowedLabel ? "Avg Allowed" : "Avg";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px]">
      <span className="font-semibold text-slate-700">
        Current Line: <span className="tabular-nums">{summary.currentLine != null ? summary.currentLine.toFixed(1) : "N/A"}</span>
      </span>
      {summary.currentLine == null ? (
        <span className="text-slate-400">No current sportsbook line available -- yardage cells shown neutral.</span>
      ) : (
        <>
          <span className="text-emerald-700">
            {overLabel}: <span className="tabular-nums font-semibold">{summary.over}/{summary.sampleSize}</span>
          </span>
          <span className="text-rose-700">
            {underLabel}: <span className="tabular-nums font-semibold">{summary.under}/{summary.sampleSize}</span>
          </span>
        </>
      )}
      <span className="text-slate-600">
        {avgLabel}: <span className="tabular-nums">{summary.avg != null ? summary.avg.toFixed(1) : "N/A"}</span>
      </span>
      <span className="text-slate-600">
        Median: <span className="tabular-nums">{summary.median != null ? summary.median.toFixed(1) : "N/A"}</span>
      </span>
    </div>
  );
}
