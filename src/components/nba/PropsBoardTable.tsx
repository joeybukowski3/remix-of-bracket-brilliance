import { Fragment, useId, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller, frozenDenseColumn } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { playerOverrideKey, type MinutesDrafts } from "@/lib/nba/props/minutesOverride";
import type { BoardMarket, BoardRow, BoardSortKey, SortDirection } from "@/lib/nba/props/propsBoard";
import type { ColumnId } from "@/lib/nba/props/boardColumns";
import { ALIGN_CLASS, COLUMN_DEFS, type CellContext, type ColumnDef } from "@/components/nba/boardColumnDefs";
import PropsRowDetail from "@/components/nba/PropsRowDetail";

function HeaderButton({ label, sortKey, active, direction, onSort, align }: { label: string; sortKey: BoardSortKey; active: boolean; direction: SortDirection; onSort: (key: BoardSortKey) => void; align: ColumnDef["align"] }) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wider hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500", align === "right" && "w-full justify-end", align === "center" && "w-full justify-center")}
    >
      {label}
      {active ? direction === "asc" ? <ArrowUp size={10} aria-hidden /> : <ArrowDown size={10} aria-hidden /> : null}
    </button>
  );
}

export interface PropsBoardTableProps {
  rows: BoardRow[];
  sortKey: BoardSortKey;
  direction: SortDirection;
  onSort: (key: BoardSortKey) => void;
  market: BoardMarket;
  marketLabel: string;
  drafts: MinutesDrafts;
  onDraftChange: (key: string, text: string) => void;
  onReset: (key: string) => void;
  /** True when any row has season statistics (a private preview board). */
  showSeason: boolean;
  /** The optional columns to show, in display order. The player column is always first. */
  columns: readonly ColumnId[];
  /** False below the md breakpoint, where table columns other than a few are hidden: the row detail then holds the minutes field. */
  isWide: boolean;
}

const HEADER = "border-b border-slate-300 px-2.5 py-2 font-bold text-slate-700";
const hiddenOnPhone = (def: ColumnDef): string => (def.mobile ? "" : "hidden md:table-cell");

function PlayerCell({ row, expanded, detailId, onToggle }: { row: BoardRow; expanded: boolean; detailId: string; onToggle: () => void }) {
  const { entry, dvp } = row;
  const multi = dvp.kind === "ok" && dvp.isMultiPosition;
  return (
    <th scope="row" className={frozenDenseColumn({ surface: "bg-white", className: "border-r border-slate-200 px-2 py-2 text-left font-medium text-slate-900" })}>
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          aria-label={`${expanded ? "Hide" : "Show"} details and minutes for ${entry.playerName}`}
          data-testid="row-toggle"
          className="-ml-1 inline-flex h-8 w-7 shrink-0 items-center justify-center rounded text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <ChevronRight size={15} aria-hidden className={cn("transition-transform", expanded && "rotate-90")} />
        </button>
        <div className="min-w-0 pt-0.5">
          <div className="md:whitespace-nowrap">
            <span data-testid="player-name">{entry.playerName}</span>
            {row.override.userMinutes !== null ? (
              <span data-testid="override-chip" className="ml-1.5 rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-semibold text-indigo-900" title="Your minutes are applied to this player. Open the row to see the adjusted projection.">
                {row.override.userMinutes.toFixed(1)} min
              </span>
            ) : null}
          </div>
          <div className="text-[10px] font-normal text-slate-600 md:whitespace-nowrap">
            {entry.team ?? "—"} {entry.opponent ? `vs ${entry.opponent}` : ""} ·{" "}
            {entry.positionLabel ? (
              <span title={multi ? `Multi-position label; DvP uses ${dvp.kind === "ok" ? dvp.position : ""}. Estimated, not verified minutes at a position.` : "Estimated position from depth charts and rotation roles, not verified minutes at a position."}>
                {entry.positionLabel}
                {multi && dvp.kind === "ok" ? ` → ${dvp.position}` : ""} <span className="text-slate-500">(est.)</span>
              </span>
            ) : (
              <span title="No estimated position for this player">pos N/A</span>
            )}
          </div>
        </div>
      </div>
    </th>
  );
}

export default function PropsBoardTable({ rows, sortKey, direction, onSort, market, marketLabel, drafts, onDraftChange, onReset, showSeason, columns, isWide }: PropsBoardTableProps) {
  const tableId = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const defs = columns.map((id) => COLUMN_DEFS[id]);
  const minutesInTable = isWide && columns.includes("userMinutes");
  const ariaSort = (key: BoardSortKey) => (sortKey === key ? (direction === "asc" ? "ascending" : "descending") : "none");
  return (
    <DenseTableScroller label={`${marketLabel} player props: recent form, opponent defense vs. position and JKB projections`} className="rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-separate border-spacing-0 text-[11px] md:text-[12px]" data-testid="props-board-table">
        <thead>
          <tr className={DENSE_TABLE_HEAD_ROW}>
            <th scope="col" aria-sort={ariaSort("player")} className={frozenDenseColumn({ isHeader: true, surface: "bg-slate-100", className: `${HEADER} border-r border-slate-300 text-left` })}>
              <HeaderButton label="Player" sortKey="player" active={sortKey === "player"} direction={direction} onSort={onSort} align="left" />
            </th>
            {defs.map((def) => (
              <th key={def.id} scope="col" aria-sort={def.sortKey ? ariaSort(def.sortKey) : undefined} title={def.title(market)} data-testid={`head-${def.id}`} className={cn(HEADER, ALIGN_CLASS[def.align ?? "right"], hiddenOnPhone(def), def.headClass)}>
                {def.sortKey ? <HeaderButton label={def.label(market)} sortKey={def.sortKey} active={sortKey === def.sortKey} direction={direction} onSort={onSort} align={def.align ?? "right"} /> : <span className="whitespace-nowrap uppercase tracking-wider">{def.label(market)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={defs.length + 1} className="px-3 py-8 text-center text-slate-600">
                No {marketLabel} props match these filters.
              </td>
            </tr>
          ) : null}
          {rows.map((row, index) => {
            const { entry } = row;
            const key = playerOverrideKey(entry);
            const open = expanded.has(entry.entryKey);
            const detailId = `${tableId}-detail-${index}`;
            const ctx: CellContext = { row, market, draft: drafts[key] ?? "", onDraftChange: (text) => onDraftChange(key, text), onReset: () => onReset(key) };
            return (
              <Fragment key={entry.entryKey}>
                <tr className={DENSE_TABLE_ROW}>
                  <PlayerCell row={row} expanded={open} detailId={detailId} onToggle={() => toggle(entry.entryKey)} />
                  {defs.map((def) => (
                    <td key={def.id} data-testid={`col-${def.id}`} className={cn("px-2.5 py-2", ALIGN_CLASS[def.align ?? "right"], hiddenOnPhone(def), def.cellClass?.(ctx))}>
                      {def.render(ctx)}
                    </td>
                  ))}
                </tr>
                {open ? (
                  <tr id={detailId} data-testid="row-detail" className="bg-slate-50">
                    <td colSpan={defs.length + 1} className="border-t border-slate-100 p-0">
                      <PropsRowDetail ctx={ctx} minutesInTable={minutesInTable} hasSeasonStats={showSeason} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </DenseTableScroller>
  );
}
