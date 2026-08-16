import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SiteShell from "@/components/layout/SiteShell";
import FantasyParBoard from "@/components/fantasy/FantasyParBoard";
import NflPageHeader from "@/components/nfl/ui/NflPageHeader";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";

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

        <MethodologySection />
      </div>
    </SiteShell>
  );
}

/** One-line methodology summary that expands to the full three-part explanation. */
function MethodologySection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section aria-labelledby="par-method-heading" className="rounded-lg border border-slate-200 bg-white px-4 py-3 sm:px-5">
      <h2 id="par-method-heading" className="text-sm font-bold text-slate-900">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <ChevronDown aria-hidden className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} />
          <span>How this board is built</span>
          <span className="truncate text-xs font-normal text-slate-500">
            — approved PAR/G sets draft-pool tiers and orders every position board.
          </span>
        </button>
      </h2>
      {expanded && (
        <div className="mt-3 grid gap-3 text-xs leading-5 text-slate-600 md:grid-cols-3">
          <p>
            <strong className="text-slate-900">Board universe:</strong> Every existing JKB-ranked QB, RB, WR and TE remains visible. Kickers and defenses are not yet tiered — they are excluded from validated PAR logic entirely.
          </p>
          <p>
            <strong className="text-slate-900">Tier signal:</strong> QB18, RB66, WR78 and TE18 are ranked by PAR/G within position. The approved PAR-rank boundaries determine tier membership.
          </p>
          <p>
            <strong className="text-slate-900">Board order:</strong> All four position boards — QB, RB, WR and TE — sort by projected PAR/G, with each position's tiers and colour cutoffs derived from its own distribution. The untiered outside pool keeps JKB position-rank order. Consensus position rank never assigns a tier.
          </p>
        </div>
      )}
    </section>
  );
}
