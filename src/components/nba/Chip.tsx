import { cn } from "@/lib/utils";

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500", active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
    >
      {children}
    </button>
  );
}

export const fieldClass = "rounded border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500";
