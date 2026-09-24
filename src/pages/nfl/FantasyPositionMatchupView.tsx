import { useMemo, useState } from "react";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import PositionMatchupTable from "@/components/nfl/position-matchups/PositionMatchupTable";
import { renderAllowedByPositionTeamCell } from "@/components/nfl/allowed-by-position/TeamCell";
import { DEFAULT_POSITION_MATCHUP_SORT, type PositionMatchupDisplayMode, type PositionMatchupSortState } from "@/components/nfl/position-matchups/types";
import { useNflFantasyPositionMatchups } from "@/hooks/useNflFantasyPositionMatchups";
import { buildPositionMatchupTableRows, positionMatchupRatingTone } from "@/lib/nfl/positionMatchups/presentation";
import { POSITION_MATCHUP_RATING_LABELS } from "@/lib/nfl/positionMatchups/rating";
import type { PositionMatchupRating, PositionMatchupSampleKey } from "@/lib/nfl/positionMatchups/types";

const RATING_LEGEND_ORDER: readonly PositionMatchupRating[] = ["very-strong", "strong", "neutral", "weak", "very-weak"];

const SAMPLE_OPTIONS: readonly PositionMatchupSampleKey[] = ["2026", "2025", "last5", "last8"];
const SAMPLE_LABEL: Record<PositionMatchupSampleKey, string> = { "2026": "2026", "2025": "2025", last5: "Last 5", last8: "Last 8" };

const DISPLAY_MODE_OPTIONS: readonly PositionMatchupDisplayMode[] = ["rank", "raw"];
const DISPLAY_MODE_LABEL: Record<PositionMatchupDisplayMode, string> = { rank: "Rank", raw: "Raw" };

/**
 * "Matchup Comparison" tab of /nfl/fantasy-points-allowed: a team's own
 * fantasy production by position (FOR) vs. the opponent defense's fantasy
 * points allowed by position (ALLOWED), combined into a signed EDGE with a
 * JKB rating. Owns its own sample/display-mode controls, table, and legend,
 * matching the "Points Allowed" tab's ownership split.
 */
export default function FantasyPositionMatchupView({
  sample,
  onSampleChange,
  displayMode,
  onDisplayModeChange,
}: {
  sample: PositionMatchupSampleKey;
  onSampleChange: (next: PositionMatchupSampleKey) => void;
  displayMode: PositionMatchupDisplayMode;
  onDisplayModeChange: (next: PositionMatchupDisplayMode) => void;
}) {
  const source = useNflFantasyPositionMatchups();
  const [sort, setSort] = useState<PositionMatchupSortState>(DEFAULT_POSITION_MATCHUP_SORT);

  const rows = useMemo(() => buildPositionMatchupTableRows(source.artifact, sample), [source.artifact, sample]);

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
        <p className="text-[11px] text-slate-500">FOR = team offense production. ALLOWED = opponent defense fantasy points allowed. EDGE = FOR rank + ALLOWED rank - 33.</p>
        <div aria-label="Rating legend" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500">
          {RATING_LEGEND_ORDER.map((rating) => (
            <span key={rating} className="inline-flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-sm" style={positionMatchupRatingTone(rating).style} />
              {POSITION_MATCHUP_RATING_LABELS[rating]}
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
          <PositionMatchupTable
            rows={rows}
            sort={sort}
            onSortChange={setSort}
            scrollLabel="Fantasy position matchup comparison"
            displayMode={displayMode}
            renderTeam={(row) => renderAllowedByPositionTeamCell(row.team)}
          />
        )}
      </section>
    </div>
  );
}
