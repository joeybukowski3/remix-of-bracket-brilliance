import { useMemo, useState } from "react";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import AllowedByPositionTable from "@/components/nfl/allowed-by-position/AllowedByPositionTable";
import { renderAllowedByPositionTeamCell } from "@/components/nfl/allowed-by-position/TeamCell";
import { DEFAULT_ALLOWED_BY_POSITION_SORT, type AllowedByPositionDisplayMode, type AllowedByPositionSortState } from "@/components/nfl/allowed-by-position/types";
import { useNflFantasyPointsAllowed } from "@/hooks/useNflFantasyPointsAllowed";
import { JKB_HEAT_LEGEND, jkbHeatStyle } from "@/lib/shared/jkbHeat";
import { FANTASY_ALLOWED_COLUMNS, buildFantasyAllowedTableRows, fantasyAllowedRankTone } from "@/lib/nfl/fantasyAllowed/presentation";
import type { FantasyAllowedSampleKey } from "@/lib/nfl/fantasyAllowed/types";

const SAMPLE_OPTIONS: readonly FantasyAllowedSampleKey[] = ["2026", "2025", "last5", "last8"];
const SAMPLE_LABEL: Record<FantasyAllowedSampleKey, string> = { "2026": "2026", "2025": "2025", last5: "Last 5", last8: "Last 8" };

const DISPLAY_MODE_OPTIONS: readonly AllowedByPositionDisplayMode[] = ["rank", "raw"];
const DISPLAY_MODE_LABEL: Record<AllowedByPositionDisplayMode, string> = { rank: "Rank", raw: "Raw" };

/**
 * "Points Allowed" tab of /nfl/fantasy-points-allowed: defense ranks for
 * fantasy points allowed by position (QB/RB/Wide WR/Slot WR/TE). Owns its
 * own sample/display-mode controls, table, and legend -- the parent page
 * only owns the page shell and the top-level view tabs.
 */
export default function FantasyPointsAllowedView({
  sample,
  onSampleChange,
  displayMode,
  onDisplayModeChange,
}: {
  sample: FantasyAllowedSampleKey;
  onSampleChange: (next: FantasyAllowedSampleKey) => void;
  displayMode: AllowedByPositionDisplayMode;
  onDisplayModeChange: (next: AllowedByPositionDisplayMode) => void;
}) {
  const source = useNflFantasyPointsAllowed();
  const [sort, setSort] = useState<AllowedByPositionSortState>(DEFAULT_ALLOWED_BY_POSITION_SORT);

  const rows = useMemo(() => buildFantasyAllowedTableRows(source.artifact, sample), [source.artifact, sample]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <NflFilterChips label="Sample" options={SAMPLE_OPTIONS} value={sample} onChange={onSampleChange} formatOption={(option) => SAMPLE_LABEL[option]} tone="sky" />
        <NflFilterChips
          label="Display mode"
          options={DISPLAY_MODE_OPTIONS}
          value={displayMode}
          onChange={onDisplayModeChange}
          formatOption={(option) => DISPLAY_MODE_LABEL[option]}
          size="sm"
        />
      </div>

      <section className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-[11px] text-slate-500">Wide/Slot WR splits are available for 2026 only.</p>
        <div aria-label="Rank heat legend" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500">
          {JKB_HEAT_LEGEND.map((entry) => (
            <span key={entry.id} className="inline-flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-sm" style={jkbHeatStyle(entry.tone)} />
              {entry.label}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-3">
        {source.loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : source.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{source.error}</div>
        ) : (
          <AllowedByPositionTable
            columns={FANTASY_ALLOWED_COLUMNS}
            rows={rows}
            sort={sort}
            onSortChange={setSort}
            scrollLabel="Fantasy points allowed by position"
            rankTone={fantasyAllowedRankTone}
            displayMode={displayMode}
            renderTeam={(row) => renderAllowedByPositionTeamCell(row.team)}
          />
        )}
      </section>
    </div>
  );
}
