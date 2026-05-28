import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import SportsbookBar from "@/components/SportsbookBar";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  type PgaScheduleFeedEntry,
  type RawPlayerStat,
  getCurrentAndNextEvents,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";

// ─── Power Ranking Formula ────────────────────────────────────────────────────
// Weights: sgTotal highest, then approach, putting, form (trendRank inverted),
// around green, bogey avoidance, birdie ratio
const PR_WEIGHTS = {
  sgTotal:         0.28,
  sgApp:           0.20,
  sgPutt:          0.15,
  trendRank:       0.13, // inverted — lower rank = better
  sgAtG:           0.10,
  bogeyAvoidance:  0.09,
  birdieBogeyRatio: 0.05,
};

type PowerRankRow = RawPlayerStat & { powerScore: number; powerRank: number };

function percentile(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 50;
  const below = sorted.filter((v) => v < value).length;
  return (below / sorted.length) * 100;
}

function buildPowerRankings(players: RawPlayerStat[]): PowerRankRow[] {
  if (!players.length) return [];

  const sortedSgTotal    = [...players.map((p) => p.sgTotal)].sort((a, b) => a - b);
  const sortedSgApp      = [...players.map((p) => p.sgApp)].sort((a, b) => a - b);
  const sortedSgPutt     = [...players.map((p) => p.sgPutt)].sort((a, b) => a - b);
  const sortedSgAtG      = [...players.map((p) => p.sgAtG)].sort((a, b) => a - b);
  const sortedBogey      = [...players.map((p) => p.bogeyAvoidance)].sort((a, b) => a - b);
  const sortedBirdie     = [...players.map((p) => p.birdieBogeyRatio)].sort((a, b) => a - b);
  const trendPlayers     = players.filter((p) => p.trendRank != null);
  const sortedTrendAsc   = [...trendPlayers.map((p) => p.trendRank!)].sort((a, b) => a - b);

  const scored = players.map((p) => {
    const trendPct = p.trendRank != null
      ? 100 - percentile(p.trendRank, sortedTrendAsc) // invert: lower rank = better
      : 50;

    const powerScore =
      percentile(p.sgTotal, sortedSgTotal)      * PR_WEIGHTS.sgTotal +
      percentile(p.sgApp, sortedSgApp)           * PR_WEIGHTS.sgApp +
      percentile(p.sgPutt, sortedSgPutt)         * PR_WEIGHTS.sgPutt +
      trendPct                                   * PR_WEIGHTS.trendRank +
      percentile(p.sgAtG, sortedSgAtG)           * PR_WEIGHTS.sgAtG +
      percentile(p.bogeyAvoidance, sortedBogey)  * PR_WEIGHTS.bogeyAvoidance +
      percentile(p.birdieBogeyRatio, sortedBirdie) * PR_WEIGHTS.birdieBogeyRatio;

    return { ...p, powerScore };
  });

  return scored
    .sort((a, b) => b.powerScore - a.powerScore)
    .map((row, i) => ({ ...row, powerRank: i + 1 }));
}

// ─── Stat Cell ────────────────────────────────────────────────────────────────
function StatBadge({ value, avg, spread, fmt }: {
  value: number; avg: number; spread: number; fmt: (v: number) => string;
}) {
  const d = (value - avg) / spread;
  const c = Math.max(-1, Math.min(1, d));
  const abs = Math.abs(c);
  let bg = "rgba(148,163,184,0.13)"; let col = "#475569";
  if (c > 0.2)  { bg = `rgba(22,163,74,${Math.min(0.08+abs*0.38,0.46)})`; col = abs>0.5?"#15803d":"#166534"; }
  if (c < -0.2) { bg = `rgba(59,130,246,${Math.min(0.06+abs*0.28,0.38)})`; col = abs>0.5?"#1d4ed8":"#1e40af"; }
  return <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ backgroundColor: bg, color: col }}>{fmt(value)}</span>;
}

// ─── Schedule Hero Cards ───────────────────────────────────────────────────────
function TournamentHeroCard({ entry, isActive }: { entry: PgaScheduleFeedEntry; isActive: boolean }) {
  const slug = entry.slug;
  const hasData = Boolean(entry.dataFile);

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${isActive ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      {isActive && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white uppercase tracking-widest">
          ● Live Now
        </span>
      )}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{entry.dateLabel}</div>
        <div className="text-base font-black text-slate-900 leading-tight">{entry.shortName || entry.name}</div>
        <div className="text-xs text-slate-500 mt-0.5">{entry.courseName} · {entry.location}</div>
      </div>
      <div className="flex flex-wrap gap-2 mt-1">
        {hasData ? (
          <Link
            to={`/pga/${slug}/model`}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
          >
            View Model →
          </Link>
        ) : (
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400">Model coming soon</span>
        )}
        {hasData && (
          <Link
            to={`/pga/${slug}`}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Picks & Best Bets
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PgaHub() {
  usePageSeo({
    title: "PGA Golf Power Rankings & Tournament Model",
    description: "Overall PGA Tour power rankings plus weekly tournament model picks, best bets, and course fits.",
    path: "/pga",
  });

  const { schedule, playerStats, loading } = usePgaHubData();
  const [search, setSearch] = useState("");

  const { active, current, next } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);

  // Upcoming hero cards: active/current + next 2
  const heroTournaments = useMemo(() => {
    const sorted = [...schedule]
      .filter((e) => e.status === "upcoming")
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (!sorted.length) return [];
    const first = sorted[0];
    return sorted.filter((e) => e.startDate <= sorted[Math.min(2, sorted.length - 1)].startDate).slice(0, 3);
  }, [schedule]);

  const powerRankings = useMemo(() => buildPowerRankings(playerStats), [playerStats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return powerRankings;
    return powerRankings.filter((r) => r.player.toLowerCase().includes(q));
  }, [powerRankings, search]);

  // Compute averages for stat badges
  const avgs = useMemo(() => {
    if (!playerStats.length) return null;
    const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((s, v) => s + (v-m)**2, 0) / arr.length);
    const sgTotal = playerStats.map((p) => p.sgTotal);
    const sgApp = playerStats.map((p) => p.sgApp);
    const sgPutt = playerStats.map((p) => p.sgPutt);
    const sgAtG = playerStats.map((p) => p.sgAtG);
    return {
      sgTotalAvg: mean(sgTotal), sgTotalStd: std(sgTotal, mean(sgTotal)),
      sgAppAvg: mean(sgApp), sgAppStd: std(sgApp, mean(sgApp)),
      sgPuttAvg: mean(sgPutt), sgPuttStd: std(sgPutt, mean(sgPutt)),
      sgAtGAvg: mean(sgAtG), sgAtGStd: std(sgAtG, mean(sgAtG)),
    };
  }, [playerStats]);

  const fmt1 = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);
  const fmtScore = (v: number) => v.toFixed(1);

  return (
    <SiteShell>
      <SportsbookBar />

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-400">Joe Knows Ball</div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">⛳ PGA Power Rankings</h1>
          <p className="mt-1 text-sm text-slate-300">Overall model across all players · Click a tournament below to view the field-filtered model</p>

          {/* Tournament hero cards */}
          {heroTournaments.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {heroTournaments.map((t) => (
                <TournamentHeroCard key={t.id} entry={t} isActive={active?.id === t.id} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">

        {/* Nav pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Link to="/pga/best-bets" className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-200">Best Bets</Link>
          <Link to="/pga/model" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">Featured Model</Link>
          <Link to="/pga/dfs" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">DFS Upload</Link>
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-emerald-400"
          />
        </div>

        {/* Rankings Table */}
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading rankings…</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="sticky left-0 z-20 bg-slate-50 px-2 py-2 w-8">#</th>
                  <th className="sticky left-8 z-20 bg-slate-50 px-2 py-2 min-w-[140px]">Player</th>
                  <th className="px-2 py-2 whitespace-nowrap">Score</th>
                  <th className="px-2 py-2 whitespace-nowrap">SG Total</th>
                  <th className="px-2 py-2 whitespace-nowrap">SG App</th>
                  <th className="px-2 py-2 whitespace-nowrap">SG Putt</th>
                  <th className="px-2 py-2 whitespace-nowrap">SG AtG</th>
                  <th className="px-2 py-2 whitespace-nowrap">Form</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const stickyBg = i % 2 === 0 ? "bg-white" : "bg-slate-50/60";
                  return (
                    <tr key={row.player} className={`${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"} hover:bg-emerald-50/30`}>
                      <td className={`sticky left-0 z-10 border-b border-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-400 ${stickyBg}`}>{row.powerRank}</td>
                      <td className={`sticky left-8 z-10 border-b border-r border-slate-100 px-2 py-1.5 font-semibold text-slate-900 whitespace-nowrap ${stickyBg}`}>{row.player}</td>
                      <td className="border-b border-slate-100 px-2 py-1.5">
                        <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums"
                          style={{ backgroundColor: row.powerScore >= 65 ? "#16a34a" : row.powerScore >= 50 ? "rgba(22,163,74,0.15)" : "rgba(148,163,184,0.2)", color: row.powerScore >= 65 ? "#fff" : row.powerScore >= 50 ? "#15803d" : "#475569" }}>
                          {fmtScore(row.powerScore)}
                        </span>
                      </td>
                      {avgs ? (
                        <>
                          <td className="border-b border-slate-100 px-2 py-1.5"><StatBadge value={row.sgTotal} avg={avgs.sgTotalAvg} spread={avgs.sgTotalStd} fmt={fmt1} /></td>
                          <td className="border-b border-slate-100 px-2 py-1.5"><StatBadge value={row.sgApp} avg={avgs.sgAppAvg} spread={avgs.sgAppStd} fmt={fmt1} /></td>
                          <td className="border-b border-slate-100 px-2 py-1.5"><StatBadge value={row.sgPutt} avg={avgs.sgPuttAvg} spread={avgs.sgPuttStd} fmt={fmt1} /></td>
                          <td className="border-b border-slate-100 px-2 py-1.5"><StatBadge value={row.sgAtG} avg={avgs.sgAtGAvg} spread={avgs.sgAtGStd} fmt={fmt1} /></td>
                        </>
                      ) : (
                        <><td /><td /><td /><td /></>
                      )}
                      <td className="border-b border-slate-100 px-2 py-1.5 text-[11px] text-slate-500 tabular-nums">{row.trendRank != null ? `#${row.trendRank}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && !loading && (
              <div className="py-10 text-center text-sm text-slate-400">No players match "{search}"</div>
            )}
          </div>
        )}

        <p className="mt-3 text-[11px] text-slate-400">
          Power score = weighted percentile rank across SG Total (28%), SG Approach (20%), SG Putting (15%), Recent Form (13%), SG Around Green (10%), Bogey Avoidance (9%), Birdie Ratio (5%).
        </p>
      </div>
    </SiteShell>
  );
}
