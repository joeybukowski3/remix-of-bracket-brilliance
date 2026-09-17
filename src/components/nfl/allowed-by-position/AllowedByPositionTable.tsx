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

/** Fixed pixel widths so the second frozen column's `left` offset is exact. */
const TEAM_COL_WIDTH = 92;
const OPPONENT_COL_WIDTH = 68;

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
        "flex w-full items-center gap-1 whitespace-nowrap uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
        align === "center" ? "justify-center" : "justify-start",
        emphasis ? "text-[13px] font-bold text-white" : cn("text-[10px] font-bold", active ? "text-slate-950" : "text-current"),
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
    <DenseTableScroller label={scrollLabel} className="rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
        <thead className={stickyDenseHeader("bg-slate-100")}>
          <tr className={DENSE_TABLE_HEAD_ROW}>
            <th
              scope="col"
              style={{ width: TEAM_COL_WIDTH, minWidth: TEAM_COL_WIDTH }}
              className={cn(
                "border-b border-r border-slate-200 px-2 py-2 text-left",
                frozenDenseColumn({ isHeader: true, surface: "bg-slate-100" }),
              )}
            >
              <SortHeaderButton sortKey="team" label="Team" align="left" sort={sort} onSortChange={onSortChange} />
            </th>
            <th
              scope="col"
              style={{ width: OPPONENT_COL_WIDTH, minWidth: OPPONENT_COL_WIDTH, left: TEAM_COL_WIDTH }}
              className={cn(
                "sticky border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left",
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
                  "min-w-[52px] border-y-2 border-r-2 border-black/20 px-1.5 py-3 text-center",
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
                style={{ width: TEAM_COL_WIDTH, minWidth: TEAM_COL_WIDTH }}
                className={cn(
                  "border-r border-slate-100 px-2 py-1.5 text-left font-semibold uppercase text-slate-800",
                  frozenDenseColumn({ surface: "bg-white" }),
                )}
              >
                {renderTeam(row)}
              </td>
              <td
                style={{ width: OPPONENT_COL_WIDTH, minWidth: OPPONENT_COL_WIDTH, left: TEAM_COL_WIDTH }}
                className={cn("sticky border-r border-slate-100 bg-white px-2 py-1.5 text-left uppercase text-slate-500", TABLE_LAYER.frozenColumn)}
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
                      "px-1.5 py-1.5 text-center tabular-nums font-semibold text-slate-800",
                      positionDividerClassName(index),
                      tone.className,
                    )}
                    style={tone.style}
                  >
                    {displayMode === "raw" ? (
                      cell?.rawDisplay != null ? (
                        <span className="inline-flex items-baseline gap-1">
                          <span>{cell.rawDisplay}</span>
                          <span className="text-[10px] font-normal opacity-70">({rank ?? "—"})</span>
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
