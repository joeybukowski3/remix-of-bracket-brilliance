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

const STAT_CONFIG = [
  { key: "sgTotal", short: "SGT", full: "SG Total" },
  { key: "sgOTT", short: "OTT", full: "SG Off Tee" },
  { key: "sgApp", short: "APP", full: "SG Approach" },
  { key: "sgAtG", short: "ATG", full: "SG Around Green" },
  { key: "sgPutt", short: "PUT", full: "SG Putting" },
  { key: "drivingAccuracy", short: "DRV%", full: "Driving Accuracy" },
  { key: "bogeyAvoidance", short: "BOG", full: "Bogey Avoidance" },
  { key: "birdieBogeyRatio", short: "B/B", full: "Birdie/Bogey Ratio" },
] as const;

type StatKey = (typeof STAT_CONFIG)[number]["key"];

function isValidScheduleData(value: unknown): value is PgaScheduleFeedEntry[] {
  return Array.isArray(value);
}

function isValidCourseWeightsData(value: unknown): value is CourseWeightFeedEntry[] {
  return Array.isArray(value);
}

function isValidPlayerStatsData(value: unknown): value is RawPlayerStat[] {
  return Array.isArray(value);
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

export function getCurrentAndNextEvents(schedule: PgaScheduleFeedEntry[]) {
  const sorted = [...schedule].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const current = sorted.find((entry) => entry.status !== "complete") ?? sorted.at(-1) ?? null;
  const next = current ? sorted.find((entry) => entry.startDate > current.startDate) ?? null : null;

  return { current, next };
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
    STAT_CONFIG.map(({ key }) => {
      const values = players.map((player) => player[key]);
      return [key, { min: Math.min(...values), max: Math.max(...values) }];
    }),
  ) as Record<StatKey, { min: number; max: number }>;

  return players
    .map((player) => {
      const score = STAT_CONFIG.reduce((total, { key }) => {
        const { min, max } = ranges[key];
        const normalized = max === min ? 100 : ((player[key] - min) / (max - min)) * 100;
        return total + normalized * weights[key];
      }, 0);

      return { ...player, score };
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

export function loadCustomPresets() {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(PGA_PRESET_STORAGE_KEY);
    if (!raw) return {} as Record<string, CourseWeightSet>;
    return JSON.parse(raw) as Record<string, CourseWeightSet>;
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

export function formatScore(value: number) {
  return value.toFixed(2);
}

export function formatRawStat(key: StatKey, value: number) {
  if (key === "drivingAccuracy") return value.toFixed(1);
  if (key === "bogeyAvoidance") return (value * 100).toFixed(1);
  if (key === "birdieBogeyRatio") return value.toFixed(2);
  return value.toFixed(3);
}

function getPercentileMaps(rows: RankedPlayerRow[]) {
  const statPercentiles = Object.fromEntries(
    STAT_CONFIG.map(({ key }) => {
      const sorted = [...rows]
        .map((row) => ({ player: row.player, value: row[key] }))
        .sort((left, right) => right.value - left.value || left.player.localeCompare(right.player));

      const map: Record<string, number> = {};
      const total = sorted.length;
      sorted.forEach((row, index) => {
        const percentile = total <= 1 ? 99 : Math.max(1, Math.round(((total - 1 - index) / (total - 1)) * 98 + 1));
        map[row.player] = percentile;
      });
      return [key, map];
    }),
  ) as Record<StatKey, Record<string, number>>;

  return statPercentiles;
}

function getCellStyle(percentile: number, mode: StatDisplayMode) {
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
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-50/80">
        {EMPTY_MESSAGE}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {STAT_CONFIG.map(({ key, short, full }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-emerald-50/90">
              {short} {(entry.weights[key] * 100).toFixed(1)}%
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
  currentEvent,
  sidebarFilter,
  setSidebarFilter,
  selectedScheduleId,
  onSelect,
}: {
  schedule: PgaScheduleFeedEntry[];
  currentEvent: PgaScheduleFeedEntry | null;
  sidebarFilter: SidebarFilter;
  setSidebarFilter: (filter: SidebarFilter) => void;
  selectedScheduleId: string | null;
  onSelect: (id: string) => void;
}) {
  const filteredSchedule = useMemo(
    () => schedule.filter((entry) => sidebarFilter === "all" || entry.category === sidebarFilter),
    [schedule, sidebarFilter],
  );

  const rail = (
    <div className="space-y-3">
      <div className="border-b border-white/8 pb-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300/70">2026 PGA Tour</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSidebarFilter(option.key)}
              className={cn(
                "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition",
                sidebarFilter === option.key
                  ? "border-emerald-400 bg-emerald-400 text-[#04110a]"
                  : "border-white/10 bg-white/4 text-emerald-50/70 hover:border-emerald-300/50 hover:text-white",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {filteredSchedule.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-4 text-xs text-emerald-50/70">
            {EMPTY_MESSAGE}
          </div>
        ) : (
          filteredSchedule.map((entry) => {
            const isCurrent = currentEvent?.id === entry.id;
            const isPast = entry.status === "complete";
            const isSelectable = isFutureOrCurrent(entry, currentEvent);
            const isSelected = selectedScheduleId === entry.id;

            return (
              <button
                key={entry.id}
                type="button"
                disabled={!isSelectable}
                onClick={() => isSelectable && onSelect(entry.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition",
                  isPast && "cursor-default border-white/6 bg-white/[0.03] text-white/34",
                  !isPast && !isCurrent && !isSelected && "border-white/8 bg-white/[0.03] text-white/78 hover:border-emerald-400/40 hover:bg-emerald-500/8",
                  isCurrent && "border-emerald-400/60 bg-emerald-500/12 text-white",
                  isSelected && "border-emerald-300 bg-emerald-400/18 text-white",
                )}
              >
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/58">
                  {entry.dateLabel}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                <span className="shrink-0 rounded-full border border-current/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]">
                  {isCurrent ? "Now" : entry.category === "major" ? "Maj" : entry.category === "wgc" ? "WGC" : entry.category === "signature" ? "Sig" : "Std"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden rounded-[24px] border border-white/8 bg-[#06100c] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)] md:block md:sticky md:top-20 md:h-[calc(100vh-6rem)] md:overflow-y-auto">
        {rail}
      </aside>

      <Drawer>
        <DrawerTrigger asChild>
          <Button className="fixed bottom-4 left-4 z-40 rounded-full bg-emerald-500 px-3 py-2 text-xs font-semibold text-[#04110a] shadow-lg md:hidden">
            <CalendarDays className="h-3.5 w-3.5" />
            Schedule
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[80vh] border-white/10 bg-[#06100c] text-white">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-sm">Schedule</DrawerTitle>
            <DrawerDescription className="text-xs text-emerald-50/60">
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

  const visibleDesktopColumns = STAT_CONFIG.slice(0, 5);

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/10 bg-[#07110d]">
      <div className="overflow-x-auto">
        <Table className="min-w-[880px] text-xs">
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="sticky left-0 z-30 h-8 min-w-[48px] bg-[#07110d] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-100/72">Rank</TableHead>
              <TableHead className="sticky left-[48px] z-30 h-8 min-w-[160px] bg-[#07110d] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-100/72">Player</TableHead>
              <TableHead className="h-8 min-w-[72px] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-100/72">{scoreLabel}</TableHead>
              {visibleDesktopColumns.map((column) => (
                <TableHead key={column.key} className="hidden h-8 min-w-[62px] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-100/72 md:table-cell">
                  <CompactHeaderTooltip short={column.short} full={column.full} />
                </TableHead>
              ))}
              {STAT_CONFIG.slice(5).map((column) => (
                <TableHead key={column.key} className="hidden h-8 min-w-[62px] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-100/72 lg:table-cell">
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
                      "cursor-pointer border-white/8 text-emerald-50/90 transition-colors duration-700 hover:bg-white/4",
                      topTen && "bg-emerald-500/10 hover:bg-emerald-500/12",
                      movement === "up" && "bg-emerald-400/22 hover:bg-emerald-400/24",
                      movement === "down" && "bg-rose-400/16 hover:bg-rose-400/18",
                    )}
                  >
                    <TableCell className="sticky left-0 z-20 bg-[#07110d] px-2 py-1 font-semibold">{row.rank}</TableCell>
                    <TableCell className="sticky left-[48px] z-20 bg-[#07110d] px-2 py-1 font-medium text-white">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{row.player}</span>
                        <ChevronDown className={cn("h-3 w-3 shrink-0 md:hidden", expanded && "rotate-180")} />
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-1">{formatScore(row.score)}</TableCell>
                    {STAT_CONFIG.slice(0, 5).map((column) => {
                      const percentile = statPercentiles[column.key][row.player];
                      const cellStyle = getCellStyle(percentile, displayMode);
                      const displayValue = displayMode === "percentile" ? String(percentile) : formatRawStat(column.key, row[column.key]);

                      return (
                        <TableCell key={column.key} className="hidden px-2 py-1 md:table-cell" style={cellStyle}>
                          {displayValue}
                        </TableCell>
                      );
                    })}
                    {STAT_CONFIG.slice(5).map((column) => {
                      const percentile = statPercentiles[column.key][row.player];
                      const cellStyle = getCellStyle(percentile, displayMode);
                      const displayValue = displayMode === "percentile" ? String(percentile) : formatRawStat(column.key, row[column.key]);

                      return (
                        <TableCell key={column.key} className="hidden px-2 py-1 lg:table-cell" style={cellStyle}>
                          {displayValue}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {expanded ? (
                    <TableRow className="border-white/8 bg-white/[0.03] md:hidden">
                      <TableCell colSpan={11} className="px-3 py-2">
                        <div className="grid grid-cols-2 gap-2">
                          {STAT_CONFIG.map((column) => {
                            const percentile = statPercentiles[column.key][row.player];
                            const cellStyle = getCellStyle(percentile, displayMode);
                            const displayValue = displayMode === "percentile" ? String(percentile) : formatRawStat(column.key, row[column.key]);

                            return (
                              <div key={column.key} className="rounded-lg border border-white/8 px-2 py-1" style={cellStyle}>
                                <div className="text-[10px] uppercase tracking-[0.14em]">{column.short}</div>
                                <div className="mt-0.5 text-xs font-semibold">{displayValue}</div>
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
