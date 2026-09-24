import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { StartSitCompare } from "@/components/fantasy/StartSitCompare";
import { StartSitRosterPanel } from "@/components/fantasy/StartSitLineup";
import { StartSitPlayerMatrix } from "@/components/fantasy/StartSitPlayerMatrix";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useWeeklyFantasyProjectionArtifact } from "@/hooks/useWeeklyFantasyProjectionArtifact";
import { useWeeklyFantasyResearchRows } from "@/hooks/useWeeklyFantasyResearchRows";
import { useSleeperConnection } from "@/hooks/useSleeperConnection";
import { usePageSeo } from "@/hooks/usePageSeo";
import { WEEKLY_RANKINGS_SEASON } from "@/lib/fantasy/weeklyRankings";
import { resolveNflWeekSelection } from "@/lib/nfl/weekSelection";
import { lineupDifference, optimizeLineup } from "@/lib/fantasy/startSit/lineup";
import { compareLineupSwaps } from "@/lib/fantasy/startSit/lineupComparison";
import { mapSleeperPlayers, normalizeSleeperRoster, type SleeperTeam } from "@/lib/fantasy/startSit/sleeper";
import { prepareWeeklyResearchPresentation, type WeeklyResearchPresentationRow } from "@/lib/fantasy/weekly/researchPresentation";
import type { WeeklyFantasyProjectionProductionRow } from "@/lib/fantasy/weekly/projections/production/artifactContract";
import { cn } from "@/lib/utils";

const POSITIONS = ["QB", "RB", "WR", "TE", "FLEX"] as const;
const EMPTY_ROWS: WeeklyFantasyProjectionProductionRow[] = [];

function Connection({ username, connected, loading, error, onConnect, onDisconnect }: { username: string; connected: boolean; loading: boolean; error: string | null; onConnect: (value: string) => void; onDisconnect: () => void }) {
  const [draft, setDraft] = useState("");
  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Sleeper connection</p><p className="text-sm font-semibold text-slate-950">{connected ? `Connected to Sleeper · @${username}` : loading ? `Connecting @${username}…` : username ? `@${username}` : "Connect your fantasy teams"}</p></div>
    {username && connected ? <button type="button" onClick={onDisconnect} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Change username</button> : <form className="flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); onConnect(draft); }}><input aria-label="Sleeper username" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Sleeper username" className="min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm" required /><button type="submit" className="shrink-0 rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white">Connect</button></form>}
    {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
  </section>;
}

function LeagueTiles({ teams, userId, selectedId, onSelect }: { teams: readonly SleeperTeam[]; userId: string | undefined; selectedId: string; onSelect: (id: string) => void }) {
  return <div role="tablist" aria-label="Sleeper leagues" data-league-tiles className="flex max-w-full gap-2 overflow-x-auto pb-1 sm:max-h-[192px] sm:flex-wrap sm:content-start sm:overflow-x-hidden sm:overflow-y-auto">
    {teams.map((item) => {
      const selected = item.league.league_id === selectedId;
      const name = item.users.find((user) => user.user_id === userId)?.metadata?.team_name;
      const record = item.roster?.settings;
      return <button key={item.league.league_id} type="button" role="tab" aria-selected={selected} onClick={() => onSelect(item.league.league_id)} className={cn("h-[56px] min-w-40 shrink-0 rounded-lg border px-3 py-2 text-left sm:basis-[180px]", selected ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900")}>
        <span className="block truncate text-sm font-bold">{item.league.name}</span><span className={cn("block truncate text-xs", selected ? "text-slate-300" : "text-slate-500")}>{name ?? "My team"}{record?.wins != null ? ` · ${record.wins}-${record.losses ?? 0}${record.ties ? `-${record.ties}` : ""}` : ""}</span>
      </button>;
    })}
  </div>;
}

export default function StartSit() {
  usePageSeo({ title: "Start/Sit | Joe Knows Ball", description: "Compare Sleeper lineups and JKB weekly fantasy players.", path: "/fantasy-football/start-sit", noindex: false });
  const season = WEEKLY_RANKINGS_SEASON;
  const schedule = useNflSeasonData(season);
  const week = useMemo(() => resolveNflWeekSelection(schedule.data?.games ?? []).week ?? 1, [schedule.data]);
  const weekly = useWeeklyFantasyProjectionArtifact(season, week);
  const allRows = useMemo(() => weekly.status === "ready" ? Object.values(weekly.rows).flat() : EMPTY_ROWS, [weekly]);
  const research = useWeeklyFantasyResearchRows(allRows, season, week);
  const presentation = useMemo(() => {
    const result = new Map<string, WeeklyResearchPresentationRow>();
    for (const position of ["QB", "RB", "WR", "TE"] as const) {
      for (const item of prepareWeeklyResearchPresentation(research.rows.filter((row) => row.position === position))) result.set(item.row.playerId, item);
    }
    return result;
  }, [research.rows]);
  const connection = useSleeperConnection(season);
  const [leagueId, setLeagueId] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("QB");
  const [mode, setMode] = useState<"teams" | "compare">("teams");
  const team = connection.teams.find((item) => item.league.league_id === leagueId) ?? connection.teams[0];
  const roster = team?.roster ? normalizeSleeperRoster(team.roster, team.league.roster_positions) : null;
  const mapped = roster ? mapSleeperPlayers(roster.players, connection.players, allRows) : [];
  const byId = new Map(mapped.map((player) => [player.sleeperId, player]));
  const slots = team?.league.roster_positions ?? [];
  const unavailableIds = new Set([...(roster?.reserve ?? []), ...(roster?.taxi ?? [])]);
  const optimal = roster ? optimizeLineup(slots, mapped, roster.starters, unavailableIds) : [];
  const active = slots.map((slot, index) => index).filter((index) => !["BN", "IR", "TAXI"].includes(slots[index]));
  const currentIds = active.map((index) => roster?.starters[index] ?? null);
  const optimalIds = active.map((index) => optimal[index] ?? null);
  const activeSlots = active.map((index) => slots[index]);
  const currentTotal = currentIds.reduce((sum, id) => sum + (byId.get(id ?? "")?.jkb?.projectedFantasyPoints ?? 0), 0);
  const optimalTotal = optimalIds.reduce((sum, id) => sum + (byId.get(id ?? "")?.jkb?.projectedFantasyPoints ?? 0), 0);
  const swaps = compareLineupSwaps(activeSlots, currentIds, optimalIds, byId);
  const unmatched = mapped.filter((player) => !player.jkb);

  return <div className="min-w-0 space-y-4">
    <NflPageHeader eyebrow="Fantasy Football · Full PPR" title="Start/Sit" description={`JKB Week ${week} projections and matchup evidence.`} actions={<button type="button" onClick={() => setMode(mode === "compare" ? "teams" : "compare")} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white"><ArrowRightLeft className="h-4 w-4" />{mode === "compare" ? "My Teams / Start-Sit" : "Compare Players"}</button>} />
    {weekly.status !== "ready" ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">{weekly.status === "loading" ? "Loading JKB projections…" : `JKB Week ${week} projections are unavailable. This page requires the published weekly artifact.`}</p> : mode === "compare" ? <StartSitCompare players={allRows} rows={presentation} /> : <>
      <Connection username={connection.username} connected={!!connection.user} loading={connection.loading} error={connection.error} onConnect={connection.connect} onDisconnect={connection.disconnect} />
      {connection.loading && <p role="status" className="text-sm text-slate-600">Loading Sleeper leagues and players…</p>}
      {connection.user && connection.teams.length === 0 && <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">No NFL leagues found for {season}.</p>}
      {connection.teams.length > 0 && <>
        <LeagueTiles teams={connection.teams} userId={connection.user?.user_id} selectedId={team.league.league_id} onSelect={setLeagueId} />
        {!team.roster ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No roster owned by @{connection.username} was found in {team.league.name}.</p> : <>
          {research.errors.length > 0 && <p role="status" className="text-xs text-amber-800">Some matchup research is unavailable; affected values show N/A.</p>}
          {unmatched.length > 0 && <details className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"><summary className="cursor-pointer font-bold">{unmatched.length} roster players have no JKB projection or exact mapping</summary><p className="mt-1">K/DEF and players outside the JKB weekly pool are included here. Lineup totals exclude them.</p><ul className="mt-1 list-disc pl-4">{unmatched.map((player) => <li key={player.sleeperId}>{player.sleeper?.full_name ?? player.sleeperId} · {player.sleeper?.position ?? "unknown"} · Sleeper {player.sleeperId}</li>)}</ul></details>}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-200"><span><strong className="text-white">Suggested changes:</strong> {lineupDifference(roster.starters, optimal, slots)}</span><span><strong className="text-white">Current:</strong> {currentTotal.toFixed(1)}</span><span><strong className="text-white">Optimal:</strong> {optimalTotal.toFixed(1)}</span><span className="font-bold text-emerald-300">Projected gain: +{Math.max(0, optimalTotal - currentTotal).toFixed(1)}</span></div>
          <p className="text-xs text-slate-600">JKB full PPR projections are not adjusted for {team.league.name} scoring{team.league.scoring_settings?.rec != null ? ` (Sleeper reception value: ${team.league.scoring_settings.rec})` : ""}. Unprojected positions and unmatched players are excluded from totals. Arrows mark upgrades over 10% relative to the lower projection. Sleeper lineups are read only.</p>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2"><StartSitRosterPanel kind="current" slots={activeSlots} ids={currentIds} players={byId} total={currentTotal} swaps={swaps} /><StartSitRosterPanel kind="optimal" slots={activeSlots} ids={optimalIds} players={byId} total={optimalTotal} swaps={swaps} /></div>
          <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold text-slate-950">Roster player analysis</h2><p className="text-xs text-slate-600">Owned players · sorted by projected points</p></div><div role="tablist" aria-label="Player positions" className="flex gap-1 rounded-md bg-slate-200 p-1">{POSITIONS.map((option) => <button key={option} type="button" role="tab" aria-selected={position === option} onClick={() => setPosition(option)} className={cn("rounded px-3 py-2 text-xs font-bold", position === option ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-white")}>{option}</button>)}</div></div><StartSitPlayerMatrix key={`${team.league.league_id}-${position}`} position={position} players={mapped} rows={presentation} /></section>
        </>}
      </>}
    </>}
  </div>;
}
