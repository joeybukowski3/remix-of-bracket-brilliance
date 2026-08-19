import { Link } from "react-router-dom";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { kickoffLabel } from "@/pages/NFLSchedule";
import { formatMarketFavoriteSpread, type MarketCurrentGame } from "@/lib/nfl/marketData";
import {
  compareToMarket,
  formatModelVsMarketDifference,
  formatProjectedSpread,
  type GameProjection,
} from "@/lib/nfl/projectionData";
import type { NflMatchup, NflMatchupTeam } from "@/lib/nfl/matchups";

/** Universal current 2026 OVR/rank for one team, from useNflCurrentRating2026(). */
export type MatchupCardOvr = { rating: number; rank: number };

/**
 * "#4 · 67.5" — universal rank primary, current rating secondary. Never the
 * legacy guide-derived powerRank/overallPct that used to render here (that
 * was a frozen 2025-preseason value competing with the live universal
 * rating shown everywhere else on the site).
 */
function ratingLine(ovr: MatchupCardOvr | null): string {
  if (!ovr) return "NR";
  return `#${ovr.rank} · ${ovr.rating.toFixed(1)}`;
}

function TeamLine({ team, prefix, ovr }: { team: NflMatchupTeam; prefix?: string; ovr: MatchupCardOvr | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={nflLogoUrl(team.abbr)} alt="" aria-hidden className="h-9 w-9 shrink-0 object-contain" loading="lazy" />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold leading-5 text-slate-900">
          {prefix && <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{prefix}</span>}
          {team.teamName}
        </div>
        <div className="text-[11px] font-bold tabular-nums text-slate-500">
          <span className="text-[9px] uppercase tracking-wider text-slate-400">Power </span>
          {ratingLine(ovr)}
        </div>
      </div>
    </div>
  );
}

function SpreadStat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  const unavailable = value === "N/A";
  return (
    <div className="min-w-0 text-center">
      <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div
        className={`mt-0.5 rounded px-1 py-0.5 text-[11px] font-bold tabular-nums ${
          unavailable
            ? "bg-slate-100 text-slate-500"
            : emphasis
              ? "bg-emerald-50 text-emerald-800"
              : "bg-slate-900 text-white"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * JKB / Market / Diff, side by side, so the model and the market are easy to
 * compare at a glance without opening the matchup breakdown.
 *
 * Formatting comes from the same shared helpers the matchup detail page
 * uses (formatProjectedSpread, formatMarketFavoriteSpread,
 * formatModelVsMarketDifference), so a card and its detail page never state
 * the same game two different ways. Diff is always team-oriented (e.g.
 * "BUF +2.5"), never a bare signed number — it describes the gap between the
 * model and the market, not a pick, edge or betting recommendation.
 */
function ModelVsMarketStrip({
  projection,
  market,
}: {
  projection: GameProjection | null;
  market: MarketCurrentGame | null;
}) {
  const comparison = compareToMarket(projection, market);
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <SpreadStat label="JKB" value={formatProjectedSpread(projection)} emphasis />
      <SpreadStat label="Market" value={formatMarketFavoriteSpread(market)} />
      <SpreadStat label="Diff" value={formatModelVsMarketDifference(comparison)} />
    </div>
  );
}

/**
 * Landing-page game card. The whole card is a single keyboard-accessible link to
 * the matchup breakdown; ratings, kickoff, location and the spread area are shown
 * inline. No hover-only content.
 *
 * The spread comes from the published Phase 5 market artifact. It previously
 * read `matchup.spread`, which the schedule builder never populates, so every
 * card reported N/A even for games the market artifact had priced — the same
 * stale-source defect the hero carried until Phase 10.
 */
export default function MatchupCard({
  matchup,
  market = null,
  projection = null,
  awayOvr = null,
  homeOvr = null,
}: {
  matchup: NflMatchup;
  /** Current published line for this game; null renders N/A, never a derived value. */
  market?: MarketCurrentGame | null;
  /** JKB projected spread for this game; null renders N/A, never a derived value. */
  projection?: GameProjection | null;
  /** Universal current OVR/rank for the away/home team; null renders "NR", never a legacy fallback. */
  awayOvr?: MatchupCardOvr | null;
  homeOvr?: MatchupCardOvr | null;
}) {
  const { away, home } = matchup;
  return (
    <Link
      to={`/nfl/matchups/${matchup.slug}`}
      aria-label={`${away.teamName} at ${home.teamName} — view matchup breakdown`}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">Week {matchup.week}</span>
        <span className="text-[11px] font-semibold text-slate-500">{kickoffLabel(matchup.kickoffUtc)}</span>
      </div>

      <div className="mt-3 space-y-2.5">
        <TeamLine team={away} prefix="Away" ovr={awayOvr} />
        <div className="flex items-center gap-2 pl-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">
          <span className="h-px flex-1 bg-slate-100" />
          at
          <span className="h-px flex-1 bg-slate-100" />
        </div>
        <TeamLine team={home} prefix="Home" ovr={homeOvr} />
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <span className="mb-1.5 block min-w-0 truncate text-[11px] text-slate-500">
          {matchup.stadium ?? "Venue TBD"}
        </span>
        <ModelVsMarketStrip projection={projection} market={market} />
      </div>

      <div className="mt-2 text-[11px] font-bold text-emerald-700 group-hover:underline">
        View matchup breakdown →
      </div>
    </Link>
  );
}
