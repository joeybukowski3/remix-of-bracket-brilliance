import type { ReactNode } from "react";
import {
  MATCHUP_EYEBROW,
  MATCHUP_SECTION_SUB,
  MATCHUP_SECTION_TITLE,
} from "@/components/nfl/matchups/matchupTypography";
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
  "rounded-[14px] border border-slate-300 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.04)]";

/** Small coloured label above the title. Names the section's role, not its data. */
export { MATCHUP_EYEBROW as MATCHUP_CARD_EYEBROW } from "@/components/nfl/matchups/matchupTypography";

/** Section title: larger and heavier than the body it heads. */
export { MATCHUP_SECTION_TITLE as MATCHUP_CARD_TITLE } from "@/components/nfl/matchups/matchupTypography";

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
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={MATCHUP_EYEBROW}>{eyebrow}</div>
            <h2 id={titleId} className={`mt-1 ${MATCHUP_SECTION_TITLE}`}>
              {title}
            </h2>
            {subtitle && (
              <p className={`mt-1 ${MATCHUP_SECTION_SUB}`}>{subtitle}</p>
            )}
          </div>
          {headerAside && <div className="flex shrink-0 items-center gap-2">{headerAside}</div>}
        </div>
      </div>

      <div className={cn("px-4 pb-5 sm:px-5", bodyClassName)}>{children}</div>
    </section>
  );
}
