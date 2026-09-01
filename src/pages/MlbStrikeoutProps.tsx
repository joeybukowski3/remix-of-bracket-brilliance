import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
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
  TeamLogoText,
} from "@/components/mlb/MlbPropModelComponents";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { PercentileCell } from "@/components/mlb/MlbPercentileScoreCell";
import { buildPercentileLookup, lookupPercentile } from "@/lib/mlb/percentileColorScale";
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
import { useMlbKPlusEv } from "@/hooks/useMlbKPlusEv";
import { evaluateKPlusEvArtifact } from "@/lib/mlb/kPlusEvSourceAdapter";
import KPlusEvTable from "@/components/mlb/KPlusEvTable";
import MlbStrikeoutPropRowDetail, {
  MlbStrikeoutCompactAccordion,
  MlbStrikeoutPropDetailsStaleBanner,
  MlbStrikeoutPropRowDetailLoading,
  MlbStrikeoutPropRowDetailStale,
  MlbStrikeoutPropRowDetailUnavailable,
} from "@/components/mlb/MlbStrikeoutPropRowDetail";
import { compareGameStartTime, formatGameTime } from "@/lib/mlb/mlbGameTime";
import { formatRankOrdinal, rankHeatValueClass } from "@/lib/mlb/rankPresentation";
import {
  DenseTableScroller,
  TABLE_LAYER,
  frozenDenseColumn,
  stickyDenseHeader,
} from "@/components/ui/dense-table";

const DASH = "—";
/** The main table incrementally loads in pages of this size -- ranking/filtering is unaffected, this only limits how many already-sorted rows render at once. Mirrors the Batter View pattern from MlbHrProps.tsx. */
const PAGE_SIZE = 50;

type SortKey = "rank" | "pitcher" | "team" | "opponent" | "strikeoutMatchupScore" | "pitcherKSkillScore" | "opponentTeamStrikeoutScore" | "pitcherKRate" | "pitcherWhiffRate" | "pitcherKVs" | "opponentTeamKRate" | "opponentTeamWhiffRate" | "projectedKs" | "absoluteProjectionEdge" | "gameStartTime";
type SortDirection = "asc" | "desc";
type ComparativeMetricTone = "positive" | "negative" | "neutral";
type ComparativeMetricKey = "pitcherSeasonKPerGame" | "pitcherLastFiveKPerGame" | "pitcherVenueKPerGame" | "projectedIP" | "seasonVsHand" | "opponentVenueKPerGame";

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
  if (key === "gameStartTime") return [...rows].sort((a, b) => compareGameStartTime(a.gameStartTime, b.gameStartTime, dir));

  const multiplier = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (typeof left === "string" || typeof right === "string") return String(left).localeCompare(String(right)) * multiplier;
    return (Number(left) - Number(right)) * multiplier;
  });
}

/** Signed numeric edge only; color communicates OVER (amber) vs UNDER (blue). */
function formatEdgeLabel(row: PitcherStrikeoutTeamRow) {
  const info = getProjectionEdgeInfo(row);
  if (!info.isValid || info.projectionEdge == null || info.direction === "neutral") return DASH;
  const sign = info.projectionEdge > 0 ? "+" : "";
  return `${sign}${info.projectionEdge.toFixed(1)}`;
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

function perGame(total: number | null | undefined, games: number | null | undefined) {
  return total == null || games == null || games <= 0 ? null : total / games;
}

function RankHeatValue({ rank }: { rank: number | null | undefined }) {
  return <span data-testid="mlb-rank-heat" className={rankHeatValueClass(rank)}>{formatRankOrdinal(rank)}</span>;
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

export function resolveComparativeMetricTone(
  value: number | null | undefined,
  percentileLookup: Map<number, number>,
  direction: "higherBetter" | "lowerBetter" = "higherBetter",
): ComparativeMetricTone {
  const percentile = lookupPercentile(value, percentileLookup);
  if (percentile == null || percentileLookup.size < 2) return "neutral";
  if (direction === "lowerBetter") {
    if (percentile <= 20) return "positive";
    if (percentile >= 50) return "negative";
    return "neutral";
  }
  if (percentile >= 50) return "positive";
  if (percentile <= 20) return "negative";
  return "neutral";
}

function comparativeMetricToneClass(tone: ComparativeMetricTone) {
  if (tone === "positive") return "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200/70";
  if (tone === "negative") return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/70";
  return "text-slate-700";
}

function ComparativeMetricValue({ children, tone }: { children: ReactNode; tone: ComparativeMetricTone }) {
  return (
    <span data-metric-tone={tone} className={cn("inline-block rounded-md px-1.5 py-0.5 font-semibold tabular-nums", comparativeMetricToneClass(tone))}>
      {children}
    </span>
  );
}

function venueTileClass(venue: string) {
  if (venue === "Home") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (venue === "Away") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-white text-slate-500";
}

export function perInning(total: number | null | undefined, outs: number | null | undefined) {
  if (total == null || outs == null || !Number.isFinite(total) || !Number.isFinite(outs) || outs <= 0) return null;
  return (total * 3) / outs;
}

function paWeightedStrikeoutRate(values: Array<{ rate: number | null | undefined; plateAppearances: number | null | undefined }>) {
  let weightedTotal = 0;
  let totalPlateAppearances = 0;
  for (const value of values) {
    if (value.rate == null || !Number.isFinite(value.rate) || value.plateAppearances == null || !Number.isFinite(value.plateAppearances) || value.plateAppearances <= 0) continue;
    weightedTotal += value.rate * value.plateAppearances;
    totalPlateAppearances += value.plateAppearances;
  }
  return totalPlateAppearances > 0 ? (weightedTotal / totalPlateAppearances) * 100 : null;
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

/** Strikeout Props main table region has exactly one primary view at a time -- "score" (default) is the existing K Score board, "ev" is the standalone K +EV V1 table. Backed by the ?view= query param (see VIEW_QUERY_PARAM) so the MLB sidebar's PLUS EV section and the MLB Hub's +EV Props block can deep-link directly into the +EV view without duplicating this page. */
export type KPropsTableView = "score" | "ev";
export const DEFAULT_K_PROPS_TABLE_VIEW: KPropsTableView = "score";
export const K_PROPS_VIEW_QUERY_PARAM = "view";
export const K_PROPS_EV_VIEW_QUERY_VALUE = "ev";

export default function MlbStrikeoutProps() {
  usePageSeo(getSeoMeta("mlb-strikeout-props"));
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
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
  /**
   * K Props +EV V1 -- a standalone model, selectable via the K Score / +EV
   * tabs below. Defaults to "score" so the existing K Score view remains the
   * default page experience; seeded from ?view=ev so direct links (MLB
   * sidebar, MLB Hub) can open straight into the +EV view. Tab clicks use
   * `replace` so toggling views doesn't spam browser history -- only actual
   * navigations (including a deep link's initial load) create a history
   * entry, so back/forward behavior for real navigation is unaffected.
   */
  const tableView: KPropsTableView = searchParams.get(K_PROPS_VIEW_QUERY_PARAM) === K_PROPS_EV_VIEW_QUERY_VALUE ? "ev" : DEFAULT_K_PROPS_TABLE_VIEW;
  const setTableView = (next: KPropsTableView) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "ev") nextParams.set(K_PROPS_VIEW_QUERY_PARAM, K_PROPS_EV_VIEW_QUERY_VALUE);
    else nextParams.delete(K_PROPS_VIEW_QUERY_PARAM);
    setSearchParams(nextParams, { replace: true });
  };
  const kPlusEv = useMlbKPlusEv(true);
  const kPlusEvRows = useMemo(() => evaluateKPlusEvArtifact(kPlusEv.artifact), [kPlusEv.artifact]);
  /** +EV mode's primary table only shows pitchers with a complete valuation (row.available) -- eligibility/model math is untouched, this is a display filter so partial/incomplete rows never render fabricated prices. Excluded pitchers remain fully visible in K Score mode. */
  const kPlusEvAvailableRows = useMemo(() => kPlusEvRows.filter((row) => row.available), [kPlusEvRows]);
  const kPlusEvExcludedCount = kPlusEvRows.length - kPlusEvAvailableRows.length;
  // A details file loaded successfully but generated for a different slate
  // than the page is currently showing (e.g. yesterday's committed data
  // still deployed on today's slate). Every row key will fail to match in
  // this state -- that's expected, not a per-pitcher data gap, so it gets
  // its own global banner + row message instead of the generic "unavailable".
  const isDetailsStale = Boolean(detailsDate && slateDate && detailsDate !== slateDate);

  const getDisplayMetrics = (row: PitcherStrikeoutTeamRow) => {
    const detail = isDetailsStale ? undefined : detailsByKey.get(keyForStrikeoutPropRow(row, slateDate));
    const venue = resolveVenueIndicator(row);
    const homeSeason = detail?.pitcherVenueSplits?.home.season;
    const awaySeason = detail?.pitcherVenueSplits?.away.season;
    const activeSeasonSplits = [homeSeason, awaySeason].filter((split) => split && split.gamesUsed > 0);
    const canCombineSeason = activeSeasonSplits.length > 0 && activeSeasonSplits.every((split) => split?.strikeouts != null);
    const seasonGames = canCombineSeason ? activeSeasonSplits.reduce((sum, split) => sum + (split?.gamesUsed ?? 0), 0) : null;
    const seasonStrikeouts = canCombineSeason ? activeSeasonSplits.reduce((sum, split) => sum + (split?.strikeouts ?? 0), 0) : null;
    const pitcherVenueSeason = venue === "Home" ? homeSeason : venue === "Away" ? awaySeason : undefined;

    const pitcher = dashboard?.pitchers?.find((candidate) =>
      (row.pitcherId != null && candidate.pitcherId === row.pitcherId)
      || (candidate.pitcher === row.pitcher && candidate.gameKey === row.gameKey)
    );
    const hand = String(pitcher?.hand ?? "").trim().toUpperCase();
    const opponentBatters = dashboard?.batters?.filter((batter) => batter.gameKey === row.gameKey && batter.team === row.opponent) ?? [];
    const seasonVsHand = paWeightedStrikeoutRate(opponentBatters.map((batter) => {
      const split = hand.startsWith("L")
        ? batter.handednessSplits?.vsLeft
        : hand.startsWith("R")
          ? batter.handednessSplits?.vsRight
          : null;
      return { rate: split?.strikeoutRate ?? null, plateAppearances: split?.plateAppearances ?? null };
    }));

    const opponentSite = venue === "Home" ? "away" : venue === "Away" ? "home" : null;
    const opponentSiteContext = opponentSite ? detail?.opponentContext?.[opponentSite] : undefined;
    const opponentReference = detail?.opponentReference;

    return {
      pitcherSeasonKPerGame: perGame(seasonStrikeouts, seasonGames),
      seasonVsHand,
      pitcherLastFiveKPerGame: detail?.pitcherLastFiveSummary?.averageStrikeouts ?? null,
      pitcherVenueKPerGame: perGame(pitcherVenueSeason?.strikeouts, pitcherVenueSeason?.gamesUsed),
      opponentVenueKPerGame: opponentSiteContext?.kPerNine ?? null,
      opponentWrcPlusRankL30VsHand: opponentReference?.opponentWrcPlusRankL30VsHand ?? null,
      opponentWrcPlusRankL30AtSite: opponentSite === "home"
        ? opponentReference?.opponentWrcPlusRankL30Home ?? null
        : opponentSite === "away"
          ? opponentReference?.opponentWrcPlusRankL30Away ?? null
          : null,
      opponentWrcPlusRankL10: opponentReference?.opponentWrcPlusRankL10 ?? null,
    };
  };

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
    return <MlbStrikeoutPropRowDetail detail={detail} shadowRow={shadowRow} shadowArtifact={kV2Shadow.artifact} showV2Shadow={showKProjectionV2Debug} publicSlateDate={slateDate} row={row} compactLayout={isCompactLayout} />;
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

  /** Player Score percentile lookup for the main table -- ranked rows only (excludes Low Confidence), so the shared 8-tier scale stays stable while the user searches, filters, or sorts. Same scale as Batter vs. Pitcher's Matchup Score. */
  const kScorePercentileLookup = useMemo(() => buildPercentileLookup(mainRows.map((row) => row.strikeoutMatchupScore)), [mainRows]);

  const parkRows = useMemo(() => [...buildParkSidebarRows(games)].sort((a, b) => a.parkFactor - b.parkFactor), [games]);
  const teams = useMemo(() => Array.from(new Set(strikeoutDetailRows.flatMap((row) => [row.team, row.opponent]))).sort(), [strikeoutDetailRows]);
  const gameOptions = useMemo(() => games.map((game) => ({ value: game.gameKey, label: game.matchup })), [games]);
  const bestScore = mainRows[0]?.strikeoutMatchupScore ?? null;
  const hasKOdds = useMemo(() => mainRows.some((row) => (row.kLine != null && row.kLine > 0) || Boolean(row.kOddsOver) || Boolean(row.kOddsUnder)), [mainRows]);
  const marketsUnavailable = mainRows.length > 0 && !hasKOdds;

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
  const visibleMetricRows = visibleRows.map((row) => ({
    key: keyForStrikeoutPropRow(row, slateDate),
    row,
    metrics: getDisplayMetrics(row),
  }));
  const visibleMetricsByKey = new Map(visibleMetricRows.map(({ key, metrics }) => [key, metrics]));
  const comparativeMetricLookups: Record<ComparativeMetricKey, Map<number, number>> = {
    pitcherSeasonKPerGame: buildPercentileLookup(visibleMetricRows.map(({ metrics }) => metrics.pitcherSeasonKPerGame)),
    pitcherLastFiveKPerGame: buildPercentileLookup(visibleMetricRows.map(({ metrics }) => metrics.pitcherLastFiveKPerGame)),
    pitcherVenueKPerGame: buildPercentileLookup(visibleMetricRows.map(({ metrics }) => metrics.pitcherVenueKPerGame)),
    projectedIP: buildPercentileLookup(visibleMetricRows.map(({ row }) => row.projectedIP)),
    seasonVsHand: buildPercentileLookup(visibleMetricRows.map(({ metrics }) => metrics.seasonVsHand)),
    opponentVenueKPerGame: buildPercentileLookup(visibleMetricRows.map(({ metrics }) => metrics.opponentVenueKPerGame)),
  };
  const metricTone = (key: ComparativeMetricKey, value: number | null | undefined) => resolveComparativeMetricTone(
    value,
    comparativeMetricLookups[key],
    "higherBetter",
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, teamFilter, gameFilter, confidenceFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    setSortDir((current) => sortKey === key ? (current === "asc" ? "desc" : "asc") : ["pitcher", "team", "opponent", "gameStartTime"].includes(key) ? "asc" : "desc");
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
    <th className="border-b border-slate-200 bg-slate-50 px-1.5 py-2 text-center align-middle font-black uppercase leading-tight text-slate-500">
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

          <section id="k-props-table-view" className="rounded-[20px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">{tableView === "ev" ? "K +EV Table" : "K Score Board"}</h2>
                <p className="text-xs text-slate-500">
                  {tableView === "ev"
                    ? "Standalone K Props +EV V1 model (season K/IP, recent trend, workload, home/away, and lineup-vs-hand matchup). Independent of the K Score model."
                    : "Ranks today's probable starters by K Score, a matchup-strength rating."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Strikeout Props table view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tableView === "score"}
                  onClick={() => setTableView("score")}
                  className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition", tableView === "score" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900")}
                >
                  K Score
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tableView === "ev"}
                  onClick={() => setTableView("ev")}
                  className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition", tableView === "ev" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900")}
                >
                  +EV
                </button>
              </div>
            </div>
            {tableView === "ev" ? (
              <div>
                <div className="border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 text-xs text-slate-600">
                  {kPlusEvRows.length > 0 ? (
                    <>
                      <span className="font-bold text-slate-800">{kPlusEvAvailableRows.length} of {kPlusEvRows.length} starters eligible for +EV modeling</span>
                      {kPlusEvExcludedCount > 0 && <span className="ml-1.5 text-slate-500">· {kPlusEvExcludedCount} excluded due to insufficient season or split data</span>}
                    </>
                  ) : (
                    <span>+EV eligibility summary is unavailable until today's slate loads.</span>
                  )}
                </div>
                {kPlusEv.status === "valid" ? (
                  <KPlusEvTable rows={kPlusEvAvailableRows} compact={isCompactLayout} />
                ) : (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">
                    {kPlusEv.loading ? "Loading K +EV data…" : "K +EV data is unavailable for today's slate."}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <MlbParkFactorsStrip
            parks={parkRows}
            perspective="pitcher"
            subtitle="Pitcher-friendly order"
            showPrecipitation={false}
            collapsedPreviewCount={isCompactLayout ? 1 : undefined}
            expandLabel={isCompactLayout ? "Click to expand" : undefined}
            collapseLabel={isCompactLayout ? "Show less" : undefined}
            selectedGameKey={gameFilter}
            onSelectGame={setGameFilter}
          />

          <div className="space-y-4">
              {tableView === "score" ? (
              <div data-k-props-score-view="true" className="space-y-4">
              <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid gap-2 sm:grid-cols-4">
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pitcher, team, park" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:bg-white" />
                  <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"><option value="all">All teams</option>{teams.map((team) => <option key={team} value={team}>{team}</option>)}</select>
                  <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none"><option value="all">All games</option>{gameOptions.map((game) => <option key={game.value} value={game.value}>{game.label}</option>)}</select>
                  <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none">{confidenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                </div>
                <div className="mt-3">
                  <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">Sort</span>
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                    <button type="button" aria-label="Most Strikeouts" onClick={() => { setSortKey("strikeoutMatchupScore"); setSortDir("desc"); }} aria-pressed={sortKey === "strikeoutMatchupScore"} className={cn("min-w-0 rounded-xl border px-2.5 py-2 text-left text-[11px] font-black leading-tight shadow-sm transition sm:min-w-[132px]", sortKey === "strikeoutMatchupScore" ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400")}>
                      Most Strikeouts<span className={cn("mt-0.5 block text-[9px] font-semibold", sortKey === "strikeoutMatchupScore" ? "text-emerald-50" : "text-emerald-600")}>K Score ↓</span>
                    </button>
                    <button type="button" aria-label="Best Value" disabled={marketsUnavailable} onClick={() => { setSortKey("absoluteProjectionEdge"); setSortDir("desc"); }} aria-pressed={sortKey === "absoluteProjectionEdge"} className={cn("min-w-0 rounded-xl border px-2.5 py-2 text-left text-[11px] font-black leading-tight shadow-sm transition sm:min-w-[132px]", marketsUnavailable ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : sortKey === "absoluteProjectionEdge" ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-400")}>
                      Best Value<span className={cn("mt-0.5 block text-[9px] font-semibold", marketsUnavailable ? "text-slate-400" : sortKey === "absoluteProjectionEdge" ? "text-violet-50" : "text-violet-600")}>{marketsUnavailable ? "Unavailable" : "Largest edge"}</span>
                    </button>
                    <button type="button" aria-label="Game Time" onClick={() => { setSortKey("gameStartTime"); setSortDir("asc"); }} aria-pressed={sortKey === "gameStartTime"} className={cn("min-w-0 rounded-xl border px-2.5 py-2 text-left text-[11px] font-black leading-tight shadow-sm transition sm:min-w-[132px]", sortKey === "gameStartTime" ? "border-slate-700 bg-slate-700 text-white" : "border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-400")}>
                      Game Time<span className={cn("mt-0.5 block text-[9px] font-semibold", sortKey === "gameStartTime" ? "text-slate-100" : "text-sky-600")}>Earliest first</span>
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Most Strikeouts ranks K Score descending. Best Value ranks the largest model-to-line differences. Game Time shows the earliest starts first.</p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{filteredRows.length} pitchers shown</span><Link to="/mlb" className="font-bold text-sky-700 hover:underline">Back to MLB</Link></div>
              </section>

              {marketsUnavailable && (
                <p role="status" className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-900">
                  Strikeout markets are currently unavailable. Model rankings and projections remain available and will update automatically when sportsbook lines return.
                </p>
              )}

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
                      const tintClass = edgeInfo.direction === "over" ? "bg-orange-50/70" : edgeInfo.direction === "under" ? "bg-blue-50/70" : "bg-white";
                      const shadowRow = showKProjectionV2Debug ? kV2Shadow.findShadowRow(row) : null;
                      const venueIndicator = resolveVenueIndicator(row);
                      const displayMetrics = visibleMetricsByKey.get(rowKey) ?? getDisplayMetrics(row);
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
                                  <span className="ml-1">· {formatGameTime(row.gameStartTime)}</span>
                                </div>
                              </div>
                              <span className={cn("shrink-0 rounded-md border px-1.5 py-1 text-[8px] font-black uppercase tracking-wide", venueTileClass(venueIndicator))}>{venueIndicator}</span>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <span className="whitespace-nowrap text-[10px] font-bold text-slate-600">
                                  {hasPostedLine ? `${fmt(row.kLine)} K` : DASH}
                                  <span className="ml-1 text-slate-400">O {row.kOddsOver ?? DASH} · U {row.kOddsUnder ?? DASH}</span>
                                </span>
                                <PercentileCell
                                  value={row.strikeoutMatchupScore}
                                  display={row.strikeoutMatchupScore.toFixed(1)}
                                  percentile={lookupPercentile(row.strikeoutMatchupScore, kScorePercentileLookup)}
                                  strong
                                  bypassSampleGate
                                />
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
                                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Core / Market</div>
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                  <MetricTile label="K Line"><span className="text-[11px] font-semibold tabular-nums text-slate-700">{hasPostedLine ? fmt(row.kLine) : DASH}</span></MetricTile>
                                  <MetricTile label="Proj K"><span className="text-[11px] font-semibold tabular-nums text-slate-700">{fmt(row.projectedKs)}</span></MetricTile>
                                  <MetricTile label="Edge">
                                    <span className={cn(
                                      "rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums",
                                      edgeInfo.direction === "over" ? "bg-orange-100 text-orange-800" : edgeInfo.direction === "under" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-400",
                                    )}>
                                      {formatEdgeLabel(row)}
                                    </span>
                                  </MetricTile>
                                  <MetricTile label="K Score">
                                    <PercentileCell
                                      value={row.strikeoutMatchupScore}
                                      display={row.strikeoutMatchupScore.toFixed(1)}
                                      percentile={lookupPercentile(row.strikeoutMatchupScore, kScorePercentileLookup)}
                                      strong
                                      bypassSampleGate
                                    />
                                  </MetricTile>
                                </div>
                              </div>
                              <MlbStrikeoutCompactAccordion id={`${panelId}-pitcher-stats`} title="Pitcher Stats" tone="emerald">
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                  <MetricTile label="K Per Game SZN"><ComparativeMetricValue tone={metricTone("pitcherSeasonKPerGame", displayMetrics.pitcherSeasonKPerGame)}>{fmt(displayMetrics.pitcherSeasonKPerGame)}</ComparativeMetricValue></MetricTile>
                                  <MetricTile label="K Per Game L5"><ComparativeMetricValue tone={metricTone("pitcherLastFiveKPerGame", displayMetrics.pitcherLastFiveKPerGame)}>{fmt(displayMetrics.pitcherLastFiveKPerGame)}</ComparativeMetricValue></MetricTile>
                                  <MetricTile label="K Per Game @ Site"><ComparativeMetricValue tone={metricTone("pitcherVenueKPerGame", displayMetrics.pitcherVenueKPerGame)}>{fmt(displayMetrics.pitcherVenueKPerGame)}</ComparativeMetricValue></MetricTile>
                                  <MetricTile label="Avg IP"><ComparativeMetricValue tone={metricTone("projectedIP", row.projectedIP)}>{fmt(row.projectedIP)}</ComparativeMetricValue></MetricTile>
                                </div>
                              </MlbStrikeoutCompactAccordion>
                              <MlbStrikeoutCompactAccordion id={`${panelId}-opposing-team-stats`} title="Opposing Team Stats" tone="blue">
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                  <MetricTile label="Szn vs Hand"><ComparativeMetricValue tone={metricTone("seasonVsHand", displayMetrics.seasonVsHand)}>{displayMetrics.seasonVsHand == null ? DASH : `${fmt(displayMetrics.seasonVsHand)}%`}</ComparativeMetricValue></MetricTile>
                                  <MetricTile label="Opp wRC+ Rank L30 vs Hand"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL30VsHand} /></MetricTile>
                                  <MetricTile label="Opp K/Game @ Site"><ComparativeMetricValue tone={metricTone("opponentVenueKPerGame", displayMetrics.opponentVenueKPerGame)}>{fmt(displayMetrics.opponentVenueKPerGame)}</ComparativeMetricValue></MetricTile>
                                  <MetricTile label="Opp wRC+ Rank L30 @ Site"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL30AtSite} /></MetricTile>
                                  <MetricTile label="Opp wRC+ Rank L10"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL10} /></MetricTile>
                                </div>
                              </MlbStrikeoutCompactAccordion>
                              <RowDetailPanel row={row} />
                            </div>
                          )}
                        </article>
                      );
                    }) : (
                      <div className="px-3 py-6 text-center text-sm text-slate-500">No pitchers match the current filters.</div>
                    )}
                  </div>
                ) : (
                  /* Desktop (lg and above): grouped, responsive-density table. */
                  <DenseTableScroller label="Strikeout prop board" style={{ WebkitOverflowScrolling: "touch" }}>
                  <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0 text-xs">
                    <colgroup>
                      <col className="w-8" /><col className="w-[210px]" /><col className="w-[68px]" />
                      <col className="w-[84px]" /><col className="w-[56px]" /><col className="w-[56px]" />
                      <col className="w-[64px]" />
                      {Array.from({ length: 4 }, (_, index) => <col key={`pitcher-stat-col-${index}`} className="w-[68px]" />)}
                      {Array.from({ length: 5 }, (_, index) => <col key={`opponent-stat-col-${index}`} className="w-[72px]" />)}
                    </colgroup>
                    <thead className={stickyDenseHeader()}>
                    <tr className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">
                      <th colSpan={7} className="border-b border-slate-200 bg-slate-100/90 px-1.5 py-1.5 text-center align-middle">Core / Market</th>
                      <th colSpan={4} data-table-group="pitcher-stats" className="border-b border-l-2 border-slate-400 bg-slate-100/90 px-1.5 py-1.5 text-center align-middle">Pitcher Stats</th>
                      <th colSpan={5} data-table-group="opposing-team-stats" className="border-b border-l-2 border-slate-400 bg-slate-100/90 px-1.5 py-1.5 text-center align-middle">Opposing Team Stats</th>
                    </tr>
                    <tr className="text-[9px] uppercase tracking-wide text-slate-500">
                      <th className={frozenDenseColumn({ isHeader: true, surface: "bg-slate-50", className: "w-8 border-b border-r border-slate-200 px-1 py-2 text-center align-middle font-black text-slate-500" })}>
                        <button type="button" onClick={() => handleSort("rank")} className="hover:text-slate-900" aria-label="Model Rank. This remains fixed even if you sort by another column." title="Model Rank. This remains fixed even if you sort by another column.">#{makeSortIndicator(sortKey === "rank", sortDir)}</button>
                      </th>
                      <th className={cn("sticky left-8", TABLE_LAYER.frozenHeaderCell, "border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-left align-middle font-black text-slate-500")}>
                        <button type="button" onClick={() => handleSort("pitcher")} className="hover:text-slate-900">Pitcher{makeSortIndicator(sortKey === "pitcher", sortDir)}</button>
                      </th>
                      <SortTh k="gameStartTime" label="Game Time" />
                      <th className="border-b border-slate-200 bg-slate-50 px-1.5 py-2 text-center align-middle font-black leading-tight text-slate-500">K Line</th><SortTh k="projectedKs" label="Proj K" /><SortTh k="absoluteProjectionEdge" label="Edge" /><SortTh k="strikeoutMatchupScore" label="K Score" />
                      {["K Per Game SZN", "K Per Game L5", "K Per Game @ Site", "Avg IP"].map((label, index) => <th key={label} data-table-group={index === 0 ? "pitcher-stats-start" : undefined} className={cn("border-b border-slate-200 bg-slate-50 px-1 py-2 text-center align-middle font-black leading-tight text-slate-500", index === 0 && "border-l-2 border-slate-400")}>{label}</th>)}
                      {["Szn vs Hand", "Opp wRC+ Rank L30 vs Hand", "Opp K/Game @ Site", "Opp wRC+ Rank L30 @ Site", "Opp wRC+ Rank L10"].map((label, index) => <th key={label} data-table-group={index === 0 ? "opposing-team-stats-start" : undefined} className={cn("border-b border-slate-200 bg-slate-50 px-1 py-2 text-center align-middle font-black leading-tight text-slate-500", index === 0 && "border-l-2 border-slate-400")}>{label}</th>)}
                    </tr></thead>
                    <tbody>{visibleRows.length ? visibleRows.map((row, index) => {
                      const rowKey = keyForStrikeoutPropRow(row, slateDate);
                      const isExpanded = expandedRowKey === rowKey;
                      const desktopColumnCount = 16;
                      const edgeInfo = getProjectionEdgeInfo(row);
                      const hasPostedLine = row.kLine != null && row.kLine > 0;
                      const rowLabel = `${isExpanded ? "Hide" : "Show"} recent strikeout details for ${row.pitcher}`;
                      const shadowRow = showKProjectionV2Debug ? kV2Shadow.findShadowRow(row) : null;
                      const venueIndicator = resolveVenueIndicator(row);
                      const displayMetrics = visibleMetricsByKey.get(rowKey) ?? getDisplayMetrics(row);
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
                      <td className={frozenDenseColumn({ surface: getStickyRowTintClass(row, index), className: "border-b border-r border-slate-100 px-1 py-2 text-center align-middle text-[12px] font-black tabular-nums text-slate-600" })}>{row.rank}</td><td className={cn("sticky left-8", TABLE_LAYER.frozenColumn, "border-b border-r border-slate-100 px-2 py-2 text-left align-middle", getStickyRowTintClass(row, index))}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn("shrink-0 text-[9px] text-slate-400 transition-transform", isExpanded && "rotate-90")} aria-hidden="true">▶</span>
                          <MlbTeamLogo team={row.team} size={20} />
                          <span className="min-w-0">
                            <span className="block whitespace-normal text-[12px] font-semibold leading-4 text-slate-900">{row.pitcher}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] leading-3 text-slate-500">
                              <span>vs {row.opponent}</span>
                              <span className={cn("rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide", venueTileClass(venueIndicator))}>{venueIndicator}</span>
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-1.5 py-2 text-center align-middle text-[11px] font-semibold tabular-nums text-slate-600">{formatGameTime(row.gameStartTime)}</td>
                      <td className="border-b border-slate-100 px-1.5 py-2 text-center align-middle tabular-nums"><div className="font-semibold text-slate-900">{hasPostedLine ? fmt(row.kLine) : DASH}</div><div className="text-[9px] text-slate-500">O {row.kOddsOver ?? DASH} · U {row.kOddsUnder ?? DASH}</div></td>
                      <td className="border-b border-slate-100 px-1.5 py-2 text-center align-middle font-semibold tabular-nums text-slate-900">{fmt(edgeInfo.projectedKs)}</td>
                      <td className="border-b border-slate-100 px-1.5 py-2 text-center align-middle">
                        <span className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums",
                          edgeInfo.direction === "over" ? "bg-orange-100 text-orange-800" : edgeInfo.direction === "under" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-400",
                        )}>
                          {formatEdgeLabel(row)}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-1.5 py-2 text-center align-middle">
                        <PercentileCell
                          value={row.strikeoutMatchupScore}
                          display={row.strikeoutMatchupScore.toFixed(1)}
                          percentile={lookupPercentile(row.strikeoutMatchupScore, kScorePercentileLookup)}
                          strong
                          bypassSampleGate
                        />
                      </td>
                      <td data-table-group="pitcher-stats-start" className="border-b border-l-2 border-slate-400 px-1 py-2 text-center align-middle"><ComparativeMetricValue tone={metricTone("pitcherSeasonKPerGame", displayMetrics.pitcherSeasonKPerGame)}>{fmt(displayMetrics.pitcherSeasonKPerGame)}</ComparativeMetricValue></td>
                      <td className="border-b border-slate-100 px-1 py-2 text-center align-middle"><ComparativeMetricValue tone={metricTone("pitcherLastFiveKPerGame", displayMetrics.pitcherLastFiveKPerGame)}>{fmt(displayMetrics.pitcherLastFiveKPerGame)}</ComparativeMetricValue></td>
                      <td className="border-b border-slate-100 px-1 py-2 text-center align-middle"><ComparativeMetricValue tone={metricTone("pitcherVenueKPerGame", displayMetrics.pitcherVenueKPerGame)}>{fmt(displayMetrics.pitcherVenueKPerGame)}</ComparativeMetricValue></td>
                      <td className="border-b border-slate-100 px-1 py-2 text-center align-middle"><ComparativeMetricValue tone={metricTone("projectedIP", row.projectedIP)}>{fmt(row.projectedIP)}</ComparativeMetricValue></td>
                      <td data-table-group="opposing-team-stats-start" className="border-b border-l-2 border-slate-400 px-1 py-2 text-center align-middle"><ComparativeMetricValue tone={metricTone("seasonVsHand", displayMetrics.seasonVsHand)}>{displayMetrics.seasonVsHand == null ? DASH : `${fmt(displayMetrics.seasonVsHand)}%`}</ComparativeMetricValue></td>
                      <td className="border-b border-slate-100 px-1 py-2 text-center align-middle"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL30VsHand} /></td>
                      <td className="border-b border-slate-100 px-1 py-2 text-center align-middle"><ComparativeMetricValue tone={metricTone("opponentVenueKPerGame", displayMetrics.opponentVenueKPerGame)}>{fmt(displayMetrics.opponentVenueKPerGame)}</ComparativeMetricValue></td>
                      <td className="border-b border-slate-100 px-1 py-2 text-center align-middle"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL30AtSite} /></td>
                      <td className="border-b border-slate-100 px-1 py-2 text-center align-middle"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL10} /></td>
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
                    }) : <tr><td colSpan={16} className="px-3 py-6 text-center text-sm text-slate-500">No pitchers match the current filters.</td></tr>}</tbody>
                  </table>
                  </DenseTableScroller>
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
                        const venueIndicator = resolveVenueIndicator(row);
                        const displayMetrics = getDisplayMetrics(row);
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
                                <span className={cn("shrink-0 rounded-md border px-1.5 py-1 text-[8px] font-black uppercase tracking-wide", venueTileClass(venueIndicator))}>{venueIndicator}</span>
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
                                  <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Core / Market</div>
                                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                    <MetricTile label="K Score"><StatScorePill value={row.strikeoutMatchupScore} /></MetricTile>
                                  </div>
                                </div>
                                <div>
                                  <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Pitcher Stats</div>
                                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                    <MetricTile label="K Per Game SZN"><span className="text-[11px] font-semibold text-slate-700">{fmt(displayMetrics.pitcherSeasonKPerGame)}</span></MetricTile>
                                    <MetricTile label="K Per Game L5"><span className="text-[11px] font-semibold text-slate-700">{fmt(displayMetrics.pitcherLastFiveKPerGame)}</span></MetricTile>
                                    <MetricTile label="K Per Game @ Site"><span className="text-[11px] font-semibold text-slate-700">{fmt(displayMetrics.pitcherVenueKPerGame)}</span></MetricTile>
                                    <MetricTile label="Avg IP"><span className="text-[11px] font-semibold text-slate-700">{fmt(row.projectedIP)}</span></MetricTile>
                                  </div>
                                </div>
                                <div>
                                  <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Opposing Team Stats</div>
                                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                    <MetricTile label="Szn vs Hand"><span className="text-[11px] font-semibold text-slate-700">{displayMetrics.seasonVsHand == null ? DASH : `${fmt(displayMetrics.seasonVsHand)}%`}</span></MetricTile>
                                    <MetricTile label="Opp wRC+ Rank L30 vs Hand"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL30VsHand} /></MetricTile>
                                    <MetricTile label="Opp K/Game @ Site"><span className="text-[11px] font-semibold text-slate-700">{fmt(displayMetrics.opponentVenueKPerGame)}</span></MetricTile>
                                    <MetricTile label="Opp wRC+ Rank L30 @ Site"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL30AtSite} /></MetricTile>
                                    <MetricTile label="Opp wRC+ Rank L10"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL10} /></MetricTile>
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
                    /* Desktop (lg and above): compact excluded-row table using the same grouped geometry as the main board. */
                    <DenseTableScroller label="Excluded and low-confidence pitchers" style={{ WebkitOverflowScrolling: "touch" }}>
                    <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0 text-xs 2xl:min-w-full">
                      <colgroup>
                        <col className="w-8" /><col className="w-[220px]" /><col className="w-[130px]" /><col className="w-[72px]" /><col className="w-[64px]" />
                        {Array.from({ length: 4 }, (_, index) => <col key={`low-pitcher-stat-col-${index}`} className="w-[68px]" />)}
                        {Array.from({ length: 5 }, (_, index) => <col key={`low-opponent-stat-col-${index}`} className="w-[78px]" />)}
                      </colgroup>
                      <thead className={stickyDenseHeader()}>
                      <tr className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">
                        <th colSpan={5} className="border-b border-slate-200 bg-slate-100/90 px-1.5 py-1.5 text-center align-middle">Core / Market</th>
                        <th colSpan={4} className="border-b border-l-2 border-slate-400 bg-slate-100/90 px-1.5 py-1.5 text-center align-middle">Pitcher Stats</th>
                        <th colSpan={5} className="border-b border-l-2 border-slate-400 bg-slate-100/90 px-1.5 py-1.5 text-center align-middle">Opposing Team Stats</th>
                      </tr>
                      <tr className="text-[9px] uppercase tracking-wide text-slate-500">
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-1 py-2 text-center align-middle text-[10px] font-black uppercase tracking-widest text-slate-500">#</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left align-middle text-[10px] font-black uppercase tracking-widest text-slate-500">Pitcher</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-left align-middle text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                        <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-center align-middle text-[10px] font-black uppercase tracking-widest text-slate-500">Game Time</th>
                        <th className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-center align-middle text-[10px] font-black uppercase tracking-widest text-slate-500">K Score</th>
                        {["K Per Game SZN", "K Per Game L5", "K Per Game @ Site", "Avg IP"].map((label, index) => <th key={label} className={cn("border-b border-slate-200 bg-slate-50 px-1 py-2 text-center align-middle font-black leading-tight text-slate-500", index === 0 && "border-l-2 border-slate-400")}>{label}</th>)}
                        {["Szn vs Hand", "Opp wRC+ Rank L30 vs Hand", "Opp K/Game @ Site", "Opp wRC+ Rank L30 @ Site", "Opp wRC+ Rank L10"].map((label, index) => <th key={label} className={cn("border-b border-slate-200 bg-slate-50 px-1 py-2 text-center align-middle font-black leading-tight text-slate-500", index === 0 && "border-l-2 border-slate-400")}>{label}</th>)}
                      </tr></thead>
                      <tbody>{lowConfidenceRows.map((row, index) => {
                        const rowKey = keyForStrikeoutPropRow(row, slateDate);
                        const isExpanded = expandedRowKey === rowKey;
                        const rowLabel = `${isExpanded ? "Hide" : "Show"} recent strikeout details for ${row.pitcher}`;
                        const displayMetrics = getDisplayMetrics(row);
                        const venueIndicator = resolveVenueIndicator(row);
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
                        <td className="border-b border-slate-100 px-1 py-2 text-center align-middle text-[10px] font-black tabular-nums text-slate-400">{index + 1}</td>
                        <td className="border-b border-slate-100 px-2 py-2 text-left align-middle">
                          <span className="flex items-center gap-2">
                            <span className={cn("shrink-0 text-[9px] text-slate-400 transition-transform", isExpanded && "rotate-90")} aria-hidden="true">▶</span>
                            <MlbTeamLogo team={row.team} size={20} />
                            <span className="min-w-0">
                              <span className="block whitespace-normal text-[12px] font-semibold leading-4 text-slate-900">{row.pitcher}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] leading-3 text-slate-500"><span>vs {row.opponent}</span><span className={cn("rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide", venueTileClass(venueIndicator))}>{venueIndicator}</span></span>
                            </span>
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2 text-left align-middle"><LowConfidenceStatusBadge row={row} /></td>
                        <td className="whitespace-nowrap border-b border-slate-100 px-2 py-2 text-center align-middle tabular-nums">{formatGameTime(row.gameStartTime)}</td>
                        <td className="border-b border-slate-100 px-2 py-2 text-center align-middle"><StatScorePill value={row.strikeoutMatchupScore} /></td>
                        <td className="border-b border-l-2 border-slate-400 px-1 py-2 text-center align-middle font-semibold tabular-nums">{fmt(displayMetrics.pitcherSeasonKPerGame)}</td>
                        <td className="border-b border-slate-100 px-1 py-2 text-center align-middle font-semibold tabular-nums">{fmt(displayMetrics.pitcherLastFiveKPerGame)}</td>
                        <td className="border-b border-slate-100 px-1 py-2 text-center align-middle font-semibold tabular-nums">{fmt(displayMetrics.pitcherVenueKPerGame)}</td>
                        <td className="border-b border-slate-100 px-1 py-2 text-center align-middle font-semibold tabular-nums">{fmt(row.projectedIP)}</td>
                        <td className="border-b border-l-2 border-slate-400 px-1 py-2 text-center align-middle font-semibold tabular-nums">{displayMetrics.seasonVsHand == null ? DASH : `${fmt(displayMetrics.seasonVsHand)}%`}</td>
                        <td className="border-b border-slate-100 px-1 py-2 text-center align-middle font-semibold tabular-nums"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL30VsHand} /></td>
                        <td className="border-b border-slate-100 px-1 py-2 text-center align-middle font-semibold tabular-nums">{fmt(displayMetrics.opponentVenueKPerGame)}</td>
                        <td className="border-b border-slate-100 px-1 py-2 text-center align-middle font-semibold tabular-nums"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL30AtSite} /></td>
                        <td className="border-b border-slate-100 px-1 py-2 text-center align-middle font-semibold tabular-nums"><RankHeatValue rank={displayMetrics.opponentWrcPlusRankL10} /></td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={14} className="border-b border-slate-100 bg-slate-50 px-2 py-2">
                              <RowDetailPanel row={row} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                        );
                      })}</tbody>
                    </table>
                    </DenseTableScroller>
                  )}
                </details>
              )}
              </div>
              ) : null}

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
