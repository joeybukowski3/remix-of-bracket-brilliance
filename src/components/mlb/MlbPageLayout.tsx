import type { ReactNode } from "react";
import SiteShell from "@/components/layout/SiteShell";
import MlbHubSidebar from "@/components/mlb/MlbHubSidebar";

/**
 * Shared layout wrapper for every production MLB page. Wraps the existing
 * site header (SiteShell) and renders the MLB hub sidebar alongside the
 * page's own content, matching the desktop structure already used by
 * MlbGameDetail.tsx so the visual transition between MLB pages is seamless.
 *
 * On mobile (below lg breakpoint) MlbHubSidebar hides itself (it renders
 * `hidden ... lg:block`), so this wrapper is effectively a thin padding
 * wrapper on small screens -- each page's own mobile nav/hero continues to
 * handle small-screen navigation exactly as before.
 */
export default function MlbPageLayout({ children }: { children: ReactNode }) {
  return (
    <SiteShell>
      <div className="-mx-3 -my-3 bg-[#f8f9ff] lg:-mx-4 lg:-my-4">
        <div className="mx-auto flex max-w-[1360px] gap-5 px-4 py-6 sm:px-5 lg:px-6 xl:max-w-[1560px] 2xl:max-w-[1800px] 2xl:gap-5 3xl:max-w-[1920px] 3xl:px-6 4xl:max-w-[2048px] 4xl:px-8">
          <MlbHubSidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </SiteShell>
  );
}
