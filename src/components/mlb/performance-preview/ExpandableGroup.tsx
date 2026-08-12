import type { ReactNode } from "react";

interface ExpandableGroupProps {
  title: string;
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function ExpandableGroup({ title, summary, children, defaultOpen = false }: ExpandableGroupProps) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="font-bold text-slate-900">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{summary}</div>
        </div>
        <span className="shrink-0 rounded-full border border-slate-300 px-2 py-1 text-xs font-bold text-slate-500 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}
