import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export interface MobileModelPreviewAccordionProps {
  value: string;
  icon: ReactNode;
  title: string;
  description?: string;
  freshness?: string;
  viewFullHref?: string;
  viewFullLabel?: string;
  children: ReactNode;
  className?: string;
  /** Tint + icon color for the icon chip, e.g. "bg-amber-100 text-amber-700". Defaults to a neutral slate tint. */
  iconClassName?: string;
}

/**
 * Shared mobile "collapsed model preview" accordion item. Used by the
 * Today's Top Model Edges group, Polymarket Moneylines, and Social Media
 * Tables so all three sections share one accessible disclosure pattern
 * (Radix Accordion already wires aria-expanded/aria-controls) instead of
 * five/three bespoke implementations.
 */
export function MobileModelPreviewAccordion({
  value,
  icon,
  title,
  description,
  freshness,
  viewFullHref,
  viewFullLabel = "View Full Model",
  children,
  className,
  iconClassName,
}: MobileModelPreviewAccordionProps) {
  const isHashLink = viewFullHref?.startsWith("#");

  return (
    <AccordionItem
      value={value}
      className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm", className)}
    >
      <AccordionTrigger className="gap-3 px-4 py-3 text-left hover:no-underline">
        <span className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", iconClassName ?? "bg-slate-100 text-slate-700")}>
            {icon}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold text-[#031635]">{title}</span>
            {description ? (
              <span className="mt-0.5 block text-[11px] font-medium leading-4 text-slate-600">{description}</span>
            ) : null}
            {freshness ? (
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {freshness}
              </span>
            ) : null}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-0 pb-0 pt-0">
        {children}
        {viewFullHref ? (
          isHashLink ? (
            <a
              href={viewFullHref}
              className="block border-t border-slate-200 px-4 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 hover:underline"
            >
              {viewFullLabel} →
            </a>
          ) : (
            <Link
              to={viewFullHref}
              className="block border-t border-slate-200 px-4 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 hover:underline"
            >
              {viewFullLabel} →
            </Link>
          )
        ) : null}
      </AccordionContent>
    </AccordionItem>
  );
}
