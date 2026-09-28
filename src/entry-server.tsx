/**
 * Build-time prerender entry. NOT a runtime server: scripts/prerender.ts loads
 * this module in Node after `vite build` and writes static HTML for an
 * allow-listed set of routes.
 *
 * It renders the exact route tree the browser uses (AppRoutes) inside a
 * StaticRouter. renderToString never runs effects, so no page fetches data,
 * touches browser globals, or fires analytics; the SEO each page declares is
 * captured synchronously through SeoCollectorContext instead.
 */
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppRoutes from "@/AppRoutes";
import { routerBase } from "@/lib/routerBase";
import { NflSeasonDataSeedContext, type NflSeasonData } from "@/hooks/useNflSeasonData";
import { createSeoCollector, SeoCollectorContext, type CollectedSeo } from "@/lib/seo/seoCollector";

export interface PrerenderOptions {
  /**
   * Season data read from the deployment's own dist/data files. Only used to
   * resolve data-dependent SEO (see scripts/prerender.ts); the browser starts
   * without it.
   */
  nflSeasons?: ReadonlyMap<number, NflSeasonData>;
}

export interface PrerenderResult {
  /** Markup for the inside of #root. */
  html: string;
  seo: CollectedSeo;
}

export function render(url: string, options: PrerenderOptions = {}): PrerenderResult {
  const collector = createSeoCollector();
  // A fresh client per render: nothing is shared between routes.
  const queryClient = new QueryClient();
  const html = renderToString(
    <SeoCollectorContext.Provider value={collector}>
      <NflSeasonDataSeedContext.Provider value={options.nflSeasons ?? null}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <StaticRouter location={url} basename={routerBase}>
              <AppRoutes />
            </StaticRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </NflSeasonDataSeedContext.Provider>
    </SeoCollectorContext.Provider>,
  );
  return { html, seo: collector.result() };
}

export { nflSeasonDataPaths, toNflSeasonData } from "@/hooks/useNflSeasonData";
export { CANONICAL_BASE } from "@/lib/seo/pageSeoHead";
