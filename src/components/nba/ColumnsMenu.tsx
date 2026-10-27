import { Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { COLUMN_IDS, DEFAULT_COLUMNS, needsSeasonStats, type ColumnId } from "@/lib/nba/props/boardColumns";
import type { BoardMarket } from "@/lib/nba/props/propsBoard";
import { COLUMN_DEFS, COLUMN_GROUP_LABEL, type ColumnGroup } from "@/components/nba/boardColumnDefs";

const GROUPS: readonly ColumnGroup[] = ["season", "matchup", "jkb", "minutes"];

interface ColumnsMenuProps {
  market: BoardMarket;
  selected: ReadonlySet<ColumnId>;
  hasSeasonStats: boolean;
  onToggle: (id: ColumnId, on: boolean) => void;
  onReset: () => void;
}

/** Checkbox list of the optional table columns. It changes what is shown, never a number. */
export default function ColumnsMenu({ market, selected, hasSeasonStats, onToggle, onReset }: ColumnsMenuProps) {
  const shown = COLUMN_IDS.filter((id) => selected.has(id) && (hasSeasonStats || !needsSeasonStats(id))).length;
  const isDefault = DEFAULT_COLUMNS.length === selected.size && DEFAULT_COLUMNS.every((id) => selected.has(id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="columns-menu-trigger"
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <Columns3 size={14} aria-hidden />
          Columns
          <span className="font-normal text-slate-500">({shown})</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(70vh,var(--radix-popover-content-available-height))] w-72 overflow-y-auto p-3" aria-label="Choose table columns">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-slate-600">The player column is always shown. Your choice stays in this browser.</p>
          <button
            type="button"
            data-testid="columns-reset"
            onClick={onReset}
            disabled={isDefault}
            className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Default
          </button>
        </div>
        {GROUPS.map((group) => {
          const ids = COLUMN_IDS.filter((id) => COLUMN_DEFS[id].group === group);
          return (
            <fieldset key={group} className="mb-2 min-w-0 border-0 p-0">
              <legend className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{COLUMN_GROUP_LABEL[group]}</legend>
              {ids.map((id) => {
                const disabled = !hasSeasonStats && needsSeasonStats(id);
                const def = COLUMN_DEFS[id];
                return (
                  <label key={id} title={disabled ? "Needs season statistics, which this board does not carry" : def.title(market)} className={cn("flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[12px] text-slate-800 hover:bg-slate-50", disabled && "cursor-not-allowed opacity-40")}>
                    <input type="checkbox" checked={selected.has(id) && !disabled} disabled={disabled} onChange={(e) => onToggle(id, e.target.checked)} data-testid={`column-toggle-${id}`} />
                    {def.label(market)}
                    {DEFAULT_COLUMNS.includes(id) ? <span className="text-[10px] text-slate-400">default</span> : null}
                  </label>
                );
              })}
            </fieldset>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
