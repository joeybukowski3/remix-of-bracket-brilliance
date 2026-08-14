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
  sampleLabel,
}: {
  settings: NflMatchupSampleSettings;
  onChange: (next: NflMatchupSampleSettings) => void;
  /** Compact description of the resolved sample, e.g. "8 games · 2025". */
  sampleLabel?: string;
}) {
  const blendOn = settings.includePriorSeason;

  return (
    /* Pale band rather than a white card, so the control bar reads as chrome
       for the sections below it rather than as another content card. */
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 shadow-sm sm:px-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <span
            id="matchup-data-window-label"
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800"
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
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800">
            Historical Blend
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={blendOn}
            onClick={() => onChange({ ...settings, includePriorSeason: !blendOn })}
            className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              blendOn
                ? "border-emerald-500 bg-white text-emerald-800"
                : "border-slate-300 bg-white text-slate-600"
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

        {sampleLabel && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800">
              Sample
            </span>
            <span
              data-testid="matchup-sample-label"
              className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-bold tabular-nums text-slate-700"
            >
              {sampleLabel}
            </span>
          </div>
        )}
      </div>

      <p className="mt-1.5 border-t border-emerald-200 pt-1.5 text-[11px] leading-4 text-emerald-900/80">
        <span className="font-bold text-emerald-900">Active sample rule:</span>{" "}
        {describeSampleRule(settings)}{" "}
        <span className="text-slate-600">
          Conventional team stats respond to these controls. The Joe Knows Ball power baseline in
          the header is a separate preseason model and is unaffected.
        </span>
      </p>
    </div>
  );
}
