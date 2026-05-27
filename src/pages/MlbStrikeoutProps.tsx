import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import {
  formatPropNumber,
  formatPropPercent,
  getGameCount,
  getPropEdgeTier,
  getStrikeoutReason,
  ModelSummaryHeader,
  PropEdgeBadge,
  PropScoreBadge,
  TeamLogoText,
} from "@/components/mlb/MlbPropModelComponents";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import { cn } from "@/lib/utils";
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

type SortKey = "rank" | "pitcher" | "team" | "opponent" | "strikeoutMatchupScore" | "pitcherKSkillScore" | "opponentTeamStrikeoutScore";
type SortDirection = "asc" | "desc";

const confidenceOptions = ["All tiers", "Strong", "Positive", "Watch", "Neutral"];

function sortRows(rows: PitcherStrikeoutTeamRow[], key: SortKey, direction: SortDirection) {
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

export default function MlbStrikeoutProps() {
  const { dashboard, games, loading, strikeoutDetailRows } = useMlbPropsData();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("All tiers");
  const [sortKey, setSortKey] = useState<SortKey>("strikeoutMatchupScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  usePageSeo({
    title: "MLB Strikeout Prop Model Today - Joe Knows Ball",
    description: "MLB strikeout prop model rankings using pitcher K skill, whiff rate, opponent team strikeout tendency, contact quality, and matchup edge scores.",
    path: "/mlb/strikeout-props",
  });

  const teams = useMemo(() => Array.from(new Set(strikeoutDetailRows.flatMap((row) => [row.team, row.opponent]))).sort(), [strikeoutDetailRows]);
  const gameOptions = useMemo(() => games.map((game) => ({ value: game.gameKey, label: game.matchup })), [games]);
  const bestScore = strikeoutDetailRows[0]?.strikeoutMatchupScore ?? null;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = strikeoutDetailRows.filter((row) => {
      if (teamFilter !== "all" && row.team !== teamFilter && row.opponent !== teamFilter) return false;
      if (gameFilter !== "all" && row.gameKey !== gameFilter) return false;
      if (confidenceFilter !== "All tiers" && getPropEdgeTier(row.strikeoutMatchupScore).label !== confidenceFilter) return false;
      if (!query) return true;
      return [row.pitcher, row.team, row.opponent, row.park, row.whyItRanksWell].some((value) => value.toLowerCase().includes(query));
    });
    return sortRows(rows, sortKey, sortDirection);
  }, [confidenceFilter, gameFilter, search, sortDirection, sortKey, strikeoutDetailRows, teamFilter]);

  const topRows = filteredRows.slice(0, 5);

  const handleSort = (key: SortKey) => {
    setSortDirection((current) => (sortKey === key ? (current === "asc" ? "desc" : "asc") : key === "pitcher" || key === "team" || key === "opponent" ? "asc" : "desc"));
    setSortKey(key);
  };

  return (
    <SiteShell>
      <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
        <div className="site-container space-y-4">
          <ModelSummaryHeader
            eyebrow="Pitcher prop model"
            title="MLB Strikeout Prop Model"
            description="Ranks probable starters by strikeout skill, whiff profile, and opponent lineup strikeout tendency using the current MLB props data."
            generatedAt={dashboard?.generatedAt}
            gamesCount={getGameCount(games)}
            rowsCount={strikeoutDetailRows.length}
            bestScore={bestScore}
          />

          <section className="grid gap-3 lg:grid-cols-5">
            {topRows.map((row) => (
              <article key={`${row.rank}-${row.pitcher}-${row.opponent}`} className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">#{row.rank}</div>
                    <div className="mt-1 truncate text-sm font-black text-slate-950">{row.pitcher}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <TeamLogoText team={row.team} size={18} />
                      <span className="text-xs text-slate-300">vs</span>
                      <TeamLogoText team={row.opponent} size={18} />
                    </div>
                  </div>
                  <PropScoreBadge score={row.strikeoutMatchupScore} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <PropEdgeBadge score={row.strikeoutMatchupScore} />
                  <span className="text-[11px] font-semibold text-slate-500">{getStrikeoutReason(row)}</span>
                </div>
              </article>
            ))}
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid gap-2 md:grid-cols-4">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search pitcher, team, park"
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
              <span>{loading ? "Loading model data" : `${filteredRows.length} pitchers shown`}</span>
              <Link to="/mlb" className="font-bold text-sky-700 hover:underline">Back to MLB dashboard</Link>
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-200 bg-white shadow-sm">
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[1080px] border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    {[
                      ["rank", "Rank"],
                      ["pitcher", "Pitcher"],
                      ["team", "Team"],
                      ["opponent", "Opponent"],
                      ["strikeoutMatchupScore", "K Edge"],
                      ["pitcherKSkillScore", "Pitcher K"],
                      ["opponentTeamStrikeoutScore", "Opp K/Whiff"],
                    ].map(([key, label]) => (
                      <th key={key} className="border-b border-slate-200 bg-white px-3 py-2 font-bold">
                        <button type="button" onClick={() => handleSort(key as SortKey)} className="hover:text-slate-950">
                          {label}{sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      </th>
                    ))}
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Recent K Form</th>
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Workload</th>
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Confidence</th>
                    <th className="border-b border-slate-200 bg-white px-3 py-2 font-bold">Key Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={`${row.rank}-${row.pitcher}-${row.team}-${row.opponent}`} className="odd:bg-white even:bg-slate-50/70">
                      <td className="border-b border-slate-100 px-3 py-2 font-black text-slate-400">#{row.rank}</td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        <div className="font-black text-slate-950">{row.pitcher}</div>
                        <div className="text-xs text-slate-500">{row.park}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2"><TeamLogoText team={row.team} /></td>
                      <td className="border-b border-slate-100 px-3 py-2"><TeamLogoText team={row.opponent} /></td>
                      <td className="border-b border-slate-100 px-3 py-2"><PropScoreBadge score={row.strikeoutMatchupScore} /></td>
                      <td className="border-b border-slate-100 px-3 py-2">{formatPropNumber(row.pitcherKSkillScore)}</td>
                      <td className="border-b border-slate-100 px-3 py-2">
                        <div className="font-bold text-slate-900">{formatPropNumber(row.opponentTeamStrikeoutScore)}</div>
                        <div className="text-xs text-slate-500">K {formatPropPercent(row.opponentTeamKRate)} / Whiff {formatPropPercent(row.opponentTeamWhiffRate)}</div>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-2">K {formatPropPercent(row.pitcherKRate)} / Whiff {formatPropPercent(row.pitcherWhiffRate)}</td>
                      <td className="border-b border-slate-100 px-3 py-2">Probable SP</td>
                      <td className="border-b border-slate-100 px-3 py-2"><PropEdgeBadge score={row.strikeoutMatchupScore} /></td>
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-700">{getStrikeoutReason(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2 p-3 md:hidden">
              {filteredRows.slice(0, 20).map((row) => (
                <article key={`mobile-${row.rank}-${row.pitcher}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-400">#{row.rank}</div>
                      <div className="truncate text-sm font-black text-slate-950">{row.pitcher}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5"><TeamLogoText team={row.team} /><span className="text-xs text-slate-300">vs</span><TeamLogoText team={row.opponent} /></div>
                    </div>
                    <PropScoreBadge score={row.strikeoutMatchupScore} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <PropEdgeBadge score={row.strikeoutMatchupScore} />
                    <span className="font-semibold text-slate-600">{getStrikeoutReason(row)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
