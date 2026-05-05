import { useEffect, useMemo, useRef, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  DATA_SOURCES,
  EMPTY_MESSAGE,
  type BaseView,
  type CourseWeightFeedEntry,
  type CourseWeightSet,
  type MovementDirection,
  type SidebarFilter,
  type StatDisplayMode,
  THIS_WEEK_OVERRIDE_KEY,
  WeightBadgeRow,
  findCourseWeightEntry,
  findDefaultWeightEntry,
  getCurrentAndNextEvents,
  rankPlayers,
  getThisWeekOverride,
  PgaCompactTable,
  PgaScheduleRail,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";
import { cn } from "@/lib/utils";

function buildMovementMap(
  activeRows: ReturnType<typeof rankPlayers>,
  baselineRows: ReturnType<typeof rankPlayers>,
) {
  const baselineRankMap = Object.fromEntries(baselineRows.map((row) => [row.player, row.rank]));

  return Object.fromEntries(
    activeRows.flatMap((row) => {
      const baselineRank = baselineRankMap[row.player];
      if (!baselineRank || baselineRank === row.rank) return [];
      return [[row.player, row.rank < baselineRank ? "up" : "down"] as const];
    }),
  ) as Record<string, MovementDirection>;
}

export default function PgaHub() {
  const { schedule, courseWeights, playerStats, loading } = usePgaHubData();
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [activeView, setActiveView] = useState<BaseView>("power");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<StatDisplayMode>("raw");
  const [currentOverride, setCurrentOverride] = useState<CourseWeightSet | null>(null);
  const [movementMap, setMovementMap] = useState<Record<string, MovementDirection>>({});
  const movementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnimatedRef = useRef(false);

  usePageSeo({
    title: "PGA Rankings Hub",
    description: "Weekly PGA power rankings, live current-week tournament model, next-week board, and a schedule-driven sidebar for future event planning.",
    path: "/pga",
  });

  useEffect(() => {
    setCurrentOverride(getThisWeekOverride());

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THIS_WEEK_OVERRIDE_KEY) {
        setCurrentOverride(getThisWeekOverride());
      }
    };
    const handleFocus = () => setCurrentOverride(getThisWeekOverride());

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const { current: currentEvent, next: nextEvent } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const selectedFutureEvent = useMemo(
    () => schedule.find((entry) => entry.id === selectedScheduleId) ?? null,
    [schedule, selectedScheduleId],
  );

  const defaultWeightEntry = useMemo(() => findDefaultWeightEntry(courseWeights), [courseWeights]);
  const currentWeightEntry = useMemo(() => {
    if (!currentEvent) return null;
    const matched = findCourseWeightEntry(courseWeights, currentEvent.name, currentEvent.courseName);
    return currentOverride && matched
      ? { ...matched, weights: currentOverride }
      : matched;
  }, [courseWeights, currentEvent, currentOverride]);
  const nextWeightEntry = useMemo(
    () => nextEvent ? findCourseWeightEntry(courseWeights, nextEvent.name, nextEvent.courseName) : null,
    [courseWeights, nextEvent],
  );
  const selectedFutureWeightEntry = useMemo(
    () => selectedFutureEvent ? findCourseWeightEntry(courseWeights, selectedFutureEvent.name, selectedFutureEvent.courseName) : null,
    [courseWeights, selectedFutureEvent],
  );

  const activeContent = useMemo(() => {
    if (selectedFutureEvent) {
      return {
        title: selectedFutureEvent.name,
        meta: `${selectedFutureEvent.courseName} • ${selectedFutureEvent.dateLabel}`,
        scoreLabel: "Model Score",
        weightEntry: selectedFutureWeightEntry,
      };
    }

    if (activeView === "current") {
      return {
        title: currentEvent?.name ?? "This Week",
        meta: `${currentEvent?.courseName ?? EMPTY_MESSAGE} • ${currentEvent?.dateLabel ?? ""}`,
        scoreLabel: "Model Score",
        weightEntry: currentWeightEntry,
      };
    }

    if (activeView === "next") {
      return {
        title: nextEvent?.name ?? "Next Week",
        meta: `${nextEvent?.courseName ?? EMPTY_MESSAGE} • ${nextEvent?.dateLabel ?? ""}`,
        scoreLabel: "Model Score",
        weightEntry: nextWeightEntry,
      };
    }

    return {
      title: "Power Rankings",
      meta: "Default baseline weights across the full PGA field",
      scoreLabel: "Power Score",
      weightEntry: defaultWeightEntry,
    };
  }, [activeView, currentEvent, currentWeightEntry, defaultWeightEntry, nextEvent, nextWeightEntry, selectedFutureEvent, selectedFutureWeightEntry]);

  const baselineRows = useMemo(
    () => defaultWeightEntry ? rankPlayers(playerStats, defaultWeightEntry.weights) : [],
    [defaultWeightEntry, playerStats],
  );
  const activeRows = useMemo(
    () => activeContent.weightEntry ? rankPlayers(playerStats, activeContent.weightEntry.weights) : [],
    [activeContent.weightEntry, playerStats],
  );

  useEffect(() => {
    if (!activeRows.length || !baselineRows.length) {
      setMovementMap({});
      return;
    }

    if (!hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      return;
    }

    setMovementMap(buildMovementMap(activeRows, baselineRows));
    if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
    movementTimeoutRef.current = setTimeout(() => setMovementMap({}), 1100);
  }, [activeRows, baselineRows]);

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
                <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold tracking-[-0.03em] text-white">{activeContent.title}</div>
                    <div className="truncate text-xs text-emerald-50/62">{activeContent.meta}</div>
                  </div>

                  <div className="flex flex-col gap-2 md:items-end">
                    <Tabs value={activeView} onValueChange={(value) => { setSelectedScheduleId(null); setActiveView(value as BaseView); }}>
                      <TabsList className="grid h-auto w-full grid-cols-3 rounded-full bg-white/6 p-1 md:w-auto">
                        {DATA_SOURCES.map((source) => (
                          <TabsTrigger
                            key={source.id}
                            value={source.id}
                            className="rounded-full px-3 py-1 text-[11px] font-semibold data-[state=active]:bg-emerald-400 data-[state=active]:text-[#04110a]"
                          >
                            {source.id === "power" ? "Power Rankings" : source.id === "current" ? "This Week" : "Next Week"}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>

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
                </div>

                <WeightBadgeRow entry={activeContent.weightEntry as CourseWeightFeedEntry | null} />
              </div>

              <div className="rounded-[22px] border border-white/8 bg-[#06100c] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                {loading || !activeRows.length ? (
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-8 text-sm text-emerald-50/70">
                    {loading ? "Loading PGA data..." : EMPTY_MESSAGE}
                  </div>
                ) : (
                  <PgaCompactTable
                    rows={activeRows}
                    scoreLabel={activeContent.scoreLabel}
                    movementMap={movementMap}
                    displayMode={displayMode}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
