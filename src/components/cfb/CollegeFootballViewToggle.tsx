import { cn } from "@/lib/utils";

export type CfbLandingView = "top25" | "conferences";

type Props = {
  value: CfbLandingView;
  onChange: (next: CfbLandingView) => void;
};

const OPTIONS: { id: CfbLandingView; label: string }[] = [
  { id: "top25", label: "Top 25" },
  { id: "conferences", label: "Conferences" },
];

/** Compact segmented control for landing view. */
export default function CollegeFootballViewToggle({ value, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="College Football view"
      className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
    >
      {OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
              selected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
