import { useState } from "react";
import { FantasyPlayerIdentity, FANTASY_TABLE_BODY_CELL, FANTASY_TABLE_HEADER_CELL, FANTASY_TABLE_SHELL } from "./FantasyTable";
import { WeeklyFantasyPlayerDetail } from "./WeeklyFantasyRankingsTable";
import { filterAndSortPool } from "@/lib/fantasy/startSit/lineup";
import type { PlayerMatch } from "@/lib/fantasy/startSit/sleeper";
import { matchupGradeHeatTone, weeklyHeatStyle, weeklyRankHeatTone, type WeeklyHeatTone, type WeeklyResearchPresentationRow } from "@/lib/fantasy/weekly/researchPresentation";
import { cn } from "@/lib/utils";

const format = (value: number | null | undefined) => value == null ? "N/A" : value.toFixed(1);
const HEADERS = ["RK", "PLAYER", "OPP", "PROJ. PTS", "SEASON PPG", "L5 TREND", "MATCHUP", "OPP ALLOWED SZN", "OPP ALLOWED L5", "TRENCHES", "EPA ADV.", "SUCCESS ADV."];

function HeatCell({ value, rank, pool, tone }: { value: string; rank?: number | null; pool?: number; tone?: WeeklyHeatTone }) {
  const heat = tone ?? weeklyRankHeatTone(rank, pool);
  return <td className={cn(FANTASY_TABLE_BODY_CELL, "whitespace-nowrap px-2 py-2 text-center text-xs font-bold tabular-nums")} style={weeklyHeatStyle(heat)}>{value}</td>;
}

export function StartSitPlayerMatrix({ players, rows, position }: { players: readonly PlayerMatch[]; rows: ReadonlyMap<string, WeeklyResearchPresentationRow>; position: string }) {
  const filtered = filterAndSortPool(players, position);
  const [expanded, setExpanded] = useState<string | null>(null);
  const selected = filtered.find((player) => player.sleeperId === expanded);
  const detail = selected?.jkb ? rows.get(selected.jkb.playerId) : null;
  return <section className={cn(FANTASY_TABLE_SHELL, "min-w-0 border-2 border-indigo-300")}>
    <div className="max-w-full overflow-x-auto" data-start-sit-matrix-scroll>
      <table className="w-full min-w-[1060px] border-collapse text-left">
        <thead className="bg-slate-950 text-[10px] uppercase tracking-wide text-white"><tr>{HEADERS.map((label) => <th key={label} className={cn(FANTASY_TABLE_HEADER_CELL, "whitespace-nowrap px-2 py-2 text-center first:text-left second:text-left")}>{label}</th>)}</tr></thead>
        <tbody>{filtered.map((player) => {
          const row = player.jkb!;
          const data = rows.get(row.playerId);
          const research = data?.row.research;
          return <tr key={player.sleeperId} className="hover:bg-slate-50">
            <td className="px-2 text-xs font-black">#{row.positionRank}</td>
            <td className="min-w-44 px-2 py-2"><FantasyPlayerIdentity player={row.playerName} team={row.team} compact onNameClick={() => setExpanded(expanded === player.sleeperId ? null : player.sleeperId)} nameExpanded={expanded === player.sleeperId} nameAriaLabel={`Details for ${row.playerName}`} /></td>
            <td className="px-2 text-xs font-bold">{row.homeAway === "away" ? "@" : "vs"} {row.opponent}</td>
            <HeatCell value={format(row.projectedFantasyPoints)} rank={row.positionRank} pool={data?.projectedFantasyPoints.poolSize} />
            <HeatCell value={format(research?.seasonPpg.value)} rank={research?.seasonPpg.rank} pool={research?.seasonPpg.poolSize} />
            <HeatCell value={format(research?.last5Ppg.value)} rank={research?.last5Ppg.rank} pool={research?.last5Ppg.poolSize} />
            <HeatCell value={data?.matchup.grade ?? "N/A"} tone={matchupGradeHeatTone(data?.matchup.gradeId)} />
            <HeatCell value={format(research?.opponentFpaSeason.value)} rank={research?.opponentFpaSeason.rank} pool={research?.opponentFpaSeason.poolSize} />
            <HeatCell value={format(research?.opponentFpaLast5.value)} rank={research?.opponentFpaLast5.rank} pool={research?.opponentFpaLast5.poolSize} />
            <HeatCell value={format(data?.row.matchupEdges.trenches.rankDifference)} tone={data?.matchupEdges.trenches.tone} />
            <HeatCell value={format(data?.row.matchupEdges.epa.rankDifference)} tone={data?.matchupEdges.epa.tone} />
            <HeatCell value={format(data?.row.matchupEdges.success.rankDifference)} tone={data?.matchupEdges.success.tone} />
          </tr>;
        })}</tbody>
      </table>
    </div>
    {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No mapped {position} players on this roster.</p>}
    {detail && <div className="border-t-2 border-indigo-200 p-2 sm:p-3"><WeeklyFantasyPlayerDetail presentation={detail} /></div>}
  </section>;
}
