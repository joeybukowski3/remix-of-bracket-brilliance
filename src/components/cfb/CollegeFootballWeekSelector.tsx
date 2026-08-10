import { cn } from "@/lib/utils";

type Props = {
  weeks: number[];
  value: number;
  onChange: (week: number) => void;
};

export default function CollegeFootballWeekSelector({ weeks, value, onChange }: Props) {
  if (weeks.length === 0) {
    return (
      <p className="text-sm text-slate-500">No schedule weeks available.</p>
    );
  }

  return (
    <div role="group" aria-label="Select week" className="flex flex-wrap gap-1.5">
      {weeks.map((week) => {
        const selected = week === value;
        return (
          <button
            key={week}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(week)}
            className={cn(
              "rounded border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
              selected
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
            )}
          >
            Week {week}
          </button>
        );
      })}
    </div>
  );
}
