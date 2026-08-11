import { Link } from "react-router-dom";
import NflTeamCrest from "@/components/nfl/matchups/NflTeamCrest";
import {
  formatMoneyline,
  formatSpread,
  formatTotal,
  hasAnyMarket,
  type MarketCurrentGame,
} from "@/lib/nfl/marketData";
import { MATCHUP_SECTION_SCROLL_MT } from "@/lib/nfl/matchupSections";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";
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
      className={`flex min-w-0 items-center gap-3 ${isEnd ? "lg:flex-row-reverse lg:text-right" : ""}`}
    >
      <NflTeamCrest team={team} side={side} size={44} />
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
          {side === "away" ? "Away" : "Home"}
        </div>
        {/* Wraps rather than truncates: at 390px each block is ~250px wide and
            an ellipsis would clip a real franchise name.
            The name stays a link to the team's canonical dashboard route, which
            is the analyzer's only route out to a single team. */}
        <Link
          to={`/nfl/guide/team/${team.slug}`}
          className="block text-base font-bold leading-5 tracking-tight text-slate-900 hover:text-emerald-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:text-lg"
        >
          {team.teamName}
        </Link>
        <div className="mt-0.5 text-[11px] font-semibold text-slate-600">
          <span className="tabular-nums">{team.record2025 || NA}</span> in 2025 · {team.division}
        </div>
      </div>
    </div>
  );
}

/** One market figure. An unpriced field reads as a muted N/A, never as a line. */
function MarketCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  const unavailable = value === NA;
  return (
    <div className="min-w-0 bg-white px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-600">{label}</div>
      <div
        className={`mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[15px] font-bold leading-5 tabular-nums ${
          unavailable ? "text-slate-600" : "text-slate-900"
        }`}
      >
        {value}
        {detail && !unavailable && (
          <span className="text-[11px] font-semibold text-slate-600">{detail}</span>
        )}
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
}: {
  matchup: NflMatchup;
  market: MarketCurrentGame | null;
}) {
  const { away, home } = matchup;
  const priced = hasAnyMarket(market);

  const awaySpread = formatSpread(market?.spread.away ?? null);
  const homeSpread = formatSpread(market?.spread.home ?? null);
  // The favourite carries the negative number; showing that side keeps the
  // strip to one line without implying the other side is unpriced.
  const favouredIsHome = (market?.spread.home ?? 0) < 0;
  const spreadValue = !priced
    ? NA
    : favouredIsHome
      ? `${home.abbr.toUpperCase()} ${homeSpread}`
      : `${away.abbr.toUpperCase()} ${awaySpread}`;

  const awayMl = formatMoneyline(market?.moneyline.away ?? null);
  const homeMl = formatMoneyline(market?.moneyline.home ?? null);
  const moneylineValue = !priced
    ? NA
    : favouredIsHome
      ? `${home.abbr.toUpperCase()} ${homeMl}`
      : `${away.abbr.toUpperCase()} ${awayMl}`;
  const moneylineDetail = !priced
    ? undefined
    : favouredIsHome
      ? `${away.abbr.toUpperCase()} ${awayMl}`
      : `${home.abbr.toUpperCase()} ${homeMl}`;

  return (
    <section
      id="matchup-header"
      tabIndex={-1}
      aria-labelledby="matchup-heading"
      className={`${MATCHUP_SECTION_SCROLL_MT} rounded-lg border border-slate-200 bg-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:p-4`}
    >
      <h1 id="matchup-heading" className="sr-only">
        {away.teamName} at {home.teamName} — Week {matchup.week} matchup
      </h1>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-5">
        <TeamIdentity team={away} side="away" align="start" />
        <span
          aria-hidden
          className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300 lg:block"
        >
          At
        </span>
        <TeamIdentity team={home} side="home" align="end" />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-600">
        <span>{kickoffLabel(matchup.kickoffUtc)}</span>
        <span>{matchup.stadium ?? "Venue TBD"}</span>
        <span>
          Week {matchup.week}, {matchup.season}
        </span>
      </div>

      {priced ? (
        <div className="mt-3 grid gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          <MarketCell label="Spread" value={spreadValue} />
          <MarketCell label="Moneyline" value={moneylineValue} detail={moneylineDetail} />
          <MarketCell label="Total" value={formatTotal(market?.total)} />
          <div className="flex flex-col justify-center gap-0.5 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              Market line · nflverse
            </span>
            <span className="text-slate-600">
              A single source-published line; book composition is not disclosed.
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[12px] font-bold text-slate-700">
            No market line published for this game yet.
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
            Spread, moneyline and total are each sourced independently and none has been priced.
            Nothing is estimated in their place.
          </p>
        </div>
      )}
    </section>
  );
}
