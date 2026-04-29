import { useMemo } from "react";
import { Link } from "react-router-dom";
import PgaLeaderboardPreviewTable from "@/components/pga/PgaLeaderboardPreviewTable";
import { usePgaTournamentPlayers } from "@/hooks/usePgaTournamentPlayers";
import { rankPlayersByScore } from "@/lib/pga/modelEngine";
import { getPgaScheduleSelection } from "@/lib/pga/pgaSchedule";
import { getFeaturedPgaHubContext, NEXT_PGA_TOURNAMENT } from "@/lib/pga/tournaments";
import { getTournamentPicksPath } from "@/lib/pga/tournamentConfig";

const FEATURED_ROW_COUNT = 5;

export default function HomepagePgaFeature() {
  const featured = getFeaturedPgaHubContext();
  const tournament = featured.featuredPgaBoard;
  const nextTournament = NEXT_PGA_TOURNAMENT?.slug === tournament.slug ? null : NEXT_PGA_TOURNAMENT;
  const scheduleSelection = getPgaScheduleSelection();
  const { players, status, errorMessage } = usePgaTournamentPlayers(tournament);
  const defaultWeights = tournament.model.presets[0].weights;
  const rankedRows = useMemo(
    () => rankPlayersByScore(players, defaultWeights, tournament.manual?.playerAdjustments),
    [players, defaultWeights, tournament.manual?.playerAdjustments],
  );
  const rows = useMemo(
    () => rankedRows.slice(0, FEATURED_ROW_COUNT),
    [rankedRows],
  );
  const missingStatProfiles = Math.max(players.length - rankedRows.length, 0);

  const primaryStats = tournament.model.statColumns.slice(0, 3);
  const picksPath = getTournamentPicksPath(tournament);
  const modelPath = featured.modelPath;
  const narrative = tournament.manual?.featuredNarrative ?? tournament.summary?.blurb ?? tournament.hero.support;

  return (
    <section className="mx-auto w-full max-w-[1240px] px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[28px] border border-black/8 bg-white shadow-[0_18px_44px_rgba(17,17,17,0.08)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
          <div className="border-b border-black/8 px-6 py-6 sm:px-8 lg:border-b-0 lg:border-r">
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6a6a6a]">
              {tournament.homepageFeature?.eyebrow ?? "Current upcoming event"}
            </div>
            <h2 className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-[#111111] sm:text-[34px]">
              {tournament.name} power rankings
            </h2>
            <div className="mt-3 flex flex-wrap gap-2 text-[13px] text-[#666666]">
              <span>{tournament.courseName}</span>
              <span>&bull;</span>
              <span>{tournament.location}</span>
              {tournament.schedule?.weekLabel ? (
                <>
                  <span>&bull;</span>
                  <span>{tournament.schedule.weekLabel}</span>
                </>
              ) : null}
            </div>
            <p className="mt-5 max-w-[56ch] text-[15px] leading-7 text-[#4c4c4c]">{narrative}</p>

            {(tournament.manual?.courseFitNotes?.length ?? 0) > 0 ? (
              <div className="mt-5 grid gap-2">
                {tournament.manual?.courseFitNotes?.slice(0, 3).map((note) => (
                  <div key={note} className="rounded-2xl bg-[#f7f7f7] px-4 py-3 text-[14px] leading-6 text-[#4c4c4c]">
                    {note}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to={picksPath}
                className="inline-flex items-center rounded-full bg-[#111111] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-black"
              >
                {tournament.homepageFeature?.ctaLabel ?? "Open tournament page"}
              </Link>
              <Link
                to={modelPath}
                className="inline-flex items-center rounded-full border border-black/10 bg-white px-5 py-3 text-[14px] font-semibold text-[#111111] transition hover:bg-[#f7f7f7]"
              >
                Open full model
              </Link>
            </div>

            {nextTournament ? (
              <div className="mt-6 rounded-[22px] border border-black/8 bg-[#f8f8f8] p-4">
                <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6a6a6a]">Next Week&apos;s Event</div>
                <div className="mt-2 text-[20px] font-bold tracking-[-0.02em] text-[#111111]">{nextTournament.name}</div>
                <div className="mt-2 text-[14px] leading-6 text-[#5b5b5b]">
                  {nextTournament.courseName}
                  <span className="mx-2 text-[#9a9a9a]">&bull;</span>
                  {nextTournament.location}
                </div>
                {nextTournament.schedule?.weekLabel ? (
                  <div className="mt-1 text-[13px] text-[#6b6b6b]">{nextTournament.schedule.weekLabel}</div>
                ) : null}
                <div className="mt-4">
                  <Link
                    to={getTournamentPicksPath(nextTournament)}
                    className="inline-flex items-center rounded-full border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111111] transition hover:bg-[#f2f2f2]"
                  >
                    Open next week shell
                  </Link>
                </div>
              </div>
            ) : null}

            {scheduleSelection.alternateWeekEvents.length ? (
              <div className="mt-4 rounded-[20px] border border-black/8 bg-white px-4 py-3 text-[13px] leading-6 text-[#5b5b5b]">
                Same-week alternate events: {scheduleSelection.alternateWeekEvents.map((entry) => entry.name).join(" • ")}
              </div>
            ) : null}
          </div>

          <div className="px-4 py-5 sm:px-6 sm:py-6">
            <div className="rounded-[22px] border border-black/8 bg-[#fbfbfb] p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3 border-b border-black/8 px-3 pb-3">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6a6a6a]">Live preview</div>
                  <div className="mt-1 text-[18px] font-bold text-[#111111]">Current model leaderboard</div>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[#4c4c4c] shadow-[0_4px_12px_rgba(17,17,17,0.05)]">
                  {status === "ready" ? `${rows.length} shown` : "Loading"}
                </div>
              </div>

              {status === "loading" ? (
                <div className="px-3 py-8 text-sm text-[#666666]">Loading current tournament rankings...</div>
              ) : null}
              {status === "error" ? (
                <div className="px-3 py-8 text-sm text-[#666666]">
                  Unable to load the featured PGA table.
                  <div className="mt-2 text-[#8a8a8a]">{errorMessage}</div>
                </div>
              ) : null}
              {status === "ready" && rows.length === 0 ? (
                <div className="px-3 py-8 text-sm text-[#666666]">
                  Current tournament page is live. The featured leaderboard will populate automatically as soon as the latest field export is available.
                </div>
              ) : null}
              {status === "ready" && rows.length > 0 ? (
                <div>
                  {missingStatProfiles > 0 ? (
                    <div className="px-3 py-3 text-[12px] leading-6 text-[#666666]">
                      {missingStatProfiles} field entrants are currently withheld from the scored preview because the active source feed does not yet include a usable stat profile for them.
                    </div>
                  ) : null}
                  <PgaLeaderboardPreviewTable rows={rows} statColumns={primaryStats} totalRankCount={rankedRows.length} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
