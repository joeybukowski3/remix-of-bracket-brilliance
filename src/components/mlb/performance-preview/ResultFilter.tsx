import { cn } from "@/lib/utils";

export type ResultFilterValue = "all" | "hit" | "miss";

const DEFAULT_LABELS: Record<ResultFilterValue, string> = { all: "All", hit: "Hit", miss: "Miss" };

interface ResultFilterProps {
  value: ResultFilterValue;
  onChange: (value: ResultFilterValue) => void;
  /** Override the "hit"/"miss" labels, e.g. {hit: "Win", miss: "Loss"} for K props. */
  labels?: Partial<Record<ResultFilterValue, string>>;
}

export default function ResultFilter({ value, onChange, labels }: ResultFilterProps) {
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels };
  return (
    <div className="inline-flex rounded-full border border-slate-300 bg-white p-0.5 text-xs font-bold">
      {(["all", "hit", "miss"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full px-3 py-1 transition",
            value === option ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900",
          )}
        >
          {resolvedLabels[option]}
        </button>
      ))}
    </div>
  );
}
