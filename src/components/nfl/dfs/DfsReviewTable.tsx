import type { ReactNode } from "react";

export type DfsReviewTableRow = { id: string; label: string; value: ReactNode };

/**
 * Dense Metric | Value mini-table for the expanded Player Review. Label and value sit
 * on the same short row (value right-aligned) instead of stretching across a card.
 * `min-w-0` + `overflow-hidden` keep long values from widening the DFS page.
 */
export function DfsReviewTable({ label, rows }: { label: string; rows: readonly DfsReviewTableRow[] }) {
  return (
    <section aria-label={label} className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <h4 className="border-b border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</h4>
      <table className="w-full table-fixed border-collapse text-[11px] leading-4">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
              <th scope="row" className="w-1/2 truncate px-2 py-px text-left font-medium text-slate-500">{row.label}</th>
              <td className="px-2 py-px text-right font-semibold text-slate-900">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** One dense strip of label/value pairs, for short supplemental fields. */
export function DfsReviewStrip({ label, rows, emptyMessage }: { label: string; rows: readonly DfsReviewTableRow[]; emptyMessage?: string }) {
  return (
    <section aria-label={label} className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] leading-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</h4>
        {rows.map((row) => (
          <span key={row.id} className="whitespace-nowrap">
            <span className="text-slate-500">{row.label}</span>{" "}
            <span className="font-semibold text-slate-900">{row.value}</span>
          </span>
        ))}
        {emptyMessage && <span className="text-slate-500">{emptyMessage}</span>}
      </div>
    </section>
  );
}
