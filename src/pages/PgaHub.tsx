import { useEffect, useMemo, useState } from "react";
import SiteShell from "@/components/layout/SiteShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePageSeo } from "@/hooks/usePageSeo";
import { formatCompositeScore, normalizeTournamentPlayerData, rankPlayersByScore } from "@/lib/pga/modelEngine";
import type { RawPgaPlayer, PgaWeights } from "@/lib/pga/pgaTypes";
import { PGA_TOURNAMENTS } from "@/lib/pga/tournaments";
import { cn } from "@/lib/utils";

type PgaSheetRow = {
  rank: number;
  player: string;
  modelScore: string;
  sgTotal: string;
  sgOtt: string;
  sgApp: string;
  sgAtg: string;
  sgPutt: string;
};

type PgaSheetSection = {
  section: string;
  title: string;
  tournamentName: string;
  courseName: string;
  generatedAt: string;
  rows: PgaSheetRow[];
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

type PgaDisplayRow = PgaSheetRow;

type SectionState = {
  loading: boolean;
  data: PgaSheetSection;
};

type SidebarFilter = "all" | "major" | "wgc" | "signature" | "standard";
type BaseView = "power" | "current" | "next";

type BuiltModelState = {
  loading: boolean;
  title: string;
  tournamentName: string;
  courseName: string;
  rows: PgaDisplayRow[];
  weights: PgaWeights | null;
};

const DATA_SOURCES = [
  { id: "power", section: "power-rankings", title: "Power Rankings", path: "/data/pga/power-rankings.json", scoreLabel: "Power Score" },
  { id: "current", section: "current-tournament", title: "Current Tournament Model", path: "/data/pga/current-tournament.json", scoreLabel: "Model Score" },
  { id: "next", section: "next-tournament", title: "Next Week Tournament Model", path: "/data/pga/next-tournament.json", scoreLabel: "Model Score" },
] as const;

const TABLE_COLUMNS = [
  { key: "rank", label: "Rank", className: "w-[68px]" },
  { key: "player", label: "Player", className: "min-w-[220px]" },
  { key: "modelScore", label: "Score", className: "min-w-[120px]" },
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
  return Array.isArray(candidate.rows) && typeof candidate.title === "string";
}

function isValidScheduleData(value: unknown): value is PgaScheduleFeedEntry[] {
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

function formatTableNumber(value: number | null | undefined, digits = 3) {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function formatWeightValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function computeSgTotal(player: RawPgaPlayer) {
  const values = [
    player["SG: Approach the Green"],
    player["SG: Around the Green"],
    player["SG: Putting"],
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function buildDisplayRowsFromRawPlayers(rawPlayers: RawPgaPlayer[], weights: PgaWeights) {
  const normalizedPlayers = normalizeTournamentPlayerData(rawPlayers);
  const rankedRows = rankPlayersByScore(normalizedPlayers, weights);
  const rawByPlayer = new Map(rawPlayers.map((player) => [player["Player Name"], player]));

  return rankedRows.map((row) => {
    const raw = rawByPlayer.get(row.player);
    const sgTotal = raw ? computeSgTotal(raw) : null;

    return {
      rank: row.rank,
      player: row.player,
      modelScore: formatCompositeScore(row.score * 100),
      sgTotal: formatTableNumber(sgTotal),
      sgOtt: "--",
      sgApp: formatTableNumber(raw?.["SG: Approach the Green"]),
      sgAtg: formatTableNumber(raw?.["SG: Around the Green"]),
      sgPutt: formatTableNumber(raw?.["SG: Putting"]),
    };
  });
}

function getCurrentAndNextEvents(schedule: PgaScheduleFeedEntry[]) {
  const sorted = [...schedule].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const current = sorted.find((entry) => entry.status !== "complete") ?? sorted.at(-1) ?? null;
  const next = current
    ? sorted.find((entry) => entry.startDate > current.startDate) ?? null
    : null;

  return { current, next };
}

function resolveTournamentConfig(name: string) {
  const normalized = normalizeEventKey(name);

  return PGA_TOURNAMENTS.find((tournament) =>
    [tournament.name, tournament.shortName, tournament.slug]
      .map((value) => normalizeEventKey(value))
      .includes(normalized),
  ) ?? null;
}

function isFutureOrCurrent(entry: PgaScheduleFeedEntry, currentEvent: PgaScheduleFeedEntry | null) {
  if (!currentEvent) return entry.status !== "complete";
  return entry.startDate >= currentEvent.startDate;
}

function WeightChips({ weights }: { weights: PgaWeights | null }) {
  if (!weights) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-50/80">
        Published sheet output. Course-weight detail is not available for this feed yet.
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {Object.entries(weights).map(([key, value]) => (
        <div key={key} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">{key}</div>
          <div className="mt-1 text-sm font-semibold text-emerald-50">{formatWeightValue(value)}</div>
        </div>
      ))}
    </div>
  );
}

function PgaTable({
  rows,
  scoreLabel,
}: {
  rows: PgaDisplayRow[];
  scoreLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#07110d]">
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            {TABLE_COLUMNS.map((column) => (
              <TableHead key={column.key} className={cn("text-emerald-100/72", column.className)}>
                {column.key === "modelScore" ? scoreLabel : column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const topTen = row.rank <= 10 || index < 10;

            return (
              <TableRow
                key={`${row.player}-${row.rank}-${index}`}
                className={cn(
                  "border-white/8 text-emerald-50/90 hover:bg-white/4",
                  topTen && "bg-emerald-500/12 hover:bg-emerald-500/16",
                )}
              >
                <TableCell className="font-semibold">{row.rank}</TableCell>
                <TableCell className="font-medium text-white">{row.player}</TableCell>
                <TableCell>{row.modelScore}</TableCell>
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
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [activeView, setActiveView] = useState<BaseView>("power");
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [builtModel, setBuiltModel] = useState<BuiltModelState>({
    loading: false,
    title: "",
    tournamentName: "",
    courseName: "",
    rows: [],
    weights: null,
  });

  usePageSeo({
    title: "PGA Rankings Hub",
    description: "Weekly PGA power rankings, live current-week tournament model, next-week board, and a schedule-driven sidebar for future event planning.",
    path: "/pga",
  });

  useEffect(() => {
    let active = true;

    async function loadBaseData() {
      const [scheduleResponse, ...sectionResponses] = await Promise.all([
        fetch("/data/pga/schedule.json", { cache: "no-store" }),
        ...DATA_SOURCES.map((source) => fetch(source.path, { cache: "no-store" })),
      ]);

      if (active) {
        if (scheduleResponse.ok) {
          const payload: unknown = await scheduleResponse.json();
          setSchedule(isValidScheduleData(payload) ? payload : []);
        } else {
          setSchedule([]);
        }
        setScheduleLoading(false);
      }

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
    };
  }, []);

  const { current: currentEvent, next: nextEvent } = useMemo(() => getCurrentAndNextEvents(schedule), [schedule]);

  useEffect(() => {
    if (!selectedScheduleId) {
      setBuiltModel((previous) => ({ ...previous, loading: false }));
      return;
    }

    const scheduleEntry = schedule.find((entry) => entry.id === selectedScheduleId) ?? null;
    const config = scheduleEntry ? resolveTournamentConfig(scheduleEntry.name) : null;

    if (!scheduleEntry || !config) {
      setBuiltModel({
        loading: false,
        title: scheduleEntry?.name ?? "",
        tournamentName: scheduleEntry?.name ?? "",
        courseName: scheduleEntry?.courseName ?? "",
        rows: [],
        weights: null,
      });
      return;
    }

    let active = true;

    async function loadTournamentModel() {
      setBuiltModel({
        loading: true,
        title: config.name,
        tournamentName: config.name,
        courseName: config.courseName,
        rows: [],
        weights: config.model.presets[0]?.weights ?? null,
      });

      try {
        const response = await fetch(config.model.dataPath, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Missing tournament dataset.");
        }

        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) {
          throw new Error("Tournament dataset is not an array.");
        }

        const rows = buildDisplayRowsFromRawPlayers(payload as RawPgaPlayer[], config.model.presets[0].weights);
        if (!active) return;

        setBuiltModel({
          loading: false,
          title: config.name,
          tournamentName: config.name,
          courseName: config.courseName,
          rows,
          weights: config.model.presets[0].weights,
        });
      } catch {
        if (!active) return;
        setBuiltModel({
          loading: false,
          title: config.name,
          tournamentName: config.name,
          courseName: config.courseName,
          rows: [],
          weights: config.model.presets[0]?.weights ?? null,
        });
      }
    }

    void loadTournamentModel();

    return () => {
      active = false;
    };
  }, [schedule, selectedScheduleId]);

  const filteredSchedule = useMemo(
    () => schedule.filter((entry) => sidebarFilter === "all" || entry.category === sidebarFilter),
    [schedule, sidebarFilter],
  );

  const activeSection = sections[activeView]?.data ?? buildEmptySection(DATA_SOURCES[0].section, DATA_SOURCES[0].title);
  const activeScoreLabel = DATA_SOURCES.find((source) => source.id === activeView)?.scoreLabel ?? "Model Score";
  const activeSectionConfig = resolveTournamentConfig(activeSection.tournamentName);

  const contentHeader = useMemo(() => {
    if (selectedScheduleId) {
      return {
        eyebrow: "Future Tournament Model",
        title: builtModel.tournamentName || "Tournament model",
        subtitle: builtModel.courseName || EMPTY_MESSAGE,
        rows: builtModel.rows,
        loading: builtModel.loading,
        scoreLabel: "Model Score",
        weights: builtModel.weights,
      };
    }

    return {
      eyebrow: activeSection.title,
      title: activeSection.tournamentName || activeSection.title,
      subtitle: activeSection.courseName || EMPTY_MESSAGE,
      rows: activeSection.rows,
      loading: sections[activeView]?.loading ?? true,
      scoreLabel: activeScoreLabel,
      weights: activeSectionConfig?.model.presets[0]?.weights ?? null,
    };
  }, [selectedScheduleId, builtModel, activeSection, activeScoreLabel, sections, activeView, activeSectionConfig]);

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
                  Full season slate with the current week pinned, completed events faded, and future tournaments ready for pre-built model views when local data exists.
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
                          setSelectedScheduleId(entry.id);
                          if (isSelectable) {
                            setActiveView("power");
                          }
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
                      Power board, current week, next week, and future-event lookups
                    </h2>
                    <p className="mt-4 max-w-[66ch] text-sm leading-7 text-emerald-50/72">
                      Default view opens the live Power Rankings feed. Tabs switch to the published current-week and next-week tables, while the schedule rail can load checked-in future tournament models when a local dataset exists.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Schedule feed", value: `${schedule.length || "--"} events` },
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
                        {contentHeader.eyebrow}
                      </div>
                      <h3 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
                        {contentHeader.title}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-emerald-50/70">{contentHeader.subtitle}</p>
                    </div>
                    <WeightChips weights={contentHeader.weights} />
                  </div>

                  <div className="mt-6">
                    {contentHeader.loading ? (
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-8 text-sm text-emerald-50/70">
                        Loading PGA data...
                      </div>
                    ) : contentHeader.rows.length === 0 ? (
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-8 text-sm text-emerald-50/70">
                        {EMPTY_MESSAGE}
                      </div>
                    ) : (
                      <PgaTable rows={contentHeader.rows} scoreLabel={contentHeader.scoreLabel} />
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
