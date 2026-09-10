/**
 * Universal NFL player/opponent Last-10 history table shell.
 *
 * Owns all reusable table presentation -- desktop table shell, optional
 * compact mobile table, header/row/footer rendering, horizontal scrolling,
 * and empty-state handling. Shared by the NFL Yardage Prop Preview and the
 * NFL DFS Calculator's expanded player history so neither duplicates
 * `<table>` markup; each consumer instead supplies a small column
 * configuration (see `NflHistoryColumn`) describing its own domain-specific
 * fields. Visual style follows the Yardage Prop Preview's original table --
 * the preferred design -- which both consumers now share.
 *
 * Two optional presentation hooks keep the Yardage Prop Preview's newer
 * behaviour on this shared shell rather than a bespoke `<table>`:
 *   - `prefixRow` + per-column `prefixRender` render one non-data reference
 *     row above the history rows (the Yardage "This Week" upcoming-matchup
 *     row). Omitted entirely when `prefixRow` is not supplied.
 *   - `compact` tightens desktop cell padding for the side-by-side
 *     player/opponent comparison; mobile presentation is unaffected.
 */
import type { ReactNode } from "react";
import { DenseTableScroller } from "@/components/ui/dense-table";

export type NflHistoryColumn<TRow> = {
  key: string;
  header: ReactNode;
  /** Extra classes on the <th>/<td>, e.g. accent-column borders/background. */
  className?: string;
  /** Extra classes on the <th> only, e.g. `whitespace-normal` two-line headers or narrow min/max width on space-hungry columns. */
  headerClassName?: string;
  render: (row: TRow) => ReactNode;
  /** Cell shown in the totals/averages footer row for this column; omitted columns render an empty footer cell. */
  footer?: ReactNode;
  /** Cell shown in the optional `prefixRow` reference row for this column; omitted columns render an empty prefix cell. */
  prefixRender?: () => ReactNode;
};

export type NflHistoryMobileColumn<TRow> = {
  key: string;
  header: ReactNode;
  /** Tailwind width utility for this column's <col>, e.g. "w-[17%]". */
  width: string;
  align?: "left" | "center";
  render: (row: TRow) => ReactNode;
  /** Cell shown in the optional `prefixRow` reference row for this column. */
  prefixRender?: () => ReactNode;
};

/** Styling for the optional non-data reference row rendered above the history rows. */
export type NflHistoryPrefixRow = {
  /** Class on the desktop <tr>. */
  className?: string;
  /** Class on the compact mobile <tr>. */
  mobileClassName?: string;
};

export function NflHistoryTable<TRow>({
  title,
  rows,
  rowKey,
  columns,
  mobileColumns,
  footerLabel,
  footerLabelColSpan = 1,
  scrollLabel,
  minWidthClassName = "min-w-[820px]",
  emptyMessage,
  prefixRow,
  compact = false,
}: {
  title?: ReactNode;
  rows: readonly TRow[];
  rowKey: (row: TRow) => string;
  columns: readonly NflHistoryColumn<TRow>[];
  /** Optional compact single-screen table shown below `md`; omit to always use the desktop table. */
  mobileColumns?: readonly NflHistoryMobileColumn<TRow>[];
  /** Label spanning the leading columns in the footer totals row. */
  footerLabel?: ReactNode;
  footerLabelColSpan?: number;
  scrollLabel: string;
  minWidthClassName?: string;
  emptyMessage?: ReactNode;
  /** When provided, one non-data reference row is rendered above the history rows using each column's `prefixRender`. */
  prefixRow?: NflHistoryPrefixRow | null;
  /** Tighten desktop cell padding for side-by-side comparison layouts. Mobile presentation is unaffected. */
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white px-3 py-4 text-[11px] text-slate-400">
        {emptyMessage ?? "No history available."}
      </div>
    );
  }

  const cellPad = compact ? "px-1.5 py-1" : "px-2 py-1.5";

  return (
    <div className="space-y-2">
      {title != null && <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{title}</h4>}

      {mobileColumns != null && (
        <div className="overflow-hidden rounded-md border-2 border-slate-400 bg-white md:hidden">
          <table className="w-full table-fixed border-collapse text-[10px]">
            <colgroup>
              {mobileColumns.map((column) => (
                <col key={column.key} className={column.width} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b-2 border-slate-300 bg-slate-200/70 text-left text-[8px] font-bold uppercase tracking-wide text-slate-600">
                {mobileColumns.map((column) => (
                  <th key={column.key} className={`px-1 py-1.5 ${column.align === "center" ? "text-center" : ""}`}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prefixRow != null && (
                <tr className={prefixRow.mobileClassName ?? "border-b-2 border-slate-300"}>
                  {mobileColumns.map((column) => (
                    <td key={column.key} className={`px-1 py-1.5 ${column.align === "center" ? "text-center" : ""}`}>
                      {column.prefixRender?.() ?? null}
                    </td>
                  ))}
                </tr>
              )}
              {rows.map((row) => (
                <tr key={`m-${rowKey(row)}`} className="border-b border-slate-100 last:border-b-0">
                  {mobileColumns.map((column) => (
                    <td key={column.key} className={`px-1 py-1.5 ${column.align === "center" ? "text-center" : ""} tabular-nums text-slate-700`}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DenseTableScroller
        label={scrollLabel}
        className={mobileColumns != null ? `hidden rounded-md border-2 border-slate-400 bg-white md:block` : "max-w-full overflow-x-auto rounded-md border-2 border-slate-400 bg-white"}
      >
        <table className={`w-full ${minWidthClassName} border-collapse text-[11px]`}>
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-200/70 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {columns.map((column) => (
                <th key={column.key} className={`${cellPad} ${column.className ?? ""} ${column.headerClassName ?? ""}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prefixRow != null && (
              <tr className={prefixRow.className ?? "border-b-2 border-slate-300"}>
                {columns.map((column) => (
                  <td key={column.key} className={`${cellPad} ${column.className ?? ""}`}>
                    {column.prefixRender?.() ?? null}
                  </td>
                ))}
              </tr>
            )}
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-slate-100 last:border-b-0">
                {columns.map((column) => (
                  <td key={column.key} className={`${cellPad} ${column.className ?? ""}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footerLabel !== undefined && (
            <tfoot>
              <tr className="border-t-2 border-slate-400 bg-slate-200/60 font-bold text-slate-700">
                <td className={`${cellPad} uppercase tracking-wide text-[10px]`} colSpan={footerLabelColSpan}>
                  {footerLabel}
                </td>
                {columns.slice(footerLabelColSpan).map((column) => (
                  <td key={column.key} className={`${cellPad} ${column.className ?? ""}`}>
                    {column.footer ?? null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </DenseTableScroller>
    </div>
  );
}
