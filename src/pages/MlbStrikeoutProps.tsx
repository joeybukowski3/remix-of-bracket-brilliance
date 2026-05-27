import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import {
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
import type { PitcherStrikeoutTeamRow } from "@/pages/MlbHrProps";

type SortKey = "rank" | "pitcher" | "team" | "opponent" | "strikeoutMatchupScore" | "pitcherKSkillScore" | "opponentTeamStrikeoutScore" | "pitcherKRate" | "pitcherWhiffRate" | "pitcherKVs" | "opponentTeamKRate" | "opponentTeamWhiffRate";
type SortDirection = "asc" | "desc";

const confidenceOptions = ["All tiers", "Strong", "Positive", "Watch", "Neutral"];

function sortRows(rows: PitcherStrikeoutTeamRow[], key: SortKey, dir: SortDirection) {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * m;
    return (Number(av) - Number(bv)) * m;
  });
}

function fmt(v: number | null | undefined, digits = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function GradCell({ value, display, avg, spread, higherBetter = true }: {
  value: number | null | undefined; display: string; avg: number; spread: number; higherBetter?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return <span className="text-[11px] text-slate-300">—</span>;
  const d = ((value - avg) / spread) * (higherBetter ? 1 : -1);
  const c = Math.max(-1, Math.min(1, d));
  const abs = Math.abs(c);
  let bg = "rgba(148,163,184,0.13)"; let col = "#475569";
  if (c > 0.15) { const op = Math.min(0.08 + abs * 0.36, 0.46); bg = `rgba(22,163,74,${op})`; col = abs > 0.5 ? "#15803d" : "#166534"; }
  else if (c < -0.15) { const op = Math.min(0.06 + abs * 0.28, 0.38); bg = `rgba(59,130,246,${op})`; col = abs > 0.5 ? "#1d4ed8" : "#1e40af"; }
  return <span className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ backgroundColor: bg, color: col }}>{display}</span>;
}

function StatScorePill({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-400">—</span>;
  const v = Number(value);
  let bg = "rgba(148,163,184,0.20)"; let col = "#475569";
  if (v >= 65) { bg = "#16a34a"; col = "#fff"; }
  else if (v >= 58) { bg = "rgba(22,163,74,0.18)"; col = "#15803d"; }
  else if (v < 50) { const op = Math.min(0.10 + (50 - v) / 50 * 0.30, 0.40); bg = `rgba(59,130,246,${op})`; col = "#1e40af"; }
  return <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums" style={{ backgroundColor: bg, color: col }}>{v.toFixed(1)}</span>;
}

function makeSortIndicator(active: boolean, dir: SortDirection) {
  return active ? (dir === "asc" ? " ↑" : " ↓") : "";
}

export default function MlbStrikeoutProps() {
  const { dashboard, games, loading, strikeoutDetailRows } = useMlbPropsData();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("All tiers");
  const [sortKey, setSortKey] = useState<SortKey>("strikeoutMatchupScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  usePageSeo({
    title: "MLB Strikeout Prop Model Today - Joe Knows Ball",
    description: "MLB strikeout prop model rankings using pitcher K skill, whiff rate, opponent team strikeout tendency, contact quality, and matchup edge scores.",
    path: "/mlb/strikeout-props",
  });

  const teams = useMemo(() => Array.from(new Set(strikeoutDetailRows.flatMap((r) => [r.team, r.opponent]))).sort(), [strikeoutDetailRows]);
  const gameOptions = useMemo(() => games.map((g) => ({ value: g.gameKey, label: g.matchup })), [games]);
  const bestScore = strikeoutDetailRows[0]?.strikeoutMatchupScore ?? null;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = strikeoutDetailRows.filter((r) => {
      if (teamFilter !== "all" && r.team !== teamFilter && r.opponent !== teamFilter) return false;
      if (gameFilter !== "all" && r.gameKey !== gameFilter) return false;
      if (confidenceFilter !== "All tiers" && getPropEdgeTier(r.strikeoutMatchupScore).label !== confidenceFilter) return false;
      if (!q) return true;
      return [r.pitcher, r.team, r.opponent, r.park, r.whyItRanksWell].some((v) => v.toLowerCase().includes(q));
    });
    return sortRows(rows, sortKey, sortDir);
  }, [strikeoutDetailRows, confidenceFilter, gameFilter, search, sortDir, sortKey, teamFilter]);

  const handleSort = (key: SortKey) => {
    setSortDir((cur) => (sortKey === key ? (cur === "asc" ? "desc" : "asc") : ["pitcher", "team", "opponent"].includes(key) ? "asc" : "desc"));
    setSortKey(key);
  };

  const SortTh = ({ k, label, extra = "" }: { k: SortKey; label: string; extra?: string }) => (
    <th className={`border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap ${extra}`}>
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
            eyebrow="Pitcher prop model"
            title="MLB Strikeout Prop Model"
            description="Ranks probable starters by strikeout skill, whiff profile, and opponent lineup strikeout tendency using the current MLB props data."
            generatedAt={dashboard?.generatedAt}
            gamesCount={getGameCount(games)}
            rowsCount={strikeoutDetailRows.length}
            bestScore={bestScore}
            siblingLinks={[
              { label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" },
              { label: "Hit Props", to: "/mlb/batter-vs-pitcher", icon: "⚔️", color: "#8b5cf6" },
              { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" },
            ]}
          />

          {/* Filters */}
          <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid gap-2 sm:grid-cols-4">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pitcher, team, park" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white" />
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
              <span>{loading ? "Loading…" : `${filteredRows.length} pitchers shown`}</span>
              <Link to="/mlb" className="font-bold text-sky-700 hover:underline">Back to MLB</Link>
            </div>
          </section>

          {/* Table */}
          <section className="rounded-[20px] border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto rounded-xl border border-slate-200" style={{ WebkitOverflowScrolling: "touch" }}>
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 z-20">
                  <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    {/* Sticky: Rank */}
                    <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 font-black w-8 text-left">
                      <button type="button" onClick={() => handleSort("rank")} className="hover:text-slate-900">#{makeSortIndicator(sortKey === "rank", sortDir)}</button>
                    </th>
                    {/* Sticky: Name */}
                    <th className="sticky left-8 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 font-black whitespace-nowrap min-w-[130px] text-left">
                      <button type="button" onClick={() => handleSort("pitcher")} className="hover:text-slate-900">Pitcher{makeSortIndicator(sortKey === "pitcher", sortDir)}</button>
                    </th>
                    <SortTh k="strikeoutMatchupScore" label="K Score" />
                    <SortTh k="pitcherKRate" label="K%" />
                    <SortTh k="pitcherWhiffRate" label="Whiff%" />
                    <SortTh k="pitcherKVs" label="K VS Score" />
                    <SortTh k="pitcherKSkillScore" label="Pitcher K Score" />
                    <SortTh k="opponentTeamKRate" label="Opp K%" />
                    <SortTh k="opponentTeamWhiffRate" label="Opp Whiff%" />
                    <SortTh k="opponentTeamStrikeoutScore" label="Opp K Score" />
                    <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 font-black uppercase tracking-widest text-left whitespace-nowrap">Edge</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? filteredRows.map((row, i) => {
                    const bg = i % 2 === 0 ? "bg-white" : "bg-slate-50/70";
                    const sbg = i % 2 === 0 ? "bg-white" : "bg-slate-50";
                    return (
                      <tr key={`${row.rank}-${row.pitcher}-${row.team}`} className={bg}>
                        <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-2 py-1 text-[10px] font-black text-slate-400 ${sbg}`}>{row.rank}</td>
                        <td className={`sticky left-8 z-10 border-b border-r border-slate-100 px-2 py-1 ${sbg}`}>
                          <div className="flex items-center gap-1.5">
                            <TeamLogoText team={row.team} size={16} />
                            <span className="font-semibold text-slate-900 whitespace-nowrap text-[11px]">{row.pitcher}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">{row.team} vs {row.opponent}</div>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.strikeoutMatchupScore} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><GradCell value={row.pitcherKRate} display={`${fmt(row.pitcherKRate)}%`} avg={22} spread={5} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><GradCell value={row.pitcherWhiffRate} display={`${fmt(row.pitcherWhiffRate)}%`} avg={25} spread={5} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKVs} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKSkillScore} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><GradCell value={row.opponentTeamKRate} display={`${fmt(row.opponentTeamKRate)}%`} avg={22} spread={5} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><GradCell value={row.opponentTeamWhiffRate} display={`${fmt(row.opponentTeamWhiffRate)}%`} avg={25} spread={5} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.opponentTeamStrikeoutScore} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><PropEdgeBadge score={row.strikeoutMatchupScore} /></td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={11} className="px-3 py-6 text-center text-sm text-slate-500">No pitchers match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-2 p-3 md:hidden">
              {filteredRows.slice(0, 50).map((row) => (
                <article key={`m-${row.rank}-${row.pitcher}`} className="rounded-xl border border-slate-100 overflow-hidden shadow-sm bg-white">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-black text-slate-300">#{row.rank}</span>
                      <span className="font-black text-slate-900 text-sm truncate">{row.pitcher}</span>
                    </div>
                    <PropScoreBadge score={row.strikeoutMatchupScore} />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-slate-100">
                    <TeamLogoText team={row.team} size={13} />
                    <span className="text-slate-300">vs</span>
                    <TeamLogoText team={row.opponent} size={13} />
                  </div>
                  <div className="grid grid-cols-4 divide-x divide-slate-100 text-center text-[10px]">
                    <div className="bg-sky-50/60 px-1 py-2">
                      <div className="text-[9px] font-black uppercase tracking-wide text-sky-500 mb-1">K%</div>
                      <div className="font-black text-slate-800">{fmt(row.pitcherKRate)}%</div>
                    </div>
                    <div className="bg-sky-50/60 px-1 py-2">
                      <div className="text-[9px] font-black uppercase tracking-wide text-sky-500 mb-1">Whiff%</div>
                      <div className="font-black text-slate-800">{fmt(row.pitcherWhiffRate)}%</div>
                    </div>
                    <div className="bg-rose-50/60 px-1 py-2">
                      <div className="text-[9px] font-black uppercase tracking-wide text-rose-500 mb-1">Opp K%</div>
                      <div className="font-black text-slate-800">{fmt(row.opponentTeamKRate)}%</div>
                    </div>
                    <div className="bg-violet-50/60 px-1 py-2">
                      <div className="text-[9px] font-black uppercase tracking-wide text-violet-500 mb-1">K Score</div>
                      <div className="font-black text-slate-800">{fmt(row.strikeoutMatchupScore)}</div>
                    </div>
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
