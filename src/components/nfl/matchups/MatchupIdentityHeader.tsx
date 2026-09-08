import { Link } from "react-router-dom";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import MatchupMarketSummaryGrid from "@/components/nfl/matchups/MatchupMarketSummaryGrid";
import { MATCHUP_SECTION_SCROLL_MT } from "@/lib/nfl/matchupSections";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
import type { MarketCurrentGame } from "@/lib/nfl/marketData";
import type { GameProjection } from "@/lib/nfl/projectionData";
import type { TeamTotalProjection } from "@/lib/nfl/totalsProjectionData";
import { kickoffLabel } from "@/pages/NFLSchedule";

const NA = "N/A";

/**
 * One side's identity block.
 *
 * Only fields the repository can actually source appear: the crest, the side,
 * the team name, last season's record and the division. Current-season record,
 * home/away splits and rest advantage are absent rather than invented — the
 * schedule and guide data do not carry them.
 */
function TeamIdentity({
  team,
  side,
  align,
}: {
  team: NflMatchupTeam;
  side: "away" | "home";
  align: "start" | "end";
}) {
  const isEnd = align === "end";
  return (
    <div
      className={`matchup-team-identity matchup-team-identity--${side} flex min-w-0 items-center gap-3 ${isEnd ? "lg:flex-row-reverse lg:text-right" : ""}`}
    >
      <NflTeamCrest team={team} side={side} size={56} />
      <div className="min-w-0">
        <div className="matchup-team-identity__side text-[11px] font-extrabold uppercase tracking-[0.09em] text-slate-400">
          {team.abbr.toUpperCase()} · {side === "away" ? "Away" : "Home"}
        </div>
        {/* Wraps rather than truncates: at 390px each block is ~250px wide and
            an ellipsis would clip a real franchise name.
            The name stays a link to the team's canonical dashboard route, which
            is the analyzer's only route out to a single team. */}
        <Link
          to={`/nfl/guide/team/${team.slug}`}
          className="matchup-team-identity__name block text-[20px] font-extrabold leading-tight tracking-[-0.02em] text-slate-900 hover:text-emerald-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:text-[26px]"
        >
          {team.teamName}
        </Link>
        <div className="matchup-team-identity__record mt-1 text-[13px] font-medium text-slate-500">
          <span className="tabular-nums">{team.record2025 || NA}</span> in 2025 · {team.division}
        </div>
      </div>
    </div>
  );
}

/**
 * Matchup identity and current market — shared above the tabs on every tab.
 *
 * The market strip states this game's published line once, at the top of the
 * page, from the same artifact the rest of the page reads. Each field is
 * independent: a missing moneyline is never derived from the spread, and a game
 * with nothing priced yet says so plainly rather than showing a fabricated line.
 */
export default function MatchupIdentityHeader({
  matchup,
  market,
  projection = null,
  totalProjection = null,
  totalProjectionLoading = false,
}: {
  matchup: NflMatchup;
  market: MarketCurrentGame | null;
  projection?: GameProjection | null;
  totalProjection?: TeamTotalProjection | null;
  totalProjectionLoading?: boolean;
}) {
  const { away, home } = matchup;

  return (
    <section
      id="matchup-header"
      tabIndex={-1}
      aria-labelledby="matchup-heading"
      className={`${MATCHUP_SECTION_SCROLL_MT} matchup-identity rounded-[14px] border border-slate-300 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500`}
    >
      <h1 id="matchup-heading" className="sr-only">
        {away.teamName} at {home.teamName} — Week {matchup.week} matchup
      </h1>

      <div className="matchup-identity__main">
        <TeamIdentity team={away} side="away" align="start" />
        <div className="matchup-identity__versus" aria-label="at"><span aria-hidden>@</span></div>
        <TeamIdentity team={home} side="home" align="end" />
        <div className="matchup-identity__meta">
          <span>{kickoffLabel(matchup.kickoffUtc)}</span>
          <span>{matchup.stadium ?? "Venue TBD"}</span>
          <span>Week {matchup.week}, {matchup.season}</span>
        </div>
      </div>

      <MatchupMarketSummaryGrid
        matchup={matchup}
        market={market}
        projection={projection}
        totalProjection={totalProjection}
      />
      {totalProjectionLoading && !totalProjection && (
        <p className="matchup-market-grid__loading">Loading JKB projection…</p>
      )}
    </section>
  );
}
