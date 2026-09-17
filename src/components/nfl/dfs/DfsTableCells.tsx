import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { POSITION_TONES } from "@/lib/fantasy/positionTone";
import { matchupGradeHeatTone, weeklyHeatStyle, weeklyRankHeatTone } from "@/lib/shared/jkbHeat";
import { JKB_HEAT_LEGEND } from "@/lib/shared/jkbHeat";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import { resolveDfsTdScore, type DfsTdScoreLookup } from "@/lib/nfl/dfs/tdScoreContext";
import { resolveDfsOppSlotWideContext, type DfsSlotWideEntry } from "@/lib/nfl/dfs/slotWideContext";

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

/** WR/TE targets/game — season or last-5 — from the weekly research context, with rank heat. */
export function TargetsPerGameCell({ row, period }: { row: DfsEnrichedAnalyzerRow; period: "season" | "last5" }) {
  const research = row.research?.status === "available" ? row.research : null;
  const metric = research ? (period === "season" ? research.context?.evidence.targetsPerGame : research.context?.evidence.targetsPerGameL5) : null;
  const label = period === "season" ? "Season" : "Last 5";
  const title = `${label} targets/game: ${metric?.value == null ? "unavailable" : metric.value.toFixed(1)}`
    + `${metric?.sampleSize ? `; ${metric.sampleSize} games` : ""}`
    + `${metric?.rank != null ? `; rank ${metric.rank} of ${metric.poolSize}` : ""}`;
  return (
    <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(metric?.rank ?? null, metric?.poolSize ?? 0))} title={title}>
      {metric?.value == null ? "—" : metric.value.toFixed(1)}
    </DfsHeatValue>
  );
}

/** JKB TD Score from the canonical Touchdown Preview artifact — never recomputed here. */
export function TdScoreCell({ row, lookup }: { row: DfsEnrichedAnalyzerRow; lookup: DfsTdScoreLookup }) {
  const entry = row.kind === "offense" ? resolveDfsTdScore(lookup, row.playerId, row.canonicalGameId) : null;
  const title = entry?.jkbTdScore == null ? "JKB TD Score unavailable for this player/week" : `JKB TD Score: ${entry.jkbTdScore.toFixed(1)}${entry.scoreRank != null ? `; rank ${entry.scoreRank} of ${entry.scorePoolSize}` : ""}`;
  return (
    <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(entry?.scoreRank ?? null, entry?.scorePoolSize ?? 0))} title={title}>
      {entry?.jkbTdScore == null ? "—" : entry.jkbTdScore.toFixed(1)}
    </DfsHeatValue>
  );
}

function wrOppSlotWideEntry(row: DfsEnrichedAnalyzerRow, slotWideByAbbr: ReadonlyMap<string, DfsSlotWideEntry>): DfsSlotWideEntry | null {
  if (row.kind !== "offense" || row.position !== "WR") return null;
  return resolveDfsOppSlotWideContext(slotWideByAbbr, row.opponent);
}

/** Opponent DEFENSE's fantasy PPG allowed to slot/wide receivers (Razzball) — higher favors this receiver, rank heat like every other PPG-allowed cell. Never this player's own alignment. */
export function SlotWidePpgAllowedCell({ row, slotWideByAbbr, field }: { row: DfsEnrichedAnalyzerRow; slotWideByAbbr: ReadonlyMap<string, DfsSlotWideEntry>; field: "slot" | "wide" }) {
  const entry = wrOppSlotWideEntry(row, slotWideByAbbr);
  const value = entry ? (field === "slot" ? entry.slotPpgAllowed : entry.widePpgAllowed) : null;
  const rank = entry ? (field === "slot" ? entry.slotPpgAllowedRank : entry.widePpgAllowedRank) : null;
  const label = field === "slot" ? "Slot PPG Allowed" : "Wide PPG Allowed";
  const title = value == null ? `${label} unavailable` : `Opponent defense ${label.toLowerCase()}: ${value.toFixed(1)}${rank != null ? `; rank ${rank} of ${entry?.poolSize}` : ""}`;
  return (
    <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(rank, entry?.poolSize ?? 0))} title={title}>
      {value == null ? "—" : value.toFixed(1)}
    </DfsHeatValue>
  );
}

/** Opponent DEFENSE's descriptive slot/wide distribution share (Razzball) — neutral formatting, no heat; this is not the player's own alignment. */
export function SlotWidePctCell({ row, slotWideByAbbr, field }: { row: DfsEnrichedAnalyzerRow; slotWideByAbbr: ReadonlyMap<string, DfsSlotWideEntry>; field: "slot" | "wide" }) {
  const entry = wrOppSlotWideEntry(row, slotWideByAbbr);
  const value = entry ? (field === "slot" ? entry.slotPct : entry.widePct) : null;
  const label = field === "slot" ? "Opp Slot %" : "Opp Wide %";
  const title = value == null ? `${label} unavailable` : `${label} (opponent defense, descriptive): ${(value * 100).toFixed(0)}%`;
  return <span title={title} className="inline-flex min-w-10 justify-end whitespace-nowrap px-1.5 py-0.5 font-semibold tabular-nums text-slate-700">{value == null ? "—" : `${Math.round(value * 100)}%`}</span>;
}

