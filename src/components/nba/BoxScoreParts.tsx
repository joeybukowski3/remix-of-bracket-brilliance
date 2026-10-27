import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { teamLogoUrl } from "@/lib/nba/props/teamBrand";
import type { GameResult } from "@/lib/nba/props/recentForm";
import type { BoardMarket } from "@/lib/nba/props/propsBoard";

/**
 * Pieces shared by the two Last 10 box-score tables. They follow the look of the MLB pitcher "Last 10" and "Opponent Last 10"
 * tables (src/components/mlb/MlbStrikeoutPropRowDetail.tsx): a titled card, small uppercase column heads, a green Home / sky Away
 * letter, emerald / rose over-under pills against the line, and a shaded average row. That component's table is private to it,
 * so the NBA tables are built from the same classes here rather than changing MLB code.
 *
 * Numeric columns are centered with tabular numerals; names and dates read left.
 */

export const STAT_LABEL: Record<BoardMarket, string> = { pts: "PTS", reb: "REB", ast: "AST" };

/** A count shown as written when whole, to one decimal otherwise. */
export const fmtStat = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));
export const fmtAverage = (value: number): string => value.toFixed(1);

export const HEAD_CELL = "border-b border-slate-200 px-1 py-1.5 align-middle text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:px-2";
export const BODY_CELL = "px-1 py-1.5 align-middle tabular-nums text-slate-700 sm:px-2";
export const NUMERIC = "text-center";
export const IDENTITY = "text-left";
/** The selected market's column is tinted and bold so the stat the board is showing reads at a glance. */
export const SELECTED_COLUMN = "bg-blue-50/70 font-bold text-blue-950";

export function BoxCard({ title, subtitle, testId, actions, children }: { title: string; subtitle?: string; testId: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} data-testid={testId} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50 px-2.5 py-1.5">
        <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-600">{title}</h5>
        {actions}
      </div>
      {subtitle ? <p className="border-b border-slate-100 px-2.5 py-1 text-[10px] text-slate-600">{subtitle}</p> : null}
      {children}
    </section>
  );
}

export function BoxNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="m-2 rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-center text-[11px] text-slate-600" data-testid={testId}>
      {children}
    </p>
  );
}

/** Green Home / sky Away letter, as on the MLB tables. */
export function HomeAwayBadge({ isHome }: { isHome: boolean }) {
  return (
    <span
      data-testid="box-home-away"
      data-site={isHome ? "home" : "away"}
      title={isHome ? "Home game" : "Away game"}
      className={cn("inline-flex h-3.5 shrink-0 items-center justify-center rounded border px-1 text-[8px] font-black leading-none", isHome ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-sky-200 bg-sky-50 text-sky-700")}
    >
      {isHome ? "H" : "A"}
      <span className="sr-only">{isHome ? "ome" : "way"}</span>
    </span>
  );
}

/** A small team logo with the code always written beside it, so a logo that cannot load simply disappears. */
export function MiniTeamLogo({ team }: { team: string }) {
  const url = teamLogoUrl(team);
  const [failed, setFailed] = useState(false);
  if (url === null || failed) return null;
  return <img src={url} alt="" width={16} height={16} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} className="h-4 w-4 shrink-0 object-contain max-sm:hidden" />;
}

export function TeamTag({ team, prefix }: { team: string; prefix?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-slate-800">
      {prefix ? <span className="text-[9px] font-semibold uppercase text-slate-500">{prefix}</span> : null}
      <MiniTeamLogo team={team} />
      {team}
    </span>
  );
}

/** W / L with the score; the score hides on a phone, where the letter alone fits. */
export function ResultBadge({ result }: { result: GameResult | null }) {
  if (result === null) return <span className="text-slate-400" title="The final score is not reliably known for this game" data-testid="box-result" data-result="unknown">–</span>;
  return (
    <span data-testid="box-result" data-result={result.won ? "W" : "L"} className="inline-flex items-center gap-1 whitespace-nowrap" title={`${result.won ? "Won" : "Lost"} ${result.teamPts}–${result.opponentPts}`}>
      <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-black", result.won ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>{result.won ? "W" : "L"}</span>
      <span className="text-[10px] text-slate-600 max-sm:hidden">
        {result.teamPts}–{result.opponentPts}
      </span>
    </span>
  );
}

export type LineResult = "over" | "under" | "push" | "none";
export const lineResultOf = (value: number, line: number | null): LineResult => (line === null ? "none" : value > line ? "over" : value < line ? "under" : "push");

const RESULT_TONE: Record<LineResult, string> = {
  over: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  under: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  push: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
  none: "text-slate-800",
};

/**
 * The selected market's result for one game. With a Vegas line it is read against it (Over / Under / Push, in words for a
 * screen reader and in color for the rest); without one it is just the figure, since nothing is invented to compare to.
 */
export function SelectedResult({ value, line, stat, average = false }: { value: number; line: number | null; stat: string; average?: boolean }) {
  const result = lineResultOf(value, line);
  const text = average ? fmtAverage(value) : fmtStat(value);
  return (
    <span data-testid="box-selected" data-line-result={result} className={cn("inline-block min-w-[2rem] rounded-md px-1.5 py-0.5 text-center font-black tabular-nums", RESULT_TONE[result])}>
      {text}
      {result === "none" ? null : <span className="sr-only">{`, ${result === "push" ? "push on" : result} the ${line?.toFixed(1)} ${stat} line`}</span>}
    </span>
  );
}
