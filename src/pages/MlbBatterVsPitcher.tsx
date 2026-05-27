import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import {
  formatPropNumber,
  formatPropPercent,
  getBatterVsPitcherReason,
  getGameCount,
  getPitcherTeamForBatter,
  getPropEdgeTier,
  ModelSummaryHeader,
  PropEdgeBadge,
  PropScoreBadge,
  TeamLogoText,
} from "@/components/mlb/MlbPropModelComponents";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import type { PitcherVsBatterRow } from "@/pages/MlbHrProps";

type SortKey = "rank" | "player" | "team" | "opposingPitcher" | "bestMatchupScore" | "batterPowerScore" | "opposingPitcherHitsVs";
type SortDirection = "asc" | "desc";

const confidenceOptions = ["All tiers", "Strong", "Positive", "Watch", "Neutral"];

function sortRows(rows: PitcherVsBatterRow[], key: SortKey, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (typeof leftValue === "string" || typeof rightValue === "string") {
      return String(leftValue).localeCompare(String(rightValue)) * multiplier;
    }
    return (Number(leftValue) - Number(rightValue)) * multiplier;
  });
}

export default function MlbBatterVsPitcher() {
  const { batterVsPitcherRows, dashboard, games, loading, pitchers } = useMlbPropsData();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("All tiers");
  const [sortKey, setSortKey] = useState<SortKey>("bestMatchupScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  usePageSeo({
    title: "MLB Batter vs Pitcher Model Today - Joe Knows Ball",
    description: "MLB batter vs pitcher model for hit and total-base attackability using batter quality, xBA/contact indicators, pitcher vulnerability, and matchup scores.",
    path: "/mlb/batter-vs-pitcher",
  });

  const teams = useMemo(() => Array.from(new Set(batterVsPitcherRows.map((row) => row.team))).sort(), [batterVsPitcherRows]);
  const gameOptions = useMemo(() => games.map((game) => ({ value: game.gameKey, label: game.matchup })), [games]);
  const bestScore = batterVsPitcherRows[0]?.bestMatchupScore ?? null;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = batterVsPitcherRows.filter((row) => {
      if (teamFilter !== "all" && row.team !== teamFilter) return false;
      if (gameFilter !== "all" && row.gameKey !== gameFilter) return false;
      if (confidenceFilter !== "All tiers" && getPropEdgeTier(row.bestMatchupScore).label !== confidenceFilter) return false;
      if (!query) return true;
      return [row.player, row.team, row.opposingPitcher, row.park, row.gameKey].some((value) => value.toLowerCase().includes(query));
    });
    return sortRows(rows, sortKey, sortDirection);
  }, [batterVsPitcherRows, confidenceFilter, gameFilter, search, sortDirection, sortKey, teamFilter]);

  const topRows = filteredRows.slice(0, 5);

  const handleSort = (key: SortKey) => {
    setSortDirection((current) => (sortKey === key ? (current === "asc" ? "desc" : "asc") : key === "player" || key === "team" || key === "opposingPitcher" ? "asc" : "desc"));
    setSortKey(key);
  };

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
          />

          <section className="grid gap-3 lg:grid-cols-5">
            {topRows.map((row) => {
              const pitcherTeam = getPitcherTeamForBatter(row, pitchers);
              return (
                <article key={`${row.rank}-${row.player}-${row.opposingPitcher}`} className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">#{row.rank}</div>
                      <div className="mt-1 truncate text-sm font-black text-slate-950">{row.player}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <TeamLogoText team={row.team} size={18} />
                        <span className="text-xs text-slate-300">vs</span>
                        <TeamLogoText team={pitcherTeam} size={18} />
                      </div>
                    </div>
                    <PropScoreBadge score={row.bestMatchupScore} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <PropEdgeBadge score={row.bestMatchupScore} />
                    <span className="text-[11px] font-semibold text-slate-500">{getBatterVsPitcherReason(row)}</span>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid gap-2 md:grid-cols-4">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search batter, pitcher, park"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white"
              />
              <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
                <option value="all">All teams</option>
                {teams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
              <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
                <option value="all">All games</option>
                {gameOptions.map((game) => <option key={game.value} value={game.value}>{game.label}</option>)}
              </select>
              <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">
                {confidenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>{loading ? "Loading model data" : `${filteredRows.length} batter matchups shown`}</span>
              <Link to="/mlb" className="font-bold text-sky-700 hover:underline">Back to MLB dashboard</Link>
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[1120px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    {[
                      ["rank", "Rank"],
                      ["player", "Batter"],
                      ["team", "Team"],
                      ["opposingPitcher", "Opposing Pitcher"],
                      ["bestMatchupScore", "Hit/Attack"],
                      ["batterPowerScore", "Contact/xBA"],
                      ["opposingPitcherHitsVs", "Pitcher Attack"],
                    ].map(([key, label]) => (
                      <th key={key} className="border-b border-slate-200 bg-white px-3 py-2 font-bold">
                        <button type="button" onClick={() => handleSort(key as SortKey)} className="hover:text-slate-950">
                          {label}{sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      </th>
                    ))}
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Matchup</th>
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Split Indicator</th>
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Lineup Spot</th>
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Confidence</th>
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Key Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const pitcherTeam = getPitcherTeamForBatter(row, pitchers);
                    return (
                      <tr key={`${row.rank}-${row.player}-${row.team}-${row.opposingPitcher}`} className="odd:bg-white even:bg-slate-50/70">
                        <td className="border-b border-slate-100 px-3 py-2 font-black text-slate-400">#{row.rank}</td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <div className="font-black text-slate-950">{row.player}</div>
                          <div className="text-xs text-slate-500">{row.park}</div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2"><TeamLogoText team={row.team} /></td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <div className="font-semibold text-slate-800">{row.opposingPitcher}</div>
                          <TeamLogoText team={pitcherTeam} size={18} />
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2"><PropScoreBadge score={row.bestMatchupScore} /></td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <div className="font-bold text-slate-900">{formatPropNumber(row.batterPowerScore)}</div>
                          <div className="text-xs text-slate-500">xBA {formatPropNumber(row.xba, 3)} / HH {formatPropPercent(row.hardHitRate)}</div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2"><PropScoreBadge score={row.opposingPitcherHitsVs} /></td>
                        <td className="border-b border-slate-100 px-3 py-2">{row.gameKey}</td>
                        <td className="border-b border-slate-100 px-3 py-2">{row.angleTags[0] || "Current split"}</td>
                        <td className="border-b border-slate-100 px-3 py-2">Not provided</td>
                        <td className="border-b border-slate-100 px-3 py-2"><PropEdgeBadge score={row.bestMatchupScore} /></td>
                        <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-700">{getBatterVsPitcherReason(row)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2 p-3 md:hidden">
              {filteredRows.slice(0, 30).map((row) => {
                const pitcherTeam = getPitcherTeamForBatter(row, pitchers);
                return (
                  <article key={`mobile-${row.rank}-${row.player}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-400">#{row.rank}</div>
                        <div className="truncate text-sm font-black text-slate-950">{row.player}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5"><TeamLogoText team={row.team} /><span className="text-xs text-slate-300">vs</span><TeamLogoText team={pitcherTeam} /></div>
                      </div>
                      <PropScoreBadge score={row.bestMatchupScore} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <PropEdgeBadge score={row.bestMatchupScore} />
                      <span className="font-semibold text-slate-600">{getBatterVsPitcherReason(row)}</span>
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
