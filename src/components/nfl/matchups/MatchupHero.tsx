import { Link } from "react-router-dom";
import MatchupRankBadge from "@/components/nfl/matchups/MatchupRankBadge";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import {
  formatHeroModelRating,
  unavailableHeroModelRatings,
  type HeroModelRating,
  type HeroModelRatingResolver,
} from "@/lib/nfl/heroModelRatings";
import {
  formatMarketFavoriteSpread,
  formatTotal,
  type MarketCurrentGame,
} from "@/lib/nfl/marketData";
import { MATCHUP_SECTION_SCROLL_MT } from "@/lib/nfl/matchupSections";
import { kickoffLabel } from "@/pages/NFLSchedule";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

const NA = "N/A";

/** One labelled rank chip inside a team block. */
function RankStat({
  label,
  shortLabel,
  rank,
  value,
}: {
  label: string;
  /** Three-letter form; the full label would clip at 375px. */
  shortLabel: string;
  rank: number | null;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
        <span aria-hidden>{shortLabel}</span>
        <span className="sr-only">{label}</span>
      </span>
      {/* Value first: the rating is the statistic, the rank is context for it.
          Printing the chip above the number made rank read as the headline. */}
      <span className="text-[13px] font-bold leading-4 tabular-nums text-slate-900">{value}</span>
      <MatchupRankBadge rank={rank} />
    </div>
  );
}

function TeamBlock({
  team,
  label,
  align,
  model,
}: {
  team: NflMatchupTeam;
  label: string;
  align: "start" | "end";
  /** Generated v0.3 rating for this team; null renders N/A rather than a stale static value. */
  model: HeroModelRating | null;
}) {
  const isEnd = align === "end";
  return (
    <div className={`min-w-0 ${isEnd ? "lg:text-right" : ""}`}>
      <div className={`flex min-w-0 items-center gap-2.5 ${isEnd ? "lg:flex-row-reverse" : ""}`}>
        <img
          src={nflLogoUrl(team.abbr)}
          alt=""
          aria-hidden
          className="h-8 w-8 shrink-0 object-contain sm:h-11 sm:w-11 lg:h-12 lg:w-12"
        />
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
            {label}
          </div>
          {/* Wraps rather than truncates: at 375px each team block is ~170px
              wide, where truncation would render "New Eng…". */}
          <Link
            to={`/nfl/guide/team/${team.slug}`}
            className="block text-sm font-bold leading-4 text-slate-900 hover:text-emerald-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:text-base sm:leading-5 lg:truncate lg:text-lg"
          >
            {team.teamName}
          </Link>
          <div className="truncate text-[10px] font-bold text-slate-500">{team.division}</div>
        </div>
      </div>

      <div
        className={`mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/40 px-2 py-1.5 ${
          isEnd ? "lg:text-right" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-1 sm:justify-around">
          <RankStat
            label="Overall power rank"
            shortLabel="OVR"
            rank={model?.rank ?? null}
            value={formatHeroModelRating(model?.rating)}
          />
          <RankStat
            label="Offense rank"
            shortLabel="OFF"
            rank={model?.offenseRank ?? null}
            value={formatHeroModelRating(model?.offenseRating)}
          />
          <RankStat
            label="Defense rank"
            shortLabel="DEF"
            rank={model?.defenseRank ?? null}
            value={formatHeroModelRating(model?.defenseRating)}
          />
        </div>
      </div>

      <dl className={`mt-1.5 flex gap-x-3 text-[10px] ${isEnd ? "lg:justify-end" : ""}`}>
        <div className="flex gap-1">
          <dt className="font-bold uppercase tracking-wide text-slate-400">2025</dt>
          <dd className="font-bold tabular-nums text-slate-700">{team.record2025 || NA}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-bold uppercase tracking-wide text-slate-400">Proj W</dt>
          <dd className="font-bold tabular-nums text-slate-700">
            {team.projectedWins == null ? NA : team.projectedWins.toFixed(1)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * A market value in the centre block. Unavailable reads as a muted N/A rather
 * than an emphasised chip, so a missing line never looks like a published one.
 */
function MarketFact({ value }: { value: string }) {
  const unavailable = value === NA;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
        unavailable ? "text-slate-400" : "bg-slate-900 text-white"
      }`}
    >
      {value}
    </span>
  );
}

/** A single label/value pair in the centre game-information block. */
function GameFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-center text-[11px] font-bold leading-4 text-slate-700">{children}</dd>
    </div>
  );
}

/**
 * Compact matchup hero: away identity, centre game information, home identity.
 *
 * Only fields the repository can actually source are rendered. Current record,
 * home/away splits, rest advantage and previous/next result are intentionally
 * absent rather than shown as invented values.
 *
 * Spread and total come from the same published market artifact the Spread &
 * Market section reads. They previously came from the static schedule's
 * always-null `matchup.spread`, so the hero announced "N/A" for a game the
 * section below priced at SEA -3.5 — one page contradicting itself.
 *
 * The Joe Knows Ball block shows generated neutral-field team-strength ratings
 * from the active power model (nfl-power-v0.3.1), on the model's 1-99 public
 * scale centred on 50 — not a percentage, and not a game prediction. No
 * projected spread, win probability, model edge or picked winner appears here;
 * the projection lives in Model Analysis and is not duplicated up here.
 */
export default function MatchupHero({
  matchup,
  modelRatings = unavailableHeroModelRatings,
  market = null,
}: {
  matchup: NflMatchup;
  modelRatings?: HeroModelRatingResolver;
  /** Current published line, so the hero states what the market section states. */
  market?: MarketCurrentGame | null;
}) {
  const { away, home } = matchup;

  return (
    <section
      id="overview"
      tabIndex={-1}
      aria-labelledby="overview-heading"
      className={`${MATCHUP_SECTION_SCROLL_MT} rounded-xl border border-slate-200 bg-white p-3 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:p-4`}
    >
      <h1 id="overview-heading" className="sr-only">
        {away.teamName} at {home.teamName} — Week {matchup.week} matchup
      </h1>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-5">
        <TeamBlock team={away} label="Away" align="start" model={modelRatings(away.abbr)} />

        <div className="order-last col-span-2 border-t border-slate-100 pt-3 lg:order-none lg:col-span-1 lg:min-w-[13rem] lg:border-l lg:border-t-0 lg:px-5 lg:pt-0">
          <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            Week {matchup.week}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-1">
            <GameFact label="Kickoff">{kickoffLabel(matchup.kickoffUtc)}</GameFact>
            <GameFact label="Venue">{matchup.stadium ?? "TBD"}</GameFact>
            <GameFact label="Spread">
              <MarketFact value={formatMarketFavoriteSpread(market)} />
            </GameFact>
            <GameFact label="Total">
              <MarketFact value={formatTotal(market?.total)} />
            </GameFact>
          </dl>
        </div>

        <TeamBlock team={home} label="Home" align="end" model={modelRatings(home.abbr)} />
      </div>
    </section>
  );
}
