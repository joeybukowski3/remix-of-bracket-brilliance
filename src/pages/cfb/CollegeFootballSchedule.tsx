import { useMemo, useState } from "react";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  CFB_CONFERENCES,
  CFB_GAMES_2026,
  CFB_PROVENANCE,
  getAvailableWeeks,
  getTeamById,
} from "@/data/cfb";
import type { CfbGame } from "@/data/cfb/types";
import CollegeFootballPageHeader from "@/components/cfb/CollegeFootballPageHeader";
import CollegeFootballWeekSelector from "@/components/cfb/CollegeFootballWeekSelector";
import CollegeFootballConferenceSelector, {
  type CfbConferenceFilter,
} from "@/components/cfb/CollegeFootballConferenceSelector";
import CollegeFootballGameCard from "@/components/cfb/CollegeFootballGameCard";
import type { CfbScheduleParticipant } from "@/components/cfb/CollegeFootballGameCard";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";

type ConfFilter = CfbConferenceFilter;

function gameInvolvesConference(game: CfbGame, conf: ConfFilter): boolean {
  if (conf === "all") return true;
  const away = getTeamById(game.awayTeamId);
  const home = getTeamById(game.homeTeamId);
  return away?.conference === conf || home?.conference === conf;
}

function externalParticipant(id: string, name: string | undefined): CfbScheduleParticipant {
  const displayName = name ?? "Non-FBS opponent";
  const abbreviation = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 4).toUpperCase();
  return {
    id,
    name: displayName,
    shortName: displayName,
    abbreviation,
    primaryColor: "#64748b",
    logo: "",
    record: { teamId: id, wins: 0, losses: 0, ties: 0, conferenceWins: 0, conferenceLosses: 0, conferenceTies: 0, atsWins: null, atsLosses: null, overs: null, unders: null },
    ratings: { teamId: id, jkbRank: null, previousJkbRank: null, apRank: null, cfpRank: null, jkbPowerRating: null, offensiveRating: null, defensiveRating: null, sosPlayedRating: null, sosPlayedRank: null, sosRemainingRating: null, sosRemainingRank: null },
  };
}

export default function CollegeFootballSchedule() {
  const weeks = useMemo(() => getAvailableWeeks(), []);
  const [week, setWeek] = useState(() => weeks[0] ?? 0);
  const [conference, setConference] = useState<ConfFilter>("all");

  const games = useMemo(() => {
    return CFB_GAMES_2026.filter(
      (g) => g.week === week && gameInvolvesConference(g, conference),
    );
  }, [week, conference]);

  usePageSeo({
    title: "College Football Schedule | Joe Knows Ball",
    description:
      "Weekly College Football schedule with records, JKB ratings, and market odds when available.",
    path: "/college-football/schedule",
  });

  return (
    <>
      <CollegeFootballPageHeader
        eyebrow="College Football · Schedule"
        title={`${CFB_PROVENANCE.season} Schedule`}
        description="Select a week to browse games. Odds show — when unavailable. Each game opens the matchup analyzer."
      >
        <CollegeFootballWeekSelector weeks={weeks} value={week} onChange={setWeek} />
      </CollegeFootballPageHeader>

      <CollegeFootballDataNotice kind="both" />

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Filter by conference
        </span>
        <CollegeFootballConferenceSelector value={conference} onChange={setConference} />
      </div>

      {games.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500">
          No games scheduled for Week {week}
          {conference !== "all" ? ` in ${CFB_CONFERENCES[conference].name}` : ""}.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {games.map((game) => {
            const away = getTeamById(game.awayTeamId);
            const home = getTeamById(game.homeTeamId);
            const awayParticipant = away ?? externalParticipant(game.awayTeamId, game.awayTeamName);
            const homeParticipant = home ?? externalParticipant(game.homeTeamId, game.homeTeamName);
            return (
              <CollegeFootballGameCard
                key={game.id}
                game={game}
                away={awayParticipant}
                home={homeParticipant}
                matchupAvailable={Boolean(away && home)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
