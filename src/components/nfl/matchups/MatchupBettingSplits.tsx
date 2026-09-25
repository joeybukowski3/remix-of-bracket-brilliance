import TeamLogo from "@/components/TeamLogo";
import { nflLogoUrl } from "@/data/nflPreseason2026";
import { useNflBettingSplits } from "@/hooks/useNflBettingSplits";
import { bettingSplitsForGame, moneyGap, type NflDkBettingSplitsGame, type NflDkBettingSplitsSide } from "@/lib/nfl/bettingSplitsData";
import { formatSplitsGap, formatSplitsLine, formatSplitsOdds, splitsSignal, SPLITS_SIGNAL_CLASS, SPLITS_SIGNAL_LABEL, SPLITS_THRESHOLDS, type SplitsMarket } from "@/lib/nfl/bettingSplitsView";
import type { NflMatchup } from "@/lib/nfl/matchups";
import { nflTeamColor } from "@/lib/nfl/nflTeamColor";
import { formatNflMetadataTimestamp } from "@/lib/nfl/provenance";
import { cn } from "@/lib/utils";

const MARKETS: { id: SplitsMarket; label: string }[] = [
  { id: "spread", label: "Spread" },
  { id: "moneyline", label: "Moneyline" },
  { id: "total", label: "Total" },
];

function Outcome({ game, market, side }: { game: NflDkBettingSplitsGame; market: SplitsMarket; side: NflDkBettingSplitsSide }) {
  const gap = moneyGap(side);
  const signal = splitsSignal(gap);
  const abbr = side.side === "away" ? game.away : side.side === "home" ? game.home : null;
  const label = side.side === "over" ? "Over" : side.side === "under" ? "Under" : abbr?.toUpperCase();

  return <div className="min-w-0 py-2 first:pt-0 last:pb-0">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <span className="inline-flex min-w-0 items-center gap-1.5 font-bold text-slate-900">
        {abbr && <><span className="h-4 w-0.5 shrink-0 rounded" style={{ backgroundColor: nflTeamColor(abbr) ?? "#64748b" }} aria-hidden="true" /><TeamLogo name="" logo={nflLogoUrl(abbr)} fallbackLabel="" className="h-4 w-4 shrink-0 bg-transparent" /></>}
        {label}
      </span>
      <span className="whitespace-nowrap font-semibold tabular-nums text-slate-800">
        {market !== "moneyline" && <>{formatSplitsLine(market, side.line)} </>}
        <span className="text-slate-600">({formatSplitsOdds(side.odds)})</span>
      </span>
    </div>
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[11px] tabular-nums text-slate-600">
      <span>Handle <strong className="text-slate-900">{side.handlePct}%</strong></span>
      <span>Bets <strong className="text-slate-900">{side.betsPct}%</strong></span>
      <span>Money Gap <strong className={cn(gap > 0 ? "text-emerald-700" : gap < 0 ? "text-rose-700" : "text-slate-700")}>{formatSplitsGap(gap)}</strong></span>
    </div>
    <div className="mt-1 flex flex-wrap gap-1">
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", SPLITS_SIGNAL_CLASS[signal])}>{SPLITS_SIGNAL_LABEL[signal]}</span>
      {gap >= SPLITS_THRESHOLDS.moneyLean && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">JKB Sharp Side</span>}
    </div>
  </div>;
}

export default function MatchupBettingSplits({ matchup }: { matchup: NflMatchup }) {
  const data = useNflBettingSplits({ season: matchup.season, week: matchup.week });
  const game = bettingSplitsForGame(data.artifact, matchup.gameId);
  const captured = data.sourceCapturedAt ? formatNflMetadataTimestamp(data.sourceCapturedAt) : null;

  return <section aria-label="Betting Splits" className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="text-sm font-bold text-slate-900">Betting Splits</h3>
      <span className="text-[10px] text-slate-600">DraftKings Network{captured && <> · Captured <time dateTime={data.sourceCapturedAt!}>{captured}</time></>}</span>
    </div>
    {data.loading ? <p role="status" className="mt-2 text-xs text-slate-600">Loading betting splits…</p>
      : data.freshness === "unavailable" || !data.artifact ? <p role="status" className="mt-2 text-xs text-slate-600">Betting splits are currently unavailable.</p>
      : <>
        {data.freshness === "stale" && <p role="status" className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-900">Stale snapshot · captured {captured}{data.reason === "week_mismatch" ? ` · source Week ${data.week}` : ""}</p>}
        {game ? <>
          <div className="mt-2 grid min-w-0 gap-2 lg:grid-cols-3">
            {MARKETS.map(({ id, label }) => <section key={id} aria-label={`${label} betting splits`} className="min-w-0 rounded-md border border-slate-200 bg-slate-50/50 px-2.5 py-2">
              <h4 className="mb-2 border-b border-slate-200 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">{label}</h4>
              <div className="divide-y divide-slate-200">{game.markets[id].map((side) => <Outcome key={side.side} game={game} market={id} side={side} />)}</div>
            </section>)}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-600">Money Gap = Handle % − Bets %. “Sharp Side” is a JKB heuristic based on handle-vs-ticket imbalance. DraftKings does not identify professional bettors.</p>
        </> : <p role="status" className="mt-2 text-xs text-slate-600">Betting splits are not available for this matchup in the current pregame snapshot.</p>}
      </>}
  </section>;
}
