/**
 * Yardage Props Review Last-10 history cells.
 *
 * The generic presentation primitives (home/away pill, rank cell, vs-average
 * cell, game-score cell, fantasy-points cell, summary strip) now live in the
 * universal `components/nfl/history` module and are shared with the DFS
 * Calculator's expanded player history -- see NflHistoryCells.tsx. This file
 * re-exports them under their historical names for existing Yardage Props
 * call sites, plus the few genuinely yardage-specific cells (colored against
 * a live sportsbook line, which DFS has no equivalent of).
 */
import { cn } from "@/lib/utils";
import { classifyVsCurrentLine } from "@/lib/nfl/props/review/yardageHistoryView";
import {
  NflHistoryGameScoreCell,
  NflHistoryHomeAwayPill,
  NflHistoryLast10SummaryStrip,
  NflHistoryRankCell,
  NflHistoryVsAverageCell,
} from "@/components/nfl/history/NflHistoryCells";

export const NflYardageHomeAwayPill = NflHistoryHomeAwayPill;
export const NflYardageGameScoreCell = NflHistoryGameScoreCell;
export const NflYardageRankCell = NflHistoryRankCell;
export const NflYardageVsAverageCell = NflHistoryVsAverageCell;
export const NflYardageLast10SummaryStrip = NflHistoryLast10SummaryStrip;

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

/**
 * Retained for archived prop-line data that still needs a display cell
 * elsewhere (e.g. line-grading/analysis views). No longer rendered by the
 * Player/Opponent Last-10 tables -- see section 5 of the DFS/Yardage shared
 * history work: those tables show Fantasy Pts / Fantasy Pts Allowed instead.
 */
export function NflYardageVegasLineCell({ line }: { line: number | null }) {
  return <span className="tabular-nums text-slate-500">{line != null ? line.toFixed(1) : "—"}</span>;
}
