import { TIME_WINDOWS, type TimeWindowId } from "@/lib/mlb/performancePreviewWindows";
import { cn } from "@/lib/utils";

export default function TimeWindowToggle({ value, onChange, accentClassName = "bg-slate-900" }: {
  value: TimeWindowId;
  onChange: (value: TimeWindowId) => void;
  accentClassName?: string;
}) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-sm">
      {TIME_WINDOWS.map((window) => (
        <button
          key={window.id}
          type="button"
          aria-pressed={value === window.id}
          onClick={() => onChange(window.id)}
          className={cn(
            "rounded-full px-3 py-1.5 transition",
            value === window.id ? cn(accentClassName, "text-white shadow-sm") : "text-slate-500 hover:text-slate-900",
          )}
        >
          {window.label}
        </button>
      ))}
    </div>
  );
}
