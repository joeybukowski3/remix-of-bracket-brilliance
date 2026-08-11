import { useState } from "react";
import { ChevronDown } from "lucide-react";
import MatchupAdvantages from "@/components/nfl/matchups/MatchupAdvantages";
import MatchupAngles from "@/components/nfl/matchups/MatchupAngles";
import MatchupCategoryAdvantage from "@/components/nfl/matchups/MatchupCategoryAdvantage";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import type { CategoryAdvantageResult, MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import type { MatchupAdvantageNote, MatchupAngle } from "@/lib/nfl/matchupComparison";
import { formatMarketFavoriteSpread, type MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";
import { describeSampleRule, type NflMatchupSampleSettings } from "@/lib/nfl/matchupSampleWindow";
import {
  compareToMarket,
  formatPoints,
  formatProjectedSpread,
  type GameProjection,
} from "@/lib/nfl/projectionData";
import { cn } from "@/lib/utils";

const NA = "N/A";

function ProjectionFigure({
  label,
  value,
  dim = false,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[20px] font-bold leading-6 tabular-nums tracking-tight",
          dim ? "text-slate-600" : "text-slate-900"
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * The official model projection, kept deliberately separate from the
 * descriptive Category Advantage table beside it.
 *
 * The left rule and the label are the only emphasis it needs; nothing here is
 * framed as a pick, a best bet, a confidence rating or an edge, and the market
 * figure exists only so the gap can be described.
 */
function ProjectionCard({
  projection,
  market,
  loading,
}: {
  projection: GameProjection | null;
  market: MarketCurrentGame | null;
  loading: boolean;
}) {
  const comparison = compareToMarket(projection, market);
  const marketDisplay = formatMarketFavoriteSpread(market);
  const difference = comparison?.difference == null ? NA : formatPoints(comparison.difference);
  const unavailable = !loading && !projection;

  return (
    <section
      aria-labelledby="model-projection-heading"
      className={cn(
        "rounded-lg border border-slate-200 border-l-[3px] bg-white p-3 sm:p-4",
        unavailable ? "border-l-slate-300" : "border-l-emerald-700"
      )}
    >
      <h2
        id="model-projection-heading"
        className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600"
      >
        Joe Knows Ball Projection
      </h2>

      {loading ? (
        <p className="mt-2 text-[12px] font-semibold text-slate-600">
          Loading the JKB projected spread…
        </p>
      ) : unavailable ? (
        <p className="mt-2 text-[12px] leading-5 text-slate-600">
          <span className="font-semibold text-slate-900">
            Overall model assessment not yet available.
          </span>{" "}
          No projection exists for this matchup and none has been estimated.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-x-7 gap-y-2">
            <ProjectionFigure
              label="Projected spread"
              value={formatProjectedSpread(projection)}
            />
            <ProjectionFigure label="Market" value={marketDisplay} dim={marketDisplay === NA} />
            <ProjectionFigure label="Model vs market" value={difference} dim={difference === NA} />
          </div>
          <p className="mt-2.5 text-[11px] leading-4 text-slate-600">
            The model never sees the market line. This difference is a description of the gap, not
            an edge.{" "}
            <span className="font-semibold text-slate-900">
              No pick, best bet or confidence rating is produced.
            </span>
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Overview.
 *
 * Four things, visually distinct and never merged into one apparent
 * recommendation: the descriptive category table, the model projection, the
 * deterministic advantages and angles, and a plain-language explainer with the
 * active sample caveat.
 *
 * The explainer collapses at the narrowest widths only — collapsed by default
 * there, always open from `sm` up — so the first mobile viewport goes to the
 * teams, the market, the tabs, the category table and the projection.
 */
export default function MatchupOverviewPanel({
  matchup,
  categoryResults,
  onOpenCategory,
  projection,
  market,
  projectionLoading,
  advantages,
  angles,
  sampleLabel,
  sampleSettings,
}: {
  matchup: NflMatchup;
  categoryResults: Record<MatchupCategoryId, CategoryAdvantageResult>;
  onOpenCategory: (category: MatchupCategoryId) => void;
  projection: GameProjection | null;
  market: MarketCurrentGame | null;
  projectionLoading: boolean;
  advantages: MatchupAdvantageNote[];
  angles: MatchupAngle[];
  sampleLabel?: string;
  sampleSettings: NflMatchupSampleSettings;
}) {
  const [explainerOpen, setExplainerOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <MatchupCategoryAdvantage
          matchup={matchup}
          results={categoryResults}
          onOpenCategory={onOpenCategory}
        />
        <ProjectionCard
          projection={projection}
          market={market}
          loading={projectionLoading}
        />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <MatchupSection
          id="advantages"
          subtitle="Derived from comparison rows — no weighting applied."
        >
          <MatchupAdvantages notes={advantages} />
        </MatchupSection>

        <MatchupSection
          id="things-to-watch"
          subtitle="Rules-based, from existing fields only."
        >
          <MatchupAngles angles={angles} />
        </MatchupSection>
      </div>

      <section
        aria-labelledby="overview-explainer-heading"
        className="rounded-lg border border-slate-200 bg-white"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 sm:px-4">
          <h2 id="overview-explainer-heading" className="text-sm font-semibold text-slate-900">
            What this page is telling you
          </h2>
          <button
            type="button"
            aria-expanded={explainerOpen}
            aria-controls="overview-explainer-body"
            onClick={() => setExplainerOpen((open) => !open)}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:hidden"
          >
            {explainerOpen ? "Hide" : "Show"}
            <ChevronDown
              aria-hidden
              className={cn("h-3 w-3 transition-transform", explainerOpen && "rotate-180")}
            />
          </button>
        </div>

        <div
          id="overview-explainer-body"
          className={cn(
            "space-y-2 px-3 py-3 text-[12px] leading-5 text-slate-600 sm:block sm:px-4",
            explainerOpen ? "block" : "hidden"
          )}
        >
          <p>
            Three separate things are shown above, and they are deliberately not combined. The{" "}
            <span className="font-semibold text-slate-900">category advantage</span> table counts
            how many individual statistics each team leads within a section — it treats every
            metric as equally important, which no serious model does. Select a category to open its
            detailed metrics. The <span className="font-semibold text-slate-900">projection</span>{" "}
            is the actual model output, built from opponent-adjusted efficiency plus a fixed
            home-field adjustment. The{" "}
            <span className="font-semibold text-slate-900">advantages and things to watch</span>{" "}
            are plain descriptions of the largest gaps in the underlying rows.
          </p>
          <p>
            If you are new to these metrics:{" "}
            <span className="font-semibold text-slate-900">EPA per play</span> measures how many
            points an average play is worth from a given situation,{" "}
            <span className="font-semibold text-slate-900">success rate</span> is the share of
            plays that keep an offense on schedule, and{" "}
            <span className="font-semibold text-slate-900">power rating</span> is Joe Knows
            Ball&apos;s opponent-adjusted measure of team strength.
          </p>
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
            <span className="font-semibold">Sample in use:</span>{" "}
            {sampleLabel ? `${sampleLabel}. ` : ""}
            {describeSampleRule(sampleSettings)}
          </p>
        </div>
      </section>
    </div>
  );
}
