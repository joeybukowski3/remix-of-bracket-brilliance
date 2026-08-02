import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { getMatchupBySlug } from "@/lib/nfl/matchups";
import { deriveAdvantages, deriveAngles } from "@/lib/nfl/matchupComparison";
import {
  DEFENSE_METRIC_GROUPS,
  OFFENSE_METRIC_GROUPS,
  unavailableInjuryResolver,
  unavailableMetricResolver,
} from "@/lib/nfl/matchupMetrics";
import {
  DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS,
  type NflMatchupSampleSettings,
} from "@/lib/nfl/matchupSampleWindow";
import MatchupAdvantages from "@/components/nfl/matchups/MatchupAdvantages";
import MatchupAngles from "@/components/nfl/matchups/MatchupAngles";
import MatchupDataControls from "@/components/nfl/matchups/MatchupDataControls";
import MatchupFutureSection from "@/components/nfl/matchups/MatchupFutureSection";
import MatchupHero from "@/components/nfl/matchups/MatchupHero";
import MatchupInjuries from "@/components/nfl/matchups/MatchupInjuries";
import MatchupJumpNav from "@/components/nfl/matchups/MatchupJumpNav";
import MatchupMarketProfile from "@/components/nfl/matchups/MatchupMarketProfile";
import MatchupRankLegend from "@/components/nfl/matchups/MatchupRankLegend";
import MatchupSection from "@/components/nfl/matchups/MatchupSection";
import MatchupTrenches from "@/components/nfl/matchups/MatchupTrenches";
import MatchupUnitBattles from "@/components/nfl/matchups/MatchupUnitBattles";
import MatchupUnitComparison from "@/components/nfl/matchups/MatchupUnitComparison";

const CURRENT_SEASON = 2026;
const GUIDE = getNflSeasonGuide(CURRENT_SEASON)!;

const MODEL_ANALYSIS_SCOPE = [
  "Projected spread",
  "Current spread comparison",
  "Model edge",
  "Projected winner",
] as const;

/**
 * NFL matchup analyzer (Phase 1).
 *
 * This page owns routing, SEO, data loading and section composition only. All
 * presentation lives in src/components/nfl/matchups/*, and every statistic is
 * supplied by an injected resolver — in this phase the "unavailable" resolvers,
 * which is what structurally prevents a placeholder section from rendering an
 * invented number.
 *
 * The Joe Knows Ball power model, Advantages and Things to Watch (formerly
 * "Angles to watch") keep their existing logic untouched.
 */
export default function NFLMatchupDetail() {
  const { gameSlug = "" } = useParams();
  const seo = getSeoMeta("nfl");
  const { loading, error, data } = useNflSeasonData(CURRENT_SEASON);
  const [sampleSettings, setSampleSettings] = useState<NflMatchupSampleSettings>(
    DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS
  );

  const matchup = useMemo(
    () => (data ? getMatchupBySlug(data.games, GUIDE, gameSlug) : null),
    [data, gameSlug]
  );

  usePageSeo({
    title: matchup
      ? `${matchup.away.teamName} at ${matchup.home.teamName} — Week ${matchup.week} Matchup | Joe Knows Ball`
      : `NFL Weekly Matchup | Joe Knows Ball`,
    description: matchup
      ? `${matchup.away.teamName} vs ${matchup.home.teamName} Week ${matchup.week} preview: power ratings, side-by-side comparison, model advantages and matchup angles.`
      : "NFL weekly matchup preview.",
    path: `/nfl/matchups/${gameSlug}`,
    noindex: seo.noindex ?? !matchup,
  });

  const advantages = useMemo(() => (matchup ? deriveAdvantages(matchup) : []), [matchup]);
  const angles = useMemo(() => (matchup ? deriveAngles(matchup) : []), [matchup]);

  if (loading) {
    return (
      <main className="site-page pb-16 pt-8">
        <div className="site-container"><p className="text-sm text-slate-500">Loading matchup…</p></div>
      </main>
    );
  }
  if (error) {
    return (
      <main className="site-page pb-16 pt-8">
        <div className="site-container">
          <p className="text-sm font-semibold text-red-700">Could not load matchup data. Please try again later.</p>
          <Link to="/nfl/matchups" className="mt-3 inline-block text-sm font-black text-emerald-700 hover:underline">← All matchups</Link>
        </div>
      </main>
    );
  }
  // Loaded but no matching game → safe redirect (invalid/unknown slug).
  if (!matchup) return <Navigate to="/nfl/matchups" replace />;

  return (
    <main className="site-page pb-16 pt-6">
      <div className="site-container space-y-3">
        <Link to="/nfl/matchups" className="text-xs font-black text-emerald-700 hover:underline">← All weekly matchups</Link>

        <MatchupHero matchup={matchup} />

        <MatchupJumpNav />

        <MatchupDataControls settings={sampleSettings} onChange={setSampleSettings} />

        <MatchupRankLegend />

        {/* Advantages + Things to Watch share a row on wide screens. */}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <MatchupSection id="advantages">
            <MatchupAdvantages notes={advantages} />
          </MatchupSection>

          <MatchupSection id="things-to-watch">
            <MatchupAngles angles={angles} />
          </MatchupSection>
        </div>

        <div className="grid items-start gap-3 xl:grid-cols-2">
          <MatchupUnitComparison
            id="offense"
            matchup={matchup}
            groups={OFFENSE_METRIC_GROUPS}
            resolver={unavailableMetricResolver}
            baselineLabel="JKB Offense Rating"
            baselineRank={(team) => team.offenseRank}
            baselineValue={(team) => team.offensePct}
          />

          <MatchupUnitComparison
            id="defense"
            matchup={matchup}
            groups={DEFENSE_METRIC_GROUPS}
            resolver={unavailableMetricResolver}
            baselineLabel="JKB Defense Rating"
            baselineRank={(team) => team.defenseRank}
            baselineValue={(team) => team.defensePct}
          />
        </div>

        <MatchupUnitBattles matchup={matchup} resolver={unavailableMetricResolver} />

        <div className="grid items-start gap-3 xl:grid-cols-2">
          <MatchupTrenches matchup={matchup} resolver={unavailableMetricResolver} />
          <MatchupMarketProfile matchup={matchup} resolver={unavailableMetricResolver} />
        </div>

        <MatchupInjuries matchup={matchup} resolver={unavailableInjuryResolver} />

        <div className="grid items-start gap-3 lg:grid-cols-2">
          <MatchupFutureSection
            id="game-trends"
            message="Game trend analysis will be added in a future data phase."
          />
          <MatchupFutureSection
            id="model-analysis"
            message="The Joe Knows Ball matchup model will be added in a future phase."
            futureScope={MODEL_ANALYSIS_SCOPE}
          />
        </div>

        <p className="text-[11px] leading-5 text-slate-400">
          Informational model preview only — not betting advice. Spreads are not yet available and are never derived from the power ratings.
        </p>
      </div>
    </main>
  );
}
