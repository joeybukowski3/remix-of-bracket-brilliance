import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import {
  describeSampleRule,
  type NflDataWindow,
  type NflMatchupSampleSettings,
} from "@/lib/nfl/matchupSampleWindow";

const WINDOW_OPTIONS = [
  { value: "season" as const, label: "Season", shortLabel: "Season" },
  { value: "last5" as const, label: "Last 5", shortLabel: "Last 5" },
];

/**
 * Global sample controls for the analyzer.
 *
 * These are real, persisted UI state and are already typed the way the Phase 2/3
 * aggregation layer will consume them (`NflDataWindow` + `includePriorSeason`).
 * They do not yet change any displayed statistic, because no rolling-window
 * dataset exists — the note below says exactly that rather than implying the
 * numbers moved.
 */
export default function MatchupDataControls({
  settings,
  onChange,
}: {
  settings: NflMatchupSampleSettings;
  onChange: (next: NflMatchupSampleSettings) => void;
}) {
  const blendOn = settings.includePriorSeason;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span
            id="matchup-data-window-label"
            className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400"
          >
            Data Window
          </span>
          <MatchupSegmentedControl
            options={WINDOW_OPTIONS}
            value={settings.window}
            onChange={(window: NflDataWindow) => onChange({ ...settings, window })}
            ariaLabel="Data window"
          />
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
            Historical Blend
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={blendOn}
            onClick={() => onChange({ ...settings, includePriorSeason: !blendOn })}
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              blendOn
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-slate-50 text-slate-500"
            }`}
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${blendOn ? "bg-emerald-600" : "bg-slate-400"}`}
            />
            Include 2025 Last 8
            <span className="tabular-nums">{blendOn ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>

      <p className="mt-2.5 border-t border-slate-100 pt-2 text-[11px] leading-4 text-slate-500">
        <span className="font-bold text-slate-600">Active sample rule:</span>{" "}
        {describeSampleRule(settings)}{" "}
        <span className="text-slate-400">
          Rolling-window statistics populate when the matchup data pipeline is connected; the Joe
          Knows Ball power baseline below is unaffected by these controls.
        </span>
      </p>
    </div>
  );
}
