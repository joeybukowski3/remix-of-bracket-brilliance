import { useEffect, useState } from "react";
import { DENSE_TABLE_HEAD_ROW, DENSE_TABLE_ROW, DenseTableScroller } from "@/components/ui/dense-table";
import type { DfsEnrichedAnalyzerRow } from "@/lib/nfl/dfs/slateAnalyzer";
import { NflYardageHomeAwayPill, NflYardageVsAverageCell } from "@/components/nfl/yardage-review/NflYardageHistoryCells";
import { weeklyHeatStyle, weeklyRankHeatTone } from "@/lib/shared/jkbHeat";
import { DfsHeatValue } from "./DfsTableCells";
import { adaptDfsFantasyPointsAllowed } from "@/lib/nfl/dfs/history";
import { defenseSummary, dfsHistoryLoader, historyKeys, historyNumber, historySigned, summarizeHistoryRows,
  type DfsHistoryDetail, type DfsHistoryIndex, type HistoryTarget } from "@/lib/nfl/dfs/historyDelivery";

export const HISTORY_NOTE = "Historical averages are reconstructed using only games before each matchup; underlying stat corrections may reflect later official revisions.";
export const DEF_AVG_HELP = "Average yardage allowed by this defense versus each opposing player's own entering-game trailing-10 average. QB: passing; RB: rushing; WR/TE: receiving. Above/below counts use valid comparisons only.";
export const FPA_HELP = "Canonical weekly research fantasy points allowed to this position: Season and Last 5 (L5), with source season, games and rank. Prior-season samples are labeled explicitly.";

export function FpaSignal({ row, period }: { row: DfsEnrichedAnalyzerRow; period: "season" | "last5" }) {
  const fpa = adaptDfsFantasyPointsAllowed(row.research ?? null);
  const metric = period === "season" ? fpa.opponentFpaSeason : fpa.opponentFpaLast5;
  return <DfsHeatValue style={weeklyHeatStyle(weeklyRankHeatTone(metric?.rank, metric?.poolSize))}
    title={`${period === "season" ? "Season" : "Last 5"}: ${metric?.sampleSeason ?? "mixed seasons"}; ${metric?.sampleSize ?? 0} games; rank ${metric?.rank ?? "unavailable"} of ${metric?.poolSize ?? 0}`}>
    {metric?.value == null ? "—" : <>{historyNumber(metric.value)}{metric.rank != null && <span className="ml-1 text-[10px] opacity-80">#{metric.rank}</span>}</>}
  </DfsHeatValue>;
}

export function DefenseSignal({ row, index, loading }: { row: DfsEnrichedAnalyzerRow; index: DfsHistoryIndex | null; loading: boolean }) {
  if (row.kind === "dst") return <>N/A</>;
  const summary = defenseSummary(index, row);
  return <div className="whitespace-nowrap text-[11px] leading-tight" title={`${DEF_AVG_HELP} ${HISTORY_NOTE}`}>
    {loading ? "Loading…" : !index ? "—" : !summary.comparisonCount ? "—" : <>
      <NflYardageVsAverageCell diff={summary.mean} />
    </>}
  </div>;
}

export default function NflDfsHistory({ row, target, index }: { row: DfsEnrichedAnalyzerRow; target?: HistoryTarget; index: DfsHistoryIndex | null }) {
  const [view, setView] = useState<"player" | "opponent">("player");
  const [loaded, setLoaded] = useState<{ key: string; data: DfsHistoryDetail | null } | null>(null);
  const keys = historyKeys(row);
  const position = keys?.position;
  const loadKey = `${target?.season}/${target?.week}/${target?.firstKickoff}/${index?.asOf}/${position}`;
  useEffect(() => {
    let active = true;
    if (target && index && position) {
      void dfsHistoryLoader.detail(target, index, position).then(
        (data) => { if (active) setLoaded({ key: loadKey, data }); },
        () => { if (active) setLoaded({ key: loadKey, data: null }); },
      );
    }
    return () => { active = false; };
  }, [target, index, position, loadKey]);
  if (!keys) return null;
  const detail = loaded?.key === loadKey ? loaded : null;
  const rows = view === "player" ? (keys.player ? detail?.data?.players[keys.player] ?? [] : []) : (keys.defense ? detail?.data?.defenseMatchups[keys.defense] ?? [] : []);
  const summary = summarizeHistoryRows(rows);
  const delta = summary.delta;
  return <section aria-label="Historical yardage context" className="mt-3 min-w-0 space-y-2 border-t border-slate-200 pt-3 text-[11px]">
    <div role="tablist" aria-label="Historical view" className="flex gap-1">
      {([['player', 'Player Last 10'], ['opponent', 'Opponent Last 10']] as const).map(([value, label]) =>
        <button type="button" role="tab" aria-selected={view === value} key={value} onClick={() => setView(value)} className={`min-h-9 rounded px-3 font-bold ${view === value ? "bg-slate-950 text-white" : "bg-white text-slate-600"}`}>{label}</button>)}
    </div>
    <p className="text-slate-600">{keys.market} yards · {view === "player" ? "Opponent allowance covers the entire position group per defense game, entering that matchup." : "Individual recorded offensive appearances at this position; multiple players from one game can appear. Each baseline is that player's entering-game trailing-10 average."}</p>
    {!target || !index ? <p role="status">History unavailable for this week.</p> : !detail ? <p role="status">Loading history…</p> : !detail.data ? <p role="status">History unavailable for this week.</p> : !rows.length ? <p role="status">No historical sample</p> : <>
      <div className="flex flex-wrap gap-x-3 gap-y-1 rounded bg-white p-2 font-semibold">
        <span>Mean {historySigned(delta.mean)} · Median {historySigned(delta.median)}</span>
        <span>{delta.aboveCount}/{delta.comparisonCount} above {view === "player" ? "opponent positional allowance" : "own player average"}</span>
        <span>{delta.belowCount} below · {delta.equalCount} equal · {delta.missingCount} missing comparison</span>
        <span>Archived lines: {summary.over} over / {summary.under} under / {summary.push} push ({summary.lines}/{rows.length} available)</span>
      </div>
      <DenseTableScroller label={`${view === "player" ? "Player" : "Opponent"} Last 10 yardage`} className="max-w-full overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full min-w-[600px] border-collapse whitespace-nowrap text-left text-[11px] tabular-nums">
          <thead><tr className={DENSE_TABLE_HEAD_ROW}>{["Date", ...(view === "player" ? ["Opp", "H/A"] : ["Opposing player", "Team"]), "Yards", view === "player" ? "Pos. allowance" : "Player avg", "Δ Yds", "Archived line", "O/U"].map((label) => <th scope="col" key={label} className="whitespace-nowrap px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{label}</th>)}</tr></thead>
          <tbody>{rows.map((game) => {
            const player = "actualMinusOpponentAllowance" in game;
            const line = game.historicalSportsbookLine;
            return <tr key={game.rowId} className={DENSE_TABLE_ROW}>
              <td className="whitespace-nowrap px-2 py-1.5">{game.dateUtc.slice(0, 10)}</td>
              <td className="px-2 py-1.5">{player ? game.opponent.toUpperCase() : game.playerName}</td>
              <td className="px-2 py-1.5">{player ? <NflYardageHomeAwayPill homeAway={game.homeAway === "home" || game.homeAway === "away" ? game.homeAway : null} /> : game.team.toUpperCase()}</td>
              <td className="px-2 py-1.5 font-bold">{historyNumber(game.actualYards)}</td>
              <td className="px-2 py-1.5" title={`${player ? game.opponentPregamePositionalAllowanceSampleSize : game.playerReferenceSampleSize} prior games`}>{historyNumber(player ? game.opponentPregamePositionalAllowance : game.playerPregameTrailing10Average)}</td>
              <td className="px-2 py-1.5 font-semibold">{<NflYardageVsAverageCell diff={player ? game.actualMinusOpponentAllowance : game.actualMinusPlayerAverage} />}</td>
              <td className="px-2 py-1.5" title={line ? `${line.bookmaker}; observed ${line.observedAt}; selected pre-kickoff observation` : "No archived line"}>{line ? <>{historyNumber(line.point)} <span className="text-slate-500">{line.bookmaker}</span></> : "—"}</td>
              <td className="px-2 py-1.5">{game.lineResult === "unavailable" ? "—" : game.lineResult}</td>
            </tr>;
          })}</tbody>
        </table>
      </DenseTableScroller>
    </>}
    <p className="text-[10px] text-slate-500">{HISTORY_NOTE} {index && `As of ${index.asOf}.`} No archived line means no historical O/U comparison.</p>
  </section>;
}
