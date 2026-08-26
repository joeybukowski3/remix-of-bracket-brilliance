import type { NflYardageReviewRow } from "@/lib/nfl/props/review/yardageMarketJoin";
import type { NflYardageOpponentContext } from "@/lib/nfl/props/review/opponentContext";
import NflYardageReviewTeamCell from "./NflYardageReviewTeamCell";
import { NflMatchupScoreBadge } from "./NflYardageReviewBadges";
import { marketRoleStat } from "./marketRoleStat";
import { OppEdgeCell, OppEpaAllowedCell, OppSuccessAllowedCell, OppYardsAllowedCell } from "./opponentContextCells";

/** Highly compact mobile stand-in for the desktop table -- one dense card per player, not a horizontally-scrolled table. */
export default function NflYardageReviewCardList({
  entries,
  opponentContextByKey,
}: {
  entries: readonly NflYardageReviewRow[];
  opponentContextByKey: ReadonlyMap<string, NflYardageOpponentContext>;
}) {
  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {entries.map(({ row, marketInfo, band }) => {
        const context = opponentContextByKey.get(`${row.market}-${row.playerId}`);
        return (
          <li key={`${row.market}-${row.playerId}`} className="rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-slate-900">{row.playerName}</p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <NflYardageReviewTeamCell abbr={row.team} />
                  <span aria-hidden>vs</span>
                  <NflYardageReviewTeamCell abbr={row.opponent} />
                  <span className="rounded bg-slate-100 px-1 py-0.5 font-semibold text-slate-600">{row.position}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold leading-tight tabular-nums text-slate-900">
                  {row.projectedYards != null ? row.projectedYards.toFixed(1) : "—"}
                </p>
                <p className="text-[9px] uppercase tracking-wide text-slate-400">proj yds</p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
              <NflMatchupScoreBadge score={row.matchupScore?.matchupScore ?? null} band={band} />
              {marketRoleStat(row) && <span className="text-slate-500">{marketRoleStat(row)}</span>}
            </div>

            <div className="mt-2 flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px]">
              {marketInfo.available ? (
                <>
                  <span className="font-semibold text-slate-800">
                    Line {marketInfo.line.toFixed(1)}{" "}
                    <span className="font-normal text-slate-500">({marketInfo.overPrice} / {marketInfo.underPrice})</span>
                  </span>
                  {/* Research context only -- neutral color on purpose, never green/red "bet this side" styling. */}
                  <span className="font-semibold text-slate-600" title="Projection minus sportsbook line -- research context only, not a recommendation">
                    {marketInfo.rawDifference >= 0 ? "+" : ""}
                    {marketInfo.rawDifference.toFixed(1)} diff
                  </span>
                </>
              ) : (
                <span className="text-slate-400">Sportsbook line unavailable</span>
              )}
            </div>

            <div className="mt-1.5 grid grid-cols-4 gap-1 rounded border border-slate-100 px-2 py-1.5 text-center text-[10px]">
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">Yds Allowed</p>
                <OppYardsAllowedCell context={context} />
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">EPA Allowed</p>
                <OppEpaAllowedCell context={context} />
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">Success Allowed</p>
                <OppSuccessAllowedCell context={context} />
              </div>
              <div>
                <p className="text-[8px] uppercase tracking-wide text-slate-400">Edge</p>
                <OppEdgeCell context={context} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
