import { cn } from "@/lib/utils";

export type ResultFilterValue = "all" | "hit" | "miss";

const OPTIONS: { value: ResultFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hit", label: "Hit" },
  { value: "miss", label: "Miss" },
];

export default function ResultFilter({ value, onChange }: { value: ResultFilterValue; onChange: (value: ResultFilterValue) => void }) {
  return (
    <div className="inline-flex rounded-full border border-slate-300 bg-white p-0.5 text-xs font-bold">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-3 py-1 transition",
            value === option.value ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
