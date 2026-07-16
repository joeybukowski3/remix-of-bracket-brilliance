import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import RelatedTools from "@/components/mlb/RelatedTools";
import { FreshnessStatus } from "@/components/mlb/FreshnessStatus";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import {
  formatPropNumber,
  getGameCount,
  getPitcherTeamForBatter,
  getPropEdgeTier,
  getBatterVsPitcherReason,
  ModelSummaryHeader,
  PropScoreBadge,
  TeamLogoText,
} from "@/components/mlb/MlbPropModelComponents";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import {
  buildParkSidebarRows,
  getParkFactorTone,
  getWindArrow,
  TeamLogoBadge,
  type PitcherVsBatterRow,
} from "@/pages/MlbHrProps";
import { cn } from "@/lib/utils";

const DASH = "—";

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

function fmt(v: number | null | undefined, digits = 1) {
  return v != null && Number.isFinite(v) ? v.toFixed(digits) : DASH;
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

function BvpPageGuide() {
  return (
    <section aria-labelledby="bvp-page-guide-title" className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <h2 id="bvp-page-guide-title" className="text-base font-black text-slate-900">How to read this page</h2>
      <div className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
        <p>Matchup Score ranks today&apos;s batter vs. pitcher matchups against each other using current-season Statcast contact quality, opposing-pitcher vulnerability, and park and weather context.</p>
        <p>Traditional batter-vs-pitcher history usually contains very small samples. Joe Knows Ball instead evaluates today&apos;s matchup using current-season contact quality, pitcher tendencies, and game context.</p>
        <p>This is a research tool designed to compare matchups. It is not a betting recommendation.</p>
      </div>
    </section>
  );
}

export default function MlbBatterVsPitcher() {
  usePageSeo(getSeoMeta("mlb-batter-vs-pitcher"));
  const { batterVsPitcherRows, dashboard, games, status, pitchers } = useMlbPropsData();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("All tiers");
  const [sortKey, setSortKey] = useState<SortKey>("bestMatchupScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  usePageSeo({
    title: "MLB Batter vs Pitcher Today 2026 — Daily Matchup Model & Rankings | Joe Knows Ball",
    description: "Daily MLB batter vs pitcher matchup rankings using current-season contact quality, hard hit rate, barrel rate, and pitcher vulnerability. Free matchup model updated every day.",
    path: "/mlb/batter-vs-pitcher",
    structuredData: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://www.joeknowsball.com/" },
          { "@type": "ListItem", position: 2, name: "MLB", item: "https://www.joeknowsball.com/mlb" },
          { "@type": "ListItem", position: 3, name: "Batter vs Pitcher", item: "https://www.joeknowsball.com/mlb/batter-vs-pitcher" },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "How does the MLB Batter vs Pitcher matchup model work?",
            acceptedAnswer: { "@type": "Answer", text: "The Batter vs Pitcher model ranks today's batters by combining current-season power and contact quality — hard hit rate, barrel rate, and recent HR profile — with the opposing pitcher's vulnerability to hard contact, then layers in park and weather context. Matchup Score is a relative ranking, not a probability or guaranteed outcome." },
          },
          {
            "@type": "Question",
            name: "Does this use career batter vs pitcher history?",
            acceptedAnswer: { "@type": "Answer", text: "Traditional batter-vs-pitcher history usually contains very small samples. Joe Knows Ball instead evaluates today's matchup using current-season contact quality, pitcher tendencies, and game context." },
          },
        ],
      },
    ],
  });

  const parkRows = useMemo(() => buildParkSidebarRows(games), [games]);
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

  const SortTh = ({ k, label, help }: { k: SortKey; label: string; help?: string }) => (
    <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
      {/* title only (not aria-label) here: the visible label is the metric name itself and
          must stay part of the accessible name, unlike the bare "#" rank glyph below. */}
      <button type="button" onClick={() => handleSort(k)} className="hover:text-slate-900" title={help}>
        {label}{makeSortIndicator(sortKey === k, sortDir)}
      </button>
    </th>
  );

  // FreshnessStatus explains shared MLB model freshness, but a nonblocking
  // status with zero rows still needs its own explanation for why the
  // matchup table itself is empty -- otherwise "Current slate data" next
  // to nothing reads as broken, not merely row-less. Blocking/loading/
  // waiting/no-games statuses are already fully explained by
  // FreshnessStatus's own copy, so this never fires alongside those.
  const hasUsableBvpData = batterVsPitcherRows.length > 0;
  const shouldShowNoMatchupRowsMessage =
    !hasUsableBvpData
    && (status.kind === "current" || status.kind === "lineup-pending" || status.kind === "stale" || (status.kind === "error" && status.hasLastKnownData));

  if (status.kind === "loading") {
    return (
      <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
        <div className="space-y-4">
          <MlbNavHero />
          <ModelSummaryHeader
            eyebrow="Batter matchup model"
            title="MLB Batter vs Pitcher Model"
            description="Ranks today's batter vs. pitcher matchups using current-season contact quality, pitcher vulnerability, and game context."
            generatedAt={dashboard?.generatedAt}
            gamesCount={getGameCount(games)}
            rowsCount={0}
            bestScore={null}
            showUpdatedAt={false}
            siblingLinks={[
              { label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" },
              { label: "K Props", to: "/mlb/strikeout-props", icon: "🎯", color: "#22c55e" },
              { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" },
            ]}
          />
          <BvpPageGuide />
          <FreshnessStatus status={status} />
        </div>
      </main>
    );
  }

  if (!hasUsableBvpData) {
    return (
      <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
        <div className="space-y-4">
          <MlbNavHero />
          <ModelSummaryHeader
            eyebrow="Batter matchup model"
            title="MLB Batter vs Pitcher Model"
            description="Ranks today's batter vs. pitcher matchups using current-season contact quality, pitcher vulnerability, and game context."
            generatedAt={dashboard?.generatedAt}
            gamesCount={getGameCount(games)}
            rowsCount={0}
            bestScore={null}
            showUpdatedAt={false}
            siblingLinks={[
              { label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" },
              { label: "K Props", to: "/mlb/strikeout-props", icon: "🎯", color: "#22c55e" },
              { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" },
            ]}
          />
          <BvpPageGuide />
          <FreshnessStatus status={status} />
          {shouldShowNoMatchupRowsMessage && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
              MLB model data is available, but no batter-versus-pitcher matchup rows are currently listed for this slate.
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
      <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
        <div className="space-y-4">
          <MlbNavHero />
          <ModelSummaryHeader
            eyebrow="Batter matchup model"
            title="MLB Batter vs Pitcher Model"
            description="Ranks today's batter vs. pitcher matchups using current-season contact quality, pitcher vulnerability, and game context."
            generatedAt={dashboard?.generatedAt}
            gamesCount={getGameCount(games)}
            rowsCount={batterVsPitcherRows.length}
            bestScore={bestScore}
            showUpdatedAt={false}
            siblingLinks={[
              { label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" },
              { label: "K Props", to: "/mlb/strikeout-props", icon: "🎯", color: "#22c55e" },
              { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" },
            ]}
          />
          <BvpPageGuide />
          <FreshnessStatus status={status} />

          <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
            {/* Park sidebar — hitter-friendly order */}
            <aside className="hidden xl:block space-y-3 xl:sticky xl:top-4 xl:self-start">
              <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="border-l-2 border-sky-500 pl-2 text-sm font-semibold uppercase tracking-[0.14em] text-sky-900">🏟️ Park Factors</div>
                    <div className="mt-1 text-xs text-slate-500">Hitter-friendly order</div>
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
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", getParkFactorTone(park.parkFactor))}>
                          {park.parkFactor.toFixed(2)}
                        </span>
                      </div>
                      {park.hrPerGame != null && (
                        <div className="mt-1">
                          <span className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                            park.hrPerGame >= 2.7 ? "bg-red-100 text-red-700" :
                            park.hrPerGame >= 2.3 ? "bg-orange-100 text-orange-700" :
                            park.hrPerGame >= 2.0 ? "bg-amber-100 text-amber-700" :
                            "bg-slate-100 text-slate-600"
                          )}>
                            ⚾ {park.hrPerGame.toFixed(2)} HR/G
                          </span>
                        </div>
                      )}
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

            <div className="min-w-0 space-y-4">
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
                  <span>{filteredRows.length} batter matchups shown</span>
                  <Link to="/mlb" className="font-bold text-sky-700 hover:underline">Back to MLB</Link>
                </div>
              </section>

              {/* Table */}
              <section className="rounded-[20px] border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="hidden overflow-x-auto md:block" style={{ WebkitOverflowScrolling: "touch" }}>
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-20">
                      <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 font-black w-8 text-left">
                          <button type="button" onClick={() => handleSort("rank")} className="hover:text-slate-900" aria-label="Model Rank. This remains fixed even if you sort by another column." title="Model Rank. This remains fixed even if you sort by another column.">#{makeSortIndicator(sortKey === "rank", sortDir)}</button>
                        </th>
                        <th className="sticky left-8 z-30 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 font-black whitespace-nowrap min-w-[130px] text-left">
                          <button type="button" onClick={() => handleSort("player")} className="hover:text-slate-900">Batter{makeSortIndicator(sortKey === "player", sortDir)}</button>
                        </th>
                        <SortTh k="bestMatchupScore" label="Matchup Score" help="Overall matchup strength, roughly 0-100, ranking today's batters against each other. Not a probability or a betting recommendation." />
                        <SortTh k="xba" label="xBA" help="Expected batting average from contact quality. Shown for context." />
                        <SortTh k="hardHitRate" label="Hard Hit%" />
                        <SortTh k="barrelRate" label="Barrel%" />
                        <SortTh k="batterPowerScore" label="Batter Quality" help="Batter-side component: current-season power and contact quality." />
                        <SortTh k="opposingPitcherHitsVs" label="Pitcher Contact Allowed" help="How much contact the opposing pitcher has allowed to comparable hitters. Higher favors the batter." />
                        <SortTh k="pitcherVulnerabilityScore" label="Pitcher Power Risk" help="How vulnerable the opposing starter has been to hard contact and home runs. Higher favors the batter." />
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
                              <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">vs {row.opposingPitcher}</div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.bestMatchupScore} /></td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.xba != null && row.xba >= 0.310 && <span className="text-[11px]">🎯</span>}
                                <GradCell value={row.xba} display={row.xba != null ? row.xba.toFixed(3) : DASH} avg={0.258} spread={0.030} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.hardHitRate != null && row.hardHitRate >= 55 && <span className="text-[11px]">💥</span>}
                                <GradCell value={row.hardHitRate} display={row.hardHitRate != null ? `${row.hardHitRate.toFixed(1)}%` : DASH} avg={46.5} spread={7} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.barrelRate != null && row.barrelRate >= 18 && <span className="text-[11px]">💣</span>}
                                <GradCell value={row.barrelRate} display={row.barrelRate != null ? `${row.barrelRate.toFixed(1)}%` : DASH} avg={8.0} spread={5} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.batterPowerScore} /></td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.opposingPitcherHitsVs != null && row.opposingPitcherHitsVs >= 70 && <span className="text-[11px]">⚔️</span>}
                                <StatScorePill value={row.opposingPitcherHitsVs} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1"><GradCell value={row.pitcherVulnerabilityScore} display={fmt(row.pitcherVulnerabilityScore)} avg={50} spread={20} /></td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-500">No batters match the current filters.</td></tr>
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
                            <div className="font-black text-slate-800">{row.xba != null ? row.xba.toFixed(3) : DASH}</div>
                          </div>
                          <div className="bg-sky-50/60 px-1 py-2">
                            <div className="text-[9px] font-black uppercase tracking-wide text-sky-500 mb-1">Batter</div>
                            <div className="font-black text-slate-800">{fmt(row.batterPowerScore)}</div>
                          </div>
                          <div className="bg-rose-50/60 px-1 py-2">
                            <div className="text-[9px] font-black uppercase tracking-wide text-rose-500 mb-1">Pitcher</div>
                            <div className="font-black text-slate-800">{fmt(row.opposingPitcherHitsVs)}</div>
                          </div>
                          <div className="bg-violet-50/60 px-1 py-2">
                            <div className="text-[9px] font-black uppercase tracking-wide text-violet-500 mb-1">Pwr Risk</div>
                            <div className="font-black text-slate-800">{fmt(row.pitcherVulnerabilityScore)}</div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="bvp-signal-legend-title" className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <h2 id="bvp-signal-legend-title" className="text-xs font-black uppercase tracking-widest text-slate-500">Signal legend</h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>🎯 Elite xBA</span>
                  <span>💥 Elite hard-hit rate</span>
                  <span>💣 Elite barrel rate</span>
                  <span>⚔️ Vulnerable opposing pitcher</span>
                </div>
              </section>

              <RelatedTools currentToolId="batter-vs-pitcher" />
            </div>
          </div>
        </div>
      </main>
  );
}
