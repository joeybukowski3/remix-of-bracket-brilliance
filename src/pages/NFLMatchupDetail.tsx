import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getSeoMeta } from "@/lib/seo";
import { useNflSeasonData } from "@/hooks/useNflSeasonData";
import { useNflMatchupMetrics } from "@/hooks/useNflMatchupMetrics";
import { useNflSuccessRates } from "@/hooks/useNflSuccessRates";
import { useNflTrenchMetrics } from "@/hooks/useNflTrenchMetrics";
import { useNflMatchupInjuries } from "@/hooks/useNflMatchupInjuries";
import { useNflMatchupMarket } from "@/hooks/useNflMatchupMarket";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { getMatchupBySlug } from "@/lib/nfl/matchups";
import { deriveAdvantages, deriveAngles } from "@/lib/nfl/matchupComparison";
import { DEFENSE_METRIC_GROUPS, OFFENSE_METRIC_GROUPS } from "@/lib/nfl/matchupMetrics";
import { createInjuryResolver, describeUnavailable } from "@/lib/nfl/injuryData";
import {
  completedGamesFor as marketCompletedGamesFor,
  createMarketResolver,
  currentMarketFor,
  describeMarketPeriods,
  resolveMarketPeriods,
} from "@/lib/nfl/marketData";
import {
  createMatchupMetricResolver,
  describeMatchupSample,
} from "@/lib/nfl/matchupMetricsData";
import {
  completedGamesFor,
  createSuccessRateResolver,
  describeSuccessPeriods,
  resolveSuccessPeriods,
} from "@/lib/nfl/successRateData";
import {
  countCompletedGames,
  createTrenchResolver,
  describeTrenchPeriods,
  resolveTrenchPeriods,
} from "@/lib/nfl/trenchMetricsData";
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
 * NFL matchup analyzer.
 *
 * This page owns routing, SEO, data loading and section composition only. All
 * presentation lives in src/components/nfl/matchups/*, and every statistic is
 * supplied by an injected resolver.
 *
 * Phase 2 wires the conventional-stat resolver over the generated nflverse
 * artifact, so the Season / Last 5 / historical-blend controls select real
 * samples. Metrics absent from that artifact (EPA, success rate, first downs,
 * third down, time of possession, line-of-scrimmage win rates, ATS) resolve to
 * null and keep rendering "N/A" — nothing is ever estimated to fill a cell.
 *
 * Injuries remain on the unavailable resolver. The Joe Knows Ball power model,
 * Advantages and Things to Watch keep their existing logic untouched, and the
 * hero's preseason ratings deliberately do not respond to the sample controls.
 */
export default function NFLMatchupDetail() {
  const { gameSlug = "" } = useParams();
  const seo = getSeoMeta("nfl");
  const { loading, error, data } = useNflSeasonData(CURRENT_SEASON);
  // Soft dependency: the analyzer renders fully without it, with detailed rows
  // staying at "N/A".
  const { artifact: metricsArtifact } = useNflMatchupMetrics();
  // Independent optional enrichment: an RBSDM outage leaves only the
  // success-rate rows unavailable.
  const { artifact: successArtifact } = useNflSuccessRates();
  // Independent optional enrichment: an ESPN outage leaves only the trench rows
  // unavailable.
  const { artifact: trenchArtifact } = useNflTrenchMetrics();
  // Independent optional enrichment: a missing or not-yet-published injury
  // artifact leaves only the Injuries section in an unavailable state.
  const { artifact: injuryArtifact } = useNflMatchupInjuries();
  // Independent optional enrichment: a missing market artifact leaves only the
  // market rows unavailable.
  const { artifact: marketArtifact } = useNflMatchupMarket();
  const [sampleSettings, setSampleSettings] = useState<NflMatchupSampleSettings>(
    DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS
  );

  const matchup = useMemo(
    () => (data ? getMatchupBySlug(data.games, GUIDE, gameSlug) : null),
    [data, gameSlug]
  );

  // The UI addresses teams by guide slug; the artifact is keyed by the canonical
  // abbreviation, so the resolver is built with an explicit two-entry map.
  const metricResolver = useMemo(() => {
    if (!matchup) return () => null;
    const slugToAbbr = new Map([
      [matchup.away.slug, matchup.away.abbr],
      [matchup.home.slug, matchup.home.abbr],
    ]);
    return createMatchupMetricResolver(metricsArtifact, sampleSettings, slugToAbbr);
  }, [matchup, metricsArtifact, sampleSettings]);

  const sample = useMemo(() => {
    if (!matchup) return null;
    return describeMatchupSample(metricsArtifact, sampleSettings, [
      matchup.away.abbr,
      matchup.home.abbr,
    ]);
  }, [matchup, metricsArtifact, sampleSettings]);

  // Success rate uses its own automatic period policy, not the conventional
  // sample controls, because RBSDM publishes rates without play denominators.
  const successRate = useMemo(() => {
    if (!matchup) return undefined;
    const periods = resolveSuccessPeriods(
      completedGamesFor(successArtifact, CURRENT_SEASON, matchup.away.abbr),
      completedGamesFor(successArtifact, CURRENT_SEASON, matchup.home.abbr)
    );
    return { periods, resolve: createSuccessRateResolver(successArtifact) };
  }, [matchup, successArtifact]);

  // ESPN publishes cumulative season figures only, so the Trenches section uses
  // its own season policy. Completed-game counts come from the repository's own
  // results, independent of any generated artifact.
  const trench = useMemo(() => {
    if (!matchup || !trenchArtifact) return undefined;
    const periods = resolveTrenchPeriods(
      countCompletedGames(data?.results, matchup.away.abbr),
      countCompletedGames(data?.results, matchup.home.abbr)
    );
    return { artifact: trenchArtifact, periods, resolve: createTrenchResolver(trenchArtifact) };
  }, [matchup, trenchArtifact, data]);

  // Injuries are keyed by canonical abbreviation like the other artifacts, so
  // the resolver is built with the same explicit two-entry slug map. The
  // resolver returns nothing when the artifact is historical, so a prior
  // season's report is never presented as this week's availability.
  const injuryResolver = useMemo(() => {
    if (!matchup) return () => null;
    const slugToAbbr = new Map([
      [matchup.away.slug, matchup.away.abbr],
      [matchup.home.slug, matchup.home.abbr],
    ]);
    return createInjuryResolver(injuryArtifact, slugToAbbr);
  }, [matchup, injuryArtifact]);

  // Descriptive market profile. Windows follow their own completed-game policy
  // like Phase 3A/3B, not the conventional sample controls, and the current
  // line is kept entirely separate from the historical ATS profile.
  const market = useMemo(() => {
    if (!matchup || !marketArtifact) return undefined;
    const slugToAbbr = new Map([
      [matchup.away.slug, matchup.away.abbr],
      [matchup.home.slug, matchup.home.abbr],
    ]);
    const periods = resolveMarketPeriods(
      marketCompletedGamesFor(marketArtifact, CURRENT_SEASON, matchup.away.abbr),
      marketCompletedGamesFor(marketArtifact, CURRENT_SEASON, matchup.home.abbr)
    );
    const resolvers = Object.fromEntries(
      periods.map((period) => [period, createMarketResolver(marketArtifact, slugToAbbr, period)])
    );
    return {
      periods,
      resolvers,
      current: currentMarketFor(marketArtifact, matchup.gameId),
      note: describeMarketPeriods(periods),
    };
  }, [matchup, marketArtifact]);

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

        <MatchupDataControls
          settings={sampleSettings}
          onChange={setSampleSettings}
          sampleLabel={sample?.label}
        />

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
            resolver={metricResolver}
            baselineLabel="JKB Offense Rating"
            baselineRank={(team) => team.offenseRank}
            baselineValue={(team) => team.offensePct}
            successRate={successRate}
            trench={trench}
          />

          <MatchupUnitComparison
            id="defense"
            matchup={matchup}
            groups={DEFENSE_METRIC_GROUPS}
            resolver={metricResolver}
            baselineLabel="JKB Defense Rating"
            baselineRank={(team) => team.defenseRank}
            baselineValue={(team) => team.defensePct}
            successRate={successRate}
            trench={trench}
          />
        </div>

        <MatchupUnitBattles matchup={matchup} resolver={metricResolver} successRate={successRate} trench={trench} />

        <div className="grid items-start gap-3 xl:grid-cols-2">
          <MatchupTrenches
            matchup={matchup}
            trench={trench}
            note={trench ? describeTrenchPeriods(trench.periods) : undefined}
          />
          <MatchupMarketProfile matchup={matchup} market={market} />
        </div>

        <MatchupInjuries
          matchup={matchup}
          resolver={injuryResolver}
          unavailableMessage={describeUnavailable(injuryArtifact)}
        />

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

        {successArtifact && successRate && (
          <p className="text-[11px] leading-5 text-slate-400">
            {describeSuccessPeriods([...successRate.periods])} Success rate data: RBSDM.
          </p>
        )}

        {injuryArtifact && (
          <p className="text-[11px] leading-5 text-slate-400">
            Injury and snap data: nflverse; snap counts via Pro-Football-Reference.
          </p>
        )}

        {marketArtifact && (
          <p className="text-[11px] leading-5 text-slate-400">
            Market data: nflverse / nfldata. A single source-published market line; the underlying
            sportsbook composition is not disclosed.
          </p>
        )}

        <p className="text-[11px] leading-5 text-slate-400">
          Informational model preview only — not betting advice. Spreads are not yet available and are never derived from the power ratings.
        </p>
      </div>
    </main>
  );
}
