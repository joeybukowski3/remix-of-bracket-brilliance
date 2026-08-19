import { useMemo, useState } from "react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useNflTeamPerformanceAnalytics } from "@/hooks/useNflTeamPerformanceAnalytics";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { NflFilterChips } from "@/components/nfl/ui/NflFilterBar";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import { NFL_POWER_RATINGS, nflLogoUrl } from "@/data/nflPreseason2026";
import type { TeamPerformanceAnalyticsRow, TeamPerformanceWindowKey } from "@/lib/nfl/teamPerformanceAnalytics";
import {
  PERFORMANCE_METRIC_DEFINITIONS,
  formatPerformanceMetricValue,
  formatSampleSizeQualifier,
  performanceMetricDirection,
  performanceMetricRawValue,
  performanceMetricSecondaryValue,
  type PerformanceMetricDefinition,
  type PerformanceMetricSide,
} from "@/lib/nfl/performanceMetricDefinitions";

const ANALYTICS_SEASON = 2026;

const WINDOW_OPTIONS: readonly TeamPerformanceWindowKey[] = ["last4", "last8", "fullSeason"];
const WINDOW_LABELS: Record<TeamPerformanceWindowKey, string> = {
  last4: "Last 4",
  last8: "Last 8",
  fullSeason: "Full Season",
};

type DisplayMode = "rankings" | "raw";
const DISPLAY_OPTIONS: readonly DisplayMode[] = ["rankings", "raw"];
const DISPLAY_LABELS: Record<DisplayMode, string> = { rankings: "Rankings", raw: "Raw Stats" };

/**
 * Team identity lookup, reusing the same canonical source (NFL_POWER_RATINGS)
 * and logo utility (nflLogoUrl) that NFL.tsx and NFLStandings.tsx already use
 * for their own team-name/logo rendering — no new abbr-to-name mapping.
 */
const TEAM_IDENTITY_BY_ABBR = new Map(NFL_POWER_RATINGS.map((t) => [t.abbr, { name: t.team, color: t.color }]));

function TeamLogo({ abbr }: { abbr: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[8px] font-black text-white">
        {abbr.toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={nflLogoUrl(abbr)}
      alt=""
      loading="lazy"
      className="h-6 w-6 shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function TeamCell({ abbr }: { abbr: string }) {
  const identity = TEAM_IDENTITY_BY_ABBR.get(abbr);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <TeamLogo abbr={abbr} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[11px] font-semibold text-slate-800">{identity?.name ?? abbr.toUpperCase()}</span>
        <span className="text-[9px] font-medium uppercase tracking-wide text-slate-400">{abbr.toUpperCase()}</span>
      </span>
    </span>
  );
}

type SortState = { key: "team" | string; direction: "asc" | "desc" } | null;

function nextSort(current: SortState, key: string, defaultDirection: "asc" | "desc"): SortState {
  if (!current || current.key !== key) return { key, direction: defaultDirection };
  if (current.direction === defaultDirection) {
    return { key, direction: defaultDirection === "asc" ? "desc" : "asc" };
  }
  return null;
}

function SortArrow({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) {
    return (
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 opacity-40" fill="none" aria-hidden="true">
        <path d="M5 6.5 8 3.5 11 6.5M5 9.5 8 12.5 11 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const d = direction === "desc" ? "M8 3v9M4.5 9 8 12.5 11.5 9" : "M8 13V4M4.5 7 8 3.5 11.5 7";
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-sky-700" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Rank every team by one metric's raw value, respecting direction. Teams with no data never get a fabricated rank. */
function rankTeamsByMetric(
  rows: readonly TeamPerformanceAnalyticsRow[],
  windowKey: TeamPerformanceWindowKey,
  side: PerformanceMetricSide,
  metric: PerformanceMetricDefinition
): Map<string, number> {
  const direction = performanceMetricDirection(metric, side);
  const withValues = rows
    .map((row) => ({ team: row.team, value: performanceMetricRawValue(row.windows[windowKey], side, metric) }))
    .filter((r): r is { team: string; value: number } => r.value !== null);
  withValues.sort((a, b) => (direction === "higher-is-better" ? b.value - a.value : a.value - b.value) || a.team.localeCompare(b.team));
  const ranks = new Map<string, number>();
  withValues.forEach((r, i) => ranks.set(r.team, i + 1));
  return ranks;
}

function sortRows(
  rows: readonly TeamPerformanceAnalyticsRow[],
  sort: SortState,
  rankByMetricKey: Map<string, Map<string, number>>
): TeamPerformanceAnalyticsRow[] {
  const ordered = [...rows];
  if (!sort) {
    ordered.sort((a, b) => a.team.localeCompare(b.team));
    return ordered;
  }
  if (sort.key === "team") {
    ordered.sort((a, b) => (sort.direction === "asc" ? a.team.localeCompare(b.team) : b.team.localeCompare(a.team)));
    return ordered;
  }
  const ranks = rankByMetricKey.get(sort.key);
  ordered.sort((a, b) => {
    const rankA = ranks?.get(a.team) ?? Number.POSITIVE_INFINITY;
    const rankB = ranks?.get(b.team) ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return sort.direction === "asc" ? rankA - rankB : rankB - rankA;
    return a.team.localeCompare(b.team);
  });
  return ordered;
}

function MetricHeader({
  metric,
  side,
  sort,
  onSort,
}: {
  metric: PerformanceMetricDefinition;
  side: PerformanceMetricSide;
  sort: SortState;
  onSort: (key: string) => void;
}) {
  const active = sort?.key === metric.key;
  const direction = active ? sort!.direction : null;
  return (
    <th scope="col" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"} className="px-2 py-2 text-center align-bottom">
      <button
        type="button"
        onClick={() => onSort(metric.key)}
        title={metric.description}
        aria-label={`Sort by ${metric.label}`}
        className={`mx-auto flex min-h-[28px] items-center gap-1 rounded px-1 -mx-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${active ? "text-sky-800" : "text-slate-600 hover:text-slate-900"}`}
      >
        <span className="flex items-center gap-1">
          {metric.shortLabel}
          {metric.isRatingInput && (
            <span aria-hidden="true" title="Feeds the Performance Rating" className="text-amber-500">
              ★
            </span>
          )}
        </span>
        <SortArrow direction={direction} />
      </button>
      {metric.isRatingInput && <span className="sr-only"> (rating input metric)</span>}
    </th>
  );
}

function MetricCell({
  row,
  windowKey,
  side,
  metric,
  displayMode,
  rank,
}: {
  row: TeamPerformanceAnalyticsRow;
  windowKey: TeamPerformanceWindowKey;
  side: PerformanceMetricSide;
  metric: PerformanceMetricDefinition;
  displayMode: DisplayMode;
  rank: number | undefined;
}) {
  const window = row.windows[windowKey];
  const raw = performanceMetricRawValue(window, side, metric);
  const secondary = performanceMetricSecondaryValue(window, side, metric);

  if (raw === null) {
    return (
      <td className="px-2 py-1.5 text-center text-slate-400">
        <span aria-label={`${metric.label}: not available`}>—</span>
      </td>
    );
  }

  if (displayMode === "rankings") {
    return (
      <td className="px-2 py-1.5 text-center tabular-nums">
        {rank !== undefined ? (
          <span className={rank <= 5 ? "font-semibold text-emerald-700" : rank >= 28 ? "font-semibold text-red-700" : "text-slate-700"}>#{rank}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
    );
  }

  return (
    <td className="px-2 py-1.5 text-center tabular-nums text-slate-800">
      <span>{formatPerformanceMetricValue(raw, metric.valueKind)}</span>
      {secondary !== null && (
        <span className="ml-1 text-[10px] font-normal text-slate-400">({formatPerformanceMetricValue(secondary, "percentage")})</span>
      )}
    </td>
  );
}

function PerformanceMetricTable({
  title,
  side,
  rows,
  windowKey,
  displayMode,
}: {
  title: string;
  side: PerformanceMetricSide;
  rows: readonly TeamPerformanceAnalyticsRow[];
  windowKey: TeamPerformanceWindowKey;
  displayMode: DisplayMode;
}) {
  const [sort, setSort] = useState<SortState>(null);

  const rankByMetricKey = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const metric of PERFORMANCE_METRIC_DEFINITIONS) {
      map.set(metric.key, rankTeamsByMetric(rows, windowKey, side, metric));
    }
    return map;
  }, [rows, windowKey, side]);

  const sortedRows = useMemo(() => sortRows(rows, sort, rankByMetricKey), [rows, sort, rankByMetricKey]);

  const handleSort = (key: string) => {
    // Every metric's rank map already encodes "1 = best" via performanceMetricDirection,
    // so sorting by rank ascending always means best-to-worst regardless of the
    // metric's own raw-value direction.
    setSort((current) => nextSort(current, key, "asc"));
  };

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">{title}</h2>
      <NflTableScroller label={`${title} table`}>
        <table className="w-full min-w-[880px] text-xs">
          <thead>
            <tr className={NFL_TABLE_HEAD_ROW}>
              <th scope="col" className="sticky left-0 z-10 min-w-[132px] bg-slate-100 px-2 py-2 text-left align-bottom">
                <button
                  type="button"
                  onClick={() => setSort((current) => nextSort(current, "team", "asc"))}
                  aria-sort={sort?.key === "team" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  aria-label="Sort by team"
                  className="flex items-center gap-1 rounded px-1 -mx-1 text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                >
                  Team
                  <SortArrow direction={sort?.key === "team" ? sort.direction : null} />
                </button>
              </th>
              <th scope="col" className="px-2 py-2 text-center align-bottom">Sample</th>
              {PERFORMANCE_METRIC_DEFINITIONS.map((metric) => (
                <MetricHeader key={metric.key} metric={metric} side={side} sort={sort} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const window = row.windows[windowKey];
              return (
                <tr key={row.team} className={NFL_TABLE_ROW}>
                  <td className="sticky left-0 z-10 min-w-[132px] bg-white px-2 py-1.5 text-left">
                    <TeamCell abbr={row.team} />
                  </td>
                  <td className="px-2 py-1.5 text-center text-[10px] text-slate-500">{formatSampleSizeQualifier(window.sampleSize, windowKey)}</td>
                  {PERFORMANCE_METRIC_DEFINITIONS.map((metric) => (
                    <MetricCell
                      key={metric.key}
                      row={row}
                      windowKey={windowKey}
                      side={side}
                      metric={metric}
                      displayMode={displayMode}
                      rank={rankByMetricKey.get(metric.key)?.get(row.team)}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </NflTableScroller>
      <p className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
        <span className="text-amber-500" aria-hidden="true">★</span> marks the 3 metrics that feed the Performance Rating (EPA/Play, Success Rate, Explosive
        Play Rate). The other 6 columns are informational only and do not affect any rating.
      </p>
    </article>
  );
}

function SummaryTable({ rows }: { rows: readonly TeamPerformanceAnalyticsRow[] }) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const sorted = useMemo(() => {
    const list = [...rows];
    if (!sort) {
      list.sort((a, b) => (a.performance.performanceRank ?? 999) - (b.performance.performanceRank ?? 999) || a.team.localeCompare(b.team));
      return list;
    }
    if (sort.key === "team") {
      list.sort((a, b) => (sort.direction === "asc" ? a.team.localeCompare(b.team) : b.team.localeCompare(a.team)));
      return list;
    }
    const pick = (r: TeamPerformanceAnalyticsRow): number => {
      switch (sort.key) {
        case "performanceRank": return r.performance.performanceRank ?? Number.POSITIVE_INFINITY;
        case "offenseRank": return r.performance.offenseRank ?? Number.POSITIVE_INFINITY;
        case "defenseRank": return r.performance.defenseRank ?? Number.POSITIVE_INFINITY;
        case "gamesPlayed": return r.gamesPlayed;
        default: return 0;
      }
    };
    list.sort((a, b) => (sort.direction === "asc" ? pick(a) - pick(b) : pick(b) - pick(a)) || a.team.localeCompare(b.team));
    return list;
  }, [rows, sort]);

  const toggle = (key: string) =>
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });

  const col = (key: string, label: string) => (
    <th scope="col" aria-sort={sort?.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className="px-2 py-2 text-center">
      <button type="button" onClick={() => toggle(key)} aria-label={`Sort by ${label}`} className="mx-auto flex items-center gap-1 rounded px-1 -mx-1 text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">
        {label}
        <SortArrow direction={sort?.key === key ? sort.direction : null} />
      </button>
    </th>
  );

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">Full-Season Performance Ratings</h2>
        <p className="mt-0.5 text-[10px] text-slate-500">
          These ratings are always calculated from the Full Season and do not change with the Last 4 / Last 8 selector above — that control only
          affects the detailed Offense and Defense tables below.
        </p>
      </div>
      <NflTableScroller label="Full-season performance rating summary table">
        <table className="w-full min-w-[600px] text-xs">
          <thead>
            <tr className={NFL_TABLE_HEAD_ROW}>
              <th scope="col" className="sticky left-0 z-10 min-w-[132px] bg-slate-100 px-2 py-2 text-left">
                <button type="button" onClick={() => toggle("team")} aria-label="Sort by team" className="flex items-center gap-1 rounded px-1 -mx-1 text-slate-600 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500">
                  Team
                  <SortArrow direction={sort?.key === "team" ? sort.direction : null} />
                </button>
              </th>
              {col("performanceRank", "Performance")}
              {col("offenseRank", "OFF")}
              {col("defenseRank", "DEF")}
              {col("gamesPlayed", "Games")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.team} className={NFL_TABLE_ROW}>
                <td className="sticky left-0 z-10 min-w-[132px] bg-white px-2 py-1.5 text-left">
                  <TeamCell abbr={row.team} />
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums">
                  {row.performance.performanceRating !== null ? (
                    <span>
                      {row.performance.performanceRating.toFixed(1)} <span className="text-slate-400">#{row.performance.performanceRank}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">N/A</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums">
                  {row.performance.offenseRating !== null ? (
                    <span>
                      {row.performance.offenseRating.toFixed(1)} <span className="text-slate-400">#{row.performance.offenseRank}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">N/A</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums">
                  {row.performance.defenseRating !== null ? (
                    <span>
                      {row.performance.defenseRating.toFixed(1)} <span className="text-slate-400">#{row.performance.defenseRank}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">N/A</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">{row.gamesPlayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </NflTableScroller>
    </article>
  );
}

export default function NFLAnalytics() {
  usePageSeo({
    title: "2026 NFL Team Performance Analytics | Joe Knows Ball",
    description: "Offense and defense efficiency metrics for all 32 NFL teams, with Last 4, Last 8 and Full Season windows and a Performance Rating built from EPA, Success Rate and Explosive Play Rate.",
    path: "/nfl/analytics",
  });

  const { loading, error, data } = useNflTeamPerformanceAnalytics(ANALYTICS_SEASON);
  const [windowKey, setWindowKey] = useState<TeamPerformanceWindowKey>("fullSeason");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("rankings");

  const rows = data?.teams ?? [];
  const allZeroGames = rows.length > 0 && rows.every((r) => r.gamesPlayed === 0);

  return (
    <>
      <NflPageHeader
        eyebrow="NFL · Team Analytics"
        title="2026 Team Performance Analytics"
        description="Offense and defense efficiency broken out by Last 4 games, Last 8 games and Full Season, with a Performance Rating built from three of the nine metrics below."
      >
        <div className="flex flex-wrap items-center gap-3">
          <NflFilterChips label="Time window" options={WINDOW_OPTIONS} value={windowKey} onChange={setWindowKey} formatOption={(o) => WINDOW_LABELS[o]} />
          <NflFilterChips label="Display mode" options={DISPLAY_OPTIONS} value={displayMode} onChange={setDisplayMode} formatOption={(o) => DISPLAY_LABELS[o]} />
        </div>
      </NflPageHeader>

      {loading && <p className="text-sm text-slate-500">Loading team performance analytics…</p>}
      {error && <p className="text-sm font-semibold text-red-700">Could not load team performance analytics. Please try again later.</p>}

      {!loading && !error && data && (
        <>
          {allZeroGames && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              2026 performance metrics will populate after regular-season games are completed. All 32 teams are listed below with their metrics
              shown as N/A until then.
            </p>
          )}

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            {windowKey === "fullSeason" ? (
              <>
                <strong className="font-semibold text-slate-800">Full Season</strong> values are opponent-adjusted — each team's numbers account for
                the strength of the defenses/offenses it actually faced.
              </>
            ) : (
              <>
                <strong className="font-semibold text-slate-800">{WINDOW_LABELS[windowKey]}</strong> values are raw, unadjusted for opponent
                strength. Opponent adjustment is only applied to Full Season numbers and the Performance Rating.
              </>
            )}
          </p>

          <SummaryTable rows={rows} />
          <PerformanceMetricTable title="Offense" side="offense" rows={rows} windowKey={windowKey} displayMode={displayMode} />
          <PerformanceMetricTable title="Defense" side="defenseAllowed" rows={rows} windowKey={windowKey} displayMode={displayMode} />
        </>
      )}
    </>
  );
}
