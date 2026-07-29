import { XCircle } from "lucide-react";
import Logo from "@/components/ui/Logo";

const SUMMARY_ROWS: ReadonlyArray<{ label: string; value: string; isOutcome?: boolean }> = [
  { label: "Final record", value: "11-3" },
  { label: "Regular season", value: "10-3" },
  { label: "Playoff outcome", value: "Eliminated in Semifinal", isOutcome: true },
  { label: "Draft position", value: "Pick 9" },
  { label: "Average weekly score", value: "123.3" },
];

export function HeroProductPreview() {
  return (
    <div
      aria-hidden="true"
      data-hero-preview
      className="hidden rounded-3xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl shadow-black/40 backdrop-blur lg:block"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
          Example Season Summary
        </span>
        <div className="flex items-center gap-1.5">
          <Logo width={16} className="brightness-0 invert" />
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            JoeKnowsBall
          </span>
        </div>
      </div>

      <p className="mt-1 text-[10px] text-slate-600">Sample result · not an actual result</p>

      <dl className="mt-4 divide-y divide-white/[0.08] rounded-xl border border-white/10 bg-white/[0.03]">
        {SUMMARY_ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-[0.8125rem] text-slate-400">{row.label}</dt>
            <dd
              className={`flex items-center gap-1.5 text-right text-[0.8125rem] font-black ${
                row.isOutcome ? "text-rose-300" : "text-white"
              }`}
            >
              {row.isOutcome && <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
