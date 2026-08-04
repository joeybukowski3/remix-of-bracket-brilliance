import { MATCHUP_STICKY_NAV_TOP, NFL_MATCHUP_SECTIONS } from "@/lib/nfl/matchupSections";

/**
 * "Jump to" navigation for the analyzer.
 *
 * Plain in-page anchors — no scroll library, no custom scrollspy. Native anchor
 * behaviour gives keyboard and screen-reader support for free; each section
 * carries `tabIndex={-1}` and a `scroll-mt-*` offset so focus lands on the
 * heading and the sticky bar never covers it.
 *
 * Sticky below `lg` (where the page is a long single column and the control has
 * to stay reachable); a static toolbar on desktop, where it sits directly above
 * the content it addresses.
 *
 * It sticks below the site header, not at `top-0`. The header is also sticky at
 * `top-0` and paints above this bar, so anchoring both to the same edge left the
 * Jump To control hidden underneath it on every scrolled mobile view.
 */
export default function MatchupJumpNav() {
  return (
    <nav
      aria-label="Jump to matchup section"
      className={`sticky ${MATCHUP_STICKY_NAV_TOP} z-30 -mx-4 border-y border-slate-200 bg-white/95 px-4 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-xl lg:border lg:px-3 lg:py-2 lg:shadow-sm lg:backdrop-blur-none lg:top-auto`}
    >
      <div className="flex items-center gap-2">
        <span className="hidden shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 lg:inline">
          Jump to
        </span>
        <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex-wrap lg:overflow-visible [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {NFL_MATCHUP_SECTIONS.map((section) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="block whitespace-nowrap rounded-md border border-transparent px-2 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {section.navLabel}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
