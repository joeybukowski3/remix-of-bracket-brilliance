import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Section chrome for the matchup analyzer, defined once.
 *
 * The analyzer's sections were split across two shells — some rendered a plain
 * `<section>`, three went through `MatchupSection` → `NflSection` — so the card
 * treatment had no single home. These constants are that home: this component
 * uses them directly, and `MatchupSection` passes the same values down, so both
 * families share one definition instead of two that drift.
 *
 * Purely presentational. Nothing here reads, derives or formats a statistic.
 */

/**
 * Card surface: a stronger border and a soft two-layer shadow so the card lifts
 * off the darker page ground rather than sitting flush against it.
 */
export const MATCHUP_CARD_SURFACE =
  "rounded-xl border border-slate-300 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.07),0_1px_2px_rgba(15,23,42,0.04)]";

/** Small coloured label above the title. Names the section's role, not its data. */
export const MATCHUP_CARD_EYEBROW =
  "text-[10px] font-extrabold uppercase tracking-[0.08em] text-emerald-700";

/** Section title: larger and heavier than the body it heads. */
export const MATCHUP_CARD_TITLE =
  "text-[17px] font-extrabold leading-6 tracking-tight text-slate-900";

export default function MatchupSectionCard({
  id,
  eyebrow,
  title,
  titleId,
  subtitle,
  headerAside,
  className = "",
  bodyClassName = "",
  children,
}: {
  id?: string;
  /** Small coloured label above the title. */
  eyebrow: string;
  title: string;
  /** DOM id of the heading; the section is labelled by it. */
  titleId: string;
  subtitle?: ReactNode;
  /** Right-aligned header slot — a legend, a note or a disclosure control. */
  headerAside?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={titleId} className={cn(MATCHUP_CARD_SURFACE, className)}>
      <div className="border-b border-slate-100 px-2.5 py-1.5 sm:px-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={MATCHUP_CARD_EYEBROW}>{eyebrow}</div>
            <h2 id={titleId} className={MATCHUP_CARD_TITLE}>
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{subtitle}</p>
            )}
          </div>
          {headerAside && <div className="flex shrink-0 items-center gap-2">{headerAside}</div>}
        </div>
      </div>

      <div className={cn("px-2.5 py-2 sm:px-3", bodyClassName)}>{children}</div>
    </section>
  );
}
