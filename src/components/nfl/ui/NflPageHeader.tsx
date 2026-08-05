import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The single page-header treatment for the NFL platform.
 *
 * Before this existed the section carried five different header styles — an
 * inline-CSS hero on the power ratings page, two Tailwind eyebrow blocks with
 * different accent colours, and two full-bleed dark gradient banners. They read
 * as five products. The eyebrow is deliberately neutral: page identity comes
 * from the title, not from a per-page accent colour.
 */
export default function NflPageHeader({
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
  /** Right-aligned header slot on desktop (e.g. a "back to" link or CTA). */
  actions?: ReactNode;
  /** Controls that belong to the page as a whole (season pickers, filters). */
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
