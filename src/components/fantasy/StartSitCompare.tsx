import { useState } from "react";
import { FantasyPlayerIdentity, FANTASY_TABLE_SHELL } from "./FantasyTable";
import { WeeklyFantasyPlayerDetail } from "./WeeklyFantasyRankingsTable";
import { searchFantasyPlayers } from "@/lib/fantasy/startSit/playerSearch";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import type { WeeklyResearchPresentationRow } from "@/lib/fantasy/weekly/researchPresentation";

const format = (value: number | null | undefined) => value == null ? "N/A" : value.toFixed(1);

export function StartSitCompare({ players, rows }: { players: readonly WeeklyFantasyProjectionProductionRow[]; rows: ReadonlyMap<string, WeeklyResearchPresentationRow> }) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const byId = new Map(players.map((player) => [player.playerId, player]));
  const selected = selectedIds.map((id) => byId.get(id)).filter((row): row is WeeklyFantasyProjectionProductionRow => !!row);
  const options = searchFantasyPlayers(players, query, new Set(selectedIds));
  const detail = detailId ? rows.get(detailId) : null;
  const ordered = [...selected].sort((a, b) => b.projectedFantasyPoints - a.projectedFantasyPoints);
  const gap = ordered.length > 1 ? ordered[0].projectedFantasyPoints - ordered[1].projectedFantasyPoints : 0;
  const metrics: readonly [string, (row: WeeklyFantasyProjectionProductionRow, data: WeeklyResearchPresentationRow | undefined) => string][] = [
    ["JKB projected points", (row) => format(row.projectedFantasyPoints)],
    ["JKB positional rank", (row) => `#${row.positionRank}`],
    ["Season PPG", (_, data) => format(data?.row.research.seasonPpg.value)],
    ["Last 5 PPG", (_, data) => format(data?.row.research.last5Ppg.value)],
    ["Opponent", (row) => `${row.homeAway === "away" ? "@" : "vs"} ${row.opponent}`],
    ["Matchup", (_, data) => data?.matchup.grade ?? "N/A"],
    ["Opponent FPA season", (_, data) => format(data?.row.research.opponentFpaSeason.value)],
    ["Opponent FPA last 5", (_, data) => format(data?.row.research.opponentFpaLast5.value)],
    ["Trenches", (_, data) => format(data?.row.matchupEdges.trenches.rankDifference)],
    ["EPA advantage", (_, data) => format(data?.row.matchupEdges.epa.rankDifference)],
    ["Success advantage", (_, data) => format(data?.row.matchupEdges.success.rankDifference)],
    ["Touches", (_, data) => format(data?.row.research.evidence.touches.value)],
    ["Red zone touches", (_, data) => format(data?.row.research.evidence.redZoneTouches.value)],
    ["Yards per carry", (_, data) => format(data?.row.research.evidence.yardsPerCarry.value)],
    ["Receiving targets", (_, data) => format(data?.row.research.evidence.receivingTargets.value)],
    ["Target share", (_, data) => data?.row.research.evidence.targetShare.value == null ? "N/A" : `${(data.row.research.evidence.targetShare.value * 100).toFixed(1)}%`],
    ["Targets per game", (_, data) => format(data?.row.research.evidence.targetsPerGame.value)],
    ["Air yards per game", (_, data) => format(data?.row.research.evidence.airYardsPerGame.value)],
    ["Team implied total", (row) => format(row.context.scoringEnvironment.teamImpliedTotal)],
  ];
  const visibleMetrics = metrics.filter(([, read]) => selected.some((player) => read(player, rows.get(player.playerId)) !== "N/A"));
  return <section className="min-w-0 space-y-3">
    <div><h2 className="text-base font-bold text-slate-950">Compare Players</h2><p className="text-xs text-slate-600">Search the full JKB weekly fantasy pool. Select 2–4 players; projections use full PPR scoring.</p></div>
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <label htmlFor="start-sit-player-search" className="text-xs font-bold text-slate-700">Find a player</label>
      <input id="start-sit-player-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, position, or team" disabled={selected.length >= 4} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
      {selected.length < 4 && <div role="listbox" aria-label="JKB fantasy players" className="mt-2 grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">{options.map((player) => <button key={player.playerId} type="button" role="option" aria-selected="false" onClick={() => { setSelectedIds((ids) => [...ids, player.playerId]); setQuery(""); }} className="min-w-0 rounded border border-slate-200 px-2 py-1.5 text-left hover:border-sky-400 hover:bg-sky-50"><FantasyPlayerIdentity player={player.playerName} team={player.team} compact /><span className="ml-6 text-[10px] font-semibold text-slate-500">{player.position} · {player.projectedFantasyPoints.toFixed(1)} pts</span></button>)}</div>}
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Selected players">{selected.map((player) => <span key={player.playerId} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-2 py-1 text-xs font-bold text-white">{player.playerName}<button type="button" aria-label={`Remove ${player.playerName}`} onClick={() => { setSelectedIds((ids) => ids.filter((id) => id !== player.playerId)); if (detailId === player.playerId) setDetailId(null); }} className="rounded px-1 hover:bg-slate-700">×</button></span>)}</div>
      {selected.length < 2 && <p className="mt-2 text-xs text-slate-500">Select {2 - selected.length} more player{selected.length === 0 ? "s" : ""} to compare.</p>}
    </div>
    {selected.length >= 2 && <>
      <p className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-950"><strong>JKB lean: {ordered[0].playerName}</strong> · +{gap.toFixed(1)} projected full PPR points over {ordered[1].playerName}. This is a projection comparison, not a certainty.</p>
      <div className={FANTASY_TABLE_SHELL}><div className="overflow-x-auto"><table className="w-full min-w-[580px] text-sm"><thead className="bg-slate-950 text-white"><tr><th className="px-3 py-2 text-left">Metric</th>{selected.map((player) => <th key={player.playerId} className="px-3 py-2 text-left">{player.playerName}</th>)}</tr></thead><tbody>{visibleMetrics.map(([label, read]) => <tr key={label} className="border-b border-slate-100"><th className="whitespace-nowrap px-3 py-2 text-left text-xs text-slate-600">{label}</th>{selected.map((player) => <td key={player.playerId} className="px-3 py-2 font-semibold tabular-nums">{read(player, rows.get(player.playerId))}</td>)}</tr>)}</tbody></table></div></div>
      <div className="flex flex-wrap gap-2">{selected.map((player) => <button key={player.playerId} type="button" aria-expanded={detailId === player.playerId} onClick={() => setDetailId(detailId === player.playerId ? null : player.playerId)} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-slate-800">{detailId === player.playerId ? "Hide" : "Player + Opponent Last 10"} · {player.playerName}</button>)}</div>
      {detail && <div className="min-w-0"><WeeklyFantasyPlayerDetail presentation={detail} /></div>}
    </>}
  </section>;
}
