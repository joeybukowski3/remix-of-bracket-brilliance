import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import {
  getGameCount,
  getPropEdgeTier,
  ModelSummaryHeader,
  PropScoreBadge,
  TeamLogoText,
} from "@/components/mlb/MlbPropModelComponents";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import {
  buildParkSidebarRows,
  getWindArrow,
  TeamLogoBadge,
  type PitcherStrikeoutTeamRow,
} from "@/pages/MlbHrProps";
import { buildKPropBestBets, type KBestBet } from "@/lib/mlb/kPropBestBets";
import { cn } from "@/lib/utils";

const DASH = "—";

type SortKey = "rank" | "pitcher" | "team" | "opponent" | "strikeoutMatchupScore" | "pitcherKSkillScore" | "opponentTeamStrikeoutScore" | "pitcherKRate" | "pitcherWhiffRate" | "pitcherKVs" | "opponentTeamKRate" | "opponentTeamWhiffRate";
type SortDirection = "asc" | "desc";

const confidenceOptions = ["All tiers", "Strong", "Positive", "Watch", "Neutral"];

function sortRows(rows: PitcherStrikeoutTeamRow[], key: SortKey, dir: SortDirection) {
  const multiplier = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (typeof left === "string" || typeof right === "string") return String(left).localeCompare(String(right)) * multiplier;
    return (Number(left) - Number(right)) * multiplier;
  });
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return DASH;
  return value.toFixed(digits);
}

function makeSortIndicator(active: boolean, direction: SortDirection) {
  return active ? (direction === "asc" ? " ↑" : " ↓") : "";
}

function getRoofLabel(value: string) {
  if (/open/i.test(value)) return "Open";
  if (/retractable/i.test(value)) return "Retractable";
  if (/dome|closed/i.test(value)) return "Roof";
  return value || "Unknown";
}

function getKParkTone(value: number) {
  if (value <= 0.93) return "bg-green-500 text-white";
  if (value <= 0.97) return "bg-green-200 text-green-900";
  if (value >= 1.10) return "bg-red-500 text-white";
  if (value >= 1.04) return "bg-red-200 text-red-900";
  return "bg-slate-200 text-slate-700";
}

function StatScorePill({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-400">{DASH}</span>;
  const number = Number(value);
  const tone = number >= 65 ? "bg-emerald-600 text-white" : number >= 58 ? "bg-emerald-100 text-emerald-800" : number < 50 ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700";
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums", tone)}>{number.toFixed(1)}</span>;
}

function BestBetCard({ bet, compact = false }: { bet: KBestBet; compact?: boolean }) {
  const over = bet.side === "over";
  return (
    <article className={cn(
      "rounded-2xl border bg-white shadow-sm",
      over ? "border-emerald-200" : "border-blue-200",
      compact ? "p-3" : "p-4",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", over ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800")}>
              {over ? "Top Over" : "Top Under"}
            </span>
            <span className="text-[10px] font-bold text-slate-400">vs {bet.opponent}</span>
          </div>
          <div className="mt-1 truncate text-sm font-black text-slate-950">{bet.pitcher}</div>
          <div className="mt-1 text-xs text-slate-600">
            {over ? "Over" : "Under"} {bet.line.toFixed(1)} Ks <span className="font-black text-slate-900">{bet.odds}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Projection</div>
          <div className="text-lg font-black tabular-nums text-slate-950">{bet.projectedKs.toFixed(1)}</div>
        </div>
      </div>
      {!compact && (
        <>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">{bet.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">K Score {bet.matchupScore.toFixed(1)}</span>
            <span className={cn("rounded-full px-2 py-1", over ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800")}>
              Edge {bet.projectionEdge > 0 ? "+" : ""}{bet.projectionEdge.toFixed(1)} K
            </span>
            {bet.book && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">{bet.book}</span>}
          </div>
        </>
      )}
    </article>
  );
}

function KBestBetsSection({ rows }: { rows: PitcherStrikeoutTeamRow[] }) {
  const { overs, unders } = useMemo(() => buildKPropBestBets(rows, 3), [rows]);
  const topOver = overs[0] ?? null;
  const topUnder = unders[0] ?? null;

  if (!topOver && !topUnder) return null;

  return (
    <details className="group overflow-hidden rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white shadow-lg">
      <summary className="cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Model-selected value preview</div>
            <h2 className="mt-1 text-xl font-black">Best K Prop Bets</h2>
            <p className="mt-1 text-xs text-slate-300">Top Over and Under plays based on projection gap, matchup score, and available price.</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white transition group-open:rotate-180">⌄</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {topOver ? <BestBetCard bet={topOver} compact /> : <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">No Over currently clears the value threshold.</div>}
          {topUnder ? <BestBetCard bet={topUnder} compact /> : <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">No Under currently clears the value threshold.</div>}
        </div>
        <div className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 group-open:hidden">Click to view up to three plays per side</div>
      </summary>
      <div className="border-t border-white/10 bg-slate-100 p-4 text-slate-900 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-black text-emerald-800">Top Over Plays</h3>
              <span className="text-xs font-bold text-slate-400">{overs.length} qualified</span>
            </div>
            <div className="space-y-3">
              {overs.length ? overs.map((bet) => <BestBetCard key={`over-${bet.gameKey}-${bet.pitcher}`} bet={bet} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No Over has enough model value right now.</div>}
            </div>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-black text-blue-800">Top Under Plays</h3>
              <span className="text-xs font-bold text-slate-400">{unders.length} qualified</span>
            </div>
            <div className="space-y-3">
              {unders.length ? unders.map((bet) => <BestBetCard key={`under-${bet.gameKey}-${bet.pitcher}`} bet={bet} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No Under has enough model value right now.</div>}
            </div>
          </section>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">Best Bets are only shown when the model projection differs from the posted line by at least 0.4 strikeouts and the relevant odds are available. This is a ranking signal, not a guaranteed outcome.</p>
      </div>
    </details>
  );
}

export default function MlbStrikeoutProps() {
  usePageSeo(getSeoMeta("mlb-strikeout-props"));
  const { dashboard, games, loading, strikeoutDetailRows } = useMlbPropsData();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("All tiers");
  const [sortKey, setSortKey] = useState<SortKey>("strikeoutMatchupScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const parkRows = useMemo(() => [...buildParkSidebarRows(games)].sort((a, b) => a.parkFactor - b.parkFactor), [games]);
  const teams = useMemo(() => Array.from(new Set(strikeoutDetailRows.flatMap((row) => [row.team, row.opponent]))).sort(), [strikeoutDetailRows]);
  const gameOptions = useMemo(() => games.map((game) => ({ value: game.gameKey, label: game.matchup })), [games]);
  const bestScore = strikeoutDetailRows[0]?.strikeoutMatchupScore ?? null;
  const hasKOdds = useMemo(() => strikeoutDetailRows.some((row) => (row.kLine != null && row.kLine > 0) || Boolean(row.kOddsOver) || Boolean(row.kOddsUnder)), [strikeoutDetailRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = strikeoutDetailRows.filter((row) => {
      if (teamFilter !== "all" && row.team !== teamFilter && row.opponent !== teamFilter) return false;
      if (gameFilter !== "all" && row.gameKey !== gameFilter) return false;
      if (confidenceFilter !== "All tiers" && getPropEdgeTier(row.strikeoutMatchupScore).label !== confidenceFilter) return false;
      if (!query) return true;
      return [row.pitcher, row.team, row.opponent, row.park, row.whyItRanksWell].some((value) => value.toLowerCase().includes(query));
    });
    return sortRows(rows, sortKey, sortDir);
  }, [strikeoutDetailRows, confidenceFilter, gameFilter, search, sortDir, sortKey, teamFilter]);

  const handleSort = (key: SortKey) => {
    setSortDir((current) => sortKey === key ? (current === "asc" ? "desc" : "asc") : ["pitcher", "team", "opponent"].includes(key) ? "asc" : "desc");
    setSortKey(key);
  };

  if (loading) {
    return <SiteShell><main className="site-page bg-[#edf2f7] py-8"><div className="site-container text-center text-sm text-slate-500">Loading strikeout prop model…</div></main></SiteShell>;
  }

  if (!strikeoutDetailRows.length) {
    return (
      <SiteShell>
        <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
          <div className="site-container space-y-4">
            <ModelSummaryHeader eyebrow="Pitcher prop model" title="MLB Strikeout Prop Model" description="Ranks probable starters by strikeout skill, whiff profile, and opponent lineup strikeout tendency using the current MLB props data." generatedAt={dashboard?.generatedAt} gamesCount={getGameCount(games)} rowsCount={0} bestScore={null} siblingLinks={[{ label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" }, { label: "Hit Props", to: "/mlb/batter-vs-pitcher", icon: "⚔️", color: "#8b5cf6" }, { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" }]} />
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Data Not Available</div>
          </div>
        </main>
      </SiteShell>
    );
  }

  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
      <button type="button" onClick={() => handleSort(k)} className="hover:text-slate-900">{label}{makeSortIndicator(sortKey === k, sortDir)}</button>
    </th>
  );

  return (
    <SiteShell>
      <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
        <div className="site-container space-y-4">
          <MlbNavHero />
          <ModelSummaryHeader eyebrow="Pitcher prop model" title="MLB Strikeout Prop Model" description="Ranks probable starters by strikeout skill, whiff profile, and opponent lineup strikeout tendency using the current MLB props data." generatedAt={dashboard?.generatedAt} gamesCount={getGameCount(games)} rowsCount={strikeoutDetailRows.length} bestScore={bestScore} siblingLinks={[{ label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" }, { label: "Hit Props", to: "/mlb/batter-vs-pitcher", icon: "⚔️", color: "#8b5cf6" }, { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" }]} />
          <KBestBetsSection rows={strikeoutDetailRows} />

          <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden space-y-3 xl:sticky xl:top-4 xl:block xl:self-start">
              <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><div className="border-l-2 border-emerald-500 pl-2 text-sm font-semibold uppercase tracking-[0.14em] text-emerald-900">🏟️ Park Factors</div><div className="mt-1 text-xs text-slate-500">Pitcher-friendly order</div></div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{parkRows.length} parks</span>
                </div>
                <div className="space-y-2">
                  {parkRows.map((park) => (
                    <article key={park.key} className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1"><TeamLogoBadge team={park.awayTeam} size={18} showLabel={false} /><span className="text-[9px] font-bold text-slate-300">@</span><TeamLogoBadge team={park.homeTeam} size={18} showLabel={false} /><span className="ml-1 truncate text-[10px] text-slate-400">{park.stadium}</span></div>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", getKParkTone(park.parkFactor))}>{park.parkFactor.toFixed(2)}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{getRoofLabel(park.roofType)}</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{park.temperature != null ? `${park.temperature.toFixed(0)}°` : DASH}</span>
                        {park.windSpeed != null && park.windSpeed >= 10 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">💨 {park.windSpeed.toFixed(0)} MPH {getWindArrow(park.windDirection)}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </aside>

            <div className="space-y-4">
              <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid gap-2 sm:grid-cols-4">
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pitcher, team, park" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white" />
                  <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"><option value="all">All teams</option>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select>
                  <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"><option value="all">All games</option>{gameOptions.map((game) => <option key={game.value} value={game.value}>{game.label}</option>)}</select>
                  <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">{confidenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{filteredRows.length} pitchers shown</span><Link to="/mlb" className="font-bold text-sky-700 hover:underline">Back to MLB</Link></div>
              </section>

              <section data-x-export="mlb-strikeout-props" className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
                <div className="hidden overflow-x-auto md:block" style={{ WebkitOverflowScrolling: "touch" }}>
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-20"><tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <SortTh k="rank" label="#" /><SortTh k="pitcher" label="Pitcher" />{hasKOdds && <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">K Line</th>}<SortTh k="strikeoutMatchupScore" label="K Score" /><SortTh k="pitcherKRate" label="K%" /><SortTh k="pitcherWhiffRate" label="Whiff%" /><SortTh k="pitcherKVs" label="K VS" /><SortTh k="pitcherKSkillScore" label="Pitcher K" /><SortTh k="opponentTeamKRate" label="Opp K%" /><SortTh k="opponentTeamWhiffRate" label="Opp Whiff%" /><SortTh k="opponentTeamStrikeoutScore" label="Opp K Score" /><th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">K/9</th><th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Avg IP</th>
                    </tr></thead>
                    <tbody>{filteredRows.length ? filteredRows.map((row, index) => <tr key={`${row.rank}-${row.pitcher}-${row.team}`} className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                      <td className="border-b border-slate-100 px-2 py-1 text-[10px] font-black text-slate-400">{row.rank}</td><td className="border-b border-slate-100 px-2 py-1"><div className="flex items-center gap-1"><MlbTeamLogo team={row.team} size={16} /><span className="whitespace-nowrap text-[11px] font-semibold text-slate-900">{row.pitcher}</span><span className="text-[9px] text-slate-400">vs {row.opponent}</span></div></td>
                      {hasKOdds && <td className="border-b border-slate-100 px-2 py-1"><div className="font-semibold text-slate-900">{fmt(row.kLine)}</div><div className="text-[9px] text-slate-500">O {row.kOddsOver ?? DASH} · U {row.kOddsUnder ?? DASH}</div></td>}
                      <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.strikeoutMatchupScore} /></td><td className="border-b border-slate-100 px-2 py-1">{fmt(row.pitcherKRate)}%</td><td className="border-b border-slate-100 px-2 py-1">{fmt(row.pitcherWhiffRate)}%</td><td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKVs} /></td><td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKSkillScore} /></td><td className="border-b border-slate-100 px-2 py-1">{fmt(row.opponentTeamKRate)}%</td><td className="border-b border-slate-100 px-2 py-1">{fmt(row.opponentTeamWhiffRate)}%</td><td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.opponentTeamStrikeoutScore} /></td><td className="border-b border-slate-100 px-2 py-1 font-semibold">{fmt(row.projectedK9)}</td><td className="border-b border-slate-100 px-2 py-1 font-semibold">{fmt(row.projectedIP)}</td>
                    </tr>) : <tr><td colSpan={13} className="px-3 py-6 text-center text-sm text-slate-500">No pitchers match the current filters.</td></tr>}</tbody>
                  </table>
                </div>

                <div className="grid gap-2 p-3 md:hidden">
                  {filteredRows.slice(0, 50).map((row) => <article key={`mobile-${row.rank}-${row.pitcher}`} className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{row.pitcher}</div><div className="text-[10px] text-slate-500">{row.team} vs {row.opponent}</div></div><PropScoreBadge score={row.strikeoutMatchupScore} /></div>
                    {hasKOdds && <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs"><span className="font-bold">Line {fmt(row.kLine)} K</span><span className="text-slate-500">O {row.kOddsOver ?? DASH} · U {row.kOddsUnder ?? DASH}</span></div>}
                    <div className="grid grid-cols-4 divide-x divide-slate-100 text-center text-[10px]"><div className="px-1 py-2"><div className="text-slate-400">K%</div><div className="font-black">{fmt(row.pitcherKRate)}%</div></div><div className="px-1 py-2"><div className="text-slate-400">Whiff%</div><div className="font-black">{fmt(row.pitcherWhiffRate)}%</div></div><div className="px-1 py-2"><div className="text-slate-400">Opp K%</div><div className="font-black">{fmt(row.opponentTeamKRate)}%</div></div><div className="px-1 py-2"><div className="text-slate-400">Proj K</div><div className="font-black">{fmt(row.projectedKs)}</div></div></div>
                  </article>)}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
