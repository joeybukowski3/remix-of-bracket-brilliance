import { Link, useParams } from "react-router-dom";
import { usePageSeo } from "@/hooks/usePageSeo";
import { getGamesForTeam, getTeamById, getTeamBySlug } from "@/data/cfb";
import {
  formatBooleanYesNo,
  formatNullableNumber,
  formatRank,
  formatSpread,
  getTeamPerspectiveSpread,
} from "@/lib/cfb/format";
import { getCfbRatingHeatClass } from "@/lib/cfb/ratingPresentation";
import { getSosHeatClass } from "@/lib/cfb/sosPresentation";
import { getCfbMatchupPath, CFB_BASE_PATH } from "@/lib/cfb/routes";
import { cn } from "@/lib/utils";
import CollegeFootballTeamHeader from "@/components/cfb/CollegeFootballTeamHeader";
import CollegeFootballTeamLogo from "@/components/cfb/CollegeFootballTeamLogo";
import CollegeFootballRatingCell from "@/components/cfb/CollegeFootballRatingCell";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";

function StatCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded border border-slate-200 bg-white px-2.5 py-2 text-slate-900", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function CollegeFootballTeamPage() {
  const { teamSlug = "" } = useParams();
  const team = getTeamBySlug(teamSlug);

  usePageSeo({
    title: team
      ? `${team.name} ${team.mascot} | College Football | Joe Knows Ball`
      : "Team Not Found | College Football",
    description: team
      ? `${team.name} ratings, roster context, schedule, and matchup links.`
      : "College Football team page.",
    path: `/college-football/team/${teamSlug}`,
  });

  if (!team) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-semibold text-slate-800">Team not found</p>
        <p className="mt-1 text-sm text-slate-500">No team matches “{teamSlug}”.</p>
        <Link to={CFB_BASE_PATH} className="mt-4 inline-block text-sm font-semibold text-sky-800 hover:underline">
          Back to College Football
        </Link>
      </div>
    );
  }

  const games = getGamesForTeam(team.id);
  const { ratings, context, stats } = team;

  return (
    <div className="space-y-5">
      <CollegeFootballTeamHeader team={team} />
      <CollegeFootballDataNotice kind="both" />

      <section aria-labelledby="team-ratings-heading">
        <h2 id="team-ratings-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Ratings
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCell
            label="Power"
            value={`${formatNullableNumber(ratings.jkbPowerRating)} · ${formatRank(ratings.jkbRank)}`}
            className={getCfbRatingHeatClass(ratings.jkbPowerRating)}
          />
          <StatCell
            label="Offense"
            value={formatNullableNumber(ratings.offensiveRating)}
            className={getCfbRatingHeatClass(ratings.offensiveRating)}
          />
          <StatCell
            label="Defense"
            value={formatNullableNumber(ratings.defensiveRating)}
            className={getCfbRatingHeatClass(ratings.defensiveRating)}
          />
          <StatCell
            label="SOS Played"
            value={
              ratings.sosPlayedRank != null
                ? formatRank(ratings.sosPlayedRank)
                : "—"
            }
            className={getSosHeatClass(ratings.sosPlayedRank)}
          />
          <StatCell
            label="SOS Remaining"
            value={
              ratings.sosRemainingRank != null
                ? formatRank(ratings.sosRemainingRank)
                : formatNullableNumber(ratings.sosRemainingRating)
            }
            className={getSosHeatClass(ratings.sosRemainingRank)}
          />
          <StatCell label="AP Rank" value={ratings.apRank == null ? "NR" : formatRank(ratings.apRank)} />
        </div>
        {ratings.sosPlayedRank == null && (
          <p className="mt-2 text-[11px] text-slate-500">
            Strength of schedule played will populate once games are completed.
          </p>
        )}
      </section>

      <section aria-labelledby="team-context-heading">
        <h2 id="team-context-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Team Context
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {context.headCoach != null && (
            <StatCell
              label="Head Coach"
              value={
                context.headCoachYear != null
                  ? `${context.headCoach} (Y${context.headCoachYear})`
                  : context.headCoach
              }
            />
          )}
          {context.startingQuarterback != null && (
            <StatCell label="Starting QB" value={context.startingQuarterback} />
          )}
          {context.returningQuarterback != null && (
            <StatCell label="Returning QB" value={formatBooleanYesNo(context.returningQuarterback)} />
          )}
          {context.returningOffensiveStarters != null && (
            <StatCell label="Ret. Off Starters" value={String(context.returningOffensiveStarters)} />
          )}
          {context.returningDefensiveStarters != null && (
            <StatCell label="Ret. Def Starters" value={String(context.returningDefensiveStarters)} />
          )}
        </div>
        {context.headCoach == null &&
          context.startingQuarterback == null &&
          context.returningQuarterback == null && (
            <p className="text-sm text-slate-500">Team context not yet available.</p>
          )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="team-offense-heading">
          <h2 id="team-offense-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Offense
          </h2>
          {stats.pointsPerGame == null ? (
            <p className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
              2026 statistics not yet available.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatCell label="PPG" value={formatNullableNumber(stats.pointsPerGame)} />
              <StatCell label="Yards/Play" value={formatNullableNumber(stats.yardsPerPlay)} />
              <StatCell label="Rush Yds/G" value={formatNullableNumber(stats.rushYardsPerGame, 0)} />
              <StatCell label="Yards/Rush" value={formatNullableNumber(stats.yardsPerRush)} />
              <StatCell label="Pass Yds/G" value={formatNullableNumber(stats.passYardsPerGame, 0)} />
              <StatCell label="Yards/Pass" value={formatNullableNumber(stats.yardsPerPass)} />
            </div>
          )}
        </section>

        <section aria-labelledby="team-defense-heading">
          <h2 id="team-defense-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Defense
          </h2>
          {stats.pointsAllowedPerGame == null ? (
            <p className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
              2026 statistics not yet available.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatCell label="PPG Allowed" value={formatNullableNumber(stats.pointsAllowedPerGame)} />
              <StatCell label="Yds/Play All." value={formatNullableNumber(stats.yardsPerPlayAllowed)} />
              <StatCell label="Rush All./G" value={formatNullableNumber(stats.rushYardsAllowedPerGame, 0)} />
              <StatCell label="Yds/Rush All." value={formatNullableNumber(stats.yardsPerRushAllowed)} />
              <StatCell label="Pass All./G" value={formatNullableNumber(stats.passYardsAllowedPerGame, 0)} />
              <StatCell label="Yds/Pass All." value={formatNullableNumber(stats.yardsPerPassAllowed)} />
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="team-schedule-heading">
        <h2 id="team-schedule-heading" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Schedule
        </h2>
        {games.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
            No scheduled games are available for this team.
          </p>
        ) : (
          <div
            role="region"
            aria-label={`${team.name} schedule`}
            tabIndex={0}
            className="overflow-x-auto rounded-lg border border-slate-200 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
          >
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="bg-slate-100 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                  <th scope="col" className="px-2 py-2 text-left">Date</th>
                  <th scope="col" className="px-2 py-2 text-left">Opponent</th>
                  <th scope="col" className="px-2 py-2 text-center">Site</th>
                  <th scope="col" className="px-2 py-2 text-center">Opp Pwr</th>
                  <th scope="col" className="px-2 py-2 text-center">Spread</th>
                  <th scope="col" className="px-2 py-2 text-center">Result</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const isHome = game.homeTeamId === team.id;
                  const oppId = isHome ? game.awayTeamId : game.homeTeamId;
                  const opp = getTeamById(oppId);
                  const opponentName = opp?.shortName ??
                    (isHome ? game.awayTeamName : game.homeTeamName) ??
                    oppId;
                  const site = game.neutralSite ? "Neutral" : isHome ? "Home" : "Away";
                  const result =
                    game.gameStatus === "final" &&
                    game.awayScore != null &&
                    game.homeScore != null
                      ? (() => {
                          const teamScore = isHome ? game.homeScore : game.awayScore;
                          const opponentScore = isHome ? game.awayScore : game.homeScore;
                          const outcome = teamScore === opponentScore ? "T" : teamScore > opponentScore ? "W" : "L";
                          return `${outcome} ${teamScore}–${opponentScore}`;
                        })()
                      : "—";
                  const spread = formatSpread(getTeamPerspectiveSpread(game, team.id));
                  return (
                    <tr key={game.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-2 tabular-nums text-slate-600">
                        {game.date}{game.time ? ` · ${game.time} ET` : ""}
                      </td>
                      <td className="p-0">
                        {opp ? <Link
                          to={getCfbMatchupPath(game.id)}
                          className="flex items-center gap-2 px-2 py-2 font-semibold text-slate-800 hover:text-sky-800 hover:underline"
                        >
                          {opp && (
                            <CollegeFootballTeamLogo
                              name={opp.name}
                              logo={opp.logo}
                              abbreviation={opp.abbreviation}
                              primaryColor={opp.primaryColor}
                              size="sm"
                            />
                          )}
                          {opponentName}
                        </Link> : <span className="flex items-center gap-2 px-2 py-2 font-semibold text-slate-800">
                          {opponentName}
                        </span>}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-600">{site}</td>
                      <td className="px-2 py-2 text-center">
                        <CollegeFootballRatingCell
                          value={opp?.ratings.jkbPowerRating}
                          rank={opp?.ratings.jkbRank}
                        />
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-700">{spread}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-slate-700">{result}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
