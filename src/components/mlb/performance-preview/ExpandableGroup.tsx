import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ExpandableGroupProps {
  title: string;
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Left accent bar + tinted title color, e.g. "border-l-sky-400 text-sky-900" -- keeps each score band/category visually distinct without a wall of gray boxes. */
  accentClassName?: string;
}

export default function ExpandableGroup({ title, summary, children, defaultOpen = false, accentClassName }: ExpandableGroupProps) {
  return (
    <details className={cn("group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm", accentClassName && "border-l-4")} open={defaultOpen}>
      <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden", accentClassName)}>
        <div className="min-w-0">
          <div className="font-bold text-slate-900">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{summary}</div>
        </div>
        <span className="shrink-0 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-500 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}
