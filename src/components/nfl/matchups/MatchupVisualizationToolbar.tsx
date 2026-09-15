import MatchupMetricsSelector from "@/components/nfl/matchups/MatchupMetricsSelector";
import MatchupSegmentedControl from "@/components/nfl/matchups/MatchupSegmentedControl";
import type { MatchupVisualizationView } from "@/components/nfl/matchups/useMatchupVisualizationState";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";

const VIEW_OPTIONS = [
  { value: "towers" as const, label: "Rank Towers", shortLabel: "Towers" },
  { value: "profile" as const, label: "Profile" },
];

/**
 * Compact toolbar above the active Team Comparison visualization: the
 * Towers/Profile view toggle and the shared Metrics selector trigger. Both
 * controls act on the same category's state — the toolbar itself holds none.
 */
export default function MatchupVisualizationToolbar({
  view,
  onViewChange,
  categoryLabel,
  availableMetrics,
  selectedIds,
  onChangeSelection,
  onReset,
  isDefault,
}: {
  view: MatchupVisualizationView;
  onViewChange: (view: MatchupVisualizationView) => void;
  categoryLabel: string;
  availableMetrics: readonly MatchupVisualMetric[];
  selectedIds: readonly string[];
  onChangeSelection: (ids: readonly string[]) => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  return (
    <div className="matchup-visualization-toolbar">
      <div className="matchup-visualization-toolbar__views">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">View</span>
        <MatchupSegmentedControl
          options={VIEW_OPTIONS}
          value={view}
          onChange={onViewChange}
          ariaLabel="Team Comparison visualization"
          size="sm"
          className="matchup-visualization-view-toggle"
        />
      </div>
      <MatchupMetricsSelector
        categoryLabel={categoryLabel}
        availableMetrics={availableMetrics}
        selectedIds={selectedIds}
        onChange={onChangeSelection}
        onReset={onReset}
        isDefault={isDefault}
      />
    </div>
  );
}
