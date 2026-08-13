import SiteShell from "@/components/layout/SiteShell";
import FantasyParBoard from "@/components/fantasy/FantasyParBoard";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";

/** 2026 JKB fantasy research board with PAR-derived position tiers. */
export default function FantasyFootball() {
  const seo = getSeoMeta("fantasy-football");
  usePageSeo({
    title: seo.title,
    description: seo.description,
    path: seo.path,
    noindex: seo.noindex ?? false,
  });

  return (
    <SiteShell>
      <NflPageHeader
        eyebrow="Fantasy Football"
        title="2026 Fantasy PAR Rankings"
        description="The full Joe Knows Ball research board, organized by position evidence, model ranks, team context and fantasy-playoff schedule. Approved PAR/G drives draft-pool tiers only."
      />

      <div className="mt-4 space-y-4">
        <FantasyParBoard />

        <section aria-labelledby="par-method-heading" className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
          <h2 id="par-method-heading" className="text-sm font-bold text-slate-900">How this board is built</h2>
          <div className="mt-2 grid gap-3 text-xs leading-5 text-slate-600 md:grid-cols-3">
            <p>
              <strong className="text-slate-900">Board universe:</strong> Every existing JKB-ranked QB, RB, WR and TE remains visible. Kicker and defense projections are excluded from validated PAR logic.
            </p>
            <p>
              <strong className="text-slate-900">Tier signal:</strong> QB18, RB66, WR78 and TE18 are ranked by PAR/G within position. The approved PAR-rank boundaries determine tier membership.
            </p>
            <p>
              <strong className="text-slate-900">Board order:</strong> JKB position rank orders players inside tiers and the untiered outside pool. Consensus position rank never assigns a tier.
            </p>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
