import { cn } from "@/lib/utils";

export interface CategoryTabDef<TId extends string> {
  id: TId;
  label: string;
  disabled?: boolean;
  title?: string;
}

export default function CategoryTabBar<TId extends string>({ tabs, value, onChange }: {
  tabs: CategoryTabDef<TId>[];
  value: TId;
  onChange: (value: TId) => void;
}) {
  return (
    <div role="tablist" aria-label="Category" className="flex flex-wrap gap-1">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={tab.disabled}
            title={tab.title}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
              active
                ? "border-slate-900 bg-slate-900 text-white"
                : tab.disabled
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
