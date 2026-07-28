import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import RelatedTools from "@/components/mlb/RelatedTools";
import { FreshnessStatus } from "@/components/mlb/FreshnessStatus";
import { MlbParkFactorsStrip } from "@/components/mlb/MlbParkFactorsStrip";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
import {
  getGameCount,
  getPitcherTeamForBatter,
  getPropEdgeTier,
  ModelSummaryHeader,
  TeamLogoText,
} from "@/components/mlb/MlbPropModelComponents";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import {
  BatterSeasonProfile,
  BatterVsPitcherSummary,
  buildSeasonProfilePercentileLookups,
  type SeasonProfilePercentileLookups,
} from "@/components/mlb/BatterExpandedDetails";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import {
  buildParkSidebarRows,
  type PitcherVsBatterRow,
} from "@/pages/MlbHrProps";
import { keyForBvpRow, useMlbBvpHistory } from "@/hooks/useMlbBvpHistory";
import { AvgVsPitcherCell } from "@/components/mlb/MlbBvpHistoryPanel";
import { PercentileCell } from "@/components/mlb/MlbPercentileScoreCell";
import { cn } from "@/lib/utils";
import {
  PERCENTILE_TIER_LEGEND,
  SAMPLE_MINIMUMS,
  buildPercentileLookup,
  lookupPercentile,
  resolveSampleSize,
} from "@/lib/mlb/percentileColorScale";
import type { BvpHistoryEntry } from "@/hooks/useMlbBvpHistory";

const DASH = "—";
/** The main table incrementally loads in pages of this size -- ranking/filtering is unaffected, this only limits how many already-sorted rows render at once. Mirrors MlbHrProps.tsx's Batter View and MlbStrikeoutProps.tsx's main table. */
const PAGE_SIZE = 50;

type SortKey = "rank" | "player" | "team" | "opposingPitcher" | "bestMatchupScore" | "batterPowerScore" | "opposingPitcherHitsVs" | "pitcherVulnerabilityScore" | "xba" | "hardHitRate" | "barrelRate";
type SortDirection = "asc" | "desc";

/** Comparative metric keys colored by slate-relative percentile (not absolute cutoffs). */
type BvpPercentileMetric =
  | "bestMatchupScore"
  | "xba"
  | "hardHitRate"
  | "barrelRate"
  | "batterPowerScore"
  | "opposingPitcherHitsVs"
  | "pitcherVulnerabilityScore";

const BVP_PERCENTILE_METRICS: BvpPercentileMetric[] = [
  "bestMatchupScore",
  "xba",
  "hardHitRate",
  "barrelRate",
  "batterPowerScore",
  "opposingPitcherHitsVs",
  "pitcherVulnerabilityScore",
];

/** Contact-quality metrics require a qualifying AB sample for strong color. */
const CONTACT_QUALITY_METRICS = new Set<BvpPercentileMetric>(["xba", "hardHitRate", "barrelRate"]);

const confidenceOptions = ["All tiers", "Strong", "Positive", "Watch", "Neutral"];

function sortRows(rows: PitcherVsBatterRow[], key: SortKey, dir: SortDirection) {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * m;
    return (Number(av) - Number(bv)) * m;
  });
}

type PercentileLookupMap = Record<BvpPercentileMetric, Map<number, number>>;

function buildBvpPercentileLookups(rows: PitcherVsBatterRow[]): PercentileLookupMap {
  const lookups = {} as PercentileLookupMap;
  for (const metric of BVP_PERCENTILE_METRICS) {
    lookups[metric] = buildPercentileLookup(rows.map((row) => row[metric]));
  }
  return lookups;
}

function sampleGateForMetric(row: PitcherVsBatterRow, metric: BvpPercentileMetric): {
  sampleSize: number | null;
  sampleMinimum: number | null;
  bypassSampleGate: boolean;
} {
  if (CONTACT_QUALITY_METRICS.has(metric)) {
    // Priority: metric-specific → BBE → AB → PA (only fields present on the row).
    const sampleSize = resolveSampleSize({
      metricSample: null,
      battedBallEvents: null,
      atBats: row.atBats ?? null,
      plateAppearances: null,
    });
    return {
      sampleSize,
      sampleMinimum: SAMPLE_MINIMUMS.contactQuality,
      bypassSampleGate: false,
    };
  }
  // Model scores already embed sample protection / composite context.
  return { sampleSize: null, sampleMinimum: null, bypassSampleGate: true };
}

/** Compact color-scale legend — same tier definitions as PercentileCell. */
function PercentileColorLegend() {
  return (
    <div
      className="rounded-[16px] border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm"
      data-testid="bvp-percentile-color-legend"
      aria-label="Percentile color scale legend"
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max flex-wrap items-center gap-x-2.5 gap-y-1 sm:flex-nowrap">
            {PERCENTILE_TIER_LEGEND.map((tier) => (
              <span key={tier.id} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: tier.style.backgroundColor,
                    border: tier.style.border,
                  }}
                  aria-hidden="true"
                />
                {tier.label}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0 space-y-0.5 text-[9px] leading-snug text-slate-400 sm:max-w-[16rem] sm:text-right">
          <p>Colors are percentile-based within the current slate and metric.</p>
          <p title="Full Elite gold needs a qualifying sample. Without sample counts, colors stay muted and never gold.">
            Strong colors require a qualifying sample.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Expanded panel: current-season stats + direct BvP history (when ABs exist).
 * Does not re-render model scores from the main table.
 */
export function BvpExpandedSeasonMatchupStats({
  row,
  bvpEntry,
  bvpLoading,
  bvpUnavailable = false,
  seasonPercentileLookups = null,
}: {
  row: PitcherVsBatterRow;
  bvpEntry: BvpHistoryEntry | undefined;
  bvpLoading: boolean;
  bvpUnavailable?: boolean;
  seasonPercentileLookups?: SeasonProfilePercentileLookups | null;
}) {
  return (
    <div className="min-w-0 space-y-2 overflow-x-hidden" data-testid="bvp-expanded-season-matchup-stats">
      <div className="grid min-w-0 gap-2" data-testid="bvp-expanded-stats-mobile">
        <BatterSeasonProfile row={row} percentileLookups={seasonPercentileLookups} />
        <BatterVsPitcherSummary
          opposingPitcher={row.opposingPitcher}
          bvpEntry={bvpEntry}
          bvpLoading={bvpLoading}
          bvpUnavailable={bvpUnavailable}
        />
      </div>
      <p className="text-[9px] text-slate-400">
        Season rates from current-slate payload. Matchup line uses career BvP history (PA/H/HR/AVG only). Not used in Matchup Score.
      </p>
    </div>
  );
}

function fmt(v: number | null | undefined, digits = 1) {
  return v != null && Number.isFinite(v) ? v.toFixed(digits) : DASH;
}

function makeSortIndicator(active: boolean, dir: SortDirection) {
  return active ? (dir === "asc" ? " ↑" : " ↓") : "";
}

/** Turns a keyForBvpRow() key into a stable, DOM-safe id for a compact row's expand panel + aria-controls pair. Mirrors MlbStrikeoutProps.tsx's compactRowPanelId(). */
function compactRowPanelId(key: string) {
  return `bvp-row-detail-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`;
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
  // Display-only batter-vs-pitcher history (career + trailing-5Y PA/H/AVG/HR),
  // joined at render time by (batter id, opposing pitcher id). Never read by
  // Matchup Score, rankings, filters, confidence tiers, or sorting below.
  const {
    loading: bvpHistoryLoading,
    fileUnavailable: bvpHistoryUnavailable,
    historyByKey: bvpHistoryByKey,
  } = useMlbBvpHistory();
  const [bvpExpandedKey, setBvpExpandedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("All tiers");
  const [sortKey, setSortKey] = useState<SortKey>("bestMatchupScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  /** Below the `lg` breakpoint (1024px): compact expandable-row layout instead of the desktop table. Resolved synchronously via matchMedia (see useIsCompactLayout) so the first render already reflects the real viewport, and rendered via JS branch (not CSS display toggling) so only one copy of each row ever sits in the DOM. Mirrors MlbHrProps.tsx and MlbStrikeoutProps.tsx. */
  const isCompactLayout = useIsCompactLayout();
  /** How many already-sorted/filtered rows are currently rendered -- "Show 50 more" grows this, a materially-changed filter/sort resets it. */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  /** Mobile/tablet-only expand toggle for the relocated "How to read this page" section -- collapsed by default below lg, always open at lg and above. */
  const [howToReadExpanded, setHowToReadExpanded] = useState(false);

  const toggleBvpRow = (row: PitcherVsBatterRow) => {
    const key = keyForBvpRow(row.playerId, row.opposingPitcherId);
    setBvpExpandedKey((current) => (current === key ? null : key));
  };

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
  /** Slate-wide percentile lookups for comparative cell colors (full slate, not search-filtered). */
  const percentileLookups = useMemo(() => buildBvpPercentileLookups(batterVsPitcherRows), [batterVsPitcherRows]);
  const seasonPercentileLookups = useMemo(
    () => buildSeasonProfilePercentileLookups(batterVsPitcherRows),
    [batterVsPitcherRows],
  );
  const metricPercentile = (row: PitcherVsBatterRow, metric: BvpPercentileMetric) =>
    lookupPercentile(row[metric], percentileLookups[metric]);

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

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, teamFilter, gameFilter, confidenceFilter, sortKey, sortDir]);

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
          <FreshnessStatus status={status} />

          <MlbParkFactorsStrip
            parks={parkRows}
            perspective="hitter"
            subtitle="Hitter-friendly order"
            collapsedPreviewCount={isCompactLayout ? 1 : undefined}
            expandLabel={isCompactLayout ? "Click to expand" : undefined}
            collapseLabel={isCompactLayout ? "Show less" : undefined}
          />

          <div className="space-y-4">
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

              <PercentileColorLegend />

              {/* Table */}
              <section className="rounded-[20px] border border-slate-200 bg-white shadow-sm overflow-hidden">
                {isCompactLayout ? (
                  /* Mobile/tablet (below lg): compact expandable rows, mirroring MlbHrProps.tsx's Batter View and MlbStrikeoutProps.tsx's main table. */
                  <div className="grid gap-2 p-3">
                    {visibleRows.length ? visibleRows.map((row) => {
                      const pitcherTeam = getPitcherTeamForBatter(row, pitchers);
                      const bvpKey = keyForBvpRow(row.playerId, row.opposingPitcherId);
                      const isBvpExpanded = bvpExpandedKey === bvpKey;
                      const panelId = compactRowPanelId(bvpKey ?? `${row.rank}-${row.player}`);
                      return (
                        <article key={`m-${row.rank}-${row.player}`} className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                          <button
                            type="button"
                            onClick={() => toggleBvpRow(row)}
                            aria-expanded={isBvpExpanded}
                            aria-controls={panelId}
                            aria-label={`${isBvpExpanded ? "Hide" : "Show"} batter-vs-pitcher history for ${row.player} vs ${row.opposingPitcher}`}
                            className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn("shrink-0 text-[10px] text-slate-400 transition-transform", isBvpExpanded && "rotate-90")} aria-hidden="true">▶</span>
                              <MlbTeamLogo team={row.team} size={28} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-black text-slate-900">{row.player}</div>
                                <div className="truncate text-[11px] text-slate-400">vs {row.opposingPitcher}</div>
                              </div>
                              <PercentileCell
                                value={row.bestMatchupScore}
                                display={fmt(row.bestMatchupScore)}
                                percentile={metricPercentile(row, "bestMatchupScore")}
                                strong
                                {...sampleGateForMetric(row, "bestMatchupScore")}
                              />
                            </div>
                            <span className="pl-[18px] text-[9px] font-bold uppercase tracking-wide text-sky-700">
                              {isBvpExpanded ? "Show less" : "Click to expand"}
                            </span>
                          </button>
                          {isBvpExpanded && (
                            <div id={panelId} className="space-y-3 border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-2">
                              <BvpExpandedSeasonMatchupStats
                                row={row}
                                bvpEntry={bvpKey ? bvpHistoryByKey.get(bvpKey) : undefined}
                                bvpLoading={bvpHistoryLoading}
                                bvpUnavailable={bvpHistoryUnavailable}
                                seasonPercentileLookups={seasonPercentileLookups}
                              />
                            </div>
                          )}
                        </article>
                      );
                    }) : (
                      <div className="px-3 py-6 text-center text-sm text-slate-500">No batters match the current filters.</div>
                    )}
                  </div>
                ) : (
                  /* Desktop (lg and above): existing table, unchanged. */
                  <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
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
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap" title="Batter's career batting average against this specific opposing starter. Historical context only -- not used in Matchup Score or any ranking. Click a row to see PA, H, HR, and a Career / Last 5Y toggle.">
                          AVG vs P
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.length ? visibleRows.map((row, i) => {
                        const pitcherTeam = getPitcherTeamForBatter(row, pitchers);
                        const bg = i % 2 === 0 ? "bg-white" : "bg-slate-50/70";
                        const sbg = i % 2 === 0 ? "bg-white" : "bg-slate-50";
                        const bvpKey = keyForBvpRow(row.playerId, row.opposingPitcherId);
                        const isBvpExpanded = bvpExpandedKey === bvpKey;
                        const bvpEntry = bvpKey ? bvpHistoryByKey.get(bvpKey) : undefined;
                        const bvpRowLabel = `${isBvpExpanded ? "Hide" : "Show"} batter-vs-pitcher history for ${row.player} vs ${row.opposingPitcher}`;
                        const onBvpRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleBvpRow(row);
                          }
                        };
                        return (
                          <Fragment key={`${row.rank}-${row.player}-${row.team}-${row.opposingPitcher}`}>
                          <tr
                            onClick={() => toggleBvpRow(row)}
                            onKeyDown={onBvpRowKeyDown}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isBvpExpanded}
                            aria-label={bvpRowLabel}
                            className={cn(bg, "cursor-pointer transition-colors hover:brightness-[0.98]")}
                          >
                            <td className={`sticky left-0 z-10 border-b border-r border-slate-100 px-2 py-1 text-[10px] font-black text-slate-400 ${sbg}`}>{row.rank}</td>
                            <td className={`sticky left-8 z-10 border-b border-r border-slate-100 px-2 py-1 ${sbg}`}>
                              <div className="flex items-center gap-1.5">
                                <span aria-hidden="true" className={cn("shrink-0 text-[9px] text-slate-400 transition-transform", isBvpExpanded && "rotate-90")}>▶</span>
                                <TeamLogoText team={row.team} size={16} />
                                <span className="font-semibold text-slate-900 whitespace-nowrap text-[11px]">{row.player}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">vs {row.opposingPitcher}</div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <PercentileCell value={row.bestMatchupScore} display={fmt(row.bestMatchupScore)} percentile={metricPercentile(row, "bestMatchupScore")} strong {...sampleGateForMetric(row, "bestMatchupScore")} />
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.xba != null && row.xba >= 0.310 && <span className="text-[11px]">🎯</span>}
                                <PercentileCell value={row.xba} display={row.xba != null ? row.xba.toFixed(3) : DASH} percentile={metricPercentile(row, "xba")} {...sampleGateForMetric(row, "xba")} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.hardHitRate != null && row.hardHitRate >= 55 && <span className="text-[11px]">💥</span>}
                                <PercentileCell value={row.hardHitRate} display={row.hardHitRate != null ? `${row.hardHitRate.toFixed(1)}%` : DASH} percentile={metricPercentile(row, "hardHitRate")} {...sampleGateForMetric(row, "hardHitRate")} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.barrelRate != null && row.barrelRate >= 18 && <span className="text-[11px]">💣</span>}
                                <PercentileCell value={row.barrelRate} display={row.barrelRate != null ? `${row.barrelRate.toFixed(1)}%` : DASH} percentile={metricPercentile(row, "barrelRate")} {...sampleGateForMetric(row, "barrelRate")} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <PercentileCell value={row.batterPowerScore} display={fmt(row.batterPowerScore)} percentile={metricPercentile(row, "batterPowerScore")} strong {...sampleGateForMetric(row, "batterPowerScore")} />
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <div className="flex items-center gap-1">
                                {row.opposingPitcherHitsVs != null && row.opposingPitcherHitsVs >= 70 && <span className="text-[11px]">⚔️</span>}
                                <PercentileCell value={row.opposingPitcherHitsVs} display={fmt(row.opposingPitcherHitsVs)} percentile={metricPercentile(row, "opposingPitcherHitsVs")} strong {...sampleGateForMetric(row, "opposingPitcherHitsVs")} />
                              </div>
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <PercentileCell value={row.pitcherVulnerabilityScore} display={fmt(row.pitcherVulnerabilityScore)} percentile={metricPercentile(row, "pitcherVulnerabilityScore")} {...sampleGateForMetric(row, "pitcherVulnerabilityScore")} />
                            </td>
                            <td className="border-b border-slate-100 px-2 py-1">
                              <AvgVsPitcherCell entry={bvpEntry} loading={bvpHistoryLoading} />
                            </td>
                          </tr>
                          {isBvpExpanded && (
                            <tr>
                              <td colSpan={10} className="border-b border-slate-100 bg-slate-50 px-2 py-2">
                                <BvpExpandedSeasonMatchupStats
                                  row={row}
                                  bvpEntry={bvpEntry}
                                  bvpLoading={bvpHistoryLoading}
                                  bvpUnavailable={bvpHistoryUnavailable}
                                  seasonPercentileLookups={seasonPercentileLookups}
                                />
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      }) : (
                        <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-slate-500">No batters match the current filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                )}
              </section>

              {filteredRows.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-1 text-xs text-slate-500">
                  <span>{visibleRows.length} of {filteredRows.length} matchups</span>
                  {visibleCount < filteredRows.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
                    >
                      Show 50 more
                    </button>
                  )}
                </div>
              )}

              <section aria-labelledby="bvp-signal-legend-title" className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <h2 id="bvp-signal-legend-title" className="text-xs font-black uppercase tracking-widest text-slate-500">Signal legend</h2>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>🎯 Elite xBA</span>
                  <span>💥 Elite hard-hit rate</span>
                  <span>💣 Elite barrel rate</span>
                  <span>⚔️ Vulnerable opposing pitcher</span>
                </div>
              </section>

              <section aria-labelledby="bvp-page-guide-title" className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 id="bvp-page-guide-title" className="text-base font-black text-slate-900">How to read this page</h2>
                    <p className="mt-0.5 text-xs text-slate-400">Terminology and Model Explanation</p>
                  </div>
                  {isCompactLayout && (
                    <button
                      type="button"
                      onClick={() => setHowToReadExpanded((v) => !v)}
                      aria-expanded={howToReadExpanded}
                      className="shrink-0 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-sky-300 hover:text-sky-800"
                    >
                      {howToReadExpanded ? "Show less" : "Click to expand"}
                    </button>
                  )}
                </div>
                {(!isCompactLayout || howToReadExpanded) && (
                  <div className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
                    <p>Matchup Score ranks today&apos;s batter vs. pitcher matchups against each other using current-season Statcast contact quality, opposing-pitcher vulnerability, and park and weather context.</p>
                    <p>Traditional batter-vs-pitcher history usually contains very small samples. Joe Knows Ball instead evaluates today&apos;s matchup using current-season contact quality, pitcher tendencies, and game context.</p>
                    <p>This is a research tool designed to compare matchups. It is not a betting recommendation.</p>
                  </div>
                )}
              </section>

              <RelatedTools currentToolId="batter-vs-pitcher" />
            </div>
        </div>
      </main>
  );
}
