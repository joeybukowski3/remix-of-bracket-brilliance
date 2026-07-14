import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Database, Search, XCircle } from "lucide-react";
import { useNflV03Artifacts } from "@/hooks/useNflV03Artifacts";
import {
  NFL_V03_METRIC_KEYS,
  NFL_V03_REVIEW_SEASONS,
  buildCrossArtifactChecks,
  publicScaleEquivalent,
  sortFullSeasonTeams,
  type NflV03ArtifactKind,
  type NflV03ContextFlag,
  type NflV03FinalEightTeam,
  type NflV03FullSeasonTeam,
  type NflV03FullSortKey,
  type NflV03ManualAdjustment,
  type NflV03Metric,
  type NflV03Metrics,
  type NflV03PreseasonRating,
  type NflV03ReviewSeason,
} from "@/lib/nfl/v03Review";

type ReviewView = "overview" | "full" | "final" | "preseason" | "flags" | "manual" | "metadata";

const VIEWS: Array<{ id: ReviewView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "full", label: "Full Season" },
  { id: "final", label: "Final Eight" },
  { id: "preseason", label: "Preseason Ratings" },
  { id: "flags", label: "Context Flags" },
  { id: "manual", label: "Manual Adjustments" },
  { id: "metadata", label: "Metadata / Validation" },
];

const ARTIFACT_LABELS: Record<NflV03ArtifactKind, string> = {
  fullSeason: "Full-season metrics",
  finalEight: "Final-eight metrics",
  preseason: "Preseason ratings",
  contextFlags: "Context flags",
  manualAdjustments: "Manual adjustments",
};

function useInternalReviewMetadata() {
  useEffect(() => {
    const previousTitle = document.title;
    const existingRobots = document.head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const previousRobots = existingRobots?.content ?? null;
    const robots = existingRobots ?? document.createElement("meta");
    if (!existingRobots) {
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = "noindex, nofollow";
    document.title = "Internal NFL Model Review";

    const canonical = document.head.querySelector('link[rel="canonical"]');
    const openGraphUrl = document.head.querySelector('meta[property="og:url"]');
    canonical?.remove();
    openGraphUrl?.remove();

    return () => {
      document.title = previousTitle;
      if (previousRobots === null) robots.remove();
      else robots.content = previousRobots;
      if (canonical) document.head.appendChild(canonical);
      if (openGraphUrl) document.head.appendChild(openGraphUrl);
    };
  }, []);
}

function formatNumber(value: number | null | undefined, digits = 3, signed = false): string {
  if (value == null || !Number.isFinite(value)) return "Missing";
  const formatted = value.toFixed(digits);
  return signed && value > 0 ? `+${formatted}` : formatted;
}

function formatDate(value: string | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return "Missing";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

function metricTone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.0005) return "text-slate-300";
  return value > 0 ? "text-emerald-300" : "text-rose-300";
}

function teamLogoUrl(abbr: string): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
}

function TeamIdentity({ abbr, name }: { abbr: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex min-w-[170px] items-center gap-2.5">
      {failed ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-[9px] font-black uppercase text-white">{abbr}</span>
      ) : (
        <img src={teamLogoUrl(abbr)} alt={`${name} logo`} className="h-8 w-8 shrink-0 object-contain" loading="lazy" onError={() => setFailed(true)} />
      )}
      <span>
        <span className="block whitespace-nowrap font-bold text-white">{name}</span>
        <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">{abbr}</span>
      </span>
    </span>
  );
}

function StatusPill({ status }: { status: "loaded" | "missing" | "error" }) {
  const style = status === "loaded" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : status === "missing" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${style}`}>{status}</span>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-5 py-12 text-center" role="status">
      <Database className="mx-auto h-8 w-8 text-slate-600" aria-hidden />
      <h2 className="mt-3 text-lg font-black text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">{detail}</p>
    </div>
  );
}

function MetricValue({ metric, compact }: { metric: NflV03Metric; compact: boolean }) {
  if (metric.missing) return <span className="font-semibold text-slate-500">Missing</span>;
  if (compact) return <span className={`font-black ${metricTone(metric.zScore)}`}>{formatNumber(metric.zScore, 3, true)} z</span>;
  return (
    <span className="block whitespace-nowrap leading-5">
      <span className="block font-black text-white">raw {formatNumber(metric.raw, 4, true)}</span>
      <span className="block text-slate-300">adj {formatNumber(metric.adjusted, 4, true)}</span>
      <span className={`block font-bold ${metricTone(metric.zScore)}`}>z {formatNumber(metric.zScore, 3, true)} · #{metric.rank}</span>
    </span>
  );
}

function MetricsGrid({ metrics, title }: { metrics: NflV03Metrics; title: string }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
      <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-300">{title}</h4>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {NFL_V03_METRIC_KEYS.map((key) => (
          <div key={key} className="rounded-lg bg-slate-900 p-2.5">
            <dt className="text-[10px] font-bold text-slate-500">{key}</dt>
            <dd className="mt-1 text-xs"><MetricValue metric={metrics[key]} compact={false} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SortButton({ label, sortKey, activeKey, direction, onSort }: { label: string; sortKey: NflV03FullSortKey; activeKey: NflV03FullSortKey; direction: "asc" | "desc"; onSort: (key: NflV03FullSortKey) => void }) {
  return (
    <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 text-left font-black uppercase tracking-wider text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400" aria-label={`Sort by ${label}`}>
      {label}<ChevronDown className={`h-3 w-3 ${activeKey === sortKey && direction === "asc" ? "rotate-180" : ""} ${activeKey === sortKey ? "text-sky-300" : "text-slate-600"}`} aria-hidden />
    </button>
  );
}

export default function NflV03Review() {
  useInternalReviewMetadata();
  const [season, setSeason] = useState<NflV03ReviewSeason>(2025);
  const [view, setView] = useState<ReviewView>("overview");
  const [search, setSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [compact, setCompact] = useState(false);
  const { loading, error, data } = useNflV03Artifacts(season);

  const artifacts = data?.artifacts ?? {};
  const primaryMeta = artifacts.fullSeason?._meta ?? artifacts.preseason?._meta ?? artifacts.contextFlags?._meta;
  const teamOptions = useMemo(() => {
    const candidates = [
      ...(artifacts.fullSeason?.teams ?? []),
      ...(artifacts.finalEight?.teams ?? []),
      ...(artifacts.preseason?.ratings ?? []),
    ];
    return [...new Map(candidates.map((team) => [team.abbr, { abbr: team.abbr, name: team.name }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [artifacts.finalEight, artifacts.fullSeason, artifacts.preseason]);
  const query = search.trim().toLowerCase();
  const teamMatches = (team: { abbr: string; name: string }) => (!selectedTeam || team.abbr === selectedTeam) && (!query || team.abbr.toLowerCase().includes(query) || team.name.toLowerCase().includes(query));
  const fileErrors = data ? Object.values(data.slots).filter((slot) => slot.status === "error") : [];

  const changeSeason = (value: string) => {
    const next = Number(value) as NflV03ReviewSeason;
    if (!NFL_V03_REVIEW_SEASONS.includes(next)) return;
    setSeason(next);
    setSearch("");
    setSelectedTeam("");
  };

  return (
    <main className="min-h-screen min-w-0 overflow-x-clip bg-[#07101f] text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Internal-only Stage-1 review
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">NFL v0.3 Model Review</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Read-only inspection of checked-in Stage-1 artifacts. Public NFL consumers remain isolated from these files.</p>
              <p className="mt-3 inline-flex rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-black text-rose-200">Hidden URL only — not authentication</p>
            </div>
            <dl className="grid min-w-0 gap-x-6 gap-y-2 text-xs sm:grid-cols-2 xl:w-[620px]">
              <HeaderMeta label="Model" value={primaryMeta?.modelVersion ?? "Loading"} />
              <HeaderMeta label="Status" value={primaryMeta?.validationStatus ?? "Loading"} />
              <HeaderMeta label="Season" value={String(season)} />
              <HeaderMeta label="Generated UTC" value={primaryMeta ? formatDate(primaryMeta.generatedAt) : "Loading"} />
              <HeaderMeta label="Source" value={primaryMeta?.source ?? "Loading checked-in artifacts"} wide />
              <HeaderMeta label="Known limitations" value={primaryMeta?.knownLimitations.length ? primaryMeta.knownLimitations.join(" · ") : "None recorded for the selected primary artifact"} wide />
            </dl>
          </div>
        </div>
      </header>

      <section className="sticky top-0 z-20 border-b border-slate-800 bg-[#0a1425]/95 shadow-xl backdrop-blur" aria-label="Review controls">
        <div className="mx-auto max-w-[1680px] space-y-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="grid gap-3 md:grid-cols-[150px_minmax(220px,1fr)_minmax(180px,260px)_auto]">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Season
              <select aria-label="Review season" value={season} onChange={(event) => changeSeason(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-400">
                {NFL_V03_REVIEW_SEASONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Team search
              <span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden /><input aria-label="Search teams" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or abbreviation" className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400" /></span>
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Team selector
              <select aria-label="Select team" value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-400">
                <option value="">All teams</option>
                {teamOptions.map((team) => <option key={team.abbr} value={team.abbr}>{team.name} ({team.abbr.toUpperCase()})</option>)}
              </select>
            </label>
            <button type="button" aria-pressed={compact} onClick={() => setCompact((value) => !value)} className="self-end rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-black text-slate-200 hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400">{compact ? "Compact view" : "Detailed view"}</button>
          </div>
          <div className="max-w-full overflow-x-auto" role="tablist" aria-label="Artifact views">
            <div className="flex min-w-max gap-1">
              {VIEWS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => setView(item.id)} className={`rounded-lg px-3 py-2 text-xs font-black focus:outline-none focus:ring-2 focus:ring-sky-400 ${view === item.id ? "bg-sky-400 text-slate-950" : "bg-slate-900 text-slate-400 hover:text-white"}`}>{item.label}</button>)}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1680px] space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        {loading && <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300" role="status">Loading Stage-1 artifact files for {season}…</div>}
        {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm font-bold text-rose-200" role="alert">Loader failure: {error}</div>}
        {fileErrors.map((slot) => <div key={slot.kind} className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200" role="alert"><strong>{ARTIFACT_LABELS[slot.kind]} failed:</strong> {slot.error}</div>)}

        {!loading && data && view === "overview" && <OverviewView season={season} data={data} />}
        {!loading && data && view === "full" && <FullSeasonView teams={(artifacts.fullSeason?.teams ?? []).filter(teamMatches)} compact={compact} season={season} />}
        {!loading && data && view === "final" && <FinalEightView teams={(artifacts.finalEight?.teams ?? []).filter(teamMatches)} compact={compact} season={season} />}
        {!loading && data && view === "preseason" && <PreseasonView ratings={(artifacts.preseason?.ratings ?? []).filter(teamMatches)} sourceSeason={artifacts.preseason?.sourceSeason} season={season} available={Boolean(artifacts.preseason)} compact={compact} />}
        {!loading && data && view === "flags" && <ContextFlagsView flags={(artifacts.contextFlags?.flags ?? []).filter((flag) => !selectedTeam || flag.team === selectedTeam).filter((flag) => !query || flag.team.includes(query) || flag.gameId.toLowerCase().includes(query))} available={Boolean(artifacts.contextFlags)} />}
        {!loading && data && view === "manual" && <ManualAdjustmentsView entries={(artifacts.manualAdjustments?.entries ?? []).filter((entry) => !selectedTeam || entry.team === selectedTeam).filter((entry) => !query || entry.team.includes(query))} available={Boolean(artifacts.manualAdjustments)} />}
        {!loading && data && view === "metadata" && <MetadataView data={data} />}
      </div>
    </main>
  );
}

function HeaderMeta({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><dt className="font-black uppercase tracking-wider text-slate-600">{label}</dt><dd className="mt-0.5 break-words leading-5 text-slate-300">{value}</dd></div>;
}

function OverviewView({ season, data }: { season: NflV03ReviewSeason; data: NonNullable<ReturnType<typeof useNflV03Artifacts>["data"]> }) {
  const { artifacts, slots } = data;
  const full = artifacts.fullSeason;
  const final = artifacts.finalEight;
  const completedGames = full ? full.teams.reduce((sum, team) => sum + team.gamesPlayed, 0) / 2 : 0;
  const weeklyBacked = full ? full.teams.filter((team) => !team.metrics.offEpaPerPlay.missing && !team.metrics.defEpaPerPlay.missing).length : 0;
  const activeAdjustments = artifacts.manualAdjustments?.entries.filter((entry) => entry.status === "active").length ?? 0;
  const isEmpty = (full?.teams.length ?? 0) === 0 && (final?.teams.length ?? 0) === 0;
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Artifact availability">
        {(Object.keys(slots) as NflV03ArtifactKind[]).map((kind) => <article key={kind} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-black text-white">{ARTIFACT_LABELS[kind]}</h2><StatusPill status={slots[kind].status} /></div><p className="mt-2 break-all text-[10px] leading-4 text-slate-500">{slots[kind].path}</p></article>)}
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Full-season teams" value={String(full?.teams.length ?? 0)} />
        <StatCard label="Final-eight teams" value={String(final?.teams.length ?? 0)} />
        <StatCard label="Completed REG games" value={String(completedGames)} />
        <StatCard label="Weekly-row EPA availability" value={`${weeklyBacked} team aggregates`} />
        <StatCard label="Context flags" value={String(artifacts.contextFlags?.flags.length ?? 0)} />
        <StatCard label="Active manual entries" value={String(activeAdjustments)} />
      </section>
      {season === 2026 && isEmpty && <EmptyState title="2026 performance data is intentionally empty" detail="No completed 2026 regular-season games or weekly EPA rows exist in the checked-in Stage-1 artifacts. No prior-season performance was copied forward." />}
      <section className="grid gap-4 lg:grid-cols-3">
        <InfoPanel title="Model formula"><p><strong>40%</strong> adjusted offense EPA</p><p><strong>40%</strong> adjusted defense EPA, better defense positive</p><p><strong>20%</strong> adjusted point differential</p><p className="mt-3 text-sky-300">Win percentage is display-only.</p></InfoPanel>
        <InfoPanel title="Frozen scale"><p>Public equivalent = 50 + 15 × (composite / <strong>0.733</strong>)</p><p className="mt-3">Same transform for offense and defense subratings.</p></InfoPanel>
        <InfoPanel title="Trajectory"><p><strong>lambda 0</strong> · <strong>k 4</strong> · <strong>cap ±1.0 z</strong></p><p className="mt-3">Published for review; launch score remains unaffected at lambda 0.</p></InfoPanel>
      </section>
      <section className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100"><strong>Stage-1 only.</strong> These artifacts are available to this internal consumer only. Existing public NFL pages continue to use their established data.</section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <article className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-xl font-black text-white">{value}</p></article>;
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xs font-black uppercase tracking-[0.16em] text-sky-300">{title}</h2><div className="mt-3 space-y-1 text-sm leading-6 text-slate-300">{children}</div></article>;
}

function FullSeasonView({ teams, compact, season }: { teams: NflV03FullSeasonTeam[]; compact: boolean; season: NflV03ReviewSeason }) {
  const [sortKey, setSortKey] = useState<NflV03FullSortKey>("rank");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const sorted = useMemo(() => sortFullSeasonTeams(teams, sortKey, direction), [direction, sortKey, teams]);
  const ranked = useMemo(() => sortFullSeasonTeams(teams, "rank", "asc"), [teams]);
  const rankByAbbr = new Map(ranked.map((team, index) => [team.abbr, index + 1]));
  const onSort = (key: NflV03FullSortKey) => { if (key === sortKey) setDirection((value) => value === "asc" ? "desc" : "asc"); else { setSortKey(key); setDirection(key === "team" || key === "rank" ? "asc" : "desc"); } };
  if (teams.length === 0) return <EmptyState title={`${season} full-season metrics unavailable`} detail={season === 2026 ? "The Stage-1 file is present and honestly contains no performance team rows." : "No team rows match the current filter or the artifact is unavailable."} />;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900" aria-labelledby="full-season-heading">
      <div className="border-b border-slate-800 px-4 py-3"><h2 id="full-season-heading" className="font-black text-white">Full-season team metrics</h2><p className="mt-1 text-xs text-slate-500">Sortable display; source order remains unchanged. Win percentage is display-only.</p></div>
      <div className="max-w-full overflow-x-auto" data-responsive-table>
        <table className={`w-full text-xs ${compact ? "min-w-[1350px]" : "min-w-[2100px]"}`}>
          <thead className="bg-slate-950 text-[10px] text-slate-400"><tr><th scope="col" className="px-3 py-3 text-left"><SortButton label="Rank" sortKey="rank" activeKey={sortKey} direction={direction} onSort={onSort} /></th><th scope="col" className="px-3 py-3 text-left"><SortButton label="Team" sortKey="team" activeKey={sortKey} direction={direction} onSort={onSort} /></th><th scope="col" className="px-3 py-3"><SortButton label="W-L-T" sortKey="record" activeKey={sortKey} direction={direction} onSort={onSort} /></th><th scope="col" className="px-3 py-3">Win %<span className="block text-[8px] text-sky-400">display-only</span></th><th scope="col" className="px-3 py-3"><SortButton label="Raw comp" sortKey="rawComposite" activeKey={sortKey} direction={direction} onSort={onSort} /></th><th scope="col" className="px-3 py-3"><SortButton label="Adj comp" sortKey="adjustedComposite" activeKey={sortKey} direction={direction} onSort={onSort} /></th><th scope="col" className="px-3 py-3">Public equivalent</th><th scope="col" className="px-3 py-3"><SortButton label="Off EPA" sortKey="offense" activeKey={sortKey} direction={direction} onSort={onSort} /></th><th scope="col" className="px-3 py-3"><SortButton label="Def EPA" sortKey="defense" activeKey={sortKey} direction={direction} onSort={onSort} /></th><th scope="col" className="px-3 py-3"><SortButton label="Net EPA" sortKey="net" activeKey={sortKey} direction={direction} onSort={onSort} /></th><th scope="col" className="px-3 py-3"><SortButton label="Point diff" sortKey="pointDiff" activeKey={sortKey} direction={direction} onSort={onSort} /></th>{!compact && <><th scope="col" className="px-3 py-3">Pass EPA</th><th scope="col" className="px-3 py-3">Rush EPA</th><th scope="col" className="px-3 py-3">Expected wins</th><th scope="col" className="px-3 py-3">Expected-wins delta</th></>}</tr></thead>
          <tbody>{sorted.map((team) => <tr key={team.abbr} className="border-t border-slate-800 align-top hover:bg-slate-800/50"><td className="px-3 py-3 text-lg font-black text-sky-300">#{rankByAbbr.get(team.abbr)}</td><td className="px-3 py-2"><TeamIdentity abbr={team.abbr} name={team.name} /></td><td className="px-3 py-3 text-center font-bold text-white">{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ""}</td><td className="px-3 py-3 text-center text-slate-300">{team.winPercentage == null ? "Missing" : team.winPercentage.toFixed(3)}</td><td className={`px-3 py-3 text-center font-bold ${metricTone(team.rawComposite)}`}>{formatNumber(team.rawComposite, 3, true)}</td><td className={`px-3 py-3 text-center font-black ${metricTone(team.adjustedComposite)}`}>{formatNumber(team.adjustedComposite, 3, true)}</td><td className="px-3 py-3 text-center font-black text-white">{formatNumber(publicScaleEquivalent(team.adjustedComposite), 1)}</td><td className="px-3 py-3"><MetricValue metric={team.metrics.offEpaPerPlay} compact={compact} /></td><td className="px-3 py-3"><MetricValue metric={team.metrics.defEpaPerPlay} compact={compact} /></td><td className="px-3 py-3"><MetricValue metric={team.metrics.netEpaPerPlay} compact={compact} /></td><td className="px-3 py-3"><MetricValue metric={team.metrics.pointDiffPerGame} compact={compact} /></td>{!compact && <><td className={`px-3 py-3 text-center ${metricTone(team.passingEpaPerPlay)}`}>{formatNumber(team.passingEpaPerPlay, 4, true)}</td><td className={`px-3 py-3 text-center ${metricTone(team.rushingEpaPerPlay)}`}>{formatNumber(team.rushingEpaPerPlay, 4, true)}</td><td className="px-3 py-3 text-center text-white">{formatNumber(team.pythagoreanExpectedWins, 2)}</td><td className={`px-3 py-3 text-center ${metricTone(team.expectedWinsDelta)}`}>{formatNumber(team.expectedWinsDelta, 2, true)}</td></>}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function FinalEightView({ teams, compact, season }: { teams: NflV03FinalEightTeam[]; compact: boolean; season: NflV03ReviewSeason }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (teams.length === 0) return <EmptyState title={`${season} final-eight metrics unavailable`} detail={season === 2026 ? "The Stage-1 file is present and honestly contains no completed-game windows or performance rows." : "No team rows match the current filter or the artifact is unavailable."} />;
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900" aria-labelledby="final-eight-heading">
      <div className="border-b border-slate-800 px-4 py-3"><h2 id="final-eight-heading" className="font-black text-white">Final-eight team metrics</h2><p className="mt-1 text-xs leading-5 text-slate-500">Canonical metrics always include every selected game. Screen candidates never exclude games. Only confirmed manual flags are eligible for the alternate view.</p></div>
      <div className="max-w-full overflow-x-auto" data-responsive-table><table className={`w-full text-xs ${compact ? "min-w-[1150px]" : "min-w-[1550px]"}`}><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400"><tr><th scope="col" className="px-3 py-3 text-left">Team</th><th scope="col" className="px-3 py-3">Window</th><th scope="col" className="px-3 py-3">L8 opponent strength</th><th scope="col" className="px-3 py-3">Raw composite</th><th scope="col" className="px-3 py-3">Adjusted composite</th><th scope="col" className="px-3 py-3">Trajectory raw</th><th scope="col" className="px-3 py-3">Shrunk</th><th scope="col" className="px-3 py-3">Clamped</th><th scope="col" className="px-3 py-3 text-left">Label / modifiers</th><th scope="col" className="px-3 py-3">Flags</th><th scope="col" className="px-3 py-3">Details</th></tr></thead><tbody>{teams.map((team) => <FinalEightRows key={team.abbr} team={team} compact={compact} expanded={expanded === team.abbr} onToggle={() => setExpanded((value) => value === team.abbr ? null : team.abbr)} />)}</tbody></table></div>
    </section>
  );
}

function FinalEightRows({ team, compact, expanded, onToggle }: { team: NflV03FinalEightTeam; compact: boolean; expanded: boolean; onToggle: () => void }) {
  return <><tr className="border-t border-slate-800 align-top hover:bg-slate-800/50"><td className="px-3 py-2"><TeamIdentity abbr={team.abbr} name={team.name} /></td><td className="px-3 py-3 text-center"><span className="font-black text-white">{team.windowSize}</span>{team.shortWindow && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black text-amber-300">SHORT</span>}</td><td className={`px-3 py-3 text-center ${metricTone(team.l8OpponentStrength)}`}>{formatNumber(team.l8OpponentStrength, 3, true)}</td><td className={`px-3 py-3 text-center ${metricTone(team.rawComposite)}`}>{formatNumber(team.rawComposite, 3, true)}</td><td className={`px-3 py-3 text-center font-black ${metricTone(team.adjustedComposite)}`}>{formatNumber(team.adjustedComposite, 3, true)}</td><td className={`px-3 py-3 text-center ${metricTone(team.trajectoryRaw)}`}>{formatNumber(team.trajectoryRaw, 3, true)}</td><td className={`px-3 py-3 text-center ${metricTone(team.trajectoryShrunk)}`}>{formatNumber(team.trajectoryShrunk, 3, true)}</td><td className={`px-3 py-3 text-center font-black ${metricTone(team.trajectoryClamped)}`}>{formatNumber(team.trajectoryClamped, 3, true)}</td><td className="px-3 py-3"><span className="block font-black text-white">{team.trajectoryLabel}</span><span className="mt-1 block text-[10px] text-sky-300">{team.modifiers.length ? team.modifiers.join(" · ") : "No schedule modifier"}</span></td><td className="px-3 py-3 text-center text-slate-300">{team.contextFlags.length}</td><td className="px-3 py-3 text-center"><button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={`team-detail-${team.abbr}`} className="rounded-lg border border-slate-700 px-2.5 py-1.5 font-black text-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400">{expanded ? "Hide" : "Review"}</button></td></tr>{expanded && <tr id={`team-detail-${team.abbr}`}><td colSpan={11} className="border-t border-sky-400/20 bg-[#091527] p-4"><div className="grid gap-4 xl:grid-cols-2"><MetricsGrid metrics={team.metrics} title="Canonical metrics — all selected games" /><MetricsGrid metrics={team.metricsExFlagged} title="Alternate metrics — confirmed manual exclusions only" /></div>{!compact && <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><DetailCard title="Full-season comparison" lines={[`rawDelta ${formatNumber(team.rawDelta, 3, true)}`, `adjustedDelta ${formatNumber(team.adjustedDelta, 3, true)}`, `rawVsAdjGap ${formatNumber(team.rawVsAdjGap, 3, true)}`]} /><DetailCard title="Ordered window game IDs" lines={team.windowGames.length ? team.windowGames : ["No completed games"]} /><DetailCard title="Trigger values" lines={Object.entries(team.triggers).map(([key, value]) => `${key} ${formatNumber(value, 3, true)}`)} /><DetailCard title="Context / exclusion" lines={[`${team.contextFlags.length} attached flag(s)`, `${team.alternateExcludedGameIds.length} confirmed manual exclusion(s)`, ...(team.alternateExcludedGameIds.length ? team.alternateExcludedGameIds : ["Screen candidates remain canonical"])]} /></div>}</td></tr>}</>;
}

function DetailCard({ title, lines }: { title: string; lines: string[] }) {
  return <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-3"><h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">{title}</h4><ul className="mt-2 space-y-1 text-xs text-slate-300">{lines.map((line, index) => <li key={`${line}-${index}`} className="break-all">{line}</li>)}</ul></section>;
}

function PreseasonView({ ratings, sourceSeason, season, available, compact }: { ratings: NflV03PreseasonRating[]; sourceSeason?: number; season: NflV03ReviewSeason; available: boolean; compact: boolean }) {
  if (!available) return <EmptyState title={`No ${season} preseason artifact`} detail="This artifact type is not present for the selected season. No older artifact is substituted." />;
  if (ratings.length === 0) return <EmptyState title="No preseason ratings match the filter" detail="Clear the team filters to review all available rows." />;
  return <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900" aria-labelledby="preseason-heading"><div className="border-b border-slate-800 px-4 py-3"><h2 id="preseason-heading" className="font-black text-white">{season} preseason power ratings</h2><p className="mt-1 text-xs text-slate-500">Derived from completed {sourceSeason} regular-season data. Null movement is shown as First publication.</p></div><div className="max-w-full overflow-x-auto" data-responsive-table><table className={`w-full text-xs ${compact ? "min-w-[1250px]" : "min-w-[1850px]"}`}><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400"><tr><th scope="col" className="px-3 py-3">Rank</th><th scope="col" className="px-3 py-3 text-left">Team</th><th scope="col" className="px-3 py-3">Public rating</th><th scope="col" className="px-3 py-3">Internal z</th><th scope="col" className="px-3 py-3">Offense</th><th scope="col" className="px-3 py-3">Defense</th><th scope="col" className="px-3 py-3">Full composite</th><th scope="col" className="px-3 py-3">L8 composite</th><th scope="col" className="px-3 py-3">Trajectory raw / shrunk / capped</th><th scope="col" className="px-3 py-3">lambda / k / cap</th><th scope="col" className="px-3 py-3">Movement</th>{!compact && <><th scope="col" className="px-3 py-3">Manual refs</th><th scope="col" className="px-3 py-3 text-left">Uncertainty</th></>}</tr></thead><tbody>{[...ratings].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)).map((row) => <tr key={row.abbr} className="border-t border-slate-800 hover:bg-slate-800/50"><td className="px-3 py-3 text-center text-lg font-black text-sky-300">#{row.rank}</td><td className="px-3 py-2"><TeamIdentity abbr={row.abbr} name={row.name} /></td><td className="px-3 py-3 text-center text-lg font-black text-white">{formatNumber(row.publicRating, 1)}</td><td className={`px-3 py-3 text-center ${metricTone(row.internalZ)}`}>{formatNumber(row.internalZ, 3, true)}</td><td className="px-3 py-3 text-center">{formatNumber(row.offenseRating, 1)}</td><td className="px-3 py-3 text-center">{formatNumber(row.defenseRating, 1)}</td><td className={`px-3 py-3 text-center ${metricTone(row.historical.fullSeasonComposite)}`}>{formatNumber(row.historical.fullSeasonComposite, 3, true)}</td><td className={`px-3 py-3 text-center ${metricTone(row.historical.l8AdjustedComposite)}`}>{formatNumber(row.historical.l8AdjustedComposite, 3, true)}</td><td className="px-3 py-3 text-center text-slate-300">{formatNumber(row.historical.trajectoryRaw, 3, true)} / {formatNumber(row.historical.trajectoryShrunk, 3, true)} / {formatNumber(row.historical.trajectoryClamped, 3, true)}</td><td className="px-3 py-3 text-center font-bold text-white">{row.historical.lambda} / {row.historical.k} / ±{row.historical.cap.toFixed(1)}</td><td className="px-3 py-3 text-center text-slate-300">{row.rankChange === null && row.ratingChange === null ? "First publication" : `rank ${formatNumber(row.rankChange, 0, true)} · rating ${formatNumber(row.ratingChange, 2, true)}`}</td>{!compact && <><td className="px-3 py-3 text-center">{row.manualAdjustments.length ? row.manualAdjustments.join(", ") : "None"}</td><td className="px-3 py-3"><span className="font-black text-white">{row.uncertainty.band}</span><span className="mt-1 block max-w-[330px] text-[10px] leading-4 text-slate-500">{Object.entries(row.uncertainty.inputs).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</span></td></>}</tr>)}</tbody></table></div></section>;
}

function ContextFlagsView({ flags, available }: { flags: NflV03ContextFlag[]; available: boolean }) {
  if (!available) return <EmptyState title="Context-flags artifact missing" detail="No other season or source is substituted." />;
  if (flags.length === 0) return <EmptyState title="No context flags" detail="The selected artifact contains no screen candidates or owner-maintained manual flags matching the current filter." />;
  return <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900" aria-labelledby="context-heading"><div className="border-b border-slate-800 px-4 py-3"><h2 id="context-heading" className="font-black text-white">Context flags</h2><p className="mt-1 text-xs leading-5 text-slate-500">Screen-origin entries are candidates only and never exclusions. Manual entries are eligible for alternate-view exclusion only when confirmed is exactly true.</p></div><div className="max-w-full overflow-x-auto" data-responsive-table><table className="w-full min-w-[1250px] text-xs"><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400"><tr><th scope="col" className="px-3 py-3 text-left">Game ID</th><th scope="col" className="px-3 py-3">Team</th><th scope="col" className="px-3 py-3">Flag</th><th scope="col" className="px-3 py-3">Origin</th><th scope="col" className="px-3 py-3">Confirmation / effect</th><th scope="col" className="px-3 py-3 text-left">Source</th><th scope="col" className="px-3 py-3">Entered by</th><th scope="col" className="px-3 py-3">Date</th><th scope="col" className="px-3 py-3 text-left">Note</th></tr></thead><tbody>{flags.map((flag, index) => { const confirmedManual = flag.origin === "manual" && flag.confirmed === true; return <tr key={`${flag.gameId}-${flag.team}-${index}`} className="border-t border-slate-800 align-top"><td className="px-3 py-3 font-mono text-sky-300">{flag.gameId}</td><td className="px-3 py-3 text-center font-black uppercase text-white">{flag.team}</td><td className="px-3 py-3 text-center">{flag.flag}</td><td className="px-3 py-3 text-center"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${flag.origin === "screen" ? "bg-amber-400/10 text-amber-300" : "bg-sky-400/10 text-sky-300"}`}>{flag.origin === "screen" ? "screen candidate" : "manual"}</span></td><td className="px-3 py-3 text-center font-bold">{confirmedManual ? <span className="text-emerald-300">Eligible for alternate-view exclusion</span> : <span className="text-slate-500">Not an exclusion</span>}</td><td className="max-w-[260px] break-words px-3 py-3 text-slate-400">{flag.source ?? "Not supplied"}</td><td className="px-3 py-3 text-center">{flag.enteredBy}</td><td className="px-3 py-3 text-center">{flag.date}</td><td className="max-w-[380px] px-3 py-3 leading-5 text-slate-300">{flag.note}</td></tr>; })}</tbody></table></div></section>;
}

function adjustmentIsActive(entry: NflV03ManualAdjustment): boolean {
  return entry.status === "active" && Date.parse(entry.expires) >= Date.now();
}

function ManualAdjustmentsView({ entries, available }: { entries: NflV03ManualAdjustment[]; available: boolean }) {
  return <div className="space-y-4"><section className="grid gap-3 md:grid-cols-3" aria-label="Manual adjustment governance limits"><StatCard label="QB absolute limit" value="≤ 0.75 z" /><StatCard label="Coaching absolute limit" value="≤ 0.25 z" /><StatCard label="Combined active team limit" value="≤ 1.0 z" /></section>{!available ? <EmptyState title="Manual-adjustments artifact missing" detail="No other season or source is substituted. This page does not create owner entries." /> : entries.length === 0 ? <EmptyState title="No owner-maintained adjustments" detail="The selected read-only artifact is valid and empty. No active adjustments have been invented or seeded." /> : <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"><div className="max-w-full overflow-x-auto" data-responsive-table><table className="w-full min-w-[1450px] text-xs"><thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400"><tr><th scope="col" className="px-3 py-3">Team</th><th scope="col" className="px-3 py-3">Component</th><th scope="col" className="px-3 py-3">Value</th><th scope="col" className="px-3 py-3">Author / date</th><th scope="col" className="px-3 py-3 text-left">Rationale</th><th scope="col" className="px-3 py-3 text-left">Source ref</th><th scope="col" className="px-3 py-3">Review by</th><th scope="col" className="px-3 py-3">Expires</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3">Current determination</th></tr></thead><tbody>{entries.map((entry, index) => <tr key={`${entry.team}-${entry.component}-${index}`} className="border-t border-slate-800"><td className="px-3 py-3 text-center font-black uppercase text-white">{entry.team}</td><td className="px-3 py-3 text-center">{entry.component}</td><td className={`px-3 py-3 text-center font-black ${metricTone(entry.value)}`}>{formatNumber(entry.value, 3, true)} z</td><td className="px-3 py-3 text-center">{entry.author}<span className="block text-slate-500">{entry.date}</span></td><td className="max-w-[360px] px-3 py-3 leading-5">{entry.rationale}</td><td className="max-w-[260px] break-words px-3 py-3 text-sky-300">{entry.sourceRef}</td><td className="px-3 py-3 text-center">{entry.reviewBy}</td><td className="px-3 py-3 text-center">{entry.expires}</td><td className="px-3 py-3 text-center">{entry.status}</td><td className={`px-3 py-3 text-center font-black ${adjustmentIsActive(entry) ? "text-emerald-300" : "text-slate-500"}`}>{adjustmentIsActive(entry) ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div></section>}</div>;
}

function MetadataView({ data }: { data: NonNullable<ReturnType<typeof useNflV03Artifacts>["data"]> }) {
  const checks = buildCrossArtifactChecks(data.artifacts, data.season);
  return <div className="space-y-4"><section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(Object.keys(data.slots) as NflV03ArtifactKind[]).map((kind) => { const slot = data.slots[kind]; const artifact = data.artifacts[kind]; return <article key={kind} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-black text-white">{ARTIFACT_LABELS[kind]}</h2><StatusPill status={slot.status} /></div><p className="mt-2 break-all font-mono text-[10px] leading-4 text-sky-300">{slot.path}</p>{artifact ? <dl className="mt-4 space-y-2 text-xs"><MetaLine label="schemaVersion" value={artifact._meta.schemaVersion} /><MetaLine label="modelVersion" value={artifact._meta.modelVersion} /><MetaLine label="validationStatus" value={artifact._meta.validationStatus} /><MetaLine label="generatedAt" value={artifact._meta.generatedAt} /><MetaLine label="season" value={String(artifact._meta.season)} /><MetaLine label="source" value={artifact._meta.source} /><MetaLine label="formula weights" value={Object.entries(artifact._meta.formulaWeights).map(([key, value]) => `${key}=${value}`).join(" · ")} /><MetaLine label="divisor" value={String(artifact._meta.frozenPublicScaleDivisor)} /><MetaLine label="trajectory" value={`${artifact._meta.trajectory.statement} · k ${artifact._meta.trajectory.shrinkageK} · cap ±${artifact._meta.trajectory.cap.toFixed(1)}`} /><MetaList label="notes" values={artifact._meta.notes} /><MetaList label="known limitations" values={artifact._meta.knownLimitations} /></dl> : <p className="mt-4 text-xs text-slate-500">{slot.error ?? "No file exists for this season/type combination."}</p>}</article>; })}</section><section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-black text-white">Cross-file consistency checks</h2><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{checks.map((check) => <article key={check.label} className={`rounded-xl border p-3 ${check.pass ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/10"}`}><div className="flex items-start gap-2">{check.pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden />}<div><h3 className="text-xs font-black text-white">{check.label}</h3><p className="mt-1 text-[10px] leading-4 text-slate-400">{check.detail}</p></div></div></article>)}</div></section></div>;
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-black text-slate-500">{label}</dt><dd className="mt-0.5 break-words leading-5 text-slate-300">{value}</dd></div>;
}

function MetaList({ label, values }: { label: string; values: string[] }) {
  return <div><dt className="font-black text-slate-500">{label}</dt><dd className="mt-1">{values.length ? <ul className="list-disc space-y-1 pl-4 leading-5 text-slate-300">{values.map((value, index) => <li key={`${label}-${index}`}>{value}</li>)}</ul> : <span className="text-slate-600">None</span>}</dd></div>;
}
