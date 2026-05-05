import { useEffect, useMemo, useRef, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageSeo } from "@/hooks/usePageSeo";
import { cn } from "@/lib/utils";

type PgaSheetSection = {
  section: string;
  title: string;
  tournamentName: string;
  courseName: string;
  generatedAt: string;
  rows: unknown[];
};

type PgaScheduleFeedEntry = {
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

type CourseWeightSet = {
  sgTotal: number;
  sgOTT: number;
  sgApp: number;
  sgAtG: number;
  sgPutt: number;
  drivingAccuracy: number;
  bogeyAvoidance: number;
  birdieBogeyRatio: number;
};

type CourseWeightFeedEntry = {
  tournament: string;
  course: string;
  weights: CourseWeightSet;
};

type RawPlayerStat = {
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

type RankedPlayerRow = RawPlayerStat & {
  rank: number;
  score: number;
};

type SectionState = {
  loading: boolean;
  data: PgaSheetSection;
};

type SidebarFilter = "all" | "major" | "wgc" | "signature" | "standard";
type BaseView = "power" | "current" | "next";
type MovementDirection = "up" | "down";

const DATA_SOURCES = [
  { id: "power", section: "power-rankings", title: "Power Rankings", path: "/data/pga/power-rankings.json", scoreLabel: "Power Score" },
  { id: "current", section: "current-tournament", title: "Current Tournament Model", path: "/data/pga/current-tournament.json", scoreLabel: "Model Score" },
  { id: "next", section: "next-tournament", title: "Next Week Tournament Model", path: "/data/pga/next-tournament.json", scoreLabel: "Model Score" },
] as const;

const TABLE_COLUMNS = [
  { key: "rank", label: "Rank", className: "w-[68px]" },
  { key: "player", label: "Player", className: "min-w-[220px]" },
  { key: "score", label: "Score", className: "min-w-[120px]" },
  { key: "sgTotal", label: "SG Total" },
  { key: "sgOtt", label: "SG OTT" },
  { key: "sgApp", label: "SG APP" },
  { key: "sgAtg", label: "SG ATG" },
  { key: "sgPutt", label: "SG PUTT" },
] as const;

const FILTER_OPTIONS: Array<{ key: SidebarFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "major", label: "Majors" },
  { key: "wgc", label: "WGC" },
  { key: "signature", label: "Signature Events" },
  { key: "standard", label: "Standard Events" },
];

const STAT_KEYS: Array<keyof CourseWeightSet> = [
  "sgTotal",
  "sgOTT",
  "sgApp",
  "sgAtG",
  "sgPutt",
  "drivingAccuracy",
  "bogeyAvoidance",
  "birdieBogeyRatio",
];

const EMPTY_MESSAGE = "Data updating - check back Monday";

function normalizeEventKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\[.*?\]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isValidSectionData(value: unknown): value is PgaSheetSection {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PgaSheetSection>;
  return typeof candidate.title === "string" && typeof candidate.section === "string";
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

function buildEmptySection(section: string, title: string): PgaSheetSection {
  return {
    section,
    title,
    tournamentName: "",
    courseName: "",
    generatedAt: "",
    rows: [],
  };
}

function getCurrentAndNextEvents(schedule: PgaScheduleFeedEntry[]) {
  const sorted = [...schedule].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const current = sorted.find((entry) => entry.status !== "complete") ?? sorted.at(-1) ?? null;
  const next = current
    ? sorted.find((entry) => entry.startDate > current.startDate) ?? null
    : null;

  return { current, next };
}

function isFutureOrCurrent(entry: PgaScheduleFeedEntry, currentEvent: PgaScheduleFeedEntry | null) {
  if (!currentEvent) return entry.status !== "complete";
  return entry.startDate >= currentEvent.startDate;
}

function findCourseWeightEntry(entries: CourseWeightFeedEntry[], tournamentName: string, courseName: string) {
  const tournamentKey = normalizeEventKey(tournamentName);
  const courseKey = normalizeEventKey(courseName);

  return (
    entries.find((entry) => normalizeEventKey(entry.tournament) === tournamentKey && normalizeEventKey(entry.course) === courseKey)
    ?? entries.find((entry) => normalizeEventKey(entry.tournament) === tournamentKey)
    ?? entries.find((entry) => normalizeEventKey(entry.course) === courseKey)
    ?? null
  );
}

function findDefaultWeightEntry(entries: CourseWeightFeedEntry[]) {
  return entries.find((entry) => normalizeEventKey(entry.tournament) === "default") ?? null;
}

export function rankPlayers(players: RawPlayerStat[], weights: CourseWeightSet) {
  const ranges = Object.fromEntries(
    STAT_KEYS.map((key) => {
      const values = players.map((player) => player[key]);
      return [key, { min: Math.min(...values), max: Math.max(...values) }];
    }),
  ) as Record<keyof CourseWeightSet, { min: number; max: number }>;

  const ranked = players
    .map((player) => {
      const score = STAT_KEYS.reduce((total, key) => {
        const { min, max } = ranges[key];
        const normalized = max === min ? 100 : ((player[key] - min) / (max - min)) * 100;
        return total + normalized * weights[key];
      }, 0);

      return {
        ...player,
        score,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.player.localeCompare(right.player);
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));

  return ranked;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number) {
  return value.toFixed(2);
}

function formatSg(value: number) {
  return value.toFixed(3);
}

function formatDrivingAccuracy(value: number) {
  return value.toFixed(1);
}

function buildTableRows(rows: RankedPlayerRow[]) {
  return rows.map((row) => ({
    rank: row.rank,
    player: row.player,
    score: formatScore(row.score),
    sgTotal: formatSg(row.sgTotal),
    sgOtt: formatSg(row.sgOTT),
    sgApp: formatSg(row.sgApp),
    sgAtg: formatSg(row.sgAtG),
    sgPutt: formatSg(row.sgPutt),
  }));
}

function WeightBreakdown({ entry }: { entry: CourseWeightFeedEntry | null }) {
  if (!entry) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-50/80">
        {EMPTY_MESSAGE}
      </div>
    );
  }

  const bars = [
    { label: "SG Total", value: entry.weights.sgTotal },
    { label: "SG Off Tee", value: entry.weights.sgOTT },
    { label: "SG Approach", value: entry.weights.sgApp },
    { label: "SG Around Green", value: entry.weights.sgAtG },
    { label: "SG Putting", value: entry.weights.sgPutt },
    { label: "Driving Accuracy", value: entry.weights.drivingAccuracy },
    { label: "Bogey Avoidance", value: entry.weights.bogeyAvoidance },
    { label: "Birdie/Bogey Ratio", value: entry.weights.birdieBogeyRatio },
  ];

  return (
    <div className="rounded-[24px] border border-emerald-500/20 bg-emerald-500/8 p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/68">
        Course Weight Breakdown
      </div>
      <div className="space-y-3">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-emerald-50/84">
              <span>{bar.label}</span>
              <span>{formatPercent(bar.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-emerald-400 to-lime-300"
                style={{ width: `${Math.max(6, bar.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PgaTable({
  rows,
  scoreLabel,
  movementMap,
}: {
  rows: ReturnType<typeof buildTableRows>;
  scoreLabel: string;
  movementMap: Record<string, MovementDirection>;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#07110d]">
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            {TABLE_COLUMNS.map((column) => (
              <TableHead key={column.key} className={cn("text-emerald-100/72", column.className)}>
                {column.key === "score" ? scoreLabel : column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const topTen = row.rank <= 10 || index < 10;
            const movement = movementMap[row.player];

            return (
              <TableRow
                key={`${row.player}-${row.rank}-${index}`}
                className={cn(
                  "border-white/8 text-emerald-50/90 transition-colors duration-700 hover:bg-white/4",
                  topTen && "bg-emerald-500/12 hover:bg-emerald-500/16",
                  movement === "up" && "bg-emerald-400/22 hover:bg-emerald-400/24",
                  movement === "down" && "bg-rose-400/16 hover:bg-rose-400/18",
                )}
              >
                <TableCell className="font-semibold">{row.rank}</TableCell>
                <TableCell className="font-medium text-white">{row.player}</TableCell>
                <TableCell>{row.score}</TableCell>
                <TableCell>{row.sgTotal}</TableCell>
                <TableCell>{row.sgOtt}</TableCell>
                <TableCell>{row.sgApp}</TableCell>
                <TableCell>{row.sgAtg}</TableCell>
                <TableCell>{row.sgPutt}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function PgaHub() {
  const [sections, setSections] = useState<Record<string, SectionState>>(() =>
    Object.fromEntries(
      DATA_SOURCES.map((source) => [
        source.id,
        { loading: true, data: buildEmptySection(source.section, source.title) },
      ]),
    ),
  );
  const [schedule, setSchedule] = useState<PgaScheduleFeedEntry[]>([]);
  const [courseWeights, setCourseWeights] = useState<CourseWeightFeedEntry[]>([]);
  const [playerStats, setPlayerStats] = useState<RawPlayerStat[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [activeView, setActiveView] = useState<BaseView>("power");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [movementMap, setMovementMap] = useState<Record<string, MovementDirection>>({});
  const movementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAnimatedRef = useRef(false);

  usePageSeo({
    title: "PGA Rankings Hub",
    description: "Weekly PGA power rankings, live current-week tournament model, next-week board, and a schedule-driven sidebar for future event planning.",
    path: "/pga",
  });

  useEffect(() => {
    let active = true;

    async function loadBaseData() {
      const [scheduleResponse, courseWeightsResponse, playerStatsResponse, ...sectionResponses] = await Promise.all([
        fetch("/data/pga/schedule.json", { cache: "no-store" }),
        fetch("/data/pga/course-weights.json", { cache: "no-store" }),
        fetch("/data/pga/player-stats-raw.json", { cache: "no-store" }),
        ...DATA_SOURCES.map((source) => fetch(source.path, { cache: "no-store" })),
      ]);

      if (!active) return;

      if (scheduleResponse.ok) {
        const payload: unknown = await scheduleResponse.json();
        setSchedule(isValidScheduleData(payload) ? payload : []);
      } else {
        setSchedule([]);
      }

      if (courseWeightsResponse.ok) {
        const payload: unknown = await courseWeightsResponse.json();
        setCourseWeights(isValidCourseWeightsData(payload) ? payload : []);
      } else {
        setCourseWeights([]);
      }

      if (playerStatsResponse.ok) {
        const payload: unknown = await playerStatsResponse.json();
        setPlayerStats(isValidPlayerStatsData(payload) ? payload : []);
      } else {
        setPlayerStats([]);
      }

      setScheduleLoading(false);

      const loadedSections = await Promise.all(
        sectionResponses.map(async (response, index) => {
          const source = DATA_SOURCES[index];
          if (!response.ok) {
            return [source.id, { loading: false, data: buildEmptySection(source.section, source.title) }] as const;
          }

          try {
            const payload: unknown = await response.json();
            if (!isValidSectionData(payload)) {
              return [source.id, { loading: false, data: buildEmptySection(source.section, source.title) }] as const;
            }

            return [source.id, { loading: false, data: payload }] as const;
          } catch {
            return [source.id, { loading: false, data: buildEmptySection(source.section, source.title) }] as const;
          }
        }),
      );

      if (!active) return;
      setSections(Object.fromEntries(loadedSections));
    }

    void loadBaseData();

    return () => {
      active = false;
      if (movementTimeoutRef.current) {
        clearTimeout(movementTimeoutRef.current);
      }
    };
  }, []);

  const { current: currentEvent, next: nextEvent } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);
  const filteredSchedule = useMemo(
    () => schedule.filter((entry) => sidebarFilter === "all" || entry.category === sidebarFilter),
    [schedule, sidebarFilter],
  );

  const defaultWeightEntry = useMemo(() => findDefaultWeightEntry(courseWeights), [courseWeights]);
  const currentWeightEntry = useMemo(
    () => currentEvent ? findCourseWeightEntry(courseWeights, currentEvent.name, currentEvent.courseName) : null,
    [courseWeights, currentEvent],
  );
  const nextWeightEntry = useMemo(
    () => nextEvent ? findCourseWeightEntry(courseWeights, nextEvent.name, nextEvent.courseName) : null,
    [courseWeights, nextEvent],
  );
  const selectedFutureEvent = useMemo(
    () => schedule.find((entry) => entry.id === selectedScheduleId) ?? null,
    [schedule, selectedScheduleId],
  );
  const selectedFutureWeightEntry = useMemo(
    () => selectedFutureEvent ? findCourseWeightEntry(courseWeights, selectedFutureEvent.name, selectedFutureEvent.courseName) : null,
    [courseWeights, selectedFutureEvent],
  );

  const activeContent = useMemo(() => {
    if (selectedFutureEvent) {
      return {
        eyebrow: "Future Tournament Model",
        title: selectedFutureEvent.name,
        subtitle: selectedFutureEvent.courseName || EMPTY_MESSAGE,
        scoreLabel: "Model Score",
        weightEntry: selectedFutureWeightEntry,
      };
    }

    if (activeView === "current") {
      return {
        eyebrow: sections.current?.data.title ?? "Current Tournament Model",
        title: currentEvent?.name ?? sections.current?.data.tournamentName ?? "Current Tournament Model",
        subtitle: currentEvent?.courseName ?? sections.current?.data.courseName ?? EMPTY_MESSAGE,
        scoreLabel: "Model Score",
        weightEntry: currentWeightEntry,
      };
    }

    if (activeView === "next") {
      return {
        eyebrow: sections.next?.data.title ?? "Next Week Tournament Model",
        title: nextEvent?.name ?? sections.next?.data.tournamentName ?? "Next Week Tournament Model",
        subtitle: nextEvent?.courseName ?? sections.next?.data.courseName ?? EMPTY_MESSAGE,
        scoreLabel: "Model Score",
        weightEntry: nextWeightEntry,
      };
    }

    return {
      eyebrow: sections.power?.data.title ?? "Power Rankings",
      title: "Power Rankings",
      subtitle: defaultWeightEntry ? "Default all-course baseline weights across the full PGA player pool." : EMPTY_MESSAGE,
      scoreLabel: "Power Score",
      weightEntry: defaultWeightEntry,
    };
  }, [
    activeView,
    currentEvent,
    currentWeightEntry,
    defaultWeightEntry,
    nextEvent,
    nextWeightEntry,
    sections.current,
    sections.next,
    sections.power,
    selectedFutureEvent,
    selectedFutureWeightEntry,
  ]);

  const baselineRankedRows = useMemo(
    () => defaultWeightEntry ? rankPlayers(playerStats, defaultWeightEntry.weights) : [],
    [defaultWeightEntry, playerStats],
  );

  const activeRankedRows = useMemo(
    () => activeContent.weightEntry ? rankPlayers(playerStats, activeContent.weightEntry.weights) : [],
    [activeContent.weightEntry, playerStats],
  );

  const baselineRankMap = useMemo(
    () => Object.fromEntries(baselineRankedRows.map((row) => [row.player, row.rank])),
    [baselineRankedRows],
  );

  useEffect(() => {
    if (!activeRankedRows.length || !baselineRankedRows.length) {
      setMovementMap({});
      return;
    }

    if (!hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      return;
    }

    const nextMovementMap = Object.fromEntries(
      activeRankedRows.flatMap((row) => {
        const baselineRank = baselineRankMap[row.player];
        if (!baselineRank || baselineRank === row.rank) return [];
        return [[row.player, row.rank < baselineRank ? "up" : "down"] as const];
      }),
    );

    setMovementMap(nextMovementMap);

    if (movementTimeoutRef.current) {
      clearTimeout(movementTimeoutRef.current);
    }

    movementTimeoutRef.current = setTimeout(() => {
      setMovementMap({});
    }, 1100);
  }, [activeRankedRows, baselineRankMap, baselineRankedRows.length]);

  const tableRows = useMemo(() => buildTableRows(activeRankedRows), [activeRankedRows]);
  const loading = scheduleLoading || DATA_SOURCES.some((source) => sections[source.id]?.loading);
  const hasRankingData = Boolean(playerStats.length && activeContent.weightEntry);

  return (
    <SiteShell>
      <main className="site-page bg-[#020806] pb-20 pt-6 text-white sm:pt-8">
        <div className="site-container">
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="rounded-[30px] border border-white/8 bg-[#06100c] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.32)] lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <div className="border-b border-white/8 pb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/70">2026 PGA Tour</div>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Schedule</h1>
                <p className="mt-3 text-sm leading-7 text-emerald-50/68">
                  The active tournament weights now drive the ranking table directly. Switching events changes both the weight bars and the player order from the same weight object.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSidebarFilter(option.key)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                      sidebarFilter === option.key
                        ? "border-emerald-400 bg-emerald-400 text-[#04110a]"
                        : "border-white/10 bg-white/4 text-emerald-50/72 hover:border-emerald-300/50 hover:text-white",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {scheduleLoading ? (
                  <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-6 text-sm text-emerald-50/68">
                    Loading schedule...
                  </div>
                ) : filteredSchedule.length === 0 ? (
                  <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-6 text-sm text-emerald-50/68">
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
                        onClick={() => {
                          if (!isSelectable) return;
                          setSelectedScheduleId(entry.id);
                          setActiveView("power");
                        }}
                        className={cn(
                          "w-full rounded-[24px] border px-4 py-4 text-left transition",
                          isPast && "cursor-default border-white/6 bg-white/[0.03] text-white/34",
                          !isPast && !isCurrent && !isSelected && "border-white/8 bg-white/[0.03] text-white/80 hover:border-emerald-400/40 hover:bg-emerald-500/8",
                          isCurrent && "border-emerald-400/60 bg-emerald-500/12 text-white",
                          isSelected && "border-emerald-300 bg-emerald-400/18 text-white",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/62">
                              {entry.dateLabel}
                            </div>
                            <div className="mt-2 text-sm font-semibold leading-6">{entry.name}</div>
                          </div>
                          <div className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                            {isCurrent ? "Current" : entry.category === "major" ? "Major" : entry.category === "wgc" ? "WGC" : entry.category === "signature" ? "Signature" : "Standard"}
                          </div>
                        </div>
                        <div className="mt-2 text-xs leading-6 text-white/62">{entry.courseName}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="space-y-6">
              <div className="rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.22),_transparent_32%),linear-gradient(180deg,_rgba(6,16,12,0.98),_rgba(3,10,7,0.98))] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/70">PGA Model Room</div>
                    <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                      Live course weights now re-rank the table client-side
                    </h2>
                    <p className="mt-4 max-w-[66ch] text-sm leading-7 text-emerald-50/72">
                      Power, current, next, and future tournament views all recalculate from the same raw player stat feed. The course-weight bars and player order stay in sync every time you switch events.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Player pool", value: `${playerStats.length || "--"} players` },
                      { label: "Current week", value: currentEvent?.shortName ?? "--" },
                      { label: "Next week", value: nextEvent?.shortName ?? "--" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[22px] border border-white/8 bg-black/18 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/62">{item.label}</div>
                        <div className="mt-2 text-sm font-semibold text-white">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-white/8 bg-[#06100c] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
                <div className="flex flex-wrap gap-3">
                  {DATA_SOURCES.map((source) => {
                    const label =
                      source.id === "current"
                        ? `This Week: ${currentEvent?.shortName ?? "Current Tournament"}`
                        : source.id === "next"
                          ? `Next Week: ${nextEvent?.shortName ?? "Next Tournament"}`
                          : "Power Rankings";

                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => {
                          setSelectedScheduleId(null);
                          setActiveView(source.id);
                        }}
                        className={cn(
                          "rounded-full border px-4 py-3 text-sm font-semibold transition",
                          !selectedScheduleId && activeView === source.id
                            ? "border-emerald-400 bg-emerald-400 text-[#04110a]"
                            : "border-white/10 bg-white/4 text-emerald-50/78 hover:border-emerald-300/50 hover:text-white",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 rounded-[28px] border border-white/8 bg-[#04100b] p-6">
                  <div className="flex flex-col gap-4 border-b border-white/8 pb-6">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/66">
                        {activeContent.eyebrow}
                      </div>
                      <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                        {activeContent.title}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-emerald-50/70">{activeContent.subtitle}</p>
                    </div>
                    <WeightBreakdown entry={activeContent.weightEntry} />
                  </div>

                  <div className="mt-6">
                    {loading ? (
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-8 text-sm text-emerald-50/70">
                        Loading PGA data...
                      </div>
                    ) : !hasRankingData || !tableRows.length ? (
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-8 text-sm text-emerald-50/70">
                        {EMPTY_MESSAGE}
                      </div>
                    ) : (
                      <PgaTable rows={tableRows} scoreLabel={activeContent.scoreLabel} movementMap={movementMap} />
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-[#06100c] px-5 py-4 text-sm text-emerald-50/70">
                Active weights also affect hidden stats in the ranking engine: Driving Accuracy currently ranges from{" "}
                {playerStats.length ? formatDrivingAccuracy(Math.min(...playerStats.map((player) => player.drivingAccuracy))) : "--"} to{" "}
                {playerStats.length ? formatDrivingAccuracy(Math.max(...playerStats.map((player) => player.drivingAccuracy))) : "--"} across the loaded field.
              </div>
            </section>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
