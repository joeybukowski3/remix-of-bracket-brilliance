import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Clock3, Filter, Search } from "lucide-react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflSituationalTrends } from "@/hooks/useNflSituationalTrends";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { Input } from "@/components/ui/input";
import { QualifierEvidenceCard } from "@/components/nfl/trends/TrendEvidenceCard";
import {
  HistoricalMetricBlock,
  NflTrendMatchupIdentity,
  NflTrendTeamIdentity,
  TrendCategoryBadge,
  TrendTierBadge,
} from "@/components/nfl/trends/TrendPresentation";
import { TREND_TIER_PRESENTATION, resolveTrendTeam } from "@/components/nfl/trends/trendPresentationConfig";
import { cn } from "@/lib/utils";
import {
  TREND_STATUS_LABELS,
  TREND_TIER_LABELS,
  currentQualifyingGamesForTrend,
  filterTrendGames,
  filterTrendLibrary,
  formatTrendPercent,
  formatTrendRecord,
  formatTrendRoi,
  rankTrendResearch,
  resolveGameQualifiers,
  type NflSituationalTrendsArtifact,
  type SituationalTrendGame,
  type SituationalTrendResearch,
  type TrendHistoricalDirection,
  type TrendResearchPhase,
  type TrendTier,
} from "@/lib/nfl/situationalTrends";

type PageMode = "matchups" | "library";
type PerformanceWindow = "fullHistory" | "recentForm";
type WeekFilter = number | "CURRENT" | "ALL";

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        {children}
      </select>
    </label>
  );
}

function formatKickoff(value: string | null) {
  if (!value) return "Kickoff TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Kickoff TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function CurrentMatchupCard({ artifact, game }: { artifact: NflSituationalTrendsArtifact; game: SituationalTrendGame }) {
  const qualifiers = resolveGameQualifiers(artifact, game.gameId);
  const noteworthyCount = qualifiers.filter((row) => row.tier === "NOTEWORTHY").length;
  const pendingCounts = game.pending.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
  const strongest = qualifiers[0];
  const away = resolveTrendTeam(game.away, game.awayName);
  const home = resolveTrendTeam(game.home, game.homeName);

  return (
    <article className="relative overflow-hidden rounded-xl border border-slate-300 bg-white" data-qualifier-count={qualifiers.length}>
      <div className="absolute inset-x-0 top-0 grid h-1 grid-cols-2" aria-hidden>
        <span style={{ backgroundColor: away.color }} />
        <span style={{ backgroundColor: home.color }} />
      </div>
      <div className="grid gap-4 px-3 pb-4 pt-5 sm:grid-cols-[minmax(0,1.35fr)_minmax(210px,0.65fr)_auto] sm:items-center sm:px-4">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
            <span>Week {game.week}</span><span aria-hidden>·</span><span>{formatKickoff(game.kickoff)}</span>
          </div>
          <h3 className="sr-only">{game.awayName} at {game.homeName}</h3>
          <NflTrendMatchupIdentity away={{ abbr: game.away, name: game.awayName }} home={{ abbr: game.home, name: game.homeName }} />
          <div className="flex flex-wrap gap-1.5">
            {qualifiers.slice(0, 5).map((row) => (
              <span key={`${row.team}-${row.trendId}`} className={cn("rounded-md border px-2 py-1 text-[10px] font-bold", TREND_TIER_PRESENTATION[row.tier].badge)}>
                {row.team.toUpperCase()} · {row.trend.name}
              </span>
            ))}
            {qualifiers.length > 5 && <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">+{qualifiers.length - 5} more</span>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-300 bg-slate-50 p-2.5"><dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">Confirmed</dt><dd className="mt-1 text-xl font-black tabular-nums text-slate-950">{qualifiers.length}</dd></div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5"><dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-amber-900">Noteworthy</dt><dd className="mt-1 text-xl font-black tabular-nums text-slate-950">{noteworthyCount}</dd></div>
          {strongest && <div className="col-span-2 border-t border-slate-200 pt-2"><dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">Strongest evidence</dt><dd className="mt-1 truncate text-[11px] font-bold text-slate-800">{strongest.team.toUpperCase()} · {strongest.trend.name}</dd></div>}
        </dl>

        {game.gameSlug && <Link to={`/nfl/matchups/${game.gameSlug}#trends`} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md bg-slate-950 px-3 text-xs font-bold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">Matchup trends <ChevronRight className="h-3.5 w-3.5" aria-hidden /></Link>}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-100/80 px-3 py-2 text-[10px] font-medium text-slate-700 sm:px-4">
        <span className="font-bold text-emerald-800">Confirmed {qualifiers.length}</span>
        {Object.entries(pendingCounts).map(([status, count]) => <span key={status}>{TREND_STATUS_LABELS[status as keyof typeof TREND_STATUS_LABELS]} {count}</span>)}
        {qualifiers.length === 0 && game.pending.length === 0 && <span>Not applicable: no current qualifiers or pending inputs.</span>}
      </div>

      {(qualifiers.length > 0 || game.pending.length > 0) && (
        <details className="group border-t border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:px-4 [&::-webkit-details-marker]:hidden">View every applicable trend and pending status <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-300 bg-white"><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden /></span></summary>
          <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 p-3 sm:p-4">
            {qualifiers.length > 0 && <div className="grid gap-3 2xl:grid-cols-2">{qualifiers.map((qualifier) => <QualifierEvidenceCard key={`${qualifier.team}-${qualifier.trendId}`} qualifier={qualifier} />)}</div>}
            {game.pending.length > 0 && (
              <div>
                <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">Awaiting inputs</h4>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {game.pending.map((row) => (
                    <div key={`${row.team}-${row.trendId}`} className="flex gap-2 rounded-lg border border-slate-300 bg-white p-2.5 text-[11px] leading-4 text-slate-700">
                      <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                      <div><div className="mb-2"><NflTrendTeamIdentity abbr={row.team} compact /></div><p className="font-bold text-slate-900">{artifact.researchLibrary.find((trend) => trend.id === row.trendId)?.name}</p><p>{TREND_STATUS_LABELS[row.status]} — {row.reason}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </article>
  );
}

function TrendLibraryItem({ artifact, trend, primaryWindow }: { artifact: NflSituationalTrendsArtifact; trend: SituationalTrendResearch; primaryWindow: PerformanceWindow }) {
  const primary = trend[primaryWindow];
  const secondary = trend[primaryWindow === "fullHistory" ? "recentForm" : "fullHistory"];
  const currentGames = currentQualifyingGamesForTrend(artifact.games, trend.id);
  const primaryKey = primaryWindow;
  const secondaryKey = primaryWindow === "fullHistory" ? "recentForm" : "fullHistory";
  const treatment = TREND_TIER_PRESENTATION[trend.tier];

  return (
    <details className={cn("group overflow-hidden rounded-xl border border-l bg-white", treatment.card)}>
      <summary className="cursor-pointer list-none p-3 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:p-4 [&::-webkit-details-marker]:hidden">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(145px,0.65fr)_repeat(2,minmax(120px,0.52fr))_36px] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TrendTierBadge tier={trend.tier} />
              <TrendCategoryBadge category={trend.category} />
            </div>
            <h3 className="mt-2 text-[15px] font-black tracking-tight text-slate-950">{trend.name}</h3>
            <p className="mt-1 text-[10px] font-semibold text-slate-500">{trend.researchPhase.replace("_", " ")}</p>
          </div>
          <div className="text-[11px] leading-4 text-slate-700"><span className="block font-bold text-slate-950">{trend.classification}</span>{trend.confidence} confidence</div>
          <HistoricalMetricBlock window={primaryKey} metrics={primary} compact />
          <HistoricalMetricBlock window={secondaryKey} metrics={secondary} compact />
          <span className="hidden h-8 w-8 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 group-hover:border-slate-400 group-hover:bg-slate-100 sm:grid"><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden /></span>
        </div>
      </summary>

      <div className="space-y-4 border-t border-slate-200 bg-slate-50/70 px-3 py-3 sm:px-4 sm:py-4">
        <div className="grid gap-4 text-xs leading-5 text-slate-600 lg:grid-cols-2">
          <div><h4 className="font-bold text-slate-900">Definition</h4><p className="mt-1">{trend.definition}</p></div>
          <div><h4 className="font-bold text-slate-900">Research interpretation</h4><p className="mt-1">{trend.articleNote}</p>{trend.robustnessInterpretation && <p className="mt-2"><strong className="text-slate-800">Robustness:</strong> {trend.robustnessLabel}. {trend.robustnessInterpretation}</p>}</div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {(["fullHistory", "recentForm"] as const).map((window) => <HistoricalMetricBlock key={window} window={window} metrics={trend[window]} />)}
        </div>

        {trend.variants.length > 0 && (
          <div><h4 className="mb-2 text-xs font-bold text-slate-900">Predefined variants</h4><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{trend.variants.map((variant) => <div key={variant.id} className="rounded-md bg-slate-50 p-2.5 text-[11px] leading-4 text-slate-600 ring-1 ring-inset ring-slate-200"><p className="font-bold text-slate-900">{variant.label}</p>{variant.definition && <p className="mt-1">{variant.definition}</p>}<p className="mt-1.5 tabular-nums">Full {formatTrendPercent(variant.fullHistory.atsWinPct)} · Recent {formatTrendPercent(variant.recentForm.atsWinPct)}</p><p>{variant.classification} · {variant.confidence}</p></div>)}</div></div>
        )}

        <div>
          <h4 className="text-xs font-bold text-slate-900">Current/upcoming qualifying games</h4>
          {currentGames.length === 0 ? <p className="mt-1 text-[11px] text-slate-500">No upcoming game is currently confirmed for this trend.</p> : <div className="mt-2 flex flex-wrap gap-1.5">{currentGames.map((game) => game.gameSlug && <Link key={game.gameId} to={`/nfl/matchups/${game.gameSlug}#trends`} className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-900 hover:bg-sky-100">W{game.week} {game.away.toUpperCase()} at {game.home.toUpperCase()}</Link>)}</div>}
        </div>
      </div>
    </details>
  );
}

export default function NFLTrends() {
  const { artifact, loading, error } = useNflSituationalTrends();
  const [mode, setMode] = useState<PageMode>("matchups");
  const [currentSearch, setCurrentSearch] = useState("");
  const [week, setWeek] = useState<WeekFilter>("CURRENT");
  const [trendId, setTrendId] = useState("ALL");
  const [tier, setTier] = useState<TrendTier | "ALL">("ALL");
  const [currentClassification, setCurrentClassification] = useState("ALL");
  const [noteworthyOnly, setNoteworthyOnly] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [libraryClassification, setLibraryClassification] = useState("ALL");
  const [confidence, setConfidence] = useState("ALL");
  const [direction, setDirection] = useState<TrendHistoricalDirection | "ALL">("ALL");
  const [researchPhase, setResearchPhase] = useState<TrendResearchPhase | "ALL">("ALL");
  const [primaryWindow, setPrimaryWindow] = useState<PerformanceWindow>("fullHistory");

  usePageSeo({ title: "NFL Situational Trends | Joe Knows Ball", description: "Search the complete NFL situational trend research library and scan confirmed or awaiting qualifiers for 2026 matchups.", path: "/nfl/trends" });

  const trends = useMemo(() => rankTrendResearch(artifact?.researchLibrary ?? []), [artifact]);
  const weeks = useMemo(() => [...new Set((artifact?.games ?? []).filter((game) => game.status !== "final").map((game) => game.week))].sort((a, b) => a - b), [artifact]);
  const selectedWeek = week === "CURRENT" ? weeks[0] : week;
  const categories = useMemo(() => [...new Set(trends.map((trend) => trend.category))].sort(), [trends]);
  const classifications = useMemo(() => [...new Set(trends.map((trend) => trend.classification))].sort(), [trends]);
  const currentGames = useMemo(() => filterTrendGames(artifact?.games ?? [], { search: currentSearch, week: selectedWeek, trendId, tier, classification: currentClassification, noteworthyOnly }).sort((a, b) => a.week - b.week || (a.kickoff ?? "").localeCompare(b.kickoff ?? "")), [artifact, currentSearch, selectedWeek, trendId, tier, currentClassification, noteworthyOnly]);
  const library = useMemo(() => filterTrendLibrary(trends, { search: librarySearch, category, classification: libraryClassification, confidence, direction, researchPhase }), [trends, librarySearch, category, libraryClassification, confidence, direction, researchPhase]);

  const handleModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: PageMode) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextMode = tab === "matchups" ? "library" : "matchups";
    setMode(nextMode);
    document.getElementById(`nfl-trends-tab-${nextMode}`)?.focus();
  };

  return (
    <div className="space-y-4">
      <NflPageHeader
        title="NFL Situational Trends"
        eyebrow="NFL · Research Library"
        description="A searchable library of the locked Phase 1, Phase 2 and Phase 2B research, plus deterministic 2026 matchup qualification. Historical association is descriptive, never a guaranteed predictive edge."
        className="border-slate-300"
        icon={<span className="grid h-12 w-12 place-items-center rounded-xl border border-slate-300 bg-white sm:h-14 sm:w-14"><img src="/logos/nfl.svg" alt="NFL" className="h-9 w-9 object-contain sm:h-10 sm:w-10" /></span>}
      />

      <div role="tablist" aria-label="NFL trends views" className="grid grid-cols-2 rounded-lg border border-slate-300 bg-slate-200 p-1">
        {([{ id: "matchups", label: "Current & Upcoming Matchups" }, { id: "library", label: "Trend Library" }] as const).map((tab) => <button key={tab.id} id={`nfl-trends-tab-${tab.id}`} type="button" role="tab" aria-selected={mode === tab.id} aria-controls={`nfl-trends-panel-${tab.id}`} tabIndex={mode === tab.id ? 0 : -1} onClick={() => setMode(tab.id)} onKeyDown={(event) => handleModeKeyDown(event, tab.id)} className={cn("min-h-10 rounded-md px-2 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500", mode === tab.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-950")}>{tab.label}</button>)}
      </div>

      {loading && <p role="status" className="rounded-lg bg-white p-4 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">Loading the NFL trend library…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-800 ring-1 ring-inset ring-red-200">Could not load the NFL trend library. {error}</p>}

      <section id="nfl-trends-panel-matchups" role="tabpanel" aria-labelledby="nfl-trends-tab-matchups" hidden={mode !== "matchups"} className="space-y-3">
        {artifact && (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100/80">
              <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-bold text-white sm:px-4"><Filter className="h-4 w-4 text-sky-300" aria-hidden /> Matchup filters</div>
              <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 xl:grid-cols-6">
                <label className="sm:col-span-2 lg:col-span-1"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Team search</span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden /><Input aria-label="Search current matchups by team" value={currentSearch} onChange={(event) => setCurrentSearch(event.target.value)} placeholder="Team or abbreviation" className="h-9 pl-8 text-xs" /></span></label>
                <SelectField label="Week" value={String(week)} onChange={(value) => setWeek(value === "ALL" || value === "CURRENT" ? value : Number(value))}><option value="CURRENT">Current week{weeks[0] ? ` (W${weeks[0]})` : ""}</option><option value="ALL">All weeks</option>{weeks.map((value) => <option key={value} value={value}>Week {value}</option>)}</SelectField>
                <SelectField label="Trend" value={trendId} onChange={setTrendId}><option value="ALL">All trends</option>{trends.map((trend) => <option key={trend.id} value={trend.id}>{trend.name}</option>)}</SelectField>
                <SelectField label="Evidence tier" value={tier} onChange={(value) => setTier(value as TrendTier | "ALL")}><option value="ALL">All tiers</option>{Object.entries(TREND_TIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
                <SelectField label="Classification" value={currentClassification} onChange={setCurrentClassification}><option value="ALL">All classifications</option>{classifications.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
                <label className="flex min-h-9 items-end gap-2 pb-1 text-xs font-semibold text-slate-700"><input type="checkbox" checked={noteworthyOnly} onChange={(event) => setNoteworthyOnly(event.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Noteworthy only</label>
              </div>
            </div>
            <p role="status" className="text-xs font-semibold text-slate-700">{currentGames.length} current/upcoming {currentGames.length === 1 ? "matchup" : "matchups"}</p>
            {currentGames.length === 0 ? <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-700">No current or upcoming matchup matches these filters.</p> : <div className="space-y-4">{currentGames.map((game) => <CurrentMatchupCard key={game.gameId} artifact={artifact} game={game} />)}</div>}
          </>
        )}
      </section>

      <section id="nfl-trends-panel-library" role="tabpanel" aria-labelledby="nfl-trends-tab-library" hidden={mode !== "library"} className="space-y-3">
        {artifact && (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100/80">
              <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-bold text-white sm:px-4"><Filter className="h-4 w-4 text-sky-300" aria-hidden /> Library filters</div>
              <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
                <label className="sm:col-span-2"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Trend search</span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden /><Input aria-label="Search the trend library" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Name, definition, category, interpretation" className="h-9 pl-8 text-xs" /></span></label>
                <SelectField label="Category" value={category} onChange={setCategory}><option value="ALL">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
                <SelectField label="Classification" value={libraryClassification} onChange={setLibraryClassification}><option value="ALL">All classifications</option>{classifications.map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
                <SelectField label="Confidence" value={confidence} onChange={setConfidence}><option value="ALL">All confidence</option>{["High", "Moderate", "Low"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
                <SelectField label="Historical direction" value={direction} onChange={(value) => setDirection(value as TrendHistoricalDirection | "ALL")}><option value="ALL">All directions</option><option value="POSITIVE">Positive</option><option value="NEGATIVE">Negative</option><option value="MIXED">Mixed</option><option value="NO_BROAD_EDGE">No broad edge</option></SelectField>
                <SelectField label="Research phase" value={researchPhase} onChange={(value) => setResearchPhase(value as TrendResearchPhase | "ALL")}><option value="ALL">All phases</option><option value="PHASE_1">Phase 1</option><option value="PHASE_2B">Phase 2B</option></SelectField>
                <SelectField label="Primary performance" value={primaryWindow} onChange={(value) => setPrimaryWindow(value as PerformanceWindow)}><option value="fullHistory">Full history 2011–2025</option><option value="recentForm">Recent form 2021–2025</option></SelectField>
              </div>
            </div>
            <p role="status" className="text-xs font-semibold text-slate-700">{library.length} of {trends.length} researched trends</p>
            {library.length === 0 ? <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-700">No researched trend matches these filters.</p> : <div className="space-y-2.5">{library.map((trend) => <TrendLibraryItem key={trend.id} artifact={artifact} trend={trend} primaryWindow={primaryWindow} />)}</div>}
          </>
        )}
      </section>

      <p className="text-[11px] leading-5 text-slate-500">Historical situational results are descriptive and do not guarantee future outcomes.</p>
    </div>
  );
}
