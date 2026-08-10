import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function CollegeFootballPageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("border-b border-slate-200 pb-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {title}
          </h1>
          {description && (
            <div className="mt-1.5 max-w-3xl text-[13px] leading-5 text-slate-600">
              {description}
            </div>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </header>
  );
}
