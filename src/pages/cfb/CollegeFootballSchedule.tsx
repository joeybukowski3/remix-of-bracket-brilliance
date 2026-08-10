import { useMemo, useState } from "react";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  CFB_CONFERENCE_ORDER,
  CFB_CONFERENCES,
  CFB_GAMES_2026,
  CFB_PROVENANCE,
  getAvailableWeeks,
  getTeamById,
} from "@/data/cfb";
import type { CfbConferenceId, CfbGame } from "@/data/cfb/types";
import CollegeFootballPageHeader from "@/components/cfb/CollegeFootballPageHeader";
import CollegeFootballWeekSelector from "@/components/cfb/CollegeFootballWeekSelector";
import CollegeFootballGameCard from "@/components/cfb/CollegeFootballGameCard";
import type { CfbScheduleParticipant } from "@/components/cfb/CollegeFootballGameCard";
import CollegeFootballDataNotice from "@/components/cfb/CollegeFootballDataNotice";
import { cn } from "@/lib/utils";

type ConfFilter = CfbConferenceId | "all";

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
    ratings: { teamId: id, jkbRank: null, previousJkbRank: null, jkbPowerRating: null, offensiveRating: null, defensiveRating: null, sosPlayedRating: null, sosPlayedRank: null, sosRemainingRating: null, sosRemainingRank: null },
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

  const filters: { id: ConfFilter; label: string }[] = [
    { id: "all", label: "All" },
    ...CFB_CONFERENCE_ORDER.map((id) => ({
      id,
      label: CFB_CONFERENCES[id].shortName,
    })),
  ];

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

      <div role="group" aria-label="Filter by conference" className="flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const selected = conference === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setConference(f.id)}
              className={cn(
                "rounded border px-2 py-1 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
              )}
            >
              {f.label}
            </button>
          );
        })}
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
