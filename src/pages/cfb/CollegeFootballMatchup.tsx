import { Link, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getGameById, getTeamById } from "@/data/cfb";
import { formatSpread, formatTotal } from "@/lib/cfb/format";
import { CFB_SCHEDULE_PATH } from "@/lib/cfb/routes";
import CollegeFootballOddsDisplay from "@/components/cfb/CollegeFootballOddsDisplay";
import CollegeFootballMatchupHero from "@/components/cfb/CollegeFootballMatchupHero";
import CollegeFootballPowerComparison from "@/components/cfb/CollegeFootballPowerComparison";
import CollegeFootballModelPanel from "@/components/cfb/CollegeFootballModelPanel";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";
import CollegeFootballSeasonStatsComparison from "@/components/cfb/CollegeFootballSeasonStatsComparison";

export default function CollegeFootballMatchup() {
  const { gameId = "" } = useParams();
  const game = getGameById(gameId);
  const away = game ? getTeamById(game.awayTeamId) : undefined;
  const home = game ? getTeamById(game.homeTeamId) : undefined;

  usePageSeo({
    title:
      away && home
        ? `${away.shortName} vs ${home.shortName} Matchup | Joe Knows Ball`
        : "Matchup | College Football",
    description: "Side-by-side College Football matchup comparison — ratings, stats, and market odds.",
    path: `/college-football/matchup/${gameId}`,
  });

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

  const hasOpenSpreadContext =
    game.odds.openingSpread != null &&
    game.odds.currentSpread != null &&
    game.odds.openingSpread !== game.odds.currentSpread;
  const hasOpenTotalContext =
    game.odds.openingTotal != null &&
    game.odds.currentTotal != null &&
    game.odds.openingTotal !== game.odds.currentTotal;

  const hasSeasonStats =
    away.stats.pointsPerGame != null ||
    home.stats.pointsPerGame != null ||
    away.stats.pointsAllowedPerGame != null ||
    home.stats.pointsAllowedPerGame != null;

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <CollegeFootballDataNotice kind="both" />

      <CollegeFootballMatchupHero game={game} away={away} home={home} />

      <section aria-labelledby="market-heading">
        <h2 id="market-heading" className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Market
        </h2>
        <div className="rounded-sm border border-slate-200 bg-white p-3">
          <CollegeFootballOddsDisplay
            odds={game.odds}
            game={game}
            awayAbbreviation={away.abbreviation}
            homeAbbreviation={home.abbreviation}
          />
          {(hasOpenSpreadContext || hasOpenTotalContext) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
              {hasOpenSpreadContext && (
                <span>
                  Open spread: <span className="font-semibold text-slate-700">{formatSpread(game.odds.openingSpread)}</span>
                  {" "}→{" "}
                  <span className="font-semibold text-slate-700">{formatSpread(game.odds.currentSpread)}</span>
                </span>
              )}
              {hasOpenTotalContext && (
                <span>
                  Open total: <span className="font-semibold text-slate-700">{formatTotal(game.odds.openingTotal)}</span>
                  {" "}→{" "}
                  <span className="font-semibold text-slate-700">{formatTotal(game.odds.currentTotal)}</span>
                </span>
              )}
            </div>
          )}
          {game.odds.currentSpread == null && game.odds.openingSpread == null && (
            <p className="mt-2 text-xs text-slate-500">No odds currently available.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="power-heading">
        <h2 id="power-heading" className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Power Comparison
        </h2>
        <CollegeFootballPowerComparison away={away} home={home} />
      </section>

      <section aria-labelledby="season-stats-heading">
        <h2
          id="season-stats-heading"
          className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500"
        >
          Season Stats
        </h2>
        {hasSeasonStats ? (
          <CollegeFootballSeasonStatsComparison away={away} home={home} />
        ) : (
          <div className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            2026 season statistics not yet available. This section will populate once box-score data is live.
          </div>
        )}
      </section>

      <section aria-labelledby="model-heading">
        <h2 id="model-heading" className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Power Rating Line
        </h2>
        <CollegeFootballModelPanel game={game} />
      </section>
    </div>
  );
}
