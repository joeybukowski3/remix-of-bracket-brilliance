import { Link } from "react-router-dom";
import { getRelatedMlbTools, type MlbToolId } from "@/lib/mlb/tools";
import { cn } from "@/lib/utils";

interface RelatedToolsProps {
  currentToolId: MlbToolId;
  heading?: string;
  className?: string;
}

/**
 * Shared, registry-driven "More MLB tools" block. Replaces the 3
 * independent, hand-maintained link lists that previously lived inline on
 * HR Props, Strikeout Props, and Batter vs Pitcher (each already slightly
 * different from the others) with one component that always reads its
 * link text and destinations from `tools.ts`.
 *
 * No icons: the 3 blocks this replaces never used icons, and the current
 * related-tools visual treatment (a wrapping row of pill links) doesn't
 * need them. If a future design wants icons, map `MlbToolIcon` ids through
 * one centralized render map here -- not in `tools.ts`, which stays free
 * of rendering concerns.
 */
export default function RelatedTools({ currentToolId, heading = "More MLB tools", className }: RelatedToolsProps) {
  // Defensive: registry validation (tools.test.ts) already guarantees no
  // tool lists itself, but a page-level guard costs nothing and this
  // component must never render a link to the page it's already on.
  const relatedTools = getRelatedMlbTools(currentToolId).filter((tool) => tool.id !== currentToolId);

  if (relatedTools.length === 0) {
    return null;
  }

  const headingId = `related-mlb-tools-${currentToolId}-heading`;

  return (
    <section aria-labelledby={headingId} className={cn("rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm", className)}>
      <h2 id={headingId} className="text-sm font-bold text-slate-900">
        {heading}
      </h2>
      <nav className="mt-2 flex flex-wrap gap-2" aria-label="Related MLB tools">
        {relatedTools.map((tool) => (
          <Link
            key={tool.id}
            to={tool.route}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-1"
          >
            {tool.shortName}
          </Link>
        ))}
      </nav>
    </section>
  );
}
