import { Outlet, useLocation } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflSectionSidebar, { NflMobileMenu } from "@/components/nfl/NflSectionSidebar";

/**
 * The single shell for every public NFL route.
 *
 * It owns the page gutter, the max width and the vertical rhythm, so pages
 * render their content directly — no page may re-apply `site-container`,
 * `min-h-screen` or its own `max-w-*` wrapper. Doing so previously doubled the
 * horizontal padding on every NFL page and nested a 1400px container inside a
 * 1720px one, costing roughly 32-64px of usable width at every breakpoint.
 */
export default function NflPlatformLayout() {
  const location = useLocation();
  const isMatchupDetail = /^\/nfl\/matchups\/[^/]+\/?$/.test(location.pathname);

  return (
    <SiteShell>
      <div className={isMatchupDetail ? "nfl-matchup-platform min-h-screen bg-slate-50" : "min-h-screen bg-slate-50"}>
        <div className={isMatchupDetail ? "mx-auto grid max-w-[1720px] grid-cols-1 px-3 py-3 sm:px-5 lg:px-6" : "mx-auto grid max-w-[1680px] grid-cols-1 gap-6 px-4 py-5 sm:px-6 lg:px-8 xl:grid-cols-[228px_minmax(0,1fr)] xl:items-start xl:py-7"}>
          {isMatchupDetail ? <div className="hidden"><NflSectionSidebar /></div> : <NflSectionSidebar />}
          <div className="min-w-0">
            {isMatchupDetail ? <div className="hidden"><NflMobileMenu /></div> : <NflMobileMenu />}
            {/* The section owns the single <main> landmark; pages render their
                content directly into it. */}
            <main className="space-y-5 pb-10">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
