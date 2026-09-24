import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { NflProjectionMarket } from "@/lib/nfl/props/types/projectionOutput";
import type { NflYardageReviewRow } from "@/lib/nfl/props/review/yardageMarketJoin";
import type { CarryShareSample } from "@/lib/nfl/props/review/carryShare";
import type { NflYardageOpponentContextWithHeat, WeeklyHeatTone } from "@/lib/nfl/props/review/yardageHeat";
import {
  sortYardageReviewRows,
  type NflYardageReviewFilters,
  type NflYardageReviewSortKey,
  type NflYardageReviewSortState,
} from "@/lib/nfl/props/review/reviewFilters";
import {
  MATCHUP_SECTIONS,
  selectMatchupSectionEntries,
  type NflMatchupPosition,
  type NflMatchupSectionConfig,
} from "@/lib/nfl/props/review/matchupSections";
import NflYardageReviewTable from "./NflYardageReviewTable";
import NflYardageReviewMobileTable from "./NflYardageReviewMobileTable";

const MARKET_LABEL: Record<NflProjectionMarket, string> = { passing: "Passing", rushing: "Rushing", receiving: "Receiving" };

type SectionMarkets = Partial<Record<NflMatchupPosition, NflProjectionMarket>>;

/** Local (per-section) prop-type switch. Compact, touch-sized segmented control. */
function SectionTabs({
  position,
  markets,
  value,
  onChange,
}: {
  position: NflMatchupPosition;
  markets: readonly NflProjectionMarket[];
  value: NflProjectionMarket;
  onChange: (next: NflProjectionMarket) => void;
}) {
  return (
    <div role="group" aria-label={`${position} prop type`} className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
      {markets.map((market) => {
        const selected = market === value;
        return (
          <button
            key={market}
            type="button"
            onClick={() => onChange(market)}
            aria-pressed={selected}
            className={cn(
              "min-h-[44px] rounded px-4 md:min-h-[40px] text-xs font-bold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
              selected ? "bg-sky-700 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900",
            )}
          >
            {MARKET_LABEL[market]}
          </button>
        );
      })}
    </div>
  );
}

function MatchupSection({
  config,
  market,
  onMarketChange,
  entriesByMarket,
  filters,
  sort,
  onSort,
  opponentContextByKey,
  projectedYardsHeatByKey,
  season,
  carryShareSamples,
}: {
  config: NflMatchupSectionConfig;
  market: NflProjectionMarket;
  onMarketChange: (next: NflProjectionMarket) => void;
  entriesByMarket: Readonly<Record<NflProjectionMarket, readonly NflYardageReviewRow[]>>;
  filters: NflYardageReviewFilters;
  sort: NflYardageReviewSortState;
  onSort: (key: NflYardageReviewSortKey) => void;
  opponentContextByKey: ReadonlyMap<string, NflYardageOpponentContextWithHeat>;
  projectedYardsHeatByKey: ReadonlyMap<string, WeeklyHeatTone>;
  season: number;
  carryShareSamples: ReadonlyMap<string, CarryShareSample>;
}) {
  const { position } = config;
  const { entries, unfilteredCount } = useMemo(
    () => selectMatchupSectionEntries(entriesByMarket, filters, position, market),
    [entriesByMarket, filters, position, market],
  );
  const sorted = useMemo(
    () => sortYardageReviewRows(entries, sort, opponentContextByKey, carryShareSamples),
    [entries, sort, opponentContextByKey, carryShareSamples],
  );
  const heading = `${position} ${MARKET_LABEL[market]}`;

  return (
    <section aria-label={heading} data-testid={`nfl-yardage-matchup-section-${position}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
          {position} <span className="font-medium text-slate-500">· {MARKET_LABEL[market]} yards</span>
          <span className="ml-2 text-[11px] font-medium normal-case text-slate-500">{sorted.length} shown</span>
        </h2>
        {config.markets.length > 1 && <SectionTabs position={position} markets={config.markets} value={market} onChange={onMarketChange} />}
      </div>
      {sorted.length === 0 ? (
        <div
          data-testid={`nfl-yardage-matchup-empty-${position}`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500 shadow-sm"
        >
          No {position} {market} props available for this matchup{unfilteredCount > 0 ? " with the current filters" : ""}.
        </div>
      ) : (
        <>
          {/* Keyed by position+market so expanded-row state never leaks across a local tab switch. */}
          <NflYardageReviewTable
            key={`${position}-${market}`}
            entries={sorted}
            sort={sort}
            onSort={onSort}
            opponentContextByKey={opponentContextByKey}
            projectedYardsHeatByKey={projectedYardsHeatByKey}
            season={season}
            carryShareSamples={carryShareSamples}
          />
          <NflYardageReviewMobileTable
            key={`m-${position}-${market}`}
            entries={sorted}
            sort={sort}
            onSort={onSort}
            opponentContextByKey={opponentContextByKey}
            projectedYardsHeatByKey={projectedYardsHeatByKey}
            season={season}
          />
        </>
      )}
    </section>
  );
}

/**
 * Selected-matchup view: QB, RB, WR and TE sections stacked on one page. The matchup itself
 * lives in the page's `filters` (never here), so it survives every local interaction; only the
 * QB/RB prop-type tab state is local to this component.
 */
export default function NflYardageMatchupStack({
  entriesByMarket,
  ...shared
}: {
  entriesByMarket: Readonly<Record<NflProjectionMarket, readonly NflYardageReviewRow[]>>;
  filters: NflYardageReviewFilters;
  sort: NflYardageReviewSortState;
  onSort: (key: NflYardageReviewSortKey) => void;
  opponentContextByKey: ReadonlyMap<string, NflYardageOpponentContextWithHeat>;
  projectedYardsHeatByKey: ReadonlyMap<string, WeeklyHeatTone>;
  season: number;
  carryShareSamples: ReadonlyMap<string, CarryShareSample>;
}) {
  const [sectionMarkets, setSectionMarkets] = useState<SectionMarkets>({});

  return (
    <div className="flex flex-col gap-6" data-testid="nfl-yardage-matchup-stack">
      {MATCHUP_SECTIONS.map((config) => (
        <MatchupSection
          key={config.position}
          config={config}
          market={sectionMarkets[config.position] ?? config.markets[0]}
          onMarketChange={(next) => setSectionMarkets((current) => ({ ...current, [config.position]: next }))}
          entriesByMarket={entriesByMarket}
          {...shared}
        />
      ))}
    </div>
  );
}
