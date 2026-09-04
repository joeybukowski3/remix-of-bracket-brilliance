/**
 * Mobile-only compact dropdown filters -- replaces the desktop pill groups
 * (Matchup/Position/Band/Line) with a 2x2 grid of native `<select>`s so the
 * filter panel doesn't push the table below the fold on a narrow viewport.
 * Reuses the exact same filter state/options the desktop pills use; no
 * filtering semantics are reimplemented here.
 */
import type { NflYardageWeekMatchup } from "@/lib/nfl/props/review/yardageWeekMatchups";
import type { NflYardageReviewFilters } from "@/lib/nfl/props/review/reviewFilters";

function FilterSelect({
  label,
  testId,
  value,
  onChange,
  options,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        className="rounded border border-slate-300 bg-white px-1.5 py-1.5 text-[12px] font-medium normal-case text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function NflYardageMobileFilterDropdowns({
  matchups,
  positionOptions,
  bandOptions,
  lineOptions,
  filters,
  onFilterChange,
}: {
  matchups: readonly NflYardageWeekMatchup[];
  positionOptions: readonly { value: string; label: string }[];
  bandOptions: readonly { value: string; label: string }[];
  lineOptions: readonly { value: string; label: string }[];
  filters: NflYardageReviewFilters;
  onFilterChange: (patch: Partial<NflYardageReviewFilters>) => void;
}) {
  const matchupOptions = [
    { value: "all", label: "All Matchups" },
    ...matchups.map((m) => ({ value: m.gameId, label: `${m.awayAbbr.toUpperCase()} @ ${m.homeAbbr.toUpperCase()}` })),
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:hidden">
      <FilterSelect
        label="Matchup"
        testId="nfl-yardage-mobile-filter-matchup"
        value={filters.matchup}
        onChange={(v) => onFilterChange({ matchup: v })}
        options={matchupOptions}
      />
      <FilterSelect
        label="Position"
        testId="nfl-yardage-mobile-filter-position"
        value={filters.position}
        onChange={(v) => onFilterChange({ position: v })}
        options={positionOptions}
      />
      <FilterSelect
        label="Band"
        testId="nfl-yardage-mobile-filter-band"
        value={filters.band}
        onChange={(v) => onFilterChange({ band: v as NflYardageReviewFilters["band"] })}
        options={bandOptions}
      />
      <FilterSelect
        label="Line"
        testId="nfl-yardage-mobile-filter-line"
        value={filters.lineAvailability}
        onChange={(v) => onFilterChange({ lineAvailability: v as NflYardageReviewFilters["lineAvailability"] })}
        options={lineOptions}
      />
    </div>
  );
}
