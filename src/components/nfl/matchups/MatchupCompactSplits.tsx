import { formatSplitsGap, SPLITS_SIGNAL_CLASS, type CompactSplitsSide, type CompactSplitsSummary } from "@/lib/nfl/bettingSplitsView";
import { cn } from "@/lib/utils";

const markets = [
  { key: "spread", short: "SPR", label: "Spread" },
  { key: "moneyline", short: "ML", label: "Moneyline" },
  { key: "total", short: "TOT", label: "Total" },
] as const;

function MarketSignal({ label, short, side, state }: { label: string; short: string; side: CompactSplitsSide | null; state: CompactSplitsSummary["state"] }) {
  const visible = side && side.signal !== "balanced";
  const emptyLabel = state === "missing" ? "not in the current pregame snapshot" : state === "unavailable" ? "unavailable" : "Balanced";
  return <span className="inline-flex min-w-0 items-baseline gap-1 whitespace-nowrap" aria-label={`${label}: ${visible ? `${side.side} ${formatSplitsGap(side.moneyGap)}, ${side.signal === "strong" ? "Strong Money Gap" : "Money Lean"}` : emptyLabel}`}>
    <span className="text-[9px] font-bold text-slate-500">{short}</span>
    {visible ? <span className={cn("rounded px-1 py-0.5 text-[10px] font-bold tabular-nums", SPLITS_SIGNAL_CLASS[side.signal])}>{side.side} {side.moneyGap > 0 ? "+" : ""}{side.moneyGap}</span>
      : <span className="text-[10px] text-slate-400">—</span>}
  </span>;
}

/** Read-only market distribution; the matchup's existing links remain the navigation targets. */
export default function MatchupCompactSplits({ summary }: { summary: CompactSplitsSummary }) {
  return <div data-matchup-compact-splits data-splits-state={summary.state} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 bg-white px-2.5 py-1.5 leading-none">
    <span className="text-[9px] font-extrabold uppercase tracking-[0.06em] text-slate-700">Betting Splits</span>
    {markets.map((market) => <MarketSignal key={market.key} label={market.label} short={market.short} side={summary[market.key]} state={summary.state} />)}
  </div>;
}
