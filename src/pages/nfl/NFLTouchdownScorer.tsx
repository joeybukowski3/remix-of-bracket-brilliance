import { useMemo, useState } from "react";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import TouchdownScorerTable from "@/components/nfl/touchdown-preview/TouchdownScorerTable";
import { useNflTouchdownPreview } from "@/hooks/useNflTouchdownPreview";
import { usePageSeo } from "@/hooks/usePageSeo";
import { DEFAULT_TOUCHDOWN_SORT, formatTouchdownMatchupLabel, nextTouchdownSort, sortTouchdownPlayers, touchdownMatchupKey, type TouchdownSort } from "@/lib/nfl/touchdown-preview/presentation";
import type { TouchdownPosition, TouchdownWindowKey } from "@/lib/nfl/touchdown-preview/types";

const WINDOW_OPTIONS: readonly TouchdownWindowKey[] = ["2025", "2026", "last8"];
const WINDOW_LABEL: Record<TouchdownWindowKey, string> = { 2025: "2025 Season", 2026: "2026 Season", last8: "Last 8" };
const POSITIONS = ["all", "QB", "RB", "WR", "TE"] as const;

export default function NFLTouchdownScorer() {
  usePageSeo({ title: "NFL TD Scorer | Joe Knows Ball", description: "Current-week NFL touchdown scorer rankings from the relative JKB TD Score.", path: "/nfl/td-scorer" });
  const source = useNflTouchdownPreview(2026);
  const [window, setWindow] = useState<TouchdownWindowKey>("last8");
  const [position, setPosition] = useState<"all" | TouchdownPosition>("all");
  const [team, setTeam] = useState("all"); const [matchup, setMatchup] = useState("all"); const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TouchdownSort>(DEFAULT_TOUCHDOWN_SORT);
  const players = useMemo(() => source.data?.players ?? [], [source.data]);
  const teams = useMemo(() => ["all", ...[...new Set(players.map((player) => player.team))].sort()], [players]);
  const matchups = useMemo(() => ["all", ...[...new Set(players.map((player) => touchdownMatchupKey(player.team, player.opponent)))].sort()], [players]);
  const visible = useMemo(() => sortTouchdownPlayers(players.filter((player) => (position === "all" || player.position === position) && (team === "all" || player.team === team) && (matchup === "all" || touchdownMatchupKey(player.team, player.opponent) === matchup) && player.playerName.toLowerCase().includes(search.trim().toLowerCase())), window, sort), [players, position, team, matchup, search, window, sort]);
  const windowContext = window === "2025" ? "2025 regular season · player samples vary by games played" : window === "2026" ? "Completed 2026 regular-season games only" : "Latest eight applicable games · crosses season boundaries";
  return <main className="mx-auto w-full max-w-[1900px] px-3 py-4 sm:px-5 lg:px-7">
    <NflPageHeader eyebrow="Markets & Predictions" title="TD Scorer" description={<><strong>JKB TD Score</strong> is a relative 0–100 player rating for touchdown-scoring equity. It is not a calibrated probability, fair price, or sportsbook edge.</>}>
      <div className="flex flex-wrap items-center gap-2"><NflFilterChips label="Data window" options={WINDOW_OPTIONS} value={window} onChange={(next) => { setWindow(next); setSort(DEFAULT_TOUCHDOWN_SORT); }} formatOption={(option) => WINDOW_LABEL[option]} tone="sky" /></div>
    </NflPageHeader>
    <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" aria-label="Sample context">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600"><span className="font-semibold text-slate-800">2026 Week {source.data?.week ?? 1} candidate board</span><span>{windowContext} · Scores use the fixed full candidate population.</span></div>
      {source.data?.sourceStatus.touchdownContext === "missing" && <p className="mt-1 text-[11px] text-amber-800" role="status">Touchdown PBP context is unavailable. Scoring-area metrics and JKB TD Score remain N/A until the validated compact cache is refreshed.</p>}
    </section>
    <section className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2.5" aria-label="TD Scorer filters">
      <label className="min-w-[190px] flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Player search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="All players" className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600" /></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team<select value={team} onChange={(event) => setTeam(event.target.value)} className="mt-1 block h-8 min-w-24 rounded border border-slate-300 bg-white px-2 text-xs uppercase text-slate-800"><option value="all">All</option>{teams.slice(1).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Matchup<select value={matchup} onChange={(event) => setMatchup(event.target.value)} className="mt-1 block h-8 min-w-32 rounded border border-slate-300 bg-white px-2 text-xs uppercase text-slate-800"><option value="all">All</option>{matchups.slice(1).map((value) => <option key={value} value={value}>{formatTouchdownMatchupLabel(value)}</option>)}</select></label>
      <NflFilterChips<"all" | TouchdownPosition> label="Position" options={POSITIONS} value={position} onChange={setPosition} formatOption={(value) => value === "all" ? "All" : value} size="sm" tone="violet" />
      <span className="ml-auto pb-1 text-[11px] tabular-nums text-slate-500">{visible.length} of {players.length} players</span>
    </section>
    <section className="mt-3">
      {source.loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading touchdown rankings…</div>
      ) : source.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{source.error} Refresh after generating the touchdown preview artifact.</div>
      ) : visible.length ? (
        <TouchdownScorerTable players={visible} window={window} sort={sort} onSort={(key) => setSort((current) => nextTouchdownSort(current, key))} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No players match these filters.</div>
      )}
    </section>
  </main>;
}
