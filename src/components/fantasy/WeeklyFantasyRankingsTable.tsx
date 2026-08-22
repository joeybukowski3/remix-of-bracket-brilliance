import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import type { WeeklyFantasyRanking } from "@/lib/fantasy/weekly/productionAuthority";
import { cn } from "@/lib/utils";

const AUTHORITY_LABELS = {
  "preseason-ros": "ROS baseline",
  "current-season": "Season form",
  fallback: "Fallback",
} as const;

function displayTeam(team: string): string {
  return team.toUpperCase();
}

function displayOpponent(row: WeeklyFantasyRanking): string {
  const prefix = row.homeAway === "away" ? "@" : row.homeAway === "home" ? "vs" : "vs";
  return `${prefix} ${displayTeam(row.opponent)}`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function displayPpg(row: WeeklyFantasyRanking): string {
  const value = row.baselineProjectedPpg ?? row.currentSeasonPpg;
  return value == null ? "—" : value.toFixed(1);
}

function displayMatchup(row: WeeklyFantasyRanking): string {
  return row.matchupGrade ?? "—";
}

function confidenceClass(confidence: WeeklyFantasyRanking["confidence"]): string {
  if (confidence === "high") return "border-emerald-700/50 bg-emerald-950/50 text-emerald-200";
  if (confidence === "low") return "border-amber-600/60 bg-amber-950/50 text-amber-200";
  return "border-slate-600 bg-slate-800 text-slate-200";
}

function Detail({ row }: { row: WeeklyFantasyRanking }) {
  return (
    <div className="grid gap-x-6 gap-y-2 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-3">
      <p><span className="text-slate-500">Authority:</span> {AUTHORITY_LABELS[row.baselineAuthority]}</p>
      <p><span className="text-slate-500">Prior games:</span> {row.priorGamesCount}</p>
      <p><span className="text-slate-500">Availability:</span> {capitalize(row.availability)}</p>
      <p><span className="text-slate-500">ROS projected PPG:</span> {row.baselineProjectedPpg?.toFixed(1) ?? "—"}</p>
      <p><span className="text-slate-500">Current-season PPG:</span> {row.currentSeasonPpg?.toFixed(1) ?? "—"}</p>
      <p><span className="text-slate-500">FPA rank:</span> {row.fpaRank == null ? "—" : `#${row.fpaRank}`}</p>
      <p><span className="text-slate-500">Game total:</span> {row.marketTotal ?? "—"}</p>
      <p><span className="text-slate-500">Implied team total:</span> {row.impliedTeamTotal ?? "—"}</p>
      {row.diagnostics.previousRank != null && (
        <p><span className="text-slate-500">Previous rank:</span> #{row.diagnostics.previousRank}</p>
      )}
      {row.diagnostics.absoluteRankMovement != null && (
        <p><span className="text-slate-500">Rank movement:</span> {row.diagnostics.absoluteRankMovement}</p>
      )}
      {row.diagnostics.sourceAuthorityChangedThisWeek && <p><span className="text-slate-500">Transition:</span> Authority changed this week</p>}
      <p><span className="text-slate-500">Reasons:</span> {row.reasons.join(", ")}</p>
      <p><span className="text-slate-500">Source:</span> {row.provenance.source} · {row.provenance.sourceVersion}</p>
      {Object.entries(row.teamEnvironment).map(([key, value]) => (
        <p key={key}><span className="text-slate-500">{key}:</span> {value ?? "—"}</p>
      ))}
      <p className="sm:col-span-2 lg:col-span-3">
        <span className="text-slate-500">As of:</span> {new Date(row.inputAsOf).toLocaleString()} · Matchup and game context do not alter this rank.
      </p>
    </div>
  );
}

export default function WeeklyFantasyRankingsTable({ rows }: { rows: readonly WeeklyFantasyRanking[] }) {
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-sm">
      <table className="w-full table-fixed text-left text-xs text-slate-200">
        <caption className="sr-only">Canonical weekly fantasy rankings</caption>
        <colgroup>
          <col className="w-11 sm:w-14" />
          <col />
          <col className="hidden w-16 sm:table-column" />
          <col className="hidden w-20 sm:table-column" />
          <col className="w-[62px] sm:w-24" />
          <col className="w-[76px] sm:w-24" />
          <col className="hidden w-24 md:table-column" />
        </colgroup>
        <thead className="border-b border-slate-700 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th scope="col" className="px-2 py-2 text-center">Rank</th>
            <th scope="col" className="px-1.5 py-2">Player</th>
            <th scope="col" className="hidden px-2 py-2 sm:table-cell">Team</th>
            <th scope="col" className="hidden px-2 py-2 sm:table-cell">Opponent</th>
            <th scope="col" className="px-1 py-2 text-right"><span className="sm:hidden">ROS PPG</span><span className="hidden sm:inline">ROS Proj PPG</span></th>
            <th scope="col" className="px-1.5 py-2 text-center">Matchup</th>
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
                          {displayTeam(row.team)} · {displayOpponent(row)} · {capitalize(row.confidence)}
                        </span>
                      </span>
                      {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                    </button>
                  </td>
                  <td className="hidden px-2 py-2 font-semibold text-slate-300 sm:table-cell">{displayTeam(row.team)}</td>
                  <td className="hidden px-2 py-2 font-semibold text-slate-300 sm:table-cell">{displayOpponent(row)}</td>
                  <td className="px-1 py-2 text-right font-bold tabular-nums text-white">{displayPpg(row)}</td>
                  <td className="px-1.5 py-2 text-center">
                    <span className="block truncate text-[10px] font-bold text-sky-300">{displayMatchup(row)}</span>
                    <span className="block text-[9px] text-slate-500 sm:hidden">{displayOpponent(row)}</span>
                  </td>
                  <td className="hidden px-2 py-2 text-center md:table-cell">
                    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold", confidenceClass(row.confidence))}>
                      {capitalize(row.confidence)}
                    </span>
                  </td>
                </tr>
                {expanded && (
                  <tr>
                    <td colSpan={7} className="border-t border-slate-800 bg-slate-900/70 px-4 py-3"><Detail row={row} /></td>
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
