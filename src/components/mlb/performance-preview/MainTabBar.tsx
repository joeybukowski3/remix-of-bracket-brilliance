import { cn } from "@/lib/utils";

export interface MainTabDef<TId extends string> {
  id: TId;
  label: string;
}

export default function MainTabBar<TId extends string>({ tabs, value, onChange }: {
  tabs: MainTabDef<TId>[];
  value: TId;
  onChange: (value: TId) => void;
}) {
  return (
    <div role="tablist" aria-label="MLB model" className="flex gap-0.5 overflow-x-auto rounded-lg bg-slate-900 p-1">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-3 py-2 text-xs font-black uppercase tracking-wide transition",
              active ? "bg-sky-400 text-slate-900 shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
