import { Fragment, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, TABLE_LAYER, frozenDenseColumn, stickyDenseHeader } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { ALLOWED_BY_POSITION_HEADER_CLASSNAMES } from "@/components/nfl/allowed-by-position/headerColors";
import { POSITION_MATCHUP_POSITION_KEYS, type PositionMatchupPositionKey } from "@/lib/nfl/positionMatchups/types";
import { POSITION_MATCHUP_RATING_LABELS } from "@/lib/nfl/positionMatchups/rating";
import { positionMatchupAllowedRankTone, positionMatchupForRankTone, positionMatchupRatingTone, type PositionMatchupTableRow } from "@/lib/nfl/positionMatchups/presentation";
import { POSITION_MATCHUP_COLUMN_WIDTH, POSITION_MATCHUP_OPPONENT_LEFT, POSITION_MATCHUP_SCALE } from "./columnGeometry";
import { nextPositionMatchupSort, sortPositionMatchupRows } from "./sort";
import { positionMatchupSortKey, type PositionMatchupDisplayMode, type PositionMatchupSortKey, type PositionMatchupSortState } from "./types";

const POSITION_LABELS: Record<PositionMatchupPositionKey, string> = { qb: "QB", rb: "RB", wr: "WR", te: "TE" };

/** Strong divider marking the start of a new position block, thin hairline between its own FOR/ALLOWED/EDGE sub-columns. Shared by every header row and every body row so the line runs unbroken down the full height of the table. */
const GROUP_BOUNDARY_BORDER = "border-l-2 border-l-slate-400";
const SUB_COLUMN_BORDER = "border-l border-l-slate-200";

function positionDividerClassName(isFirstSubColumn: boolean): string {
  return isFirstSubColumn ? GROUP_BOUNDARY_BORDER : SUB_COLUMN_BORDER;
}

const HEADER_FONT_SIZE_CLASS = `text-[${POSITION_MATCHUP_SCALE.headerFontSize}]`;
const BODY_FONT_SIZE_CLASS = `text-[${POSITION_MATCHUP_SCALE.bodyFontSize}]`;
const EDGE_PILL_FONT_SIZE_CLASS = `text-[${POSITION_MATCHUP_SCALE.edgePillFontSize}]`;
const CELL_PADDING_X_CLASS = `px-[${POSITION_MATCHUP_SCALE.cellPaddingX}]`;

function SortHeaderButton({
  sortKey,
  label,
  ariaLabel,
  sort,
  onSortChange,
}: {
  sortKey: PositionMatchupSortKey;
  label: string;
  /** Full, unambiguous label for assistive tech and tests -- the same short text repeats across every position block, so the visible label alone cannot identify which column this is. */
  ariaLabel: string;
  sort: PositionMatchupSortState;
  onSortChange: (next: PositionMatchupSortState) => void;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSortChange(nextPositionMatchupSort(sort, sortKey))}
      aria-label={`Sort by ${ariaLabel}`}
      className={cn(
        "flex w-full items-center justify-center gap-0.5 whitespace-nowrap font-bold uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
        HEADER_FONT_SIZE_CLASS,
        active ? "text-slate-950" : "text-slate-600",
      )}
    >
      {label}
      {/* Fixed-size icon container: the glyph itself never changes the button's (and therefore the column's) width. */}
      <Icon aria-hidden className="h-2.5 w-2.5 shrink-0" />
    </button>
  );
}

/** Combined EDGE cell: the JKB rating pill with the signed edge number appended, e.g. "Very Strong (+18)". */
function EdgeRatingPill({ row, position }: { row: PositionMatchupTableRow; position: PositionMatchupPositionKey }) {
  const cell = row.cells[position];
  if (cell.edge == null || cell.rating == null) return <span className="font-normal text-slate-400">—</span>;
  const tone = positionMatchupRatingTone(cell.rating);
  const sign = cell.edge > 0 ? `+${cell.edge}` : `${cell.edge}`;
  return (
    <span
      className={cn("inline-flex max-w-full items-center justify-center whitespace-normal break-words rounded px-1 py-0.5 text-center font-bold uppercase leading-[1.1]", EDGE_PILL_FONT_SIZE_CLASS)}
      style={tone.style}
    >
      {POSITION_MATCHUP_RATING_LABELS[cell.rating]} ({sign})
    </span>
  );
}

/**
 * "Fantasy Position Matchup Comparison" table: TEAM | OPP, then one block per
 * position (QB/RB/WR/TE) with three sub-columns each -- FOR, ALLOWED, and a
 * combined EDGE cell (JKB rating pill + signed edge number). Unlike the
 * single-metric "N Allowed by Position" shell (AllowedByPositionTable),
 * every position here carries its own small multi-column matchup, so this is
 * a dedicated component rather than a reuse of that generic table.
 *
 * Column geometry lives in one place (columnGeometry.ts) and is applied only
 * via <colgroup>; header and body cells carry no width/min-width of their
 * own, so the browser's fixed table layout is the single source of truth for
 * every column's width and it cannot drift between the header, the body, or
 * a sort-triggered re-render.
 */
export default function PositionMatchupTable({
  rows,
  sort,
  onSortChange,
  scrollLabel,
  displayMode,
  renderTeam,
}: {
  rows: readonly PositionMatchupTableRow[];
  sort: PositionMatchupSortState;
  onSortChange: (next: PositionMatchupSortState) => void;
  scrollLabel: string;
  displayMode: PositionMatchupDisplayMode;
  renderTeam: (row: PositionMatchupTableRow) => ReactNode;
}) {
  const sortedRows = sortPositionMatchupRows(rows, sort.key, sort.direction, displayMode);

  return (
    <DenseTableScroller label={scrollLabel} className="rounded-lg border border-slate-200 bg-white">
      {/* `table-fixed` needs an explicit <colgroup> here: the position group header row uses
          colSpan=4 and the Team/Opp header cells use rowSpan=2, so no row has one un-spanned
          cell per column for the browser to size columns from -- without this, column widths
          collapse unpredictably and cell content overlaps neighboring columns. Every width
          below comes from columnGeometry.ts and is applied nowhere else. */}
      <table className="w-fit table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          {/* `data-col-width` mirrors the inline `style` width for tests: jsdom's CSSOM
              doesn't parse `clamp()` and silently drops it, so tests can't read it back off
              `style`/`getAttribute("style")` the way a real browser would. */}
          <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.team} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.team }} />
          <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.opponent} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.opponent }} />
          {POSITION_MATCHUP_POSITION_KEYS.map((position) => (
            <Fragment key={position}>
              <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.sub} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.sub }} />
              <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.sub} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.sub }} />
              <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.edge} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.edge }} />
            </Fragment>
          ))}
        </colgroup>
        <thead className={stickyDenseHeader("top-[72px] bg-slate-100")}>
          <tr className={DENSE_TABLE_HEAD_ROW}>
            <th
              scope="col"
              rowSpan={2}
              className={cn("border-b border-r border-slate-200 py-2 text-left align-bottom", CELL_PADDING_X_CLASS, frozenDenseColumn({ isHeader: true, surface: "bg-slate-100" }))}
            >
              <SortHeaderButton sortKey="team" label="Team" ariaLabel="Team" sort={sort} onSortChange={onSortChange} />
            </th>
            <th
              scope="col"
              rowSpan={2}
              className={cn("sticky border-b border-r border-slate-200 bg-slate-100 py-2 text-left align-bottom", CELL_PADDING_X_CLASS, TABLE_LAYER.frozenHeaderCell)}
              style={{ left: POSITION_MATCHUP_OPPONENT_LEFT }}
              data-sticky-left={POSITION_MATCHUP_OPPONENT_LEFT}
            >
              <SortHeaderButton sortKey="opponent" label="Opp" ariaLabel="Opponent" sort={sort} onSortChange={onSortChange} />
            </th>
            {POSITION_MATCHUP_POSITION_KEYS.map((position) => (
              <th
                key={position}
                scope="colgroup"
                colSpan={3}
                data-position-group={position}
                className={cn(
                  "border-t-2 border-b-2 border-t-black/20 border-b-black/20 py-1.5 text-center font-bold uppercase tracking-wide",
                  CELL_PADDING_X_CLASS,
                  "text-xs",
                  GROUP_BOUNDARY_BORDER,
                  ALLOWED_BY_POSITION_HEADER_CLASSNAMES[position],
                )}
              >
                {POSITION_LABELS[position]}
              </th>
            ))}
          </tr>
          <tr className={DENSE_TABLE_HEAD_ROW}>
            {POSITION_MATCHUP_POSITION_KEYS.map((position) =>
              (["for", "allowed", "edge"] as const).map((field, index) => (
                <th key={`${position}-${field}`} scope="col" className={cn("border-b-2 border-b-black/20 py-1.5 text-center", CELL_PADDING_X_CLASS, positionDividerClassName(index === 0))}>
                  <SortHeaderButton
                    sortKey={positionMatchupSortKey(position, field)}
                    label={field === "for" ? "For" : field === "allowed" ? "Allow" : "Edge"}
                    ariaLabel={`${POSITION_LABELS[position]} ${field === "for" ? "For" : field === "allowed" ? "Allowed" : "Edge"}`}
                    sort={sort}
                    onSortChange={onSortChange}
                  />
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.id} className={DENSE_TABLE_ROW}>
              <td className={cn("border-r border-slate-100 py-1.5 text-left font-semibold uppercase text-slate-800", CELL_PADDING_X_CLASS, BODY_FONT_SIZE_CLASS, frozenDenseColumn({ surface: "bg-white" }))}>
                {renderTeam(row)}
              </td>
              <td
                className={cn("sticky border-r border-slate-100 bg-white py-1.5 text-left uppercase text-slate-500", CELL_PADDING_X_CLASS, BODY_FONT_SIZE_CLASS, TABLE_LAYER.frozenColumn)}
                style={{ left: POSITION_MATCHUP_OPPONENT_LEFT }}
                data-sticky-left={POSITION_MATCHUP_OPPONENT_LEFT}
              >
                {row.opponent ? `${row.location} ${row.opponent.toUpperCase()}` : <span className="text-slate-400">—</span>}
              </td>
              {POSITION_MATCHUP_POSITION_KEYS.map((position) => {
                const cell = row.cells[position];
                const forTone = positionMatchupForRankTone(cell.forRank);
                const allowedTone = positionMatchupAllowedRankTone(cell.allowedRank);
                return (
                  <Fragment key={position}>
                    <td
                      data-position-group={position}
                      className={cn("py-1.5 text-center tabular-nums font-semibold text-slate-800", CELL_PADDING_X_CLASS, BODY_FONT_SIZE_CLASS, positionDividerClassName(true))}
                      style={forTone.style}
                    >
                      {displayMode === "raw" ? (
                        cell.forDisplay != null ? (
                          <span className="inline-flex items-baseline gap-0.5">
                            <span>{cell.forDisplay}</span>
                            <span className="text-[9px] font-normal opacity-70">({cell.forRank ?? "—"})</span>
                          </span>
                        ) : (
                          <span className="font-normal text-slate-400">—</span>
                        )
                      ) : (
                        (cell.forRank ?? <span className="font-normal text-slate-400">—</span>)
                      )}
                    </td>
                    <td
                      key={`${position}-allowed`}
                      className={cn("py-1.5 text-center tabular-nums font-semibold text-slate-800", CELL_PADDING_X_CLASS, BODY_FONT_SIZE_CLASS, positionDividerClassName(false))}
                      style={allowedTone.style}
                    >
                      {displayMode === "raw" ? (
                        cell.allowedDisplay != null ? (
                          <span className="inline-flex items-baseline gap-0.5">
                            <span>{cell.allowedDisplay}</span>
                            <span className="text-[9px] font-normal opacity-70">({cell.allowedRank ?? "—"})</span>
                          </span>
                        ) : (
                          <span className="font-normal text-slate-400">—</span>
                        )
                      ) : (
                        (cell.allowedRank ?? <span className="font-normal text-slate-400">—</span>)
                      )}
                    </td>
                    <td key={`${position}-edge`} className={cn("py-1.5 text-center", CELL_PADDING_X_CLASS, positionDividerClassName(false))}>
                      <EdgeRatingPill row={row} position={position} />
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </DenseTableScroller>
  );
}
