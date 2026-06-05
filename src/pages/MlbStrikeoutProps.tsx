import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import MlbNavHero from "@/components/mlb/MlbNavHero";
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
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  buildParkSidebarRows,
  getParkFactorTone,
  getWindArrow,
  TeamLogoBadge,
  type ParkSidebarRow,
  type PitcherStrikeoutTeamRow,
} from "@/pages/MlbHrProps";
import { cn } from "@/lib/utils";

const DASH = "—";

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
  if (v == null || !Number.isFinite(v)) return DASH;
  return v.toFixed(digits);
}

function GradCell({ value, display, avg, spread, higherBetter = true }: {
  value: number | null | undefined; display: string; avg: number; spread: number; higherBetter?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) return <span className="text-[11px] text-slate-300">{DASH}</span>;
  const d = ((value - avg) / spread) * (higherBetter ? 1 : -1);
  const c = Math.max(-1, Math.min(1, d));
  const abs = Math.abs(c);
  let bg = "rgba(148,163,184,0.13)"; let col = "#475569";
  if (c > 0.15) {
    if (abs > 0.75) { bg = "#16a34a"; col = "#fff"; }
    else if (abs > 0.45) { bg = "rgba(22,163,74,0.55)"; col = "#14532d"; }
    else { bg = "rgba(22,163,74,0.22)"; col = "#166534"; }
  } else if (c < -0.15) {
    if (abs > 0.75) { bg = "#3b82f6"; col = "#fff"; }
    else if (abs > 0.45) { bg = "rgba(59,130,246,0.50)"; col = "#1e3a8a"; }
    else { bg = "rgba(59,130,246,0.18)"; col = "#1e40af"; }
  }
  return <span className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ backgroundColor: bg, color: col }}>{display}</span>;
}

function StatScorePill({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-400">{DASH}</span>;
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

function getRoofLabel(r: string) {
  if (/open/i.test(r)) return "Open";
  if (/retractable/i.test(r)) return "Retractable";
  if (/dome|closed/i.test(r)) return "Roof";
  return r || "Unknown";
}

// Park factor tone inverted for K — lower run factor = better for pitchers
function getKParkTone(value: number) {
  if (value <= 0.93) return "bg-green-500 text-white";
  if (value <= 0.97) return "bg-green-200 text-green-900";
  if (value >= 1.10) return "bg-red-500 text-white";
  if (value >= 1.04) return "bg-red-200 text-red-900";
  return "bg-slate-200 text-slate-700";
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
    title: "MLB Strikeout Props Today 2026 — Pitcher K Model & Rankings | Joe Knows Ball",
    description: "Daily MLB strikeout prop rankings built from pitcher K rate, whiff rate, and opponent lineup strikeout tendency. Free advanced pitching model updated every day.",
    path: "/mlb/strikeout-props",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.joeknowsball.com/" },
          { "@type": "ListItem", position: 2, name: "MLB", item: "https://www.joeknowsball.com/mlb" },
          { "@type": "ListItem", position: 3, name: "Strikeout Props", item: "https://www.joeknowsball.com/mlb/strikeout-props" },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "How does the MLB strikeout prop model work?",
            acceptedAnswer: { "@type": "Answer", text: "The strikeout model scores pitchers by blending pitcher K rate, whiff rate, and historical K vs opponent stats with the opposing team's strikeout tendency and whiff rate." },
          },
        ],
      },
    ],
  });

  // Park sidebar — sorted low-to-high park factor (best for pitchers first)
  const parkRows = useMemo(() => {
    const rows = buildParkSidebarRows(games);
    return [...rows].sort((a, b) => a.parkFactor - b.parkFactor);
  }, [games]);

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

  if (loading) {
    return (
      <SiteShell>
        <main className="site-page bg-[#edf2f7] py-8">
          <div className="site-container text-center text-sm text-slate-500">Loading strikeout prop model…</div>
        </main>
      </SiteShell>
    );
  }

  if (!strikeoutDetailRows.length) {
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
              rowsCount={0}
              bestScore={null}
              siblingLinks={[
                { label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" },
                { label: "Hit Props", to: "/mlb/batter-vs-pitcher", icon: "⚔️", color: "#8b5cf6" },
                { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" },
              ]}
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Data Not Available
            </div>
          </div>
        </main>
      </SiteShell>
    );
  }

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
          <MlbNavHero />
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

          <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
            {/* Park sidebar — pitcher-friendly order */}
            <aside className="hidden xl:block space-y-3 xl:sticky xl:top-4 xl:self-start">
              <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="border-l-2 border-emerald-500 pl-2 text-sm font-semibold uppercase tracking-[0.14em] text-emerald-900">🏟️ Park Factors</div>
                    <div className="mt-1 text-xs text-slate-500">Pitcher-friendly order</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{parkRows.length} parks</span>
                </div>
                <div className="space-y-2">
                  {parkRows.map((park) => (
                    <article key={park.key} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <TeamLogoBadge team={park.awayTeam} size={18} showLabel={false} />
                          <span className="text-[9px] font-bold text-slate-300">@</span>
                          <TeamLogoBadge team={park.homeTeam} size={18} showLabel={false} />
                          <span className="ml-1 text-[10px] text-slate-400 truncate">{park.stadium}</span>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", getKParkTone(park.parkFactor))}>
                          {park.parkFactor.toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{getRoofLabel(park.roofType)}</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{park.temperature != null ? `${park.temperature.toFixed(0)}°` : DASH}</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">Precip {park.precipitation != null ? `${park.precipitation.toFixed(0)}%` : DASH}</span>
                        {park.windSpeed != null && park.windSpeed >= 10 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">💨 {park.windSpeed.toFixed(0)} MPH {getWindArrow(park.windDirection)} {park.windDirection}</span>
                        )}
                      </div>
                      {(park.windSpeed == null || park.windSpeed < 10) && (
                        <div className="mt-1 text-[9px] text-slate-400">{park.windSpeed != null ? `${park.windSpeed.toFixed(0)} MPH ${park.windDirection} · ` : ""}{park.conditions}</div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </aside>

            <div className="space-y-4">
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
                <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-20">
                      <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 font-black w-8 text-left">
                          <button type="button" onClick={() => handleSort("rank")} className="hover:text-slate-900">#{makeSortIndicator(sortKey === "rank", sortDir)}</button>
                        </th>
                        <th className="sticky left-8 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 font-black whitespace-nowrap min-w-[130px] text-left">
                          <button type="button" onClick={() => handleSort("pitcher")} className="hover:text-slate-900">Pitcher{makeSortIndicator(sortKey === "pitcher", sortDir)}</button>
                        </th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 font-black uppercase tracking-widest text-left whitespace-nowrap min-w-[60px]">K Line</th>
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
                            <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-400 ${sbg}`}>{row.rank}</td>
                            <td className={`sticky left-8 z-10 border-b border-r border-slate-100 px-2 py-0.5 ${sbg}`}>
                              <div className="flex items-center gap-1">
                                <MlbTeamLogo team={row.team} size={16} />
                                <span className="font-semibold text-slate-900 whitespace-nowrap text-[11px]">{row.pitcher}</span>
                                <span className="text-[9px] text-slate-400">[vs {row.opponent}]</span>
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex flex-col items-start gap-0.5">
                                <div className="font-semibold text-slate-900">{fmt(row.kLine, 1)}</div>
                                {row.kOddsOver && <div className="text-[9px] text-slate-500">O {row.kOddsOver}</div>}
                                {row.kOddsUnder && <div className="text-[9px] text-slate-500">U {row.kOddsUnder}</div>}
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.strikeoutMatchupScore} /></td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.pitcherKRate != null && row.pitcherKRate >= 28 && <span className="text-[11px]">🎯</span>}
                                <GradCell value={row.pitcherKRate} display={`${fmt(row.pitcherKRate)}%`} avg={22} spread={5} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.pitcherWhiffRate != null && row.pitcherWhiffRate >= 32 && <span className="text-[11px]">🌫️</span>}
                                <GradCell value={row.pitcherWhiffRate} display={`${fmt(row.pitcherWhiffRate)}%`} avg={25} spread={5} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKVs} /></td>
                            <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKSkillScore} /></td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.opponentTeamKRate != null && row.opponentTeamKRate >= 27 && <span className="text-[11px]">💀</span>}
                                <GradCell value={row.opponentTeamKRate} display={`${fmt(row.opponentTeamKRate)}%`} avg={22} spread={5} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.opponentTeamWhiffRate != null && row.opponentTeamWhiffRate >= 30 && <span className="text-[11px]">🌫️</span>}
                                <GradCell value={row.opponentTeamWhiffRate} display={`${fmt(row.opponentTeamWhiffRate)}%`} avg={25} spread={5} />
                              </div>
                            </td>
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
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
