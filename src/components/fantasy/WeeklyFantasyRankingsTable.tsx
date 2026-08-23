import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { cn } from "@/lib/utils";

function displayTeam(team: string): string {
  return team.toUpperCase();
}

function displayOpponent(row: WeeklyFantasyProjectionProductionRow): string {
  const prefix = row.homeAway === "away" ? "@" : "vs";
  return `${prefix} ${displayTeam(row.opponent)}`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function displayPoints(row: WeeklyFantasyProjectionProductionRow): string {
  return row.projectedFantasyPoints.toFixed(1);
}

function confidenceClass(confidence: WeeklyFantasyProjectionProductionRow["confidence"]["level"]): string {
  if (confidence === "high") return "border-emerald-700/50 bg-emerald-950/50 text-emerald-200";
  if (confidence === "low") return "border-amber-600/60 bg-amber-950/50 text-amber-200";
  return "border-slate-600 bg-slate-800 text-slate-200";
}

function usageState(row: WeeklyFantasyProjectionProductionRow): string {
  if (row.modelAuthority.state === "BASELINE_ONLY") return "Baseline only";
  return row.residualActivated ? "Usage-adjusted" : "Baseline (no current-season usage yet)";
}

function Detail({ row }: { row: WeeklyFantasyProjectionProductionRow }) {
  return (
    <div className="grid gap-x-6 gap-y-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
      <p><span className="text-slate-500">Model:</span> {usageState(row)}</p>
      <p><span className="text-slate-500">Baseline pts:</span> {row.baselineFantasyPoints.toFixed(1)}</p>
      <p><span className="text-slate-500">Usage adjustment:</span> {row.components.usageAdjustment >= 0 ? "+" : ""}{row.components.usageAdjustment.toFixed(1)}</p>
      <p><span className="text-slate-500">Team context adjustment:</span> {row.components.teamContextAdjustment >= 0 ? "+" : ""}{row.components.teamContextAdjustment.toFixed(1)}</p>
      <p><span className="text-slate-500">Prior games:</span> {row.priorGames}</p>
      <p><span className="text-slate-500">ROS projected PPG:</span> {row.rosProjectedPpg?.toFixed(1) ?? "—"}</p>
      <p><span className="text-slate-500">Prior-season PPG:</span> {row.priorSeasonPpg?.toFixed(1) ?? "—"}</p>
      <p><span className="text-slate-500">Confidence:</span> {capitalize(row.confidence.level)}</p>
      {row.missingInputs.length > 0 && <p><span className="text-slate-500">Missing inputs:</span> {row.missingInputs.join(", ")}</p>}
      <p className="sm:col-span-2 lg:col-span-3">
        <span className="text-slate-500">Scoring:</span> Full PPR · Pregame information only, no target-week results used.
      </p>
    </div>
  );
}

export default function WeeklyFantasyRankingsTable({ rows }: { rows: readonly WeeklyFantasyProjectionProductionRow[] }) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-sm">
      <table className="w-full table-fixed text-left text-xs text-slate-200">
        <caption className="sr-only">Canonical weekly fantasy projections</caption>
        <colgroup>
          <col className="w-11 sm:w-14" />
          <col />
          <col className="hidden w-16 sm:table-column" />
          <col className="hidden w-20 sm:table-column" />
          <col className="w-[76px] sm:w-24" />
          <col className="hidden w-24 md:table-column" />
        </colgroup>
        <thead className="border-b border-slate-700 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th scope="col" className="px-2 py-2 text-center">Rank</th>
            <th scope="col" className="px-1.5 py-2">Player</th>
            <th scope="col" className="hidden px-2 py-2 sm:table-cell">Team</th>
            <th scope="col" className="hidden px-2 py-2 sm:table-cell">Opponent</th>
            <th scope="col" className="px-1 py-2 text-right"><span className="sm:hidden">Proj Pts</span><span className="hidden sm:inline">Projected Pts</span></th>
            <th scope="col" className="hidden px-2 py-2 text-center md:table-cell">Confidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => {
            const expanded = expandedPlayerId === row.playerId;
            return (
              <Fragment key={row.playerId}>
                <tr className="bg-slate-950 hover:bg-slate-900/80">
                  <td className="px-2 py-2 text-center text-sm font-black tabular-nums text-white">{row.positionRank}</td>
                  <td className="min-w-0 px-1.5 py-2">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} details for ${row.playerName}`}
                      onClick={() => setExpandedPlayerId(expanded ? null : row.playerId)}
                      className="flex min-h-9 w-full min-w-0 items-center gap-2 text-left"
                    >
                      <TeamLogo name={displayTeam(row.team)} logo={nflLogoUrl(row.team)} className="h-6 w-6" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-white">{row.playerName}</span>
                        <span className="block truncate text-[10px] text-slate-400 sm:hidden">
                          {displayTeam(row.team)} · {displayOpponent(row)} · {capitalize(row.confidence.level)}
                        </span>
                      </span>
                      {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                    </button>
                  </td>
                  <td className="hidden px-2 py-2 font-semibold text-slate-300 sm:table-cell">{displayTeam(row.team)}</td>
                  <td className="hidden px-2 py-2 font-semibold text-slate-300 sm:table-cell">{displayOpponent(row)}</td>
                  <td className="px-1 py-2 text-right font-bold tabular-nums text-white">{displayPoints(row)}</td>
                  <td className="hidden px-2 py-2 text-center md:table-cell">
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold", confidenceClass(row.confidence.level))}>
                      {capitalize(row.confidence.level)}
                    </span>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={6} className="border-t border-slate-800 bg-slate-900/70 px-4 py-3"><Detail row={row} /></td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
