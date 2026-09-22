import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import MatchupMatrixRankLegend from "@/components/nfl/matchups/MatchupMatrixRankLegend";
import { MATRIX_DATA_WINDOW_OPTIONS, type NflMatrixDataWindowMode } from "@/lib/nfl/matchupMatrixWindow";

export type NflMatrixDisplayMode = "rankings" | "values";

const DISPLAY_MODE_OPTIONS = [
  { value: "rankings" as const, label: "Rankings" },
  { value: "values" as const, label: "Values" },
];

/**
 * Page-wide controls for the Weekly Matchups matrix: Rankings/Values display
 * mode and the Blended/2026 Only/Last 8 data window. Both apply to every game
 * on the page, not per matchup, per the approved design.
 *
 * Rankings shows each team's league rank per metric; Values shows the actual
 * underlying metric value (native OVR, raw EPA, raw YPP, success-rate
 * percentage, canonical trench percentage). Heatmap color is always driven by
 * rank regardless of which mode is active — see matchupMatrixRankTier.ts.
 *
 * The two footnotes here are the SINGLE place the matrix explains that
 * Success Rate / Blocking / Def Rush never move with the Data Window toggle,
 * and that OVR's Last 8 reads as 2026-to-date (no rolling 8-game OVR exists) —
 * deliberately not repeated on every cell.
 */
export default function MatchupMatrixControls({
  displayMode,
  onDisplayModeChange,
  dataWindow,
  onDataWindowChange,
}: {
  displayMode: NflMatrixDisplayMode;
  onDisplayModeChange: (mode: NflMatrixDisplayMode) => void;
  dataWindow: NflMatrixDataWindowMode;
  onDataWindowChange: (mode: NflMatrixDataWindowMode) => void;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Display</span>
          <MatchupSegmentedControl
            options={DISPLAY_MODE_OPTIONS}
            value={displayMode}
            onChange={onDisplayModeChange}
            ariaLabel="Rankings or Values display"
            size="sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Data Window</span>
          <MatchupSegmentedControl
            options={MATRIX_DATA_WINDOW_OPTIONS}
            value={dataWindow}
            onChange={onDataWindowChange}
            ariaLabel="Matrix data window"
            size="sm"
          />
        </div>
      </div>

      <p className="text-[10px] leading-4 text-slate-500">
        <span className="font-bold text-slate-600">Success Rate and Blocking/Def Rush</span> are always
        season-to-date and do not change with the Data Window toggle above — RBSDM and ESPN publish those
        figures without a rolling or historical-blend window.
        {dataWindow === "last8" && (
          <>
            {" "}
            <span className="font-bold text-slate-600">OVR</span> has no rolling 8-game composite, so Last 8
            shows each team's 2026-to-date rating instead.
          </>
        )}
      </p>

      <MatchupMatrixRankLegend />
    </div>
  );
}
