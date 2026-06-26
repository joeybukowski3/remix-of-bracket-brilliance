import SiteShell from "@/components/layout/SiteShell";
import MlbNavHero from "@/components/mlb/MlbNavHero";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";

/**
 * Emergency-safe MLB HR Props route.
 *
 * The previous Sin City integration caused a production runtime failure that
 * prevented the application shell from rendering. This route intentionally
 * avoids loading that implementation so the main site remains available while
 * the full dashboard is repaired and browser-tested.
 */
export default function MlbHrProps() {
  usePageSeo(getSeoMeta("mlb-hr-props"));

  return (
    <SiteShell>
      <main className="site-page bg-[#edf2f7] pb-12 pt-3 text-slate-900">
        <div className="site-container">
          <div className="mb-4">
            <MlbNavHero />
          </div>

          <section className="rounded-[28px] border border-amber-200 bg-white p-6 shadow-sm">
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-3xl" aria-hidden="true">⚾</div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
                MLB HR Props
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                The HR props dashboard is temporarily being repaired after a model-view update caused a rendering error. The rest of Joe Knows Ball remains available.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Please check back shortly while the full dashboard is restored.
              </p>
            </div>
          </section>
        </div>
      </main>
    </SiteShell>
  );
}
