import { Outlet, useLocation } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import MlbSectionSidebar, { MlbMobileMenu } from "@/components/mlb/MlbSectionSidebar";
import { cn } from "@/lib/utils";

// Routes that legitimately need more horizontal room (dense tables,
// multi-column dashboards, the game-detail hub's extra moneyline rail) get
// a wider shared outer container. The sidebar itself never changes width
// or position either way. Keyed on pathname rather than react-router's
// route `handle` API because this app uses a plain <BrowserRouter>/<Routes>
// tree, not a data router -- `useMatches()`/`handle` require the latter.
const MLB_WIDE_CONTENT_PATHS = new Set<string>([
  "/mlb",
  "/mlb/props",
  "/mlb/hr-props",
  "/mlb/numerology",
]);

export default function MlbLayout() {
  const location = useLocation();
  const isWide = MLB_WIDE_CONTENT_PATHS.has(location.pathname);

  return (
    <SiteShell>
      <div className="bg-slate-50">
        <div
          className={cn(
            "mx-auto grid grid-cols-1 gap-6 px-4 py-5 sm:px-6 xl:grid-cols-[224px_minmax(0,1fr)] xl:items-start xl:px-8 xl:py-6",
            isWide ? "max-w-[1720px]" : "max-w-[1440px]",
          )}
        >
          <MlbSectionSidebar />
          <div className="min-w-0">
            <MlbMobileMenu />
            <Outlet />
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
