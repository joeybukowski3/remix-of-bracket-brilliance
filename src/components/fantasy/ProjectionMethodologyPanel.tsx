import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  PRODUCTION_METHODOLOGY_DISCLAIMERS,
  PRODUCTION_METHODOLOGY_GENERAL_SUMMARY,
  PRODUCTION_METHODOLOGY_POSITION_MATRIX,
  PRODUCTION_METHODOLOGY_WEEK1_NOTE,
  PRODUCTION_METHODOLOGY_WEEK2_NOTE,
} from "@/lib/fantasy/weekly/projections/production/methodology";
import { cn } from "@/lib/utils";

function Check({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", active ? "text-emerald-700" : "text-slate-400")}>
      <span aria-hidden>{active ? "✓" : "—"}</span>
      <span className="sr-only">{active ? `${label}: yes` : `${label}: no`}</span>
    </span>
  );
}

export default function ProjectionMethodologyPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border border-slate-200 bg-white text-xs text-slate-700">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="font-bold text-slate-950">How JKB Projections Work</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3 leading-5">
          <p>{PRODUCTION_METHODOLOGY_GENERAL_SUMMARY}</p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] border-collapse text-left text-[11px]">
              <caption className="sr-only">Active projection factors by position</caption>
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th scope="col" className="py-1 pr-2 font-semibold">Position</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">Baseline</th>
                  <th scope="col" className="py-1 pr-2 font-semibold">Usage</th>
                  <th scope="col" className="py-1 font-semibold">Team Context</th>
                </tr>
              </thead>
              <tbody>
                {PRODUCTION_METHODOLOGY_POSITION_MATRIX.map((row) => (
                  <tr key={row.position} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="py-1 pr-2 font-bold text-slate-900">{row.position}</th>
                    <td className="py-1 pr-2"><Check active={row.baseline} label="Baseline" /></td>
                    <td className="py-1 pr-2"><Check active={row.usage} label="Usage" /></td>
                    <td className="py-1"><Check active={row.teamContext} label="Team Context" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-1">
            {PRODUCTION_METHODOLOGY_POSITION_MATRIX.map((row) => (
              <li key={row.position}><span className="font-bold text-slate-900">{row.position}:</span> {row.summary}</li>
            ))}
          </ul>

          <p>{PRODUCTION_METHODOLOGY_WEEK1_NOTE}</p>
          <p>{PRODUCTION_METHODOLOGY_WEEK2_NOTE}</p>

          <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
            {PRODUCTION_METHODOLOGY_DISCLAIMERS.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
