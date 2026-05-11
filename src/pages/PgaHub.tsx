import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import SportsbookBar from "@/components/SportsbookBar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CANONICAL_BASE, usePageSeo } from "@/hooks/usePageSeo";
import {
  EMPTY_MESSAGE,
  type CourseWeightFeedEntry,
  type CourseWeightSet,
  type MovementDirection,
  type RankedPlayerRow,
  type SidebarFilter,
  type StatDisplayMode,
  THIS_WEEK_OVERRIDE_KEY,
  WeightBadgeRow,
  findCourseWeightEntry,
  findDefaultWeightEntry,
  getCurrentAndNextEvents,
  getThisWeekOverride,
  getSavedCustomWeights,
  rankPlayers,
  setSavedCustomWeights,
  setThisWeekOverride,
  PgaCompactTable,
  PgaScheduleRail,
  usePgaHubData,
} from "@/components/pga/PgaHubShared";
import { cn } from "@/lib/utils";

type ModelMode = "tournament" | "custom" | "standard";
type TournamentMode = "current" | "next";

const MODEL_OPTIONS: Array<{ key: ModelMode; label: string }> = [
  { key: "tournament", label: "Tournament" },
  { key: "custom", label: "Custom" },
  { key: "standard", label: "Standard" },
];

const TOURNAMENT_OPTIONS: Array<{ key: TournamentMode; label: string }> = [
  { key: "current", label: "This Week" },
  { key: "next", label: "Next Week" },
];

const CUSTOM_KEYS: Array<{ key: keyof CourseWeightSet; label: string; short: string }> = [
  { key: "sgTotal", label: "SG Total", short: "SGT" },
  { key: "sgOTT", label: "SG Off Tee", short: "OTT" },
  { key: "sgApp", label: "SG Approach", short: "APP" },
  { key: "sgAtG", label: "SG Around Green", short: "ATG" },
  { key: "sgPutt", label: "SG Putting", short: "PUT" },
  { key: "drivingAccuracy", label: "Driving Accuracy", short: "DRV%" },
  { key: "bogeyAvoidance", label: "Bogey Avoidance", short: "BOG" },
  { key: "birdieBogeyRatio", label: "Birdie/Bogey Ratio", short: "B/B" },
];

function buildMovementMap(activeRows: RankedPlayerRow[], baselineRows: RankedPlayerRow[]) {
  const baselineRankMap = Object.fromEntries(baselineRows.map((row) => [row.player, row.rank]));

  return Object.fromEntries(
    activeRows.flatMap((row) => {
      const baselineRank = baselineRankMap[row.player];
      if (!baselineRank || baselineRank === row.rank) return [];
      return [[row.player, row.rank < baselineRank ? "up" : "down"] as const];
    }),
  ) as Record<string, MovementDirection>;
}

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

  const diff = Number((100 - Object.values(normalized).reduce((sum, value) => sum + value, 0)).toFixed(2));
  const lastKey = entries.at(-1)?.[0];
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

function buildMetaLine(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" | ");
}

function stripMarkdown(value: string | null | undefined) {
  return (value ?? "").replace(/\*\*(.*?)\*\*/g, "$1").trim();
}

function truncateTeaser(value: string | null | undefined, maxLength: number) {
  const clean = stripMarkdown(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

function formatGeneratedDate(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

type BestBetPickPreview = { player: string };
type BestBetsPreviewData = {
  tournament: string;
  course?: string;
  generatedAt?: string;
  preview?: {
    tournamentOverview?: string;
  } | null;
  valueBets?: Array<unknown>;
  outrights?: BestBetPickPreview[];
  top5?: BestBetPickPreview[];
  top10?: BestBetPickPreview[];
  top20?: BestBetPickPreview[];
};

export default function PgaHub() {
  const { schedule, courseWeights, playerStats, loading } = usePgaHubData();
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [modelMode, setModelMode] = useState<ModelMode>("tournament");
  const [tournamentMode, setTournamentMode] = useState<TournamentMode>("current");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<StatDisplayMode>("percentile");
  const [currentOverride, setCurrentOverride] = useState<CourseWeightSet | null>(null);
  const [customPercentWeights, setCustomPercentWeights] = useState<Record<keyof CourseWeightSet, number> | null>(null);
  const [movementMap, setMovementMap] = useState<Record<string, MovementDirection>>({});
  const [bestBets, setBestBets] = useState<BestBetsPreviewData | null>(null);
  const movementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnimatedRef = useRef(false);

  usePageSeo({
    title: "PGA Championship 2026 Picks & Model Rankings — Joe Knows Ball",
    description: "Course-weighted player rankings and betting models for the 2026 PGA Championship at Aronimink Golf Club. Updated weekly using strokes gained data and DataGolf course stats.",
    path: "/pga",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SportsOrganization",
      name: "Joe Knows Ball PGA Tour Models",
      sport: "Golf",
      url: `${CANONICAL_BASE}/pga`,
    },
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

  useEffect(() => {
    let active = true;

    fetch("/data/pga/best-bets.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Missing best bets feed.");
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        setBestBets(payload as BestBetsPreviewData);
      })
      .catch(() => {
        if (!active) return;
        setBestBets(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const { active: activeEvent, current: currentEvent, next: nextEvent } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const selectedFutureEvent = useMemo(
    () => schedule.find((entry) => entry.id === selectedScheduleId) ?? null,
    [schedule, selectedScheduleId],
  );

  const defaultWeightEntry = useMemo(() => findDefaultWeightEntry(courseWeights), [courseWeights]);
  const currentWeightEntry = useMemo(() => {
    if (!currentEvent) return null;
    const matched = findCourseWeightEntry(courseWeights, currentEvent.name, currentEvent.courseName);
    return currentOverride && matched ? { ...matched, weights: currentOverride } : matched;
  }, [courseWeights, currentEvent, currentOverride]);
  const nextWeightEntry = useMemo(
    () => (nextEvent ? findCourseWeightEntry(courseWeights, nextEvent.name, nextEvent.courseName) : null),
    [courseWeights, nextEvent],
  );
  const selectedFutureWeightEntry = useMemo(
    () => (selectedFutureEvent ? findCourseWeightEntry(courseWeights, selectedFutureEvent.name, selectedFutureEvent.courseName) : null),
    [courseWeights, selectedFutureEvent],
  );

  useEffect(() => {
    if (customPercentWeights) return;
    const savedCustomWeights = getSavedCustomWeights();
    if (savedCustomWeights) {
      setCustomPercentWeights(toPercentWeights(savedCustomWeights));
      return;
    }
    if (!defaultWeightEntry) return;
    setCustomPercentWeights(toPercentWeights(defaultWeightEntry.weights));
  }, [defaultWeightEntry]);

  useEffect(() => {
    if (!customPercentWeights) return;
    setSavedCustomWeights(toFractionWeights(customPercentWeights));
  }, [customPercentWeights]);

  const tournamentWeightEntry = useMemo(() => {
    if (selectedFutureEvent) return selectedFutureWeightEntry;
    return tournamentMode === "next" ? nextWeightEntry : currentWeightEntry;
  }, [currentWeightEntry, nextWeightEntry, selectedFutureEvent, selectedFutureWeightEntry, tournamentMode]);

  const tournamentMeta = useMemo(() => {
    if (selectedFutureEvent) {
      return {
        title: selectedFutureEvent.name,
        meta: buildMetaLine([selectedFutureEvent.courseName, selectedFutureEvent.dateLabel]),
      };
    }

    if (tournamentMode === "next") {
      return {
        title: nextEvent?.name ?? "Next Week",
        meta: buildMetaLine([nextEvent?.courseName ?? EMPTY_MESSAGE, nextEvent?.dateLabel]),
      };
    }

    return {
      title: currentEvent?.name ?? "This Week",
      meta: buildMetaLine([currentEvent?.courseName ?? EMPTY_MESSAGE, currentEvent?.dateLabel]),
    };
  }, [currentEvent, nextEvent, selectedFutureEvent, tournamentMode]);

  const customWeights = useMemo(
    () => (customPercentWeights ? toFractionWeights(customPercentWeights) : null),
    [customPercentWeights],
  );

  const baselineRows = useMemo(
    () => (defaultWeightEntry ? rankPlayers(playerStats, defaultWeightEntry.weights) : []),
    [defaultWeightEntry, playerStats],
  );
  const tournamentRows = useMemo(
    () => (tournamentWeightEntry ? rankPlayers(playerStats, tournamentWeightEntry.weights) : []),
    [playerStats, tournamentWeightEntry],
  );
  const customRows = useMemo(
    () => (customWeights ? rankPlayers(playerStats, customWeights) : []),
    [customWeights, playerStats],
  );

  const activeContent = useMemo(() => {
    if (modelMode === "standard") {
      return {
        title: "Standard Model",
        meta: "Default baseline weights across the full active PGA field",
        scoreLabel: "Power Score",
        weightEntry: defaultWeightEntry,
        rows: baselineRows,
      };
    }

    if (modelMode === "custom") {
      return {
        title: "Custom Model",
        meta: selectedFutureEvent
          ? buildMetaLine([selectedFutureEvent.name, selectedFutureEvent.courseName, selectedFutureEvent.dateLabel])
          : buildMetaLine([currentEvent?.name ?? "Current Event", currentEvent?.courseName, currentEvent?.dateLabel]),
        scoreLabel: "Custom Score",
        weightEntry: customWeights ? { tournament: "Custom", course: selectedFutureEvent?.courseName ?? currentEvent?.courseName ?? "", weights: customWeights } : null,
        rows: customRows,
      };
    }

    return {
      title: tournamentMeta.title,
      meta: tournamentMeta.meta,
      scoreLabel: "Tournament Score",
      weightEntry: tournamentWeightEntry,
      rows: tournamentRows,
    };
  }, [
    baselineRows,
    currentEvent,
    customRows,
    customWeights,
    defaultWeightEntry,
    modelMode,
    selectedFutureEvent,
    tournamentMeta,
    tournamentRows,
    tournamentWeightEntry,
  ]);

  const hasBestBetsPanel = useMemo(() => {
    if (!bestBets) return false;
    return [bestBets.outrights, bestBets.top5, bestBets.top10, bestBets.top20].every(
      (section) => Array.isArray(section) && section.length > 0,
    );
  }, [bestBets]);
  const bestBetsBannerTitle = [bestBets?.tournament, bestBets?.course].filter(Boolean).join(" — ");
  const bestBetsTeaser = truncateTeaser(bestBets?.preview?.tournamentOverview, 120);
  const bestBetsGeneratedLabel = formatGeneratedDate(bestBets?.generatedAt);

  useEffect(() => {
    if (!activeContent.rows.length || !baselineRows.length || modelMode === "standard") {
      setMovementMap({});
      return;
    }

    if (!hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      return;
    }

    setMovementMap(buildMovementMap(activeContent.rows, baselineRows));
    if (movementTimeoutRef.current) clearTimeout(movementTimeoutRef.current);
    movementTimeoutRef.current = setTimeout(() => setMovementMap({}), 1100);
  }, [activeContent.rows, baselineRows, modelMode]);

  return (
    <SiteShell>
      <main className="site-page bg-[#eef3f8] pb-16 pt-4 text-slate-900">
        <div className="site-container">
          {hasBestBetsPanel ? (
            <section className="mb-4 rounded-[30px] border border-green-800 bg-green-950 px-5 py-5 text-white shadow-[0_18px_40px_rgba(20,83,45,0.26)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-green-300/80">
                    THIS WEEK'S BETTING PREVIEW
                  </div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-[2rem]">
                    {bestBetsBannerTitle || "PGA Best Bets"}
                  </h2>
                  <p className="max-w-4xl text-sm text-green-100/88">
                    {bestBetsTeaser || "Model-driven tournament betting analysis, picks, and odds for this week's PGA event."}
                  </p>
                </div>

                <Link
                  to="/pga/best-bets"
                  className="inline-flex w-full items-center justify-center rounded-full border border-green-700 bg-green-800 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-green-700 lg:w-auto"
                >
                  View Full Picks &amp; Odds →
                </Link>
              </div>
            </section>
          ) : null}

          {hasBestBetsPanel ? (
            <section className="mb-4 rounded-[28px] border border-green-800 bg-green-900 p-4 text-white shadow-[0_18px_40px_rgba(20,83,45,0.26)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-green-200/80">Best Bets</div>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-white">
                    {bestBets?.tournament ?? "PGA Best Bets"}
                  </h2>
                </div>
                <Link
                  to="/pga/best-bets"
                  className="text-sm font-semibold text-green-100 transition hover:text-white"
                >
                  View Full Analysis -&gt;
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-green-200/82">
                <span>Outrights: {bestBets?.outrights?.length ?? 0} picks</span>
                <span aria-hidden="true">·</span>
                <span>Value Bets: {bestBets?.valueBets?.length ?? 0} identified</span>
                <span aria-hidden="true">·</span>
                <span>Generated: {bestBetsGeneratedLabel || EMPTY_MESSAGE}</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { key: "outrights", title: "Outright Winners", description: "High upside plays" },
                  { key: "top5", title: "Top 5 Finishes", description: "Value with win equity" },
                  { key: "top10", title: "Top 10 Finishes", description: "High floor targets" },
                  { key: "top20", title: "Top 20 Finishes", description: "Consistency plays" },
                ].map((card) => {
                  const picks = bestBets?.[card.key as keyof BestBetsPreviewData] as BestBetPickPreview[] | undefined;
                  return (
                    <Link
                      key={card.key}
                      to={`/pga/best-bets#${card.key}`}
                      className="rounded-[20px] border border-green-700 bg-green-800/70 p-4 transition hover:-translate-y-0.5 hover:bg-green-800"
                    >
                      <div className="text-sm font-semibold text-white">{card.title}</div>
                      <div className="mt-1 text-xs text-green-200/88">{card.description}</div>
                      <div className="mt-4 text-lg font-semibold tracking-[-0.02em] text-white">
                        {picks?.[0]?.player ?? EMPTY_MESSAGE}
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm italic text-green-100/75">
                <span>
                  Our model analyzes strokes gained, course weights, and current odds to surface the best values. Click any
                  category for the full breakdown.
                </span>
                <Link to="/pga/best-bets" className="font-semibold not-italic text-green-100 transition hover:text-white">
                  View Full Analysis →
                </Link>
              </div>
            </section>
          ) : (
            <div className="mb-4 px-1 text-sm text-slate-500">Best bets analysis drops every Monday</div>
          )}

          <div className="mb-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <SportsbookBar />
          </div>

          <div className="grid gap-4 md:grid-cols-[292px_minmax(0,1fr)]">
            <PgaScheduleRail
              schedule={schedule}
              activeEvent={activeEvent}
              resolvedEvent={currentEvent}
              sidebarFilter={sidebarFilter}
              setSidebarFilter={setSidebarFilter}
              selectedScheduleId={selectedScheduleId}
              onSelect={(id) => {
                setSelectedScheduleId(id);
                setModelMode("tournament");
              }}
            />

            <section className="space-y-4">
              <div className="space-y-1 px-1">
                <p className="text-sm text-muted-foreground">
                  PGA Tour player rankings updated every Monday using strokes gained data from the PGA Tour, DataGolf course stats, and player trend tables.
                </p>
                <p className="text-sm text-muted-foreground">
                  Switch between the power rankings, this week&apos;s course-weighted tournament model, or build your own.
                </p>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">PGA Ranking Engine</div>
                      <div className="truncate text-2xl font-semibold tracking-[-0.03em] text-slate-900">{activeContent.title}</div>
                      <div className="truncate text-sm text-slate-500">{activeContent.meta}</div>
                      <div className="text-xs text-slate-400">{activeContent.rows.length} active players ranked</div>
                      <div className="pt-1">
                        <Link to="/pga/best-bets" className="text-sm font-semibold text-emerald-700 transition hover:text-emerald-800">
                          Best Bets -&gt;
                        </Link>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 xl:items-end">
                      <div className="inline-flex w-full rounded-full border border-slate-200 bg-slate-100 p-1 xl:w-auto">
                        {MODEL_OPTIONS.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setModelMode(option.key);
                              if (option.key !== "tournament") {
                                setSelectedScheduleId(null);
                              }
                            }}
                            className={cn(
                              "flex-1 rounded-full px-4 py-2 text-sm font-semibold transition xl:flex-none",
                              modelMode === option.key
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-900",
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                        <Link
                          to="/pga/dfs"
                          className="flex-1 rounded-full px-4 py-2 text-center text-sm font-semibold text-slate-500 transition hover:text-slate-900 xl:flex-none"
                        >
                          DFS Upload
                        </Link>
                      </div>

                      <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => setDisplayMode("raw")}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                            displayMode === "raw" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
                          )}
                        >
                          Raw Stats
                        </button>
                        <button
                          type="button"
                          onClick={() => setDisplayMode("percentile")}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                            displayMode === "percentile" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
                          )}
                        >
                          Percentile Rank
                        </button>
                      </div>
                    </div>
                  </div>

                  {modelMode === "tournament" ? (
                    <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
                          {TOURNAMENT_OPTIONS.map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => {
                                setTournamentMode(option.key);
                                setSelectedScheduleId(null);
                              }}
                              className={cn(
                                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                                tournamentMode === option.key && !selectedScheduleId
                                  ? "bg-slate-900 text-white"
                                  : "text-slate-500 hover:text-slate-900",
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>

                        <div className="text-xs text-slate-500">
                          {selectedScheduleId ? "Schedule selection overrides the weekly toggle." : "Tournament mode uses course-specific weights for the selected event."}
                        </div>
                      </div>

                      <WeightBadgeRow entry={activeContent.weightEntry as CourseWeightFeedEntry | null} />
                    </div>
                  ) : null}

                  {modelMode === "custom" ? (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {CUSTOM_KEYS.map((entry) => (
                          <div key={entry.key} className="rounded-[22px] border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{entry.short}</div>
                                <div className="text-sm font-medium text-slate-900">{entry.label}</div>
                              </div>
                              <div className="text-sm font-semibold text-slate-900">
                                {customPercentWeights ? customPercentWeights[entry.key].toFixed(1) : "--"}%
                              </div>
                            </div>
                            <Slider
                              value={[customPercentWeights?.[entry.key] ?? 0]}
                              min={0}
                              max={100}
                              step={0.5}
                              onValueChange={(value) => {
                                if (!customPercentWeights) return;
                                setCustomPercentWeights(rebalanceWeights(customPercentWeights, entry.key, value[0] ?? 0));
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Active Weights</div>
                        <WeightBadgeRow entry={activeContent.weightEntry as CourseWeightFeedEntry | null} />
                        <div className="space-y-2">
                          <Button
                            variant="outline"
                            className="w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                            onClick={() => defaultWeightEntry && setCustomPercentWeights(toPercentWeights(defaultWeightEntry.weights))}
                          >
                            Reset to Default
                          </Button>
                          <Button
                            className="w-full bg-slate-900 text-white hover:bg-slate-800"
                            onClick={() => {
                              if (!customWeights) return;
                              setThisWeekOverride(customWeights);
                              setCurrentOverride(customWeights);
                              setModelMode("tournament");
                              setSelectedScheduleId(null);
                              setTournamentMode("current");
                            }}
                          >
                            Apply to This Week
                          </Button>
                          <Button asChild variant="outline" className="w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-100">
                            <Link to="/pga/custom">Open Full Builder</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {modelMode === "standard" ? (
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                      <WeightBadgeRow entry={activeContent.weightEntry as CourseWeightFeedEntry | null} />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                {loading || !activeContent.rows.length ? (
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    {loading ? "Loading PGA data..." : EMPTY_MESSAGE}
                  </div>
                ) : (
                  <PgaCompactTable
                    rows={activeContent.rows}
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
