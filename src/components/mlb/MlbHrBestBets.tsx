import { useMemo } from "react";
import MlbTeamLogo from "@/components/mlb/MlbTeamLogo";
import { useMlbPropsData } from "@/hooks/useMlbPropsData";
import { buildHrPropBestBets, type HrBestBet } from "@/lib/mlb/hrPropBestBets";
import { cn } from "@/lib/utils";

function BetCard({ bet, compact = false }: { bet: HrBestBet; compact?: boolean }) {
  const longshot = bet.category === "longshot";
  // bet.team is the hitter's own team (HrBestBet maps it straight off the
  // batter row), never the opponent. MlbTeamLogo already degrades to a
  // colored-initials badge for teams missing from the canonical map, so the
  // only case left to guard is an absent/blank abbreviation -- there we drop
  // the container entirely rather than render an empty box.
  const teamAbbr = bet.team?.trim() ?? "";
  const logoSize = compact ? 54 : 64;

  return (
    <article className={cn(
      "rounded-2xl border bg-white text-slate-900 shadow-sm",
      longshot ? "border-amber-200" : "border-rose-200",
      compact ? "p-3" : "p-4",
    )}>
      <div className="flex items-start gap-3">
        {teamAbbr && (
          <div className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl border bg-slate-50 shadow-inner",
            longshot ? "border-amber-100" : "border-rose-100",
            compact ? "h-16 w-16" : "h-[72px] w-[72px]",
          )}>
            <MlbTeamLogo team={teamAbbr} size={logoSize} className="drop-shadow-sm" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider", longshot ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800")}>
                {longshot ? "Longshot" : "Top Model Play"}
              </span>
              <span className="text-[10px] font-bold text-slate-400">{bet.team} vs {bet.opponent}</span>
            </div>
            <div className="mt-1 truncate text-sm font-black text-slate-950">{bet.player}</div>
            <div className="mt-1 text-xs text-slate-600">
              Anytime HR <span className="font-black text-slate-950">{bet.odds}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">HR Score</div>
            <div className="text-lg font-black tabular-nums text-slate-950">{bet.hrScore.toFixed(1)}</div>
          </div>
        </div>
      </div>
      {!compact && (
        <>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">{bet.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Rank #{bet.rank}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">vs {bet.opposingPitcher}</span>
            {bet.barrelRate != null && <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-800">Barrel {bet.barrelRate.toFixed(1)}%</span>}
            {bet.book && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">{bet.book}</span>}
          </div>
        </>
      )}
    </article>
  );
}

export default function MlbHrBestBets() {
  const { batters, loading } = useMlbPropsData();
  const { modelPlays, longshots } = useMemo(() => buildHrPropBestBets(batters, 3), [batters]);
  const topModel = modelPlays[0] ?? null;
  const topLongshot = longshots[0] ?? null;

  if (loading || (!topModel && !topLongshot)) return null;

  return (
    <details className="group mt-3 overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br from-slate-950 via-rose-950 to-slate-900 text-white shadow-lg">
      <summary className="cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-300">Model-selected HR preview</div>
            <h2 className="mt-1 text-xl font-black">Best Home Run Bets</h2>
            <p className="mt-1 text-xs text-slate-300">Top model play and top qualifying longshot using HR Quality Score, matchup strength, confidence, and available price.</p>
          </div>
          <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-black transition group-open:rotate-180">⌄</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {topModel ? <BetCard bet={topModel} compact /> : <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">No model play currently clears the threshold.</div>}
          {topLongshot ? <BetCard bet={topLongshot} compact /> : <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">No longshot currently clears the threshold.</div>}
        </div>
        <div className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 group-open:hidden">Click to view up to three plays in each group</div>
      </summary>
      <div className="border-t border-white/10 bg-slate-100 p-4 text-slate-900 sm:p-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-black text-rose-800">Top Model Plays</h3>
              <span className="text-xs font-bold text-slate-400">{modelPlays.length} qualified</span>
            </div>
            <div className="space-y-3">
              {modelPlays.length ? modelPlays.map((bet) => <BetCard key={`model-${bet.gameKey}-${bet.player}`} bet={bet} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No model play has enough support right now.</div>}
            </div>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-black text-amber-800">Top Longshot Plays</h3>
              <span className="text-xs font-bold text-slate-400">{longshots.length} qualified</span>
            </div>
            <div className="space-y-3">
              {longshots.length ? longshots.map((bet) => <BetCard key={`longshot-${bet.gameKey}-${bet.player}`} bet={bet} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No longshot has enough model support right now.</div>}
            </div>
          </section>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">These are quality-and-price rankings, not calibrated probability edges. A play requires available HR odds, an HR Quality Score of at least 55, and complete-enough model data. Longshots also require odds of +350 or longer.</p>
      </div>
    </details>
  );
}
