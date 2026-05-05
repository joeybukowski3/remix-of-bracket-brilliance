import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  EMPTY_MESSAGE,
  type CourseWeightSet,
  type SidebarFilter,
  type StatDisplayMode,
  WeightBadgeRow,
  findDefaultWeightEntry,
  getCurrentAndNextEvents,
  loadCustomPresets,
  rankPlayers,
  saveCustomPreset,
  setThisWeekOverride,
  PgaCompactTable,
  PgaScheduleRail,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";
import { cn } from "@/lib/utils";

const CUSTOM_KEYS: Array<{ key: keyof CourseWeightSet; label: string }> = [
  { key: "sgTotal", label: "SG Total" },
  { key: "sgOTT", label: "SG OTT" },
  { key: "sgApp", label: "SG Approach" },
  { key: "sgAtG", label: "SG Around Green" },
  { key: "sgPutt", label: "SG Putting" },
  { key: "drivingAccuracy", label: "Driving Accuracy" },
  { key: "bogeyAvoidance", label: "Bogey Avoidance" },
  { key: "birdieBogeyRatio", label: "Birdie/Bogey Ratio" },
] as const;

function toPercentWeights(weights: CourseWeightSet) {
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Number((value * 100).toFixed(2))]),
  ) as Record<keyof CourseWeightSet, number>;
}

function toFractionWeights(weights: Record<keyof CourseWeightSet, number>) {
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Number((value / 100).toFixed(6))]),
  ) as CourseWeightSet;
}

function normalizePercentageWeights(weights: Record<keyof CourseWeightSet, number>) {
  const entries = Object.entries(weights) as [keyof CourseWeightSet, number][];
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) {
    const even = Number((100 / entries.length).toFixed(2));
    return Object.fromEntries(entries.map(([key]) => [key, even])) as Record<keyof CourseWeightSet, number>;
  }

  const normalized = Object.fromEntries(
    entries.map(([key, value]) => [key, Number(((value / total) * 100).toFixed(2))]),
  ) as Record<keyof CourseWeightSet, number>;

  const normalizedEntries = Object.entries(normalized) as [keyof CourseWeightSet, number][];
  const diff = Number((100 - normalizedEntries.reduce((sum, [, value]) => sum + value, 0)).toFixed(2));
  const lastKey = normalizedEntries.at(-1)?.[0];
  if (lastKey) {
    normalized[lastKey] = Number((normalized[lastKey] + diff).toFixed(2));
  }

  return normalized;
}

function rebalanceWeights(current: Record<keyof CourseWeightSet, number>, key: keyof CourseWeightSet, nextValue: number) {
  const clamped = Math.max(0, Math.min(100, nextValue));
  const otherKeys = CUSTOM_KEYS.map((entry) => entry.key).filter((entryKey) => entryKey !== key);
  const otherTotal = otherKeys.reduce((sum, entryKey) => sum + current[entryKey], 0);
  const remaining = Math.max(0, 100 - clamped);
  const nextWeights = { ...current, [key]: clamped };

  if (otherTotal <= 0) {
    const even = Number((remaining / otherKeys.length).toFixed(2));
    otherKeys.forEach((entryKey) => {
      nextWeights[entryKey] = even;
    });
  } else {
    otherKeys.forEach((entryKey) => {
      nextWeights[entryKey] = Number(((current[entryKey] / otherTotal) * remaining).toFixed(2));
    });
  }

  return normalizePercentageWeights(nextWeights);
}

export default function PgaCustom() {
  const navigate = useNavigate();
  const { schedule, courseWeights, playerStats, loading } = usePgaHubData();
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [displayMode, setDisplayMode] = useState<StatDisplayMode>("raw");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetVersion, setPresetVersion] = useState(0);

  const defaultWeightEntry = useMemo(() => findDefaultWeightEntry(courseWeights), [courseWeights]);
  const { current: currentEvent } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const selectedEvent = useMemo(
    () => schedule.find((entry) => entry.id === selectedScheduleId) ?? currentEvent ?? null,
    [currentEvent, schedule, selectedScheduleId],
  );

  const [customPercentWeights, setCustomPercentWeights] = useState<Record<keyof CourseWeightSet, number> | null>(null);

  usePageSeo({
    title: "Custom PGA Model Builder",
    description: "Build a custom PGA ranking model with live normalized sliders, presets, and schedule-aware tournament context.",
    path: "/pga/custom",
  });

  const activePercentWeights = useMemo(() => {
    if (customPercentWeights) return customPercentWeights;
    if (defaultWeightEntry) return toPercentWeights(defaultWeightEntry.weights);
    return null;
  }, [customPercentWeights, defaultWeightEntry]);

  const activeWeights = useMemo(
    () => activePercentWeights ? toFractionWeights(activePercentWeights) : null,
    [activePercentWeights],
  );

  const rankedRows = useMemo(
    () => activeWeights ? rankPlayers(playerStats, activeWeights) : [],
    [activeWeights, playerStats],
  );

  const presetMap = useMemo(() => loadCustomPresets(), [presetVersion]);
  const presetNames = Object.keys(presetMap).sort((left, right) => left.localeCompare(right));

  return (
    <SiteShell>
      <main className="site-page bg-[#020806] pb-16 pt-4 text-white">
        <div className="site-container">
          <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
            <PgaScheduleRail
              schedule={schedule}
              currentEvent={currentEvent}
              sidebarFilter={sidebarFilter}
              setSidebarFilter={setSidebarFilter}
              selectedScheduleId={selectedScheduleId}
              onSelect={setSelectedScheduleId}
            />

            <section className="space-y-3">
              <div className="rounded-[22px] border border-white/8 bg-[#06100c] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold tracking-[-0.03em] text-white">Custom Model Builder</div>
                    <div className="truncate text-xs text-emerald-50/62">
                      {selectedEvent ? `${selectedEvent.name} • ${selectedEvent.courseName} • ${selectedEvent.dateLabel}` : "No tournament selected"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDisplayMode("raw")}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                        displayMode === "raw"
                          ? "border-emerald-400 bg-emerald-400 text-[#04110a]"
                          : "border-white/10 bg-white/4 text-emerald-50/76",
                      )}
                    >
                      Raw Stats
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode("percentile")}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                        displayMode === "percentile"
                          ? "border-emerald-400 bg-emerald-400 text-[#04110a]"
                          : "border-white/10 bg-white/4 text-emerald-50/76",
                      )}
                    >
                      Percentile Rank
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CUSTOM_KEYS.map((entry) => (
                      <div key={entry.key} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-emerald-50/84">
                          <span>{entry.label}</span>
                          <span>{activePercentWeights ? activePercentWeights[entry.key].toFixed(1) : "--"}%</span>
                        </div>
                        <Slider
                          value={[activePercentWeights?.[entry.key] ?? 0]}
                          min={0}
                          max={100}
                          step={0.5}
                          onValueChange={(value) => {
                            if (!activePercentWeights) return;
                            setCustomPercentWeights(rebalanceWeights(activePercentWeights, entry.key, value[0] ?? 0));
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 rounded-xl border border-white/8 bg-white/[0.03] p-3">
                    <WeightBadgeRow
                      entry={activeWeights ? { tournament: "Custom", course: selectedEvent?.courseName ?? "", weights: activeWeights } : null}
                    />

                    <Button
                      variant="outline"
                      className="w-full border-white/10 bg-white/4 text-xs text-white hover:bg-white/10"
                      onClick={() => defaultWeightEntry && setCustomPercentWeights(toPercentWeights(defaultWeightEntry.weights))}
                    >
                      Reset to Default
                    </Button>

                    <Button
                      className="w-full bg-emerald-500 text-xs text-[#04110a] hover:bg-emerald-400"
                      onClick={() => {
                        if (!activeWeights) return;
                        setThisWeekOverride(activeWeights);
                        navigate("/pga");
                      }}
                    >
                      Apply to This Week
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full border-white/10 bg-white/4 text-xs text-white hover:bg-white/10"
                      onClick={() => setPresetDialogOpen(true)}
                    >
                      Save as Preset
                    </Button>

                    <Select
                      onValueChange={(value) => {
                        const preset = presetMap[value];
                        if (!preset) return;
                        setCustomPercentWeights(toPercentWeights(preset));
                      }}
                    >
                      <SelectTrigger className="border-white/10 bg-white/4 text-xs text-white">
                        <SelectValue placeholder="Load Preset" />
                      </SelectTrigger>
                      <SelectContent>
                        {presetNames.length === 0 ? (
                          <SelectItem value="__empty__" disabled>No presets saved</SelectItem>
                        ) : (
                          presetNames.map((name) => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#06100c] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                {loading || !rankedRows.length ? (
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-8 text-sm text-emerald-50/70">
                    {loading ? "Loading PGA data..." : EMPTY_MESSAGE}
                  </div>
                ) : (
                  <PgaCompactTable rows={rankedRows} scoreLabel="Custom Score" movementMap={{}} displayMode={displayMode} />
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent className="border-white/10 bg-[#06100c] text-white">
          <DialogHeader>
            <DialogTitle>Save Custom Preset</DialogTitle>
            <DialogDescription className="text-emerald-50/62">
              Store the current custom model weights in local storage.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="Augusta short game build"
            className="border-white/10 bg-white/4 text-white"
          />

          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10 bg-white/4 text-white hover:bg-white/10"
              onClick={() => setPresetDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-500 text-[#04110a] hover:bg-emerald-400"
              onClick={() => {
                if (!presetName.trim() || !activeWeights) return;
                saveCustomPreset(presetName.trim(), activeWeights);
                setPresetVersion((current) => current + 1);
                setPresetDialogOpen(false);
                setPresetName("");
              }}
            >
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SiteShell>
  );
}
