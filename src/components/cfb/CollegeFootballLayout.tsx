import { Link, Outlet, useLocation } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import { CFB_SECTION_NAV, isCfbNavActive } from "@/lib/cfb/sectionNav";
import { CFB_BASE_PATH } from "@/lib/cfb/routes";
import { cn } from "@/lib/utils";

export default function CollegeFootballLayout() {
  const location = useLocation();

  return (
    <SiteShell>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 xl:py-7">
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-950 px-3 py-3 text-white">
              <Link
                to={CFB_BASE_PATH}
                className="flex min-w-0 items-center gap-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <span className="text-lg" aria-hidden>🏈</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-tight">College Football</span>
                  <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                    Rankings · Standings · Matchups
                  </span>
                </span>
              </Link>
            </div>
            <nav
              aria-label="College Football section"
              className="flex flex-wrap gap-1 px-2 py-2"
            >
              {CFB_SECTION_NAV.map((item) => {
                const active = isCfbNavActive(location.pathname, item);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <span className="sm:hidden">{item.shortLabel}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <main className="space-y-5 pb-10">
            <Outlet />
          </main>
        </div>
      </div>
    </SiteShell>
  );
}
