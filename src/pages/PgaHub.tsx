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
const PR_WEIGHTS = {
  sgTotal:          0.28,
  sgApp:            0.20,
  sgPutt:           0.15,
  trendRank:        0.13, // inverted — lower rank = better
  sgAtG:            0.10,
  bogeyAvoidance:   0.09,
  birdieBogeyRatio: 0.05,
};

type PowerRankRow = RawPlayerStat & { powerScore: number; powerRank: number };

function percentile(value: number, sorted: number[]): number {
  if (!sorted.length) return 50;
  return (sorted.filter((v) => v < value).length / sorted.length) * 100;
}

function buildPowerRankings(players: RawPlayerStat[]): PowerRankRow[] {
  if (!players.length) return [];
  const asc = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const sT = asc(players.map((p) => p.sgTotal));
  const sA = asc(players.map((p) => p.sgApp));
  const sP = asc(players.map((p) => p.sgPutt));
  const sG = asc(players.map((p) => p.sgAtG));
  const sB = asc(players.map((p) => p.bogeyAvoidance));
  const sBr = asc(players.map((p) => p.birdieBogeyRatio));
  const trendPlayers = players.filter((p) => p.trendRank != null);
  const sR = asc(trendPlayers.map((p) => p.trendRank!));

  const scored = players.map((p) => {
    const tPct = p.trendRank != null ? 100 - percentile(p.trendRank, sR) : 50;
    const powerScore =
      percentile(p.sgTotal, sT)         * PR_WEIGHTS.sgTotal +
      percentile(p.sgApp, sA)           * PR_WEIGHTS.sgApp +
      percentile(p.sgPutt, sP)          * PR_WEIGHTS.sgPutt +
      tPct                              * PR_WEIGHTS.trendRank +
      percentile(p.sgAtG, sG)           * PR_WEIGHTS.sgAtG +
      percentile(p.bogeyAvoidance, sB)  * PR_WEIGHTS.bogeyAvoidance +
      percentile(p.birdieBogeyRatio, sBr) * PR_WEIGHTS.birdieBogeyRatio;
    return { ...p, powerScore };
  });
  return scored.sort((a, b) => b.powerScore - a.powerScore).map((r, i) => ({ ...r, powerRank: i + 1 }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatBadge({ value, avg, spread, fmt }: { value: number; avg: number; spread: number; fmt: (v: number) => string }) {
  const d = (value - avg) / spread;
  const c = Math.max(-1, Math.min(1, d));
  const abs = Math.abs(c);
  let bg = "rgba(148,163,184,0.13)"; let col = "#475569";
  if (c > 0.2)  { bg = `rgba(22,163,74,${Math.min(0.08+abs*0.38,0.46)})`; col = abs>0.5?"#15803d":"#166534"; }
  if (c < -0.2) { bg = `rgba(59,130,246,${Math.min(0.06+abs*0.28,0.38)})`; col = abs>0.5?"#1d4ed8":"#1e40af"; }
  return <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ backgroundColor: bg, color: col }}>{fmt(value)}</span>;
}

// ─── Tournament Hero Card ─────────────────────────────────────────────────────
function TournamentHeroCard({ entry, isActive }: { entry: PgaScheduleFeedEntry; isActive: boolean }) {
  const hasData = Boolean(entry.dataFile);
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${isActive ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      {isActive && (
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white uppercase tracking-widest">● Live Now</span>
      )}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{entry.dateLabel}</div>
        <div className="text-base font-black text-slate-900 leading-tight">{entry.shortName || entry.name}</div>
        <div className="text-xs text-slate-500 mt-0.5">{entry.courseName} · {entry.location}</div>
      </div>
      <div className="flex flex-wrap gap-2 mt-1">
        {hasData ? (
          <Link to={`/pga/${entry.slug}/model`} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">View Model →</Link>
        ) : (
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400">Model coming soon</span>
        )}
        {hasData && (
          <Link to={`/pga/${entry.slug}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Picks & Best Bets</Link>
        )}
      </div>
    </div>
  );
}

// ─── Desktop Sidebar Schedule ─────────────────────────────────────────────────
function ScheduleSidebar({ schedule, current }: { schedule: PgaScheduleFeedEntry[]; current: PgaScheduleFeedEntry | null }) {
  const [showPrevious, setShowPrevious] = useState(false);

  const upcoming = useMemo(
    () => [...schedule].filter((e) => e.status === "upcoming").sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [schedule],
  );
  const previous = useMemo(
    () => [...schedule].filter((e) => e.status === "complete").sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [schedule],
  );

  return (
    <aside className="hidden lg:block w-64 shrink-0">
      <div className="sticky top-4 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="bg-slate-900 px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Schedule</div>
          <div className="text-sm font-bold text-white mt-0.5">2026 PGA Tour</div>
        </div>
        <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
          {upcoming.map((e) => {
            const isCurrent = e.id === current?.id;
            const hasData = Boolean(e.dataFile);
            return (
              <div key={e.id} className={`px-3 py-2.5 ${isCurrent ? "bg-emerald-50" : ""}`}>
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    {isCurrent && <span className="inline-block rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-white uppercase mb-0.5">Now</span>}
                    <div className={`text-[12px] font-semibold leading-tight ${isCurrent ? "text-emerald-800" : "text-slate-800"}`}>{e.shortName || e.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{e.dateLabel}</div>
                  </div>
                  {hasData && (
                    <Link to={`/pga/${e.slug}/model`} className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700">Model</Link>
                  )}
                </div>
              </div>
            );
          })}

          {/* Previous tournaments toggle */}
          <div className="px-3 py-2">
            <button
              onClick={() => setShowPrevious((v) => !v)}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              {showPrevious ? "▲" : "▼"} Previous tournaments ({previous.length})
            </button>
            {showPrevious && (
              <div className="mt-2 space-y-1">
                {previous.map((e) => (
                  <div key={e.id} className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>{e.shortName || e.name}</span>
                    {e.winner && <span className="text-[10px] text-slate-400 truncate ml-1">{e.winner}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
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
  const [showPreviousMobile, setShowPreviousMobile] = useState(false);

  const { active, current } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);

  // Mobile: just the current/next single tournament
  const mobileHeroTournament = useMemo(() => {
    const sorted = [...schedule]
      .filter((e) => e.status === "upcoming")
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    return active ?? sorted[0] ?? null;
  }, [schedule, active]);

  // Previous tournaments for mobile
  const previousTournaments = useMemo(
    () => [...schedule].filter((e) => e.status === "complete").sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [schedule],
  );

  const powerRankings = useMemo(() => buildPowerRankings(playerStats), [playerStats]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return powerRankings;
    return powerRankings.filter((r) => r.player.toLowerCase().includes(q));
  }, [powerRankings, search]);

  const fmtScore = (v: number) => v.toFixed(1);
  const fmtPct = (v: number) => `${Math.round(v)}th`;

  // Precompute percentile ranks for display
  const pctRanks = useMemo(() => {
    if (!powerRankings.length) return new Map<string, { sgTotal: number; sgApp: number; sgPutt: number; sgAtG: number }>();
    const asc = (arr: number[]) => [...arr].sort((a, b) => a - b);
    const sT = asc(powerRankings.map((p) => p.sgTotal));
    const sA = asc(powerRankings.map((p) => p.sgApp));
    const sP = asc(powerRankings.map((p) => p.sgPutt));
    const sG = asc(powerRankings.map((p) => p.sgAtG));
    return new Map(powerRankings.map((p) => [p.player, {
      sgTotal: percentile(p.sgTotal, sT),
      sgApp:   percentile(p.sgApp,   sA),
      sgPutt:  percentile(p.sgPutt,  sP),
      sgAtG:   percentile(p.sgAtG,   sG),
    }]));
  }, [powerRankings]);

  return (
    <SiteShell>
      <SportsbookBar />

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-400">Joe Knows Ball</div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">⛳ PGA Power Rankings</h1>
          <p className="mt-1 text-sm text-slate-300">Overall model across all players · Click a tournament to view the field-filtered model</p>

          {/* Mobile: single current tournament card */}
          {mobileHeroTournament && (
            <div className="mt-5 lg:hidden">
              <TournamentHeroCard entry={mobileHeroTournament} isActive={active?.id === mobileHeroTournament.id} />
              {/* Previous tournaments link */}
              <div className="mt-3">
                <button
                  onClick={() => setShowPreviousMobile((v) => !v)}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  {showPreviousMobile ? "▲" : "▼"} Previous tournaments ({previousTournaments.length})
                </button>
                {showPreviousMobile && (
                  <div className="mt-2 space-y-1.5">
                    {previousTournaments.map((e) => (
                      <div key={e.id} className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
                        <div>
                          <div className="text-xs font-semibold text-white">{e.shortName || e.name}</div>
                          {e.winner && <div className="text-[10px] text-slate-400">W: {e.winner}</div>}
                        </div>
                        {e.dataFile && (
                          <Link to={`/pga/${e.slug}`} className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300">View →</Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Body: sidebar (desktop) + main content */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:flex lg:gap-6">

        {/* Desktop sidebar */}
        <ScheduleSidebar schedule={schedule} current={current} />

        {/* Main content */}
        <div className="min-w-0 flex-1">
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
                    <th className="sticky left-0 z-30 bg-slate-50 px-2 py-2 w-8">#</th>
                    <th className="sticky left-8 z-30 bg-slate-50 px-2 py-2 min-w-[140px]">Player</th>
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
                    const sbg = i % 2 === 0 ? "bg-white" : "bg-slate-50";
                    const pct = pctRanks.get(row.player);
                    return (
                      <tr key={row.player} className={`${sbg} hover:bg-emerald-50/30`}>
                        <td className={`sticky left-0 z-20 border-b border-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-400 ${sbg}`}>{row.powerRank}</td>
                        <td className={`sticky left-8 z-20 border-b border-r border-slate-100 px-2 py-1.5 font-semibold text-slate-900 whitespace-nowrap ${sbg}`}>{row.player}</td>
                        <td className="border-b border-slate-100 px-2 py-1.5">
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums"
                            style={{ backgroundColor: row.powerScore >= 65 ? "#16a34a" : row.powerScore >= 50 ? "rgba(22,163,74,0.15)" : "rgba(148,163,184,0.2)", color: row.powerScore >= 65 ? "#fff" : row.powerScore >= 50 ? "#15803d" : "#475569" }}>
                            {fmtScore(row.powerScore)}
                          </span>
                        </td>
                        {pct ? (
                          <>
                            <td className="border-b border-slate-100 px-2 py-1.5"><StatBadge value={pct.sgTotal} avg={50} spread={25} fmt={fmtPct} /></td>
                            <td className="border-b border-slate-100 px-2 py-1.5"><StatBadge value={pct.sgApp}   avg={50} spread={25} fmt={fmtPct} /></td>
                            <td className="border-b border-slate-100 px-2 py-1.5"><StatBadge value={pct.sgPutt}  avg={50} spread={25} fmt={fmtPct} /></td>
                            <td className="border-b border-slate-100 px-2 py-1.5"><StatBadge value={pct.sgAtG}   avg={50} spread={25} fmt={fmtPct} /></td>
                          </>
                        ) : (<><td /><td /><td /><td /></>)}
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
            Power score = weighted percentile across SG Total (28%), SG Approach (20%), SG Putting (15%), Recent Form (13%), SG Around Green (10%), Bogey Avoidance (9%), Birdie Ratio (5%).
          </p>
        </div>
      </div>
    </SiteShell>
  );
}
