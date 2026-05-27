import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import {
  formatPropNumber,
  getGameCount,
  getPitcherTeamForBatter,
  getPropEdgeTier,
  getBatterVsPitcherReason,
  ModelSummaryHeader,
  PropEdgeBadge,
  PropScoreBadge,
  TeamLogoText,
} from "@/components/mlb/MlbPropModelComponents";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import type { PitcherVsBatterRow } from "@/pages/MlbHrProps";

type SortKey = "rank" | "player" | "team" | "opposingPitcher" | "bestMatchupScore" | "batterPowerScore" | "opposingPitcherHitsVs" | "pitcherVulnerabilityScore" | "xba" | "hardHitRate" | "barrelRate";
type SortDirection = "asc" | "desc";

const confidenceOptions = ["All tiers", "Strong", "Positive", "Watch", "Neutral"];

function sortRows(rows: PitcherVsBatterRow[], key: SortKey, dir: SortDirection) {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * m;
    return (Number(av) - Number(bv)) * m;
  });
}

function fmt(v: number | null | undefined, digits = 1) {
  return v != null && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function ScoreCell({ value, invert = false }: { value: number; invert?: boolean }) {
  const hi = invert ? value <= 40 : value >= 65;
  const mid = invert ? value <= 55 : value >= 52;
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-black tabular-nums ${hi ? "bg-sky-500 text-white" : mid ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>
      {fmt(value)}
    </span>
  );
}

function makeSortIndicator(active: boolean, dir: SortDirection) {
  return active ? (dir === "asc" ? " ↑" : " ↓") : "";
}

export default function MlbBatterVsPitcher() {
  const { batterVsPitcherRows, dashboard, games, loading, pitchers } = useMlbPropsData();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("All tiers");
  const [sortKey, setSortKey] = useState<SortKey>("bestMatchupScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  usePageSeo({
    title: "MLB Batter vs Pitcher Model Today - Joe Knows Ball",
    description: "MLB batter vs pitcher model for hit and total-base attackability using batter quality, xBA/contact indicators, pitcher vulnerability, and matchup scores.",
    path: "/mlb/batter-vs-pitcher",
  });

  const teams = useMemo(() => Array.from(new Set(batterVsPitcherRows.map((r) => r.team))).sort(), [batterVsPitcherRows]);
  const gameOptions = useMemo(() => games.map((g) => ({ value: g.gameKey, label: g.matchup })), [games]);
  const bestScore = batterVsPitcherRows[0]?.bestMatchupScore ?? null;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = batterVsPitcherRows.filter((r) => {
      if (teamFilter !== "all" && r.team !== teamFilter) return false;
      if (gameFilter !== "all" && r.gameKey !== gameFilter) return false;
      if (confidenceFilter !== "All tiers" && getPropEdgeTier(r.bestMatchupScore).label !== confidenceFilter) return false;
      if (!q) return true;
      return [r.player, r.team, r.opposingPitcher, r.park, r.gameKey].some((v) => v.toLowerCase().includes(q));
    });
    return sortRows(rows, sortKey, sortDir);
  }, [batterVsPitcherRows, confidenceFilter, gameFilter, search, sortDir, sortKey, teamFilter]);

  const handleSort = (key: SortKey) => {
    setSortDir((cur) => (sortKey === key ? (cur === "asc" ? "desc" : "asc") : ["player", "team", "opposingPitcher"].includes(key) ? "asc" : "desc"));
    setSortKey(key);
  };

  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
      <button type="button" onClick={() => handleSort(k)} className="hover:text-slate-900">
        {label}{makeSortIndicator(sortKey === k, sortDir)}
      </button>
    </th>
  );

  return (
    <SiteShell>
      <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
        <div className="site-container space-y-4">
          <ModelSummaryHeader
            eyebrow="Batter matchup model"
            title="MLB Batter vs Pitcher Model"
            description="Ranks batter attackability for hits and total bases using current batter quality, xBA/contact indicators, pitcher vulnerability, and game context."
            generatedAt={dashboard?.generatedAt}
            gamesCount={getGameCount(games)}
            rowsCount={batterVsPitcherRows.length}
            bestScore={bestScore}
            siblingLinks={[
              { label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" },
              { label: "K Props", to: "/mlb/strikeout-props", icon: "🎯", color: "#22c55e" },
              { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" },
            ]}
          />

          {/* Filters */}
          <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid gap-2 sm:grid-cols-4">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search batter, pitcher, park" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white" />
              <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
                <option value="all">All teams</option>
                {teams.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={gameFilter} onChange={(e) => setGameFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
                <option value="all">All games</option>
                {gameOptions.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
              <select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
                {confidenceOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{loading ? "Loading…" : `${filteredRows.length} batter matchups shown`}</span>
              <Link to="/mlb" className="font-bold text-sky-700 hover:underline">Back to MLB</Link>
            </div>
          </section>

          {/* Table */}
          <section className="rounded-[20px] border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto rounded-xl border border-slate-200" style={{ WebkitOverflowScrolling: "touch" }}>
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-20">
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 font-black w-8 text-left">
                      <button type="button" onClick={() => handleSort("rank")} className="hover:text-slate-900">#{makeSortIndicator(sortKey === "rank", sortDir)}</button>
                    </th>
                    <th className="sticky left-8 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 font-black whitespace-nowrap min-w-[130px] text-left">
                      <button type="button" onClick={() => handleSort("player")} className="hover:text-slate-900">Batter{makeSortIndicator(sortKey === "player", sortDir)}</button>
                    </th>
                    <SortTh k="bestMatchupScore" label="Hit Score" />
                    <SortTh k="xba" label="xBA" />
                    <SortTh k="hardHitRate" label="Hard Hit%" />
                    <SortTh k="barrelRate" label="Barrel%" />
                    <SortTh k="batterPowerScore" label="Batter Score" />
                    <SortTh k="opposingPitcherHitsVs" label="Pitcher Score" />
                    <SortTh k="pitcherVulnerabilityScore" label="Pitcher Vuln" />
                    <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 font-black uppercase tracking-widest text-left whitespace-nowrap">Edge</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? filteredRows.map((row, i) => {
                    const pitcherTeam = getPitcherTeamForBatter(row, pitchers);
                    const bg = i % 2 === 0 ? "bg-white" : "bg-slate-50/70";
                    const sbg = i % 2 === 0 ? "bg-white" : "bg-slate-50";
                    return (
                      <tr key={`${row.rank}-${row.player}-${row.team}-${row.opposingPitcher}`} className={bg}>
                        <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-2 py-1 text-[10px] font-black text-slate-400 ${sbg}`}>{row.rank}</td>
                        <td className={`sticky left-8 z-10 border-b border-r border-slate-100 px-2 py-1 ${sbg}`}>
                          <div className="flex items-center gap-1.5">
                            <TeamLogoText team={row.team} size={16} />
                            <span className="font-semibold text-slate-900 whitespace-nowrap text-[11px]">{row.player}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                            vs {row.opposingPitcher}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1"><PropScoreBadge score={row.bestMatchupScore} /></td>
                        <td className="border-b border-slate-100 px-2 py-1">
                          <span className={`text-[11px] font-black tabular-nums ${row.xba != null && row.xba >= 0.290 ? "text-sky-700" : row.xba != null && row.xba >= 0.260 ? "text-slate-700" : "text-slate-400"}`}>
                            {row.xba != null ? row.xba.toFixed(3) : "—"}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1">
                          <span className={`text-[11px] font-bold tabular-nums ${row.hardHitRate != null && row.hardHitRate >= 52 ? "text-emerald-700" : row.hardHitRate != null && row.hardHitRate >= 47 ? "text-slate-700" : "text-slate-400"}`}>
                            {row.hardHitRate != null ? `${row.hardHitRate.toFixed(1)}%` : "—"}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1">
                          <span className={`text-[11px] font-bold tabular-nums ${row.barrelRate != null && row.barrelRate >= 10 ? "text-emerald-700" : row.barrelRate != null && row.barrelRate >= 7 ? "text-slate-700" : "text-slate-400"}`}>
                            {row.barrelRate != null ? `${row.barrelRate.toFixed(1)}%` : "—"}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1"><ScoreCell value={row.batterPowerScore} /></td>
                        <td className="border-b border-slate-100 px-2 py-1">
                          <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-black tabular-nums ${row.opposingPitcherHitsVs >= 65 ? "bg-rose-500 text-white" : row.opposingPitcherHitsVs >= 52 ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"}`}>
                            {fmt(row.opposingPitcherHitsVs)}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1">
                          <span className={`text-[11px] font-bold tabular-nums ${row.pitcherVulnerabilityScore >= 65 ? "text-rose-700" : row.pitcherVulnerabilityScore >= 52 ? "text-slate-700" : "text-slate-400"}`}>
                            {fmt(row.pitcherVulnerabilityScore)}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1"><PropEdgeBadge score={row.bestMatchupScore} /></td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-slate-500">No batters match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-2 p-3 md:hidden">
              {filteredRows.slice(0, 50).map((row) => {
                const pitcherTeam = getPitcherTeamForBatter(row, pitchers);
                return (
                  <article key={`m-${row.rank}-${row.player}`} className="rounded-xl border border-slate-100 overflow-hidden shadow-sm bg-white">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-black text-slate-300">#{row.rank}</span>
                        <span className="font-black text-slate-900 text-sm truncate">{row.player}</span>
                      </div>
                      <PropScoreBadge score={row.bestMatchupScore} />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-slate-100">
                      <TeamLogoText team={row.team} size={13} />
                      <span className="text-slate-300">vs</span>
                      <TeamLogoText team={pitcherTeam} size={13} />
                      <span className="text-slate-500 truncate">{row.opposingPitcher}</span>
                    </div>
                    <div className="grid grid-cols-4 divide-x divide-slate-100 text-center text-[10px]">
                      <div className="bg-sky-50/60 px-1 py-2">
                        <div className="text-[9px] font-black uppercase tracking-wide text-sky-500 mb-1">xBA</div>
                        <div className="font-black text-slate-800">{row.xba != null ? row.xba.toFixed(3) : "—"}</div>
                      </div>
                      <div className="bg-sky-50/60 px-1 py-2">
                        <div className="text-[9px] font-black uppercase tracking-wide text-sky-500 mb-1">Bat Score</div>
                        <div className="font-black text-slate-800">{formatPropNumber(row.batterPowerScore)}</div>
                      </div>
                      <div className="bg-rose-50/60 px-1 py-2">
                        <div className="text-[9px] font-black uppercase tracking-wide text-rose-500 mb-1">Pitch Score</div>
                        <div className="font-black text-slate-800">{fmt(row.opposingPitcherHitsVs)}</div>
                      </div>
                      <div className="bg-violet-50/60 px-1 py-2">
                        <div className="text-[9px] font-black uppercase tracking-wide text-violet-500 mb-1">Edge</div>
                        <div><PropEdgeBadge score={row.bestMatchupScore} /></div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
