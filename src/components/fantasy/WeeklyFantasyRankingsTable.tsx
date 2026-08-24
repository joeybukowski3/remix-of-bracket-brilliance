import { Fragment, useState } from "react";
import {
  FANTASY_TABLE_BODY_CELL,
  FANTASY_TABLE_HEADER_CELL,
  FANTASY_TABLE_SHELL,
  FantasyExpandControl,
  FantasyPlayerIdentity,
} from "@/components/fantasy/FantasyTable";
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
  if (confidence === "high") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence === "low") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function usageState(row: WeeklyFantasyProjectionProductionRow): string {
  if (row.modelAuthority.state === "BASELINE_ONLY") return "Baseline only";
  return row.residualActivated ? "Usage-adjusted" : "Baseline (no current-season usage yet)";
}

function formatAdjustment(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

/** QB has no learned usage residual at all (frozen V1 is BASELINE_ONLY for QB). */
function usageAdjustmentLabel(row: WeeklyFantasyProjectionProductionRow): string {
  if (row.position === "QB") return "Not used";
  if (!row.residualActivated) return "Not active yet";
  return formatAdjustment(row.components.usageAdjustment);
}

/** Only RB carries a validated team-context residual under the frozen V1 spec. */
function teamContextLabel(row: WeeklyFantasyProjectionProductionRow): string {
  if (row.position !== "RB") return "Not used";
  if (!row.residualActivated) return "Not active yet";
  return formatAdjustment(row.components.teamContextAdjustment);
}

function scoringEnvironmentLabel(row: WeeklyFantasyProjectionProductionRow): string {
  if (!row.context.scoringEnvironment.marketContextAvailable) return "No market data";
  return formatAdjustment(row.components.scoringEnvironmentAdjustment);
}

function opponentMatchupLabel(row: WeeklyFantasyProjectionProductionRow): string {
  if (row.context.opponentFpa.fallbackReason === "missing-both-neutral") return "No matchup data";
  return formatAdjustment(row.components.opponentFpaAdjustment);
}

function Detail({ row }: { row: WeeklyFantasyProjectionProductionRow }) {
  return (
    <div className="grid gap-x-6 gap-y-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
      <p><span className="text-slate-500">Model:</span> {usageState(row)}</p>
      <p><span className="text-slate-500">Baseline pts:</span> {row.baselineFantasyPoints.toFixed(1)}</p>
      <p><span className="text-slate-500">Usage adjustment:</span> {usageAdjustmentLabel(row)}</p>
      <p><span className="text-slate-500">Team context adjustment:</span> {teamContextLabel(row)}</p>
      <p><span className="text-slate-500">Scoring environment:</span> {scoringEnvironmentLabel(row)}</p>
      <p><span className="text-slate-500">Opponent matchup:</span> {opponentMatchupLabel(row)}</p>
      <p><span className="text-slate-500">Final projected pts:</span> {row.projectedFantasyPoints.toFixed(1)}</p>
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
    <div className={FANTASY_TABLE_SHELL}>
      <table className="w-full table-fixed border-collapse text-left text-xs text-slate-700">
        <caption className="sr-only">Canonical weekly fantasy projections</caption>
        <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "w-11 px-2 py-2 text-center sm:w-14")}>Rank</th>
            <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "px-1.5 py-2")}>Player</th>
            <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "hidden w-16 px-2 py-2 sm:table-cell")}>Team</th>
            <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "hidden w-20 px-2 py-2 sm:table-cell")}>Opponent</th>
            <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "w-[76px] bg-sky-100 px-1 py-2 text-right text-sky-950 sm:w-24")}><span className="sm:hidden">Proj Pts</span><span className="hidden sm:inline">Projected Pts</span></th>
            <th scope="col" className={cn(FANTASY_TABLE_HEADER_CELL, "hidden w-24 px-2 py-2 text-center md:table-cell")}>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const expanded = expandedPlayerId === row.playerId;
            return (
              <Fragment key={row.playerId}>
                <tr className="group bg-white hover:bg-slate-50">
                  <td className={cn(FANTASY_TABLE_BODY_CELL, "px-2 py-2 text-center text-sm font-black tabular-nums text-slate-950")}>{row.positionRank}</td>
                  <td className={cn(FANTASY_TABLE_BODY_CELL, "min-w-0 px-1.5 py-1")}>
                    <div className="flex min-h-9 min-w-0 items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <FantasyPlayerIdentity player={row.playerName} team={row.team} compact />
                        <span className="block truncate pl-[22px] text-[10px] text-slate-500 sm:hidden">
                          {displayOpponent(row)} · {capitalize(row.confidence.level)}
                        </span>
                      </div>
                      <FantasyExpandControl
                        label={`${expanded ? "Hide" : "Show"} details for ${row.playerName}`}
                        expanded={expanded}
                        onClick={() => setExpandedPlayerId(expanded ? null : row.playerId)}
                        className="shrink-0"
                      />
                    </div>
                  </td>
                  <td className={cn(FANTASY_TABLE_BODY_CELL, "hidden px-2 py-2 font-semibold text-slate-600 sm:table-cell")}>{displayTeam(row.team)}</td>
                  <td className={cn(FANTASY_TABLE_BODY_CELL, "hidden px-2 py-2 font-semibold text-slate-600 sm:table-cell")}>{displayOpponent(row)}</td>
                  <td className={cn(FANTASY_TABLE_BODY_CELL, "bg-sky-50 px-1 py-2 text-right font-black tabular-nums text-sky-950")}>{displayPoints(row)}</td>
                  <td className={cn(FANTASY_TABLE_BODY_CELL, "hidden px-2 py-2 text-center md:table-cell")}>
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold", confidenceClass(row.confidence.level))}>
                      {capitalize(row.confidence.level)}
                    </span>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="border-b border-slate-200 px-4 py-3"><Detail row={row} /></td>
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
