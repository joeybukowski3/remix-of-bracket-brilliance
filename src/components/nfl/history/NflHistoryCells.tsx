/**
 * Universal NFL player/opponent Last-10 history presentation primitives.
 *
 * Shared by the NFL Yardage Prop Preview and the NFL DFS Calculator's
 * expanded player history. Pure formatting/presentation only -- no data
 * lookups, no market- or DFS-specific semantics. Both consumers depend on
 * this module; neither DFS nor Yardage Props components import from the
 * other's component tree.
 *
 * Formatting helpers (rank/diff/game-score classification and text) are
 * intentionally reused from `yardageHistoryView.ts` rather than duplicated --
 * that module's threshold logic (over/under classification) is the single
 * source of truth for those comparisons.
 */
import { cn } from "@/lib/utils";
import {
  classifyVsAverageDiff,
  classifyVsCurrentLine,
  formatGameScore,
  formatHomeAway,
  formatRank,
  formatSignedDiff,
} from "@/lib/nfl/props/review/yardageHistoryView";
import { weeklyHeatClass, weeklyHeatStyle, type WeeklyHeatTone } from "@/lib/nfl/props/review/yardageHeat";

export function NflHistoryHomeAwayPill({ homeAway }: { homeAway: "home" | "away" | null }) {
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

export function NflHistoryGameScoreCell({
  score,
}: {
  score: { result: "W" | "L" | "T" | null; teamScore: number | null; oppScore: number | null } | null;
}) {
  const text = formatGameScore(score);
  if (!score || score.result == null) return <span className="text-slate-400">{text}</span>;
  const tone = score.result === "W" ? "text-emerald-700" : score.result === "L" ? "text-rose-700" : "text-slate-600";
  return <span className={cn("font-semibold tabular-nums", tone)}>{text}</span>;
}

/** Actual-value cell colored against TODAY's current line -- never a historical line for that game. */
export function NflHistoryActualValueCell({ actualValue, currentLine }: { actualValue: number; currentLine: number | null }) {
  const result = classifyVsCurrentLine(actualValue, currentLine);
  const tone =
    result === "over" ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
      : result === "under" ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
        : "text-slate-800";
  return (
    <span data-result={result} className={cn("inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums", tone)}>
      {actualValue}
    </span>
  );
}

export function NflHistoryRankCell({ rank, heatTone }: { rank: number | null; heatTone?: WeeklyHeatTone }) {
  if (heatTone == null) return <span className="tabular-nums text-slate-700">{formatRank(rank)}</span>;
  return (
    <span className={cn("inline-block rounded px-1.5 py-0.5 tabular-nums font-semibold", weeklyHeatClass(heatTone))} style={weeklyHeatStyle(heatTone)}>
      {formatRank(rank)}
    </span>
  );
}

/** Generic "vs average" comparison cell -- works for yardage-vs-allowance, or any other actual-vs-baseline comparison. */
export function NflHistoryVsAverageCell({ diff }: { diff: number | null }) {
  const result = classifyVsAverageDiff(diff);
  const tone =
    result === "over" ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
      : result === "under" ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
        : "text-slate-800";
  return (
    <span data-result={result} className={cn("inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums", tone)}>
      {formatSignedDiff(diff)}
    </span>
  );
}

/**
 * Full-game fantasy points cell. Only render this when `points` represents a
 * genuine full-game score under the consumer's declared scoring system --
 * never a single-market/partial total. Neither current consumer has a
 * leakage-safe, gameId-joined full box score wired in yet (see
 * nflClassicScoring.ts for why), so nothing in this codebase renders this
 * cell today; it exists for the day a full per-game score is available.
 */
export function NflHistoryFantasyPointsCell({ points }: { points: number | null }) {
  return <span className="tabular-nums text-slate-700">{points != null && Number.isFinite(points) ? points.toFixed(1) : "—"}</span>;
}

export type NflHistoryLast10Summary = {
  currentLine: number | null;
  over: number;
  under: number;
  sampleSize: number;
  avg: number | null;
  median: number | null;
};

export function NflHistoryLast10SummaryStrip({
  summary,
  allowedLabel = false,
}: {
  summary: NflHistoryLast10Summary;
  /** True for an "allowed" (opponent) strip -- "Allowed Over" vs "Over". */
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
          <span className="text-emerald-700">{overLabel}: <span className="tabular-nums font-semibold">{summary.over}/{summary.sampleSize}</span></span>
          <span className="text-rose-700">{underLabel}: <span className="tabular-nums font-semibold">{summary.under}/{summary.sampleSize}</span></span>
        </>
      )}
      <span className="text-slate-600">{avgLabel}: <span className="tabular-nums">{summary.avg != null ? summary.avg.toFixed(1) : "N/A"}</span></span>
      <span className="text-slate-600">Median: <span className="tabular-nums">{summary.median != null ? summary.median.toFixed(1) : "N/A"}</span></span>
    </div>
  );
}
