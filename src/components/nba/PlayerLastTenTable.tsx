import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/nba/props/recentForm";
import type { BoardMarket, BoardRow } from "@/lib/nba/props/propsBoard";
import { BODY_CELL, BoxCard, BoxNote, HEAD_CELL, HomeAwayBadge, IDENTITY, NUMERIC, ResultBadge, SELECTED_COLUMN, STAT_LABEL, SelectedResult, TeamTag, fmtAverage, fmtStat } from "@/components/nba/BoxScoreParts";

const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

/**
 * The player's last ten completed games as a box score, newest first. The rows are the same records as the chart above it
 * (recentForm.ts), so did-not-play and zero-minute games are already left out and no game on or after this one can appear.
 */
export default function PlayerLastTenTable({ row, market }: { row: BoardRow; market: BoardMarket }) {
  const { playerBox: box, entry } = row;
  const stat = STAT_LABEL[market];
  const line = entry.line?.line ?? null;
  const title = `${entry.playerName} · last 10 games · box score`;
  if (box.status === "stale") return <BoxCard title={title} testId="player-box-card"><BoxNote testId="player-box-note">This board was built before game-by-game results existed. Rebuild the private preview board to add them.</BoxNote></BoxCard>;
  if (box.status === "none") return <BoxCard title={title} testId="player-box-card"><BoxNote testId="player-box-note">No completed games this season yet, so there is no box score to show. Last season is never used to fill it.</BoxNote></BoxCard>;
  const { average, record } = box;
  const selected = (key: BoardMarket) => (key === market ? SELECTED_COLUMN : "");
  return (
    <BoxCard
      title={title}
      testId="player-box-card"
      subtitle={`Newest first. Completed games this season before this game; did-not-play and zero-minute games are left out.${line === null ? "" : ` ${stat} results are read against the ${line.toFixed(1)} line.`}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" data-testid="player-box-table">
          <caption className="sr-only">{`${entry.playerName}: ${games(box.rows.length)}, newest to oldest, with minutes, points, rebounds, assists and the ${stat} result`}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)}>Date</th>
              <th scope="col" className={cn(HEAD_CELL, IDENTITY)}>Opp</th>
              <th scope="col" className={cn(HEAD_CELL, NUMERIC)} title="Final score, from the player's team's side; blank when it is not reliably known">Result</th>
              <th scope="col" className={cn(HEAD_CELL, NUMERIC)}>MIN</th>
              {(["pts", "reb", "ast"] as const).map((key) => (
                <th key={key} scope="col" className={cn(HEAD_CELL, NUMERIC, selected(key))}>{STAT_LABEL[key]}</th>
              ))}
              <th scope="col" className={cn(HEAD_CELL, NUMERIC, "max-sm:hidden")} title={line === null ? `The ${stat} result for the game. No eligible Vegas line, so it is not compared to one.` : `The ${stat} result against the ${line.toFixed(1)} line`}>
                {line === null ? `${stat} result` : `${stat} vs line`}
              </th>
            </tr>
          </thead>
          <tbody>
            {box.rows.map((game, index) => (
              <tr key={game.key} data-testid="player-box-row" className={index % 2 === 0 ? "bg-white" : "bg-slate-50/70"}>
                <td className={cn(BODY_CELL, IDENTITY, "whitespace-nowrap font-semibold text-slate-600")}>{shortDate(game.date)}</td>
                <td className={cn(BODY_CELL, IDENTITY)}>
                  <span className="inline-flex items-center gap-1">
                    <HomeAwayBadge isHome={game.isHome} />
                    <TeamTag team={game.opponent} />
                  </span>
                </td>
                <td className={cn(BODY_CELL, NUMERIC)}><ResultBadge result={game.result} /></td>
                <td className={cn(BODY_CELL, NUMERIC)}>{fmtStat(game.minutes)}</td>
                <td className={cn(BODY_CELL, NUMERIC, selected("pts"))}>{fmtStat(game.pts)}</td>
                <td className={cn(BODY_CELL, NUMERIC, selected("reb"))}>{fmtStat(game.reb)}</td>
                <td className={cn(BODY_CELL, NUMERIC, selected("ast"))}>{fmtStat(game.ast)}</td>
                <td className={cn(BODY_CELL, NUMERIC, "max-sm:hidden")}><SelectedResult value={game.selected} line={line} stat={stat} /></td>
              </tr>
            ))}
          </tbody>
          {average ? (
            <tfoot>
              <tr className="bg-slate-100 font-black text-slate-800" data-testid="player-box-average">
                <th scope="row" colSpan={2} className={cn(BODY_CELL, IDENTITY, "border-t border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-600")}>
                  L10 avg
                  <span className="ml-1 font-semibold normal-case text-slate-500">{box.isSmallSample ? `${games(box.rows.length)}, small sample` : games(box.rows.length)}</span>
                </th>
                <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200 text-[10px]")} title={record ? `Won ${record.wins}, lost ${record.losses} in the ${games(record.known)} with a known score (of ${games(box.rows.length)})` : "No final scores known"} data-testid="player-box-record">
                  {record ? `${record.wins}–${record.losses}` : "–"}
                </td>
                <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200")}>{fmtAverage(average.minutes)}</td>
                <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("pts"))}>{fmtAverage(average.pts)}</td>
                <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("reb"))}>{fmtAverage(average.reb)}</td>
                <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200", selected("ast"))}>{fmtAverage(average.ast)}</td>
                <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200 max-sm:hidden")}><SelectedResult value={average.selected} line={line} stat={stat} average /></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </BoxCard>
  );
}
