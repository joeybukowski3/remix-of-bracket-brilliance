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
import { useNflMatchupProjections } from "@/hooks/useNflMatchupProjections";
import { projectionFor } from "@/lib/nfl/projectionData";
import { useNflMatchupEpa } from "@/hooks/useNflMatchupEpa";
import { useNflV03PublicPowerRatings } from "@/hooks/useNflV03PublicPowerRatings";
import { createHeroModelRatingResolver } from "@/lib/nfl/heroModelRatings";
import { getNflSeasonGuide } from "@/lib/nfl/guideData";
import { getMatchupBySlug } from "@/lib/nfl/matchups";
import { opponentRankSummary } from "@/lib/nfl/opponentRankSummary";
import { deriveAdvantages, deriveAngles } from "@/lib/nfl/matchupComparison";
import {
  MATCHUP_CATEGORIES,
  type CategoryAdvantageResult,
  type MatchupCategoryId,
} from "@/lib/nfl/matchupCategoryAdvantage";
import { createInjuryResolver, describeUnavailable } from "@/lib/nfl/injuryData";
import { composeMetricResolvers, createEpaResolver } from "@/lib/nfl/epaData";
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
import MatchupAvailabilityPanel from "@/components/nfl/matchups/MatchupAvailabilityPanel";
import MatchupComparisonPanel from "@/components/nfl/matchups/MatchupComparisonPanel";
import MatchupDataControls from "@/components/nfl/matchups/MatchupDataControls";
import MatchupIdentityHeader from "@/components/nfl/matchups/MatchupIdentityHeader";
import MatchupMarketProfile from "@/components/nfl/matchups/MatchupMarketProfile";
import MatchupModelDetails from "@/components/nfl/matchups/MatchupModelDetails";
import MatchupOverviewPanel from "@/components/nfl/matchups/MatchupOverviewPanel";
import MatchupPeriodComparison from "@/components/nfl/matchups/MatchupPeriodComparison";
import MatchupScheduleContext from "@/components/nfl/matchups/MatchupScheduleContext";
import { CONVENTIONAL_STATS_METHODOLOGY } from "@/components/nfl/matchups/MatchupPendingNote";
import MatchupTabRow from "@/components/nfl/matchups/MatchupTabRow";
import MatchupTrenches from "@/components/nfl/matchups/MatchupTrenches";
import MatchupUnitBattles from "@/components/nfl/matchups/MatchupUnitBattles";
import {
  MATCHUP_TABS,
  matchupPanelId,
  matchupTabId,
  useMatchupNavigation,
} from "@/components/nfl/matchups/matchupNavigation";
import {
  categoryResultFrom,
  resolveCategoryMetrics,
  type MatchupDisplayMetric,
  type MatchupMetricSources,
} from "@/components/nfl/matchups/matchupDisplayMetrics";

const CURRENT_SEASON = 2026;
const GUIDE = getNflSeasonGuide(CURRENT_SEASON)!;

/**
 * NFL matchup analyzer.
 *
 * This page owns routing, SEO, data loading and tab composition only. All
 * presentation lives in src/components/nfl/matchups/*, and every statistic is
 * supplied by an injected resolver.
 *
 * The page is a shared template: nothing below branches on a team, an
 * abbreviation, a slug or a game id. Teams, crests, records, metrics, ranks,
 * market figures, availability, projections and metadata all resolve from the
 * matchup the route selected, so every generated matchup URL renders through
 * exactly this code path.
 *
 * Four content tabs replace the former jump navigation. There is deliberately
 * no Trends tab: the only genuine multi-period data is `resolveSuccessPeriods()`
 * — no home/away splits and no week-indexed series exist in any artifact — so
 * that comparison lives inside Team Comparison instead.
 *
 * Metrics absent from the artifacts (first downs, third down, time of
 * possession) resolve to null and keep rendering "N/A". Nothing is ever
 * estimated to fill a cell.
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
  // artifact leaves only the Availability tab in an unavailable state.
  const { artifact: injuryArtifact } = useNflMatchupInjuries();
  // Independent optional enrichment: a missing market artifact leaves only the
  // market rows unavailable.
  const { artifact: marketArtifact } = useNflMatchupMarket();
  // Independent optional enrichment: a missing EPA artifact leaves only the six
  // EPA rows unavailable.
  const { artifact: epaArtifact } = useNflMatchupEpa();
  // Independent optional enrichment: a missing projection artifact leaves only
  // the projection surfaces unavailable.
  const {
    artifact: projectionArtifact,
    loading: projectionLoading,
    error: projectionError,
  } = useNflMatchupProjections();
  // The JKB team-strength rows come from the active generated model, the same
  // board the /nfl landing page renders — never from the retired static
  // preseason file, so the two surfaces cannot show contradictory ratings.
  const { data: powerBoard } = useNflV03PublicPowerRatings(CURRENT_SEASON);

  const [sampleSettings, setSampleSettings] = useState<NflMatchupSampleSettings>(
    DEFAULT_NFL_MATCHUP_SAMPLE_SETTINGS
  );
  const navigation = useMatchupNavigation();

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
    // EPA comes from its own artifact but answers to the same sample controls,
    // so it is composed ahead of the conventional resolver. It returns null for
    // every non-EPA key, so nothing else is shadowed and no component needs to
    // know a second artifact exists.
    return composeMetricResolvers(
      createEpaResolver(epaArtifact, sampleSettings, slugToAbbr),
      createMatchupMetricResolver(metricsArtifact, sampleSettings, slugToAbbr)
    );
  }, [matchup, metricsArtifact, epaArtifact, sampleSettings]);

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

  // ESPN publishes cumulative season figures only, so the trench metrics use
  // their own season policy. Completed-game counts come from the repository's
  // own results, independent of any generated artifact.
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

  // Descriptive market profile. Windows follow their own completed-game policy,
  // not the conventional sample controls, and the current line is kept entirely
  // separate from the historical ATS profile.
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

  // JKB projected spread. The model is market-independent; the market line is
  // joined here, in the consumer layer, purely for side-by-side comparison.
  const projection = useMemo(
    () => projectionFor(projectionArtifact, matchup?.gameId),
    [projectionArtifact, matchup]
  );

  /**
   * Every comparison category, resolved once for this matchup and shared by the
   * Overview table and the Team Comparison accordions, so the two surfaces can
   * never disagree about what a category contains or which team leads it.
   */
  const modelRatings = useMemo(
    () => createHeroModelRatingResolver(powerBoard),
    [powerBoard]
  );

  /**
   * Running strength-of-schedule context for the two teams.
   *
   * Reads completed results only, so it grows week by week. Deliberately kept
   * out of `categoryMetrics` and out of every resolver: this is descriptive
   * context rendered in its own block, and it adjusts no metric, rank or colour
   * anywhere on the page.
   */
  const scheduleContext = useMemo(() => {
    if (!matchup) return null;
    return {
      away: opponentRankSummary(data?.results, CURRENT_SEASON, matchup.away.abbr, modelRatings),
      home: opponentRankSummary(data?.results, CURRENT_SEASON, matchup.home.abbr, modelRatings),
    };
  }, [matchup, data, modelRatings]);

  const { categoryMetrics, categoryResults } = useMemo(() => {
    const metrics = {} as Record<MatchupCategoryId, MatchupDisplayMetric[]>;
    const results = {} as Record<MatchupCategoryId, CategoryAdvantageResult>;
    if (!matchup) return { categoryMetrics: metrics, categoryResults: results };

    const sources: MatchupMetricSources = {
      resolver: metricResolver,
      successRate,
      trench,
      modelRatings,
    };
    for (const category of MATCHUP_CATEGORIES) {
      const rows = resolveCategoryMetrics(category, matchup, sources);
      metrics[category.id] = rows;
      results[category.id] = categoryResultFrom(category.id, rows);
    }
    return { categoryMetrics: metrics, categoryResults: results };
  }, [matchup, metricResolver, successRate, trench, modelRatings]);

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
    return <p className="text-sm text-slate-500">Loading matchup…</p>;
  }
  if (error) {
    return (
      <>
        <p className="text-sm font-semibold text-red-700">Could not load matchup data. Please try again later.</p>
        <Link to="/nfl/matchups" className="mt-3 inline-block text-sm font-black text-emerald-700 hover:underline">← All matchups</Link>
      </>
    );
  }
  // Loaded but no matching game → safe redirect (invalid/unknown slug).
  if (!matchup) return <Navigate to="/nfl/matchups" replace />;

  const panelProps = (tab: (typeof MATCHUP_TABS)[number]["id"]) => ({
    role: "tabpanel" as const,
    id: matchupPanelId(tab),
    "aria-labelledby": matchupTabId(tab),
    tabIndex: 0,
    hidden: navigation.tab !== tab,
  });

  return (
    <div className="space-y-3">
      <Link to="/nfl/matchups" className="text-xs font-black text-emerald-700 hover:underline">← All weekly matchups</Link>

      <MatchupIdentityHeader matchup={matchup} market={market?.current ?? null} />

      <MatchupTabRow
        activeTab={navigation.tab}
        onSelect={navigation.selectTab}
        token={navigation.token}
      />

      <div {...panelProps("overview")}>
        <MatchupOverviewPanel
          matchup={matchup}
          categoryResults={categoryResults}
          onOpenCategory={navigation.openCategory}
          projection={projection}
          market={market?.current ?? null}
          projectionLoading={projectionLoading}
          advantages={advantages}
          angles={angles}
          sampleLabel={sample?.label}
          sampleSettings={sampleSettings}
        />
      </div>

      <div {...panelProps("comparison")} className="space-y-3">
        <MatchupDataControls
          settings={sampleSettings}
          onChange={setSampleSettings}
          sampleLabel={sample?.label}
        />

        <MatchupComparisonPanel
          matchup={matchup}
          categoryMetrics={categoryMetrics}
          pendingCategory={navigation.category}
          navigationToken={navigation.token}
          scheduleContext={
            scheduleContext ? (
              <MatchupScheduleContext
                matchup={matchup}
                awaySummary={scheduleContext.away}
                homeSummary={scheduleContext.home}
              />
            ) : undefined
          }
          periodComparison={
            successArtifact && successRate ? (
              <MatchupPeriodComparison
                matchup={matchup}
                successRate={successRate}
                note={describeSuccessPeriods([...successRate.periods])}
              />
            ) : undefined
          }
        >
          <MatchupUnitBattles
            matchup={matchup}
            resolver={metricResolver}
            successRate={successRate}
            trench={trench}
          />

          <div className="grid grid-cols-1 items-start gap-3 @[1080px]:grid-cols-2">
            <MatchupTrenches
              matchup={matchup}
              trench={trench}
              note={trench ? describeTrenchPeriods(trench.periods) : undefined}
            />

            <MatchupMarketProfile matchup={matchup} market={market} />
          </div>
        </MatchupComparisonPanel>
      </div>

      <div {...panelProps("availability")}>
        <MatchupAvailabilityPanel
          matchup={matchup}
          resolver={injuryResolver}
          unavailableMessage={describeUnavailable(injuryArtifact)}
        />
      </div>

      <div {...panelProps("model")}>
        <MatchupModelDetails
          matchup={matchup}
          projection={projection}
          modelVersion={projectionArtifact?.modelVersion ?? null}
          generatedAt={projectionArtifact?._meta?.generatedAt ?? null}
          loading={projectionLoading}
          error={projectionError}
        />
      </div>

      {/* Stated once for the whole page, beneath every tab. */}
      <p className="text-[11px] leading-5 text-slate-400">{CONVENTIONAL_STATS_METHODOLOGY}</p>

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

      {epaArtifact && (
        <p className="text-[11px] leading-5 text-slate-400">
          EPA data: nflverse / nflfastR.
        </p>
      )}

      <p className="text-[11px] leading-5 text-slate-400">
        Informational model preview only — not betting advice. No pick, best bet, confidence
        rating or stake size is produced anywhere on this page.
      </p>
    </div>
  );
}
