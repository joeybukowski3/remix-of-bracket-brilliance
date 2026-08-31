import MatchupAdvantages from "@/components/nfl/matchups/MatchupAdvantages";
import MatchupAngles from "@/components/nfl/matchups/MatchupAngles";
import MatchupCategoryAdvantage from "@/components/nfl/matchups/MatchupCategoryAdvantage";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import type { CategoryAdvantageResult, MatchupCategoryId } from "@/lib/nfl/matchupCategoryAdvantage";
import type { MatchupDisplayMetric } from "@/components/nfl/matchups/matchupDisplayMetrics";
import MatchupComparisonSnapshot from "@/components/nfl/matchups/MatchupComparisonSnapshot";
import type { MatchupAdvantageNote, MatchupAngle } from "@/lib/nfl/matchupComparison";
import { formatMarketFavoriteSpread, type MarketCurrentGame } from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";
import type { NflMatchupSampleSettings } from "@/lib/nfl/matchupSampleWindow";
import {
  compareToMarket,
  formatModelVsMarketDifference,
  formatProjectedSpread,
  type GameProjection,
} from "@/lib/nfl/projectionData";
import { cn } from "@/lib/utils";

const NA = "N/A";

function ProjectionFigure({
  label,
  value,
  tone,
  dim = false,
}: {
  label: string;
  value: string;
  tone: "model" | "market" | "away" | "home" | "neutral";
  dim?: boolean;
}) {
  return (
    <div className={`matchup-projection-tile matchup-projection-tile--${tone}`}>
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
  const difference = formatModelVsMarketDifference(comparison);
  const differenceTone = comparison?.leansToward === projection?.awayTeam
    ? "away"
    : comparison?.leansToward === projection?.homeTeam
      ? "home"
      : "neutral";
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
          <div className="matchup-projection-grid mt-2">
            <ProjectionFigure
              label="Projected spread"
              value={formatProjectedSpread(projection)}
              tone="model"
            />
            <ProjectionFigure label="Market" value={marketDisplay} tone="market" dim={marketDisplay === NA} />
            <ProjectionFigure label="Model vs market" value={difference} tone={differenceTone} dim={difference === NA} />
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
  categoryMetrics,
  marketProfile,
  scheduleContext,
}: {
  matchup: NflMatchup;
  categoryResults: Record<MatchupCategoryId, CategoryAdvantageResult>;
  onOpenCategory: (category: MatchupCategoryId) => void;
  projection: GameProjection | null;
  market: MarketCurrentGame | null;
  projectionLoading: boolean;
  advantages: MatchupAdvantageNote[];
  angles: MatchupAngle[];
  /** Retained for caller compatibility; explanatory sample copy now renders at page bottom. */
  sampleLabel?: string;
  sampleSettings?: NflMatchupSampleSettings;
  categoryMetrics?: Partial<Record<MatchupCategoryId, MatchupDisplayMetric[]>>;
  marketProfile?: React.ReactNode;
  scheduleContext?: React.ReactNode;
}) {
  return (
    <div className="matchup-overview">
      <div className="matchup-overview__top">
        <div className="matchup-overview__left">
          <div className="matchup-overview__model">
            <ProjectionCard
              projection={projection}
              market={market}
              loading={projectionLoading}
            />
          </div>
          <div className="matchup-overview__advantages">
            <MatchupSection
              id="advantages"
              title="Advantages"
              subtitle="Derived from comparison rows — no weighting applied."
            >
              <MatchupAdvantages notes={advantages} />
            </MatchupSection>
          </div>
        </div>

        <div className="matchup-overview__center">
          <div className="matchup-overview__projection">
            <h2 className="matchup-panel-label">Positional Edge Map</h2>
            <div className="matchup-overview__panel-body">
              <MatchupCategoryAdvantage
                matchup={matchup}
                results={categoryResults}
                onOpenCategory={onOpenCategory}
              />
            </div>
          </div>
          <div className="matchup-overview__watch">
            <MatchupSection
              id="things-to-watch"
              subtitle="Rules-based, from existing fields only."
            >
              <MatchupAngles matchup={matchup} angles={angles} />
            </MatchupSection>
          </div>
        </div>

        <div className="matchup-overview__right">
          <div className="matchup-overview__market">{marketProfile}</div>
          <div className="matchup-overview__schedule">{scheduleContext}</div>
        </div>
      </div>

      <div className="matchup-overview__snapshot">
        <MatchupComparisonSnapshot matchup={matchup} categoryMetrics={categoryMetrics} />
      </div>

    </div>
  );
}
