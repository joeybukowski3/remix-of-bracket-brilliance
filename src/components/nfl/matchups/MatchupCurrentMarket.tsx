import {
  formatMoneyline,
  formatSpread,
  formatTotal,
  hasAnyMarket,
  type MarketCurrentGame,
} from "@/lib/nfl/marketData";
import type { NflMatchup } from "@/lib/nfl/matchups";

/**
 * One side's spread and moneyline.
 *
 * The two are shown side by side but are read independently: a missing
 * moneyline renders N/A and is never derived from the spread, and vice versa.
 */
function TeamLine({
  abbr,
  spread,
  moneyline,
}: {
  abbr: string;
  spread: number | null;
  moneyline: number | null;
}) {
  const spreadText = formatSpread(spread);
  const mlText = formatMoneyline(moneyline);
  const favored = spread != null && spread < 0;

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-8 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {abbr}
      </span>
      <span
        className={`rounded px-1.5 py-0.5 text-sm font-bold tabular-nums ${
          spreadText === "N/A"
            ? "bg-slate-100 text-slate-400"
            : favored
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700"
        }`}
      >
        {spreadText}
      </span>
      <span
        className={`text-[11px] font-bold tabular-nums ${
          mlText === "N/A" ? "text-slate-400" : "text-slate-600"
        }`}
      >
        {mlText}
      </span>
    </div>
  );
}

/**
 * The exact matchup's market line.
 *
 * Deliberately separate from the historical team profile below it: this is
 * today's market, not something derived from either team's ATS history, and the
 * two must never look like one produced the other.
 *
 * The source publishes a single line per game without disclosing which
 * sportsbooks compose it, so no book is named. Every field is independent and
 * renders N/A when the source has not priced it — a scheduled game with no line
 * yet is normal, not an error.
 */
export default function MatchupCurrentMarket({
  matchup,
  market,
}: {
  matchup: NflMatchup;
  market: MarketCurrentGame | null;
}) {
  const priced = hasAnyMarket(market);

  return (
    <section
      aria-label="Current market"
      className="border-b border-slate-200 pb-2.5"
    >
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
          Current Market
        </h3>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Market Line · Source: nflverse
        </span>
      </div>

      {priced ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
          <div className="space-y-1">
            <TeamLine
              abbr={matchup.away.abbr.toUpperCase()}
              spread={market?.spread.away ?? null}
              moneyline={market?.moneyline.away ?? null}
            />
            <TeamLine
              abbr={matchup.home.abbr.toUpperCase()}
              spread={market?.spread.home ?? null}
              moneyline={market?.moneyline.home ?? null}
            />
          </div>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-sm font-bold tabular-nums ${
                market?.total == null ? "bg-slate-100 text-slate-400" : "bg-slate-100 text-slate-700"
              }`}
            >
              {formatTotal(market?.total)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] font-semibold text-slate-400">
          No market line published for this game yet.
        </p>
      )}
    </section>
  );
}
