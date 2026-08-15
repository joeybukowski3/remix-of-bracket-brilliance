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
      <NflTeamCrest team={team} side={side} size={56} />
      <div className="min-w-0">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-slate-400">
          {side === "away" ? "Away" : "Home"}
        </div>
        {/* Wraps rather than truncates: at 390px each block is ~250px wide and
            an ellipsis would clip a real franchise name.
            The name stays a link to the team's canonical dashboard route, which
            is the analyzer's only route out to a single team. */}
        <Link
          to={`/nfl/guide/team/${team.slug}`}
          className="block text-[20px] font-extrabold leading-tight tracking-[-0.02em] text-slate-900 hover:text-emerald-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:text-[26px]"
        >
          {team.teamName}
        </Link>
        <div className="mt-1 text-[13px] font-medium text-slate-500">
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
  crest,
  accentClass = "border-l-slate-400",
}: {
  label: string;
  value: string;
  detail?: string;
  /** Optional inline crest. Presentation only — names no new figure. */
  crest?: React.ReactNode;
  accentClass?: string;
}) {
  const unavailable = value === NA;
  return (
    <div
      className={`min-w-0 rounded-[10px] border border-slate-300 border-l-[5px] bg-slate-50 px-4 py-3 ${
        unavailable ? "border-l-slate-300" : accentClass
      }`}
    >
      <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        {crest}
        <div className="min-w-0">
          <div
            className={`text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums ${
              unavailable ? "text-slate-400" : "text-slate-900"
            }`}
          >
            {value}
          </div>
          {detail && !unavailable && (
            <div className="mt-1 text-[12px] font-medium text-slate-500">{detail}</div>
          )}
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
  const favoured = favouredIsHome ? home : away;
  const favouredSide = favouredIsHome ? "home" : "away";
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
      className={`${MATCHUP_SECTION_SCROLL_MT} rounded-[14px] border border-slate-300 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:p-6`}
    >
      <h1 id="matchup-heading" className="sr-only">
        {away.teamName} at {home.teamName} — Week {matchup.week} matchup
      </h1>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-5">
        <TeamIdentity team={away} side="away" align="start" />
        <span
          aria-hidden
          className="hidden text-[15px] font-extrabold uppercase tracking-[0.14em] text-slate-300 lg:block"
        >
          At
        </span>
        <TeamIdentity team={home} side="home" align="end" />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium text-slate-500">
        <span>{kickoffLabel(matchup.kickoffUtc)}</span>
        <span>{matchup.stadium ?? "Venue TBD"}</span>
        <span>
          Week {matchup.week}, {matchup.season}
        </span>
      </div>

      {priced ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* The favoured side's crest and accent, per the reference. Both are
              read from the spread already computed above — no new figure. */}
          <MarketCell
            label="Spread"
            value={spreadValue}
            crest={<NflTeamCrest team={favoured} side={favouredSide} size={30} />}
            accentClass="border-l-emerald-700"
          />
          <MarketCell
            label="Moneyline"
            value={moneylineValue}
            detail={moneylineDetail}
            crest={<NflTeamCrest team={favoured} side={favouredSide} size={30} />}
            accentClass="border-l-emerald-700"
          />
          <MarketCell label="Total" value={formatTotal(market?.total)} detail="Over / Under" />
          <div className="rounded-[10px] border border-emerald-200 border-l-[5px] border-l-emerald-700 bg-emerald-50 px-4 py-3">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-emerald-700">
              Market Line
            </div>
            <div className="mt-1.5 text-[16px] font-extrabold text-emerald-900">nflverse</div>
            <p className="mt-1 text-[12px] leading-4 text-emerald-800">
              A single source-published line; book composition is not disclosed.
            </p>
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
