import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import { getSinCityResults } from "@/lib/mlb/mlbHrFilter";

 type Batter = {
  player: string;
  team: string;
  opponent: string;
  opposingPitcher: string;
  gameKey: string;
  barrelRate: number | null;
  pullRate: number | null;
  hardHitRate: number | null;
  exitVelo: number | null;
  hrScore: number;
 };

export default function SinCityTestPage() {
  const [batters, setBatters] = useState<Batter[]>([]);
  const [games, setGames] = useState<Array<{ gameKey: string; matchup: string }>>([]);
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/data/mlb/hr-props-raw.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((payload) => {
        if (!active) return;
        setBatters(Array.isArray(payload?.batters) ? payload.batters : []);
        setGames(Array.isArray(payload?.games) ? payload.games : []);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Unable to load data"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return batters.filter((row) => {
      if (game !== "all" && row.gameKey !== game) return false;
      if (!q) return true;
      return [row.player, row.team, row.opponent, row.opposingPitcher].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [batters, game, query]);

  const results = useMemo(() => {
    try {
      return getSinCityResults(filtered);
    } catch (reason) {
      console.error("Sin City evaluation failed", reason);
      return { rows: [], isFallback: false };
    }
  }, [filtered]);

  return (
    <SiteShell>
      <main className="site-page bg-slate-100 pb-12 pt-3 text-slate-900">
        <div className="site-container" style={{ maxWidth: "none", width: "100%" }}>
          <MlbNavHero />
          <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-600">Test branch preview</div>
                <h1 className="mt-1 text-2xl font-bold">🎰 Sin City HR Filter</h1>
                <p className="mt-1 text-sm text-slate-500">3 of 4 required: Barrel ≥ 12%, Pull Air ≥ 20%, Hard Hit ≥ 45%, Exit Velocity ≥ 92 mph.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search player, team, or pitcher" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <select value={game} onChange={(event) => setGame(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="all">All games</option>
                  {games.map((item) => <option key={item.gameKey} value={item.gameKey}>{item.matchup || item.gameKey}</option>)}
                </select>
              </div>
            </div>

            {loading && <div className="py-12 text-center text-sm text-slate-500">Loading…</div>}
            {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
            {!loading && !error && results.isFallback && results.rows.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>No hitters met at least 3 of 4 criteria.</strong> Showing the five closest matches.</div>}

            {!loading && !error && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-amber-50"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Batter</th><th className="px-3 py-2">Match</th><th className="px-3 py-2">Barrel%</th><th className="px-3 py-2">Pull Air%</th><th className="px-3 py-2">HH%</th><th className="px-3 py-2">EV</th><th className="px-3 py-2">HR Score</th><th className="px-3 py-2 text-left">Pitcher</th></tr></thead>
                <tbody>
                  {results.rows.map((entry, index) => <tr key={`${entry.batter.player}-${entry.batter.team}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                    <td className="px-3 py-2"><div className="font-semibold">{entry.batter.player}</div><div className="text-slate-400">{entry.batter.team} vs {entry.batter.opponent}</div>{entry.isFallback && <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Closest Match</span>}</td>
                    <td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-1 font-bold ${entry.evaluation.matchCount >= 3 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{entry.evaluation.matchCount}/4</span></td>
                    {entry.evaluation.criteria.map((criterion) => <td key={criterion.name} className="px-3 py-2 text-center"><span className={`rounded px-2 py-1 font-semibold ${criterion.pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{criterion.pass ? "✓" : "✗"} {criterion.value == null ? "N/A" : criterion.name === "Exit Velo" ? criterion.value.toFixed(1) : `${criterion.value.toFixed(1)}%`}</span></td>)}
                    <td className="px-3 py-2 text-center font-bold text-sky-700">{entry.batter.hrScore.toFixed(1)}</td>
                    <td className="px-3 py-2">{entry.batter.opposingPitcher}</td>
                  </tr>)}
                  {results.rows.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500">No batters match the current filters.</td></tr>}
                </tbody>
              </table>
            </div>}
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
