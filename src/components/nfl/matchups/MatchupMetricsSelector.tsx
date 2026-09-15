import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import type { MatchupVisualMetric } from "@/lib/nfl/matchupVisualizationModel";
import { MIN_SELECTED_METRICS } from "@/lib/nfl/matchupCuratedMetrics";
import { cn } from "@/lib/utils";

const FEEDBACK_TIMEOUT_MS = 2400;

function MetricsChecklist({
  categoryLabel,
  availableMetrics,
  selectedIds,
  onToggle,
  onReset,
  isDefault,
  feedback,
}: {
  categoryLabel: string;
  availableMetrics: readonly MatchupVisualMetric[];
  selectedIds: readonly string[];
  onToggle: (metricId: string) => void;
  onReset: () => void;
  isDefault: boolean;
  feedback: string | null;
}) {
  const selectedSet = new Set(selectedIds);
  return (
    <div className="matchup-metrics-checklist space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-600">
          {categoryLabel} metrics
        </p>
        <button
          type="button"
          onClick={onReset}
          disabled={isDefault}
          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:text-slate-300"
        >
          Reset to defaults
        </button>
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {availableMetrics.map((metric) => {
          const checked = selectedSet.has(metric.id);
          return (
            <li key={metric.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] text-slate-800 hover:bg-slate-50">
                <Checkbox checked={checked} onCheckedChange={() => onToggle(metric.id)} />
                <span className="truncate">{metric.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>
          {selectedIds.length} selected · minimum {MIN_SELECTED_METRICS}
        </span>
      </div>
      {feedback && <p className="text-[11px] font-semibold text-amber-700">{feedback}</p>}
    </div>
  );
}

/**
 * Shared Metrics selector for Rank Towers and Signature Profile.
 *
 * There is exactly one selection per category — this component only reads
 * and writes it, never branches on which view is currently showing, so
 * Towers and Profile can never disagree about which metrics are selected.
 * Desktop uses a popover; mobile uses a bottom drawer so the list never
 * forces page-level horizontal overflow.
 */
export default function MatchupMetricsSelector({
  categoryLabel,
  availableMetrics,
  selectedIds,
  onChange,
  onReset,
  isDefault,
}: {
  categoryLabel: string;
  availableMetrics: readonly MatchupVisualMetric[];
  selectedIds: readonly string[];
  onChange: (ids: readonly string[]) => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current != null) window.clearTimeout(feedbackTimer.current);
    };
  }, []);

  function showFeedback(message: string) {
    setFeedback(message);
    if (feedbackTimer.current != null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), FEEDBACK_TIMEOUT_MS);
  }

  function handleToggle(metricId: string) {
    const isSelected = selectedIds.includes(metricId);
    if (isSelected) {
      if (selectedIds.length <= MIN_SELECTED_METRICS) {
        showFeedback(`Keep at least ${MIN_SELECTED_METRICS} metrics.`);
        return;
      }
      onChange(selectedIds.filter((id) => id !== metricId));
      return;
    }
    // Registry order always determines display order, regardless of click order.
    const nextSet = new Set([...selectedIds, metricId]);
    onChange(availableMetrics.filter((metric) => nextSet.has(metric.id)).map((metric) => metric.id));
  }

  const triggerLabel = `Metrics · ${selectedIds.length}`;
  const triggerClassName =
    "matchup-metrics-trigger inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-bold focus:outline-none focus-visible:ring-2";

  const body = (
    <MetricsChecklist
      categoryLabel={categoryLabel}
      availableMetrics={availableMetrics}
      selectedIds={selectedIds}
      onToggle={handleToggle}
      onReset={onReset}
      isDefault={isDefault}
      feedback={feedback}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger className={triggerClassName}>{triggerLabel}</DrawerTrigger>
        <DrawerContent className="matchup-metrics-drawer max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle className="text-[13px]">Choose metrics</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName}>{triggerLabel}</PopoverTrigger>
      <PopoverContent align="end" className={cn("matchup-metrics-popover w-72 p-3")}>
        {body}
      </PopoverContent>
    </Popover>
  );
}
