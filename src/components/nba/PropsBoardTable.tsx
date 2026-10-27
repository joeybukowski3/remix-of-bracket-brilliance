import { Fragment, useId, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { DenseTableScroller, frozenDenseColumn } from "@/components/ui/dense-table";
import { cn } from "@/lib/utils";
import { ROW_FOCUS, rowToggleHandlers } from "@/components/nba/rowToggle";
import { playerOverrideKey, type MinutesDrafts } from "@/lib/nba/props/minutesOverride";
import type { BoardMarket, BoardRow, BoardSortKey, SortDirection } from "@/lib/nba/props/propsBoard";
import type { ColumnId } from "@/lib/nba/props/boardColumns";
import { ALIGN_CLASS, COLUMN_DEFS, type CellContext, type ColumnDef } from "@/components/nba/boardColumnDefs";
import PropsRowDetail from "@/components/nba/PropsRowDetail";
import TeamLogo from "@/components/nba/TeamLogo";
import { PLAYER_WASH_AMOUNT, brandFor, tintOnWhite } from "@/lib/nba/props/teamBrand";

/** "L10 PTS" is "L10" and "JKB proj" is "JKB" on a phone: the market chips above already say which stat, and the header would not fit otherwise. */
function HeaderLabel({ label }: { label: string }) {
  const match = /^(.+?) (PTS|REB|AST|proj)$/.exec(label);
  return match ? (
    <>
      {match[1]} <span className="max-md:sr-only">{match[2]}</span>
    </>
  ) : (
    <>{label}</>
  );
}

function HeaderButton({ label, sortKey, active, direction, onSort, align }: { label: string; sortKey: BoardSortKey; active: boolean; direction: SortDirection; onSort: (key: BoardSortKey) => void; align: ColumnDef["align"] }) {
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap text-center uppercase tracking-wider max-md:whitespace-normal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300", align === "center" && "w-full justify-center")}
    >
      <HeaderLabel label={label} />
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

const HEADER = "border-b-2 border-slate-950 px-1.5 py-2.5 font-bold md:px-2 lg:px-2.5";
/** Header row: dark navy-slate with white lettering, so it stays separate from the pale rows beneath at any scroll position. */
const HEAD_ROW = "bg-slate-900 text-[10px] font-semibold uppercase tracking-wider text-white";
/** Body rows: a visible hairline between rows, and a hover wash that does not hide the team color. The whole row opens its detail. */
const BODY_ROW = cn("group border-t border-slate-200 transition-colors hover:bg-sky-50/60", ROW_FOCUS);
/** A phone shows only the `mobile` columns; a tablet shows all but the `fromLarge` ones. */
const hiddenOnSmall = (def: ColumnDef): string => (def.mobile ? "" : def.fromLarge ? "hidden lg:table-cell" : "hidden md:table-cell");

function PlayerCell({ row, expanded, detailId }: { row: BoardRow; expanded: boolean; detailId: string }) {
  const { entry, dvp } = row;
  const multi = dvp.kind === "ok" && dvp.isMultiPosition;
  const brand = brandFor(entry.team);
  // The wash is opaque (tinted white, not transparent) so the frozen column never shows what scrolls beneath it.
  const style = { backgroundImage: `linear-gradient(90deg, ${tintOnWhite(brand.primary, PLAYER_WASH_AMOUNT)} 0%, #FFFFFF 100%)`, borderLeft: `5px solid ${brand.primary}` };
  return (
    <th scope="row" style={style} data-testid="player-cell" className={frozenDenseColumn({ className: "border-r border-slate-200 py-1.5 pl-1 pr-1.5 text-left font-medium text-slate-900 group-hover:brightness-[0.96] md:pr-2" })}>
      <div className="flex items-center gap-1 md:gap-1.5">
        {/* The row handles the click (rowToggle.ts); the chevron stays a real, named button for assistive technology but the row is the tab stop. */}
        <button
          type="button"
          tabIndex={-1}
          data-row-toggle
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          aria-label={`${expanded ? "Hide" : "Show"} details and minutes for ${entry.playerName}`}
          data-testid="row-toggle"
          className="inline-flex h-8 w-5 shrink-0 items-center justify-center rounded text-slate-700 md:w-6 hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <ChevronRight size={15} aria-hidden className={cn("transition-transform", expanded && "rotate-90")} />
        </button>
        <TeamLogo team={entry.team} className="h-9 w-9 md:h-10 md:w-10" />
        <div className="min-w-0">
          <div className="text-[13px] font-bold leading-tight text-slate-950 md:whitespace-nowrap md:text-[14px]">
            <span data-testid="player-name">{entry.playerName}</span>
            {row.override.userMinutes !== null ? (
              <span data-testid="override-chip" className="ml-1.5 rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-semibold text-indigo-900" title="Your minutes are applied to this player. Open the row to see the adjusted projection.">
                {row.override.userMinutes.toFixed(1)} min
              </span>
            ) : null}
          </div>
          <div className="text-[10px] font-normal leading-tight text-slate-700 md:whitespace-nowrap">
            <strong className="font-bold text-slate-900">{entry.team ?? "—"}</strong> {entry.opponent ? `vs ${entry.opponent}` : ""}
            <span className="max-md:hidden"> · </span>
            {entry.positionLabel ? (
              <span className="max-md:block" title={multi ? `Multi-position label; DvP uses ${dvp.kind === "ok" ? dvp.position : ""}. Estimated, not verified minutes at a position.` : "Estimated position from depth charts and rotation roles, not verified minutes at a position."}>
                {entry.positionLabel}
                {multi && dvp.kind === "ok" ? ` → ${dvp.position}` : ""} <span className="text-slate-500">(est.)</span>
              </span>
            ) : (
              <span className="max-md:block" title="No estimated position for this player">pos N/A</span>
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
    <DenseTableScroller label={`${marketLabel} player props: recent form, opponent defense vs. position and JKB projections`} className="rounded-lg border border-slate-300 bg-white shadow-sm">
      <table className="w-full border-separate border-spacing-0 text-[11px] md:text-[12px]" data-testid="props-board-table">
        <thead>
          <tr className={HEAD_ROW}>
            <th scope="col" aria-sort={ariaSort("player")} className={frozenDenseColumn({ isHeader: true, surface: "bg-slate-900", className: `${HEADER} border-r border-slate-700 text-left` })}>
              <HeaderButton label="Player" sortKey="player" active={sortKey === "player"} direction={direction} onSort={onSort} align="left" />
            </th>
            {defs.map((def) => (
              <th key={def.id} scope="col" aria-sort={def.sortKey ? ariaSort(def.sortKey) : undefined} title={def.title(market)} data-testid={`head-${def.id}`} className={cn(HEADER, ALIGN_CLASS[def.align ?? "center"], hiddenOnSmall(def), def.headClass)}>
                {def.sortKey ? <HeaderButton label={def.label(market)} sortKey={def.sortKey} active={sortKey === def.sortKey} direction={direction} onSort={onSort} align={def.align ?? "center"} /> : <span className="whitespace-nowrap uppercase tracking-wider"><HeaderLabel label={def.label(market)} /></span>}
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
                <tr className={cn(BODY_ROW, open && "bg-sky-50/40")} tabIndex={0} aria-expanded={open} aria-controls={open ? detailId : undefined} data-testid="board-row" {...rowToggleHandlers(() => toggle(entry.entryKey))}>
                  <PlayerCell row={row} expanded={open} detailId={detailId} />
                  {defs.map((def) => (
                    <td key={def.id} data-testid={`col-${def.id}`} className={cn("px-1.5 py-2 md:px-2 lg:px-2.5", ALIGN_CLASS[def.align ?? "center"], hiddenOnSmall(def), def.cellClass?.(ctx))}>
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
