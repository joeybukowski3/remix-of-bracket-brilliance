import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import TeamLogo from "@/components/TeamLogo";
import {
  NflTableScroller,
  NFL_TABLE_HEAD_ROW,
  NFL_TABLE_ROW,
} from "@/components/nfl/ui/NflTable";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { getPercentileGradientColor, getRankGradientColor } from "@/lib/fantasy/parPresentation";
import { MATCHUP_GRADE_TEAM_COUNT, type MatchupGrade } from "@/lib/fantasy/matchupGrade";
import { formatPercentile } from "@/lib/fantasy/teamPercentiles";
import {
  WEEKLY_RANKINGS_WEEK,
  WEEKLY_STAT_COLUMNS,
  type TeamStatValue,
  type WeeklyRankingRow,
  type WeeklyStatColumn,
} from "@/lib/fantasy/weeklyRankings";
import {
  DEFAULT_WEEKLY_SORT,
  nextSort,
  sortWeeklyRows,
  statSortKey,
  type WeeklySort,
  type WeeklySortKey,
} from "@/lib/fantasy/weeklySort";
import type { FantasyPosition } from "@/lib/fantasy/rankings";
import { cn } from "@/lib/utils";

/** How the position-specific stat columns render their value. */
export type StatDisplayMode = "percentile" | "raw";

/** Shared cell padding. Rows are deliberately tight — this is a scan surface. */
const CELL = "px-2 py-1.5 align-middle";

function MatchupBadge({ grade }: { grade: MatchupGrade | null }) {
  if (!grade) {
    return (
      <span className="text-slate-400" aria-label="Matchup unavailable">
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-4",
        grade.badgeClass,
      )}
    >
      {grade.label}
    </span>
  );
}

/** 2025 FPA rank, shaded on the board's existing emerald → slate → rose ramp. */
function FpaRankCell({ rank }: { rank: number | null | undefined }) {
  if (rank == null) return <span className="text-slate-400">—</span>;
  return (
    <span
      className="inline-block min-w-[1.75rem] rounded px-1 text-center tabular-nums"
      style={{ backgroundColor: getRankGradientColor(rank, MATCHUP_GRADE_TEAM_COUNT) }}
    >
      {rank}
    </span>
  );
}

/**
 * A position-specific stat cell.
 *
 * The background is always driven by the team's league percentile, in both
 * display modes — switching to Raw changes the number shown, never where the
 * cell sits relative to the league.
 */
function StatCell({ stat, mode }: { stat: TeamStatValue | null; mode: StatDisplayMode }) {
  if (!stat) return <span className="text-slate-400">N/A</span>;
  return (
    <span
      className="inline-block min-w-[2.5rem] rounded px-1.5 text-right tabular-nums text-slate-800"
      style={{ backgroundColor: getPercentileGradientColor(stat.percentile) }}
    >
      {mode === "percentile" ? formatPercentile(stat.percentile) : stat.display}
    </span>
  );
}

/** A sortable header cell with a subtle active-direction caret. */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  title,
  className,
}: {
  label: string;
  sortKey: WeeklySortKey;
  sort: WeeklySort;
  onSort: (key: WeeklySortKey) => void;
  title?: string;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Caret = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={cn(CELL, className)}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title}
        className={cn(
          "inline-flex w-full items-center gap-0.5 rounded hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
          className?.includes("text-right") ? "justify-end" : "justify-start",
          active && "text-slate-900",
        )}
      >
        <span>{label}</span>
        {active && <Caret aria-hidden className="h-3 w-3 shrink-0" />}
      </button>
    </th>
  );
}

function ppgLabel(value: number): string {
  return value.toFixed(1);
}

/**
 * The Week 1 rankings board.
 *
 * Wide layout is a real table so ranks stay comparable down a column. Below
 * `md` it stays a table — a dense spreadsheet-style one carrying rank, player,
 * projected PPG, opponent, matchup grade and FPA rank — rather than
 * dropping to stacked cards. The secondary team-context stat columns drop out
 * rather than forcing a horizontal scroll, and the compact table always
 * renders in fantasy-rank order.
 *
 * Projected PPG is the only column that sets the fantasy ranking, so it is the
 * only column given headline weight. Sorting another column reorders the rows
 * but never renumbers RK — see the caption note rendered while that is active.
 */
export default function WeeklyRankingsTable({
  position,
  rows,
  isCompact,
  displayMode,
}: {
  position: FantasyPosition;
  rows: readonly WeeklyRankingRow[];
  isCompact: boolean;
  displayMode: StatDisplayMode;
}) {
  const statColumns: readonly WeeklyStatColumn[] = WEEKLY_STAT_COLUMNS[position];
  const [sort, setSort] = useState<WeeklySort>(DEFAULT_WEEKLY_SORT);
  const headingId = `week-${WEEKLY_RANKINGS_WEEK}-${position.toLowerCase()}-rankings`;

  const sortedRows = useMemo(
    () => sortWeeklyRows(rows, sort, statColumns),
    [rows, sort, statColumns],
  );

  const handleSort = (key: WeeklySortKey) => setSort((current) => nextSort(current, key, statColumns));
  const exploratorySort = sort.key !== DEFAULT_WEEKLY_SORT.key;

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-700">
        No {position} rankings available.
      </p>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      // Capped rather than full-bleed: at ~11 short columns a full-width table
      // distributes the slack evenly and the row stops reading as one line.
      className="max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 px-3 py-2">
        <h2 id={headingId} className="text-sm font-bold text-slate-900">
          Week {WEEKLY_RANKINGS_WEEK} {position} — {rows.length} ranked
        </h2>
        <p className="text-[11px] text-slate-500">
          {isCompact
            ? "Ranked by 2026 projected PPG · matchup columns are 2025 actual data"
            : exploratorySort
              ? "Table sorted for exploration · RK stays the 2026 projected PPG fantasy rank"
              : "Ranked by 2026 projected PPG · matchup columns are 2025 actual data"}
        </p>
      </div>

      {isCompact ? (
        <NflTableScroller label={`Week ${WEEKLY_RANKINGS_WEEK} ${position} rankings`}>
          <table className="w-full min-w-[340px] border-collapse text-[11px]">
            <thead>
              <tr className={cn(NFL_TABLE_HEAD_ROW, "text-[9px]")}>
                <th scope="col" className="w-7 px-1.5 py-1.5 text-right">
                  Rk
                </th>
                <th scope="col" className="px-1.5 py-1.5 text-left">
                  Player
                </th>
                <th scope="col" className="w-12 px-1.5 py-1.5 text-right">
                  Proj PPG
                </th>
                <th scope="col" className="w-11 px-1.5 py-1.5 text-left">
                  Opp
                </th>
                <th scope="col" className="w-11 px-1.5 py-1.5 text-left">
                  Match
                </th>
                <th scope="col" className="w-9 px-1.5 py-1.5 text-right">
                  FPA Rk
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const normalizedTeam = row.teamAbbr?.toUpperCase();
                return (
                  <tr key={row.key} className={cn(NFL_TABLE_ROW, "h-8")}>
                    <td className="px-1.5 py-1 text-right font-semibold tabular-nums text-slate-500">
                      {row.rank}
                    </td>
                    <td className="max-w-0 px-1.5 py-1">
                      <div className="flex min-w-0 items-center gap-1">
                        <TeamLogo
                          name={normalizedTeam ?? "FA"}
                          logo={normalizedTeam ? nflLogoUrl(normalizedTeam) : undefined}
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="min-w-0 truncate text-[12px] font-semibold leading-4 text-slate-900">
                          {row.player}
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold uppercase leading-4 text-slate-500">
                          {normalizedTeam ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-1.5 py-1 text-right text-[12px] font-bold tabular-nums text-slate-950">
                      {ppgLabel(row.projectedPpg)}
                    </td>
                    <td className="max-w-0 truncate px-1.5 py-1 text-slate-600">
                      {row.opponentLabel}
                    </td>
                    <td className="px-1.5 py-1">
                      <MatchupBadge grade={row.grade} />
                    </td>
                    <td className="px-1.5 py-1 text-right">
                      <FpaRankCell rank={row.fpa?.rank} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </NflTableScroller>
      ) : (
        <NflTableScroller label={`Week ${WEEKLY_RANKINGS_WEEK} ${position} rankings`}>
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className={NFL_TABLE_HEAD_ROW}>
                <th
                  scope="col"
                  className={cn(CELL, "w-10 text-right")}
                  title="Fantasy rank by 2026 projected PPG — unaffected by table sorting"
                >
                  Rk
                </th>
                <th scope="col" className={cn(CELL, "text-left")}>
                  Player
                </th>
                <th scope="col" className={cn(CELL, "text-left")}>
                  Team
                </th>
                <th scope="col" className={cn(CELL, "text-left")}>
                  Opp
                </th>
                <SortHeader
                  label="Proj PPG"
                  sortKey="projPpg"
                  sort={sort}
                  onSort={handleSort}
                  className="text-right"
                  title="2026 projected fantasy points per game — sets the fantasy ranking"
                />
                <th scope="col" className={cn(CELL, "text-left")}>
                  Matchup
                </th>
                <SortHeader
                  label="2025 FPA/G"
                  sortKey="fpaPerGame"
                  sort={sort}
                  onSort={handleSort}
                  className="text-right"
                  title={`2025 fantasy points per game allowed to ${position} by this opponent`}
                />
                <SortHeader
                  label="FPA Rk"
                  sortKey="fpaRank"
                  sort={sort}
                  onSort={handleSort}
                  className="text-right"
                  title="2025 rank, 1 = allowed the most to this position (easiest matchup)"
                />
                {statColumns.map((column) => (
                  <SortHeader
                    key={column.id}
                    label={column.label}
                    sortKey={statSortKey(column.id)}
                    sort={sort}
                    onSort={handleSort}
                    className="text-right"
                    title={`${column.description} — shown as ${
                      displayMode === "percentile" ? "league percentile (0-100)" : "raw value"
                    }, shaded by league percentile`}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.key} className={NFL_TABLE_ROW}>
                  <td className={cn(CELL, "text-right font-semibold tabular-nums text-slate-500")}>
                    {row.rank}
                  </td>
                  <td className={cn(CELL, "whitespace-nowrap font-semibold text-slate-900")}>
                    {row.player}
                  </td>
                  <td className={cn(CELL, "uppercase text-slate-600")}>{row.teamAbbr ?? "—"}</td>
                  <td
                    className={cn(
                      CELL,
                      "whitespace-nowrap",
                      row.opponent ? "text-slate-700" : "text-slate-400",
                    )}
                  >
                    {row.opponentLabel}
                  </td>
                  <td className={cn(CELL, "text-right text-sm font-bold tabular-nums text-slate-950")}>
                    {ppgLabel(row.projectedPpg)}
                  </td>
                  <td className={CELL}>
                    <MatchupBadge grade={row.grade} />
                  </td>
                  <td className={cn(CELL, "text-right tabular-nums text-slate-700")}>
                    {row.fpa ? row.fpa.pointsAllowed.toFixed(1) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className={cn(CELL, "text-right")}>
                    <FpaRankCell rank={row.fpa?.rank} />
                  </td>
                  {statColumns.map((column, index) => (
                    <td key={column.id} className={cn(CELL, "text-right")}>
                      <StatCell stat={row.stats[index]} mode={displayMode} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </NflTableScroller>
      )}
    </section>
  );
}
