import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  CFB_SEASON,
  CFB_STATS_PREVIOUS_SEASON_BY_TEAM,
  CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM,
  CFB_STATS_PREVIOUS_SEASON_YEAR,
  CFB_STATS_RANKS_BY_TEAM,
  getGameById,
  getTeamById,
} from "@/data/cfb";
import { formatTotal } from "@/lib/cfb/format";
import { CFB_SCHEDULE_PATH } from "@/lib/cfb/routes";
import { selectMatchupSeasonStatsContext } from "@/lib/cfb/seasonStatsPresentation";
import CollegeFootballMarketStrip from "@/components/cfb/CollegeFootballMarketStrip";
import CollegeFootballMatchupHero from "@/components/cfb/CollegeFootballMatchupHero";
import CollegeFootballPowerComparison from "@/components/cfb/CollegeFootballPowerComparison";
import CollegeFootballModelPanel from "@/components/cfb/CollegeFootballModelPanel";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";
import CollegeFootballSeasonStatsComparison from "@/components/cfb/CollegeFootballSeasonStatsComparison";
import CollegeFootballMobileStickyHeader from "@/components/cfb/CollegeFootballMobileStickyHeader";

/**
 * Shared prominent section heading — larger, heavier, and color-accented so
 * each major matchup-detail section reads as an intentional dashboard block
 * rather than a muted label. Applied consistently across Market, Power
 * Comparison, Season Stats, and Power Rating Line.
 */
function SectionHeading({ id, accentColor, children }: { id: string; accentColor: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-900 sm:text-base">
      <span aria-hidden="true" className="h-4 w-1.5 rounded-full" style={{ background: accentColor }} />
      {children}
    </h2>
  );
}

export default function CollegeFootballMatchup() {
  const { gameId = "" } = useParams();
  const game = getGameById(gameId);
  const away = game ? getTeamById(game.awayTeamId) : undefined;
  const home = game ? getTeamById(game.homeTeamId) : undefined;

  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const stickyStartRef = useRef<HTMLDivElement>(null);
  const stickyEndRef = useRef<HTMLDivElement>(null);

  usePageSeo({
    title:
      away && home
        ? `${away.shortName} vs ${home.shortName} Matchup | Joe Knows Ball`
        : "Matchup | College Football",
    description: "Side-by-side College Football matchup comparison — ratings, stats, and market odds.",
    path: `/college-football/matchup/${gameId}`,
  });

  useEffect(() => {
    const startEl = stickyStartRef.current;
    const endEl = stickyEndRef.current;
    if (!startEl || !endEl) return;

    // A scroll-position check (rather than IntersectionObserver's threshold
    // crossings) so this stays correct even when a fast or programmatic
    // scroll jumps straight past the sentinel's visible window in one frame.
    let ticking = false;
    const evaluate = () => {
      ticking = false;
      const pastStart = startEl.getBoundingClientRect().top < 0;
      const pastEnd = endEl.getBoundingClientRect().top < 0;
      setShowStickyHeader(pastStart && !pastEnd);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(evaluate);
    };

    evaluate();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [gameId]);

  if (!game || !away || !home) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-semibold text-slate-800">Matchup not found</p>
        <Link to={CFB_SCHEDULE_PATH} className="mt-4 inline-block text-sm font-semibold text-sky-800 hover:underline">
          Back to Schedule
        </Link>
      </div>
    );
  }

  const hasOpenTotalContext =
    game.odds.openingTotal != null &&
    game.odds.currentTotal != null &&
    game.odds.openingTotal !== game.odds.currentTotal;

  const seasonStatsContext = selectMatchupSeasonStatsContext({
    currentSeason: CFB_SEASON,
    previousSeason: CFB_STATS_PREVIOUS_SEASON_YEAR,
    away: {
      current: away.stats,
      currentRanks: CFB_STATS_RANKS_BY_TEAM[away.id] ?? {},
      previous: CFB_STATS_PREVIOUS_SEASON_BY_TEAM[away.id],
      previousRanks: CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM[away.id],
    },
    home: {
      current: home.stats,
      currentRanks: CFB_STATS_RANKS_BY_TEAM[home.id] ?? {},
      previous: CFB_STATS_PREVIOUS_SEASON_BY_TEAM[home.id],
      previousRanks: CFB_STATS_PREVIOUS_SEASON_RANKS_BY_TEAM[home.id],
    },
  });

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <CollegeFootballMobileStickyHeader away={away} home={home} visible={showStickyHeader} />

      <CollegeFootballMatchupHero game={game} away={away} home={home} />

      <section aria-labelledby="market-heading">
        <SectionHeading id="market-heading" accentColor="#0284c7">
          Market
        </SectionHeading>
        <CollegeFootballMarketStrip
          odds={game.odds}
          game={game}
          awayAbbreviation={away.abbreviation}
          homeAbbreviation={home.abbreviation}
        />
        {hasOpenTotalContext && (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500">
            <span>
              Open total: <span className="font-semibold text-slate-700">{formatTotal(game.odds.openingTotal)}</span>
              {" "}→{" "}
              <span className="font-semibold text-slate-700">{formatTotal(game.odds.currentTotal)}</span>
            </span>
          </div>
        )}
      </section>

      <div ref={stickyStartRef} aria-hidden="true" />

      <section aria-labelledby="power-heading">
        <SectionHeading id="power-heading" accentColor="#7c3aed">
          Power Comparison
        </SectionHeading>
        <CollegeFootballPowerComparison away={away} home={home} />
      </section>

      <section aria-labelledby="season-stats-heading">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <SectionHeading id="season-stats-heading" accentColor="#059669">
            Season Stats
          </SectionHeading>
          {seasonStatsContext && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {seasonStatsContext.seasonLabel}
            </span>
          )}
        </div>
        {seasonStatsContext ? (
          <CollegeFootballSeasonStatsComparison
            awayShortName={away.shortName}
            homeShortName={home.shortName}
            context={seasonStatsContext}
            awayColor={away.primaryColor}
            homeColor={home.primaryColor}
            awayLogo={away.logo}
            homeLogo={home.logo}
          />
        ) : (
          <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Season statistics not yet available for this matchup.
          </div>
        )}
      </section>

      <section aria-labelledby="model-heading">
        <SectionHeading id="model-heading" accentColor="#d97706">
          Power Rating Line
        </SectionHeading>
        <CollegeFootballModelPanel game={game} />
      </section>

      <div ref={stickyEndRef} aria-hidden="true" />

      <CollegeFootballDataNotice kind="both" />
    </div>
  );
}
