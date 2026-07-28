import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";

type MobileCollapsibleSectionProps = {
  title: string;
  /** Stable machine-readable identifier for this section, e.g. "available-players". */
  sectionId: string;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  /**
   * True when desktop already renders this content elsewhere (e.g. the
   * always-visible roster/recent-selections panels), so this entire
   * mobile-only section — button and content — must stay hidden at lg+.
   * False when this is the single shared instance for both breakpoints
   * (e.g. Available Players), where only the toggle button is mobile-only
   * and the content stays visible on desktop regardless of toggle state.
   */
  hideOnDesktop?: boolean;
  className?: string;
  children: ReactNode;
};

export function MobileCollapsibleSection({
  title,
  sectionId,
  subtitle,
  defaultOpen = false,
  hideOnDesktop = false,
  className,
  children,
}: MobileCollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={`${hideOnDesktop ? "lg:hidden" : ""} ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        data-mobile-section-toggle={sectionId}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-left lg:hidden"
      >
        <span className="min-w-0">
          <span className="block text-[clamp(0.8125rem,0.75rem+0.2vw,0.9375rem)] font-bold text-white">
            {title}
          </span>
          {subtitle ? (
            <span className="block text-[clamp(0.6875rem,0.63rem+0.15vw,0.8125rem)] text-slate-400">
              {subtitle}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <div
        id={contentId}
        className={`${isOpen ? "mt-2 block" : "hidden"} ${hideOnDesktop ? "" : "lg:mt-0 lg:block"}`}
      >
        {children}
      </div>
    </section>
  );
}
