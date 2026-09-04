import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflYardageProjections } from "@/hooks/useNflYardageProjections";
import { useNflYardageMarket } from "@/hooks/useNflYardageMarket";
import { useNflYardageOpponentContext } from "@/hooks/useNflYardageOpponentContext";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import NflYardageReviewTable from "@/components/nfl/yardage-review/NflYardageReviewTable";
import NflYardageReviewMobileTable from "@/components/nfl/yardage-review/NflYardageReviewMobileTable";
import NflYardageFreshnessStatus from "@/components/nfl/yardage-review/NflYardageFreshnessStatus";
import { NflYardageMatchupFilterChips } from "@/components/nfl/yardage-review/NflYardageMatchupFilterChips";
import { NflYardageBandFilterChips, BAND_FILTER_OPTIONS } from "@/components/nfl/yardage-review/NflYardageBandFilterChips";
import NflYardageMobilePropTypeRow from "@/components/nfl/yardage-review/NflYardageMobilePropTypeRow";
import NflYardageMobileFilterDropdowns from "@/components/nfl/yardage-review/NflYardageMobileFilterDropdowns";
import { buildYardageReviewRows, type NflMatchupScoreBand } from "@/lib/nfl/props/review/yardageMarketJoin";
import { buildYardageReviewFreshness } from "@/lib/nfl/props/review/freshness";
import { buildYardageOpponentContext } from "@/lib/nfl/props/review/opponentContext";
import { buildYardageWeekMatchups } from "@/lib/nfl/props/review/yardageWeekMatchups";
import {
  buildProjectedYardsHeatByKey,
  withYardsAllowedHeat,
  type NflYardageOpponentContextWithHeat,
} from "@/lib/nfl/props/review/yardageHeat";
import {
  DEFAULT_YARDAGE_REVIEW_FILTERS,
  DEFAULT_YARDAGE_REVIEW_SORT,
  applyYardageReviewFilters,
  nextYardageReviewSort,
  sortYardageReviewRows,
  type NflYardageReviewFilters,
  type NflYardageReviewSortState,
} from "@/lib/nfl/props/review/reviewFilters";
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";

const SEASON = 2026;
const WEEK_OPTIONS = [1] as const;

const MARKET_TABS: readonly NflProjectionMarket[] = ["passing", "rushing", "receiving"];
const MARKET_LABEL: Record<NflProjectionMarket, string> = { passing: "Passing", rushing: "Rushing", receiving: "Receiving" };

const BAND_FILTER_LABEL: Record<"all" | NflMatchupScoreBand, string> = {
  all: "All Bands", elite: "Elite", strong: "Strong", average: "Average", weak: "Weak", poor: "Poor",
};

const LINE_OPTIONS = ["all", "available", "unavailable"] as const;
const LINE_LABEL: Record<(typeof LINE_OPTIONS)[number], string> = { all: "All Lines", available: "Line Available", unavailable: "No Line" };
/** Dropdown display order differs from filter-option order (Available first) -- same values/labels, just a different mobile-menu ordering. */
const LINE_DROPDOWN_ORDER: readonly (typeof LINE_OPTIONS)[number][] = ["available", "all", "unavailable"];

/**
 * Mobile's default Line filter is "available" (matched-line-only); desktop's
 * stays "all". This is a Vite SPA with no SSR/hydration step, so reading
 * `window.matchMedia` in the lazy initial-state callback is safe and
 * deterministic -- it runs once, on mount, before first paint.
 */
function defaultFiltersForViewport(): NflYardageReviewFilters {
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  return isMobile ? { ...DEFAULT_YARDAGE_REVIEW_FILTERS, lineAvailability: "available" } : DEFAULT_YARDAGE_REVIEW_FILTERS;
}

export default function NFLYardagePropsReview() {
  usePageSeo({
    title: "NFL Yardage Props Review | Joe Knows Ball",
    description: "Read-only preview of 2026 NFL passing, rushing and receiving yardage projections against available sportsbook lines.",
    path: "/nfl/yardage-props-review",
  });

  const [week, setWeek] = useState<(typeof WEEK_OPTIONS)[number]>(1);
  const [market, setMarket] = useState<NflProjectionMarket>("passing");
  const [filters, setFilters] = useState<NflYardageReviewFilters>(defaultFiltersForViewport);
  // Default sort is highest projection first, on initial load and after every market change; a user
  // pick always overrides this until they clear it (nextYardageReviewSort's normal three-state cycle).
  const [sort, setSort] = useState<NflYardageReviewSortState>(DEFAULT_YARDAGE_REVIEW_SORT);
  // Collapsed by default on mobile only -- on md+ the filter row is always
  // visible regardless of this state (see the `md:flex` override below). All
  // 32 team chips plus four more filter groups pushed every card below the
  // fold on a 390px viewport before this existed.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const projections = useNflYardageProjections(SEASON);
  const marketData = useNflYardageMarket();
  const opponentContextData = useNflYardageOpponentContext();

  const marketRows = useMemo(
    () => (projections.data ? projections.data.rows.filter((r) => r.market === market && r.week === week) : []),
    [projections.data, market, week],
  );

  const reviewEntries = useMemo(() => buildYardageReviewRows(marketRows, marketData.data), [marketRows, marketData.data]);

  const freshnessSources = useMemo(
    () =>
      buildYardageReviewFreshness({
        projectionGeneratedAt: projections.data?.generatedAt ?? null,
        depthChartSnapshotAt: projections.data?.depthChartSource.snapshotAt ?? null,
        sportsbookGeneratedAt: marketData.data?.generatedAt ?? null,
        opponentContextGeneratedAts: [
          opponentContextData.epa?._meta.generatedAt,
          opponentContextData.success?._meta.generatedAt,
          opponentContextData.productionAllowed?._meta.generatedAt,
        ],
      }),
    [projections.data, marketData.data, opponentContextData],
  );

  // Opponent-defense context (yards allowed, EPA/Success allowed, matchup edge) is
  // an independent read-only overlay -- keyed the same way the table keys its
  // rows so a missing/failed artifact never blocks the base projection row.
  const opponentContextByKey = useMemo(() => {
    const map = new Map<string, NflYardageOpponentContextWithHeat>();
    for (const entry of reviewEntries) {
      const { row } = entry;
      const context = buildYardageOpponentContext({
        team: row.team,
        opponent: row.opponent,
        market: row.market,
        position: row.position,
        epa: opponentContextData.epa,
        success: opponentContextData.success,
        productionAllowed: opponentContextData.productionAllowed,
        abbrToNflverseAbbr: opponentContextData.abbrToNflverseAbbr,
      });
      map.set(
        `${row.market}-${row.playerId}`,
        withYardsAllowedHeat(
          context,
          opponentContextData.productionAllowed,
          row.market,
          opponentContextData.abbrToNflverseAbbr.get(row.opponent),
        ),
      );
    }
    return map;
  }, [reviewEntries, opponentContextData]);

  // Computed from the full, unfiltered market entries -- each row's Proj
  // Yds pool (market+position) and therefore its heat stays stable as
  // position/band/line filters are applied.
  const projectedYardsHeatByKey = useMemo(() => buildProjectedYardsHeatByKey(reviewEntries), [reviewEntries]);

  // Derived from every market's rows for the week (not just the active market tab) so
  // all 16 games render as filter pills regardless of which market is selected -- never
  // a hardcoded schedule; see buildYardageWeekMatchups.
  const weekMatchups = useMemo(() => {
    const rowsForWeek = projections.data ? projections.data.rows.filter((r) => r.week === week) : [];
    return buildYardageWeekMatchups(rowsForWeek);
  }, [projections.data, week]);

  const positionOptions = useMemo(() => {
    const positions = new Set<string>();
    for (const entry of reviewEntries) positions.add(entry.row.position);
    return ["all", ...[...positions].sort()];
  }, [reviewEntries]);

  const filtered = useMemo(() => applyYardageReviewFilters(reviewEntries, filters), [reviewEntries, filters]);
  const sorted = useMemo(
    () => sortYardageReviewRows(filtered, sort, opponentContextByKey),
    [filtered, sort, opponentContextByKey],
  );

  const handleSort = (key: Parameters<typeof nextYardageReviewSort>[1]) => {
    setSort((current) => nextYardageReviewSort(current, key, key === "player" || key === "team" ? "asc" : "desc"));
  };

  const handleMarketChange = (next: NflProjectionMarket) => {
    setMarket(next);
    setFilters(defaultFiltersForViewport());
    setSort(DEFAULT_YARDAGE_REVIEW_SORT);
  };

  const loading = projections.loading;
  const hasProjectionError = Boolean(projections.error);
  const availableLineCount = reviewEntries.filter((e) => e.marketInfo.available).length;
  const activeFilterCount = [
    filters.matchup !== "all",
    filters.position !== "all",
    filters.band !== "all",
    filters.lineAvailability !== "all",
  ].filter(Boolean).length;

  return (
    <>
      <NflPageHeader
        eyebrow="NFL · Props Review"
        title="Yardage Props Review"
        description="A read-only preview of current-week passing, rushing and receiving yardage projections, shown alongside any matching sportsbook line. This is research context, not a betting recommendation."
      >
        <div className="flex flex-wrap items-center gap-3">
          <NflFilterChips label="Week" options={WEEK_OPTIONS} value={week} onChange={setWeek} formatOption={(w) => `Week ${w}`} />
          {/* Market stays a chip group on desktop; mobile gets its own dedicated prop-type row below (NflYardageMobilePropTypeRow). */}
          <div className="hidden md:flex md:items-center">
            <NflFilterChips label="Market" options={MARKET_TABS} value={market} onChange={handleMarketChange} formatOption={(m) => MARKET_LABEL[m]} />
          </div>
        </div>
      </NflPageHeader>

      <NflYardageMobilePropTypeRow value={market} onChange={handleMarketChange} />

      <NflYardageFreshnessStatus sources={freshnessSources} />

      {loading && <p className="text-sm text-slate-500">Loading yardage projections…</p>}
      {hasProjectionError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          Could not load yardage projections. Please try again later.
        </p>
      )}

      {!loading && !hasProjectionError && (
        <>
          <div className="rounded-lg border border-slate-300 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              aria-controls="yardage-review-filters"
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold text-slate-700 md:hidden"
            >
              <span>Filters{activeFilterCount > 0 ? ` · ${activeFilterCount} active` : ""}</span>
              <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", filtersOpen && "rotate-180")} aria-hidden="true" />
            </button>
            <div
              id="yardage-review-filters"
              className={cn(
                "flex-col gap-3 border-t border-slate-200 px-3 py-2.5 md:flex md:border-t-0 md:py-2.5",
                filtersOpen ? "flex" : "hidden",
              )}
            >
              <NflYardageMobileFilterDropdowns
                matchups={weekMatchups}
                positionOptions={positionOptions.map((o) => ({ value: o, label: o === "all" ? "All Positions" : o }))}
                bandOptions={BAND_FILTER_OPTIONS.map((o) => ({ value: o, label: BAND_FILTER_LABEL[o] }))}
                lineOptions={LINE_DROPDOWN_ORDER.map((o) => ({ value: o, label: LINE_LABEL[o] }))}
                filters={filters}
                onFilterChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
              />

              <div className="hidden flex-col gap-3 md:flex">
                <NflYardageMatchupFilterChips
                  matchups={weekMatchups}
                  value={filters.matchup}
                  onChange={(v) => setFilters((f) => ({ ...f, matchup: v }))}
                />
                <div className="flex flex-wrap items-center gap-3">
                  {positionOptions.length > 2 && (
                    <NflFilterChips
                      label="Position"
                      options={positionOptions}
                      value={filters.position}
                      onChange={(v) => setFilters((f) => ({ ...f, position: v }))}
                      formatOption={(o) => (o === "all" ? "All Positions" : o)}
                      size="sm"
                      tone="violet"
                    />
                  )}
                  <NflYardageBandFilterChips value={filters.band} onChange={(v) => setFilters((f) => ({ ...f, band: v }))} formatOption={(o) => BAND_FILTER_LABEL[o]} />
                  <NflFilterChips label="Line availability" options={LINE_OPTIONS} value={filters.lineAvailability} onChange={(v) => setFilters((f) => ({ ...f, lineAvailability: v }))} formatOption={(o) => LINE_LABEL[o]} size="sm" tone="teal" />
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            {sorted.length} of {reviewEntries.length} {MARKET_LABEL[market].toLowerCase()} candidates shown · {availableLineCount} with a
            matching sportsbook line{marketData.error ? " · sportsbook data unavailable this run" : ""}
            {opponentContextData.errors.length > 0 ? ` · ${opponentContextData.errors.join(" ")}` : ""}
          </p>

          {sorted.length === 0 ? (
            <div className="rounded-lg border border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
              No {MARKET_LABEL[market].toLowerCase()} candidates match the current filters.
            </div>
          ) : (
            <>
              <NflYardageReviewTable
                entries={sorted}
                sort={sort}
                onSort={handleSort}
                opponentContextByKey={opponentContextByKey}
                projectedYardsHeatByKey={projectedYardsHeatByKey}
                season={SEASON}
              />
              <NflYardageReviewMobileTable
                entries={sorted}
                sort={sort}
                onSort={handleSort}
                opponentContextByKey={opponentContextByKey}
                projectedYardsHeatByKey={projectedYardsHeatByKey}
                season={SEASON}
              />
            </>
          )}
        </>
      )}

      {/* Context/disclaimer, not primary navigation -- kept below the table and expanded player content on every viewport. */}
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
        <strong className="font-semibold">Projection preview</strong> — sportsbook-relative performance has not yet been validated on the required
        2026 sample.
      </p>
    </>
  );
}
