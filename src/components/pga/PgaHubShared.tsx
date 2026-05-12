import { Fragment, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type PgaScheduleFeedEntry = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  courseName: string;
  location: string;
  startDate: string;
  endDate: string;
  dateLabel: string;
  eventType: string;
  category: "major" | "wgc" | "signature" | "standard";
  status: string;
  winner: string;
  dataFile: string;
  sourceTour: string;
  sourceCountry: string;
};

export type CourseWeightSet = {
  sgTotal: number;
  sgOTT: number;
  sgApp: number;
  sgAtG: number;
  sgPutt: number;
  trendRank: number;
  drivingAccuracy: number;
  bogeyAvoidance: number;
  birdieBogeyRatio: number;
};

export type CourseWeightFeedEntry = {
  tournament: string;
  course: string;
  weights: CourseWeightSet;
};

export type RawPlayerStat = {
  player: string;
  sgTotal: number;
  sgOTT: number;
  sgApp: number;
  sgAtG: number;
  sgPutt: number;
  trendRank: number | null;
  drivingAccuracy: number;
  bogeyAvoidance: number;
  birdieBogeyRatio: number;
};

export type RankedPlayerRow = RawPlayerStat & {
  rank: number;
  score: number;
};

export type SidebarFilter = "all" | "major" | "wgc" | "signature" | "standard";
export type BaseView = "power" | "current" | "next";
export type MovementDirection = "up" | "down";
export type StatDisplayMode = "raw" | "percentile";

export const EMPTY_MESSAGE = "Data updating - check back Monday";
export const THIS_WEEK_OVERRIDE_KEY = "pga:this-week-override";
export const PGA_PRESET_STORAGE_KEY = "pga:custom-presets";
export const PGA_CUSTOM_WORKING_WEIGHTS_KEY = "pga:custom-working-weights";

export const FILTER_OPTIONS: Array<{ key: SidebarFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "major", label: "Majors" },
  { key: "wgc", label: "WGC" },
  { key: "signature", label: "Signature" },
  { key: "standard", label: "Standard" },
];

export const DATA_SOURCES = [
  { id: "power", title: "Power Rankings", scoreLabel: "Power Score" },
  { id: "current", title: "Current Tournament Model", scoreLabel: "Model Score" },
  { id: "next", title: "Next Week Tournament Model", scoreLabel: "Model Score" },
] as const;

export const CUSTOM_WEIGHT_CONTROLS = [
  { key: "sgTotal", short: "SGT", full: "SG Total" },
  { key: "sgOTT", short: "OTT", full: "SG Off Tee" },
  { key: "sgApp", short: "APP", full: "SG Approach" },
  { key: "sgAtG", short: "ATG", full: "SG Around Green" },
  { key: "sgPutt", short: "PUT", full: "SG Putting" },
  { key: "trendRank", short: "TREND", full: "DataGolf Trend" },
  { key: "drivingAccuracy", short: "DRV%", full: "Driving Accuracy" },
  { key: "bogeyAvoidance", short: "BOG", full: "Bogey Avoidance" },
  { key: "birdieBogeyRatio", short: "B/B", full: "Birdie/Bogey Ratio" },
] as const;

type StatKey = (typeof CUSTOM_WEIGHT_CONTROLS)[number]["key"];
const LOWER_IS_BETTER_STATS = new Set(["trendrank", "bogeyavoidance", "bog", "bogey avoidance"]);

const DEFAULT_CUSTOM_WEIGHT_BASE: CourseWeightSet = {
  sgTotal: 0,
  sgOTT: 0,
  sgApp: 0,
  sgAtG: 0,
  sgPutt: 0,
  trendRank: 0,
  drivingAccuracy: 0,
  bogeyAvoidance: 0,
  birdieBogeyRatio: 0,
};

export function normalizeCustomWeights(
  weights: Partial<CourseWeightSet> | null | undefined,
  fallback?: Partial<CourseWeightSet> | null,
): CourseWeightSet {
  return {
    ...DEFAULT_CUSTOM_WEIGHT_BASE,
    ...(fallback ?? {}),
    ...(weights ?? {}),
  };
}

function isValidScheduleData(value: unknown): value is PgaScheduleFeedEntry[] {
  return Array.isArray(value);
}

function isValidCourseWeightsData(value: unknown): value is CourseWeightFeedEntry[] {
  return Array.isArray(value);
}

function isValidPlayerStatsData(value: unknown): value is RawPlayerStat[] {
  return Array.isArray(value);
}

function isLowerBetterStat(statKey: string) {
  return LOWER_IS_BETTER_STATS.has(statKey.toLowerCase());
}

export function normalizeEventKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\[.*?\]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getEasternDateKey(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

export function getCurrentAndNextEvents(schedule: PgaScheduleFeedEntry[]) {
  const sorted = [...schedule].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const todayKey = getEasternDateKey(new Date());
  const activeRows = sorted.filter((entry) => entry.startDate <= todayKey && entry.endDate >= todayKey);
  const active = activeRows[0] ?? null;
  const firstUpcoming = sorted.find((entry) => entry.startDate > todayKey) ?? null;
  const current = active ?? firstUpcoming ?? sorted.at(-1) ?? null;
  const next = current ? sorted.find((entry) => entry.startDate > current.startDate) ?? null : null;

  return { active, current, next };
}

export function isFutureOrCurrent(entry: PgaScheduleFeedEntry, currentEvent: PgaScheduleFeedEntry | null) {
  if (!currentEvent) return entry.status !== "complete";
  return entry.startDate >= currentEvent.startDate;
}

export function findCourseWeightEntry(entries: CourseWeightFeedEntry[], tournamentName: string, courseName: string) {
  const tournamentKey = normalizeEventKey(tournamentName);
  const courseKey = normalizeEventKey(courseName);

  return (
    entries.find((entry) => normalizeEventKey(entry.tournament) === tournamentKey && normalizeEventKey(entry.course) === courseKey)
    ?? entries.find((entry) => normalizeEventKey(entry.tournament) === tournamentKey)
    ?? entries.find((entry) => normalizeEventKey(entry.course) === courseKey)
    ?? null
  );
}

export function findDefaultWeightEntry(entries: CourseWeightFeedEntry[]) {
  return entries.find((entry) => normalizeEventKey(entry.tournament) === "default") ?? null;
}

export function rankPlayers(players: RawPlayerStat[], weights: CourseWeightSet) {
  const ranges = Object.fromEntries(
    CUSTOM_WEIGHT_CONTROLS.map(({ key }) => {
      const values = players
        .map((player) => player[key] as number | null)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return [key, values.length > 0 ? { min: Math.min(...values), max: Math.max(...values) } : null];
    }),
  ) as Record<StatKey, { min: number; max: number } | null>;

  return players
    .map((player) => {
      let weightedScore = 0;
      let availableWeightTotal = 0;

      CUSTOM_WEIGHT_CONTROLS.forEach(({ key }) => {
        const value = player[key] as number | null;
        const weight = weights[key] ?? 0;
        const range = ranges[key];
        if (weight <= 0 || value == null || range == null) return;

        const normalized = isLowerBetterStat(key)
          ? range.max === range.min
            ? 100
            : ((range.max - value) / (range.max - range.min)) * 100
          : range.max === range.min
            ? 100
            : ((value - range.min) / (range.max - range.min)) * 100;
        weightedScore += normalized * weight;
        availableWeightTotal += weight;
      });

      return { ...player, score: availableWeightTotal > 0 ? weightedScore / availableWeightTotal : 0 };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.player.localeCompare(right.player);
    })
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

export function getThisWeekOverride() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(THIS_WEEK_OVERRIDE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CourseWeightSet;
  } catch {
    return null;
  }
}

export function setThisWeekOverride(weights: CourseWeightSet) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THIS_WEEK_OVERRIDE_KEY, JSON.stringify(weights));
}

export function loadCustomPresets(fallbackWeights?: Partial<CourseWeightSet> | null) {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(PGA_PRESET_STORAGE_KEY);
    if (!raw) return {} as Record<string, CourseWeightSet>;
    const parsed = JSON.parse(raw) as Record<string, Partial<CourseWeightSet>>;
    return Object.fromEntries(
      Object.entries(parsed).map(([name, weights]) => [name, normalizeCustomWeights(weights, fallbackWeights)]),
    ) as Record<string, CourseWeightSet>;
  } catch {
    return {} as Record<string, CourseWeightSet>;
  }
}

export function saveCustomPreset(name: string, weights: CourseWeightSet) {
  if (typeof window === "undefined") return;
  const current = loadCustomPresets();
  current[name] = weights;
  window.localStorage.setItem(PGA_PRESET_STORAGE_KEY, JSON.stringify(current));
}

export function getSavedCustomWeights(fallbackWeights?: Partial<CourseWeightSet> | null) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PGA_CUSTOM_WORKING_WEIGHTS_KEY);
    if (!raw) return null;
    return normalizeCustomWeights(JSON.parse(raw) as Partial<CourseWeightSet>, fallbackWeights);
  } catch {
    return null;
  }
}

export function setSavedCustomWeights(weights: CourseWeightSet) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PGA_CUSTOM_WORKING_WEIGHTS_KEY, JSON.stringify(weights));
}

export function formatScore(value: number) {
  return value.toFixed(2);
}

export function formatRawStat(key: StatKey, value: number | null) {
  if (value == null) return "—";
  if (key === "trendRank") return value.toFixed(0);
  if (key === "drivingAccuracy") return value.toFixed(1);
  if (key === "bogeyAvoidance") return (value * 100).toFixed(1);
  if (key === "birdieBogeyRatio") return value.toFixed(2);
  return value.toFixed(3);
}

function getPercentileMaps(rows: RankedPlayerRow[]) {
  const statPercentiles = Object.fromEntries(
    CUSTOM_WEIGHT_CONTROLS.map(({ key }) => {
      const sorted = [...rows]
        .map((row) => ({ player: row.player, value: row[key] as number | null }))
        .filter((row): row is { player: string; value: number } => typeof row.value === "number" && Number.isFinite(row.value))
        .sort((left, right) => {
          const valueDelta = isLowerBetterStat(key) ? left.value - right.value : right.value - left.value;
          return valueDelta || left.player.localeCompare(right.player);
        });

      const map: Record<string, number | null> = {};
      const total = sorted.length;
      sorted.forEach((row, index) => {
        const percentile = total <= 1 ? 99 : Math.max(1, Math.round(((total - 1 - index) / (total - 1)) * 98 + 1));
        map[row.player] = percentile;
      });
      rows.forEach((row) => {
        if (row[key] == null) {
          map[row.player] = null;
        }
      });
      return [key, map];
    }),
  ) as Record<StatKey, Record<string, number | null>>;

  return statPercentiles;
}

function getCellStyle(percentile: number | null, mode: StatDisplayMode) {
  if (percentile == null) return undefined;
  const value = percentile;

  if (mode === "percentile") {
    if (value >= 75) return { backgroundColor: "#166534", color: "#f0fdf4" };
    if (value >= 50) return { backgroundColor: "#bbf7d0", color: "#052e16" };
    if (value <= 10) return { backgroundColor: "#991b1b", color: "#fef2f2" };
    if (value <= 25) return { backgroundColor: "#fecaca", color: "#450a0a" };
    return undefined;
  }

  if (value >= 90) return { backgroundColor: "#166534", color: "#f0fdf4" };
  if (value >= 75) return { backgroundColor: "#bbf7d0", color: "#052e16" };
  if (value <= 10) return { backgroundColor: "#991b1b", color: "#fef2f2" };
  if (value <= 25) return { backgroundColor: "#fecaca", color: "#450a0a" };
  return undefined;
}

function CompactHeaderTooltip({ short, full }: { short: string; full: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-4">{short}</span>
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  );
}

export function WeightBadgeRow({ entry }: { entry: CourseWeightFeedEntry | null }) {
  if (!entry) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {EMPTY_MESSAGE}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {CUSTOM_WEIGHT_CONTROLS.map(({ key, short, full }) => (
      <Tooltip key={key}>
        <TooltipTrigger asChild>
          <div className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-slate-600">
            {short} {((entry.weights[key] ?? 0) * 100).toFixed(1)}%
          </div>
        </TooltipTrigger>
        <TooltipContent>{full}</TooltipContent>
      </Tooltip>
      ))}
    </div>
  );
}

export function usePgaHubData() {
  const [schedule, setSchedule] = useState<PgaScheduleFeedEntry[]>([]);
  const [courseWeights, setCourseWeights] = useState<CourseWeightFeedEntry[]>([]);
  const [playerStats, setPlayerStats] = useState<RawPlayerStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadData() {
      const [scheduleResponse, courseWeightsResponse, playerStatsResponse] = await Promise.all([
        fetch("/data/pga/schedule.json", { cache: "no-store" }),
        fetch("/data/pga/course-weights.json", { cache: "no-store" }),
        fetch("/data/pga/player-stats-raw.json", { cache: "no-store" }),
      ]);

      if (!active) return;

      if (scheduleResponse.ok) {
        const payload: unknown = await scheduleResponse.json();
        setSchedule(isValidScheduleData(payload) ? payload : []);
      }
      if (courseWeightsResponse.ok) {
        const payload: unknown = await courseWeightsResponse.json();
        setCourseWeights(isValidCourseWeightsData(payload) ? payload : []);
      }
      if (playerStatsResponse.ok) {
        const payload: unknown = await playerStatsResponse.json();
        setPlayerStats(isValidPlayerStatsData(payload) ? payload : []);
      }

      setLoading(false);
    }

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  return { schedule, courseWeights, playerStats, loading };
}

export function PgaScheduleRail({
  schedule,
  activeEvent,
  resolvedEvent,
  sidebarFilter,
  setSidebarFilter,
  selectedScheduleId,
  onSelect,
}: {
  schedule: PgaScheduleFeedEntry[];
  activeEvent: PgaScheduleFeedEntry | null;
  resolvedEvent: PgaScheduleFeedEntry | null;
  sidebarFilter: SidebarFilter;
  setSidebarFilter: (filter: SidebarFilter) => void;
  selectedScheduleId: string | null;
  onSelect: (id: string) => void;
}) {
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const filteredSchedule = useMemo(
    () => schedule.filter((entry) => sidebarFilter === "all" || entry.category === sidebarFilter),
    [schedule, sidebarFilter],
  );

  const groupedSchedule = useMemo(() => {
    const sorted = [...filteredSchedule].sort((left, right) => left.startDate.localeCompare(right.startDate));

    if (sorted.length === 0) {
      return {
        featuredRows: [] as PgaScheduleFeedEntry[],
        previousRows: [] as PgaScheduleFeedEntry[],
      };
    }

    const currentRows = activeEvent
      ? sorted.filter((entry) => entry.startDate === activeEvent.startDate && entry.endDate === activeEvent.endDate)
      : [];

    if (currentRows.length > 0) {
      const currentIds = new Set(currentRows.map((entry) => entry.id));
      const futureRows = sorted.filter((entry) => entry.startDate > activeEvent!.startDate);
      const previousRows = sorted.filter((entry) => !currentIds.has(entry.id) && entry.startDate < activeEvent!.startDate);

      return {
        featuredRows: [...currentRows, ...futureRows],
        previousRows,
      };
    }

    const upcomingRows = sorted.filter((entry) => entry.status !== "complete");
    if (upcomingRows.length > 0) {
      const upcomingIds = new Set(upcomingRows.map((entry) => entry.id));
      const previousRows = sorted.filter((entry) => !upcomingIds.has(entry.id));

      return {
        featuredRows: upcomingRows,
        previousRows,
      };
    }

    const reversePastRows = [...sorted].reverse();
    return {
      featuredRows: reversePastRows.slice(0, 1),
      previousRows: reversePastRows.slice(1),
    };
  }, [activeEvent, filteredSchedule]);

  const renderScheduleRow = (entry: PgaScheduleFeedEntry) => {
    const isCurrent = activeEvent?.id === entry.id;
    const isPast = entry.status === "complete";
    const isSelectable = isFutureOrCurrent(entry, resolvedEvent);
    const isSelected = selectedScheduleId === entry.id || (!selectedScheduleId && resolvedEvent?.id === entry.id);

    return (
      <button
        key={entry.id}
        type="button"
        disabled={!isSelectable}
        onClick={() => isSelectable && onSelect(entry.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition",
          isPast && "cursor-default border-slate-200 bg-slate-50 text-slate-400",
          !isPast && !isCurrent && !isSelected && "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
          isCurrent && !isSelected && "border-sky-200 bg-sky-50 text-slate-900",
          isSelected && "border-slate-900 bg-slate-900 text-white",
        )}
      >
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-current/70">
          {entry.dateLabel}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
        <span className="shrink-0 rounded-full border border-current/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]">
          {isCurrent ? "Now" : entry.category === "major" ? "Maj" : entry.category === "wgc" ? "WGC" : entry.category === "signature" ? "Sig" : "Std"}
        </span>
      </button>
    );
  };

  const rail = (
    <div className="space-y-3">
      <div className="border-b border-slate-200 pb-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">2026 PGA Tour</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSidebarFilter(option.key)}
              className={cn(
                "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                sidebarFilter === option.key
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {filteredSchedule.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
            {EMPTY_MESSAGE}
          </div>
        ) : (
          <>
            {groupedSchedule.featuredRows.map((entry) => renderScheduleRow(entry))}

            {groupedSchedule.previousRows.length > 0 ? (
              <div className="pt-1">
                <button
                  type="button"
                  aria-expanded={previousExpanded}
                  onClick={() => setPreviousExpanded((current) => !current)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                >
                  <span>Previous Tournaments</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", previousExpanded && "rotate-180")} />
                </button>

                {previousExpanded ? (
                  <div className="mt-1 space-y-1">
                    {groupedSchedule.previousRows.map((entry) => renderScheduleRow(entry))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden rounded-[24px] border border-slate-200 bg-[#f8fafc] p-3 shadow-[0_18px_40px_rgba(15,23,42,0.06)] md:block md:sticky md:top-20 md:h-[calc(100vh-6rem)] md:overflow-y-auto">
        {rail}
      </aside>

      <Drawer>
        <DrawerTrigger asChild>
          <Button className="fixed bottom-4 left-4 z-40 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-lg md:hidden">
            <CalendarDays className="h-3.5 w-3.5" />
            Schedule
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[80vh] border-slate-200 bg-[#f8fafc] text-slate-900">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-sm">Schedule</DrawerTitle>
            <DrawerDescription className="text-xs text-slate-500">
              Pick a future tournament to re-rank the field.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-3 pb-6">{rail}</div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

export function PgaCompactTable({
  rows,
  scoreLabel,
  movementMap,
  displayMode,
}: {
  rows: RankedPlayerRow[];
  scoreLabel: string;
  movementMap: Record<string, MovementDirection>;
  displayMode: StatDisplayMode;
}) {
  const [expandedPlayers, setExpandedPlayers] = useState<Record<string, boolean>>({});
  const statPercentiles = useMemo(() => getPercentileMaps(rows), [rows]);

  const visibleDesktopColumns = CUSTOM_WEIGHT_CONTROLS.slice(0, 6);

  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="overflow-x-auto">
        <Table className="min-w-[880px] text-xs text-slate-700">
          <TableHeader>
            <TableRow className="border-slate-200 hover:bg-transparent">
              <TableHead className="sticky left-0 z-30 h-9 min-w-[48px] bg-white px-2 py-1 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500">Rank</TableHead>
              <TableHead className="sticky left-[48px] z-30 h-9 min-w-[160px] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Player</TableHead>
              <TableHead className="h-9 min-w-[72px] px-2 py-1 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500">{scoreLabel}</TableHead>
              {visibleDesktopColumns.map((column) => (
                <TableHead key={column.key} className="hidden h-9 min-w-[62px] px-2 py-1 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500 md:table-cell">
                  <CompactHeaderTooltip short={column.short} full={column.full} />
                </TableHead>
              ))}
              {CUSTOM_WEIGHT_CONTROLS.slice(6).map((column) => (
                <TableHead key={column.key} className="hidden h-9 min-w-[62px] px-2 py-1 text-center text-[10px] uppercase tracking-[0.16em] text-slate-500 lg:table-cell">
                  <CompactHeaderTooltip short={column.short} full={column.full} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const topTen = row.rank <= 10 || index < 10;
              const movement = movementMap[row.player];
              const expanded = Boolean(expandedPlayers[row.player]);

              return (
                <Fragment key={`${row.player}-${row.rank}`}>
                  <TableRow
                    key={`${row.player}-${row.rank}`}
                    onClick={() => setExpandedPlayers((current) => ({ ...current, [row.player]: !current[row.player] }))}
                    className={cn(
                      "cursor-pointer border-slate-100 transition-colors duration-700 hover:bg-slate-50",
                      topTen && "bg-emerald-50 hover:bg-emerald-50",
                      movement === "up" && "bg-emerald-100 hover:bg-emerald-100",
                      movement === "down" && "bg-rose-100 hover:bg-rose-100",
                    )}
                  >
                    <TableCell className="sticky left-0 z-20 bg-inherit px-2 py-1 text-center font-semibold text-slate-700">{row.rank}</TableCell>
                    <TableCell className="sticky left-[48px] z-20 bg-inherit px-2 py-1 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{row.player}</span>
                        <ChevronDown className={cn("h-3 w-3 shrink-0 md:hidden", expanded && "rotate-180")} />
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-1 text-center font-semibold text-slate-900">{formatScore(row.score)}</TableCell>
                    {CUSTOM_WEIGHT_CONTROLS.slice(0, 6).map((column) => {
                      const percentile = statPercentiles[column.key][row.player] ?? null;
                      const cellStyle = getCellStyle(percentile, displayMode);
                      const displayValue = displayMode === "percentile" ? (percentile != null ? String(percentile) : "—") : formatRawStat(column.key, row[column.key]);

                      return (
                        <TableCell key={column.key} className="hidden px-2 py-1 text-center md:table-cell" style={cellStyle}>
                          {displayValue}
                        </TableCell>
                      );
                    })}
                    {CUSTOM_WEIGHT_CONTROLS.slice(6).map((column) => {
                      const percentile = statPercentiles[column.key][row.player] ?? null;
                      const cellStyle = getCellStyle(percentile, displayMode);
                      const displayValue = displayMode === "percentile" ? (percentile != null ? String(percentile) : "—") : formatRawStat(column.key, row[column.key]);

                      return (
                        <TableCell key={column.key} className="hidden px-2 py-1 text-center lg:table-cell" style={cellStyle}>
                          {displayValue}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {expanded ? (
                    <TableRow className="border-slate-200 bg-slate-50 md:hidden">
                      <TableCell colSpan={3 + CUSTOM_WEIGHT_CONTROLS.length} className="px-3 py-2">
                        <div className="grid grid-cols-2 gap-2">
                          {CUSTOM_WEIGHT_CONTROLS.map((column) => {
                            const percentile = statPercentiles[column.key][row.player] ?? null;
                            const cellStyle = getCellStyle(percentile, displayMode);
                            const displayValue = displayMode === "percentile" ? (percentile != null ? String(percentile) : "—") : formatRawStat(column.key, row[column.key]);

                            return (
                              <div key={column.key} className="rounded-lg border border-slate-200 px-2 py-1 text-center" style={cellStyle}>
                                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{column.short}</div>
                                <div className="mt-0.5 text-xs font-semibold text-inherit">{displayValue}</div>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
