import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one collapsible section primitive for the NFL platform.
 *
 * Every NFL surface that needs a titled block of content uses this, so the
 * section header, the collapse affordance and the accessible wiring
 * (`aria-expanded` / `aria-controls` on a real `<button>`, a labelled
 * `<section>`) are defined once instead of re-implemented per page.
 *
 * `collapse` controls where the affordance exists:
 *   - "mobile"  — collapsible below `lg`; desktop always renders the body and
 *                 hides the toggle. The default: desktop has the width to show
 *                 everything, and a collapsed desktop grid cell leaves holes.
 *   - "always"  — collapsible at every width.
 *   - "never"   — a plain titled section.
 *
 * The body stays mounted when collapsed (`hidden`, not unmounted) so in-page
 * anchors, find-in-page and crawlers still reach the content.
 */
export type NflSectionCollapseMode = "mobile" | "always" | "never";

export default function NflSection({
  id,
  title,
  eyebrow,
  subtitle,
  headerAside,
  headerExtra,
  collapse = "never",
  defaultOpen = true,
  headingLevel = 2,
  focusable = false,
  className = "",
  bodyClassName = "",
  children,
}: {
  id?: string;
  title: string;
  /** Small label above the title. Use sparingly — it is not a decoration slot. */
  eyebrow?: string;
  subtitle?: string;
  /** Right-aligned header slot (legend, source note, segmented control). */
  headerAside?: ReactNode;
  /** Full-width row under the header row, for controls that need the space. */
  headerExtra?: ReactNode;
  collapse?: NflSectionCollapseMode;
  defaultOpen?: boolean;
  headingLevel?: 2 | 3;
  /**
   * Makes the section a programmatic focus target. Set this when an in-page
   * anchor points at it, so following the link moves screen-reader focus onto
   * the section instead of leaving it stranded at the top of the document.
   */
  focusable?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reactId = useId();
  const bodyId = `${reactId}-body`;
  const headingId = `${reactId}-heading`;
  const Heading = headingLevel === 3 ? "h3" : "h2";

  const collapsible = collapse !== "never";
  // Below `lg` in "mobile" mode the toggle governs visibility; from `lg` up the
  // body is forced visible so a two-column grid never renders a half-empty row.
  const bodyHidden = collapsible && !open;
  const bodyVisibility = !bodyHidden
    ? "block"
    : collapse === "mobile"
      ? "hidden lg:block"
      : "hidden";

  return (
    <section
      id={id}
      tabIndex={focusable ? -1 : undefined}
      aria-labelledby={headingId}
      className={cn(
        "rounded-lg border border-slate-200 bg-white",
        focusable && "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
        className,
      )}
    >
      <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {eyebrow}
              </div>
            )}
            <Heading
              id={headingId}
              className="text-sm font-semibold tracking-tight text-slate-900"
            >
              {title}
            </Heading>
            {subtitle && (
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{subtitle}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerAside}
            {collapsible && (
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
                aria-controls={bodyId}
                className={cn(
                  "inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                  collapse === "mobile" && "lg:hidden",
                )}
              >
                {open ? "Hide" : "Show"}
                <ChevronDown
                  aria-hidden
                  className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
                />
                <span className="sr-only"> {title}</span>
              </button>
            )}
          </div>
        </div>

        {headerExtra && <div className="mt-2">{headerExtra}</div>}
      </div>

      <div id={bodyId} className={cn(bodyVisibility, "px-3 py-3 sm:px-4", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
