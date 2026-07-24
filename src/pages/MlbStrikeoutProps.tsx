import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import RelatedTools from "@/components/mlb/RelatedTools";
import { FreshnessStatus } from "@/components/mlb/FreshnessStatus";
import { MlbParkFactorsStrip } from "@/components/mlb/MlbParkFactorsStrip";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { useIsCompactLayout } from "@/hooks/useIsCompactLayout";
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
  type PitcherStrikeoutTeamRow,
} from "@/pages/MlbHrProps";
import { buildKPropBestBets, type KBestBet } from "@/lib/mlb/kPropBestBets";
import { getProjectionEdgeInfo, sortByAbsoluteProjectionEdge, sortByProjectedKs } from "@/lib/mlb/kPropValueSorting";
import { describeKPropStatusReasons, resolveKPropStatus } from "@/lib/mlb/kPropStatus";
import { cn } from "@/lib/utils";
import { keyForStrikeoutPropRow, useMlbStrikeoutPropDetails } from "@/hooks/useMlbStrikeoutPropDetails";
import { useMlbKPropsV2Shadow, type KPropsV2ShadowRow } from "@/hooks/useMlbKPropsV2Shadow";
import MlbStrikeoutPropRowDetail, {
  MlbStrikeoutPropDetailsStaleBanner,
  MlbStrikeoutPropRowDetailLoading,
  MlbStrikeoutPropRowDetailStale,
  MlbStrikeoutPropRowDetailUnavailable,
} from "@/components/mlb/MlbStrikeoutPropRowDetail";

const DASH = "—";
/** The main table incrementally loads in pages of this size -- ranking/filtering is unaffected, this only limits how many already-sorted rows render at once. Mirrors the Batter View pattern from MlbHrProps.tsx. */
const PAGE_SIZE = 50;

type SortKey = "rank" | "pitcher" | "team" | "opponent" | "strikeoutMatchupScore" | "pitcherKSkillScore" | "opponentTeamStrikeoutScore" | "pitcherKRate" | "pitcherWhiffRate" | "pitcherKVs" | "opponentTeamKRate" | "opponentTeamWhiffRate" | "projectedKs" | "absoluteProjectionEdge";
type SortDirection = "asc" | "desc";

const confidenceOptions = ["All tiers", "Strong", "Positive", "Watch", "Neutral"];

/**
 * "Most Strikeouts" and "Best Value" use dedicated null-safe comparators
 * (see kPropValueSorting.ts) so a missing projection/line is never
 * fabricated into a 0 -- it always sorts after every row with a real
 * value. Best Value is always highest-absolute-edge-first regardless of
 * the toggled direction, matching its "rank by strength of edge" meaning;
 * every other column keeps the normal toggleable asc/desc compare.
 */
function sortRows(rows: PitcherStrikeoutTeamRow[], key: SortKey, dir: SortDirection) {
  if (key === "projectedKs") return sortByProjectedKs(rows, dir);
  if (key === "absoluteProjectionEdge") return sortByAbsoluteProjectionEdge(rows);

  const multiplier = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (typeof left === "string" || typeof right === "string") return String(left).localeCompare(String(right)) * multiplier;
    return (Number(left) - Number(right)) * multiplier;
  });
}

/** "+0.7 OVER" / "-1.1 UNDER" / "—" for neutral or unavailable rows. */
function formatEdgeLabel(row: PitcherStrikeoutTeamRow) {
  const info = getProjectionEdgeInfo(row);
  if (!info.isValid || info.projectionEdge == null || info.direction === "neutral") return DASH;
  const sign = info.projectionEdge > 0 ? "+" : "";
  return `${sign}${info.projectionEdge.toFixed(1)} ${info.direction.toUpperCase()}`;
}

/** Subtle row tint by favored side; falls back to the existing neutral alternating stripe. */
function getRowTintClass(row: PitcherStrikeoutTeamRow, index: number) {
  const { direction } = getProjectionEdgeInfo(row);
  if (direction === "over") return "bg-orange-50/70";
  if (direction === "under") return "bg-blue-50/70";
  return index % 2 === 0 ? "bg-white" : "bg-slate-50/70";
}

/** Same tint as getRowTintClass but fully opaque -- sticky cells need an opaque background of their own so horizontally-scrolled columns from the same row don't show through underneath them. */
function getStickyRowTintClass(row: PitcherStrikeoutTeamRow, index: number) {
  const { direction } = getProjectionEdgeInfo(row);
  if (direction === "over") return "bg-orange-50";
  if (direction === "under") return "bg-blue-50";
  return index % 2 === 0 ? "bg-white" : "bg-slate-50";
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return DASH;
  return value.toFixed(digits);
}

function fmtSigned(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return DASH;
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function resolveVenueIndicator(row: PitcherStrikeoutTeamRow) {
  const [away, home] = String(row.gameKey ?? "").split("@").map((team) => team.trim().toUpperCase());
  const team = row.team.trim().toUpperCase();
  if (team && home && team === home) return "Home";
  if (team && away && team === away) return "Away";
  return "N/A";
}

function makeSortIndicator(active: boolean, direction: SortDirection) {
  return active ? (direction === "asc" ? " ↑" : " ↓") : "";
}

/** Turns a keyForStrikeoutPropRow() key (e.g. "dean-kremer|bal|chc|2026-07-08") into a stable, DOM-safe id for a compact row's expand panel + aria-controls pair. Prefixed per call site so the main table and Low Confidence rows never collide even if a key were ever reused. */
function compactRowPanelId(prefix: string, rowKey: string) {
  return `${prefix}-${rowKey.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

function StatScorePill({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-400">{DASH}</span>;
  const number = Number(value);
  const tone = number >= 65 ? "bg-emerald-600 text-white" : number >= 58 ? "bg-emerald-100 text-emerald-800" : number < 50 ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700";
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black tabular-nums", tone)}>{number.toFixed(1)}</span>;
}

/** Compact labeled tile for the mobile "K Model Metrics" expand grid -- mirrors MlbHrProps.tsx's MetricTile for visual consistency between the two pages' mobile redesigns. */
function MetricTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 flex items-center gap-1">{children}</div>
    </div>
  );
}

/**
 * Debug-only projection comparison. Shows the value the page actually
 * publishes (`row.projectedKs`, already resolved at generation time) next to
 * both underlying projections, so a mismatch between "what shipped" and
 * "which source claims to have produced it" is visible rather than inferred.
 */
function KShadowDebugComparison({ shadowRow, row }: { shadowRow: KPropsV2ShadowRow; row?: PitcherStrikeoutTeamRow }) {
  const fallbackCount = shadowRow.v2.fallbacks.length;
  const warningCount = shadowRow.v2.warnings.length;
  const source = row?.projectionSource ?? null;
  const isV2Source = source === "v2";
  return (
    <div data-testid="k-v2-shadow-row-comparison" className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50/70 px-2 py-1.5 text-[10px] font-bold text-slate-700">
      <span
        data-testid="k-v2-resolved-projection"
        className={cn(
          "rounded-full border px-2 py-0.5",
          isV2Source ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-900",
        )}
      >
        Resolved {fmt(row?.projectedKs ?? null)}
      </span>
      {source && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">Source {source}</span>}
      {row?.projectionFallbackReason && (
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">Fallback {row.projectionFallbackReason}</span>
      )}
      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700">Legacy {fmt(row?.legacyProjectedKs ?? shadowRow.legacy.projectedKs)}</span>
      <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-slate-700">V2 {fmt(shadowRow.v2.projectedStrikeouts)}</span>
      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-700">Delta {fmtSigned(shadowRow.comparison.v2MinusLegacyKs)}</span>
      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">{shadowRow.v2.confidence} confidence</span>
      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-500">{shadowRow.v2.modelVersion}</span>
      {(fallbackCount > 0 || warningCount > 0) && (
        <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-amber-800">Incomplete inputs</span>
      )}
    </div>
  );
}

function StrikeoutPageGuide() {
  return (
    <section aria-labelledby="strikeout-page-guide-title" className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <h2 id="strikeout-page-guide-title" className="text-base font-black text-slate-900">How to use this page</h2>
      <div className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
        <p>This board ranks today&apos;s probable starters by K Score, a matchup-strength rating built from pitcher strikeout ability and the opposing lineup&apos;s strikeout tendencies.</p>
        <p>When sportsbook strikeout lines are available, the page also compares our projected strikeouts against the market line.</p>
        <p>Projected strikeouts combine pitcher strikeout skill, recent workload, expected batters faced and innings, whiff rate, opponent lineup strikeout tendencies, venue, handedness, and lineup context when available.</p>
        <p>This is a research tool designed to compare pitchers and prices. It is not a guarantee of results or a betting recommendation.</p>
      </div>
    </section>
  );
}

const LOW_CONFIDENCE_STATUS_LABELS: Record<string, string> = {
  LOW_CONFIDENCE: "Low confidence",
  INSUFFICIENT_DATA: "Insufficient data",
  INVALID_ODDS: "Invalid odds",
  INVALID_WORKLOAD: "Projection mismatch",
};

/** Exclusion badge + reason chips for a Low Confidence table row -- see kPropStatus.ts. */
/** `compact` omits the reason chips (kept for the desktop cell and the expand-grid detail) so the collapsed mobile row header -- a fixed-width flex row shared with the pitcher name -- only carries the short status label and never forces horizontal overflow. */
function LowConfidenceStatusBadge({ row, compact = false }: { row: PitcherStrikeoutTeamRow; compact?: boolean }) {
  const { status, reasons } = resolveKPropStatus(row);
  const label = LOW_CONFIDENCE_STATUS_LABELS[status] ?? status;
  const reasonLabels = describeKPropStatusReasons(reasons);
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800">{label}</span>
      {!compact && reasonLabels.length > 0 && (
        <span className="text-[10px] leading-tight text-slate-500">{reasonLabels.join(" · ")}</span>
      )}
    </div>
  );
}

function BestBetCard({ bet, compact = false }: { bet: KBestBet; compact?: boolean }) {
  const over = bet.side === "over";
  const logoSize = compact ? 54 : 64;

  return (
    <article className={cn(
      "rounded-2xl border bg-white shadow-sm",
      over ? "border-emerald-200" : "border-blue-200",
      compact ? "p-3" : "p-4",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl border bg-slate-50 shadow-inner",
          over ? "border-emerald-100" : "border-blue-100",
          compact ? "h-16 w-16" : "h-[72px] w-[72px]",
        )}>
          <MlbTeamLogo team={bet.team} size={logoSize} className="drop-shadow-sm" />
        </div>

        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", over ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800")}>
                {over ? "Top Over" : "Top Under"}
              </span>
              <span className="text-[10px] font-bold text-slate-400">{bet.team} vs {bet.opponent}</span>
            </div>
            <div className={cn("mt-1 truncate font-black text-slate-950", compact ? "text-base" : "text-lg")}>{bet.pitcher}</div>
            <div className="mt-1 text-xs text-slate-600">
              {over ? "Over" : "Under"} {bet.line.toFixed(1)} Ks <span className="font-black text-slate-900">{bet.odds}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Projection</div>
            <div className="text-xl font-black tabular-nums text-slate-950">{bet.projectedKs.toFixed(1)}</div>
          </div>
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
  const location = useLocation();
  const { dashboard, games, status, strikeoutDetailRows } = useMlbPropsData();
  const { loading: detailsLoading, fileUnavailable: detailsUnavailable, detailsByKey, detailsDate } = useMlbStrikeoutPropDetails();
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("All tiers");
  const [sortKey, setSortKey] = useState<SortKey>("strikeoutMatchupScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  /** Below the `lg` breakpoint (1024px): compact expandable-row layout instead of the desktop data tables. Resolved synchronously via matchMedia (see useIsCompactLayout) so the first render already reflects the real viewport, and rendered via JS branch (not CSS display toggling) so only one copy of each row ever sits in the DOM. Mirrors MlbHrProps.tsx. */
  const isCompactLayout = useIsCompactLayout();
  /** How many already-sorted/filtered rows are currently rendered -- "Show 50 more" grows this, a materially-changed filter/sort resets it. Never affects ranking order or which rows pass the filters, only how many of them are on screen. */
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  /** Mobile/tablet-only expand toggle for the relocated "How to read this page" section -- collapsed by default below lg, always open at lg and above. */
  const [howToReadExpanded, setHowToReadExpanded] = useState(false);
  const slateDate = dashboard?.date ?? null;
  const showKProjectionV2Debug = new URLSearchParams(location.search).get("debug") === "k-v2";
  const kV2Shadow = useMlbKPropsV2Shadow(showKProjectionV2Debug, slateDate);
  // A details file loaded successfully but generated for a different slate
  // than the page is currently showing (e.g. yesterday's committed data
  // still deployed on today's slate). Every row key will fail to match in
  // this state -- that's expected, not a per-pitcher data gap, so it gets
  // its own global banner + row message instead of the generic "unavailable".
  const isDetailsStale = Boolean(detailsDate && slateDate && detailsDate !== slateDate);

  const toggleRow = (row: PitcherStrikeoutTeamRow) => {
    const key = keyForStrikeoutPropRow(row, slateDate);
    setExpandedRowKey((current) => (current === key ? null : key));
  };

  function RowDetailPanel({ row }: { row: PitcherStrikeoutTeamRow }) {
    const key = keyForStrikeoutPropRow(row, slateDate);
    const shadowRow = showKProjectionV2Debug ? kV2Shadow.findShadowRow(row) : null;
    if (detailsLoading) return <MlbStrikeoutPropRowDetailLoading />;
    if (detailsUnavailable) return <MlbStrikeoutPropRowDetailUnavailable pitcher={row.pitcher} />;
    if (isDetailsStale) return <MlbStrikeoutPropRowDetailStale />;
    const detail = detailsByKey.get(key);
    if (!detail) return <MlbStrikeoutPropRowDetailUnavailable pitcher={row.pitcher} />;
    return <MlbStrikeoutPropRowDetail detail={detail} shadowRow={shadowRow} shadowArtifact={kV2Shadow.artifact} showV2Shadow={showKProjectionV2Debug} publicSlateDate={slateDate} row={row} />;
  }

  // Rows whose projection status disqualifies them from ranking/
  // recommendation move to the Low Confidence table below instead of the
  // main table -- see kPropStatus.ts. A row with simply no market posted
  // (NO_MARKET) is not a data-quality problem and stays in the main table
  // exactly as before this fix.
  const { mainRows, lowConfidenceRows } = useMemo(() => {
    const main: PitcherStrikeoutTeamRow[] = [];
    const lowConfidence: PitcherStrikeoutTeamRow[] = [];
    for (const row of strikeoutDetailRows) {
      const { status } = resolveKPropStatus(row);
      if (status === "VALID" || status === "NO_MARKET") main.push(row);
      else lowConfidence.push(row);
    }
    return { mainRows: main, lowConfidenceRows: lowConfidence };
  }, [strikeoutDetailRows]);

  const parkRows = useMemo(() => [...buildParkSidebarRows(games)].sort((a, b) => a.parkFactor - b.parkFactor), [games]);
  const teams = useMemo(() => Array.from(new Set(strikeoutDetailRows.flatMap((row) => [row.team, row.opponent]))).sort(), [strikeoutDetailRows]);
  const gameOptions = useMemo(() => games.map((game) => ({ value: game.gameKey, label: game.matchup })), [games]);
  const bestScore = mainRows[0]?.strikeoutMatchupScore ?? null;
  const hasKOdds = useMemo(() => mainRows.some((row) => (row.kLine != null && row.kLine > 0) || Boolean(row.kOddsOver) || Boolean(row.kOddsUnder)), [mainRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = mainRows.filter((row) => {
      if (teamFilter !== "all" && row.team !== teamFilter && row.opponent !== teamFilter) return false;
      if (gameFilter !== "all" && row.gameKey !== gameFilter) return false;
      if (confidenceFilter !== "All tiers" && getPropEdgeTier(row.strikeoutMatchupScore).label !== confidenceFilter) return false;
      if (!query) return true;
      return [row.pitcher, row.team, row.opponent, row.park, row.whyItRanksWell].some((value) => value.toLowerCase().includes(query));
    });
    return sortRows(rows, sortKey, sortDir);
  }, [mainRows, confidenceFilter, gameFilter, search, sortDir, sortKey, teamFilter]);

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleCount), [filteredRows, visibleCount]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, teamFilter, gameFilter, confidenceFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    setSortDir((current) => sortKey === key ? (current === "asc" ? "desc" : "asc") : ["pitcher", "team", "opponent"].includes(key) ? "asc" : "desc");
    setSortKey(key);
  };

  // `strikeoutDetailRows` is the single row collection this page renders a
  // table from -- unlike HR Props, this page never separately consumes
  // `pitchers` or `strikeoutRows`, so those aren't part of the visibility
  // decision. `status` (the shared hook's source of truth) decides what
  // FreshnessStatus says in either shell below; this boolean only decides
  // whether there's a table worth rendering at all.
  const hasUsableStrikeoutData = strikeoutDetailRows.length > 0;

  // FreshnessStatus explains shared MLB model freshness, but a nonblocking
  // status with zero rows still needs its own explanation for why the
  // table itself is empty -- otherwise "Current slate data" next to
  // nothing reads as broken, not merely row-less. Blocking/loading/
  // waiting/no-games statuses are already fully explained by
  // FreshnessStatus's own copy, so this never fires alongside those.
  const shouldShowNoProjectionRowsMessage =
    !hasUsableStrikeoutData
    && (status.kind === "current" || status.kind === "lineup-pending" || status.kind === "stale" || (status.kind === "error" && status.hasLastKnownData));

  if (status.kind === "loading") {
    return (
        <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
          <div className="space-y-4">
            <ModelSummaryHeader eyebrow="Pitcher prop model" title="MLB Strikeout Prop Model" description="Ranks probable starters by strikeout skill, whiff profile, and opponent lineup strikeout tendency using the current MLB props data." generatedAt={dashboard?.generatedAt} gamesCount={getGameCount(games)} rowsCount={0} bestScore={null} showUpdatedAt={false} siblingLinks={[{ label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" }, { label: "Batter vs Pitcher", to: "/mlb/batter-vs-pitcher", icon: "⚔️", color: "#8b5cf6" }, { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" }]} />
            <StrikeoutPageGuide />
            <FreshnessStatus status={status} />
          </div>
        </main>
    );
  }

  if (!hasUsableStrikeoutData) {
    return (
        <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
          <div className="space-y-4">
            <ModelSummaryHeader eyebrow="Pitcher prop model" title="MLB Strikeout Prop Model" description="Ranks probable starters by strikeout skill, whiff profile, and opponent lineup strikeout tendency using the current MLB props data." generatedAt={dashboard?.generatedAt} gamesCount={getGameCount(games)} rowsCount={0} bestScore={null} showUpdatedAt={false} siblingLinks={[{ label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" }, { label: "Batter vs Pitcher", to: "/mlb/batter-vs-pitcher", icon: "⚔️", color: "#8b5cf6" }, { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" }]} />
            <StrikeoutPageGuide />
            <FreshnessStatus status={status} />
            {shouldShowNoProjectionRowsMessage && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                Strikeout model data is available, but no pitcher projection rows are currently listed for this slate.
              </div>
            )}
          </div>
        </main>
    );
  }

  const SortTh = ({ k, label, help }: { k: SortKey; label: string; help?: string }) => (
    <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
      <button type="button" onClick={() => handleSort(k)} className="hover:text-slate-900" aria-label={help} title={help}>{label}{makeSortIndicator(sortKey === k, sortDir)}</button>
    </th>
  );

  return (
      <main className="site-page bg-[#edf2f7] py-4 text-slate-900">
        <div className="space-y-4">
          <MlbNavHero />
          <ModelSummaryHeader eyebrow="Pitcher prop model" title="MLB Strikeout Prop Model" description="Ranks probable starters by strikeout skill, whiff profile, and opponent lineup strikeout tendency using the current MLB props data." generatedAt={dashboard?.generatedAt} gamesCount={getGameCount(games)} rowsCount={strikeoutDetailRows.length} bestScore={bestScore} showUpdatedAt={false} siblingLinks={[{ label: "HR Props", to: "/mlb/hr-props", icon: "🔥", color: "#0ea5e9" }, { label: "Batter vs Pitcher", to: "/mlb/batter-vs-pitcher", icon: "⚔️", color: "#8b5cf6" }, { label: "MLB Hub", to: "/mlb", icon: "🏠", color: "rgba(255,255,255,0.15)" }]} />
          <FreshnessStatus status={status} />
          {isDetailsStale && <MlbStrikeoutPropDetailsStaleBanner detailsDate={detailsDate} slateDate={slateDate} />}
          {showKProjectionV2Debug && (
            <div data-testid="k-v2-shadow-debug-status" role="status" className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-slate-700">
              <div className="flex flex-wrap items-center gap-1.5 font-black uppercase tracking-wide">
                <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-sky-800">K Projection V2</span>
                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-800">Production</span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">Legacy = fail-safe fallback</span>
              </div>
              <p className="mt-1 leading-5">
                Public Proj K, edge, direction, sorting, best bets and X export attributes all use the resolved production projection
                (V2 when the artifact, row identity and confidence all pass; otherwise the stored legacy projection). This panel compares
                the two; it never changes what the page publishes. Artifact status: {kV2Shadow.status}.
              </p>
              {kV2Shadow.warnings.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px] font-semibold text-amber-800">
                  {Array.from(new Set(kV2Shadow.warnings)).map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
          )}
          <KBestBetsSection rows={strikeoutDetailRows} />

          <MlbParkFactorsStrip
            parks={parkRows}
            perspective="pitcher"
            subtitle="Pitcher-friendly order"
            showPrecipitation={false}
            collapsedPreviewCount={isCompactLayout ? 1 : undefined}
            expandLabel={isCompactLayout ? "Click to expand" : undefined}
            collapseLabel={isCompactLayout ? "Show less" : undefined}
          />

          <div className="space-y-4">
              <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid gap-2 sm:grid-cols-4">
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pitcher, team, park" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white" />
                  <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"><option value="all">All teams</option>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select>
                  <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"><option value="all">All games</option>{gameOptions.map((game) => <option key={game.value} value={game.value}>{game.label}</option>)}</select>
                  <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">{confidenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sort:</span>
                  <button
                    type="button"
                    onClick={() => { setSortKey("projectedKs"); setSortDir("desc"); }}
                    aria-pressed={sortKey === "projectedKs"}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-bold transition",
                      sortKey === "projectedKs" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    Most Strikeouts
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSortKey("absoluteProjectionEdge"); setSortDir("desc"); }}
                    aria-pressed={sortKey === "absoluteProjectionEdge"}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-bold transition",
                      sortKey === "absoluteProjectionEdge" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                    )}
                  >
                    Best Value
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Best Value ranks the largest differences between the model and sportsbook line. It includes both OVER and UNDER opportunities.</p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{filteredRows.length} pitchers shown</span><Link to="/mlb" className="font-bold text-sky-700 hover:underline">Back to MLB</Link></div>
              </section>

              <section data-x-export="mlb-strikeout-props" className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
                {isCompactLayout ? (
                  /* Mobile/tablet (below lg): compact expandable rows, mirroring MlbHrProps.tsx's Batter View. */
                  <div className="grid gap-2 p-3">
                    {visibleRows.length ? visibleRows.map((row) => {
                      const rowKey = keyForStrikeoutPropRow(row, slateDate);
                      const isExpanded = expandedRowKey === rowKey;
                      const panelId = compactRowPanelId("strikeout-row-detail", rowKey);
                      const edgeInfo = getProjectionEdgeInfo(row);
                      const hasPostedLine = row.kLine != null && row.kLine > 0;
                      const hasPostedOdds = Boolean(row.kOddsOver) || Boolean(row.kOddsUnder);
                      const tintClass = edgeInfo.direction === "over" ? "bg-orange-50/70" : edgeInfo.direction === "under" ? "bg-blue-50/70" : "bg-white";
                      const shadowRow = showKProjectionV2Debug ? kV2Shadow.findShadowRow(row) : null;
                      const venueIndicator = resolveVenueIndicator(row);
                      return (
                        <article key={`mobile-${row.rank}-${row.pitcher}`} className={cn("overflow-hidden rounded-xl border border-slate-100 shadow-sm", tintClass)}>
                          <button
                            type="button"
                            onClick={() => toggleRow(row)}
                            aria-expanded={isExpanded}
                            aria-controls={panelId}
                            aria-label={`${isExpanded ? "Hide" : "Show"} recent strikeout details for ${row.pitcher}`}
                            className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2">
                              <span className={cn("shrink-0 text-[10px] text-slate-400 transition-transform", isExpanded && "rotate-90")} aria-hidden="true">▶</span>
                              <MlbTeamLogo team={row.team} size={28} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-black text-slate-900">{row.pitcher}</div>
                                <div className="truncate text-[11px] text-slate-400">
                                  <span>vs {row.opponent}</span>
                                  <span className="ml-1">· {venueIndicator}</span>
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                {hasKOdds && (
                                  <span className="whitespace-nowrap text-[10px] font-bold text-slate-600">
                                    {hasPostedLine ? `${fmt(row.kLine)} K` : "No line yet"}
                                    {hasPostedOdds && <span className="ml-1 text-slate-400">O {row.kOddsOver ?? DASH} · U {row.kOddsUnder ?? DASH}</span>}
                                  </span>
                                )}
                                <PropScoreBadge score={row.strikeoutMatchupScore} />
                              </div>
                            </div>
                            <span className="pl-[18px] text-[9px] font-bold uppercase tracking-wide text-sky-700">
                              {isExpanded ? "Show less" : "Click to expand"}
                            </span>
                            {showKProjectionV2Debug && shadowRow && <KShadowDebugComparison shadowRow={shadowRow} row={row} />}
                            {showKProjectionV2Debug && !shadowRow && (
                              <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">No unambiguous V2 shadow match for this legacy row.</span>
                            )}
                          </button>
                          {isExpanded && (
                            <div id={panelId} className="space-y-3 border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-2">
                              <div>
                                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">K Model Metrics</div>
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                  {hasKOdds && (
                                    <MetricTile label="Edge">
                                      <span className={cn(
                                        "rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums",
                                        edgeInfo.direction === "over" ? "bg-orange-100 text-orange-800" : edgeInfo.direction === "under" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-400",
                                      )}>
                                        {formatEdgeLabel(row)}
                                      </span>
                                    </MetricTile>
                                  )}
                                  <MetricTile label="K Score"><StatScorePill value={row.strikeoutMatchupScore} /></MetricTile>
                                  <MetricTile label="K%"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.pitcherKRate)}%</span></MetricTile>
                                  <MetricTile label="Whiff%"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.pitcherWhiffRate)}%</span></MetricTile>
                                  <MetricTile label="K VS"><StatScorePill value={row.pitcherKVs} /></MetricTile>
                                  <MetricTile label="Pitcher K"><StatScorePill value={row.pitcherKSkillScore} /></MetricTile>
                                  <MetricTile label="Opp K%"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.opponentTeamKRate)}%</span></MetricTile>
                                  <MetricTile label="Opp Whiff%"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.opponentTeamWhiffRate)}%</span></MetricTile>
                                  <MetricTile label="Opp K Score"><StatScorePill value={row.opponentTeamStrikeoutScore} /></MetricTile>
                                  <MetricTile label="Venue"><span className="text-[11px] font-semibold text-slate-700">{venueIndicator}</span></MetricTile>
                                  <MetricTile label="K/9"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.projectedK9)}</span></MetricTile>
                                  <MetricTile label="Avg IP"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.projectedIP)}</span></MetricTile>
                                </div>
                              </div>
                              <div>
                                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Recent Starts</div>
                                <RowDetailPanel row={row} />
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    }) : (
                      <div className="px-3 py-6 text-center text-sm text-slate-500">No pitchers match the current filters.</div>
                    )}
                  </div>
                ) : (
                  /* Desktop (lg and above): existing table, unchanged. */
                  <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                  <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead className="sticky top-0 z-20"><tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <th className="sticky left-0 z-30 w-8 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <button type="button" onClick={() => handleSort("rank")} className="hover:text-slate-900" aria-label="Model Rank. This remains fixed even if you sort by another column." title="Model Rank. This remains fixed even if you sort by another column.">#{makeSortIndicator(sortKey === "rank", sortDir)}</button>
                      </th>
                      <th className="sticky left-8 z-30 min-w-[140px] border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                        <button type="button" onClick={() => handleSort("pitcher")} className="hover:text-slate-900">Pitcher{makeSortIndicator(sortKey === "pitcher", sortDir)}</button>
                      </th>
                      {hasKOdds && <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">K Line</th>}{hasKOdds && <SortTh k="projectedKs" label="Proj K" />}{hasKOdds && <SortTh k="absoluteProjectionEdge" label="Edge" />}<SortTh k="strikeoutMatchupScore" label="K Score" /><SortTh k="pitcherKRate" label="K%" /><SortTh k="pitcherWhiffRate" label="Whiff%" /><SortTh k="pitcherKVs" label="K VS" /><SortTh k="pitcherKSkillScore" label="Pitcher K" /><SortTh k="opponentTeamKRate" label="Opp K%" /><SortTh k="opponentTeamWhiffRate" label="Opp Whiff%" /><SortTh k="opponentTeamStrikeoutScore" label="Opp K Score" /><th className="hidden border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 xl:table-cell">K/9</th><th className="hidden border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 xl:table-cell">Avg IP</th>
                    </tr></thead>
                    <tbody>{visibleRows.length ? visibleRows.map((row, index) => {
                      const rowKey = keyForStrikeoutPropRow(row, slateDate);
                      const isExpanded = expandedRowKey === rowKey;
                      const desktopColumnCount = hasKOdds ? 15 : 12;
                      const edgeInfo = getProjectionEdgeInfo(row);
                      const hasPostedLine = row.kLine != null && row.kLine > 0;
                      const hasPostedOdds = Boolean(row.kOddsOver) || Boolean(row.kOddsUnder);
                      const rowLabel = `${isExpanded ? "Hide" : "Show"} recent strikeout details for ${row.pitcher}`;
                      const shadowRow = showKProjectionV2Debug ? kV2Shadow.findShadowRow(row) : null;
                      const venueIndicator = resolveVenueIndicator(row);
                      const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleRow(row);
                        }
                      };
                      return (
                      <Fragment key={`${row.rank}-${row.pitcher}-${row.team}`}>
                      <tr
                        onClick={() => toggleRow(row)}
                        onKeyDown={onRowKeyDown}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-label={rowLabel}
                        className={cn("cursor-pointer transition-colors hover:brightness-[0.98]", getRowTintClass(row, index))}
                      >
                      <td className={cn("sticky left-0 z-10 border-b border-r border-slate-100 px-2 py-1 text-[10px] font-black text-slate-400", getStickyRowTintClass(row, index))}>{row.rank}</td><td className={cn("sticky left-8 z-10 border-b border-r border-slate-100 px-2 py-1", getStickyRowTintClass(row, index))}>
                        <span className="flex min-w-0 items-center gap-1">
                          <span className={cn("shrink-0 text-[9px] text-slate-400 transition-transform", isExpanded && "rotate-90")} aria-hidden="true">▶</span>
                          <MlbTeamLogo team={row.team} size={16} /><span className="min-w-0 truncate text-[11px] font-semibold text-slate-900">{row.pitcher}</span><span className="shrink-0 text-[9px] text-slate-400">vs {row.opponent}</span><span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-500">{venueIndicator}</span>
                        </span>
                      </td>
                      {hasKOdds && <td className="border-b border-slate-100 px-2 py-1"><div className="font-semibold text-slate-900">{hasPostedLine ? fmt(row.kLine) : "No line posted yet"}</div>{hasPostedOdds ? <div className="text-[9px] text-slate-500">O {row.kOddsOver ?? DASH} · U {row.kOddsUnder ?? DASH}</div> : hasPostedLine ? <div className="max-w-[120px] text-[9px] leading-4 text-slate-500">Odds not yet available for this slate.</div> : null}</td>}
                      {hasKOdds && <td className="border-b border-slate-100 px-2 py-1 font-semibold text-slate-900">{fmt(edgeInfo.projectedKs)}</td>}
                      {hasKOdds && (
                        <td className="border-b border-slate-100 px-2 py-1">
                          <span className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums",
                            edgeInfo.direction === "over" ? "bg-orange-100 text-orange-800" : edgeInfo.direction === "under" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-400",
                          )}>
                            {formatEdgeLabel(row)}
                          </span>
                        </td>
                      )}
                      <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.strikeoutMatchupScore} /></td><td className="border-b border-slate-100 px-2 py-1">{fmt(row.pitcherKRate)}%</td><td className="border-b border-slate-100 px-2 py-1">{fmt(row.pitcherWhiffRate)}%</td><td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKVs} /></td><td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKSkillScore} /></td><td className="border-b border-slate-100 px-2 py-1">{fmt(row.opponentTeamKRate)}%</td><td className="border-b border-slate-100 px-2 py-1">{fmt(row.opponentTeamWhiffRate)}%</td><td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.opponentTeamStrikeoutScore} /></td><td className="hidden border-b border-slate-100 px-2 py-1 font-semibold xl:table-cell">{fmt(row.projectedK9)}</td><td className="hidden border-b border-slate-100 px-2 py-1 font-semibold xl:table-cell">{fmt(row.projectedIP)}</td>
                      </tr>
                      {showKProjectionV2Debug && (
                        <tr>
                          <td colSpan={desktopColumnCount} className="border-b border-slate-100 bg-slate-50 px-2 py-1.5">
                            {shadowRow ? <KShadowDebugComparison shadowRow={shadowRow} row={row} /> : <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-800">No unambiguous V2 shadow match for {row.pitcher}. Legacy row remains usable.</div>}
                          </td>
                        </tr>
                      )}
                      {isExpanded && (
                        <tr>
                          <td colSpan={desktopColumnCount} className="border-b border-slate-100 bg-slate-50 px-2 py-2">
                            <RowDetailPanel row={row} />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    }) : <tr><td colSpan={hasKOdds ? 15 : 12} className="px-3 py-6 text-center text-sm text-slate-500">No pitchers match the current filters.</td></tr>}</tbody>
                  </table>
                  </div>
                )}
              </section>

              {filteredRows.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-1 text-xs text-slate-500">
                  <span>{visibleRows.length} of {filteredRows.length} pitchers</span>
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

              {lowConfidenceRows.length > 0 && (
                <details className="group overflow-hidden rounded-[20px] border border-amber-200 bg-white shadow-sm">
                  <summary className="cursor-pointer list-none border-b border-amber-100 bg-amber-50/60 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-black text-amber-900">Low Confidence <span className="font-bold text-amber-700">({lowConfidenceRows.length})</span></div>
                        <p className="mt-0.5 text-[11px] text-amber-800">
                          These pitchers are excluded from Best Value, Best Bets, and social picks because of a data or odds quality issue -- not because the model is confident in an UNDER. All currently available data is shown; unavailable metrics show as {DASH} instead of a fabricated number.
                        </p>
                      </div>
                      <span className="shrink-0 text-amber-700 transition-transform duration-150 group-open:rotate-180" aria-hidden="true">⌄</span>
                    </div>
                  </summary>

                  {isCompactLayout ? (
                    /* Mobile/tablet (below lg): compact expandable rows, mirroring the main table above. */
                    <div className="grid gap-2 p-3">
                      {lowConfidenceRows.map((row) => {
                        const rowKey = keyForStrikeoutPropRow(row, slateDate);
                        const isExpanded = expandedRowKey === rowKey;
                        const panelId = compactRowPanelId("strikeout-lowconf-detail", rowKey);
                        return (
                          <article key={`mobile-low-confidence-${row.rank}-${row.pitcher}`} className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50/20 shadow-sm">
                            <button
                              type="button"
                              onClick={() => toggleRow(row)}
                              aria-expanded={isExpanded}
                              aria-controls={panelId}
                              aria-label={`${isExpanded ? "Hide" : "Show"} recent strikeout details for ${row.pitcher}`}
                              className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-amber-50"
                            >
                              <div className="flex items-center gap-2">
                                <span className={cn("shrink-0 text-[10px] text-slate-400 transition-transform", isExpanded && "rotate-90")} aria-hidden="true">▶</span>
                                <MlbTeamLogo team={row.team} size={28} />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[13px] font-black text-slate-900">{row.pitcher}</div>
                                  <div className="truncate text-[11px] text-slate-400">vs {row.opponent}</div>
                                </div>
                                <div className="shrink-0"><LowConfidenceStatusBadge row={row} compact /></div>
                              </div>
                              <span className="pl-[18px] text-[9px] font-bold uppercase tracking-wide text-sky-700">
                                {isExpanded ? "Show less" : "Click to expand"}
                              </span>
                            </button>
                            {isExpanded && (
                              <div id={panelId} className="space-y-3 border-t border-amber-100 bg-amber-50/40 px-3 pb-3 pt-2">
                                <div>
                                  <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Exclusion Reason</div>
                                  <LowConfidenceStatusBadge row={row} />
                                </div>
                                <div>
                                  <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">K Model Metrics</div>
                                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                    <MetricTile label="K Score"><StatScorePill value={row.strikeoutMatchupScore} /></MetricTile>
                                    <MetricTile label="K%"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.pitcherKRate)}%</span></MetricTile>
                                    <MetricTile label="Whiff%"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.pitcherWhiffRate)}%</span></MetricTile>
                                    <MetricTile label="K VS"><StatScorePill value={row.pitcherKVs} /></MetricTile>
                                    <MetricTile label="Pitcher K"><StatScorePill value={row.pitcherKSkillScore} /></MetricTile>
                                    <MetricTile label="Opp K%"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.opponentTeamKRate)}%</span></MetricTile>
                                    <MetricTile label="Opp Whiff%"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.opponentTeamWhiffRate)}%</span></MetricTile>
                                    <MetricTile label="K/9"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.projectedK9)}</span></MetricTile>
                                    <MetricTile label="Avg IP"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.projectedIP)}</span></MetricTile>
                                  </div>
                                </div>
                                <div>
                                  <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Recent Starts</div>
                                  <RowDetailPanel row={row} />
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    /* Desktop (lg and above): existing table, unchanged. */
                    <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                    <table className="min-w-full border-separate border-spacing-0 text-xs">
                      <thead className="sticky top-0 z-20"><tr className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">#</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">Pitcher</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">Status</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">K Score</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">K%</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Whiff%</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">K VS</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Pitcher K</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Opp K%</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Opp Whiff%</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">K/9</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Avg IP</th>
                      </tr></thead>
                      <tbody>{lowConfidenceRows.map((row, index) => {
                        const rowKey = keyForStrikeoutPropRow(row, slateDate);
                        const isExpanded = expandedRowKey === rowKey;
                        const rowLabel = `${isExpanded ? "Hide" : "Show"} recent strikeout details for ${row.pitcher}`;
                        const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleRow(row);
                          }
                        };
                        return (
                        <Fragment key={`low-confidence-${row.rank}-${row.pitcher}-${row.team}`}>
                        <tr
                          onClick={() => toggleRow(row)}
                          onKeyDown={onRowKeyDown}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-label={rowLabel}
                          className={cn("cursor-pointer transition-colors hover:brightness-[0.98]", index % 2 === 0 ? "bg-white" : "bg-amber-50/30")}
                        >
                        <td className="border-b border-slate-100 px-2 py-1 text-[10px] font-black text-slate-400">{index + 1}</td>
                        <td className="border-b border-slate-100 px-2 py-1">
                          <span className="flex items-center gap-1">
                            <span className={cn("shrink-0 text-[9px] text-slate-400 transition-transform", isExpanded && "rotate-90")} aria-hidden="true">▶</span>
                            <MlbTeamLogo team={row.team} size={16} /><span className="whitespace-nowrap text-[11px] font-semibold text-slate-900">{row.pitcher}</span><span className="text-[9px] text-slate-400">vs {row.opponent}</span>
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-1"><LowConfidenceStatusBadge row={row} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.strikeoutMatchupScore} /></td>
                        <td className="border-b border-slate-100 px-2 py-1">{fmt(row.pitcherKRate)}%</td>
                        <td className="border-b border-slate-100 px-2 py-1">{fmt(row.pitcherWhiffRate)}%</td>
                        <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKVs} /></td>
                        <td className="border-b border-slate-100 px-2 py-1"><StatScorePill value={row.pitcherKSkillScore} /></td>
                        <td className="border-b border-slate-100 px-2 py-1">{fmt(row.opponentTeamKRate)}%</td>
                        <td className="border-b border-slate-100 px-2 py-1">{fmt(row.opponentTeamWhiffRate)}%</td>
                        <td className="border-b border-slate-100 px-2 py-1 font-semibold">{fmt(row.projectedK9)}</td>
                        <td className="border-b border-slate-100 px-2 py-1 font-semibold">{fmt(row.projectedIP)}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={11} className="border-b border-slate-100 bg-slate-50 px-2 py-2">
                              <RowDetailPanel row={row} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                        );
                      })}</tbody>
                    </table>
                    </div>
                  )}
                </details>
              )}

              <section aria-labelledby="strikeout-page-guide-title" className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 id="strikeout-page-guide-title" className="text-base font-black text-slate-900">How to use this page</h2>
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
                    <p>This board ranks today&apos;s probable starters by K Score, a matchup-strength rating built from pitcher strikeout ability and the opposing lineup&apos;s strikeout tendencies.</p>
                    <p>When sportsbook strikeout lines are available, the page also compares our projected strikeouts against the market line.</p>
                    <p>Projected strikeouts combine pitcher strikeout skill, recent workload, expected batters faced and innings, whiff rate, opponent lineup strikeout tendencies, venue, handedness, and lineup context when available.</p>
                    <p>This is a research tool designed to compare pitchers and prices. It is not a guarantee of results or a betting recommendation.</p>
                  </div>
                )}
              </section>

              <section aria-labelledby="strikeout-edge-guide-title" className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <h2 id="strikeout-edge-guide-title" className="text-sm font-black text-slate-900">Understanding Edge</h2>
                {(!isCompactLayout || howToReadExpanded) && (
                  <div className="mt-1.5 space-y-1 text-xs leading-5 text-slate-600">
                    <p>Edge compares our projected strikeouts to the sportsbook line.</p>
                    <p><strong className="text-slate-900">OVER</strong> means the model projects more strikeouts than the posted line. <strong className="text-slate-900">UNDER</strong> means fewer.</p>
                    <p>Edge measures model disagreement with the market—it is not a betting recommendation by itself.</p>
                    {!hasKOdds && <p className="font-semibold text-slate-500">No line posted yet. Odds not yet available for this slate.</p>}
                  </div>
                )}
              </section>

              <RelatedTools currentToolId="strikeout-props" />
            </div>
        </div>
      </main>
  );
}
