import { Outlet } from "react-router-dom";
import SiteShell from "@/components/layout/SiteShell";
import NflSectionSidebar, { NflMobileMenu } from "@/components/nfl/NflSectionSidebar";

export default function NflPlatformLayout() {
  return (
    <SiteShell>
      <div className="bg-slate-50">
        <div className="mx-auto grid max-w-[1720px] grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:px-8 xl:grid-cols-[270px_minmax(0,1fr)] xl:items-start xl:py-8">
          <NflSectionSidebar />
          <div className="min-w-0">
            <NflMobileMenu />
            <Outlet />
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
