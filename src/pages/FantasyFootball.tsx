import SiteShell from "@/components/layout/SiteShell";
import FantasyParBoard from "@/components/fantasy/FantasyParBoard";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";

/** 2026 fantasy rankings built from the approved consensus points-above-replacement source. */
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
        description="Position-by-position draft tiers built from projected points above a historical replacement baseline, with Joe Knows Ball rank preserving the draft-board order inside each tier."
      />

      <div className="mt-4 space-y-4">
        <FantasyParBoard />

        <section aria-labelledby="par-method-heading" className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:px-5">
          <h2 id="par-method-heading" className="text-sm font-bold text-slate-900">How this board is built</h2>
          <div className="mt-2 grid gap-3 text-xs leading-5 text-slate-600 md:grid-cols-3">
            <p>
              <strong className="text-slate-900">Universe:</strong> QB18, RB66, WR78 and TE18 from the approved 2026 consensus projection source. Kicker and defense projections are excluded.
            </p>
            <p>
              <strong className="text-slate-900">Tier signal:</strong> Players are ranked by PAR/G within their position universe. The approved PAR-rank boundaries determine tier membership.
            </p>
            <p>
              <strong className="text-slate-900">Board order:</strong> JKB position rank orders players inside each tier when available. Consensus position rank never assigns a tier.
            </p>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
