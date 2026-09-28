import { useMemo, useState } from "react";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import AllowedByPositionTable from "@/components/nfl/allowed-by-position/AllowedByPositionTable";
import { renderAllowedByPositionTeamCell } from "@/components/nfl/allowed-by-position/TeamCell";
import { DEFAULT_ALLOWED_BY_POSITION_SORT, type AllowedByPositionDisplayMode, type AllowedByPositionSortState } from "@/components/nfl/allowed-by-position/types";
import { useNflYardsVsAverage } from "@/hooks/useNflYardsVsAverage";
import { JKB_HEAT_LEGEND, SMALL_SAMPLE_STYLE, jkbHeatStyle } from "@/lib/shared/jkbHeat";
import {
  buildYardsVsAverageTableRows,
  YARDS_VS_AVERAGE_COLUMNS,
  yardsVsAverageRankTone,
  type YardsVsAverageUnit,
} from "@/lib/nfl/yardsVsAverage/presentation";
import { YARDS_VS_AVERAGE_SMALL_SAMPLE_GAMES, type YardsVsAverageSampleKey } from "@/lib/nfl/yardsVsAverage/types";

const SAMPLE_OPTIONS: readonly YardsVsAverageSampleKey[] = ["2026", "2025", "last5", "last8"];
const SAMPLE_LABEL: Record<YardsVsAverageSampleKey, string> = { "2026": "2026", "2025": "2025", last5: "Last 5", last8: "Last 8" };

const UNIT_OPTIONS: readonly YardsVsAverageUnit[] = ["yds", "pct"];
const UNIT_LABEL: Record<YardsVsAverageUnit, string> = { yds: "Yds", pct: "%" };

const DISPLAY_MODE_OPTIONS: readonly AllowedByPositionDisplayMode[] = ["rank", "raw"];
const DISPLAY_MODE_LABEL: Record<AllowedByPositionDisplayMode, string> = { rank: "Rank", raw: "Raw" };

/**
 * "Yards vs Avg" tab of /nfl/fantasy-points-allowed: per defense, how far
 * opponents' yardage sat above (+, bad for the defense) or below (-, good)
 * their own normal production. Shares the sample with the other tabs; owns
 * its unit and display mode (defaults: Yds, Raw).
 */
export default function YardsVsAverageView({
  sample,
  onSampleChange,
}: {
  sample: YardsVsAverageSampleKey;
  onSampleChange: (next: YardsVsAverageSampleKey) => void;
}) {
  const source = useNflYardsVsAverage();
  const [unit, setUnit] = useState<YardsVsAverageUnit>("yds");
  const [displayMode, setDisplayMode] = useState<AllowedByPositionDisplayMode>("raw");
  const [sort, setSort] = useState<AllowedByPositionSortState>(DEFAULT_ALLOWED_BY_POSITION_SORT);

  const rows = useMemo(() => buildYardsVsAverageTableRows(source.artifact, sample, unit), [source.artifact, sample, unit]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <NflFilterChips label="Sample" options={SAMPLE_OPTIONS} value={sample} onChange={onSampleChange} formatOption={(option) => SAMPLE_LABEL[option]} tone="sky" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <NflFilterChips<YardsVsAverageUnit> label="Units" options={UNIT_OPTIONS} value={unit} onChange={setUnit} formatOption={(option) => UNIT_LABEL[option]} size="sm" />
          <NflFilterChips<AllowedByPositionDisplayMode> label="Display mode" options={DISPLAY_MODE_OPTIONS} value={displayMode} onChange={setDisplayMode} formatOption={(option) => DISPLAY_MODE_LABEL[option]} size="sm" />
        </div>
      </div>

      <section className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="max-w-2xl text-[11px] text-slate-500">
          Opponents' yards vs. this defense minus their own normal production (other games that season, blended with last season early on).
          Negative = held below normal. PASS is gross passing yards. % is withheld for QB RUSH and tiny baselines.
        </p>
        <div aria-label="Rank heat legend" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500">
          {JKB_HEAT_LEGEND.map((entry) => (
            <span key={entry.id} className="inline-flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-sm" style={jkbHeatStyle(entry.tone)} />
              {entry.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: SMALL_SAMPLE_STYLE.backgroundColor, border: SMALL_SAMPLE_STYLE.border }} />
            Under {YARDS_VS_AVERAGE_SMALL_SAMPLE_GAMES} games
          </span>
        </div>
      </section>

      <section className="mt-3">
        {source.loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : source.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{source.error}</div>
        ) : (
          <AllowedByPositionTable
            columns={YARDS_VS_AVERAGE_COLUMNS}
            rows={rows}
            sort={sort}
            onSortChange={setSort}
            scrollLabel="Opponent yards versus average by position"
            rankTone={yardsVsAverageRankTone}
            displayMode={displayMode}
            renderTeam={(row) => renderAllowedByPositionTeamCell(row.team)}
          />
        )}
      </section>
    </div>
  );
}
