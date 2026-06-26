import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { getSinCityResults } from "@/lib/mlb/mlbHrFilter";

export type HrDashboardGame = {
  gameKey: string;
  matchup: string;
  awayTeam: string;
  homeTeam: string;
  stadium: string;
  roofType: string;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windDirection: string;
  conditions: string;
  parkFactor: number;
  [key: string]: unknown;
};

export type HrDashboardPitcher = {
  gameKey: string;
  pitcher: string;
  pitcherId?: number | null;
  team: string;
  opponent: string;
  hand?: string;
  ballpark?: string;
  parkFactor?: number | null;
  xera?: number | null;
  hardHitRate?: number | null;
  flyBallRate?: number | null;
  barrelRate?: number | null;
  kRate?: number | null;
  bbRate?: number | null;
  whiffRate?: number | null;
  last7HR?: number;
  hrPerStart?: number | null;
  hrVs?: number | null;
  hitsVs?: number | null;
  kVs?: number | null;
  [key: string]: unknown;
};

export type HrDashboardBatter = {
  gameKey: string;
  player: string;
  position?: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  opposingPitcherId?: number | null;
  pitcherHand?: string;
  ballpark?: string;
  parkFactor?: number | null;
  atBats?: number | null;
  barrelRate?: number | null;
  hardHitRate?: number | null;
  exitVelo?: number | null;
  iso?: number | null;
  hrFBRatio?: number | null;
  pullRate?: number | null;
  xba?: number | null;
  kRate?: number | null;
  bbRate?: number | null;
  whiffRate?: number | null;
  last7HR?: number;
  last30HR?: number;
  opposingPitcherHrVs?: number | null;
  opposingPitcherHitsVs?: number | null;
  opposingPitcherKVs?: number | null;
  weatherBoost?: number | null;
  hrScore: number;
  hrScoreRank: number;
  pitcherXera?: number | null;
  pitcherRegressionScore?: number | null;
  pitcherFlyBallRate?: number | null;
  bats?: "L" | "R" | "S" | null;
  hrOddsYes?: string | null;
  hrOddsNo?: string | null;
  hrValueEdge?: number | null;
  angleTags?: string[];
  [key: string]: unknown;
};

export type HrDashboardPayload = {
  date: string;
  generatedAt: string;
  games: HrDashboardGame[];
  pitchers: HrDashboardPitcher[];
  batters: HrDashboardBatter[];
  [key: string]: unknown;
};

export type HrPropPick = {
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  hrScoreRank: number;
  topStats: string[];
  bullets: string[];
  [key: string]: unknown;
};

export type HrBestBetsPayload = {
  date: string;
  generatedAt: string;
  slatePreview?: { slateOverview: string; modelNote: string } | null;
  bestBets: HrPropPick[];
  valueBets: HrPropPick[];
  longshots: HrPropPick[];
  [key: string]: unknown;
};

export type PitcherVsBatterRow = HrDashboardBatter & {
  rank: number;
  park: string;
  hrTargetScore: number;
  bestMatchupScore: number;
  strikeoutMatchupScore: number;
};

export type PitcherStrikeoutTeamRow = {
  rank: number;
  gameKey: string;
  pitcher: string;
  team: string;
  opponent: string;
  park: string;
  pitcherKRate: number | null;
  pitcherWhiffRate: number | null;
  pitcherKVs: number;
  strikeoutMatchupScore: number;
  [key: string]: unknown;
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const list = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

export function normalizeHrDashboardPayload(value: unknown): HrDashboardPayload | null {
  const payload = asObject(value);
  if (!payload) return null;
  const games = list<Record<string, unknown>>(payload.games).map((game) => ({
    ...game,
    gameKey: text(game.gameKey), matchup: text(game.matchup), awayTeam: text(game.awayTeam).toUpperCase(), homeTeam: text(game.homeTeam).toUpperCase(),
    stadium: text(game.stadium), roofType: text(game.roofType), temperature: num(game.temperature), precipitation: num(game.precipitation),
    windSpeed: num(game.windSpeed), windDirection: text(game.windDirection), conditions: text(game.conditions), parkFactor: num(game.parkFactor) ?? 1,
  })) as HrDashboardGame[];
  const pitchers = list<Record<string, unknown>>(payload.pitchers).map((pitcher) => ({
    ...pitcher,
    gameKey: text(pitcher.gameKey), pitcher: text(pitcher.pitcher), team: text(pitcher.team).toUpperCase(), opponent: text(pitcher.opponent).toUpperCase(),
  })) as HrDashboardPitcher[];
  const batters = list<Record<string, unknown>>(payload.batters).map((batter) => ({
    ...batter,
    gameKey: text(batter.gameKey), player: text(batter.player), team: text(batter.team).toUpperCase(), opponent: text(batter.opponent).toUpperCase(), opposingPitcher: text(batter.opposingPitcher),
    hrScore: num(batter.hrScore) ?? 0, hrScoreRank: num(batter.hrScoreRank) ?? 0,
  })) as HrDashboardBatter[];
  return { ...payload, date: text(payload.date), generatedAt: text(payload.generatedAt), games, pitchers, batters } as HrDashboardPayload;
}

export function normalizeHrBestBetsPayload(value: unknown): HrBestBetsPayload | null {
  const payload = asObject(value);
  if (!payload) return null;
  const normalizePicks = (entry: unknown): HrPropPick[] => list<Record<string, unknown>>(entry).map((pick) => ({
    ...pick,
    player: text(pick.player), team: text(pick.team).toUpperCase(), opponent: text(pick.opponent ?? pick.opp).toUpperCase(), opposingPitcher: text(pick.opposingPitcher),
    hrScoreRank: num(pick.hrScoreRank) ?? 0, topStats: list<unknown>(pick.topStats).map(text).filter(Boolean), bullets: list<unknown>(pick.bullets).map(text).filter(Boolean),
  })) as HrPropPick[];
  return {
    ...payload,
    date: text(payload.date), generatedAt: text(payload.generatedAt),
    bestBets: normalizePicks(payload.bestBets), valueBets: normalizePicks(payload.valueBets), longshots: normalizePicks(payload.longshots),
  } as HrBestBetsPayload;
}

const isPlaceholder = (value: string) => !value || /^(TBD|TBA|TO BE ANNOUNCED|TO BE DETERMINED)$/i.test(value);

export function buildTbdGameKeySet(pitchers: HrDashboardPitcher[], batters: HrDashboardBatter[]) {
  const keys = new Set<string>();
  pitchers.forEach((pitcher) => { if (isPlaceholder(pitcher.pitcher)) keys.add(pitcher.gameKey); });
  batters.forEach((batter) => { if (isPlaceholder(batter.opposingPitcher)) keys.add(batter.gameKey); });
  return keys;
}

export function buildTbdFootnotes(keys: Set<string>, games: HrDashboardGame[], _pitchers: HrDashboardPitcher[], _batters: HrDashboardBatter[]) {
  return games.filter((game) => keys.has(game.gameKey)).map((game) => ({ gameKey: game.gameKey, matchup: game.matchup }));
}

export function buildPitcherVsBatterRows(batters: HrDashboardBatter[], _games: HrDashboardGame[], _pitchers: HrDashboardPitcher[]): PitcherVsBatterRow[] {
  return [...batters].sort((a, b) => b.hrScore - a.hrScore).map((batter, index) => ({
    ...batter,
    rank: index + 1,
    park: batter.ballpark ?? "",
    hrTargetScore: batter.hrScore,
    bestMatchupScore: batter.hrScore,
    strikeoutMatchupScore: Math.max(0, 100 - (batter.kRate ?? 25)),
  }));
}

export function buildPitcherStrikeoutRows(batters: HrDashboardBatter[], _games: HrDashboardGame[], pitchers: HrDashboardPitcher[]): PitcherStrikeoutTeamRow[] {
  return pitchers.map((pitcher, index) => ({
    rank: index + 1,
    gameKey: pitcher.gameKey,
    pitcher: pitcher.pitcher,
    team: pitcher.team,
    opponent: pitcher.opponent,
    park: pitcher.ballpark ?? "",
    pitcherKRate: num(pitcher.kRate),
    pitcherWhiffRate: num(pitcher.whiffRate),
    pitcherKVs: num(pitcher.kVs) ?? 0,
    strikeoutMatchupScore: (num(pitcher.kVs) ?? 0) + (num(pitcher.kRate) ?? 0),
  })).sort((a, b) => b.strikeoutMatchupScore - a.strikeoutMatchupScore);
}

export function buildPitcherStrikeoutMatchupRows(pitchers: HrDashboardPitcher[], batters: HrDashboardBatter[], games: HrDashboardGame[]) {
  return buildPitcherStrikeoutRows(batters, games, pitchers);
}

const teamLogo = (team: string) => {
  const map: Record<string, string> = { AZ: "ari", ATH: "oak", CWS: "chw", KC: "kc", SD: "sd", SF: "sf", TB: "tb", WSH: "wsh" };
  return `https://a.espncdn.com/i/teamlogos/mlb/500/${map[team] ?? team.toLowerCase()}.png`;
};

const format = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
const formatPct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;

function Team({ team }: { team: string }) {
  return <span className="inline-flex items-center gap-1.5"><img src={teamLogo(team)} alt="" className="h-5 w-5 object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /><span>{team}</span></span>;
}

export default function MlbHrProps() {
  usePageSeo(getSeoMeta("mlb-hr-props"));
  const [dashboard, setDashboard] = useState<HrDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"batters" | "pitchers" | "matchups">("batters");
  const [model, setModel] = useState<"all" | "sincity">("all");
  const [query, setQuery] = useState("");
  const [gameFilter, setGameFilter] = useState("all");

  useEffect(() => {
    let active = true;
    fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((json) => { if (active) { setDashboard(normalizeHrDashboardPayload(json)); setError(null); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load MLB data"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const games = dashboard?.games ?? [];
  const tbdKeys = useMemo(() => buildTbdGameKeySet(dashboard?.pitchers ?? [], dashboard?.batters ?? []), [dashboard]);
  const batters = useMemo(() => (dashboard?.batters ?? []).filter((batter) => !tbdKeys.has(batter.gameKey) && !isPlaceholder(batter.opposingPitcher)), [dashboard, tbdKeys]);
  const pitchers = useMemo(() => (dashboard?.pitchers ?? []).filter((pitcher) => !tbdKeys.has(pitcher.gameKey) && !isPlaceholder(pitcher.pitcher)), [dashboard, tbdKeys]);

  const filteredBatters = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return batters.filter((batter) => {
      if (gameFilter !== "all" && batter.gameKey !== gameFilter) return false;
      if (batter.atBats != null && batter.atBats < 50) return false;
      if (batter.barrelRate != null && batter.barrelRate > 25) return false;
      if (!normalized) return true;
      return [batter.player, batter.team, batter.opponent, batter.opposingPitcher, batter.ballpark ?? ""].some((value) => value.toLowerCase().includes(normalized));
    }).sort((a, b) => b.hrScore - a.hrScore || a.player.localeCompare(b.player));
  }, [batters, gameFilter, query]);

  const sinCity = useMemo(() => {
    try {
      return getSinCityResults(filteredBatters);
    } catch (reason) {
      console.error("Sin City evaluation failed", reason);
      return { rows: [], isFallback: false };
    }
  }, [filteredBatters]);

  const filteredPitchers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return pitchers.filter((pitcher) => {
      if (gameFilter !== "all" && pitcher.gameKey !== gameFilter) return false;
      if (!normalized) return true;
      return [pitcher.pitcher, pitcher.team, pitcher.opponent, pitcher.ballpark ?? ""].some((value) => value.toLowerCase().includes(normalized));
    }).sort((a, b) => (num(b.hrVs) ?? 0) - (num(a.hrVs) ?? 0));
  }, [gameFilter, pitchers, query]);

  const matchups = useMemo(() => buildPitcherVsBatterRows(filteredBatters, games, pitchers), [filteredBatters, games, pitchers]);

  return (
    <SiteShell>
      <main className="site-page bg-[#edf2f7] pb-12 pt-3 text-slate-900">
        <div className="site-container" style={{ maxWidth: "none", width: "100%" }}>
          <div className="mb-3"><MlbNavHero /></div>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">MLB HR Props Dashboard</h1>
                <p className="mt-1 text-sm text-slate-500">Daily batter, pitcher, matchup, and Sin City power-model views.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["batters", "pitchers", "matchups"] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize ${tab === value ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}>{value}</button>)}
              </div>
            </div>
          </section>

          <div className="mt-3 grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-bold uppercase tracking-wide text-sky-900">Today&apos;s Games</div>
                <div className="mt-3 space-y-2">
                  <button type="button" onClick={() => setGameFilter("all")} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${gameFilter === "all" ? "bg-sky-700 text-white" : "bg-slate-50 text-slate-700"}`}>All games</button>
                  {games.map((game) => <button key={game.gameKey} type="button" onClick={() => setGameFilter(game.gameKey)} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${gameFilter === game.gameKey ? "bg-sky-700 text-white" : "bg-slate-50 text-slate-700"}`}><div className="font-semibold">{game.matchup || `${game.awayTeam} @ ${game.homeTeam}`}</div><div className="mt-0.5 text-xs opacity-70">{game.stadium} · PF {format(game.parkFactor, 2)}</div></button>)}
                </div>
              </section>
            </aside>

            <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, team, pitcher, or park" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none md:max-w-md" />
                {tab === "batters" && <div className="flex overflow-hidden rounded-xl border border-slate-200 text-sm font-semibold"><button type="button" onClick={() => setModel("all")} className={`px-4 py-2 ${model === "all" ? "bg-sky-700 text-white" : "bg-slate-50 text-slate-600"}`}>All Batters</button><button type="button" onClick={() => setModel("sincity")} className={`border-l border-slate-200 px-4 py-2 ${model === "sincity" ? "bg-amber-500 text-white" : "bg-slate-50 text-slate-600"}`}>🎰 Sin City</button></div>}
              </div>

              {loading && <div className="py-16 text-center text-sm text-slate-500">Loading MLB props data…</div>}
              {!loading && error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load MLB data: {error}</div>}
              {!loading && !error && !dashboard && <div className="py-16 text-center text-sm text-slate-500">No MLB props data is currently available.</div>}

              {!loading && !error && dashboard && tab === "batters" && model === "all" && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Batter</th><th className="px-3 py-2">HR Score</th><th className="px-3 py-2">Barrel%</th><th className="px-3 py-2">HH%</th><th className="px-3 py-2">EV</th><th className="px-3 py-2">L7</th><th className="px-3 py-2">L30</th><th className="px-3 py-2 text-left">Pitcher</th></tr></thead><tbody>{filteredBatters.map((batter, index) => <tr key={`${batter.player}-${batter.team}`} className="border-t border-slate-100"><td className="px-3 py-2 text-slate-400">{index + 1}</td><td className="px-3 py-2"><div className="font-semibold">{batter.player}</div><div className="mt-0.5 text-slate-400"><Team team={batter.team} /></div></td><td className="px-3 py-2 text-center font-bold text-sky-700">{format(batter.hrScore)}</td><td className="px-3 py-2 text-center">{formatPct(batter.barrelRate)}</td><td className="px-3 py-2 text-center">{formatPct(batter.hardHitRate)}</td><td className="px-3 py-2 text-center">{format(batter.exitVelo)}</td><td className="px-3 py-2 text-center">{batter.last7HR ?? "—"}</td><td className="px-3 py-2 text-center">{batter.last30HR ?? "—"}</td><td className="px-3 py-2">{batter.opposingPitcher}</td></tr>)}{filteredBatters.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500">No batters match the current filters.</td></tr>}</tbody></table></div>}

              {!loading && !error && dashboard && tab === "batters" && model === "sincity" && <div className="mt-4 space-y-3">{sinCity.isFallback && sinCity.rows.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><strong>No hitters met at least 3 of 4 Sin City criteria.</strong> Showing the five closest matches.</div>}<div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-xs"><thead className="bg-amber-50"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Batter</th><th className="px-3 py-2">Match</th><th className="px-3 py-2">Barrel%</th><th className="px-3 py-2">Pull Air%</th><th className="px-3 py-2">HH%</th><th className="px-3 py-2">EV</th><th className="px-3 py-2">HR Score</th><th className="px-3 py-2 text-left">Pitcher</th></tr></thead><tbody>{sinCity.rows.map((entry, index) => <tr key={`${entry.batter.player}-${entry.batter.team}`} className="border-t border-slate-100"><td className="px-3 py-2 text-slate-400">{index + 1}</td><td className="px-3 py-2"><div className="font-semibold">{entry.batter.player}</div><div className="mt-0.5 text-slate-400"><Team team={entry.batter.team} /></div>{entry.isFallback && <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Closest Match</span>}</td><td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-1 font-bold ${entry.evaluation.matchCount >= 3 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{entry.evaluation.matchCount}/4</span></td>{entry.evaluation.criteria.map((criterion) => <td key={criterion.name} className="px-3 py-2 text-center"><span className={`rounded px-2 py-1 font-semibold ${criterion.pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{criterion.pass ? "✓" : "✗"} {criterion.value == null ? "N/A" : criterion.name === "Exit Velo" ? criterion.value.toFixed(1) : `${criterion.value.toFixed(1)}%`}</span></td>)}<td className="px-3 py-2 text-center font-bold text-sky-700">{format(entry.batter.hrScore)}</td><td className="px-3 py-2">{entry.batter.opposingPitcher}</td></tr>)}{sinCity.rows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500">No batters match the current filters.</td></tr>}</tbody></table></div></div>}

              {!loading && !error && dashboard && tab === "pitchers" && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Pitcher</th><th className="px-3 py-2">Team</th><th className="px-3 py-2">Opponent</th><th className="px-3 py-2">xERA</th><th className="px-3 py-2">FB%</th><th className="px-3 py-2">HR VS</th><th className="px-3 py-2">K VS</th></tr></thead><tbody>{filteredPitchers.map((pitcher) => <tr key={`${pitcher.pitcher}-${pitcher.team}`} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{pitcher.pitcher}</td><td className="px-3 py-2 text-center"><Team team={pitcher.team} /></td><td className="px-3 py-2 text-center">{pitcher.opponent}</td><td className="px-3 py-2 text-center">{format(num(pitcher.xera), 2)}</td><td className="px-3 py-2 text-center">{formatPct(num(pitcher.flyBallRate))}</td><td className="px-3 py-2 text-center">{format(num(pitcher.hrVs))}</td><td className="px-3 py-2 text-center">{format(num(pitcher.kVs))}</td></tr>)}{filteredPitchers.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">No pitchers match the current filters.</td></tr>}</tbody></table></div>}

              {!loading && !error && dashboard && tab === "matchups" && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Batter</th><th className="px-3 py-2">Team</th><th className="px-3 py-2 text-left">Pitcher</th><th className="px-3 py-2">HR Score</th><th className="px-3 py-2">Pitcher HR VS</th><th className="px-3 py-2">Park</th></tr></thead><tbody>{matchups.map((row) => <tr key={`${row.player}-${row.team}`} className="border-t border-slate-100"><td className="px-3 py-2 text-slate-400">{row.rank}</td><td className="px-3 py-2 font-semibold">{row.player}</td><td className="px-3 py-2 text-center"><Team team={row.team} /></td><td className="px-3 py-2">{row.opposingPitcher}</td><td className="px-3 py-2 text-center font-bold text-sky-700">{format(row.hrScore)}</td><td className="px-3 py-2 text-center">{format(row.opposingPitcherHrVs)}</td><td className="px-3 py-2 text-center">{format(row.parkFactor, 2)}</td></tr>)}{matchups.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">No matchups match the current filters.</td></tr>}</tbody></table></div>}
            </section>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
