import { Fragment, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, TABLE_LAYER, frozenDenseColumn } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { ALLOWED_BY_POSITION_HEADER_CLASSNAMES } from "@/components/nfl/allowed-by-position/headerColors";
import { POSITION_MATCHUP_POSITION_KEYS, type PositionMatchupPositionKey } from "@/lib/nfl/positionMatchups/types";
import { POSITION_MATCHUP_RATING_LABELS } from "@/lib/nfl/positionMatchups/rating";
import { positionMatchupAllowedRankTone, positionMatchupForRankTone, positionMatchupRatingTone, type PositionMatchupTableRow } from "@/lib/nfl/positionMatchups/presentation";
import { POSITION_MATCHUP_COLUMN_WIDTH, POSITION_MATCHUP_OPPONENT_LEFT, POSITION_MATCHUP_SCALE, POSITION_MATCHUP_TABLE_WIDTH } from "./columnGeometry";
import { nextPositionMatchupSort, sortPositionMatchupRows } from "./sort";
import { positionMatchupSortKey, type PositionMatchupDisplayMode, type PositionMatchupSortKey, type PositionMatchupSortState } from "./types";

const POSITION_LABELS: Record<PositionMatchupPositionKey, string> = { qb: "QB", rb: "RB", wr: "WR", te: "TE" };

/** Strong divider marking the start of a new position block, thin hairline between its own FOR/ALLOWED/EDGE sub-columns. Shared by every header row and every body row so the line runs unbroken down the full height of the table. */
const GROUP_BOUNDARY_BORDER = "border-l-2 border-l-slate-400";
const SUB_COLUMN_BORDER = "border-l border-l-slate-200";

function positionDividerClassName(isFirstSubColumn: boolean): string {
  return isFirstSubColumn ? GROUP_BOUNDARY_BORDER : SUB_COLUMN_BORDER;
}

const HEADER_FONT_SIZE_CLASS = POSITION_MATCHUP_SCALE.headerFontClass;
const BODY_FONT_SIZE_CLASS = POSITION_MATCHUP_SCALE.bodyFontClass;
const EDGE_PILL_FONT_SIZE_CLASS = POSITION_MATCHUP_SCALE.edgePillFontClass;
const CELL_PADDING_X_CLASS = POSITION_MATCHUP_SCALE.cellPaddingXClass;
/** The site header is 72px tall plus its 1px bottom border. */
export const POSITION_MATCHUP_STICKY_TOP = 73;

type StickyGeometry = { left: number; width: number; scrollLeft: number; groupHeight: number; headerHeight: number };

/** Horizontal overflow traps CSS sticky vertically, so a viewport-fixed copy follows page scroll. */
function usePageStickyHeader() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const [geometry, setGeometry] = useState<StickyGeometry | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const scroller = scrollRef.current;
    const head = headRef.current;
    if (!wrap || !scroller || !head) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const headRect = head.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const active = headRect.top < POSITION_MATCHUP_STICKY_TOP && wrapRect.bottom > POSITION_MATCHUP_STICKY_TOP + headRect.height;
      if (!active) {
        setGeometry((current) => current === null ? current : null);
        return;
      }
      const scrollRect = scroller.getBoundingClientRect();
      const groupHeight = head.rows[0]?.getBoundingClientRect().height ?? 0;
      setGeometry({ left: scrollRect.left, width: scrollRect.width, scrollLeft: scroller.scrollLeft, groupHeight, headerHeight: headRect.height });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    scroller.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (observer) observer.observe(head);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      scroller.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, []);

  return { wrapRef, scrollRef, headRef, geometry };
}

function SortHeaderButton({
  sortKey,
  label,
  ariaLabel,
  sort,
  onSortChange,
  clone = false,
}: {
  sortKey: PositionMatchupSortKey;
  label: string;
  /** Full, unambiguous label for assistive tech and tests -- the same short text repeats across every position block, so the visible label alone cannot identify which column this is. */
  ariaLabel: string;
  sort: PositionMatchupSortState;
  onSortChange: (next: PositionMatchupSortState) => void;
  clone?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      tabIndex={clone ? -1 : undefined}
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
      className={cn("inline-flex h-4 max-w-full items-center justify-center whitespace-nowrap rounded px-0.5 py-0 text-center font-bold uppercase", EDGE_PILL_FONT_SIZE_CLASS, "leading-none")}
      style={tone.style}
    >
      {POSITION_MATCHUP_RATING_LABELS[cell.rating]} ({sign})
    </span>
  );
}

function TableColumns() {
  return <colgroup>
    <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.team} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.team }} />
    <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.opponent} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.opponent }} />
    {POSITION_MATCHUP_POSITION_KEYS.map((position) => <Fragment key={position}>
      <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.sub} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.sub }} />
      <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.sub} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.sub }} />
      <col data-col-width={POSITION_MATCHUP_COLUMN_WIDTH.edge} style={{ width: POSITION_MATCHUP_COLUMN_WIDTH.edge }} />
    </Fragment>)}
  </colgroup>;
}

function TableHeader({ sort, onSortChange, clone = false, cloneScrollLeft = 0, headRef, groupHeight }: {
  sort: PositionMatchupSortState;
  onSortChange: (next: PositionMatchupSortState) => void;
  clone?: boolean;
  cloneScrollLeft?: number;
  headRef?: Ref<HTMLTableSectionElement>;
  groupHeight?: number;
}) {
  return <thead ref={headRef} className="bg-slate-100">
    <tr className={cn(DENSE_TABLE_HEAD_ROW, "bg-slate-100")} data-header-row="group" style={clone ? { height: groupHeight } : undefined}>
      <th scope="col" rowSpan={2} className={cn("border-b border-r border-slate-200 py-2 text-left align-bottom", CELL_PADDING_X_CLASS, frozenDenseColumn({ isHeader: true, surface: "bg-slate-100" }))} style={clone ? { position: "relative", left: cloneScrollLeft } : undefined}>
        <SortHeaderButton sortKey="team" label="Team" ariaLabel="Team" sort={sort} onSortChange={onSortChange} clone={clone} />
      </th>
      <th scope="col" rowSpan={2} className={cn("sticky border-b border-r border-slate-200 bg-slate-100 py-2 text-left align-bottom", CELL_PADDING_X_CLASS, TABLE_LAYER.frozenHeaderCell)} style={clone ? { position: "relative", left: cloneScrollLeft } : { left: POSITION_MATCHUP_OPPONENT_LEFT }} data-sticky-left={POSITION_MATCHUP_OPPONENT_LEFT}>
        <SortHeaderButton sortKey="opponent" label="Opp" ariaLabel="Opponent" sort={sort} onSortChange={onSortChange} clone={clone} />
      </th>
      {POSITION_MATCHUP_POSITION_KEYS.map((position) => <th key={position} scope="colgroup" colSpan={3} data-position-group={position} className={cn(
        "border-t-2 border-b-2 border-t-black/20 border-b-black/20 py-1.5 text-center text-xs font-bold uppercase tracking-wide",
        GROUP_BOUNDARY_BORDER, ALLOWED_BY_POSITION_HEADER_CLASSNAMES[position],
      )}>{POSITION_LABELS[position]}</th>)}
    </tr>
    <tr className={cn(DENSE_TABLE_HEAD_ROW, "bg-slate-100")} data-header-row="sub">
      {POSITION_MATCHUP_POSITION_KEYS.map((position) => (["for", "allowed", "edge"] as const).map((field, index) => <th key={`${position}-${field}`} scope="col" className={cn("border-b-2 border-b-black/20 py-1.5 text-center", CELL_PADDING_X_CLASS, positionDividerClassName(index === 0))}>
        <SortHeaderButton sortKey={positionMatchupSortKey(position, field)} label={field === "for" ? "For" : field === "allowed" ? "Allow" : "Edge"} ariaLabel={`${POSITION_LABELS[position]} ${field === "for" ? "For" : field === "allowed" ? "Allowed" : "Edge"}`} sort={sort} onSortChange={onSortChange} clone={clone} />
      </th>))}
    </tr>
  </thead>;
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
  const { wrapRef, scrollRef, headRef, geometry } = usePageStickyHeader();

  return (
    <div ref={wrapRef} className="min-w-0">
    {geometry && <div data-testid="position-matchup-sticky-header" aria-hidden="true" className="fixed z-20 overflow-hidden bg-slate-100" style={{ top: POSITION_MATCHUP_STICKY_TOP, left: geometry.left, width: geometry.width, height: geometry.headerHeight }}>
      <div style={{ width: POSITION_MATCHUP_TABLE_WIDTH, transform: `translateX(${-geometry.scrollLeft}px)` }}>
        <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width: POSITION_MATCHUP_TABLE_WIDTH }}>
          <TableColumns />
          <TableHeader sort={sort} onSortChange={onSortChange} clone cloneScrollLeft={geometry.scrollLeft} groupHeight={geometry.groupHeight} />
        </table>
      </div>
    </div>}
    <DenseTableScroller label={scrollLabel} scrollRef={scrollRef} className="rounded-lg border border-slate-200 bg-white">
      {/* Fixed layout needs both an explicit table width and colgroup widths. The
          grouped cells span three columns and cannot define column geometry. */}
      <table className="table-fixed border-separate border-spacing-0 text-sm" data-table-width={POSITION_MATCHUP_TABLE_WIDTH} style={{ width: POSITION_MATCHUP_TABLE_WIDTH }}>
        <TableColumns />
        <TableHeader sort={sort} onSortChange={onSortChange} headRef={headRef} />
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
    </div>
  );
}
