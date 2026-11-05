import { cn } from "@/lib/utils";
import type { PlayerBoxRow, PlayerBoxTable } from "@/lib/nba/props/boxScoreTables";
import { MIN_GAMES_FOR_STRENGTH, shortDate, type DefenseStrength } from "@/lib/nba/props/recentForm";
import type { BoardMarket, BoardRow } from "@/lib/nba/props/propsBoard";
import { LowSample } from "@/components/nba/boardCells";
import { BODY_CELL, BoxCard, BoxNote, HEAD_CELL, HomeAwayBadge, IDENTITY, NUMERIC, ResultBadge, SELECTED_COLUMN, STAT_LABEL, SelectedResult, TeamTag, fmtAverage, fmtStat } from "@/components/nba/BoxScoreParts";

const games = (n: number): string => `${n} ${n === 1 ? "game" : "games"}`;

const STRENGTH: Record<DefenseStrength, { label: string; word: string; tone: string }> = {
  strong: { label: "STR", word: "Strong", tone: "bg-slate-800 text-white ring-slate-800" },
  average: { label: "AVG", word: "Average", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  weak: { label: "WK", word: "Weak", tone: "bg-sky-50 text-sky-800 ring-sky-300" },
};

const UNAVAILABLE_WHY: Record<Exclude<PlayerBoxTable["defenseStatus"], "ok">, string> = {
  stale: "This board was built before DEF RTG existed. Rebuild the private preview board to add it.",
  "no-inputs": "The source data behind this board has no possession inputs (shot attempts, free throws, offensive rebounds, turnovers), so DEF RTG cannot be computed.",
};

/**
 * The opponent's pregame defensive rating for one game: points allowed per 100 estimated possessions in its games BEFORE that
 * date (lower is stronger), its league rank, and a strong / average / weak chip once the sample reaches MIN_GAMES_FOR_STRENGTH.
 */
function DefenseCell({ game, status }: { game: PlayerBoxRow; status: PlayerBoxTable["defenseStatus"] }) {
  const entry = game.defense;
  if (status !== "ok") return <span className="text-slate-400" title={UNAVAILABLE_WHY[status]} data-testid="player-box-defense" data-state={status}>–</span>;
  if (entry === null) return <span className="text-slate-400" title={`${game.opponent} had no earlier usable game this season before this one, so there is no pregame rating`} data-testid="player-box-defense" data-state="none">–</span>;
  const chip = game.strength ? STRENGTH[game.strength] : null;
  const small = entry.games < MIN_GAMES_FOR_STRENGTH;
  return (
    <span
      className="inline-flex flex-wrap items-center justify-center gap-x-1"
      data-testid="player-box-defense"
      data-state="rated"
      data-strength={game.strength ?? "none"}
      title={`${game.opponent} allowed ${entry.rating.toFixed(1)} points per 100 estimated possessions in its ${games(entry.games)} before this game (league ${entry.leagueRating.toFixed(1)}); rank ${entry.rank} of ${entry.rankedOf}, 1 = stingiest.${small ? ` Under ${MIN_GAMES_FOR_STRENGTH} games: noisy, so no strong / average / weak label.` : ""}`}
    >
      <span className="font-semibold text-slate-900">{entry.rating.toFixed(1)}</span>
      <span className="text-[9px] text-slate-500">#{entry.rank}</span>
      {chip ? <span className={cn("rounded px-1 text-[8px] font-black leading-snug ring-1 ring-inset", chip.tone)}><span aria-hidden>{chip.label}</span><span className="sr-only">{`${chip.word} defense`}</span></span> : null}
      {small ? <LowSample why={`Only ${games(entry.games)} before this one: the rating is noisy, so it has no strong / average / weak label`} games={entry.games} className="ml-0" /> : null}
    </span>
  );
}

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
              <th scope="col" className={cn(HEAD_CELL, NUMERIC)} title="The opponent's defensive rating before this game: points allowed per 100 estimated possessions in its earlier games this season. Lower is a stronger defense. Rank 1 is the stingiest.">DEF RTG</th>
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
                <td className={cn(BODY_CELL, NUMERIC)}><DefenseCell game={game} status={box.defenseStatus} /></td>
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
                <td className={cn(BODY_CELL, NUMERIC, "border-t border-slate-200 text-[10px]")} data-testid="player-box-defense-average" title={box.defenseAverage === null ? "No opponent had a pregame rating" : `Average pregame DEF RTG of the opponents faced, over the ${box.defenseKnown} of ${games(box.rows.length)} with a rating`}>
                  {box.defenseAverage === null ? "–" : fmtAverage(box.defenseAverage)}
                </td>
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
      <p className="border-t border-slate-100 px-2.5 py-1.5 text-[10px] text-slate-600" data-testid="player-box-defense-note">
        {box.defenseStatus === "ok"
          ? `DEF RTG is the opponent's points allowed per 100 estimated possessions in its regular-season games before that date, so it never includes the game itself or any later one. Lower is a stronger defense; # is its league rank (1 = stingiest). STR / AVG / WK are the best, middle and worst third of ranked teams, given only from ${MIN_GAMES_FOR_STRENGTH} prior games; fewer shows the sample size (4g is four games). Possessions are estimated from box-score totals. Context, not a projection input.`
          : UNAVAILABLE_WHY[box.defenseStatus]}
      </p>
    </BoxCard>
  );
}
