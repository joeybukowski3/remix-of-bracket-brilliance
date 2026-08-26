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
import NflYardageReviewCardList from "@/components/nfl/yardage-review/NflYardageReviewCardList";
import { buildYardageReviewRows, type NflMatchupScoreBand } from "@/lib/nfl/props/review/yardageMarketJoin";
import { buildYardageOpponentContext, type NflYardageOpponentContext } from "@/lib/nfl/props/review/opponentContext";
import {
  DEFAULT_YARDAGE_REVIEW_FILTERS,
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

const BAND_OPTIONS: readonly ("all" | NflMatchupScoreBand)[] = ["all", "elite", "strong", "average", "weak", "poor"];
const BAND_FILTER_LABEL: Record<"all" | NflMatchupScoreBand, string> = {
  all: "All Bands", elite: "Elite", strong: "Strong", average: "Average", weak: "Weak", poor: "Poor",
};

const LINE_OPTIONS = ["all", "available", "unavailable"] as const;
const LINE_LABEL: Record<(typeof LINE_OPTIONS)[number], string> = { all: "All Lines", available: "Line Available", unavailable: "No Line" };

const ROLE_OPTIONS = ["all", "uncertain", "confident"] as const;
const ROLE_LABEL: Record<(typeof ROLE_OPTIONS)[number], string> = { all: "All Roles", uncertain: "Role Uncertain", confident: "Role Confident" };

export default function NFLYardagePropsReview() {
  usePageSeo({
    title: "NFL Yardage Props Review | Joe Knows Ball",
    description: "Read-only preview of 2026 NFL passing, rushing and receiving yardage projections against available sportsbook lines.",
    path: "/nfl/yardage-props-review",
  });

  const [week, setWeek] = useState<(typeof WEEK_OPTIONS)[number]>(1);
  const [market, setMarket] = useState<NflProjectionMarket>("passing");
  const [filters, setFilters] = useState<NflYardageReviewFilters>(DEFAULT_YARDAGE_REVIEW_FILTERS);
  const [sort, setSort] = useState<NflYardageReviewSortState>(null);
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

  // Opponent-defense context (yards allowed, EPA/Success allowed, matchup edge) is
  // an independent read-only overlay -- keyed the same way the table keys its
  // rows so a missing/failed artifact never blocks the base projection row.
  const opponentContextByKey = useMemo(() => {
    const map = new Map<string, NflYardageOpponentContext>();
    for (const entry of reviewEntries) {
      const { row } = entry;
      map.set(
        `${row.market}-${row.playerId}`,
        buildYardageOpponentContext({
          team: row.team,
          opponent: row.opponent,
          market: row.market,
          position: row.position,
          epa: opponentContextData.epa,
          success: opponentContextData.success,
          productionAllowed: opponentContextData.productionAllowed,
          abbrToNflverseAbbr: opponentContextData.abbrToNflverseAbbr,
        }),
      );
    }
    return map;
  }, [reviewEntries, opponentContextData]);

  const teamOptions = useMemo(() => {
    const teams = new Set<string>();
    for (const entry of reviewEntries) {
      teams.add(entry.row.team);
      teams.add(entry.row.opponent);
    }
    return ["all", ...[...teams].sort()];
  }, [reviewEntries]);

  const positionOptions = useMemo(() => {
    const positions = new Set<string>();
    for (const entry of reviewEntries) positions.add(entry.row.position);
    return ["all", ...[...positions].sort()];
  }, [reviewEntries]);

  const filtered = useMemo(() => applyYardageReviewFilters(reviewEntries, filters), [reviewEntries, filters]);
  const sorted = useMemo(() => sortYardageReviewRows(filtered, sort), [filtered, sort]);

  const handleSort = (key: Parameters<typeof nextYardageReviewSort>[1]) => {
    setSort((current) => nextYardageReviewSort(current, key, key === "player" || key === "team" ? "asc" : "desc"));
  };

  const handleMarketChange = (next: NflProjectionMarket) => {
    setMarket(next);
    setFilters(DEFAULT_YARDAGE_REVIEW_FILTERS);
    setSort(null);
  };

  const loading = projections.loading;
  const hasProjectionError = Boolean(projections.error);
  const availableLineCount = reviewEntries.filter((e) => e.marketInfo.available).length;
  const activeFilterCount = [
    filters.team !== "all",
    filters.position !== "all",
    filters.band !== "all",
    filters.lineAvailability !== "all",
    filters.roleUncertainty !== "all",
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
          <NflFilterChips label="Market" options={MARKET_TABS} value={market} onChange={handleMarketChange} formatOption={(m) => MARKET_LABEL[m]} />
        </div>
      </NflPageHeader>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
        <strong className="font-semibold">Projection preview</strong> — sportsbook-relative performance has not yet been validated on the required
        2026 sample.
      </p>

      {loading && <p className="text-sm text-slate-500">Loading yardage projections…</p>}
      {hasProjectionError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          Could not load yardage projections. Please try again later.
        </p>
      )}

      {!loading && !hasProjectionError && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white">
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
                "flex-wrap items-center gap-3 border-t border-slate-100 px-3 py-2.5 md:flex md:border-t-0 md:py-2.5",
                filtersOpen ? "flex" : "hidden",
              )}
            >
              <NflFilterChips
                label="Team or opponent"
                options={teamOptions}
                value={filters.team}
                onChange={(v) => setFilters((f) => ({ ...f, team: v }))}
                formatOption={(o) => (o === "all" ? "All Teams" : o.toUpperCase())}
                size="sm"
              />
              {positionOptions.length > 2 && (
                <NflFilterChips
                  label="Position"
                  options={positionOptions}
                  value={filters.position}
                  onChange={(v) => setFilters((f) => ({ ...f, position: v }))}
                  formatOption={(o) => (o === "all" ? "All Positions" : o)}
                  size="sm"
                />
              )}
              <NflFilterChips label="Matchup band" options={BAND_OPTIONS} value={filters.band} onChange={(v) => setFilters((f) => ({ ...f, band: v }))} formatOption={(o) => BAND_FILTER_LABEL[o]} size="sm" />
              <NflFilterChips label="Line availability" options={LINE_OPTIONS} value={filters.lineAvailability} onChange={(v) => setFilters((f) => ({ ...f, lineAvailability: v }))} formatOption={(o) => LINE_LABEL[o]} size="sm" />
              <NflFilterChips label="Role confidence" options={ROLE_OPTIONS} value={filters.roleUncertainty} onChange={(v) => setFilters((f) => ({ ...f, roleUncertainty: v }))} formatOption={(o) => ROLE_LABEL[o]} size="sm" />
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            {sorted.length} of {reviewEntries.length} {MARKET_LABEL[market].toLowerCase()} candidates shown · {availableLineCount} with a
            matching sportsbook line{marketData.error ? " · sportsbook data unavailable this run" : ""}
            {opponentContextData.errors.length > 0 ? ` · ${opponentContextData.errors.join(" ")}` : ""}
          </p>

          {sorted.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
              No {MARKET_LABEL[market].toLowerCase()} candidates match the current filters.
            </div>
          ) : (
            <>
              <NflYardageReviewTable entries={sorted} sort={sort} onSort={handleSort} opponentContextByKey={opponentContextByKey} />
              <NflYardageReviewCardList entries={sorted} opponentContextByKey={opponentContextByKey} />
            </>
          )}
        </>
      )}
    </>
  );
}
