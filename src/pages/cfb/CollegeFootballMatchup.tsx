import { Link, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getGameById, getTeamById } from "@/data/cfb";
import {
  formatMoneyline,
  formatNullableNumber,
  formatRank,
  formatSpread,
  formatTotal,
} from "@/lib/cfb/format";
import { CFB_SCHEDULE_PATH, getCfbTeamPath } from "@/lib/cfb/routes";
import CollegeFootballTeamLogo from "@/components/cfb/CollegeFootballTeamLogo";
import CollegeFootballOddsDisplay from "@/components/cfb/CollegeFootballOddsDisplay";
import CollegeFootballComparisonRow, {
  higherIsBetterEdge,
  lowerIsBetterEdge,
} from "@/components/cfb/CollegeFootballComparisonRow";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";

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

  const modelReady =
    game.model.jkbPowerLine != null || game.model.jkbProjectedSpread != null;

  return (
    <div className="space-y-5">
      <CollegeFootballDataNotice kind="both" />
      <header className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Link
            to={getCfbTeamPath(away.slug)}
            className="flex flex-col items-center gap-2 text-center hover:opacity-90"
          >
            <CollegeFootballTeamLogo
              name={away.name}
              logo={away.logo}
              abbreviation={away.abbreviation}
              primaryColor={away.primaryColor}
              size="lg"
              className="h-12 w-12"
            />
            <span className="text-sm font-bold text-slate-900">{away.name}</span>
            <span className="text-[11px] text-slate-500">{formatRank(away.ratings.jkbRank)} JKB</span>
          </Link>

          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {game.neutralSite ? "Neutral Site" : "vs"}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {game.date}
              {game.time ? ` · ${game.time} ET` : ""}
            </p>
            {game.venue && (
              <p className="mt-0.5 text-[11px] text-slate-500">{game.venue}</p>
            )}
            {game.tvNetwork && (
              <p className="mt-1 text-[11px] font-semibold text-slate-600">{game.tvNetwork}</p>
            )}
          </div>

          <Link
            to={getCfbTeamPath(home.slug)}
            className="flex flex-col items-center gap-2 text-center hover:opacity-90"
          >
            <CollegeFootballTeamLogo
              name={home.name}
              logo={home.logo}
              abbreviation={home.abbreviation}
              primaryColor={home.primaryColor}
              size="lg"
              className="h-12 w-12"
            />
            <span className="text-sm font-bold text-slate-900">{home.name}</span>
            <span className="text-[11px] text-slate-500">{formatRank(home.ratings.jkbRank)} JKB</span>
          </Link>
        </div>
      </header>

      <section aria-labelledby="market-heading">
        <h2 id="market-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Market
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <CollegeFootballOddsDisplay odds={game.odds} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500 sm:grid-cols-4">
            <div>
              Open spread:{" "}
              <span className="font-semibold text-slate-700">
                {formatSpread(game.odds.openingSpread)}
              </span>
            </div>
            <div>
              Current:{" "}
              <span className="font-semibold text-slate-700">
                {formatSpread(game.odds.currentSpread)}
              </span>
            </div>
            <div>
              Open total:{" "}
              <span className="font-semibold text-slate-700">
                {formatTotal(game.odds.openingTotal)}
              </span>
            </div>
            <div>
              ML:{" "}
              <span className="font-semibold text-slate-700">
                {formatMoneyline(game.odds.awayMoneyline)} / {formatMoneyline(game.odds.homeMoneyline)}
              </span>
            </div>
          </div>
          {game.odds.currentSpread == null && game.odds.openingSpread == null && (
            <p className="mt-2 text-xs text-slate-500">No odds currently available.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="power-heading">
        <h2 id="power-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Power Comparison
        </h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <div className="text-right">{away.shortName}</div>
            <div className="min-w-[7rem] text-center">Metric</div>
            <div className="text-left">{home.shortName}</div>
          </div>
          <CollegeFootballComparisonRow
            label="JKB Power"
            awayValue={formatNullableNumber(away.ratings.jkbPowerRating)}
            homeValue={formatNullableNumber(home.ratings.jkbPowerRating)}
            edge={higherIsBetterEdge(away.ratings.jkbPowerRating, home.ratings.jkbPowerRating)}
          />
          <CollegeFootballComparisonRow
            label="JKB Rank"
            awayValue={formatRank(away.ratings.jkbRank)}
            homeValue={formatRank(home.ratings.jkbRank)}
            edge={lowerIsBetterEdge(away.ratings.jkbRank, home.ratings.jkbRank)}
          />
          <CollegeFootballComparisonRow
            label="Offense"
            awayValue={formatNullableNumber(away.ratings.offensiveRating)}
            homeValue={formatNullableNumber(home.ratings.offensiveRating)}
            edge={higherIsBetterEdge(away.ratings.offensiveRating, home.ratings.offensiveRating)}
          />
          <CollegeFootballComparisonRow
            label="Defense"
            awayValue={formatNullableNumber(away.ratings.defensiveRating)}
            homeValue={formatNullableNumber(home.ratings.defensiveRating)}
            edge={higherIsBetterEdge(away.ratings.defensiveRating, home.ratings.defensiveRating)}
          />
          <CollegeFootballComparisonRow
            label="SOS Played"
            awayValue={formatRank(away.ratings.sosPlayedRank)}
            homeValue={formatRank(home.ratings.sosPlayedRank)}
            edge={lowerIsBetterEdge(away.ratings.sosPlayedRank, home.ratings.sosPlayedRank)}
          />
          <CollegeFootballComparisonRow
            label="SOS Remaining"
            awayValue={formatRank(away.ratings.sosRemainingRank)}
            homeValue={formatRank(home.ratings.sosRemainingRank)}
            edge={lowerIsBetterEdge(away.ratings.sosRemainingRank, home.ratings.sosRemainingRank)}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Edge markers highlight the stronger side for comparison only — not a betting recommendation.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="off-comp-heading">
          <h2 id="off-comp-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Offense
          </h2>
          {away.stats.pointsPerGame == null && home.stats.pointsPerGame == null ? (
            <p className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
              2026 statistics not yet available.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <CollegeFootballComparisonRow
                label="PPG"
                awayValue={formatNullableNumber(away.stats.pointsPerGame)}
                homeValue={formatNullableNumber(home.stats.pointsPerGame)}
                edge={higherIsBetterEdge(away.stats.pointsPerGame, home.stats.pointsPerGame)}
              />
              <CollegeFootballComparisonRow
                label="Yards/Play"
                awayValue={formatNullableNumber(away.stats.yardsPerPlay)}
                homeValue={formatNullableNumber(home.stats.yardsPerPlay)}
                edge={higherIsBetterEdge(away.stats.yardsPerPlay, home.stats.yardsPerPlay)}
              />
              <CollegeFootballComparisonRow
                label="Rush Yds/G"
                awayValue={formatNullableNumber(away.stats.rushYardsPerGame, 0)}
                homeValue={formatNullableNumber(home.stats.rushYardsPerGame, 0)}
                edge={higherIsBetterEdge(away.stats.rushYardsPerGame, home.stats.rushYardsPerGame)}
              />
              <CollegeFootballComparisonRow
                label="Yards/Rush"
                awayValue={formatNullableNumber(away.stats.yardsPerRush)}
                homeValue={formatNullableNumber(home.stats.yardsPerRush)}
                edge={higherIsBetterEdge(away.stats.yardsPerRush, home.stats.yardsPerRush)}
              />
              <CollegeFootballComparisonRow
                label="Pass Yds/G"
                awayValue={formatNullableNumber(away.stats.passYardsPerGame, 0)}
                homeValue={formatNullableNumber(home.stats.passYardsPerGame, 0)}
                edge={higherIsBetterEdge(away.stats.passYardsPerGame, home.stats.passYardsPerGame)}
              />
              <CollegeFootballComparisonRow
                label="Yards/Pass"
                awayValue={formatNullableNumber(away.stats.yardsPerPass)}
                homeValue={formatNullableNumber(home.stats.yardsPerPass)}
                edge={higherIsBetterEdge(away.stats.yardsPerPass, home.stats.yardsPerPass)}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="def-comp-heading">
          <h2 id="def-comp-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Defense
          </h2>
          {away.stats.pointsAllowedPerGame == null && home.stats.pointsAllowedPerGame == null ? (
            <p className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
              2026 statistics not yet available.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <CollegeFootballComparisonRow
                label="PPG Allowed"
                awayValue={formatNullableNumber(away.stats.pointsAllowedPerGame)}
                homeValue={formatNullableNumber(home.stats.pointsAllowedPerGame)}
                edge={lowerIsBetterEdge(away.stats.pointsAllowedPerGame, home.stats.pointsAllowedPerGame)}
              />
              <CollegeFootballComparisonRow
                label="Yds/Play All."
                awayValue={formatNullableNumber(away.stats.yardsPerPlayAllowed)}
                homeValue={formatNullableNumber(home.stats.yardsPerPlayAllowed)}
                edge={lowerIsBetterEdge(away.stats.yardsPerPlayAllowed, home.stats.yardsPerPlayAllowed)}
              />
              <CollegeFootballComparisonRow
                label="Rush All./G"
                awayValue={formatNullableNumber(away.stats.rushYardsAllowedPerGame, 0)}
                homeValue={formatNullableNumber(home.stats.rushYardsAllowedPerGame, 0)}
                edge={lowerIsBetterEdge(away.stats.rushYardsAllowedPerGame, home.stats.rushYardsAllowedPerGame)}
              />
              <CollegeFootballComparisonRow
                label="Yds/Rush All."
                awayValue={formatNullableNumber(away.stats.yardsPerRushAllowed)}
                homeValue={formatNullableNumber(home.stats.yardsPerRushAllowed)}
                edge={lowerIsBetterEdge(away.stats.yardsPerRushAllowed, home.stats.yardsPerRushAllowed)}
              />
              <CollegeFootballComparisonRow
                label="Pass All./G"
                awayValue={formatNullableNumber(away.stats.passYardsAllowedPerGame, 0)}
                homeValue={formatNullableNumber(home.stats.passYardsAllowedPerGame, 0)}
                edge={lowerIsBetterEdge(away.stats.passYardsAllowedPerGame, home.stats.passYardsAllowedPerGame)}
              />
              <CollegeFootballComparisonRow
                label="Yds/Pass All."
                awayValue={formatNullableNumber(away.stats.yardsPerPassAllowed)}
                homeValue={formatNullableNumber(home.stats.yardsPerPassAllowed)}
                edge={lowerIsBetterEdge(away.stats.yardsPerPassAllowed, home.stats.yardsPerPassAllowed)}
              />
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="power-line-heading">
        <h2 id="power-line-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Power Rating Line
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {modelReady ? (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>Neutral Power Diff: {formatNullableNumber(game.model.neutralPowerDifference)}</div>
              <div>Home Field Adj: {formatNullableNumber(game.model.homeFieldAdjustment)}</div>
              <div>JKB Power Line: {formatSpread(game.model.jkbPowerLine)}</div>
              <div>Market Spread: {formatSpread(game.odds.currentSpread)}</div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">Model projection coming soon</p>
              <p className="mt-1 text-xs text-slate-500">
                Power-line fields (neutral difference, home-field adjustment, JKB line vs market) are
                structured for Phase 2 and intentionally not calculated yet.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
