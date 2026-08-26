import { useMemo } from "react";
import { NFL_TABLE_HEAD_ROW, NFL_TABLE_ROW, NflTableScroller } from "@/components/nfl/ui/NflTable";
import type { NflYardageReviewRow } from "@/lib/nfl/props/review/yardageMarketJoin";
import type { NflYardageOpponentContext } from "@/lib/nfl/props/review/opponentContext";
import type { NflYardageReviewSortKey, NflYardageReviewSortState } from "@/lib/nfl/props/review/reviewFilters";
import NflYardageReviewTeamCell from "./NflYardageReviewTeamCell";
import { NflMatchupScoreBadge } from "./NflYardageReviewBadges";
import { marketRoleStat } from "./marketRoleStat";
import { OppEdgeCell, OppEpaAllowedCell, OppSuccessAllowedCell, OppYardsAllowedCell } from "./opponentContextCells";

function SortArrow({ direction }: { direction: "asc" | "desc" | null }) {
  if (!direction) {
    return (
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 opacity-40" fill="none" aria-hidden="true">
        <path d="M5 6.5 8 3.5 11 6.5M5 9.5 8 12.5 11 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const d = direction === "desc" ? "M8 3v9M4.5 9 8 12.5 11.5 9" : "M8 13V4M4.5 7 8 3.5 11.5 7";
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-sky-700" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "center",
}: {
  label: string;
  sortKey: NflYardageReviewSortKey;
  sort: NflYardageReviewSortState;
  onSort: (key: NflYardageReviewSortKey) => void;
  align?: "left" | "center";
}) {
  const active = sort?.key === sortKey;
  return (
    <th scope="col" aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"} className={`px-2 py-2 ${align === "left" ? "text-left" : "text-center"} align-bottom`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={`flex items-center gap-1 rounded px-1 -mx-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${align === "center" ? "mx-auto" : ""} ${active ? "text-sky-800" : "text-slate-600 hover:text-slate-900"}`}
      >
        {label}
        <SortArrow direction={active ? sort!.direction : null} />
      </button>
    </th>
  );
}

/** Desktop-density table for one yardage market. Mobile gets a separate card list (NflYardageReviewCardList). */
export default function NflYardageReviewTable({
  entries,
  sort,
  onSort,
  opponentContextByKey,
}: {
  entries: readonly NflYardageReviewRow[];
  sort: NflYardageReviewSortState;
  onSort: (key: NflYardageReviewSortKey) => void;
  opponentContextByKey: ReadonlyMap<string, NflYardageOpponentContext>;
}) {
  // Passing has no opportunity x efficiency breakdown (no carries/targets leg) --
  // the Role column is always empty for that market, so it is dropped rather
  // than shown as a column of dashes.
  const showRoleStat = useMemo(() => entries.some((e) => marketRoleStat(e.row) != null), [entries]);

  return (
    <div className="hidden md:block">
      <p className="mb-1 text-[10px] text-slate-400 xl:hidden">Scroll horizontally for opponent context columns →</p>
      <NflTableScroller label="Yardage projections table">
        <table className="w-full min-w-[1040px] text-xs">
          <thead>
            <tr className={NFL_TABLE_HEAD_ROW}>
              <SortHeader label="Player" sortKey="player" sort={sort} onSort={onSort} align="left" />
              <SortHeader label="Team" sortKey="team" sort={sort} onSort={onSort} />
              <th scope="col" className="px-2 py-2 text-center align-bottom">Opp</th>
              <th scope="col" className="px-2 py-2 text-center align-bottom">Pos</th>
              {showRoleStat && <th scope="col" className="px-2 py-2 text-center align-bottom">Role</th>}
              <SortHeader label="Proj Yds" sortKey="projectedYards" sort={sort} onSort={onSort} />
              <SortHeader label="Matchup" sortKey="matchupScore" sort={sort} onSort={onSort} />
              <th scope="col" className="px-2 py-2 text-center align-bottom">Sportsbook</th>
              <SortHeader label="Diff" sortKey="difference" sort={sort} onSort={onSort} />
              <th scope="col" className="px-2 py-2 text-center align-bottom" title="Opponent yards allowed -- 2025 Season, L5 = final 5 2025 games">Opp Yds Allowed</th>
              <th scope="col" className="px-2 py-2 text-center align-bottom">Opp EPA Allowed</th>
              <th scope="col" className="px-2 py-2 text-center align-bottom">Opp Success Allowed</th>
              <th scope="col" className="px-2 py-2 text-center align-bottom" title="Opponent EPA-defense rank minus offense rank; positive favors the offense">Edge</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ row, marketInfo, band }) => {
              const context = opponentContextByKey.get(`${row.market}-${row.playerId}`);
              return (
                <tr key={`${row.market}-${row.playerId}`} className={NFL_TABLE_ROW}>
                  <td className="px-2 py-1.5 text-left font-medium text-slate-800">{row.playerName}</td>
                  <td className="px-2 py-1.5 text-center"><NflYardageReviewTeamCell abbr={row.team} /></td>
                  <td className="px-2 py-1.5 text-center"><NflYardageReviewTeamCell abbr={row.opponent} /></td>
                  <td className="px-2 py-1.5 text-center text-slate-600">{row.position}</td>
                  {showRoleStat && <td className="px-2 py-1.5 text-center text-[10px] text-slate-500">{marketRoleStat(row) ?? "—"}</td>}
                  {/* Projection is the primary numeric value on this page -- deliberately the largest, boldest figure in the row. */}
                  <td className="px-2 py-1.5 text-center tabular-nums text-sm font-bold text-slate-900">
                    {row.projectedYards != null ? row.projectedYards.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <NflMatchupScoreBadge score={row.matchupScore?.matchupScore ?? null} band={band} />
                  </td>
                  {/* Sportsbook line is deliberately smaller/lighter than the projection above -- distinct, but secondary. */}
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {marketInfo.available ? (
                      <span className="inline-flex flex-col leading-tight">
                        <span className="font-semibold text-slate-700">{marketInfo.line.toFixed(1)}</span>
                        <span className="text-[9px] font-normal text-slate-400">{marketInfo.overPrice} / {marketInfo.underPrice}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400" title="No matching sportsbook line for this player">Unavailable</span>
                    )}
                  </td>
                  {/* Research context only -- neutral color on purpose, never green/red "bet this side" styling. */}
                  <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">
                    {marketInfo.available ? (
                      <span title="Projection minus sportsbook line -- research context only, not a recommendation">
                        {marketInfo.rawDifference >= 0 ? "+" : ""}
                        {marketInfo.rawDifference.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums"><OppYardsAllowedCell context={context} /></td>
                  <td className="px-2 py-1.5 text-center tabular-nums"><OppEpaAllowedCell context={context} /></td>
                  <td className="px-2 py-1.5 text-center tabular-nums"><OppSuccessAllowedCell context={context} /></td>
                  <td className="px-2 py-1.5 text-center tabular-nums"><OppEdgeCell context={context} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </NflTableScroller>
    </div>
  );
}
