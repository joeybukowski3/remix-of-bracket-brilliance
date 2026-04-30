import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePgaDashboardUniversePlayers } from "@/hooks/usePgaDashboardUniversePlayers";
import {
  buildPercentileContextMap,
  getDashboardRankMetricValue,
  getDashboardWeights,
  readDashboardFavorites,
  storeDashboardFavorites,
  type PgaDashboardCondition,
  type PgaDashboardCourseContext,
  type PgaDashboardDatasetMode,
  type PgaDashboardPercentileContext,
  type PgaDashboardStatMetricKey,
  type PgaDashboardViewMode,
  type PgaDashboardWindowMode,
} from "@/lib/pga/dashboard";
import { rankPlayersByScore } from "@/lib/pga/modelEngine";
import { getStoredPgaAppliedWeights } from "@/lib/pga/pgaWeights";
import { getPercentileColor } from "@/lib/pga/rankColors";
import { PGA_TOURNAMENTS } from "@/lib/pga/tournaments";
import type { PgaHubBoardContext, PgaPlayerInput, PlayerModelRow } from "@/lib/pga/pgaTypes";
import type { PgaTournamentConfig } from "@/lib/pga/tournamentConfig";

type Props = {
  tournament: PgaTournamentConfig;
  boardContext: PgaHubBoardContext;
  currentFieldPlayers: PgaPlayerInput[];
  currentFieldStatus: "loading" | "ready" | "error";
  currentFieldErrorMessage: string;
  modelPath: string;
  picksPath: string;
};

type StatMetricKey = PgaDashboardStatMetricKey;
type SortKey = "favorite" | "player" | "model" | "score" | "rounds" | StatMetricKey;
type SortDirection = "asc" | "desc";

const DATASET_OPTIONS: Array<{ value: PgaDashboardDatasetMode; label: string; description: string }> = [
  { value: "current-field", label: "Current field", description: "Featured tournament field with event-specific context." },
  { value: "all-loaded", label: "All loaded golfers", description: "Deduped PGA sample from every checked-in tournament dataset." },
  { value: "trend-top-100", label: "Top 100 trend", description: "Pre-filtered cohort of the best recent trend ranks in the loaded sample." },
];

const WINDOW_OPTIONS: Array<{ value: PgaDashboardWindowMode; label: string; description: string }> = [
  { value: "current-export", label: "Current export", description: "Uses the same saved weight mix as the current model board." },
  { value: "trend-window", label: "Trend window", description: "Boosts recent-form weight inside the current export." },
  { value: "long-term", label: "Long-term baseline", description: "Reduces trend pressure and leans harder on stable stat profile." },
];

const CONDITION_OPTIONS: Array<{ value: PgaDashboardCondition; label: string }> = [
  { value: "all", label: "All golfers" },
  { value: "elite-approach", label: "Elite approach" },
  { value: "strong-form", label: "Strong form" },
  { value: "course-fit", label: "Course fit" },
  { value: "short-game", label: "Short game" },
];

const PERCENTILE_CONTEXT_OPTIONS: Array<{ value: PgaDashboardPercentileContext; label: string; description: string }> = [
  {
    value: "tour",
    label: "Tour (default)",
    description: "Percentiles are measured against the loaded active-tour player pool for the chosen window.",
  },
  {
    value: "tournament",
    label: "This tournament",
    description: "Percentiles are measured only against this week's tournament field.",
  },
];

function getMetricLabel(key: StatMetricKey, tournament: PgaTournamentConfig) {
  if (key === "trendRank") return { label: "Trend", mobile: "Trend" };
  if (key === "courseFit") return { label: "Course Fit", mobile: tournament.model.courseHistoryDisplay };
  const column = tournament.model.statColumns.find((item) => item.key === key);
  return {
    label: column?.abbr ?? key,
    mobile: column?.mobileLabel ?? column?.abbr ?? key,
  };
}

export default function PgaResearchDashboard({
  tournament,
  boardContext,
  currentFieldPlayers,
  currentFieldStatus,
  currentFieldErrorMessage,
  modelPath,
  picksPath,
}: Props) {
  const universe = usePgaDashboardUniversePlayers(PGA_TOURNAMENTS);
  const defaultWeights = tournament.model.presets[0].weights;
  const baseWeights = useMemo(
    () => getStoredPgaAppliedWeights(tournament.slug, defaultWeights),
    [defaultWeights, tournament.slug],
  );

  const [datasetMode, setDatasetMode] = useState<PgaDashboardDatasetMode>("current-field");
  const [windowMode, setWindowMode] = useState<PgaDashboardWindowMode>("current-export");
  const [viewMode, setViewMode] = useState<PgaDashboardViewMode>("percentile");
  const [percentileContext, setPercentileContext] = useState<PgaDashboardPercentileContext>("tour");
  const [courseContext, setCourseContext] = useState<PgaDashboardCourseContext>("event");
  const [searchValue, setSearchValue] = useState("");
  const [minRounds, setMinRounds] = useState("0");
  const [condition, setCondition] = useState<PgaDashboardCondition>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => readDashboardFavorites());
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    storeDashboardFavorites(favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    if (datasetMode !== "current-field") {
      setCourseContext("neutral");
    }
  }, [datasetMode]);

  const effectiveCourseContext = datasetMode === "current-field" ? courseContext : "neutral";
  const currentFieldPlayerIds = useMemo(() => new Set(currentFieldPlayers.map((player) => player.id)), [currentFieldPlayers]);

  const selectedPlayers = useMemo(() => {
    if (datasetMode === "current-field") return currentFieldPlayers;
    if (datasetMode === "all-loaded") return universe.players;
    return universe.players.filter((player) => (player.statRanks.trendRank ?? Number.POSITIVE_INFINITY) <= 100);
  }, [currentFieldPlayers, datasetMode, universe.players]);

  const datasetStatus = datasetMode === "current-field" ? currentFieldStatus : universe.status;
  const datasetErrorMessage = datasetMode === "current-field" ? currentFieldErrorMessage : universe.errorMessage;

  const appliedWeights = useMemo(
    () => getDashboardWeights(baseWeights, windowMode, effectiveCourseContext),
    [baseWeights, effectiveCourseContext, windowMode],
  );

  const rankedRows = useMemo(
    () =>
      rankPlayersByScore(
        selectedPlayers,
        appliedWeights,
        datasetMode === "current-field" && effectiveCourseContext === "event"
          ? tournament.manual?.playerAdjustments
          : [],
      ),
    [appliedWeights, datasetMode, effectiveCourseContext, selectedPlayers, tournament.manual?.playerAdjustments],
  );

  const tourReferenceRows = useMemo(
    () => rankPlayersByScore(universe.players, appliedWeights, []),
    [appliedWeights, universe.players],
  );

  const tournamentReferenceRows = useMemo(
    () =>
      rankPlayersByScore(
        currentFieldPlayers,
        appliedWeights,
        effectiveCourseContext === "event" ? tournament.manual?.playerAdjustments : [],
      ),
    [appliedWeights, currentFieldPlayers, effectiveCourseContext, tournament.manual?.playerAdjustments],
  );

  const effectiveRankedRows = useMemo(() => {
    if (percentileContext !== "tournament") return rankedRows;
    return rankedRows.filter((row) => currentFieldPlayerIds.has(row.id));
  }, [currentFieldPlayerIds, percentileContext, rankedRows]);

  const statMetricKeys = useMemo<StatMetricKey[]>(
    () => [
      "trendRank",
      ...tournament.model.statColumns.map((column) => column.key),
      "courseFit",
    ],
    [tournament.model.statColumns],
  );

  const percentileContextMaps = useMemo(
    () => ({
      tour: buildPercentileContextMap(effectiveRankedRows, tourReferenceRows),
      tournament: buildPercentileContextMap(effectiveRankedRows, tournamentReferenceRows),
    }),
    [effectiveRankedRows, tourReferenceRows, tournamentReferenceRows],
  );

  const rowMetrics = percentileContextMaps[percentileContext];
  const minRoundsValue = Number(minRounds) || 0;

  const filteredRows = useMemo(() => {
    return effectiveRankedRows.filter((row) => {
      if (favoritesOnly && !favoriteIds.has(row.id)) return false;
      if (searchValue.trim() && !row.player.toLowerCase().includes(searchValue.trim().toLowerCase())) return false;
      if ((row.courseHistoryRounds ?? 0) < minRoundsValue) return false;

      const metrics = rowMetrics.get(row.id);
      if (!metrics) return false;

      if (condition === "elite-approach" && (metrics.statPercentiles.sgApproachRank ?? -1) < 80) return false;
      if (condition === "strong-form" && (metrics.trendPercentile ?? -1) < 75) return false;
      if (condition === "course-fit" && (metrics.courseFitPercentile ?? -1) < 70) return false;
      if (condition === "short-game" && (metrics.shortGamePercentile ?? -1) < 70) return false;

      return true;
    });
  }, [condition, effectiveRankedRows, favoriteIds, favoritesOnly, minRoundsValue, rowMetrics, searchValue]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];

    const getSortValue = (row: PlayerModelRow) => {
      const metrics = rowMetrics.get(row.id);

      switch (sortKey) {
        case "favorite":
          return favoriteIds.has(row.id) ? 1 : 0;
        case "player":
          return row.player;
        case "model":
          return row.rank;
        case "score":
          return row.score;
        case "rounds":
          return row.courseHistoryRounds ?? -1;
        case "courseFit":
          return viewMode === "percentile" ? metrics?.courseFitPercentile ?? -1 : row.courseHistoryScore ?? Number.NEGATIVE_INFINITY;
        default:
          if (viewMode === "percentile") {
            return metrics?.statPercentiles[sortKey] ?? -1;
          }
          return getDashboardRankMetricValue(row, sortKey) ?? Number.POSITIVE_INFINITY;
      }
    };

    rows.sort((left, right) => {
      const leftValue = getSortValue(left);
      const rightValue = getSortValue(right);

      if (typeof leftValue === "string" && typeof rightValue === "string") {
        return sortDirection === "asc"
          ? leftValue.localeCompare(rightValue)
          : rightValue.localeCompare(leftValue);
      }

      const leftNumber = typeof leftValue === "number" ? leftValue : 0;
      const rightNumber = typeof rightValue === "number" ? rightValue : 0;
      return sortDirection === "asc" ? leftNumber - rightNumber : rightNumber - leftNumber;
    });

    return rows;
  }, [favoriteIds, filteredRows, rowMetrics, sortDirection, sortKey, viewMode]);

  const activeFilters = useMemo(() => {
    const items = [
      DATASET_OPTIONS.find((option) => option.value === datasetMode)?.label,
      WINDOW_OPTIONS.find((option) => option.value === windowMode)?.label,
      viewMode === "percentile" ? "Percentile view" : "Rank view",
      PERCENTILE_CONTEXT_OPTIONS.find((option) => option.value === percentileContext)?.label,
      effectiveCourseContext === "event" ? tournament.shortName : "Neutral baseline",
    ].filter((value): value is string => Boolean(value));

    if (condition !== "all") {
      items.push(CONDITION_OPTIONS.find((option) => option.value === condition)?.label ?? condition);
    }
    if (favoritesOnly) items.push("Favorites only");
    if (minRoundsValue > 0) items.push(`Min ${minRoundsValue} rounds`);
    if (searchValue.trim()) items.push(`Search: ${searchValue.trim()}`);
    return items;
  }, [condition, datasetMode, effectiveCourseContext, favoritesOnly, minRoundsValue, percentileContext, searchValue, tournament.shortName, viewMode, windowMode]);

  function toggleFavorite(playerId: string) {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  function onSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    if (nextKey === "player") {
      setSortDirection("asc");
      return;
    }
    if (viewMode === "rank" && nextKey !== "score" && nextKey !== "rounds" && nextKey !== "courseFit" && nextKey !== "favorite") {
      setSortDirection("asc");
      return;
    }
    if (nextKey === "model") {
      setSortDirection("asc");
      return;
    }
    setSortDirection("desc");
  }

  return (
    <div className="pga-picks-page site-stack">
      <section className="overflow-hidden rounded-[32px] border border-[color:var(--pga-border)] bg-[linear-gradient(140deg,#f7fbf6_0%,#ffffff_48%,#eef5ef_100%)] shadow-[0_18px_40px_rgba(26,58,42,0.08)]">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="p-6 md:p-8">
            <div className="pga-label">{boardContext.eyebrow}</div>
            <h1 className="mt-3 max-w-4xl text-[2.2rem] font-semibold tracking-[-0.04em] text-foreground sm:text-[3.25rem]">
              {boardContext.headline}
            </h1>
            <p className="mt-4 max-w-3xl text-[15px] leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              {boardContext.intro}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={modelPath} className="inline-flex items-center rounded-xl bg-[var(--pga-green-dark)] px-5 py-3 text-sm font-medium text-[#f4fbf6] transition hover:opacity-95">
                Open Full Model
              </Link>
              <Link to={picksPath} className="inline-flex items-center rounded-xl border border-[color:var(--pga-border)] bg-card px-5 py-3 text-sm font-medium text-foreground transition hover:bg-secondary">
                Read This Week&apos;s Picks
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <ContextChip label="Event" value={tournament.shortName} />
              <ContextChip label="Course" value={tournament.courseName} />
              <ContextChip label="Week" value={tournament.schedule?.weekLabel ?? "Current week"} />
              <ContextChip label="Mode" value={viewMode === "percentile" ? "Percentile heatmap" : "Raw rank view"} />
            </div>
          </div>

          <div className="border-t border-[color:var(--pga-border)] bg-secondary/20 p-6 md:p-8 xl:border-l xl:border-t-0">
            <div className="pga-label">Board context</div>
            <h2 className="mt-3 text-[1.45rem] font-semibold tracking-[-0.03em] text-foreground">
              {tournament.courseName} research board
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Filters update the same ranking engine that powers the full model room. The percentile context toggle swaps between tour-wide and tournament-field comparison sets while keeping the same table and color system.
            </p>
            <div className="mt-5 grid gap-2">
              {boardContext.contextBullets.map((item) => (
                <div key={item} className="rounded-xl border border-[color:var(--pga-border)] bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pga-card space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="pga-label">Filters + Controls</div>
            <h2 className="pga-section-title mt-2">Research dashboard controls</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              The current export is still the only checked-in stat feed, so the window selector shifts weight emphasis across the same shared model dataset until distinct round-window exports are added.
            </p>
          </div>
          <div className="rounded-2xl border border-[color:var(--pga-border)] bg-secondary/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
            {sortedRows.length} golfers shown • {favoriteIds.size} favorites saved
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <FilterBlock label="Golfers Displayed" help={DATASET_OPTIONS.find((option) => option.value === datasetMode)?.description ?? ""}>
            <select
              value={datasetMode}
              onChange={(event) => setDatasetMode(event.target.value as PgaDashboardDatasetMode)}
              className="w-full rounded-xl border border-[color:var(--pga-border)] bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--pga-green-dark)]"
            >
              {DATASET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} disabled={option.value !== "current-field" && universe.status === "loading"}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterBlock>

          <FilterBlock label="Stats Window" help={WINDOW_OPTIONS.find((option) => option.value === windowMode)?.description ?? ""}>
            <select
              value={windowMode}
              onChange={(event) => setWindowMode(event.target.value as PgaDashboardWindowMode)}
              className="w-full rounded-xl border border-[color:var(--pga-border)] bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--pga-green-dark)]"
            >
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterBlock>

          <FilterBlock label="Display Results As" help="Percentile is the default table mode. Rank view falls back to raw rank where supported.">
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton active={viewMode === "percentile"} onClick={() => setViewMode("percentile")}>
                Percentile
              </ToggleButton>
              <ToggleButton active={viewMode === "rank"} onClick={() => setViewMode("rank")}>
                Rank
              </ToggleButton>
            </div>
          </FilterBlock>

          <FilterBlock label="Course Profile" help={effectiveCourseContext === "event" ? "Keeps current-event course history in the board." : "Turns off event-specific course history so the board stays neutral."}>
            <select
              value={effectiveCourseContext}
              onChange={(event) => setCourseContext(event.target.value as PgaDashboardCourseContext)}
              disabled={datasetMode !== "current-field"}
              className="w-full rounded-xl border border-[color:var(--pga-border)] bg-card px-3 py-2.5 text-sm text-foreground outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="event">{tournament.shortName}</option>
              <option value="neutral">Neutral baseline</option>
            </select>
          </FilterBlock>

          <FilterBlock label="Player Search" help="Search the current cohort by golfer name.">
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search players"
              className="w-full rounded-xl border border-[color:var(--pga-border)] bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--pga-green-dark)]"
            />
          </FilterBlock>

          <FilterBlock label="Min Rounds" help="Filters by minimum course-history rounds in the loaded export.">
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={minRounds}
                onChange={(event) => setMinRounds(event.target.value)}
                className="w-full rounded-xl border border-[color:var(--pga-border)] bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--pga-green-dark)]"
              />
              <button
                type="button"
                onClick={() => setMinRounds("0")}
                className="rounded-xl border border-[color:var(--pga-border)] bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary"
              >
                Reset
              </button>
            </div>
          </FilterBlock>
        </div>

        <div className="rounded-[20px] border border-[color:var(--pga-border)] bg-[linear-gradient(135deg,#f4faf4_0%,#ffffff_100%)] p-4 shadow-[0_10px_24px_rgba(26,58,42,0.05)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Percentile Context</div>
                <span className="rounded-full bg-[var(--pga-green-fill)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pga-green-dark)]">
                  Changes heat map + percentile sorting
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {PERCENTILE_CONTEXT_OPTIONS.find((option) => option.value === percentileContext)?.description}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
              {PERCENTILE_CONTEXT_OPTIONS.map((option) => (
                <ContextToggleCard
                  key={option.value}
                  active={percentileContext === option.value}
                  title={option.label}
                  description={
                    option.value === "tour"
                      ? "Benchmarks each golfer against the loaded PGA universe."
                      : "Benchmarks each golfer only against this week's field."
                  }
                  onClick={() => setPercentileContext(option.value)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <FilterBlock label="Filter By Conditions" help="First version of saved research triggers built from the active percentile board.">
            <select
              value={condition}
              onChange={(event) => setCondition(event.target.value as PgaDashboardCondition)}
              className="w-full rounded-xl border border-[color:var(--pga-border)] bg-card px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--pga-green-dark)]"
            >
              {CONDITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterBlock>

          <FilterBlock label="Favorites" help="Saved locally in the browser so you can isolate target golfers quickly.">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--pga-border)] bg-card px-3 py-2.5">
              <button
                type="button"
                onClick={() => setFavoritesOnly((current) => !current)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  favoritesOnly
                    ? "bg-[var(--pga-green-dark)] text-[#f4fbf6]"
                    : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {favoritesOnly ? "Showing favorites" : "Show favorites only"}
              </button>
              <span className="text-xs text-muted-foreground">
                Favorite golfers: {favoriteIds.size}
              </span>
            </div>
          </FilterBlock>
        </div>
      </section>

      <section className="rounded-[22px] border border-[color:var(--pga-border)] bg-card px-4 py-4 shadow-[0_10px_24px_rgba(26,58,42,0.06)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Active filters</span>
          {activeFilters.map((item) => (
            <span key={item} className="rounded-full border border-[color:var(--pga-border)] bg-secondary/45 px-3 py-1 text-xs text-foreground">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="pga-card">
        <div className="flex flex-col gap-3 border-b border-[color:var(--pga-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="pga-label">Rankings First</div>
            <h2 className="pga-section-title mt-2">Live PGA trend table</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              Sorting happens client-side on the ranked board, and percentile sorting always follows the active context: either the tour sample or this week&apos;s field.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <LegendChip label="80-100" color="#1a7a3a" text="#e6f5ec" />
            <LegendChip label="60-79" color="#7ec89a" text="#0f4a22" />
            <LegendChip label="40-59" color="#f5f5f2" text="#444444" bordered />
            <LegendChip label="20-39" color="#f0a090" text="#6b1a10" />
            <LegendChip label="0-19" color="#b93030" text="#fce8e8" />
          </div>
        </div>

        {datasetStatus === "loading" ? (
          <div className="py-10 text-sm text-muted-foreground">Loading the active PGA research dataset...</div>
        ) : null}
        {datasetStatus === "error" ? (
          <div className="py-10 text-sm text-destructive">Unable to load the active PGA research dataset: {datasetErrorMessage}</div>
        ) : null}
        {datasetStatus === "ready" && sortedRows.length === 0 ? (
          <div className="py-10 text-sm text-muted-foreground">No golfers match the current filter set.</div>
        ) : null}

        {datasetStatus === "ready" && sortedRows.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-[22px] border border-[color:var(--pga-border)]">
            <div className="overflow-auto" style={{ maxHeight: "72vh" }}>
              <table className="w-full min-w-[1250px] border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-[#f8fbf7] shadow-[0_1px_0_var(--pga-border)]">
                  <tr className="border-b border-[color:var(--pga-border)] text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <SortableHeader stickyLeft="0px" onClick={() => onSort("favorite")} active={sortKey === "favorite"} direction={sortDirection} align="center">
                      Fav
                    </SortableHeader>
                    <SortableHeader stickyLeft="58px" onClick={() => onSort("player")} active={sortKey === "player"} direction={sortDirection}>
                      Player
                    </SortableHeader>
                    <SortableHeader onClick={() => onSort("model")} active={sortKey === "model"} direction={sortDirection} align="center">
                      Model
                    </SortableHeader>
                    <SortableHeader onClick={() => onSort("score")} active={sortKey === "score"} direction={sortDirection} align="center">
                      Score
                    </SortableHeader>
                    <SortableHeader onClick={() => onSort("rounds")} active={sortKey === "rounds"} direction={sortDirection} align="center">
                      Rnds
                    </SortableHeader>
                    {statMetricKeys.map((metricKey) => {
                      const label = getMetricLabel(metricKey, tournament);
                      return (
                        <SortableHeader
                          key={metricKey}
                          onClick={() => onSort(metricKey)}
                          active={sortKey === metricKey}
                          direction={sortDirection}
                          align="center"
                        >
                          {label.label}
                        </SortableHeader>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {sortedRows.map((row, index) => {
                    const metrics = rowMetrics.get(row.id);
                    const modelTone = getPercentileColor(metrics?.modelPercentile ?? null);

                    return (
                      <tr key={row.id} className={`${index % 2 !== 0 ? "bg-secondary/18" : "bg-card"} border-b border-[color:var(--pga-border)] transition hover:bg-secondary/35`}>
                        <td className="sticky left-0 z-10 bg-inherit px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleFavorite(row.id)}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                              favoriteIds.has(row.id)
                                ? "border-[var(--pga-green-dark)] bg-[var(--pga-green-fill)] text-[var(--pga-green-dark)]"
                                : "border-[color:var(--pga-border)] bg-card text-muted-foreground hover:bg-secondary"
                            }`}
                            aria-label={favoriteIds.has(row.id) ? `Remove ${row.player} from favorites` : `Add ${row.player} to favorites`}
                          >
                            ★
                          </button>
                        </td>

                        <td className="sticky left-[58px] z-10 min-w-[220px] bg-inherit px-4 py-3">
                          <div className="font-medium text-foreground">{row.player}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.cutsLastFive ? `${row.cutsLastFive} recent cuts made` : "No recent event-cut history"}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-center">
                          <div className="text-sm font-semibold text-foreground">#{row.rank}</div>
                        </td>

                        <td className="px-3 py-3 text-center">
                          <span
                            className="inline-flex min-w-[56px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold"
                            style={{ background: modelTone.bg, color: modelTone.text, border: modelTone.border ?? "none" }}
                          >
                            {row.score.toFixed(3)}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-center text-sm text-foreground">
                          {row.courseHistoryRounds ?? "—"}
                        </td>

                        {statMetricKeys.map((metricKey) => {
                          const percentile = metrics?.statPercentiles[metricKey] ?? null;
                          const tone = getPercentileColor(percentile);
                          const rankValue = metricKey === "courseFit" ? null : getDashboardRankMetricValue(row, metricKey);
                          const rawValue = metricKey === "courseFit" ? row.courseHistoryScore : null;

                          return (
                            <td key={`${row.id}-${metricKey}`} className="px-3 py-3 text-center">
                              <span
                                className="inline-flex min-w-[56px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-semibold"
                                style={{ background: tone.bg, color: tone.text, border: tone.border ?? "none" }}
                              >
                                {viewMode === "percentile"
                                  ? percentile != null
                                    ? percentile
                                    : "—"
                                  : metricKey === "courseFit"
                                    ? rawValue != null
                                      ? rawValue.toFixed(2)
                                      : "—"
                                    : rankValue != null
                                      ? `#${rankValue}`
                                      : "—"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FilterBlock({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-[18px] border border-[color:var(--pga-border)] bg-secondary/28 p-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{help}</div>
      </div>
      {children}
    </div>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
        active ? "bg-[var(--pga-green-dark)] text-[#f4fbf6]" : "border border-[color:var(--pga-border)] bg-card text-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-[color:var(--pga-border)] bg-card px-3 py-1.5 text-xs text-foreground">
      <span className="mr-1 text-muted-foreground">{label}:</span>
      {value}
    </span>
  );
}

function ContextToggleCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[18px] border px-4 py-3 text-left transition ${
        active
          ? "border-[var(--pga-green-dark)] bg-[var(--pga-green-dark)] text-[#f4fbf6] shadow-[0_12px_28px_rgba(26,58,42,0.18)]"
          : "border-[color:var(--pga-border)] bg-card text-foreground hover:bg-secondary"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
            active ? "bg-[#f4fbf6]/14 text-[#f4fbf6]" : "bg-secondary text-muted-foreground"
          }`}
        >
          {active ? "Active" : "Select"}
        </span>
      </div>
      <div className={`mt-2 text-xs leading-5 ${active ? "text-[#d9eee0]" : "text-muted-foreground"}`}>
        {description}
      </div>
    </button>
  );
}

function LegendChip({ label, color, text, bordered = false }: { label: string; color: string; text: string; bordered?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--pga-border)] bg-card px-3 py-1.5">
      <span className="inline-flex min-w-[42px] items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: color, color: text, border: bordered ? "0.5px solid #d8d8d2" : "none" }}>
        {label}
      </span>
    </span>
  );
}

function SortableHeader({
  children,
  onClick,
  active,
  direction,
  align = "left",
  stickyLeft,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  direction: SortDirection;
  align?: "left" | "center";
  stickyLeft?: string;
}) {
  return (
    <th
      className={`px-3 py-3 ${align === "center" ? "text-center" : "text-left"} ${stickyLeft ? "sticky z-20 bg-[#f8fbf7]" : ""}`}
      style={stickyLeft ? { left: stickyLeft } : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${align === "center" ? "justify-center" : ""} text-[11px] font-semibold uppercase tracking-[0.14em] ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {children}
        <span className="text-[10px]">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}
