import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { POSITION_TONES } from "@/lib/fantasy/positionTone";
import { matchupGradeHeatTone, weeklyHeatStyle, weeklyRankHeatTone } from "@/lib/shared/jkbHeat";
import { JKB_HEAT_LEGEND } from "@/lib/shared/jkbHeat";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";

import { cn } from "@/lib/utils";

export function DfsPositionBadge({ position, label }: { label?: string; position: "QB" | "RB" | "WR" | "TE" | "FLEX" | "DST" }) {
  const tone = position === "FLEX" ? "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300"
    : position === "DST" ? "bg-slate-200 text-slate-900 ring-1 ring-inset ring-slate-400" : POSITION_TONES[position].badge;
  return <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold", tone)}>{label ?? position}</span>;
}

export function DfsSortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: "asc" | "desc"; onClick: () => void }) {
  const Icon = active ? direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <button type="button" aria-label={label} onClick={onClick}
    className={cn("flex w-full items-center justify-end gap-1 whitespace-nowrap rounded py-1 text-[10px] font-bold uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500", (label === "Player" || label === "Team/Opp") && "justify-start", active ? "text-sky-800" : "text-slate-600 hover:text-slate-950")}>
    {label}<Icon aria-hidden className="h-3 w-3 shrink-0" />
  </button>;
}

export function DfsHeatLegend() {
  return <div aria-label="JKB heat legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
    <span>Favorable → unfavorable</span>
    {JKB_HEAT_LEGEND.map(item => <span key={item.tone} className="inline-flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-sm" style={weeklyHeatStyle(item.tone)} />{item.label}</span>)}
  </div>;
}

export function DfsHeatValue({ children, style, title }: { children: ReactNode; style?: CSSProperties; title?: string }) {
  return <span title={title} style={style} className="inline-flex min-w-10 justify-end whitespace-nowrap rounded px-1.5 py-0.5 font-semibold tabular-nums">{children}</span>;
}

// ---------------------------------------------------------------------------
// Shared metric cells — used by both the main analyzer board and the
// Generated Lineups roster table so the two never fork a heat/value rule.
// Values come straight off the canonical enriched analyzer row.
// ---------------------------------------------------------------------------

/** Canonical weekly matchup grade (Great/Good/Neutral/Tough/Very Tough) with JKB heat. */
export function MatchupCell({ row }: { row: DfsEnrichedAnalyzerRow }) {
  const grade = row.research?.status === "available" ? row.research.matchupGrade : null;
  return <DfsHeatValue style={weeklyHeatStyle(matchupGradeHeatTone(grade?.id))}>{grade?.label ?? "—"}</DfsHeatValue>;
}

/** Player fantasy PPG (JKB Full PPR) — season or last-5 — from the weekly research context, with rank heat. */
export function FantasyPpgCell({ row, period }: { row: DfsEnrichedAnalyzerRow; period: "season" | "last5" }) {
  const research = row.research?.status === "available" ? row.research : null;
  const metric = research ? (period === "season" ? research.context?.seasonPpg : research.context?.last5Ppg) : null;
  const label = period === "season" ? "Season" : "Last 5";
  const title = `${label} fantasy PPG (JKB Full PPR): ${metric?.value == null ? "unavailable" : metric.value.toFixed(1)}`
    + `${metric?.sampleSize ? `; ${metric.sampleSize} games` : ""}`
    + `${metric?.rank != null ? `; rank ${metric.rank} of ${metric.poolSize}` : ""}`;
  return (
    <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(metric?.rank ?? null, metric?.poolSize ?? 0))} title={title}>
      {metric?.value == null ? "—" : metric.value.toFixed(1)}
    </DfsHeatValue>
  );
}

