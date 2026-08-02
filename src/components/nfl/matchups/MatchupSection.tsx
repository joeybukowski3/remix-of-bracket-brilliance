import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { getMatchupSection, type NflMatchupSectionId } from "@/lib/nfl/matchupSections";

/**
 * Standard shell for every analyzer section.
 *
 * Carries the stable anchor id used by the Jump To control, a consistent
 * header, and a mobile-only collapse affordance. Above `lg` the body is always
 * rendered and the toggle is hidden — desktop has the width to show everything,
 * and a collapsed desktop grid cell would leave awkward holes in the layout.
 *
 * `scroll-mt-*` offsets the sticky mobile Jump To bar so an anchored heading is
 * never hidden underneath it.
 */
export default function MatchupSection({
  id,
  title,
  subtitle,
  headerAside,
  collapsible = true,
  defaultOpen = true,
  className = "",
  bodyClassName = "",
  children,
}: {
  id: NflMatchupSectionId;
  /** Overrides the registry label when a section needs a more specific heading. */
  title?: string;
  subtitle?: string;
  /** Right-aligned header slot (legend, sample note, segmented control). */
  headerAside?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const section = getMatchupSection(id);
  const heading = title ?? section.label;
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `${useId()}-${id}-body`;
  const headingId = `${id}-heading`;

  // Collapsed state only applies below `lg`; the desktop grid always shows the
  // body so side-by-side sections keep equal visual weight.
  const bodyVisibility = !collapsible || open ? "block" : "hidden lg:block";

  return (
    <section
      id={id}
      // Focusable so a Jump To anchor moves screen-reader focus onto the
      // section rather than leaving it stranded at the top of the document.
      tabIndex={-1}
      aria-labelledby={headingId}
      className={`scroll-mt-24 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:scroll-mt-6 ${className}`}
    >
      <div className="border-b border-slate-100 px-3 py-2.5 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-[13px] font-black uppercase tracking-wider text-slate-800 sm:text-sm"
            >
              {heading}
            </h2>
            {subtitle && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{subtitle}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {collapsible && (
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
                aria-controls={bodyId}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:hidden"
              >
                {open ? "Hide" : "Show"}
                <ChevronDown
                  aria-hidden
                  className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
                />
                <span className="sr-only"> {heading}</span>
              </button>
            )}
          </div>
        </div>

        {/* Subgroup controls get their own full-width row: at 375px they do not
            fit beside the heading without squeezing it to two or three lines. */}
        {headerAside && <div className="mt-2">{headerAside}</div>}
      </div>

      <div id={bodyId} className={`${bodyVisibility} px-3 py-3 sm:px-4 ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}
