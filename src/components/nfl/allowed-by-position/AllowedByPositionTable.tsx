import type { CSSProperties, ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  DENSE_TABLE_HEAD_ROW,
  DENSE_TABLE_ROW,
  DenseTableScroller,
  TABLE_LAYER,
  frozenDenseColumn,
  stickyDenseHeader,
} from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { nextAllowedByPositionSort, sortAllowedByPositionRows } from "./sort";
import type { AllowedByPositionColumn, AllowedByPositionDisplayMode, AllowedByPositionRow, AllowedByPositionSortState } from "./types";

/**
 * Column widths as Tailwind classes (not inline styles) so they can differ
 * by breakpoint: mobile is aggressively compact to fit all five position
 * columns without horizontal scroll, desktop keeps the original geometry.
 * The Opponent column's sticky `left` offset must match the Team column's
 * width exactly at each breakpoint, hence the paired *_LEFT constant.
 */
const TEAM_COL_WIDTH_CLASS = "w-11 min-w-[44px] sm:w-[92px] sm:min-w-[92px]";
const OPPONENT_COL_WIDTH_CLASS = "w-14 min-w-[56px] sm:w-[68px] sm:min-w-[68px]";
const OPPONENT_LEFT_CLASS = "left-11 sm:left-[92px]";
/** Equal width for every position column (QB/RB/Wide WR/Slot WR/TE) so none absorbs extra space from its label. */
const POSITION_COL_WIDTH_CLASS = "w-[46px] min-w-[46px] sm:w-20 sm:min-w-[80px]";

export type RankTone = { className?: string; style?: CSSProperties };
export type RankToneResolver = (rank: number | null) => RankTone;

function SortHeaderButton({
  sortKey,
  label,
  align,
  sort,
  onSortChange,
  emphasis = false,
}: {
  sortKey: string;
  label: string;
  align: "left" | "center";
  sort: AllowedByPositionSortState;
  onSortChange: (next: AllowedByPositionSortState) => void;
  /** Larger, bolder, always-white treatment for the position columns' dark header cells. */
  emphasis?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSortChange(nextAllowedByPositionSort(sort, sortKey))}
      aria-label={`Sort by ${label}`}
      className={cn(
        "flex w-full items-center gap-1 uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
        align === "center" ? "justify-center" : "justify-start",
        emphasis
          ? "flex-col gap-0.5 whitespace-normal text-center text-[11px] font-bold leading-tight text-white sm:text-[13px]"
          : cn("whitespace-nowrap text-[10px] font-bold", active ? "text-slate-950" : "text-current"),
      )}
    >
      {label}
      <Icon aria-hidden className={cn("h-3 w-3 shrink-0", emphasis && "text-white/80")} />
    </button>
  );
}

/**
 * Left-edge divider between position columns: a more pronounced border marks
 * the transition out of the frozen identity columns (Team/Opp), then a
 * thinner, consistent separator between each position category so colored
 * heat cells don't visually blend across the row.
 */
function positionDividerClassName(columnIndex: number): string {
  return columnIndex === 0 ? "border-l-2 border-l-slate-300" : "border-l border-l-slate-200";
}

/**
 * Header-only left divider: stronger than the body's divider so the position
 * header row visibly reads as separate column sections, and stronger still at
 * index 0 to mark the Opp -> QB boundary called out in the design spec.
 */
function positionHeaderDividerClassName(columnIndex: number): string {
  return columnIndex === 0 ? "border-l-4 border-l-slate-400" : "border-l-2 border-l-black/20";
}

/**
 * Generic "N Allowed by Position" defense-rank table: frozen Team/Opponent
 * columns, horizontally scrollable position columns, sortable headers and
 * heat-mapped rank cells. Metric-specific concerns (artifact shape, scoring,
 * column labels/colors, heat direction) are injected via props -- this
 * component only knows about the generic row/column/sort shapes.
 */
export default function AllowedByPositionTable<ColumnKey extends string>({
  columns,
  rows,
  sort,
  onSortChange,
  scrollLabel,
  rankTone,
  renderTeam,
  displayMode = "rank",
}: {
  columns: readonly AllowedByPositionColumn<ColumnKey>[];
  rows: readonly AllowedByPositionRow<ColumnKey>[];
  sort: AllowedByPositionSortState;
  onSortChange: (next: AllowedByPositionSortState) => void;
  scrollLabel: string;
  /** Resolves a rank cell's heat styling; direction/scale choice lives with the caller. Always driven by rank, even in "raw" display mode. */
  rankTone: RankToneResolver;
  /** Renders the team identity cell (e.g. logo + abbreviation). */
  renderTeam: (row: AllowedByPositionRow<ColumnKey>) => ReactNode;
  /** "rank" (default) shows the bare rank; "raw" shows the cell's rawDisplay with rank in parentheses. */
  displayMode?: AllowedByPositionDisplayMode;
}) {
  const sortedRows = sortAllowedByPositionRows(rows, sort.key, sort.direction, displayMode);

  return (
    // `overflow-visible` overrides DenseTableScroller's default `overflow-x-auto` -- same
    // override WeeklyFantasyRankingsTable uses (`sticky top-[73px]` there) for the same reason:
    // `overflow-x: auto` forces the used `overflow-y` to `auto` too (CSS coupling rule), which
    // silently turns the scroller into `position: sticky`'s containing block instead of the
    // page, breaking the header's stickiness relative to the viewport. Safe here because the
    // five equal-width position columns plus the compact Team/Opp columns now fit within the
    // page at every supported breakpoint (verified at 390px and desktop), so horizontal
    // clipping is not needed.
    <DenseTableScroller label={scrollLabel} className="overflow-visible rounded-lg border border-slate-200 bg-white">
      {/* `w-fit` is load-bearing: a block-level <table> otherwise stretches to fill the
          scroller, and with `table-layout: fixed` the leftover space silently lands on
          whichever column the browser picks (observed: the whole remainder goes into the
          first column), breaking the equal-width columns below. */}
      <table className="w-fit table-fixed border-separate border-spacing-0 text-sm sm:mx-auto">
        <thead className={stickyDenseHeader("top-[72px] bg-slate-100")}>
          <tr className={DENSE_TABLE_HEAD_ROW}>
            <th
              scope="col"
              className={cn(
                "border-b border-r border-slate-200 px-1 py-2 text-left",
                TEAM_COL_WIDTH_CLASS,
                frozenDenseColumn({ isHeader: true, surface: "bg-slate-100" }),
              )}
            >
              <SortHeaderButton sortKey="team" label="Team" align="left" sort={sort} onSortChange={onSortChange} />
            </th>
            <th
              scope="col"
              className={cn(
                "sticky border-b border-r border-slate-200 bg-slate-100 px-1.5 py-2 text-left",
                OPPONENT_COL_WIDTH_CLASS,
                OPPONENT_LEFT_CLASS,
                TABLE_LAYER.frozenHeaderCell,
              )}
            >
              <SortHeaderButton sortKey="opponent" label="Opp" align="left" sort={sort} onSortChange={onSortChange} />
            </th>
            {columns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "border-y-2 border-r-2 border-black/20 px-1 py-2 text-center sm:py-3",
                  POSITION_COL_WIDTH_CLASS,
                  positionHeaderDividerClassName(index),
                  column.headerClassName,
                )}
              >
                <SortHeaderButton
                  sortKey={column.key}
                  label={column.label}
                  align="center"
                  sort={sort}
                  onSortChange={onSortChange}
                  emphasis
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id} className={DENSE_TABLE_ROW}>
              <td
                className={cn(
                  "border-r border-slate-100 px-1 py-1.5 text-left font-semibold uppercase text-slate-800",
                  TEAM_COL_WIDTH_CLASS,
                  frozenDenseColumn({ surface: "bg-white" }),
                )}
              >
                {renderTeam(row)}
              </td>
              <td
                className={cn(
                  "sticky border-r border-slate-100 bg-white px-1.5 py-1.5 text-left text-[11px] uppercase text-slate-500 sm:text-sm",
                  OPPONENT_COL_WIDTH_CLASS,
                  OPPONENT_LEFT_CLASS,
                  TABLE_LAYER.frozenColumn,
                )}
              >
                {row.opponent ? `${row.location} ${row.opponent.toUpperCase()}` : <span className="text-slate-400">—</span>}
              </td>
              {columns.map((column, index) => {
                const cell = row.cells[column.key];
                const rank = cell?.rank ?? null;
                const tone = rankTone(rank);
                return (
                  <td
                    key={column.key}
                    className={cn(
                      "px-1 py-1.5 text-center text-xs tabular-nums font-semibold text-slate-800 sm:px-1.5 sm:text-sm",
                      POSITION_COL_WIDTH_CLASS,
                      positionDividerClassName(index),
                      tone.className,
                    )}
                    style={tone.style}
                  >
                    {displayMode === "raw" ? (
                      cell?.rawDisplay != null ? (
                        <span className="inline-flex items-baseline gap-0.5 sm:gap-1">
                          <span>{cell.rawDisplay}</span>
                          <span className="text-[9px] font-normal opacity-70 sm:text-[10px]">({rank ?? "—"})</span>
                        </span>
                      ) : (
                        <span className="font-normal text-slate-400">—</span>
                      )
                    ) : (
                      (rank ?? <span className="font-normal text-slate-400">—</span>)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </DenseTableScroller>
  );
}
